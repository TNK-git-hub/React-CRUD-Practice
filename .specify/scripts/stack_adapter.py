#!/usr/bin/env python3
"""Test-runner adapters of the stack profile (.claude/harness.json "stack"): run test files, read their report.

    python3 .specify/scripts/stack_adapter.py summary --report <file> [--root R | --config <file>|-]

One shape for every runner, from parse_report(runner, report file):
  files        test files in the report
  failedFiles  test files that count as failing. RED (red_check.py) = failedFiles > 0
  loadErrors   tests / files that could not run at all
  failed       failing tests (None when the report does not say)
  passed       passing tests (None when the report does not say)
  names        test names (never printed for hidden tests)
parse_report returns None when there is no report, or it cannot be read.

vitest (stack.runner "vitest", JSON reporter): the rules red_check.py and dispatch.sh used before this module.
  files = testResults; failedFiles = files in status "failed" (a file that fails to load counts: importing a module
  that does not exist yet is a valid RED); loadErrors = failed files without any test result (syntax error, import of
  a module that cannot be found, an error at the top level); failed / passed = numFailedTests / numPassedTests.
pytest (stack.runner "pytest", JUnit XML with junit_family=xunit1, so every <testcase> has its file). Per <testcase>:
  <failure>                                           a failing test; its file is a failed file
  <error message="collection failure"> whose exception is ModuleNotFoundError or ImportError ("cannot import name")
                                                      a load error AND a failed file: the same meaning as vitest's
                                                      "importing a module that does not exist yet" (RED)
  any other <error> (SyntaxError, NameError, a fixture / setup / teardown error)
                                                      a load error only: NOT RED
  <skipped>                                           neither; a <testcase> without any of these: a passing test
The exception of a collection error is the last `E   <Type>: …` line of its text.

run_files(stack, cwd, files, report, env): runs stack.commands.runFiles in cwd (the package folder) with {files}
and {report} filled in, returns the console output; the report is then read with parse_report.

summary (dispatch.sh, hidden tests): prints one line of counts only, never a test name or test content:
"files N, load errors N, tests N fail / N pass"; exit 0 when nothing failed, 1 on a load error or a failing test,
2 when the report is missing or unreadable, or harness.json is invalid.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_config as hc  # noqa: E402

REPORT_SUFFIX = {"vitest": ".json", "pytest": ".xml"}
REPORT_LABEL = {"vitest": "vitest JSON report", "pytest": "pytest JUnit XML report"}
REPORT_SHORT = {"vitest": "JSON report", "pytest": "JUnit XML report"}
IMPORT_ERRORS = ("ModuleNotFoundError", "ImportError")
E_LINE_RE = re.compile(r"^E\s+([A-Za-z_][\w.]*):")


def _vitest(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        data = {}
    results = data.get("testResults")
    results = results if isinstance(results, list) else []
    files = [r for r in results if isinstance(r, dict)]
    failed_files = [r for r in files if r.get("status") == "failed"]
    names = [a.get("fullName") or a.get("title") or "" for r in files for a in (r.get("assertionResults") or [])
             if isinstance(a, dict)]
    return {
        "files": len(results),
        "failedFiles": len(failed_files),
        "loadErrors": sum(1 for r in failed_files if not (r.get("assertionResults") or [])),
        "failed": data.get("numFailedTests"),
        "passed": data.get("numPassedTests"),
        "names": names,
    }


def exception_type(text: str) -> str:
    """The exception of a pytest error text: its last `E   <Type>:` line (module prefix dropped), or ""."""
    found = [m.group(1) for m in map(E_LINE_RE.match, text.splitlines()) if m]
    return found[-1].rsplit(".", 1)[-1] if found else ""


def is_import_collection_error(error: ET.Element) -> bool:
    return error.get("message") == "collection failure" and exception_type(error.text or "") in IMPORT_ERRORS


def _pytest(path: Path) -> dict | None:
    try:
        root = ET.parse(str(path)).getroot()
    except (OSError, ET.ParseError):
        return None
    if root.tag not in ("testsuites", "testsuite"):
        return None
    files: list[str] = []
    failed_files: set[str] = set()
    load = failed = passed = 0
    names = []
    for tc in root.iter("testcase"):
        f = tc.get("file") or tc.get("classname") or tc.get("name") or "?"
        if f not in files:
            files.append(f)
        names.append(f"{f}::{tc.get('name', '')}")
        tags = [c.tag for c in tc]
        if "failure" in tags:
            failed += 1
            failed_files.add(f)
        errors = [c for c in tc if c.tag == "error"]
        if errors:
            load += 1
            if any(is_import_collection_error(e) for e in errors):
                failed_files.add(f)
        if not {"failure", "error", "skipped"} & set(tags):
            passed += 1
    return {"files": len(files), "failedFiles": len(failed_files), "loadErrors": load, "failed": failed,
            "passed": passed, "names": names}


PARSERS = {"vitest": _vitest, "pytest": _pytest}


def parse_report(runner: str, path: Path) -> dict | None:
    """The common shape of a report of `runner`, or None (no report, unreadable)."""
    return PARSERS[runner](Path(path))


def is_red(report: dict) -> bool:
    """The new tests fail before the code change: at least one failed file (see the module doc per runner)."""
    return report["failedFiles"] > 0


def run_files(stack: dict, cwd: Path, files: list, report: Path, env: dict) -> str:
    """Run stack.commands.runFiles in `cwd` for `files` (relative to cwd), writing `report`. Returns the output."""
    cmd = hc.command_argv(stack, "runFiles", files=list(files), values={"report": str(report)})
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    except OSError as e:
        return f"cannot start {cmd[0]}: {e}"
    return r.stdout + r.stderr


def _n(value: object) -> str:
    return "?" if value is None else str(value)


def summary_line(report: dict) -> str:
    return (f"files {report['files']}, load errors {report['loadErrors']}, "
            f"tests {_n(report['failed'])} fail / {_n(report['passed'])} pass")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="test reports of the stack profile")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("summary", help="counts of a report (hidden tests: no names, no content)")
    s.add_argument("--report", required=True, type=Path)
    src = s.add_mutually_exclusive_group()
    src.add_argument("--root", type=Path, default=None)
    src.add_argument("--config", default=None, help="a harness.json instead of <root>/.claude/harness.json ('-' = stdin)")
    args = parser.parse_args(argv)
    try:
        if args.config == "-":
            config = hc.loads(sys.stdin.read())
        elif args.config is not None:
            config = hc.loads(Path(args.config).read_text(encoding="utf-8"))
        else:
            config = hc.load((args.root or hc.default_root()).resolve())
    except (hc.ConfigError, OSError) as e:
        print(f"stack_adapter.py: {e}", file=sys.stderr)
        return 2
    runner = config["stack"]["runner"]
    report = parse_report(runner, args.report)
    if report is None:
        print(f"stack_adapter.py: no readable {REPORT_LABEL[runner]} at {args.report}", file=sys.stderr)
        return 2
    print(summary_line(report))
    return 1 if report["loadErrors"] or report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
