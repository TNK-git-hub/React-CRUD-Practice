"""Tests for next_change.py. Run: python -m unittest discover -s .specify/scripts"""

from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import next_change  # noqa: E402


def run(root: Path, *args: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = next_change.main(["--root", str(root), *args])
    return code, out.getvalue().strip(), err.getvalue().strip()


class NextChangeTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def mkdir(self, rel: str) -> None:
        (self.root / rel).mkdir(parents=True)

    def test_empty_repo_starts_at_001(self) -> None:
        self.assertEqual(run(self.root), (0, "001", ""))

    def test_scans_changes_and_archive(self) -> None:
        self.mkdir("specs/changes/002-a")
        self.mkdir("specs/archive/005-test")
        self.assertEqual(run(self.root)[1], "006")

    def test_ignores_files_and_non_change_dirs(self) -> None:
        self.mkdir("specs/changes/003-a")
        self.mkdir("specs/changes/notes")
        self.mkdir("specs/changes/12-short")
        self.mkdir("specs/archive/.gitkeep-dir")
        (self.root / "specs/archive/009-file.md").write_text("x")
        self.assertEqual(run(self.root)[1], "004")

    def test_ignores_dirs_directly_under_specs(self) -> None:
        # Core Spec Kit layout; must not affect numbering here.
        self.mkdir("specs/007-legacy")
        self.assertEqual(run(self.root)[1], "001")

    def test_gap_uses_max_plus_one(self) -> None:
        self.mkdir("specs/archive/001-a")
        self.mkdir("specs/archive/004-b")
        self.assertEqual(run(self.root)[1], "005")

    def test_name_and_json(self) -> None:
        self.mkdir("specs/archive/001-a")
        code, out, _ = run(self.root, "--name", "bulk-delete", "--json")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), {
            "FEATURE_NUM": "002",
            "CHANGE_NAME": "002-bulk-delete",
            "FEATURE_DIR": "specs/changes/002-bulk-delete",
        })
        self.assertEqual(run(self.root, "--name", "bulk-delete")[1], "002-bulk-delete")

    def test_rejects_bad_name(self) -> None:
        for bad in ("Bulk-Delete", "bulk_delete", "-x", "x-", "a--b", ""):
            code, out, err = run(self.root, f"--name={bad}")
            self.assertEqual(code, 1, bad)
            self.assertEqual(out, "")
            self.assertIn("kebab-case", err)

    def test_exhausted(self) -> None:
        self.mkdir("specs/archive/999-last")
        code, _, err = run(self.root)
        self.assertEqual(code, 1)
        self.assertIn("exhausted", err)


if __name__ == "__main__":
    unittest.main()
