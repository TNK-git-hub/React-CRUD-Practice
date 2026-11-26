#!/usr/bin/env python3
"""RED before GREEN, checked on the git history of a branch (local and CI).

    python3 .specify/scripts/red_check.py --base <ref> [--head HEAD] [--root R]

Areas: .claude/harness.json AT THE BASE COMMIT (`git show <base>:.claude/harness.json`, read by harness_config.py), so
a branch cannot widen its own areas: src = areas.src; test = pod.testWritable (the tests that run here);
interactive.testWritable (test + e2e) = what the RED commit may hold; test file = testFile.

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
        `cd <pkg> && pnpm exec vitest run <files relative to pkg> --reporter=default --reporter=json
        --outputFile.json=<tmp>` (the files of run_new_tests in k8s/agents/run.sh). Read from the JSON report only:
        a package without a report (or whose report lists no test file) -> FAIL "could not run"; no test file in
        status "failed" in any package -> FAIL "new tests already pass before the code change". A file that fails to
        load counts as failed (importing a module that does not exist yet is a valid RED).
     Commits after the RED commit (code, review rounds that add tests, ...) do not change the result.
  a and b are checked first: when one fails the tests are not run.

Tests run in a temporary git worktree at the RED commit (removed afterwards), after
`pnpm install --frozen-lockfile --prefer-offline` in it, without the Claude token in their environment. Unittests
replace the install + vitest step through the `runner` parameter of check() (no CLI option).

Output: the commits, the RED commit (short sha + subject), its test files, per package pass / fail (counts only),
then PASS or FAIL and the reason. Exit codes: 0 PASS; 1 FAIL; 2 usage error (unknown ref, harness.json missing or
invalid at the base, not a git repository).
"""

from __future__ import annotations

import argparse
import json
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
                 packages=hc.get(cfg, "packages"))


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


def read_report(path: Path) -> tuple:
    """(state, counts) from a vitest JSON report: state fail (a test file in status "failed", load errors included),
    pass, or not-run (no report, unreadable, or no test file in it)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "not-run", "no JSON report"
    results = data.get("testResults") if isinstance(data, dict) else None
    if not isinstance(results, list) or not results:
        return "not-run", "the JSON report lists no test file"
    failed = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "failed")
    counts = (f"files {failed} failed / {len(results)}; tests {data.get('numFailedTests', '?')} failed, "
              f"{data.get('numPassedTests', '?')} passed")
    return ("fail" if failed else "pass"), counts


def vitest(wt: Path, pkg: str, files: list, report: Path, env: dict) -> str:
    """The default runner: vitest of the package, console + JSON report. Returns the console output."""
    cmd = ["pnpm", "exec", "vitest", "run", *files, "--reporter=default", "--reporter=json",
           f"--outputFile.json={report}"]
    try:
        r = subprocess.run(cmd, cwd=wt / pkg, env=env, capture_output=True, text=True)
    except OSError as e:
        return f"cannot start pnpm: {e}"
    return r.stdout + r.stderr


def tail(text: str, n: int) -> str:
    return "\n".join("    " + line for line in ANSI_RE.sub("", text).splitlines()[-n:])


def run_tests(root: Path, red: Commit, by_pkg: dict, runner, out) -> tuple:
    """Run the RED commit's test files in a temporary worktree. Returns ({pkg: pass|fail|not-run}, error or "")."""
    env = {k: v for k, v in os.environ.items() if k != "CLAUDE_CODE_OAUTH_TOKEN"}
    tmp = Path(tempfile.mkdtemp(prefix="red-check-"))
    wt = tmp / "wt"
    results = {}
    try:
        git(root, "worktree", "add", "--detach", "--quiet", str(wt), red.sha)
        if runner is None:
            runner = vitest
            print("installing dependencies in the worktree: pnpm install --frozen-lockfile --prefer-offline", file=out)
            try:
                r = subprocess.run(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], cwd=wt, env=env,
                                   capture_output=True, text=True)
            except OSError as e:
                return results, f"cannot start pnpm ({e}): install Node and pnpm"
            if r.returncode != 0:
                return results, f"pnpm install failed at the RED commit:\n{tail(r.stdout + r.stderr, 20)}"
        for pkg, files in by_pkg.items():
            report = tmp / f"report-{pkg}.json"
            output = runner(wt, pkg, files, report, env)
            state, counts = read_report(report)
            results[pkg] = state
            if state == "not-run":
                print(f"{pkg}: {len(files)} file(s): COULD NOT RUN ({counts})\n{tail(output, 15)}", file=out)
            else:
                verdict = "all pass" if state == "pass" else "some fail"
                print(f"{pkg}: {len(files)} file(s): {verdict} - {counts}", file=out)
        return results, ""
    finally:
        subprocess.run(["git", "-C", str(root), "worktree", "remove", "--force", str(wt)], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)
        subprocess.run(["git", "-C", str(root), "worktree", "prune"], capture_output=True)


def check(root: Path, base: str, head: str, runner=None, out=None) -> int:
    """runner(worktree, package, files relative to the package, JSON report path, env) -> console output: replaces
    pnpm install + vitest (unittests only); it must write the report like vitest's JSON reporter, or no report."""
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
    results, err = run_tests(root, red, by_pkg, runner, out)
    if err:
        return verdict(False, f"could not run the new tests: {err}")
    not_run = [p for p, r in results.items() if r == "not-run"]
    if not_run:
        return verdict(False, f"could not run the new tests of {', '.join(not_run)} at the RED commit {red.short} "
                              "(no vitest JSON report)")
    if all(r == "pass" for r in results.values()):
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
