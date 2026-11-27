"""Tests for stop-gate.sh and code-gate.sh, run as real subprocesses in a throwaway git repo with a fake `pnpm` on
PATH. The fake logs the arguments of every call, so the tests check the exact command lines of the TS profile
(the same ones the hooks ran before the stack profile).

Run: python3 -m unittest discover -s .claude/hooks
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / ".specify/scripts"))
import approval  # noqa: E402

COPIED = (".claude/hooks/stop-gate.sh", ".claude/hooks/code-gate.sh", ".specify/scripts/approval.py",
          ".specify/scripts/harness_config.py", ".claude/harness.json", approval.TEMPLATE)
BASH = shutil.which("bash") or "/bin/bash"  # absolute: some tests run the hook with a reduced PATH
BUG = "20261125-price-filter-ignores-max"
REPRO = "backend/test/public/price-filter.test.ts"
REPRO_TEST = "it('PROD-002-S2 max filters', () => { expect(filter(100)).toBe(3); });\n"
REPORT = f"""\
# Bug report: max ignored

## Expected

max 100 filters.

## Reproduction test

- Path: `{REPRO}`
- Name: `PROD-002-S2 max filters`
"""
INVESTIGATION = """\
# Investigation: 20261125-price-filter-ignores-max

## Evidence log

| 1 | test | fails |

## Root cause

- **Root cause:** the query builder drops `max`
- **Fix direction:** keep `max` in the builder

## Root cause gate

See approval.json.

## Stopped after 3 failed attempts

- Attempts: none yet
"""
# Fake pnpm: logs its arguments (one call per line), prints a few lines, exits with $FAKE_PNPM_EXIT, or with 1 when
# its arguments are exactly $FAKE_PNPM_FAIL_ON
FAKE_PNPM = """#!/bin/sh
echo "$*" >> "$FAKE_PNPM_MARKER"
echo "FAIL  backend/test/public/a.test.ts > ABC-001-S1"
echo "fake pnpm $*"
if [ -n "${FAKE_PNPM_FAIL_ON:-}" ] && [ "$*" = "$FAKE_PNPM_FAIL_ON" ]; then exit 1; fi
exit "${FAKE_PNPM_EXIT:-0}"
"""


class GateFixture(unittest.TestCase):
    """The throwaway repo and the helpers; no tests of its own."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name).resolve()
        self.root = base / "repo"
        self.bin = base / "bin"
        self.marker = base / "pnpm-called"
        for rel in COPIED:
            dst = self.root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(REPO / rel, dst)
        self.write("bugs/.gitkeep", "# bugs/\n")
        self.write("app.txt", "v1\n")
        self.bin.mkdir()
        pnpm = self.bin / "pnpm"
        pnpm.write_text(FAKE_PNPM)
        pnpm.chmod(0o755)
        self.git("init", "-q")
        self.commit("initial")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, rel: str, text: str) -> None:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def git(self, *args: str) -> None:
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
                       cwd=self.root, check=True, capture_output=True)

    def commit(self, msg: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", msg)

    HOOK = ".claude/hooks/stop-gate.sh"

    def run_gate(self, payload: dict | None = None, pnpm_exit: int = 1, **env: str) -> tuple[int, str]:
        e = {k: v for k, v in os.environ.items() if k != "SKIP_STOP_GATE"}
        e.update(CLAUDE_PROJECT_DIR=str(self.root), PATH=f"{self.bin}{os.pathsep}{e.get('PATH', '')}",
                 FAKE_PNPM_EXIT=str(pnpm_exit), FAKE_PNPM_MARKER=str(self.marker))
        e.update(env)
        r = subprocess.run([BASH, str(self.root / self.HOOK)], input=json.dumps(payload or {}),
                           cwd=self.root, env=e, capture_output=True, text=True)
        return r.returncode, r.stderr

    def pnpm_called(self) -> bool:
        return self.marker.exists()

    def pnpm_calls(self) -> list[str]:
        return self.marker.read_text().splitlines() if self.marker.exists() else []

    def set_stack(self, change) -> None:
        """Change the stack profile of the fake repo's harness.json (committed, so it is not a 'changed file')."""
        p = self.root / ".claude/harness.json"
        cfg = json.loads(p.read_text())
        change(cfg["stack"])
        p.write_text(json.dumps(cfg))
        self.commit("config")

    def with_app(self) -> None:
        self.write("package.json", '{"name": "app", "scripts": {"test": "x"}}\n')
        self.commit("app")

    def bug_record(self) -> Path:
        self.write(f"bugs/{BUG}/report.md", REPORT)
        self.write(f"bugs/{BUG}/investigation.md", INVESTIGATION)
        self.write(REPRO, REPRO_TEST)  # the reproduction test is part of the root-cause gate
        return self.root / "bugs" / BUG

    def approve_root_cause(self, folder: Path) -> None:
        """A valid approval.json built with approval.py's own functions (not the TTY-only approve command)."""
        mats = approval.materials(self.root, folder, "root-cause")
        entry = {"sha256": approval.digest(mats), "files": [label for label, _ in mats],
                 "at": "2026-11-25T00:00:00+00:00", "by": "terminal", "summary": "builder drops max"}
        (folder / approval.APPROVAL_FILE).write_text(json.dumps({"root-cause": entry}), encoding="utf-8")


class StopGateTest(GateFixture):
    # ---- unchanged exits ----
    def test_no_package_json(self) -> None:
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate()
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())

    def test_no_changed_file(self) -> None:
        self.with_app()
        code, _ = self.run_gate()
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())

    def test_stop_hook_active(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate({"stop_hook_active": True})
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())

    def test_skip_stop_gate(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate(SKIP_STOP_GATE="1")
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())

    # ---- failing tests, no bug pending ----
    def test_failing_tests_block_with_no_weakening_message(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        code, err = self.run_gate()
        self.assertEqual(code, 2)
        self.assertTrue(self.pnpm_called())
        self.assertIn("pnpm test is failing", err)
        self.assertIn("Do NOT edit, weaken, skip or delete tests to make them pass", err)
        self.assertIn("waiting for the user to decide", err)
        self.assertIn("FAIL  backend/test/public/a.test.ts > ABC-001-S1", err)

    def test_passing_tests(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate(pnpm_exit=0)
        self.assertEqual(code, 0)
        self.assertTrue(self.pnpm_called())

    # ---- the stack profile ----
    def test_runs_exactly_pnpm_test(self) -> None:
        # the TS profile's stack.commands.test is the command stop-gate ran before: `pnpm test`, nothing else
        self.with_app()
        self.write("app.txt", "v2\n")
        self.run_gate(pnpm_exit=0)
        self.assertEqual(self.pnpm_calls(), ["test"])

    def test_command_and_message_come_from_the_profile(self) -> None:
        self.set_stack(lambda s: s["commands"].update(test=["pnpm", "run", "unit", "--silent"]))
        self.with_app()
        self.write("app.txt", "v2\n")
        code, err = self.run_gate()
        self.assertEqual(code, 2)
        self.assertEqual(self.pnpm_calls(), ["run unit --silent"])
        self.assertIn("pnpm run unit --silent is failing", err)
        self.assertIn("Do NOT edit, weaken, skip or delete tests to make them pass", err)

    def test_app_marker_comes_from_the_profile(self) -> None:
        self.set_stack(lambda s: s.update(appMarker="pyproject.toml"))
        self.with_app()  # package.json is not this profile's marker
        self.write("app.txt", "v2\n")
        self.assertEqual(self.run_gate()[0], 0)
        self.assertFalse(self.pnpm_called())
        self.write("pyproject.toml", "[project]\nname = 'app'\n")
        self.assertEqual(self.run_gate()[0], 2)
        self.assertTrue(self.pnpm_called())

    def test_invalid_config_blocks(self) -> None:
        # fail-closed: harness.json invalid -> exit 2, even before the app marker is looked at
        for body in ("{not json", json.dumps({"version": 1})):
            with self.subTest(body=body):
                self.write(".claude/harness.json", body)
                code, err = self.run_gate()
                self.assertEqual(code, 2)
                self.assertIn(".claude/harness.json missing or invalid", err)
                self.assertFalse(self.pnpm_called())
        code, _ = self.run_gate({"stop_hook_active": True})
        self.assertEqual(code, 0)  # the second stop goes through

    def test_no_python_blocks(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        no_python = self.root.parent / "no-python-bin"
        no_python.mkdir()
        for tool in ("cat", "grep", "git"):  # the commands the hook needs before it looks for python3
            os.symlink(shutil.which(tool), no_python / tool)
        code, err = self.run_gate(PATH=f"{self.bin}{os.pathsep}{no_python}")
        self.assertEqual(code, 2)
        self.assertIn("python3 not found", err)
        self.assertFalse(self.pnpm_called())

    # ---- bug flow: waiting for the root-cause approval ----
    def test_bug_without_root_cause_gate_skips_tests(self) -> None:
        self.with_app()
        self.bug_record()
        code, err = self.run_gate()
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())
        self.assertIn(f"[stop-gate] bug {BUG} is waiting for the user to approve the root cause", err)

    def test_bug_with_matching_gate_runs_tests(self) -> None:
        self.with_app()
        self.approve_root_cause(self.bug_record())
        code, _ = self.run_gate()
        self.assertEqual(code, 2)
        self.assertTrue(self.pnpm_called())

    def test_bug_gate_changed_after_approval_skips_tests(self) -> None:
        self.with_app()
        self.approve_root_cause(self.bug_record())
        self.write(f"bugs/{BUG}/investigation.md",
                   INVESTIGATION.replace("keep `max` in the builder", "clamp `max` in the controller"))
        code, err = self.run_gate()
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())
        self.assertIn(BUG, err)

    def test_reproduction_test_changed_after_approval_skips_tests(self) -> None:
        self.with_app()
        self.approve_root_cause(self.bug_record())
        self.write(REPRO, REPRO_TEST.replace("toBe(3)", "toBe(4)"))
        code, err = self.run_gate()
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())
        self.assertIn(BUG, err)

    def test_reproduction_test_missing_runs_tests(self) -> None:
        self.with_app()
        self.bug_record()
        (self.root / REPRO).unlink()
        self.assert_tests_ran()

    def test_old_committed_bug_does_not_switch_gate_off(self) -> None:
        self.with_app()
        self.bug_record()  # no gate, but committed and unchanged
        self.commit("old bug record")
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate()
        self.assertEqual(code, 2)
        self.assertTrue(self.pnpm_called())

    def test_only_gitkeep_changed_runs_tests(self) -> None:
        self.with_app()
        self.write("bugs/.gitkeep", "# bugs/ changed\n")
        code, _ = self.run_gate()
        self.assertEqual(code, 2)
        self.assertTrue(self.pnpm_called())

    # ---- fail-closed: an incomplete record or an approval.py error never switches the gate off ----
    def assert_tests_ran(self) -> None:
        code, err = self.run_gate()
        self.assertEqual(code, 2, err)
        self.assertTrue(self.pnpm_called())
        self.assertNotIn("skipping pnpm test", err)

    def test_bug_with_notes_only_runs_tests(self) -> None:
        self.with_app()
        self.write(f"bugs/{BUG}/notes.md", "first notes\n")
        self.assert_tests_ran()

    def test_bug_with_report_only_runs_tests(self) -> None:
        self.with_app()
        self.write(f"bugs/{BUG}/report.md", REPORT)
        self.assert_tests_ran()

    def test_bug_without_root_cause_section_runs_tests(self) -> None:
        self.with_app()
        self.write(f"bugs/{BUG}/report.md", REPORT)
        self.write(f"bugs/{BUG}/investigation.md", INVESTIGATION.replace("## Root cause\n", "## Findings\n"))
        self.assert_tests_ran()

    def test_broken_approval_json_runs_tests(self) -> None:
        self.with_app()
        folder = self.bug_record()
        (folder / approval.APPROVAL_FILE).write_text("{not json", encoding="utf-8")
        self.assert_tests_ran()

    def test_folder_not_named_like_a_bug_id_runs_tests(self) -> None:
        self.with_app()
        self.write("bugs/notes/todo.md", "x\n")
        code, _ = self.run_gate()
        self.assertEqual(code, 2)
        self.assertTrue(self.pnpm_called())


class CodeGateTest(GateFixture):
    """code-gate.sh (code-writer's SubagentStop hook): the gate steps of the stack profile, in order."""

    HOOK = ".claude/hooks/code-gate.sh"

    def test_unchanged_exits(self) -> None:
        self.write("app.txt", "v2\n")
        self.assertEqual(self.run_gate()[0], 0)  # no package.json (the TS appMarker)
        self.commit("v2")
        self.with_app()
        self.assertEqual(self.run_gate()[0], 0)  # no changed file
        self.write("app.txt", "v3\n")
        self.assertEqual(self.run_gate({"stop_hook_active": True})[0], 0)
        self.assertFalse(self.pnpm_called())

    def test_runs_the_three_ts_steps_in_order(self) -> None:
        # the TS profile's gate is what code-gate ran before: pnpm lint; pnpm --filter frontend typecheck; pnpm test
        self.with_app()
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate(pnpm_exit=0)
        self.assertEqual(code, 0)
        self.assertEqual(self.pnpm_calls(), ["lint", "--filter frontend typecheck", "test"])

    def test_first_failing_step_blocks_with_its_label(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        code, err = self.run_gate(pnpm_exit=0, FAKE_PNPM_FAIL_ON="--filter frontend typecheck")
        self.assertEqual(code, 2)
        self.assertIn("typecheck frontend is failing. Make it pass before you report the task as done:", err)
        self.assertEqual(self.pnpm_calls(), ["lint", "--filter frontend typecheck"])  # pnpm test not run

    def test_steps_come_from_the_profile(self) -> None:
        self.set_stack(lambda s: s["commands"].update(gate=[{"label": "unit tests", "argv": ["pnpm", "unit"]}]))
        self.with_app()
        self.write("app.txt", "v2\n")
        code, err = self.run_gate()
        self.assertEqual(code, 2)
        self.assertIn("unit tests is failing", err)
        self.assertEqual(self.pnpm_calls(), ["unit"])

    def test_invalid_config_blocks_the_gate(self) -> None:
        self.write(".claude/harness.json", "{not json")
        code, err = self.run_gate()
        self.assertEqual(code, 2)
        self.assertIn("[code-gate] .claude/harness.json missing or invalid", err)
        self.assertFalse(self.pnpm_called())


if __name__ == "__main__":
    unittest.main()
