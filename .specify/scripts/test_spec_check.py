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

OPEN = "002-product-search"
DELTA = """\
---
kind: delta
change: "002-product-search"
capabilities: ["products"]
primary: "products"
status: draft
source: ["fixture"]
---

# Change 002: Product search

## Overview

### Context

Fixture.

## Success Criteria

- **SC-001:** fixture

## Scope

### In Scope

- search

### Out of Scope

- nothing

## Requirements

### products

#### ADDED PROD-002: Search products

The system MUST search products.

```json
{ "q": "`PROD-009-S1` inside a code sample is ignored" }
```

**Permissions:** anyone

**Scenarios:**

- `PROD-002-S1` (happy, P1)
  - **Given** products
  - **When** the user searches
  - **Then** HTTP 200
- `PROD-002-S2` (input, P2)
  - **Given** products
  - **When** the user searches "x"
  - **Then** HTTP 400; `message` contains "bad"
  - → Recovery: fix the query
  - Covers: PROD-001

## Non-Functional Requirements

| ID | Change | Category | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | Applies | Performance | List fast | ≤ 1 s | fixture | SC-001 |
| NFR-041 | ADDED | User environment | Search box has a label | — | change 002 | PROD-002-S1 |

## Edge Cases & Error Handling

| Situation | Decision | Scenario |
| --- | --- | --- |
| Bad query | 400 | PROD-002-S2 |

## Architecture Decisions

_(Architecture Decisions: filled by /speckit-plan)_

## Data Model

_(Data Model: filled by /speckit-plan)_

## Clarifications

## Assumptions

- fixture

## Open Questions

## Traceability

| Requirement | Scenarios |
| --- | --- |
| PROD-002 | S1–S2 |

| NFR | Verified by |
| --- | --- |
| NFR-001 | SC-001 |
| NFR-041 | PROD-002-S1 |
"""
NFR = """\
# NFR

## Performance

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | List fast | ≤ 1 s | fixture | SC-001 |

## User environment

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-040 | Vietnamese UI | fixture | Review |
"""
CATALOG = """\
# Catalog

### Scenario types (in parentheses after the ID)

`happy` · `input` · `boundary`

Example: x
"""


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

    def run_check(self, change: str = CHANGE, stage: str | None = "archive") -> tuple[int, str]:
        out = io.StringIO()
        args = ["--root", str(self.root), "--change", change] + (["--stage", stage] if stage else [])
        with redirect_stdout(out):
            code = spec_check.main(args)
        return code, out.getvalue()

    def open_change(self, delta: str = DELTA) -> None:
        self.write("specs/_system/nfr.md", NFR)
        self.write("specs/_system/edge-case-catalog.md", CATALOG)
        self.write(f"specs/changes/{OPEN}/spec.md", delta)

    def spec_stage(self, delta: str = DELTA) -> tuple[int, str]:
        self.open_change(delta)
        return self.run_check(OPEN, stage="spec")

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
        self.open_change()
        code, out = self.run_check("harness/day6-ci")
        self.assertEqual(code, 0, out)
        self.assertIn("non-change branch, stage archive", out)

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


    # ---- --stage spec --------------------------------------------------------------

    def test_spec_stage_passes_and_needs_no_tests(self) -> None:
        import shutil
        shutil.rmtree(self.root / "tests")
        code, out = self.spec_stage()
        self.assertEqual(code, 0, out)
        self.assertIn("stage spec", out)

    def test_default_stage_is_spec(self) -> None:
        self.open_change()
        code, out = self.run_check(OPEN, stage=None)
        self.assertEqual(code, 0, out)
        self.assertIn("stage spec", out)

    def test_archive_stage_also_checks_open_changes(self) -> None:
        self.open_change(DELTA.replace("## Data Model\n", "## Data model\n"))
        code, out = self.run_check("harness/x", stage="archive")
        self.assertEqual(code, 1)
        self.assertIn("section '## Data Model' is missing", out)

    def test_missing_section(self) -> None:
        code, out = self.spec_stage(DELTA.replace("## Open Questions\n", ""))
        self.assertEqual(code, 1)
        self.assertIn("section '## Open Questions' is missing", out)

    def test_sections_out_of_order(self) -> None:
        moved = DELTA.replace("## Assumptions\n\n- fixture\n\n", "").replace(
            "## Overview\n", "## Assumptions\n\n- fixture\n\n## Overview\n")
        code, out = self.spec_stage(moved)
        self.assertEqual(code, 1)
        self.assertIn("not in template order", out)

    def test_unassigned_left(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| Bad query | 400 | PROD-002-S2 |",
                                                  "| Bad query | 400 | PROD-002-S2 |\n| Empty query | ? | _(unassigned)_ |"))
        self.assertEqual(code, 1)
        self.assertIn("'(unassigned)' left", out)

    def test_scenario_missing_from_traceability(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| PROD-002 | S1–S2 |", "| PROD-002 | S1 |"))
        self.assertEqual(code, 1)
        self.assertIn("scenario PROD-002-S2 is not listed in ## Traceability", out)

    def test_traceability_lists_unknown_scenario(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| PROD-002 | S1–S2 |", "| PROD-002 | S1–S3 |"))
        self.assertEqual(code, 1)
        self.assertIn("lists PROD-002-S3, which is not a scenario", out)

    def test_nfr_row_missing_from_traceability(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| NFR-041 | PROD-002-S1 |\n", ""))
        self.assertEqual(code, 1)
        self.assertIn("NFR-041 is not listed in ## Traceability", out)

    def test_old_scenario_format_rejected(self) -> None:
        old = DELTA.replace("- `PROD-002-S1` (happy, P1)\n  - **Given** products\n  - **When** the user searches\n"
                            "  - **Then** HTTP 200\n", "- `PROD-002-S1` (happy) [P1] — **Given** a **When** b **Then** c\n")
        code, out = self.spec_stage(old)
        self.assertEqual(code, 1)
        self.assertIn("scenario line must read", out)

    def test_scenario_without_then(self) -> None:
        code, out = self.spec_stage(DELTA.replace("  - **Then** HTTP 200\n", ""))
        self.assertEqual(code, 1)
        self.assertIn("scenario PROD-002-S1 has no **Then**", out)

    def test_unknown_scenario_type(self) -> None:
        code, out = self.spec_stage(DELTA.replace("(input, P2)", "(weird, P2)"))
        self.assertEqual(code, 1)
        self.assertIn("unknown type 'weird'", out)

    def test_other_requirement_scenario_in_backticks(self) -> None:
        code, out = self.spec_stage(DELTA.replace("  - Covers: PROD-001", "  - Covers: `PROD-001-S1`"))
        self.assertEqual(code, 1)
        self.assertIn("scenario ID PROD-001-S1 of another requirement", out)

    def test_added_requirement_already_exists(self) -> None:
        dup = DELTA.replace("PROD-002", "PROD-001")
        code, out = self.spec_stage(dup)
        self.assertEqual(code, 1)
        self.assertIn("ADDED PROD-001 already exists", out)

    def test_two_changes_add_same_id(self) -> None:
        self.open_change()
        self.write("specs/changes/003-product-filter/spec.md",
                   DELTA.replace('change: "002-product-search"', 'change: "003-product-filter"'))
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn("ADDED PROD-002 is also added by", out)
        self.assertIn("ADDED NFR-041 is also added by", out)

    def test_nfr_added_already_in_nfr_md(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| NFR-041 | ADDED |", "| NFR-040 | ADDED |")
                                    .replace("| NFR-041 | PROD-002-S1 |", "| NFR-040 | PROD-002-S1 |"))
        self.assertEqual(code, 1)
        self.assertIn("ADDED NFR-040 already exists in nfr.md", out)

    def test_nfr_bad_change_value(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| NFR-041 | ADDED |", "| NFR-041 | NEW |"))
        self.assertEqual(code, 1)
        self.assertIn("NFR-041 Change must be one of", out)

    def test_nfr_unknown_category(self) -> None:
        code, out = self.spec_stage(DELTA.replace("| ADDED | User environment |", "| ADDED | Usability |"))
        self.assertEqual(code, 1)
        self.assertIn("Category 'Usability' is not a section of nfr.md", out)

    def test_nfr_duplicate_in_nfr_md(self) -> None:
        self.open_change()
        self.write("specs/_system/nfr.md", NFR + "| NFR-001 | again | x | Review |\n")
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn("NFR-001 is defined 2 times", out)

    def test_plan_placeholder_once_is_fine_and_filled_is_fine(self) -> None:
        self.assertEqual(self.spec_stage()[0], 0)
        filled = DELTA.replace("_(Architecture Decisions: filled by /speckit-plan)_", "### 002-ADR-1: Search index")
        self.assertEqual(self.spec_stage(filled)[0], 0)

    def test_plan_placeholder_twice(self) -> None:
        twice = DELTA.replace("## Clarifications\n",
                              "<!-- keep _(Data Model: filled by /speckit-plan)_ here -->\n\n## Clarifications\n")
        code, out = self.spec_stage(twice)
        self.assertEqual(code, 1)
        self.assertIn("placeholder '_(Data Model: filled by /speckit-plan)_' appears 2 times", out)
        self.assertNotIn("Architecture Decisions: filled by /speckit-plan)_' appears", out)

    def test_delta_keyword_in_nfr_md(self) -> None:
        self.open_change()
        self.write("specs/_system/nfr.md", NFR.replace("Vietnamese UI", "ADDED Vietnamese UI"))
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn("specs/_system/nfr.md:", out)
        self.assertIn("delta keyword 'ADDED'", out)


if __name__ == "__main__":
    unittest.main()
