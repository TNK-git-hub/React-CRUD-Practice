"""Tests for spec_check.py. Run: python3 -m unittest discover -s .specify/scripts"""

from __future__ import annotations

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spec_check  # noqa: E402

CHANGE = "001-product-bulk-delete"
SPEC = """\
---
kind: capability
domain: "products"
code: "PROD"
---

# Capability: products (PROD)

## Requirements

### PROD-001: Create product

The system MUST create products.

- **Scenarios:**
  - `PROD-001-S1` (happy) [P1] — **Given** … **When** … **Then** …
  - `PROD-001-S2` (permission) [P1] — **Given** … **When** … **Then** …
- **Source:** change 001-product-bulk-delete

<!-- Shape: ### [CODE]-001 … `PROD-009-S1` -->
"""
HISTORY = """\
# History: products (PROD)

## Merged changes

| Change | Date | Change in this domain |
| --- | --- | --- |
| 001-product-bulk-delete | 2026-11-16 | new PROD-001 |

## Removed IDs

| ID | Removed in change | Reason | Replaced by |
| --- | --- | --- | --- |
{removed}
"""
TEST = 'test("PROD-001-S1 creates", () => {});\ntest("PROD-001-S2 denies staff", () => {});\n'


class SpecCheckTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.write("specs/capabilities/products/spec.md", SPEC)
        self.write("specs/capabilities/products/history.md", HISTORY.format(removed="| _(none yet)_ | | | |"))
        self.write(f"specs/archive/{CHANGE}/spec.md", "---\nkind: delta\n---\n#### ADDED PROD-001: x\n")
        self.write("tests/products/create.test.ts", TEST)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, rel: str, text: str) -> None:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def run_check(self, change: str = CHANGE) -> tuple[int, str]:
        out = io.StringIO()
        with redirect_stdout(out):
            code = spec_check.main(["--root", str(self.root), "--change", change])
        return code, out.getvalue()

    def test_all_good(self) -> None:
        code, out = self.run_check()
        self.assertEqual(code, 0, out)
        self.assertIn("spec_check: OK", out)

    def test_pr_a_not_archived(self) -> None:
        self.write(f"specs/changes/{CHANGE}/spec.md", "x")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn(f"specs/changes/{CHANGE}/ still exists", out)

    def test_archive_missing(self) -> None:
        code, out = self.run_check("002-other")
        self.assertEqual(code, 1)
        self.assertIn("specs/archive/002-other/ does not exist", out)

    def test_pr_b_missing_test(self) -> None:
        self.write("tests/products/create.test.ts", 'test("PROD-001-S1 creates", () => {});\n')
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("scenario PROD-001-S2", out)
        self.assertNotIn("PROD-001-S1 (", out)

    def test_pr_c_delta_keyword_left(self) -> None:
        self.write("specs/capabilities/products/spec.md", SPEC.replace("### PROD-001", "### ADDED PROD-001"))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("delta keyword 'ADDED'", out)

    def test_delta_keyword_in_history_too(self) -> None:
        self.write("specs/capabilities/products/history.md",
                   HISTORY.format(removed="| _(none yet)_ | | | |").replace("new PROD-001", "ADDED PROD-001"))
        self.assertEqual(self.run_check()[0], 1)

    def test_duplicate_id(self) -> None:
        self.write("specs/capabilities/other/spec.md", "## Requirements\n\n### PROD-001: Again\n")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("PROD-001 is defined 2 times", out)

    def test_removed_id_reused(self) -> None:
        self.write("specs/capabilities/products/history.md",
                   HISTORY.format(removed="| PROD-001 | 000-old | gone | — |"))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("reuses an ID removed", out)

    def test_s1_not_satisfied_by_s10(self) -> None:
        self.write("tests/products/create.test.ts", 'test("PROD-001-S10 x")\ntest("PROD-001-S2 y")\n')
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("scenario PROD-001-S1 ", out)

    def test_comments_are_ignored(self) -> None:
        # a scenario ID inside an HTML comment (template sample) needs no test
        code, out = self.run_check()
        self.assertEqual(code, 0, out)
        self.assertNotIn("PROD-009-S1", out)

    def test_delta_keyword_in_comment_still_fails(self) -> None:
        self.write("specs/capabilities/products/spec.md", SPEC.replace("`PROD-009-S1` -->", "`PROD-009-S1` ADDED -->"))
        self.assertEqual(self.run_check()[0], 1)

    def test_non_change_branch_skips_archive_checks(self) -> None:
        self.write(f"specs/changes/{CHANGE}/spec.md", "x")
        code, out = self.run_check("harness/day6-ci")
        self.assertEqual(code, 0, out)
        self.assertIn("checks 3-5 only", out)

    def test_empty_harness_passes(self) -> None:
        empty = tempfile.TemporaryDirectory()
        self.addCleanup(empty.cleanup)
        out = io.StringIO()
        with redirect_stdout(out):
            code = spec_check.main(["--root", empty.name, "--change", "harness/x"])
        self.assertEqual(code, 0, out.getvalue())

    def test_no_tests_dir(self) -> None:
        import shutil
        shutil.rmtree(self.root / "tests")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("PROD-001-S1", out)


if __name__ == "__main__":
    unittest.main()
