"""Tests of red_check.py on throw-away git repositories (no real pnpm, no real vitest).

Run: python3 -m unittest discover -s .specify/scripts
Most tests pass a fake runner to red_check.check() (a function parameter; the CLI has no such option): it writes a
vitest-like JSON report from a marker line in each file (`RED_CHECK: fail|pass|load-error|no-report`) and logs its
calls. DefaultPathTest puts a fake `pnpm` on PATH instead, to check the real path: the install command, the vitest
command line, its cwd, and a run with and without a JSON report.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import red_check  # noqa: E402

CONFIG = {
    "version": 1,
    "packages": ["api", "web"],
    "areas": {"src": ["api/src", "web/src", "web/public"], "testPublic": ["api/test/public", "web/test/public"],
              "testE2e": ["web/test/e2e"], "testPrivate": ["api/test/private"]},
    "testFile": "\\.test\\.tsx?$",
}
FAIL = "// RED_CHECK: fail\n"
PASS = "// RED_CHECK: pass\n"
LOAD_ERROR = "// RED_CHECK: load-error\n"
NO_REPORT = "// RED_CHECK: no-report\n"


def fake_report(files: list, cwd: Path) -> dict | None:
    """A vitest JSON report (the fields red_check reads) for files relative to cwd; None = no report."""
    results = []
    for f in files:
        text = (cwd / f).read_text() if (cwd / f).is_file() else ""
        if "RED_CHECK: no-report" in text:
            return None
        if "RED_CHECK: load-error" in text:
            results.append({"name": str(cwd / f), "status": "failed", "message": "Failed to load url ../../src/x",
                            "assertionResults": []})
        else:
            st = "failed" if "RED_CHECK: fail" in text else "passed"
            results.append({"name": str(cwd / f), "status": st, "assertionResults": [{"status": st}]})
    fails = sum(r["status"] == "failed" for r in results)
    return {"numFailedTests": fails, "numPassedTests": len(results) - fails, "success": fails == 0,
            "testResults": results}


FAKE_PNPM = """#!{python}
# Fake pnpm for red_check's default path: logs every call, writes a vitest JSON report from marker lines.
import json, os, sys
sys.path.insert(0, {scripts!r})
from test_red_check import fake_report
args = sys.argv[1:]
with open(os.environ["FAKE_PNPM_LOG"], "a") as log:
    log.write(json.dumps({{"args": args, "cwd": os.getcwd()}}) + "\\n")
if args[:1] == ["install"]:
    sys.exit(int(os.environ.get("FAKE_PNPM_INSTALL_RC", "0")))
if args[:3] == ["exec", "vitest", "run"]:
    files = [a for a in args[3:] if not a.startswith("--")]
    out = [a.split("=", 1)[1] for a in args if a.startswith("--outputFile.json=")]
    report = fake_report(files, __import__("pathlib").Path.cwd())
    if report is None or not out:
        print("Error: Command failed: no report written")
        sys.exit(1)
    open(out[0], "w").write(json.dumps(report))
    sys.exit(1 if not report["success"] else 0)
print("fake pnpm: unexpected command", args)
sys.exit(3)
"""


class Repo:
    def __init__(self, tmp: Path, config: dict = CONFIG) -> None:
        self.tmp = tmp
        self.root = tmp / "repo"
        self.root.mkdir()
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "t@example.invalid")
        self.git("config", "user.name", "t")
        self.git("config", "commit.gpgsign", "false")
        self.commit("base", {".claude/harness.json": json.dumps(config), "api/src/app.ts": "export const a = 1;\n",
                             "README.md": "x\n"})
        self.git("branch", "base")
        self.git("checkout", "-q", "-b", "feature")
        self.calls: list = []
        self.runner = self.fake_runner

    def fake_runner(self, wt: Path, pkg: str, files: list, report: Path, env: dict) -> str:
        self.calls.append({"pkg": pkg, "files": list(files), "wt": wt, "report": report,
                           "token": "CLAUDE_CODE_OAUTH_TOKEN" in env})
        data = fake_report(files, wt / pkg)
        if data is not None:
            report.write_text(json.dumps(data))
        return "fake output\n"

    def git(self, *args: str) -> str:
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True, text=True).stdout

    def commit(self, msg: str, files: dict) -> None:
        for path, text in files.items():
            p = self.root / path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", msg)

    def check(self, base: str = "base") -> tuple:
        out = io.StringIO()
        try:
            code = red_check.check(self.root, base, "HEAD", runner=self.runner, out=out)
        except red_check.UsageError as e:
            return 2, out.getvalue() + str(e)
        return code, out.getvalue()


class RedCheckTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Repo(Path(self._tmp.name).resolve())

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def assertResult(self, expected_code: int, needle: str) -> str:
        code, out = self.repo.check()
        self.assertEqual(code, expected_code, out)
        self.assertIn(needle, out)
        return out

    def test_no_source_change_passes(self) -> None:
        self.repo.commit("docs: readme", {"README.md": "y\n"})
        self.repo.commit("test: only tests", {"api/test/public/a.test.ts": PASS})
        self.assertResult(0, "PASS: no source change: RED not required")
        self.assertEqual(self.repo.calls, [])

    def test_code_only_passes_with_a_note(self) -> None:
        self.repo.commit("feat: code", {"api/src/app.ts": "export const a = 2;\n"})
        self.assertResult(0, "PASS: code-only: no new tests")
        self.assertEqual(self.repo.calls, [])

    def test_tests_first_and_failing_passes(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL, "api/test/public/helper.ts": "x\n"})
        self.repo.commit("feat: code", {"api/src/app.ts": "export const a = 2;\n"})
        out = self.assertResult(0, "PASS: RED commit")
        self.assertIn("test: add", out.split("RED commit:")[1].splitlines()[0])
        self.assertIn("api: 1 file(s): some fail - files 1 failed / 1; tests 1 failed, 0 passed", out)
        self.assertEqual([(c["pkg"], c["files"]) for c in self.repo.calls], [("api", ["test/public/a.test.ts"])])

    def test_runner_gets_a_worktree_at_the_red_commit_without_the_claude_token(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "export const a = 2;\n"})
        seen = {}

        def runner(wt, pkg, files, report, env):
            seen["src"] = (wt / "api/src/app.ts").read_text()
            seen["token"] = "CLAUDE_CODE_OAUTH_TOKEN" in env
            return self.repo.fake_runner(wt, pkg, files, report, env)

        self.repo.runner = runner
        with mock.patch.dict(os.environ, {"CLAUDE_CODE_OAUTH_TOKEN": "secret"}):
            self.assertResult(0, "PASS")
        self.assertEqual(seen, {"src": "export const a = 1;\n", "token": False})

    def test_tests_that_already_pass_fail(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": PASS})
        self.repo.commit("feat: code", {"api/src/app.ts": "export const a = 2;\n"})
        self.assertResult(1, "FAIL: new tests already pass before the code change")

    def test_a_load_error_is_a_valid_red(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": LOAD_ERROR})
        self.repo.commit("feat: code", {"api/src/x.ts": "export const x = 1;\n"})
        self.assertResult(0, "PASS: RED commit")

    def test_no_json_report_fails(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": NO_REPORT})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        out = self.assertResult(1, "could not run the new tests of api")
        self.assertIn("COULD NOT RUN (no JSON report)", out)

    def test_a_report_without_test_files_fails(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})

        def runner(wt, pkg, files, report, env):
            report.write_text(json.dumps({"numFailedTests": 0, "numPassedTests": 0, "testResults": []}))
            return "No test files found, exiting with code 1\n"

        self.repo.runner = runner
        self.assertResult(1, "COULD NOT RUN (the JSON report lists no test file)")

    def test_one_failing_file_is_enough(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": PASS, "web/test/public/b.test.tsx": FAIL})
        self.repo.commit("feat: code", {"web/src/b.ts": "x\n"})
        out = self.assertResult(0, "PASS: RED commit")
        self.assertIn("api: 1 file(s): all pass", out)
        self.assertIn("web: 1 file(s): some fail", out)
        self.assertEqual(sorted((c["pkg"], tuple(c["files"])) for c in self.repo.calls),
                         [("api", ("test/public/a.test.ts",)), ("web", ("test/public/b.test.tsx",))])

    def test_one_package_without_report_fails_even_if_another_fails(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL, "web/test/public/b.test.tsx": NO_REPORT})
        self.repo.commit("feat: code", {"web/src/b.ts": "x\n"})
        self.assertResult(1, "could not run the new tests of web")

    def test_tests_and_code_in_one_commit_fail(self) -> None:
        self.repo.commit("feat: all at once", {"api/test/public/a.test.ts": FAIL, "api/src/app.ts": "x\n"})
        self.assertResult(1, "tests and code in the same commit")
        self.assertEqual(self.repo.calls, [])

    def test_code_before_tests_fails(self) -> None:
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        out = self.assertResult(1, "src changed before the RED commit (code before tests)")
        self.assertIn("feat: code", out.split("FAIL:")[1])
        self.assertEqual(self.repo.calls, [])

    def test_bug_mode_record_then_test_then_code_passes(self) -> None:
        self.repo.commit("docs: bug record 20261126-x", {"bugs/20261126-x/report.md": "r\n"})
        self.repo.commit("test: reproduce bug 20261126-x", {"api/test/public/x.test.ts": FAIL})
        self.repo.commit("fix", {"api/src/app.ts": "x\n"})
        self.repo.commit("docs: fix.md", {"bugs/20261126-x/fix.md": "f\n"})
        out = self.assertResult(0, "PASS: RED commit")
        self.assertIn("test: reproduce bug 20261126-x", out.split("RED commit:")[1].splitlines()[0])

    def test_bug_record_inside_the_red_commit_fails(self) -> None:
        self.repo.commit("test: reproduce", {"bugs/20261126-x/report.md": "r\n", "api/test/public/x.test.ts": FAIL})
        self.repo.commit("fix", {"api/src/app.ts": "x\n"})
        self.assertResult(1, "the bug record must be its own commit before the RED commit")

    def test_other_file_inside_the_red_commit_fails(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL, "README.md": "z\n"})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        self.assertResult(1, "files outside the test area): README.md")

    def test_e2e_files_may_be_in_the_red_commit_and_are_not_executed(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL, "web/test/e2e/flow.py": "x\n",
                                       "web/test/e2e/flow.test.ts": PASS})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        out = self.assertResult(0, "PASS: RED commit")
        self.assertIn("web/test/e2e/flow.py (not executed)", out)
        self.assertIn("web/test/e2e/flow.test.ts (not executed)", out)
        self.assertEqual([(c["pkg"], c["files"]) for c in self.repo.calls], [("api", ["test/public/a.test.ts"])])

    def test_e2e_only_is_not_a_red_commit(self) -> None:
        # only pod.testWritable defines the RED commit: an e2e-only commit is a non-src commit before it
        self.repo.commit("test: e2e", {"web/test/e2e/flow.py": "x\n"})
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        out = self.assertResult(0, "PASS: RED commit")
        self.assertIn("test: add", out.split("RED commit:")[1].splitlines()[0])

    def test_review_tests_after_the_code_do_not_matter(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        self.repo.commit("test: address review (round 1)", {"api/test/public/b.test.ts": PASS,
                                                            "api/test/public/a.test.ts": FAIL + "more\n"})
        self.repo.commit("fix: address review (round 1)", {"api/src/app.ts": "y\n"})
        self.assertResult(0, "PASS: RED commit")
        self.assertEqual([c["files"] for c in self.repo.calls], [["test/public/a.test.ts"]])

    def test_red_commit_without_a_test_file_fails(self) -> None:
        self.repo.commit("test: helper", {"api/test/public/helper.ts": "x\n"})
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        self.assertResult(1, "adds or modifies no test file: nothing to run")

    def test_worktree_is_removed(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        self.assertResult(0, "PASS")
        self.assertEqual(len(self.repo.git("worktree", "list").splitlines()), 1)
        self.assertFalse(self.repo.calls[0]["wt"].exists())

    def test_merge_commit_is_reported_and_first_parent_checked(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.git("checkout", "-q", "-b", "side", "base")
        self.repo.commit("side: code first", {"web/src/side.ts": "x\n"})
        self.repo.git("checkout", "-q", "feature")
        self.repo.git("merge", "-q", "--no-ff", "--no-edit", "side")
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        out = self.assertResult(0, "PASS: RED commit")
        self.assertIn("1 merge commit(s)", out)
        self.assertNotIn("side: code first", out)

    def test_areas_come_from_the_base_commit(self) -> None:
        # The branch moves src into the test area in its own harness.json: the base's areas still apply
        widened = json.loads(json.dumps(CONFIG))
        widened["areas"]["src"] = ["web/src"]
        widened["areas"]["testPublic"] = ["api/test/public", "api/src"]
        self.repo.commit("chore: config", {".claude/harness.json": json.dumps(widened)})
        self.repo.commit("feat: all at once", {"api/test/public/a.test.ts": FAIL, "api/src/app.ts": "x\n"})
        self.assertResult(1, "tests and code in the same commit")

    def test_unknown_base_is_a_usage_error(self) -> None:
        code, out = self.repo.check(base="no-such-branch")
        self.assertEqual(code, 2, out)
        self.assertIn("base 'no-such-branch' is not a commit", out)

    def test_missing_config_at_base_is_a_usage_error(self) -> None:
        self.repo.git("checkout", "-q", "--orphan", "bare")
        self.repo.git("rm", "-rq", "--cached", ".")
        self.repo.git("commit", "-q", "--allow-empty", "-m", "empty")
        code, out = self.repo.check(base="bare")
        self.assertEqual(code, 2, out)
        self.assertIn("not found at the base commit", out)


class CliTest(unittest.TestCase):
    def test_not_a_repository_is_a_usage_error(self) -> None:
        with tempfile.TemporaryDirectory() as d, redirect_stderr(io.StringIO()) as err:
            self.assertEqual(red_check.main(["--base", "main", "--root", d]), 2)
        self.assertIn("is not a git repository", err.getvalue())

    def test_the_cli_has_no_test_runner_option(self) -> None:
        with redirect_stderr(io.StringIO()) as err, self.assertRaises(SystemExit) as e:
            red_check.main(["--base", "main", "--test-runner", "true"])
        self.assertEqual(e.exception.code, 2)
        self.assertIn("unrecognized arguments: --test-runner", err.getvalue())


class DefaultPathTest(unittest.TestCase):
    """No runner: pnpm install in the worktree, then pnpm exec vitest with the JSON reporter (fake pnpm on PATH)."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        tmp = Path(self._tmp.name).resolve()
        self.repo = Repo(tmp)
        self.repo.runner = None
        bin_dir = tmp / "bin"
        bin_dir.mkdir()
        pnpm = bin_dir / "pnpm"
        pnpm.write_text(FAKE_PNPM.format(python=sys.executable, scripts=str(Path(__file__).resolve().parent)))
        pnpm.chmod(0o755)
        self.log = tmp / "pnpm.log"
        self.env = {"PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}", "FAKE_PNPM_LOG": str(self.log)}

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_cli(self, extra_env: dict | None = None) -> tuple:
        out = io.StringIO()
        with mock.patch.dict(os.environ, {**self.env, **(extra_env or {})}), redirect_stdout(out), \
                redirect_stderr(out):
            code = red_check.main(["--base", "base", "--root", str(self.repo.root)])
        calls = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        return code, out.getvalue(), calls

    def test_install_then_vitest_with_the_json_reporter_in_the_package(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL, "web/test/public/b.test.tsx": PASS})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        code, out, calls = self.run_cli()
        self.assertEqual(code, 0, out)
        self.assertIn("PASS: RED commit", out)
        self.assertEqual(len(calls), 3, calls)
        install, api, web = calls
        self.assertEqual(install["args"], ["install", "--frozen-lockfile", "--prefer-offline"])
        wt = Path(install["cwd"])
        self.assertEqual(wt.name, "wt")
        self.assertEqual(Path(api["cwd"]), wt / "api")
        self.assertEqual(Path(web["cwd"]), wt / "web")
        self.assertEqual(api["args"][:-1], ["exec", "vitest", "run", "test/public/a.test.ts", "--reporter=default",
                                            "--reporter=json"])
        self.assertTrue(api["args"][-1].startswith("--outputFile.json=/"), api["args"])
        self.assertTrue(api["args"][-1].endswith("/report-api.json"), api["args"])
        self.assertEqual(web["args"][3], "test/public/b.test.tsx")
        self.assertFalse(wt.exists())

    def test_vitest_without_json_report_fails(self) -> None:
        # e.g. vitest is not installed: `pnpm exec vitest` exits non-zero and writes no report
        self.repo.commit("test: add", {"api/test/public/a.test.ts": NO_REPORT})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        code, out, _ = self.run_cli()
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL: could not run the new tests of api", out)

    def test_passing_report_fails(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": PASS})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        code, out, _ = self.run_cli()
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL: new tests already pass before the code change", out)

    def test_install_failure_fails_without_running_vitest(self) -> None:
        self.repo.commit("test: add", {"api/test/public/a.test.ts": FAIL})
        self.repo.commit("feat: code", {"api/src/app.ts": "x\n"})
        code, out, calls = self.run_cli({"FAKE_PNPM_INSTALL_RC": "1"})
        self.assertEqual(code, 1, out)
        self.assertIn("pnpm install failed at the RED commit", out)
        self.assertEqual([c["args"][0] for c in calls], ["install"])


if __name__ == "__main__":
    unittest.main()
