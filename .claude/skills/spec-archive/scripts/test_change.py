"""Tests for change.py. Run: python -m unittest discover -s .claude/skills/spec-archive/scripts"""

from __future__ import annotations

import io
import json
import sys
import tempfile
import textwrap
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import change  # noqa: E402

CHANGE = "099-archive-test"


def feature_spec(domain: str, feature: str, code: str, requirements: str, merged: str = "| _(none yet)_ | | |") -> str:
    return f"""\
---
kind: capability
domain: "{domain}"
feature: "{feature}"
code: "{code}"
---

# Feature: {domain}/{feature} ({code})

## Overview

Fixture feature {feature}.

Domain files: [states.md](../states.md) · [rules.md](../rules.md) · [history.md](../history.md)

## Requirements

{requirements}

<!-- Shape of one requirement after archive:

### [CODE]-001: [Requirement name]
-->

## Merged changes

| Change | Date | Change in this feature |
| --- | --- | --- |
{merged}
"""


CATALOG_REQS = """\
### PROD-001: Create product

The system MUST let a stock manager create a product.

- **Permissions:** stock manager
- **Scenarios:**
  - `PROD-001-S1` (happy) [P1] — **Given** … **When** … **Then** …
- **Source:** change 001-products-skeleton

### PROD-003: Delete product

The system MUST let a stock manager delete one product.

- **Permissions:** stock manager
- **Scenarios:**
  - `PROD-003-S1` (happy) [P1] — **Given** old **When** old **Then** old
  - `PROD-003-S2` (permission) [P1] — **Given** old2 **When** old2 **Then** old2
- **Source:** change 002-product-delete"""

LISTING_REQS = """\
### PROD-002: List products

The system MUST list products.

- **Permissions:** stock manager, staff
- **Scenarios:**
  - `PROD-002-S1` (happy) [P1] — **Given** … **When** … **Then** …
- **Source:** change 001-products-skeleton"""

HISTORY = """\
# History: {d} ({code})

## Removed IDs

| ID | Feature | Removed in change | Reason | Replaced by |
| --- | --- | --- | --- | --- |
{removed}
"""

DOMAIN_MODEL = """\
# Domain model — fixture

## Features — domain products

| Feature | Scope |
| --- | --- |
| catalog | Create, edit and delete products |
| listing | List, search, sort and page products |
| search | Full-text product search |

## Features — domain users

| Feature | Scope |
| --- | --- |
| accounts | Staff accounts |
"""

DELTA = """\
---
kind: delta
change: "099-archive-test"
capabilities: ["products/catalog", "products/listing", "users/accounts"]
primary: "products/catalog"
status: draft            # draft | approved | implementing | archived
source: ["fixture"]
---

# Change 099: Archive test

## Overview

Fixture.

## Requirements

### products/catalog

#### MODIFIED PROD-003: Delete product

The system MUST let a stock manager delete one product after confirming.

**API.** `DELETE /products/:id` answers:

| Status | When |
| --- | --- |
| 204 | deleted |

**Permissions:** stock manager

**Scenarios:**

- `PROD-003-S1` (happy, P1)
  - **Given** new
  - **When** new
  - **Then** new

#### ADDED PROD-004: Bulk delete

The system MUST let a stock manager delete up to 50 products at once.

```json
{ "deleted": 50 }
```

**Permissions:** stock manager

**Scenarios:**

- `PROD-004-S1` (happy, P1)
  - **Given** …
  - **When** …
  - **Then** …
- `PROD-004-S2` (boundary, P2)
  - **Given** …
  - **When** …
  - **Then** …
  - → Recovery: …
  - Covers: PROD-003

### products/listing

#### REMOVED PROD-002: List products

- **Reason:** replaced by search
- **Migration:** none

### users/accounts

#### ADDED USER-001: Create staff account

The system MUST let an admin create a staff account.

**Permissions:** admin

**Scenarios:**

- `USER-001-S1` (happy, P1)
  - **Given** …
  - **When** …
  - **Then** …

## Non-Functional Requirements

| ID | Change | Category | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | MODIFIED | Performance | List and bulk delete respond fast | ≤ 1 second with 500 products | change 099-archive-test | PROD-004-S1 |
| NFR-002 | Applies | Performance | (text in the change is ignored) | — | — | Review |
| NFR-041 | ADDED | User environment | The bulk delete dialog has a visible label | — | change 099-archive-test | PROD-004-S2 |

## Edge Cases & Error Handling

| Situation | Decision | Scenario |
| --- | --- | --- |
| 50 products at once | Allowed | PROD-004-S2 |

## Architecture Decisions

### 099-ADR-1: Bulk delete in one transaction

**Status:** Accepted.

## Data Model

No data change: fixture.

## Clarifications

## Assumptions

- fixture

## Traceability

| Requirement | Scenarios |
| --- | --- |
| PROD-003 | S1; also PROD-004-S2 (Covers) |
| PROD-004 | S1–S2 |
| USER-001 | S1 |

## Success Criteria

- **SC-001:** fixture
"""

REMOVED_LISTING = """#### REMOVED PROD-002: List products

- **Reason:** replaced by search
- **Migration:** none"""

NFR = """\
# Non-functional requirements — fixture

## Performance

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | List responds fast | ≤ 1 second | fixture | SC-001 |
| NFR-002 | Cache lives 30 s | 30 s | fixture | Review |

## Security and permissions

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-010 | Permission checks in the backend | constitution | Review |

### Permission matrix

| Action \\ Role | admin |
| --- | --- |
| delete | ✓ |

## User environment

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-040 | Vietnamese UI | fixture | Review |
"""

CATALOG = "specs/capabilities/products/catalog/spec.md"
LISTING = "specs/capabilities/products/listing/spec.md"
ACCOUNTS = "specs/capabilities/users/accounts/spec.md"
SEARCH = "specs/capabilities/products/search/spec.md"


def run(root: Path, *args: str) -> tuple[int, dict | None, str]:
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = change.main(["--root", str(root), *args])
    text = out.getvalue().strip()
    return code, (json.loads(text) if text else None), err.getvalue().strip()


class ChangeTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.write(CATALOG, feature_spec("products", "catalog", "PROD", CATALOG_REQS,
                                         "| 002-product-delete | 2026-11-05 | new PROD-003 |"))
        self.write(LISTING, feature_spec("products", "listing", "PROD", LISTING_REQS))
        self.write("specs/capabilities/products/history.md",
                   HISTORY.format(d="products", code="PROD", removed="| _(none yet)_ | | | | |"))
        self.write(ACCOUNTS, feature_spec("users", "accounts", "USER", "_(none yet)_"))
        self.write("specs/capabilities/users/history.md",
                   HISTORY.format(d="users", code="USER", removed="| _(none yet)_ | | | | |"))
        self.write(f"specs/changes/{CHANGE}/spec.md", DELTA)
        self.write("specs/_system/nfr.md", NFR)
        self.write("specs/_system/domain-model.md", DOMAIN_MODEL)
        self.write(f"specs/changes/{CHANGE}/tasks.md", "- [x] T001 done\n")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, rel: str, text: str) -> None:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def read(self, rel: str) -> str:
        return (self.root / rel).read_text(encoding="utf-8")

    def snapshot(self) -> dict[str, str]:
        return {str(p.relative_to(self.root)): p.read_text(encoding="utf-8")
                for p in sorted(self.root.rglob("*")) if p.is_file()}

    def sync(self, *extra: str) -> tuple[int, dict | None, str]:
        return run(self.root, "sync", "--change", CHANGE, "--date", "2026-11-14", *extra)

    def edit_delta(self, old: str, new: str) -> None:
        text = self.read(f"specs/changes/{CHANGE}/spec.md")
        self.assertIn(old, text)
        self.write(f"specs/changes/{CHANGE}/spec.md", text.replace(old, new))

    def assert_fails_without_writes(self, needle: str) -> None:
        before = self.snapshot()
        code, out, err = self.sync()
        self.assertEqual(code, 1, err)
        self.assertIsNone(out)
        self.assertIn(needle, err)
        self.assertEqual(before, self.snapshot())

    def moved_instead_of_removed(self, extra: str = "") -> None:
        """PROD-002 moves from listing to catalog instead of being removed."""
        self.edit_delta("### products/listing\n\n" + REMOVED_LISTING + "\n\n", "")
        self.edit_delta("#### ADDED PROD-004: Bulk delete",
                        "#### MOVED PROD-002: List products\n\n- **From:** listing\n- **To:** catalog\n"
                        "- **Reason:** listing is part of the catalog now\n\n" + extra + "#### ADDED PROD-004: Bulk delete")

    # ---- the roadmap checks -------------------------------------------------

    def test_modified_replaces_whole_block(self) -> None:
        self.assertEqual(self.sync()[0], 0)
        spec = self.read(CATALOG)
        self.assertIn("delete one product after confirming", spec)
        self.assertIn("**Given** new", spec)
        self.assertNotIn("old", spec)
        self.assertNotIn("PROD-003-S2", spec)
        self.assertIn("- **Source:** change 099-archive-test", spec)
        self.assertNotIn("change 002-product-delete", spec)

    def test_added_is_last_with_all_scenarios(self) -> None:
        self.sync()
        spec = self.read(CATALOG)
        heads = [l for l in spec.split("\n") if l.startswith("### PROD-")]
        self.assertEqual(heads[-1], "### PROD-004: Bulk delete")
        self.assertIn("PROD-004-S1", spec)
        self.assertIn("PROD-004-S2", spec)
        # comment block after the requirements is kept, after the last requirement, before Merged changes
        self.assertLess(spec.index("### PROD-004"), spec.index("<!-- Shape of one requirement"))
        self.assertLess(spec.index("<!-- Shape of one requirement"), spec.index("## Merged changes"))

    def test_removed_goes_to_domain_history(self) -> None:
        self.sync()
        self.assertNotIn("### PROD-002", self.read(LISTING))
        history = self.read("specs/capabilities/products/history.md")
        self.assertIn("| PROD-002 | listing | 099-archive-test | replaced by search | — |", history)
        self.assertNotIn("_(none yet)_", history)

    def test_merged_changes_per_feature(self) -> None:
        self.sync()
        catalog = self.read(CATALOG)
        self.assertIn("| 002-product-delete | 2026-11-05 | new PROD-003 |\n"
                      "| 099-archive-test | 2026-11-14 | updated PROD-003; new PROD-004 |", catalog)
        listing = self.read(LISTING)
        self.assertIn("| 099-archive-test | 2026-11-14 | dropped PROD-002 |", listing)
        self.assertNotIn("_(none yet)_ | | |", listing)
        self.assertEqual(listing.count("_(none yet)_"), 1)  # Requirements is empty now

    def test_untouched_feature_is_not_written(self) -> None:
        self.edit_delta('"products/listing", ', "")
        self.edit_delta("### products/listing\n\n" + REMOVED_LISTING + "\n\n", "")
        before = self.read(LISTING)
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        self.assertNotIn(LISTING, out["files"])
        self.assertEqual(before, self.read(LISTING))
        self.assertNotIn("specs/capabilities/products/history.md", out["files"])  # nothing removed

    def test_multi_domain(self) -> None:
        code, out, _ = self.sync()
        self.assertEqual(code, 0)
        self.assertEqual(set(out["applied"]), {"products/catalog", "products/listing", "users/accounts", "_system/nfr"})
        users = self.read(ACCOUNTS)
        self.assertIn("### USER-001: Create staff account", users)
        self.assertIn("| 099-archive-test | 2026-11-14 | new USER-001 |", users)

    def test_no_delta_keywords_left(self) -> None:
        self.moved_instead_of_removed()
        self.assertEqual(self.sync()[0], 0)
        for p in (self.root / "specs/capabilities").rglob("*.md"):
            self.assertIsNone(change.DELTA_WORD_RE.search(p.read_text(encoding="utf-8")), p)

    def test_archive_moves_folder(self) -> None:
        self.sync()
        code, out, err = run(self.root, "archive", "--change", CHANGE)
        self.assertEqual(code, 0, err)
        self.assertFalse((self.root / f"specs/changes/{CHANGE}").exists())
        self.assertTrue((self.root / f"specs/archive/{CHANGE}/tasks.md").exists())
        self.assertIn("status: archived", self.read(f"specs/archive/{CHANGE}/spec.md"))

    def test_unknown_id_stops_without_writes(self) -> None:
        self.edit_delta("#### MODIFIED PROD-003", "#### MODIFIED PROD-999")
        self.assert_fails_without_writes("MODIFIED PROD-999: not found in domain 'products'")

    def test_archive_never_overwrites(self) -> None:
        self.sync()
        self.write(f"specs/archive/{CHANGE}/spec.md", "old archive\n")
        code, _, err = run(self.root, "archive", "--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("already exists", err)
        self.assertEqual(self.read(f"specs/archive/{CHANGE}/spec.md"), "old archive\n")
        self.assertTrue((self.root / f"specs/changes/{CHANGE}").exists())

    def test_status_lists_open_tasks(self) -> None:
        self.write(f"specs/changes/{CHANGE}/tasks.md", "- [x] T001 done\n- [ ] T002 open\n  - [ ] T003 nested\n")
        code, out, _ = run(self.root, "status", "--change", CHANGE)
        self.assertEqual(code, 0)
        self.assertEqual(out["open_tasks"], ["- [ ] T002 open", "- [ ] T003 nested"])

    # ---- feature layout -------------------------------------------------------

    def test_modified_in_wrong_feature_stops(self) -> None:
        self.edit_delta(REMOVED_LISTING, REMOVED_LISTING.replace("PROD-002: List products", "PROD-001: Create product"))
        self.assert_fails_without_writes("REMOVED PROD-001: is in products/catalog, not products/listing")

    def test_added_id_of_another_feature_stops(self) -> None:
        self.edit_delta("#### ADDED PROD-004: Bulk delete", "#### ADDED PROD-002: Bulk delete")
        self.edit_delta("`PROD-004-S1`", "`PROD-002-S1`")
        self.edit_delta("`PROD-004-S2`", "`PROD-002-S2`")
        self.edit_delta("### products/listing\n\n" + REMOVED_LISTING + "\n\n", "")
        self.edit_delta('"products/listing", ', "")
        self.assert_fails_without_writes("ADDED PROD-002: already exists in products/listing")

    def test_moved_moves_block_and_keeps_id(self) -> None:
        self.moved_instead_of_removed()
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        catalog, listing = self.read(CATALOG), self.read(LISTING)
        self.assertIn("### PROD-002: List products", catalog)
        self.assertIn("The system MUST list products.", catalog)
        self.assertLess(catalog.index("### PROD-001"), catalog.index("### PROD-002"))  # ascending IDs
        self.assertLess(catalog.index("### PROD-002"), catalog.index("### PROD-003"))
        self.assertNotIn("PROD-002", listing.split("## Merged changes")[0])
        # content and Source unchanged by a pure move
        block = catalog.split("### PROD-002")[1].split("### PROD-003")[0]
        self.assertIn("- **Source:** change 001-products-skeleton", block)
        self.assertIn("| 099-archive-test | 2026-11-14 | moved PROD-002 to catalog |", listing)
        self.assertIn("| 099-archive-test | 2026-11-14 | moved PROD-002 from listing; updated PROD-003; new PROD-004 |",
                      catalog)
        self.assertEqual(out["applied"]["products/listing"], ["MOVED PROD-002 -> products/catalog"])
        self.assertNotIn("PROD-002", self.read("specs/capabilities/products/history.md"))

    def test_moved_then_modified(self) -> None:
        modified = ("#### MODIFIED PROD-002: List and filter products\n\nThe system MUST list and filter products.\n\n"
                    "**Permissions:** staff\n\n**Scenarios:**\n\n- `PROD-002-S1` (happy, P1)\n  - **Given** a\n"
                    "  - **When** b\n  - **Then** c\n\n")
        self.moved_instead_of_removed(modified)
        self.assertEqual(self.sync()[0], 0)
        catalog = self.read(CATALOG)
        self.assertIn("### PROD-002: List and filter products", catalog)
        block = catalog.split("### PROD-002")[1].split("### PROD-003")[0]
        self.assertIn("- **Source:** change 099-archive-test", block)
        self.assertNotIn("### PROD-002", self.read(LISTING))
        self.assertEqual(run(self.root, "archive", "--change", CHANGE)[0], 0)

    def test_moved_from_must_be_declared(self) -> None:
        self.moved_instead_of_removed()
        self.edit_delta('"products/listing", ', "")
        self.assert_fails_without_writes("MOVED PROD-002: From feature 'products/listing' must be listed")

    def test_moved_to_must_match_section(self) -> None:
        self.moved_instead_of_removed()
        self.edit_delta("- **To:** catalog", "- **To:** search")
        self.assert_fails_without_writes("MOVED PROD-002: To 'products/search' must be the feature of its section")

    def test_moved_wrong_from_stops(self) -> None:
        self.moved_instead_of_removed()
        self.edit_delta("#### MOVED PROD-002: List products", "#### MOVED PROD-001: Create product")
        self.assert_fails_without_writes("MOVED PROD-001: is in products/catalog, not products/listing")

    def test_moved_needs_from_and_to(self) -> None:
        self.moved_instead_of_removed()
        self.edit_delta("- **To:** catalog\n", "")
        self.assert_fails_without_writes("MOVED PROD-002: needs '- **From:** <feature>' and '- **To:** <feature>'")

    def test_moved_source_needs_no_section_but_a_lost_from_is_caught(self) -> None:
        self.moved_instead_of_removed()
        self.edit_delta("- **From:** listing\n", "")
        self.assert_fails_without_writes("feature 'products/listing' is in 'capabilities' but has no")

    def test_moved_across_domains_stops(self) -> None:
        self.moved_instead_of_removed()
        self.edit_delta("- **From:** listing", "- **From:** users/accounts")
        self.edit_delta('"products/listing", ', "")
        self.assert_fails_without_writes("MOVED PROD-002: From 'users/accounts' is in another domain")

    def test_new_feature_is_created_from_features_table(self) -> None:
        self.edit_delta('"users/accounts"]', '"users/accounts", "products/search"]')
        self.edit_delta("### users/accounts",
                        "### products/search\n\n#### ADDED PROD-005: Search products\n\nThe system MUST search.\n\n"
                        "**Permissions:** anyone\n\n**Scenarios:**\n\n- `PROD-005-S1` (happy, P1)\n  - **Given** a\n"
                        "  - **When** b\n  - **Then** c\n\n### users/accounts")
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        self.assertIn(SEARCH, out["files"])
        search = self.read(SEARCH)
        self.assertIn('feature: "search"', search)
        self.assertIn('code: "PROD"', search)
        self.assertIn("## Overview\n\nFull-text product search\n", search)
        self.assertIn("### PROD-005: Search products", search)
        self.assertIn("| 099-archive-test | 2026-11-14 | new PROD-005 |", search)
        self.assertEqual(change.render_feature(change.parse_feature(self.root, "products", "search")), search)
        self.assertEqual(run(self.root, "archive", "--change", CHANGE)[0], 0)

    def test_new_feature_dry_run_creates_nothing(self) -> None:
        self.edit_delta('"users/accounts"]', '"users/accounts", "products/search"]')
        self.edit_delta("### users/accounts",
                        "### products/search\n\n#### ADDED PROD-005: Search products\n\nThe system MUST search.\n\n"
                        "**Scenarios:**\n\n- `PROD-005-S1` (happy, P1)\n  - **Given** a\n  - **When** b\n"
                        "  - **Then** c\n\n### users/accounts")
        self.assertEqual(self.sync("--dry-run")[0], 0)
        self.assertFalse((self.root / SEARCH).parent.exists())

    def test_new_feature_needs_features_row(self) -> None:
        self.edit_delta('"users/accounts"]', '"users/accounts", "products/pricing"]')
        self.edit_delta("### users/accounts",
                        "### products/pricing\n\n#### ADDED PROD-005: Price rules\n\nThe system MUST price.\n\n"
                        "**Scenarios:**\n\n- `PROD-005-S1` (happy, P1)\n  - **Given** a\n  - **When** b\n"
                        "  - **Then** c\n\n### users/accounts")
        self.assert_fails_without_writes("new feature 'products/pricing' is not in the Features table")

    def test_new_feature_only_takes_added_or_moved(self) -> None:
        self.edit_delta('"users/accounts"]', '"users/accounts", "products/search"]')
        self.edit_delta("### products/listing", "### products/search")
        self.edit_delta('"products/listing", ', "")
        self.assert_fails_without_writes("REMOVED PROD-002: feature 'products/search' does not exist yet")

    def test_moved_into_new_feature(self) -> None:
        self.edit_delta('"users/accounts"]', '"users/accounts", "products/search"]')
        self.edit_delta("### products/listing\n\n" + REMOVED_LISTING,
                        "### products/search\n\n#### MOVED PROD-002: List products\n\n- **From:** listing\n"
                        "- **To:** search")
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        self.assertIn("### PROD-002: List products", self.read(SEARCH))
        self.assertIn("| 099-archive-test | 2026-11-14 | moved PROD-002 to search |", self.read(LISTING))

    def test_domain_level_spec_is_refused(self) -> None:
        self.write("specs/capabilities/products/spec.md", "## Requirements\n")
        self.assert_fails_without_writes("a domain has no spec.md of its own")

    def test_section_must_be_a_feature_path(self) -> None:
        self.edit_delta("### users/accounts", "### users")
        self.assert_fails_without_writes("section must be '### <domain>/<feature>', got '### users'")

    def test_capabilities_must_be_features(self) -> None:
        self.edit_delta('"users/accounts"]', '"users"]')
        self.assert_fails_without_writes("capabilities must list features as '<domain>/<feature>'")

    def test_same_id_in_two_features_is_refused(self) -> None:
        self.write(LISTING, feature_spec("products", "listing", "PROD", LISTING_REQS + "\n\n" +
                                         CATALOG_REQS.split("\n\n### PROD-003")[0]))
        self.assert_fails_without_writes("requirement PROD-001 is in both products/catalog and products/listing")

    def test_code_from_history_when_domain_has_no_feature_yet(self) -> None:
        (self.root / ACCOUNTS).unlink()
        (self.root / ACCOUNTS).parent.rmdir()
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        self.assertIn('code: "USER"', self.read(ACCOUNTS))
        self.assertIn("## Overview\n\nStaff accounts\n", self.read(ACCOUNTS))

    # ---- more stop conditions -----------------------------------------------

    def test_added_duplicate_stops(self) -> None:
        self.edit_delta("#### ADDED PROD-004: Bulk delete", "#### ADDED PROD-001: Bulk delete")
        self.edit_delta("`PROD-004-S1`", "`PROD-001-S1`")
        self.edit_delta("`PROD-004-S2`", "`PROD-001-S2`")
        self.assert_fails_without_writes("ADDED PROD-001: already exists in products/catalog")

    def test_added_removed_id_stops(self) -> None:
        self.write("specs/capabilities/products/history.md", HISTORY.format(
            d="products", code="PROD", removed="| PROD-004 | catalog | 050-x | gone | — |"))
        self.assert_fails_without_writes("PROD-004: ID was removed earlier")

    def test_removed_unknown_stops(self) -> None:
        self.edit_delta("#### REMOVED PROD-002", "#### REMOVED PROD-020")
        self.assert_fails_without_writes("REMOVED PROD-020: not found")

    def test_error_in_second_domain_writes_nothing_in_first(self) -> None:
        self.edit_delta("#### ADDED USER-001", "#### ADDED PROD-005")
        self.assert_fails_without_writes("domain 'users' uses code USER")

    def test_open_clarification_stops(self) -> None:
        self.edit_delta("up to 50 products", "up to [NEEDS CLARIFICATION: how many?] products")
        self.assert_fails_without_writes("PROD-004: [NEEDS CLARIFICATION] is still open")

    def test_capabilities_and_sections_must_match(self) -> None:
        self.edit_delta(', "users/accounts"]', "]")
        self.assert_fails_without_writes("section '### users/accounts' is not listed")

    def test_scenario_required(self) -> None:
        self.edit_delta("- `USER-001-S1` (happy, P1)\n  - **Given** …\n  - **When** …\n  - **Then** …\n", "")
        self.assert_fails_without_writes("ADDED USER-001: no scenario")

    def test_renamed_then_modified(self) -> None:
        self.edit_delta(REMOVED_LISTING, "#### RENAMED PROD-002\n\n- **From:** List products\n- **To:** Browse products")
        self.assertEqual(self.sync()[0], 0)
        spec = self.read(LISTING)
        self.assertIn("### PROD-002: Browse products", spec)
        self.assertIn("change 001-products-skeleton", spec)  # body untouched by a pure rename
        self.assertIn("| 099-archive-test | 2026-11-14 | renamed PROD-002 |", spec)

    def test_renamed_from_mismatch_stops(self) -> None:
        self.edit_delta(REMOVED_LISTING, "#### RENAMED PROD-002\n\n- **From:** Wrong name\n- **To:** Browse products")
        self.assert_fails_without_writes("does not match current name")

    def test_removed_and_added_same_id_stops(self) -> None:
        self.edit_delta("#### ADDED USER-001: Create staff account", "#### ADDED USER-001: Create staff account")
        self.edit_delta(REMOVED_LISTING, REMOVED_LISTING + "\n\n#### MODIFIED PROD-002: List products\n\n"
                        "The system MUST list.\n\n**Scenarios:**\n\n- `PROD-002-S1` (happy, P1)\n  - **Given** a\n"
                        "  - **When** b\n  - **Then** c")
        self.assert_fails_without_writes("PROD-002 appears in REMOVED and MODIFIED")

    def test_dry_run_writes_nothing(self) -> None:
        before = self.snapshot()
        code, out, _ = self.sync("--dry-run")
        self.assertEqual(code, 0)
        self.assertTrue(out["dry_run"])
        self.assertEqual(before, self.snapshot())

    def test_archive_refuses_before_sync(self) -> None:
        code, _, err = run(self.root, "archive", "--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("run sync first", err)
        self.assertTrue((self.root / f"specs/changes/{CHANGE}").exists())

    def test_archive_refuses_when_move_not_applied(self) -> None:
        self.moved_instead_of_removed()
        self.assertEqual(self.sync()[0], 0)
        self.write(LISTING, feature_spec("products", "listing", "PROD", LISTING_REQS))
        self.write(CATALOG, self.read(CATALOG).replace(
            self.read(CATALOG).split("### PROD-002")[1].split("### PROD-003")[0], "").replace("### PROD-002", ""))
        code, _, err = run(self.root, "archive", "--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("PROD-002 is not in products/catalog/spec.md", err)

    def test_sync_twice_is_rejected(self) -> None:
        self.assertEqual(self.sync()[0], 0)
        code, _, err = self.sync()
        self.assertEqual(code, 1)
        self.assertIn("ADDED PROD-004: already exists", err)

    def test_bad_change_name(self) -> None:
        code, _, err = run(self.root, "sync", "--change", "../etc")
        self.assertEqual(code, 1)
        self.assertIn("NNN-<kebab-name>", err)

    # ---- rich delta format ----------------------------------------------------

    def test_requirement_details_go_to_feature(self) -> None:
        self.assertEqual(self.sync()[0], 0)
        spec = self.read(CATALOG)
        self.assertIn("| 204 | deleted |", spec)
        self.assertIn('{ "deleted": 50 }', spec)
        self.assertIn("  - Covers: PROD-003", spec)
        self.assertIn("  - → Recovery: …", spec)
        for word in ("Non-Functional", "Edge Cases", "099-ADR-1", "Traceability", "Assumptions"):
            self.assertNotIn(word, spec)

    def test_nfr_added_and_modified_merged(self) -> None:
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        self.assertEqual(out["applied"]["_system/nfr"], ["MODIFIED NFR-001", "ADDED NFR-041"])
        nfr = self.read("specs/_system/nfr.md")
        self.assertIn("| NFR-001 | List and bulk delete respond fast | ≤ 1 second with 500 products | "
                      "change 099-archive-test | PROD-004-S1 |", nfr)
        self.assertNotIn("| NFR-001 | List responds fast", nfr)
        self.assertIn("| NFR-002 | Cache lives 30 s | 30 s | fixture | Review |", nfr)  # Applies: untouched
        # ADDED goes to the end of its section's ID table; Number column does not exist there
        self.assertIn("| NFR-040 | Vietnamese UI | fixture | Review |\n"
                      "| NFR-041 | The bulk delete dialog has a visible label | change 099-archive-test | PROD-004-S2 |", nfr)
        self.assertIsNone(change.DELTA_WORD_RE.search(nfr))

    def test_nfr_added_existing_stops(self) -> None:
        self.edit_delta("| NFR-041 | ADDED |", "| NFR-040 | ADDED |")
        self.assert_fails_without_writes("ADDED NFR-040: already exists in nfr.md")

    def test_nfr_modified_missing_stops(self) -> None:
        self.edit_delta("| NFR-001 | MODIFIED |", "| NFR-009 | MODIFIED |")
        self.assert_fails_without_writes("MODIFIED NFR-009: not found in nfr.md")

    def test_nfr_modified_wrong_section_stops(self) -> None:
        self.edit_delta("| NFR-001 | MODIFIED | Performance |", "| NFR-001 | MODIFIED | User environment |")
        self.assert_fails_without_writes("is in nfr.md section 'Performance', not 'User environment'")

    def test_nfr_unknown_category_stops(self) -> None:
        self.edit_delta("| NFR-041 | ADDED | User environment |", "| NFR-041 | ADDED | Usability |")
        self.assert_fails_without_writes("nfr.md has no section '## Usability'")

    def test_nfr_bad_change_value_stops(self) -> None:
        self.edit_delta("| NFR-041 | ADDED |", "| NFR-041 | NEW |")
        self.assert_fails_without_writes("NFR-041: Change must be one of Applies, ADDED, MODIFIED")

    def test_nfr_value_without_column_stops(self) -> None:
        self.edit_delta("has a visible label | — |", "has a visible label | 3 labels |")
        self.assert_fails_without_writes("section 'User environment' has no column 'Number'")

    def test_nfr_missing_file_stops(self) -> None:
        (self.root / "specs/_system/nfr.md").unlink()
        self.assert_fails_without_writes("specs/_system/nfr.md not found")

    def test_no_nfr_rows_needs_no_nfr_file(self) -> None:
        self.edit_delta("| NFR-001 | MODIFIED |", "| NFR-001 | Applies |")
        self.edit_delta("| NFR-041 | ADDED |", "| NFR-040 | Applies |")
        (self.root / "specs/_system/nfr.md").unlink()
        code, out, err = self.sync()
        self.assertEqual(code, 0, err)
        self.assertNotIn("_system/nfr", out["applied"])

    def test_adr_stays_in_change_and_goes_to_archive(self) -> None:
        self.sync()
        self.assertEqual(run(self.root, "archive", "--change", CHANGE)[0], 0)
        self.assertIn("### 099-ADR-1: Bulk delete in one transaction", self.read(f"specs/archive/{CHANGE}/spec.md"))
        for p in (self.root / "specs").rglob("*.md"):
            if "archive" not in p.parts:
                self.assertNotIn("099-ADR-1", p.read_text(encoding="utf-8"), p)

    def test_archive_refuses_when_nfr_not_synced(self) -> None:
        self.sync()
        self.write("specs/_system/nfr.md", NFR)
        code, _, err = run(self.root, "archive", "--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("NFR-001 in nfr.md does not match the change", err)

    def test_render_is_stable(self) -> None:
        self.sync()
        first = self.read(CATALOG)
        fs = change.parse_feature(self.root, "products", "catalog")
        self.assertEqual(change.render_feature(fs), first)
        self.assertEqual(textwrap.dedent(first), first)


if __name__ == "__main__":
    unittest.main()
