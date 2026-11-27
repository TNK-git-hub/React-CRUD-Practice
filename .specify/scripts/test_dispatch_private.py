"""Tests for the hidden-test run of k8s/agents/dispatch.sh: its self-contained block private_package, sourced in bash.

Run: python3 -m unittest discover -s .specify/scripts
TS profile: a fake `pnpm` on PATH logs every call (arguments and folder) and writes a vitest JSON report, so the tests
check the exact command lines dispatch.sh ran before the stack profile (`pnpm exec vitest run <folder>
--passWithNoTests --reporter=default --reporter=json --outputFile.json=<report>`, then `pnpm typecheck:private`) and
the summary line. python-pytest profile: real pytest in a temporary project (skipped without pytest, FAIL with
HARNESS_REQUIRE_PYTEST=1). The hidden folder of these fake projects is called test/hidden.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_stack_adapter as tsa  # noqa: E402  (pytest helpers)

REPO = Path(__file__).resolve().parents[2]
DISPATCH = REPO / "k8s/agents/dispatch.sh"
BASH = shutil.which("bash") or "/bin/bash"
FAKE_PNPM = """#!{python}
import json, os, sys
args = sys.argv[1:]
with open(os.environ["FAKE_LOG"], "a") as log:
    log.write(json.dumps({{"args": args, "cwd": os.getcwd()}}) + "\\n")
if args[:3] == ["exec", "vitest", "run"]:
    out = [a.split("=", 1)[1] for a in args if a.startswith("--outputFile.json=")]
    report = os.environ.get("FAKE_REPORT")
    if out and report:
        open(out[0], "w").write(report)
    sys.exit(1)
if args == ["typecheck:private"]:
    print(os.environ.get("FAKE_TSC_OUT", ""))
    sys.exit(int(os.environ.get("FAKE_TSC_RC", "0")))
sys.exit(3)
"""
VITEST_REPORT = {"numFailedTests": 1, "numPassedTests": 2, "testResults": [
    {"status": "failed", "assertionResults": [{"status": "failed"}, {"status": "passed"}]},
    {"status": "passed", "assertionResults": [{"status": "passed"}]},
    {"status": "failed", "assertionResults": []},
]}


def block(name: str) -> str:
    text = DISPATCH.read_text(encoding="utf-8")
    m = re.search(rf"^# >>> {name}\b.*?$(.*?)^# <<< {name}$", text, re.S | re.M)
    assert m, f"block {name} not found in dispatch.sh"
    return m.group(1)


class PrivatePackageTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name).resolve()
        self.root = self.tmp / "root"
        for rel in (".claude/harness.json", ".specify/scripts/harness_config.py", ".specify/scripts/stack_adapter.py"):
            (self.root / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(REPO / rel, self.root / rel)
        self.wt = self.tmp / "wt"
        (self.wt / "backend/test/hidden").mkdir(parents=True)
        self.plog = self.tmp / "private.log"
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        (bin_dir / "pnpm").write_text(FAKE_PNPM.format(python=sys.executable))
        (bin_dir / "pnpm").chmod(0o755)
        self.log = self.tmp / "pnpm.log"
        self.env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
                    "FAKE_LOG": str(self.log)}

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def set_stack(self, stack: dict) -> None:
        p = self.root / ".claude/harness.json"
        cfg = json.loads(p.read_text())
        cfg["stack"] = stack
        p.write_text(json.dumps(cfg))

    def run_block(self, pkg: str = "backend", env: dict | None = None) -> tuple[int, str]:
        script = (f"set -euo pipefail\n{block('private_package')}\n"
                  f'sum="$(private_package "$1" "$2" "$3" test/hidden "$4")" && rc=0 || rc=$?\n'
                  'echo "$sum"; echo "rc=$rc"\n')
        r = subprocess.run([BASH, "-c", script, "x", str(self.root), str(self.wt), pkg, str(self.plog)],
                           env={**self.env, **(env or {})}, capture_output=True, text=True)
        lines = r.stdout.strip().splitlines()
        self.assertTrue(lines and lines[-1].startswith("rc="), r.stdout + r.stderr)
        return int(lines[-1][3:]), "\n".join(lines[:-1])

    def calls(self) -> list:
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_ts_command_lines_are_the_same_as_before(self) -> None:
        code, out = self.run_block(env={"FAKE_REPORT": json.dumps(VITEST_REPORT)})
        calls = self.calls()
        self.assertEqual([c["cwd"] for c in calls], [str(self.wt / "backend")] * 2)
        self.assertEqual(calls[0]["args"], ["exec", "vitest", "run", "test/hidden", "--passWithNoTests",
                                            "--reporter=default", "--reporter=json",
                                            f"--outputFile.json={self.wt}/private-backend.json"])
        self.assertEqual(calls[1]["args"], ["typecheck:private"])
        # the line dispatch.sh printed before: private_summary + ", type errors 0"
        self.assertEqual(out, "files 3, load errors 1, tests 1 fail / 2 pass, type errors 0")
        self.assertEqual(code, 1)

    def test_ts_all_pass(self) -> None:
        ok = {"numFailedTests": 0, "numPassedTests": 1,
              "testResults": [{"status": "passed", "assertionResults": [{"status": "passed"}]}]}
        self.assertEqual(self.run_block(env={"FAKE_REPORT": json.dumps(ok)}),
                         (0, "files 1, load errors 0, tests 0 fail / 1 pass, type errors 0"))

    def test_ts_type_errors_are_counted(self) -> None:
        ok = {"numFailedTests": 0, "numPassedTests": 1,
              "testResults": [{"status": "passed", "assertionResults": [{"status": "passed"}]}]}
        tsc = "a.test.ts(1,1): error TS2304: x\nb.test.ts(2,1): error TS2322: y\n"
        self.assertEqual(self.run_block(env={"FAKE_REPORT": json.dumps(ok), "FAKE_TSC_OUT": tsc, "FAKE_TSC_RC": "2"}),
                         (1, "files 1, load errors 0, tests 0 fail / 1 pass, type errors 2"))
        self.assertEqual(self.run_block(env={"FAKE_REPORT": json.dumps(ok), "FAKE_TSC_RC": "2"})[1],
                         "files 1, load errors 0, tests 0 fail / 1 pass, typecheck failed (no TS errors parsed)")

    def test_ts_no_report(self) -> None:
        self.assertEqual(self.run_block(), (1, "no vitest report (vitest crashed), type errors 0"))

    def test_no_typecheck_when_the_profile_has_none(self) -> None:
        stack = json.loads((REPO / ".claude/stacks/ts-pnpm-vitest.json").read_text())
        stack["commands"]["privateTypecheck"] = None
        self.set_stack(stack)
        ok = {"numFailedTests": 0, "numPassedTests": 1,
              "testResults": [{"status": "passed", "assertionResults": [{"status": "passed"}]}]}
        self.assertEqual(self.run_block(env={"FAKE_REPORT": json.dumps(ok)}),
                         (0, "files 1, load errors 0, tests 0 fail / 1 pass"))
        self.assertEqual([c["args"][0] for c in self.calls()], ["exec"])

    def test_counts_only_no_test_names_or_content(self) -> None:
        report = {"numFailedTests": 1, "numPassedTests": 0, "testResults": [{"status": "failed", "assertionResults": [
            {"status": "failed", "fullName": "ABC-001-S1 secret scenario name", "failureMessages": ["expect secret"]}]}]}
        _, out = self.run_block(env={"FAKE_REPORT": json.dumps(report)})
        self.assertNotIn("secret", out)

    def test_pytest_profile(self) -> None:
        tsa.require_pytest(self)
        self.set_stack(json.loads((REPO / ".claude/stacks/python-pytest.json").read_text()))
        tsa.write_project(self.wt / "api")
        hidden = self.wt / "api/test/hidden"
        hidden.mkdir(parents=True)
        (hidden / "abc_003_test.py").write_text(tsa.TEST_BODIES["pass"])
        (hidden / "abc_004_test.py").write_text(tsa.TEST_BODIES["assertion"])
        (hidden / "abc_005_test.py").write_text(tsa.TEST_BODIES["missing-module"])
        self.env = tsa.python3_shim(self.tmp) | {"FAKE_LOG": str(self.log)}
        code, out = self.run_block("api")
        self.assertEqual((code, out), (1, "files 3, load errors 1, tests 1 fail / 1 pass"))
        self.assertTrue((self.wt / "private-api.xml").is_file())
        self.assertEqual(self.calls(), [])  # no pnpm, no typecheck (privateTypecheck null)
        self.assertEqual(tsa.files_written(self.wt / "api"), [])


class RunPrivateSourceTest(unittest.TestCase):
    """What run_private takes from the profile (read from the script: it needs git, gh and a PR to run)."""

    def test_install_and_test_files_come_from_the_profile(self) -> None:
        text = DISPATCH.read_text(encoding="utf-8")
        body = re.search(r"^run_private\(\) \{$(.*?)^\}$", text, re.S | re.M).group(1)
        self.assertIn("harness_config.py\" argv install", body)
        self.assertIn("get testFile --regex", body)
        self.assertIn('private_package "$ROOT" "$wt" "$pkg" "$sub" "$plog"', body)
        for old in ("pnpm install", "vitest run", "typecheck:private", "*.test.ts"):
            self.assertNotIn(old, body)


if __name__ == "__main__":
    unittest.main()
