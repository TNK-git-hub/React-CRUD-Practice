#!/usr/bin/env python3
"""RED before GREEN, checked on the git history of a branch (local and CI).

    python3 .specify/scripts/red_check.py --base <ref> [--head HEAD] [--root R]

Areas and stack: .claude/harness.json AT THE BASE COMMIT (`git show <base>:.claude/harness.json`, read by
harness_config.py), so a branch can neither widen its own areas nor change how its tests are run: src = areas.src;
test = pod.testWritable (the tests that run here); interactive.testWritable (test + e2e) = what the RED commit may hold;
test file = stack.testFile; install / run / report = stack.commands.install, stack.commands.runFiles, stack.runner.

Commits: `git rev-list --reverse <base>..<head>`. A merge commit in that range is reported, and then only the
first-parent line is checked, without the merge commits themselves (what came in through a merge is not this branch's
work). Per commit, the files it adds / modifies / deletes (no rename detection: a rename is a delete + an add).

  1. No commit touches src                              -> PASS "no source change: RED not required"
  2. src changes but no commit adds / modifies a test file (test area + testFile)
                                                        -> PASS, with the note "code-only: no new tests"
  3. Otherwise the RED commit is the first commit that touches the test area. FAIL when:
     a. the RED commit changes a file outside interactive.testWritable (a bug record bugs/<id>/ included: it goes in
        its own commit BEFORE the RED commit, as the pod's bug mode does; any commit before RED may change non-src
        files). Its e2e files are listed as "not executed";
     b. a commit before the RED commit touches src;
     c. the test files of the test area that the RED commit adds / modifies, run at the RED commit per package:
        `cd <pkg> && <stack.commands.runFiles>` with {files} = the files relative to pkg and {report} = a temporary
        report (ts-pnpm-vitest: `pnpm exec vitest run <files> --reporter=default --reporter=json
        --outputFile.json=<tmp>`, the files of run_new_tests in k8s/agents/run.sh). Read from the report only
        (stack_adapter.parse_report): a package without a report (or whose report lists no test file) -> FAIL
        "could not run"; no failed file in any package (stack_adapter.is_red) -> FAIL "new tests already pass before
        the code change", or, when some tests could not run at all, FAIL "new tests do not run". What counts as a
        failed file is the runner's: vitest, a file in status "failed" (a file that fails to load counts: importing a
        module that does not exist yet is a valid RED); pytest, a failing assertion or a collection error of
        ModuleNotFoundError / ImportError, never another load error (SyntaxError, NameError, a setup error).
     Commits after the RED commit (code, review rounds that add tests, ...) do not change the result.
  a and b are checked first: when one fails the tests are not run.

Tests run in a temporary git worktree at the RED commit (removed afterwards), after stack.commands.install in it
(ts-pnpm-vitest: `pnpm install --frozen-lockfile --prefer-offline`; null: no install step), without the Claude token
in their environment. Unittests replace the install + run step through the `runner` parameter of check() (no CLI
option).

Output: the commits, the RED commit (short sha + subject), its test files, per package pass / fail (counts only),
then PASS or FAIL and the reason. Exit codes: 0 PASS; 1 FAIL; 2 usage error (unknown ref, harness.json missing or
invalid at the base, not a git repository).
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config as hc  # noqa: E402
import stack_adapter as sa  # noqa: E402

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
BUG_RECORD_RE = re.compile(r"^bugs/[^/]+/")


class UsageError(Exception):
    """Exit code 2: the check cannot start (bad ref, bad config, not a repository)."""


@dataclass
class Commit:
    sha: str
    subject: str
    changes: list = field(default_factory=list)  # (status A|M|D|T, path)

    @property
    def short(self) -> str:
        return self.sha[:8]

    def paths(self) -> list:
        return [p for _, p in self.changes]


@dataclass
class Areas:
    src: list
    test: list  # pod.testWritable: the tests that are run
    red: list  # interactive.testWritable: what the RED commit may hold
    test_file: re.Pattern
    packages: list
    stack: dict  # the stack profile at the base commit

    @staticmethod
    def _in(path: str, areas: list) -> bool:
        return any(path.startswith(a + "/") for a in areas)

    def is_src(self, path: str) -> bool:
        return self._in(path, self.src)

    def is_test_area(self, path: str) -> bool:
        return self._in(path, self.test)

    def is_red_area(self, path: str) -> bool:
        return self._in(path, self.red)

    def is_test_file(self, path: str) -> bool:
        return self.is_test_area(path) and bool(self.test_file.search(path))


def git(root: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise UsageError(f"git {' '.join(args)}: {r.stderr.strip() or 'exit ' + str(r.returncode)}")
    return r.stdout


def resolve(root: Path, ref: str, what: str) -> str:
    r = subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise UsageError(f"{what} '{ref}' is not a commit in {root} (fetch it first, e.g. git fetch origin <branch>)")
    return r.stdout.strip()


def load_areas(root: Path, base_sha: str) -> Areas:
    r = subprocess.run(["git", "-C", str(root), "show", f"{base_sha}:{hc.CONFIG}"], capture_output=True, text=True)
    if r.returncode != 0:
        raise UsageError(f"{hc.CONFIG} not found at the base commit {base_sha[:8]}")
    try:
        cfg = hc.loads(r.stdout)
    except hc.ConfigError as e:
        raise UsageError(f"at the base commit {base_sha[:8]}: {e}") from e
    return Areas(src=hc.get(cfg, "areas.src"), test=hc.get(cfg, "pod.testWritable"),
                 red=hc.get(cfg, "interactive.testWritable"), test_file=re.compile(hc.get(cfg, "testFile")),
                 packages=hc.get(cfg, "packages"), stack=cfg["stack"])


def list_commits(root: Path, base_sha: str, head_sha: str) -> tuple:
    """(commits oldest first, merge commits found in the range)."""
    rng = f"{base_sha}..{head_sha}"
    merges = git(root, "rev-list", "--merges", rng).split()
    args = ["rev-list", "--reverse"] + (["--first-parent", "--no-merges"] if merges else []) + [rng]
    commits = []
    for sha in git(root, *args).split():
        subject = git(root, "log", "-1", "--format=%s", sha).rstrip("\n")
        raw = git(root, "diff-tree", "--no-commit-id", "-r", "--root", "--no-renames", "--name-status", "-z", sha)
        parts = [p for p in raw.split("\0") if p != ""]
        changes = [(parts[i][0], parts[i + 1]) for i in range(0, len(parts) - 1, 2)]
        commits.append(Commit(sha, subject, changes))
    return commits, merges


def kinds(c: Commit, areas: Areas) -> str:
    k = []
    if any(areas.is_src(p) for p in c.paths()):
        k.append("src")
    if any(areas.is_test_area(p) for p in c.paths()):
        k.append("test")
    if any(areas.is_red_area(p) and not areas.is_test_area(p) for p in c.paths()):
        k.append("e2e")
    if any(not areas.is_src(p) and not areas.is_red_area(p) for p in c.paths()):
        k.append("other")
    return ",".join(k) or "empty"


def read_report(runner: str, path: Path) -> tuple:
    """(state, counts) from a report of `runner` (stack_adapter.parse_report): state fail (stack_adapter.is_red: a
    failed file), load-error (not RED, but some tests could not run at all: pytest only, a vitest load error is a
    failed file), pass, or not-run (no report, unreadable, or no test file in it)."""
    report = sa.parse_report(runner, path)
    if report is None:
        return "not-run", f"no {sa.REPORT_SHORT[runner]}"
    if not report["files"]:
        return "not-run", f"the {sa.REPORT_SHORT[runner]} lists no test file"
    failed = report["failed"]
    passed = report["passed"]
    counts = (f"files {report['failedFiles']} failed / {report['files']}; tests {'?' if failed is None else failed} "
              f"failed, {'?' if passed is None else passed} passed")
    if runner != "vitest":
        counts += f"; load errors {report['loadErrors']}"
    if sa.is_red(report):
        return "fail", counts
    return ("load-error" if report["loadErrors"] else "pass"), counts


def tail(text: str, n: int) -> str:
    return "\n".join("    " + line for line in ANSI_RE.sub("", text).splitlines()[-n:])


def profile_runner(stack: dict):
    """The default runner: stack.commands.runFiles in the package folder (stack_adapter.run_files)."""
    def run(wt: Path, pkg: str, files: list, report: Path, env: dict) -> str:
        return sa.run_files(stack, wt / pkg, files, report, env)
    return run


def run_tests(root: Path, red: Commit, by_pkg: dict, stack: dict, runner, out) -> tuple:
    """Run the RED commit's test files in a temporary worktree.
    Returns ({pkg: pass|fail|load-error|not-run}, error or "")."""
    env = {k: v for k, v in os.environ.items() if k != "CLAUDE_CODE_OAUTH_TOKEN"}
    tmp = Path(tempfile.mkdtemp(prefix="red-check-"))
    wt = tmp / "wt"
    results = {}
    kind = stack["runner"]
    try:
        git(root, "worktree", "add", "--detach", "--quiet", str(wt), red.sha)
        if runner is None:
            runner = profile_runner(stack)
            install = hc.command_argv(stack, "install")
            if install:
                print(f"installing dependencies in the worktree: {' '.join(install)}", file=out)
                try:
                    r = subprocess.run(install, cwd=wt, env=env, capture_output=True, text=True)
                except OSError as e:
                    return results, f"cannot start {install[0]} ({e}): install it"
                if r.returncode != 0:
                    return results, f"{' '.join(install[:2])} failed at the RED commit:\n{tail(r.stdout + r.stderr, 20)}"
        for pkg, files in by_pkg.items():
            report = tmp / f"report-{pkg}{sa.REPORT_SUFFIX[kind]}"
            output = runner(wt, pkg, files, report, env)
            state, counts = read_report(kind, report)
            results[pkg] = state
            if state == "not-run":
                print(f"{pkg}: {len(files)} file(s): COULD NOT RUN ({counts})\n{tail(output, 15)}", file=out)
            else:
                verdict = {"pass": "all pass", "fail": "some fail", "load-error": "load errors only (not RED)"}[state]
                print(f"{pkg}: {len(files)} file(s): {verdict} - {counts}", file=out)
                if state == "load-error":
                    print(tail(output, 15), file=out)
        return results, ""
    finally:
        subprocess.run(["git", "-C", str(root), "worktree", "remove", "--force", str(wt)], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)
        subprocess.run(["git", "-C", str(root), "worktree", "prune"], capture_output=True)


def check(root: Path, base: str, head: str, runner=None, out=None) -> int:
    """runner(worktree, package, files relative to the package, report path, env) -> console output: replaces
    stack.commands.install + runFiles (unittests only); it must write the report in the format of the base commit's
    stack.runner (vitest JSON / pytest JUnit XML), or no report."""
    out = out or sys.stdout
    base_sha = resolve(root, base, "base")
    head_sha = resolve(root, head, "head")
    areas = load_areas(root, base_sha)
    commits, merges = list_commits(root, base_sha, head_sha)

    def verdict(ok: bool, reason: str) -> int:
        print(f"{'PASS' if ok else 'FAIL'}: {reason}", file=out)
        return 0 if ok else 1

    print(f"red_check: base {base} ({base_sha[:8]}), head {head} ({head_sha[:8]}), {len(commits)} commit(s)", file=out)
    print(f"areas ({hc.CONFIG} at the base): src {hc.as_regex(areas.src)}  test {hc.as_regex(areas.test)}  "
          f"RED commit may hold {hc.as_regex(areas.red)}  test file {areas.test_file.pattern}", file=out)
    if merges:
        print(f"note: {len(merges)} merge commit(s) in the range ({', '.join(m[:8] for m in merges)}): checking the "
              "first-parent line only, merge commits left out", file=out)
    for c in commits:
        print(f"  {c.short} [{kinds(c, areas)}] {c.subject}", file=out)

    if not any(areas.is_src(p) for c in commits for p in c.paths()):
        return verdict(True, "no source change: RED not required")
    if not any(s in "AM" and areas.is_test_file(p) for c in commits for s, p in c.changes):
        return verdict(True, "code-only: no new tests (src changed, no commit adds or modifies a test file)")

    i = next(n for n, c in enumerate(commits) if any(areas.is_test_area(p) for p in c.paths()))
    red = commits[i]
    print(f"RED commit: {red.short} {red.subject}", file=out)
    tests = sorted(p for s, p in red.changes if s in "AM" and areas.is_test_file(p))
    not_executed = sorted(p for s, p in red.changes if s in "AM" and areas.is_red_area(p) and not areas.is_test_area(p))
    print("new test files:" + ("" if tests or not_executed else " (none)"), file=out)
    for p in tests:
        print(f"  {p}", file=out)
    for p in not_executed:
        print(f"  {p} (not executed)", file=out)

    reasons = []
    outside = sorted(p for p in red.paths() if not areas.is_red_area(p))
    if outside:
        bugs = [p for p in outside if BUG_RECORD_RE.match(p)]
        src = [p for p in outside if areas.is_src(p)]
        what = ("tests and code in the same commit" if src else
                "the bug record must be its own commit before the RED commit" if bugs else "files outside the test area")
        reasons.append(f"RED commit {red.short} changes files outside the test area ({what}): {', '.join(outside)}")
    early = [c for c in commits[:i] if any(areas.is_src(p) for p in c.paths())]
    if early:
        reasons.append("src changed before the RED commit (code before tests): "
                       + ", ".join(f"{c.short} {c.subject}" for c in early))
    if reasons:
        print("tests not run (the order is already wrong)", file=out)
        return verdict(False, "; ".join(reasons))
    if not tests:
        return verdict(False, f"RED commit {red.short} (the first commit that touches the test area) adds or modifies "
                              "no test file: nothing to run")

    by_pkg = {}
    for p in tests:
        pkg = p.split("/", 1)[0]
        by_pkg.setdefault(pkg, []).append(p[len(pkg) + 1:])
    results, err = run_tests(root, red, by_pkg, areas.stack, runner, out)
    if err:
        return verdict(False, f"could not run the new tests: {err}")
    not_run = [p for p, r in results.items() if r == "not-run"]
    if not_run:
        return verdict(False, f"could not run the new tests of {', '.join(not_run)} at the RED commit {red.short} "
                              f"(no {sa.REPORT_LABEL[areas.stack['runner']]})")
    if not any(r == "fail" for r in results.values()):
        load = [p for p, r in results.items() if r == "load-error"]
        if load:
            return verdict(False, f"new tests do not run in {', '.join(load)} (RED commit {red.short}): a load error "
                                  "that is not a missing module / name (e.g. SyntaxError, NameError, a setup error) is "
                                  "not RED; RED is a failing assertion or an import of what does not exist yet")
        return verdict(False, f"new tests already pass before the code change (RED commit {red.short})")
    return verdict(True, f"RED commit {red.short} has failing tests before the code change; "
                         "no src change before it")


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(description="check RED before GREEN on the git history of a branch")
    parser.add_argument("--base", required=True, help="base branch or commit (e.g. origin/<base branch>)")
    parser.add_argument("--head", default="HEAD", help="head of the branch (default HEAD)")
    parser.add_argument("--root", type=Path, default=None, help="repository root (default: the repo of this script)")
    args = parser.parse_args(argv)
    root = (args.root or hc.default_root()).resolve()
    try:
        if subprocess.run(["git", "-C", str(root), "rev-parse", "--git-dir"], capture_output=True).returncode != 0:
            raise UsageError(f"{root} is not a git repository")
        return check(root, args.base, args.head)
    except UsageError as e:
        print(f"red_check.py: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
