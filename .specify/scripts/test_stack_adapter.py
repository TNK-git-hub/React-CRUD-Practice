"""Tests for stack_adapter.py: report parsing per runner, and real pytest runs of the python-pytest profile.

Run: python3 -m unittest discover -s .specify/scripts
The real-pytest tests build a tiny pytest project in a temporary folder (never a committed *_test.py file, which a
test runner could collect) and run the profile's own argv. Its "python3" is pointed at the interpreter running these
tests (a shim on PATH), so pytest must be importable there. Without pytest they are skipped, unless
HARNESS_REQUIRE_PYTEST=1 is set (CI): then they FAIL.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config as hc  # noqa: E402
import stack_adapter as sa  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
PY_STACK = json.loads((REPO / ".claude/stacks/python-pytest.json").read_text(encoding="utf-8"))

# ---- helpers shared with test_red_check.py (functions only: no TestCase is imported there) ----
PYPROJECT = """\
[tool.pytest.ini_options]
pythonpath = ["src"]
addopts = "--strict-markers"
markers = ["scenario(id): the spec scenario ID the test verifies"]
"""
APP = "def cap(x):\n    return min(x, 10)\n"
TEST_BODIES = {
    # name -> (test file text, expected: red?, load errors)
    "assertion": ('import pytest\nfrom app.price import cap\n\n\n@pytest.mark.scenario("ABC-003-S1")\n'
                  "def test_cap():\n    assert cap(50) == 3\n"),
    "missing-module": ('import pytest\nfrom app.discount import rate\n\n\n@pytest.mark.scenario("ABC-003-S2")\n'
                       "def test_rate():\n    assert rate() == 1\n"),
    "missing-name": ('import pytest\nfrom app.price import floor\n\n\n@pytest.mark.scenario("ABC-003-S3")\n'
                     "def test_floor():\n    assert floor(1) == 1\n"),
    "syntax-error": 'import pytest\n\n\n@pytest.mark.scenario("ABC-003-S4")\ndef test_x(:\n    pass\n',
    "name-error": "x = undefined_name\n\n\ndef test_x():\n    pass\n",
    "setup-error": ("import pytest\n\n\n@pytest.fixture\ndef db():\n    raise RuntimeError('no db')\n\n\n"
                    "def test_x(db):\n    pass\n"),
    "unregistered-marker": "import pytest\n\n\n@pytest.mark.scenarioo('ABC-003-S5')\ndef test_x():\n    pass\n",
    "pass": ('import pytest\nfrom app.price import cap\n\n\n@pytest.mark.scenario("ABC-003-S6")\n'
             "def test_cap():\n    assert cap(5) == 5\n"),
}


def require_pytest(tc: unittest.TestCase) -> None:
    """Skip the test when pytest is not installed for this interpreter; FAIL instead when HARNESS_REQUIRE_PYTEST=1."""
    if importlib.util.find_spec("pytest") is not None:
        return
    msg = f"pytest is not installed for {sys.executable}"
    if os.environ.get("HARNESS_REQUIRE_PYTEST") == "1":
        tc.fail(f"HARNESS_REQUIRE_PYTEST=1 but {msg}")
    tc.skipTest(msg + " (set HARNESS_REQUIRE_PYTEST=1 to make this a failure)")


def python3_shim(tmp: Path) -> dict:
    """An environment whose `python3` (argv[0] of the python-pytest profile) is this interpreter."""
    bin_dir = tmp / "shim-bin"
    bin_dir.mkdir(exist_ok=True)
    shim = bin_dir / "python3"
    shim.write_text(f'#!/bin/sh\nexec "{sys.executable}" "$@"\n')
    shim.chmod(0o755)
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTEST")}
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"
    return env


def write_project(pkg: Path) -> None:
    """A tiny pytest package: pyproject.toml (scenario marker registered, --strict-markers) and src/app/price.py."""
    (pkg / "src/app").mkdir(parents=True, exist_ok=True)
    (pkg / "pyproject.toml").write_text(PYPROJECT)
    (pkg / "src/app/__init__.py").write_text("")
    (pkg / "src/app/price.py").write_text(APP)


def files_written(folder: Path) -> list:
    return sorted(str(p.relative_to(folder)) for p in folder.rglob("*")
                  if p.name in ("__pycache__", ".pytest_cache") or p.suffix == ".pyc")


# ---- vitest: the same numbers as red_check.read_report and dispatch.sh private_summary before the adapter ----
VITEST = {
    "numFailedTests": 2, "numPassedTests": 3,
    "testResults": [
        {"name": "a.test.ts", "status": "passed", "assertionResults": [{"status": "passed", "fullName": "ABC-001-S1 a"}]},
        {"name": "b.test.ts", "status": "failed",
         "assertionResults": [{"status": "failed", "fullName": "ABC-002-S1 b"}, {"status": "passed", "fullName": "x"}]},
        {"name": "c.test.ts", "status": "failed", "message": "Failed to load url ../src/x", "assertionResults": []},
        # afterAll hook error: the file failed, its tests passed
        {"name": "d.test.ts", "status": "failed", "assertionResults": [{"status": "passed", "fullName": "d"}]},
        {"name": "e.test.ts", "status": "failed", "assertionResults": [{"status": "failed", "fullName": "e"}]},
    ],
}


class VitestReportTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def parse(self, data: object) -> dict | None:
        p = self.tmp / "r.json"
        p.write_text(data if isinstance(data, str) else json.dumps(data))
        return sa.parse_report("vitest", p)

    def test_counts(self) -> None:
        r = self.parse(VITEST)
        # red_check.read_report: files = testResults, failed files = status "failed" (load errors and hook errors too)
        self.assertEqual((r["files"], r["failedFiles"], r["failed"], r["passed"]), (5, 4, 2, 3))
        # dispatch.sh private_summary: load error = a failed file without any test result
        self.assertEqual(r["loadErrors"], 1)
        self.assertEqual(sa.summary_line(r), "files 5, load errors 1, tests 2 fail / 3 pass")
        self.assertIn("ABC-002-S1 b", r["names"])

    def test_red_rule_is_any_failed_file(self) -> None:
        load_only = {"numFailedTests": 0, "numPassedTests": 0,
                     "testResults": [{"status": "failed", "assertionResults": []}]}
        self.assertTrue(sa.is_red(self.parse(load_only)))  # a file that fails to load is a valid RED (vitest)
        passing = {"numFailedTests": 0, "numPassedTests": 1,
                   "testResults": [{"status": "passed", "assertionResults": [{"status": "passed"}]}]}
        self.assertFalse(sa.is_red(self.parse(passing)))

    def test_no_or_empty_report(self) -> None:
        self.assertIsNone(sa.parse_report("vitest", self.tmp / "missing.json"))
        self.assertIsNone(self.parse("{not json"))
        self.assertEqual(self.parse({"testResults": []})["files"], 0)
        self.assertEqual(self.parse([1, 2])["files"], 0)
        self.assertIsNone(self.parse({"testResults": []})["failed"])


# ---- pytest JUnit XML, hand-written in the shape pytest 8 writes it (junit_family=xunit1) ----
JUNIT = """<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest" errors="5" failures="1" skipped="1" tests="9">
<testcase classname="" name="test.public.a_test" file="test/public/a_test.py"><error message="collection failure">ImportError while importing test module '/x/test/public/a_test.py'.
Traceback:
test/public/a_test.py:2: in &lt;module&gt;
    from app.discount import rate
E   ModuleNotFoundError: No module named 'app.discount'</error></testcase>
<testcase classname="" name="test.public.b_test" file="test/public/b_test.py"><error message="collection failure">ImportError while importing test module '/x/test/public/b_test.py'.
E   ImportError: cannot import name 'floor' from 'app.price' (/x/src/app/price.py)</error></testcase>
<testcase classname="" name="test.public.c_test" file="test/public/c_test.py"><error message="collection failure">/venv/_pytest/python.py:493: in importtestmodule
E   SyntaxError: invalid syntax</error></testcase>
<testcase classname="" name="test.public.d_test" file="test/public/d_test.py"><error message="collection failure">test/public/d_test.py:1: in &lt;module&gt;
    from app import helper  # raises ImportError inside? no: NameError below
E   NameError: name 'undefined_name' is not defined</error></testcase>
<testcase classname="test.public.e_test" name="test_cap" file="test/public/e_test.py" line="3"><failure message="assert 50 == 3">def test_cap():
&gt;       assert cap(50) == 3
E       assert 10 == 3</failure></testcase>
<testcase classname="test.public.e_test" name="test_ok" file="test/public/e_test.py" line="7" />
<testcase classname="test.public.f_test" name="test_db" file="test/public/f_test.py" line="8"><error message="failed on setup with &quot;ImportError: no driver&quot;">E   ImportError: no driver</error></testcase>
<testcase classname="test.public.g_test" name="test_skip" file="test/public/g_test.py" line="2"><skipped type="pytest.skip" message="later">skip</skipped></testcase>
<testcase classname="test.public.g_test" name="test_ok" file="test/public/g_test.py" line="5" />
</testsuite></testsuites>"""


class PytestReportTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def parse(self, text: str) -> dict | None:
        p = self.tmp / "r.xml"
        p.write_text(text)
        return sa.parse_report("pytest", p)

    def one(self, testcase: str) -> dict:
        return self.parse(f"<testsuites><testsuite>{testcase}</testsuite></testsuites>")

    def test_counts(self) -> None:
        r = self.parse(JUNIT)
        self.assertEqual(r["files"], 7)
        # failed files: a (missing module), b (cannot import name), e (assertion); not c, d (load errors), f (setup)
        self.assertEqual(r["failedFiles"], 3)
        self.assertEqual(r["loadErrors"], 5)  # a, b, c, d, f: every <error>
        self.assertEqual((r["failed"], r["passed"]), (1, 2))  # e.test_cap / e.test_ok, g.test_ok (skip is neither)
        self.assertEqual(sa.summary_line(r), "files 7, load errors 5, tests 1 fail / 2 pass")
        self.assertIn("test/public/e_test.py::test_cap", r["names"])

    def test_red_rule_per_error_kind(self) -> None:
        cases = {
            "ModuleNotFoundError": (True, '<error message="collection failure">E   ModuleNotFoundError: No module named \'x\'</error>'),
            "ImportError cannot import name": (True, '<error message="collection failure">E   ImportError: cannot import name \'y\' from \'x\'</error>'),
            "qualified ImportError": (True, '<error message="collection failure">E   builtins.ImportError: y</error>'),
            "SyntaxError": (False, '<error message="collection failure">E   SyntaxError: invalid syntax</error>'),
            "NameError": (False, '<error message="collection failure">E   NameError: name \'u\' is not defined</error>'),
            # the LAST E line decides: an ImportError caught and re-raised as another error is not RED
            "ImportError then RuntimeError": (False, '<error message="collection failure">E   ImportError: a\nE   RuntimeError: b</error>'),
            "ImportError in a setup error": (False, '<error message="failed on setup with &quot;ImportError: d&quot;">E   ImportError: d</error>'),
            "assertion failure": (True, '<failure message="assert 1 == 2">E   assert 1 == 2</failure>'),
            "skipped": (False, '<skipped message="later" />'),
            "pass": (False, ""),
        }
        for name, (red, child) in cases.items():
            with self.subTest(name):
                r = self.one(f'<testcase classname="" name="t" file="t_test.py">{child}</testcase>')
                self.assertEqual(sa.is_red(r), red, r)

    def test_no_or_empty_report(self) -> None:
        self.assertIsNone(sa.parse_report("pytest", self.tmp / "missing.xml"))
        self.assertIsNone(self.parse("<testsuites><unclosed>"))
        self.assertIsNone(self.parse("<html/>"))
        r = self.parse('<testsuites><testsuite name="pytest" tests="0" /></testsuites>')
        self.assertEqual((r["files"], r["failedFiles"], r["loadErrors"], r["failed"], r["passed"]), (0, 0, 0, 0, 0))
        self.assertEqual(self.parse('<testsuite><testcase file="a_test.py" name="t"/></testsuite>')["passed"], 1)

    def test_exception_type(self) -> None:
        self.assertEqual(sa.exception_type("x\nE   ModuleNotFoundError: No module named 'a'\n"), "ModuleNotFoundError")
        self.assertEqual(sa.exception_type("E   pkg.errors.ImportError: x"), "ImportError")
        self.assertEqual(sa.exception_type("no E line"), "")


class SummaryCliTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def cli(self, report: Path, stack: dict | None = None) -> tuple[int, str, str]:
        cfg = hc.load(REPO)
        if stack is not None:
            cfg["stack"] = stack
        conf = self.tmp / "harness.json"
        conf.write_text(json.dumps(cfg))
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = sa.main(["summary", "--report", str(report), "--config", str(conf)])
        return code, out.getvalue(), err.getvalue()

    def test_vitest_summary_and_exit_code(self) -> None:
        p = self.tmp / "r.json"
        p.write_text(json.dumps(VITEST))
        self.assertEqual(self.cli(p), (1, "files 5, load errors 1, tests 2 fail / 3 pass\n", ""))
        p.write_text(json.dumps({"numFailedTests": 0, "numPassedTests": 2, "testResults": [
            {"status": "passed", "assertionResults": [{"status": "passed"}, {"status": "passed"}]}]}))
        self.assertEqual(self.cli(p)[:2], (0, "files 1, load errors 0, tests 0 fail / 2 pass\n"))

    def test_pytest_summary_and_exit_code(self) -> None:
        p = self.tmp / "r.xml"
        p.write_text(JUNIT)
        self.assertEqual(self.cli(p, PY_STACK)[:2], (1, "files 7, load errors 5, tests 1 fail / 2 pass\n"))

    def test_no_report_exits_2_and_prints_no_counts(self) -> None:
        code, out, err = self.cli(self.tmp / "none.json")
        self.assertEqual((code, out), (2, ""))
        self.assertIn("no readable vitest JSON report", err)


class RealPytestTest(unittest.TestCase):
    """The python-pytest profile's runFiles / private argv against real pytest, read by the adapter."""

    def setUp(self) -> None:
        require_pytest(self)
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name).resolve()
        self.pkg = self.tmp / "api"
        write_project(self.pkg)
        self.env = python3_shim(self.tmp)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def add(self, rel: str, text: str) -> str:
        p = self.pkg / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        return rel

    def run_files(self, *rels: str) -> dict:
        report = self.tmp / "report.xml"
        output = sa.run_files(PY_STACK, self.pkg, list(rels), report, self.env)
        r = sa.parse_report("pytest", report)
        self.assertIsNotNone(r, output)
        return r

    def test_red_rule_on_real_pytest(self) -> None:
        expected = {  # name -> (RED?, load errors)
            "assertion": (True, 0),
            "missing-module": (True, 1),
            "missing-name": (True, 1),
            "syntax-error": (False, 1),
            "name-error": (False, 1),
            "setup-error": (False, 1),
            "unregistered-marker": (False, 1),  # --strict-markers: a typo in the marker name is not RED
            "pass": (False, 0),
        }
        for name, (red, load) in expected.items():
            with self.subTest(name):
                rel = self.add(f"test/public/{name.replace('-', '_')}_test.py", TEST_BODIES[name])
                r = self.run_files(rel)
                self.assertEqual((sa.is_red(r), r["loadErrors"], r["files"]), (red, load, 1), r)

    def test_one_red_file_among_load_errors_is_red(self) -> None:
        # --continue-on-collection-errors: a syntax error in one file does not stop the assertion failure of another
        a = self.add("test/public/abc_003_test.py", TEST_BODIES["assertion"])
        b = self.add("test/public/abc_004_test.py", TEST_BODIES["syntax-error"])
        r = self.run_files(a, b)
        self.assertEqual((r["files"], r["failedFiles"], r["loadErrors"], r["failed"]), (2, 1, 1, 1))
        self.assertTrue(sa.is_red(r))

    def test_pytest_writes_nothing_into_the_project(self) -> None:
        rel = self.add("test/public/abc_003_test.py", TEST_BODIES["pass"])
        self.run_files(rel)
        self.assertEqual(files_written(self.pkg), [])

    def test_only_files_named_like_test_file_are_collected(self) -> None:
        # -o python_files=*_test.py: a test_*.py file in the folder is not collected, whatever the app's config says
        self.add("test/public/abc_003_test.py", TEST_BODIES["pass"])
        self.add("test/public/test_abc_004.py", TEST_BODIES["assertion"])
        with (self.pkg / "pyproject.toml").open("a") as f:
            f.write('python_files = ["test_*.py"]\n')
        report = self.tmp / "report.xml"
        argv = hc.command_argv(PY_STACK, "private", values={"dir": "test/public", "report": str(report)})
        subprocess.run(argv, cwd=self.pkg, env=self.env, capture_output=True, text=True)
        r = sa.parse_report("pytest", report)
        self.assertEqual((r["files"], r["failed"], r["passed"]), (1, 0, 1), r)

    def test_private_run_summary_counts(self) -> None:
        # dispatch.sh run_private: the private argv on a folder, then `stack_adapter.py summary`
        self.add("test/hidden/abc_003_test.py", TEST_BODIES["pass"])
        self.add("test/hidden/abc_004_test.py", TEST_BODIES["assertion"])
        self.add("test/hidden/abc_005_test.py", TEST_BODIES["syntax-error"])
        self.add("test/hidden/helper.py", "X = 1\n")
        report = self.tmp / "private-api.xml"
        argv = hc.command_argv(PY_STACK, "private", values={"dir": "test/hidden", "report": str(report)})
        subprocess.run(argv, cwd=self.pkg, env=self.env, capture_output=True, text=True)
        cfg = hc.load(REPO)
        cfg["stack"] = PY_STACK
        conf = self.tmp / "harness.json"
        conf.write_text(json.dumps(cfg))
        out = io.StringIO()
        with redirect_stdout(out):
            code = sa.main(["summary", "--report", str(report), "--config", str(conf)])
        self.assertEqual((code, out.getvalue()), (1, "files 3, load errors 1, tests 1 fail / 1 pass\n"))

    def test_private_run_of_an_empty_folder_passes(self) -> None:
        (self.pkg / "test/hidden").mkdir(parents=True)
        report = self.tmp / "private-api.xml"
        argv = hc.command_argv(PY_STACK, "private", values={"dir": "test/hidden", "report": str(report)})
        subprocess.run(argv, cwd=self.pkg, env=self.env, capture_output=True, text=True)
        r = sa.parse_report("pytest", report)
        self.assertEqual(sa.summary_line(r), "files 0, load errors 0, tests 0 fail / 0 pass")


class RequirePytestTest(unittest.TestCase):
    """HARNESS_REQUIRE_PYTEST=1 turns the skip of a missing pytest into a failure (CI must not skip the proof)."""

    def run_probe(self, require: bool) -> subprocess.CompletedProcess:
        code = ("import sys, unittest, importlib.util\n"
                f"sys.path.insert(0, {str(Path(__file__).resolve().parent)!r})\n"
                "importlib.util.find_spec = lambda name, *a, **k: None  # pytest 'not installed'\n"
                "import test_stack_adapter as t\n"
                "class P(unittest.TestCase):\n"
                "    def test_p(self):\n"
                "        t.require_pytest(self)\n"
                "r = unittest.TextTestRunner(stream=sys.stdout).run(unittest.defaultTestLoader.loadTestsFromTestCase(P))\n"
                "print('SKIPPED' if r.skipped else 'FAILED' if r.failures else 'RAN')\n")
        env = {k: v for k, v in os.environ.items() if k != "HARNESS_REQUIRE_PYTEST"}
        if require:
            env["HARNESS_REQUIRE_PYTEST"] = "1"
        return subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)

    def test_missing_pytest_is_skipped_by_default(self) -> None:
        self.assertEqual(self.run_probe(False).stdout.strip().splitlines()[-1], "SKIPPED")

    def test_missing_pytest_fails_when_required(self) -> None:
        r = self.run_probe(True)
        self.assertEqual(r.stdout.strip().splitlines()[-1], "FAILED", r.stdout + r.stderr)
        self.assertIn("HARNESS_REQUIRE_PYTEST=1 but pytest is not installed", r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
