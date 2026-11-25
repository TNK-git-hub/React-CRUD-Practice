"""Tests for spec_check.py. Run: python3 -m unittest discover -s .specify/scripts"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import approval  # noqa: E402
import spec_check  # noqa: E402

CHANGE = "001-product-bulk-delete"
CAT = "specs/capabilities/products/catalog/spec.md"
SPEC = """\
---
kind: capability
domain: "products"
feature: "catalog"
code: "PROD"
---

# Feature: products/catalog (PROD)

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

## Removed IDs

| ID | Feature | Removed in change | Reason | Replaced by |
| --- | --- | --- | --- |
{removed}
"""
TEST = 'test("PROD-001-S1 creates", () => {});\ntest("PROD-001-S2 denies staff", () => {});\n'

OPEN = "002-product-search"
DELTA = """\
---
kind: delta
change: "002-product-search"
capabilities: ["products/catalog"]
primary: "products/catalog"
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

### products/catalog

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
        self.write(CAT, SPEC)
        self.write("specs/capabilities/products/history.md", HISTORY.format(removed="| _(none yet)_ | | | | |"))
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
        self.write(CAT, SPEC.replace("### PROD-001", "### ADDED PROD-001"))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("delta keyword 'ADDED'", out)

    def test_delta_keyword_in_history_too(self) -> None:
        self.write("specs/capabilities/products/history.md",
                   HISTORY.format(removed="| PROD-009 | catalog | 000-old | ADDED by mistake | — |"))
        self.assertEqual(self.run_check()[0], 1)

    def test_duplicate_id(self) -> None:
        self.write("specs/capabilities/products/listing/spec.md", "## Requirements\n\n### PROD-001: Again\n")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("PROD-001 is defined 2 times", out)

    def test_removed_id_reused(self) -> None:
        self.write("specs/capabilities/products/history.md",
                   HISTORY.format(removed="| PROD-001 | catalog | 000-old | gone | — |"))
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
        self.write(CAT, SPEC.replace("`PROD-009-S1` -->", "`PROD-009-S1` ADDED -->"))
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

    # ---- self-contained spec and plan ----------------------------------------------

    def test_pointer_in_spec_rejected(self) -> None:
        code, out = self.spec_stage(DELTA.replace("The system MUST search products.",
                                                  "The system MUST search products, as for change 001."))
        self.assertEqual(code, 1)
        self.assertIn("'as for change 001' points elsewhere", out)

    def test_pointer_in_plan_rejected(self) -> None:
        self.open_change()
        self.write(f"specs/changes/{OPEN}/plan.md", "# Plan\n\nCaching: see research R2.\nSame as change 001 for the DTO.\n")
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn(f"specs/changes/{OPEN}/plan.md:3: 'research R2'", out)
        self.assertIn(f"specs/changes/{OPEN}/plan.md:4: 'Same as change 001'", out)

    def test_pointer_with_words_between_rejected(self) -> None:
        code, out = self.spec_stage(DELTA.replace("The system MUST search products.",
                                                  "The previous list stays visible, as for the price filter in change 001."))
        self.assertEqual(code, 1)
        self.assertIn("'as for the price filter in change 001' points elsewhere", out)

    def test_archive_reference_in_spec_rejected(self) -> None:
        code, out = self.spec_stage(DELTA.replace(
            "The system MUST search products.",
            "The previous list stays visible (specs/archive/001-products-price-range/spec.md, Assumptions)."))
        self.assertEqual(code, 1)
        self.assertIn(f"specs/changes/{OPEN}/spec.md:", out)
        self.assertIn("points into specs/archive/", out)
        self.assertIn("the capability is missing it", out)

    def test_archive_reference_in_plan_rejected(self) -> None:
        self.open_change()
        self.write(f"specs/changes/{OPEN}/plan.md", "# Plan\n\nDTO: see specs\\archive\\001-x\\spec.md, 001-ADR-1.\n")
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn(f"specs/changes/{OPEN}/plan.md:3: points into specs/archive/", out)

    def test_valid_sources_are_fine(self) -> None:
        delta = DELTA.replace(
            "The system MUST search products.",
            "The system MUST search products, following PROD-001 (capability products/catalog; "
            "specs/_system/nfr.md; backend/src/products/products.service.ts; docs/requirements/search.md).\n\n"
            "<!-- an archived change lives in specs/archive/<change>/ -->")
        code, out = self.spec_stage(delta)
        self.assertEqual(code, 0, out)

    def test_source_in_parentheses_and_comments_are_fine(self) -> None:
        delta = DELTA.replace("The system MUST search products.",
                              "The system MUST search products (change 001-products-price-range, clarify).\n\n"
                              "<!-- as for change 001: guide comment -->")
        code, out = self.spec_stage(delta)
        self.assertEqual(code, 0, out)

    # ---- features ----------------------------------------------------------------

    LISTING = "specs/capabilities/products/listing/spec.md"
    LISTING_SPEC = SPEC.replace('feature: "catalog"', 'feature: "listing"').replace(
        "### PROD-001: Create product", "### PROD-003: List products").replace("PROD-001-S", "PROD-003-S")
    MOVED = ("#### MOVED PROD-003: List products\n\n- **From:** listing\n- **To:** catalog\n"
             "- **Reason:** listing joins the catalog\n\n#### ADDED PROD-002")

    def with_listing(self) -> None:
        self.write(self.LISTING, self.LISTING_SPEC)
        self.write("tests/products/list.test.ts", 'test("PROD-003-S1 lists")\ntest("PROD-003-S2 denies")\n')

    def test_domain_level_spec_refused(self) -> None:
        self.write("specs/capabilities/products/spec.md", SPEC)
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("specs/capabilities/products/spec.md: a domain has no spec.md of its own", out)

    def test_id_unique_across_features_of_domain(self) -> None:
        self.write(self.LISTING, SPEC.replace('feature: "catalog"', 'feature: "listing"'))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("requirement PROD-001 is defined 2 times", out)
        self.assertIn("products/listing/spec.md", out)

    def test_moved_keyword_left_in_capabilities(self) -> None:
        self.write(CAT, SPEC.replace("### PROD-001", "### MOVED PROD-001"))
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("delta keyword 'MOVED'", out)

    def test_section_must_be_a_feature(self) -> None:
        code, out = self.spec_stage(DELTA.replace("### products/catalog\n", "### products\n"))
        self.assertEqual(code, 1)
        self.assertIn("section must be '### <domain>/<feature>', got '### products'", out)

    def test_capabilities_must_be_features(self) -> None:
        code, out = self.spec_stage(DELTA.replace('capabilities: ["products/catalog"]\nprimary: "products/catalog"',
                                                  'capabilities: ["products"]\nprimary: "products"'))
        self.assertEqual(code, 1)
        self.assertIn("capabilities must list features as '<domain>/<feature>'", out)

    def test_section_not_in_capabilities(self) -> None:
        code, out = self.spec_stage(DELTA.replace("### products/catalog\n", "### products/search\n"))
        self.assertEqual(code, 1)
        self.assertIn("feature 'products/catalog' is in capabilities but has no '### products/catalog' section", out)
        self.assertIn("section '### products/search' is not listed in capabilities", out)

    def test_new_feature_with_added_only_passes(self) -> None:
        new = DELTA.replace('"products/catalog"', '"products/search"').replace("### products/catalog\n",
                                                                               "### products/search\n")
        code, out = self.spec_stage(new)
        self.assertEqual(code, 0, out)

    def test_new_feature_cannot_modify(self) -> None:
        new = DELTA.replace('"products/catalog"', '"products/search"').replace(
            "### products/catalog\n", "### products/search\n").replace("#### ADDED PROD-002", "#### MODIFIED PROD-002")
        code, out = self.spec_stage(new)
        self.assertEqual(code, 1)
        self.assertIn("MODIFIED PROD-002: feature 'products/search' does not exist yet", out)

    def test_feature_must_be_in_features_table(self) -> None:
        self.write("specs/_system/domain-model.md",
                   "# Domain model\n\n## Features — domain products\n\n| Feature | Scope |\n| --- | --- |\n"
                   "| catalog | Create and list products |\n")
        self.assertEqual(self.spec_stage()[0], 0)
        new = DELTA.replace('"products/catalog"', '"products/search"').replace("### products/catalog\n",
                                                                               "### products/search\n")
        code, out = self.spec_stage(new)
        self.assertEqual(code, 1)
        self.assertIn("feature 'products/search' is not in the Features table", out)

    def test_unknown_domain(self) -> None:
        new = DELTA.replace('"products/catalog"', '"orders/checkout"').replace("### products/catalog\n",
                                                                              "### orders/checkout\n")
        code, out = self.spec_stage(new)
        self.assertEqual(code, 1)
        self.assertIn("domain folder specs/capabilities/orders/ does not exist", out)

    def test_modified_must_be_in_its_feature(self) -> None:
        self.with_listing()
        modified = DELTA.replace("#### ADDED PROD-002: Search products", "#### MODIFIED PROD-003: List products") \
            .replace("PROD-002", "PROD-003")
        code, out = self.spec_stage(modified)
        self.assertEqual(code, 1)
        self.assertIn("MODIFIED PROD-003 is in products/listing, not in its section's feature 'products/catalog'", out)

    def test_modified_unknown_id(self) -> None:
        modified = DELTA.replace("#### ADDED PROD-002", "#### MODIFIED PROD-002")
        code, out = self.spec_stage(modified)
        self.assertEqual(code, 1)
        self.assertIn("MODIFIED PROD-002 is not in specs/capabilities/", out)

    def test_moved_valid(self) -> None:
        self.with_listing()
        moved = DELTA.replace('["products/catalog"]', '["products/catalog", "products/listing"]') \
            .replace("#### ADDED PROD-002", self.MOVED)
        code, out = self.spec_stage(moved)
        self.assertEqual(code, 0, out)

    def test_moved_then_modified_in_target_feature(self) -> None:
        self.with_listing()
        modified = ("#### MODIFIED PROD-003: List products\n\nThe system MUST list.\n\n**Scenarios:**\n\n"
                    "- `PROD-003-S1` (happy, P1)\n  - **Given** a\n  - **When** b\n  - **Then** c\n\n#### ADDED PROD-002")
        moved = DELTA.replace('["products/catalog"]', '["products/catalog", "products/listing"]') \
            .replace("#### ADDED PROD-002", self.MOVED.replace("#### ADDED PROD-002", modified)) \
            .replace("| PROD-002 | S1–S2 |", "| PROD-002 | S1–S2 |\n| PROD-003 | S1 |")
        code, out = self.spec_stage(moved)
        self.assertEqual(code, 0, out)

    def test_moved_from_must_be_declared(self) -> None:
        self.with_listing()
        code, out = self.spec_stage(DELTA.replace("#### ADDED PROD-002", self.MOVED))
        self.assertEqual(code, 1)
        self.assertIn("MOVED PROD-003: From feature 'products/listing' must be listed in capabilities", out)

    def test_moved_to_must_be_its_section(self) -> None:
        self.with_listing()
        moved = DELTA.replace('["products/catalog"]', '["products/catalog", "products/listing"]') \
            .replace("#### ADDED PROD-002", self.MOVED.replace("- **To:** catalog", "- **To:** search"))
        code, out = self.spec_stage(moved)
        self.assertEqual(code, 1)
        self.assertIn("To 'products/search' must be the feature of its section 'products/catalog'", out)

    def test_moved_id_not_in_from(self) -> None:
        self.with_listing()
        moved = DELTA.replace('["products/catalog"]', '["products/catalog", "products/listing"]') \
            .replace("#### ADDED PROD-002", self.MOVED.replace("MOVED PROD-003", "MOVED PROD-001"))
        code, out = self.spec_stage(moved)
        self.assertEqual(code, 1)
        self.assertIn("MOVED PROD-001: is in products/catalog, not in its From feature 'products/listing'", out)

    def test_moved_needs_from_and_to(self) -> None:
        self.with_listing()
        moved = DELTA.replace('["products/catalog"]', '["products/catalog", "products/listing"]') \
            .replace("#### ADDED PROD-002", self.MOVED.replace("- **From:** listing\n", ""))
        code, out = self.spec_stage(moved)
        self.assertEqual(code, 1)
        self.assertIn("MOVED PROD-003 needs '- **From:** <feature>' and '- **To:** <feature>'", out)


    # ---- 5b. approvals (approval.py) of open changes ----
    def approve(self, gate: str) -> None:
        """The user's terminal: a fake TTY that answers y."""
        class TTY(io.StringIO):
            def isatty(self) -> bool:
                return True
        with mock.patch.object(sys, "stdin", TTY("y\n")), mock.patch.object(sys, "stdout", TTY()):
            code = approval.main(["approve", "--change", OPEN, "--gate", gate, "--root", str(self.root)])
        self.assertEqual(code, 0)

    def add_plan(self) -> None:
        self.write(f"specs/changes/{OPEN}/plan.md", "# Plan\n\n## Test Strategy\n\nVitest.\n")
        self.write(f"specs/changes/{OPEN}/tasks.md", "# Tasks\n\n- [ ] T001 Search. Scenarios: PROD-002-S1, PROD-002-S2\n")

    def test_approved_status_needs_spec_gate(self) -> None:
        code, out = self.spec_stage(DELTA.replace("status: draft", "status: approved"))
        self.assertEqual(code, 1)
        self.assertIn(f"specs/changes/{OPEN}/spec.md: status is approved but gate spec is not approved", out)
        self.assertIn(f"approval.py approve --change {OPEN} --gate spec", out)

    def test_implementing_status_needs_spec_gate(self) -> None:
        code, out = self.spec_stage(DELTA.replace("status: draft", "status: implementing"))
        self.assertEqual(code, 1)
        self.assertIn(f"specs/changes/{OPEN}/spec.md: status is implementing but gate spec is not approved", out)

    def test_unknown_status_needs_spec_gate(self) -> None:
        code, out = self.spec_stage(DELTA.replace("status: draft", "status: review"))
        self.assertEqual(code, 1)
        self.assertIn("status is review but gate spec is not approved", out)

    def test_implementing_after_approval_passes(self) -> None:
        self.open_change()
        self.approve("spec")
        path = self.root / f"specs/changes/{OPEN}/spec.md"
        path.write_text(path.read_text().replace("status: approved", "status: implementing"))
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 0, out)

    def test_draft_status_needs_no_spec_gate(self) -> None:
        code, out = self.spec_stage()
        self.assertEqual(code, 0, out)

    def test_approved_spec_gate_passes(self) -> None:
        self.open_change()
        self.approve("spec")
        self.assertIn("status: approved", (self.root / f"specs/changes/{OPEN}/spec.md").read_text())
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 0, out)

    def test_spec_changed_after_approval(self) -> None:
        self.open_change()
        self.approve("spec")
        path = self.root / f"specs/changes/{OPEN}/spec.md"
        path.write_text(path.read_text().replace("**Then** HTTP 400", "**Then** HTTP 422"))
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn("status is approved but gate spec changed since approval", out)

    def test_plan_and_tasks_need_plan_gate(self) -> None:
        self.open_change()
        self.approve("spec")
        self.add_plan()
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn("plan.md and tasks.md exist but gate plan is not approved", out)
        self.approve("plan")
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 0, out)

    def test_plan_changed_after_approval(self) -> None:
        self.open_change()
        self.approve("spec")
        self.add_plan()
        self.approve("plan")
        self.write(f"specs/changes/{OPEN}/plan.md", "# Plan\n\n## Test Strategy\n\nJest.\n")
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 1)
        self.assertIn("gate plan changed since approval", out)
        self.assertNotIn("gate spec", out)

    def test_plan_without_tasks_needs_no_plan_gate(self) -> None:
        self.open_change()
        self.write(f"specs/changes/{OPEN}/plan.md", "# Plan\n")
        code, out = self.run_check(OPEN, stage="spec")
        self.assertEqual(code, 0, out)

    def test_archive_is_not_checked_for_approvals(self) -> None:
        self.write("specs/archive/000-old/spec.md", "---\nkind: delta\nstatus: approved\n---\n")
        self.write("specs/archive/000-old/plan.md", "x")
        self.write("specs/archive/000-old/tasks.md", "x")
        code, out = self.run_check(stage="spec")
        self.assertEqual(code, 0, out)

    def test_approval_error_as_github_annotation(self) -> None:
        with mock.patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}):
            code, out = self.spec_stage(DELTA.replace("status: draft", "status: approved"))
        self.assertEqual(code, 1)
        self.assertIn("::error title=spec-check::specs/changes/002-product-search/spec.md: status is approved", out)


if __name__ == "__main__":
    unittest.main()
