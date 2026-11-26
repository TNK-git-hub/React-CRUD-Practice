"""Tests for stop-gate.sh, run as a real subprocess in a throwaway git repo with a fake `pnpm` on PATH.

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

COPIED = (".claude/hooks/stop-gate.sh", ".specify/scripts/approval.py", ".specify/scripts/harness_config.py",
          ".claude/harness.json", approval.TEMPLATE)
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
# Fake pnpm: records that it ran, prints a few lines, exits with $FAKE_PNPM_EXIT
FAKE_PNPM = """#!/bin/sh
echo called >> "$FAKE_PNPM_MARKER"
echo "FAIL  backend/test/public/a.test.ts > ABC-001-S1"
echo "fake pnpm $*"
exit "${FAKE_PNPM_EXIT:-0}"
"""


class StopGateTest(unittest.TestCase):
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

    def run_gate(self, payload: dict | None = None, pnpm_exit: int = 1, **env: str) -> tuple[int, str]:
        e = {k: v for k, v in os.environ.items() if k != "SKIP_STOP_GATE"}
        e.update(CLAUDE_PROJECT_DIR=str(self.root), PATH=f"{self.bin}{os.pathsep}{e.get('PATH', '')}",
                 FAKE_PNPM_EXIT=str(pnpm_exit), FAKE_PNPM_MARKER=str(self.marker), **env)
        r = subprocess.run(["bash", str(self.root / ".claude/hooks/stop-gate.sh")], input=json.dumps(payload or {}),
                           cwd=self.root, env=e, capture_output=True, text=True)
        return r.returncode, r.stderr

    def pnpm_called(self) -> bool:
        return self.marker.exists()

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
        self.assertIn("pnpm test đang fail", err)
        self.assertIn("KHÔNG sửa, nới, skip hay xoá test để cho pass", err)
        self.assertIn("chờ người dùng quyết định", err)
        self.assertIn("FAIL  backend/test/public/a.test.ts > ABC-001-S1", err)

    def test_passing_tests(self) -> None:
        self.with_app()
        self.write("app.txt", "v2\n")
        code, _ = self.run_gate(pnpm_exit=0)
        self.assertEqual(code, 0)
        self.assertTrue(self.pnpm_called())

    # ---- bug flow: waiting for the root-cause approval ----
    def test_bug_without_root_cause_gate_skips_tests(self) -> None:
        self.with_app()
        self.bug_record()
        code, err = self.run_gate()
        self.assertEqual(code, 0)
        self.assertFalse(self.pnpm_called())
        self.assertIn(f"[stop-gate] bug {BUG} đang chờ người dùng duyệt root cause", err)

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
        self.assertNotIn("bỏ qua pnpm test", err)

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


if __name__ == "__main__":
    unittest.main()
