"""Tests for private_tests.py (functions called directly; the CLI only for its TTY refusal).

Run: python3 -m unittest discover -s .specify/scripts
"""

from __future__ import annotations

import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import private_tests as pt  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CHANGE = "004-sim"
DELTA = """\
---
kind: delta
change: "004-sim"
status: approved
---

## Requirements

### things/core

#### MODIFIED ABC-002: Search things

#### REMOVED ABC-005: Export things

#### RENAMED ABC-008: Old name

#### MOVED ABC-009: Moved

#### ADDED ABC-010: New thing

```markdown
#### REMOVED ABC-011: inside a code sample, ignored
```
<!-- #### MODIFIED ABC-012: in a comment, ignored -->
"""
BE = "backend/test/" + "private"
FE = "frontend/test/" + "private"
FILES = {
    f"{BE}/{CHANGE}/ABC-002.test.ts": "it('ABC-002-S1 finds', () => {});\n",
    f"{BE}/{CHANGE}/ABC-005.test.ts": "describe('ABC-005-S1 exports', () => { it('works', () => {}); });\n",
    f"{BE}/{CHANGE}/ABC-007.test.ts": "it('ABC-007-S1 other', () => {});\n",
    f"{BE}/{CHANGE}/mixed.test.ts": "it('ABC-002-S2 x', () => {});\nit(\"ABC-007-S2 y\", () => {});\n",
    f"{BE}/003-old/ABC-008.test.ts": "it('ABC-008-S1 renamed only', () => {});\n",
    f"{FE}/003-old/ABC-009.test.tsx": "test(`ABC-009-S1 moved only`, () => {});\n",
    f"{FE}/{CHANGE}/ABC-002-2.test.tsx": "it('no scenario in the name', () => {});\n",
    f"{FE}/{CHANGE}/helper.ts": "export const ABC_005 = 'not a test file';\n",
    f"{BE}/_stale/002-x/ABC-005.test.ts": "it('ABC-005-S9 already quarantined', () => {});\n",
}


class PrivateTestsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / ".claude").mkdir()
        shutil.copy(REPO / ".claude/harness.json", self.root / ".claude/harness.json")
        self.write(f"specs/changes/{CHANGE}/spec.md", DELTA)
        for rel, text in FILES.items():
            self.write(rel, text)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, rel: str, text: str) -> None:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def states(self) -> dict[str, tuple[str, list[str]]]:
        return {e.path: (e.state, e.reqs) for e in pt.classify(self.root, CHANGE)}

    # ---- parsing ----
    def test_delta_ids_modified_and_removed_only(self) -> None:
        ids = pt.delta_ids(self.root, CHANGE)
        self.assertEqual(ids, {"MODIFIED": {"ABC-002"}, "REMOVED": {"ABC-005"}})

    def test_archived_change_is_read_too(self) -> None:
        (self.root / f"specs/changes/{CHANGE}/spec.md").unlink()
        self.write(f"specs/archive/{CHANGE}/spec.md", DELTA)
        self.assertEqual(pt.delta_ids(self.root, CHANGE)["REMOVED"], {"ABC-005"})

    def test_unknown_change_is_a_clear_error(self) -> None:
        with self.assertRaises(pt.PrivateTestsError) as ctx:
            pt.classify(self.root, "009-nope")
        self.assertIn("change 009-nope not found", str(ctx.exception))
        with self.assertRaises(pt.PrivateTestsError):
            pt.classify(self.root, "not-a-change")

    # ---- classification ----
    def test_four_states(self) -> None:
        s = self.states()
        self.assertEqual(s[f"{BE}/{CHANGE}/ABC-002.test.ts"], ("modified", ["ABC-002"]))
        self.assertEqual(s[f"{BE}/{CHANGE}/ABC-005.test.ts"], ("removed", ["ABC-005"]))
        self.assertEqual(s[f"{BE}/{CHANGE}/ABC-007.test.ts"], ("unaffected", ["ABC-007"]))
        self.assertEqual(s[f"{BE}/{CHANGE}/mixed.test.ts"], ("mixed", ["ABC-002", "ABC-007"]))

    def test_req_id_from_the_file_name(self) -> None:
        self.assertEqual(self.states()[f"{FE}/{CHANGE}/ABC-002-2.test.tsx"], ("modified", ["ABC-002"]))

    def test_renamed_and_moved_do_not_count(self) -> None:
        s = self.states()
        self.assertEqual(s[f"{BE}/003-old/ABC-008.test.ts"][0], "unaffected")
        self.assertEqual(s[f"{FE}/003-old/ABC-009.test.tsx"][0], "unaffected")

    def test_stale_folder_and_non_test_files_are_skipped(self) -> None:
        paths = set(self.states())
        self.assertFalse(any("/_stale/" in p for p in paths))
        self.assertNotIn(f"{FE}/{CHANGE}/helper.ts", paths)
        self.assertEqual(len(paths), 7)

    def test_related_count(self) -> None:
        self.assertEqual(pt.related_count(self.root, CHANGE), 4)  # modified x2, removed, mixed

    # ---- quarantine / restore ----
    def test_quarantine_removed_moves_and_writes_the_manifest(self) -> None:
        moved = pt.quarantine(self.root, CHANGE, "removed", now="2026-11-26T00:00:00+00:00")
        self.assertEqual([e.path for e in moved], [f"{BE}/{CHANGE}/ABC-005.test.ts"])
        self.assertFalse((self.root / f"{BE}/{CHANGE}/ABC-005.test.ts").exists())
        dst = self.root / f"{BE}/_stale/{CHANGE}/{CHANGE}/ABC-005.test.ts"
        self.assertEqual(dst.read_text(), FILES[f"{BE}/{CHANGE}/ABC-005.test.ts"])  # moved, not rewritten
        manifest = (self.root / f"{BE}/_stale/{CHANGE}/MANIFEST.txt").read_text().splitlines()
        self.assertTrue(manifest[0].startswith("#"))
        self.assertEqual(manifest[1], f"{BE}/{CHANGE}/ABC-005.test.ts\tremoved\tABC-005\t2026-11-26T00:00:00+00:00")
        self.assertNotIn(f"{BE}/{CHANGE}/ABC-005.test.ts", self.states())  # _stale is skipped from now on

    def test_quarantine_all_takes_mixed_too_and_appends(self) -> None:
        pt.quarantine(self.root, CHANGE, "removed")
        moved = pt.quarantine(self.root, CHANGE, "all")
        self.assertEqual(sorted(e.state for e in moved), ["mixed", "modified", "modified"])
        lines = [l for l in (self.root / f"{BE}/_stale/{CHANGE}/MANIFEST.txt").read_text().splitlines() if not l.startswith("#")]
        self.assertEqual(len(lines), 3)  # ABC-005 (removed) + ABC-002 + mixed in backend; the frontend file has its own
        self.assertTrue((self.root / f"{FE}/_stale/{CHANGE}/MANIFEST.txt").is_file())

    def test_restore_moves_back_and_cleans_up(self) -> None:
        pt.quarantine(self.root, CHANGE, "all")
        restored = pt.restore(self.root, CHANGE)
        self.assertEqual(len(restored), 4)
        for rel in (f"{BE}/{CHANGE}/ABC-002.test.ts", f"{BE}/{CHANGE}/ABC-005.test.ts", f"{BE}/{CHANGE}/mixed.test.ts",
                    f"{FE}/{CHANGE}/ABC-002-2.test.tsx"):
            self.assertEqual((self.root / rel).read_text(), FILES[rel])
        self.assertFalse((self.root / f"{BE}/_stale/{CHANGE}").exists())
        self.assertTrue((self.root / f"{BE}/_stale/002-x/ABC-005.test.ts").is_file())  # other quarantines untouched

    def test_restore_never_overwrites(self) -> None:
        pt.quarantine(self.root, CHANGE, "removed")
        self.write(f"{BE}/{CHANGE}/ABC-005.test.ts", "new file written since\n")
        with self.assertRaises(pt.PrivateTestsError) as ctx:
            pt.restore(self.root, CHANGE)
        self.assertIn("already exists: not overwriting it", str(ctx.exception))
        self.assertEqual((self.root / f"{BE}/{CHANGE}/ABC-005.test.ts").read_text(), "new file written since\n")
        self.assertTrue((self.root / f"{BE}/_stale/{CHANGE}/{CHANGE}/ABC-005.test.ts").is_file())

    def test_restore_without_quarantine_is_an_error(self) -> None:
        with self.assertRaises(pt.PrivateTestsError):
            pt.restore(self.root, CHANGE)

    # ---- CLI ----
    def test_cli_refuses_without_a_terminal(self) -> None:
        for argv in (["stale", "--change", CHANGE], ["quarantine", "--change", CHANGE, "--kind", "all"],
                     ["restore", "--change", CHANGE]):
            err = io.StringIO()
            with mock.patch.object(sys, "stdin", io.StringIO("y\n")), redirect_stdout(io.StringIO()), redirect_stderr(err):
                code = pt.main([*argv, "--root", str(self.root)])
            self.assertEqual(code, 2, argv)
            self.assertIn("must be a terminal", err.getvalue())
        self.assertTrue((self.root / f"{BE}/{CHANGE}/ABC-005.test.ts").is_file())  # nothing moved


if __name__ == "__main__":
    unittest.main()
