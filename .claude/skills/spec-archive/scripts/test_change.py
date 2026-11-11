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

PRODUCTS_SPEC = """\
---
kind: capability
domain: "products"
code: "PROD"
---

# Capability: products (PROD)

## Overview

Product catalog.

Related: [states.md](states.md) · [rules.md](rules.md) · [history.md](history.md)

## Requirements

### PROD-001: Create product

The system MUST let a stock manager create a product.

- **Permissions:** stock manager
- **Scenarios:**
  - `PROD-001-S1` (happy) [P1] — **Given** … **When** … **Then** …
- **Source:** change 001-products-skeleton

### PROD-002: List products

The system MUST list products.

- **Permissions:** stock manager, staff
- **Scenarios:**
  - `PROD-002-S1` (happy) [P1] — **Given** … **When** … **Then** …
- **Source:** change 001-products-skeleton

### PROD-003: Delete product

The system MUST let a stock manager delete one product.

- **Permissions:** stock manager
- **Scenarios:**
  - `PROD-003-S1` (happy) [P1] — **Given** old **When** old **Then** old
  - `PROD-003-S2` (permission) [P1] — **Given** old2 **When** old2 **Then** old2
- **Source:** change 002-product-delete

<!-- Shape of one requirement after archive:

### [CODE]-001: [Requirement name]
-->
"""

USERS_SPEC = """\
---
kind: capability
domain: "users"
code: "USER"
---

# Capability: users (USER)

## Overview

Staff accounts.

## Requirements

_(none yet)_
"""

HISTORY = """\
# History: {d}

## Merged changes

| Change | Date | Change in this domain |
| --- | --- | --- |
{merged}

## Removed IDs

| ID | Removed in change | Reason | Replaced by |
| --- | --- | --- | --- |
{removed}
"""

DELTA = """\
---
kind: delta
change: "099-archive-test"
capabilities: ["products", "users"]
primary: "products"
status: draft            # draft | approved | implementing | archived
source: ["fixture"]
---

# Change 099: Archive test

## Overview

Fixture.

## Requirements

### products

#### MODIFIED PROD-003: Delete product

The system MUST let a stock manager delete one product after confirming.

- **Permissions:** stock manager
- **Scenarios:**
  - `PROD-003-S1` (happy) [P1] — **Given** new **When** new **Then** new

#### REMOVED PROD-002: List products

- **Reason:** replaced by search
- **Migration:** none

#### ADDED PROD-004: Bulk delete

The system MUST let a stock manager delete up to 50 products at once.

- **Permissions:** stock manager
- **Scenarios:**
  - `PROD-004-S1` (happy) [P1] — **Given** … **When** … **Then** …
  - `PROD-004-S2` (boundary) [P2] — **Given** … **When** … **Then** … → Recovery: …

### users

#### ADDED USER-001: Create staff account

The system MUST let an admin create a staff account.

- **Permissions:** admin
- **Scenarios:**
  - `USER-001-S1` (happy) [P1] — **Given** … **When** … **Then** …

### Edge Cases (unassigned)

_(none)_

## Success Criteria

- **SC-001:** fixture
"""


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
        self.write("specs/capabilities/products/spec.md", PRODUCTS_SPEC)
        self.write("specs/capabilities/products/history.md", HISTORY.format(
            d="products", merged="| 002-product-delete | 2026-11-05 | new PROD-003 |",
            removed="| _(none yet)_ | | | |"))
        self.write("specs/capabilities/users/spec.md", USERS_SPEC)
        self.write("specs/capabilities/users/history.md", HISTORY.format(
            d="users", merged="| _(none yet)_ | | |", removed="| _(none yet)_ | | | |"))
        self.write(f"specs/changes/{CHANGE}/spec.md", DELTA)
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

    # ---- the roadmap checks -------------------------------------------------

    def test_modified_replaces_whole_block(self) -> None:
        self.assertEqual(self.sync()[0], 0)
        spec = self.read("specs/capabilities/products/spec.md")
        self.assertIn("delete one product after confirming", spec)
        self.assertIn("**Given** new", spec)
        self.assertNotIn("old", spec)
        self.assertNotIn("PROD-003-S2", spec)
        self.assertIn("- **Source:** change 099-archive-test", spec)
        self.assertNotIn("change 002-product-delete", spec)

    def test_added_is_last_with_all_scenarios(self) -> None:
        self.sync()
        spec = self.read("specs/capabilities/products/spec.md")
        heads = [l for l in spec.split("\n") if l.startswith("### PROD-")]
        self.assertEqual(heads[-1], "### PROD-004: Bulk delete")
        self.assertIn("PROD-004-S1", spec)
        self.assertIn("PROD-004-S2", spec)
        # comment block after the requirements is kept, after the last requirement
        self.assertLess(spec.index("### PROD-004"), spec.index("<!-- Shape of one requirement"))

    def test_removed_goes_to_history(self) -> None:
        self.sync()
        spec = self.read("specs/capabilities/products/spec.md")
        self.assertNotIn("PROD-002", spec)
        history = self.read("specs/capabilities/products/history.md")
        self.assertIn("| PROD-002 | 099-archive-test | replaced by search | — |", history)
        self.assertNotIn("_(none yet)_", history)
        self.assertIn("| 099-archive-test | 2026-11-14 | updated PROD-003; dropped PROD-002; new PROD-004 |", history)

    def test_multi_domain(self) -> None:
        code, out, _ = self.sync()
        self.assertEqual(code, 0)
        self.assertEqual(set(out["applied"]), {"products", "users"})
        users = self.read("specs/capabilities/users/spec.md")
        self.assertIn("### USER-001: Create staff account", users)
        self.assertNotIn("_(none yet)_", users)
        self.assertIn("| 099-archive-test | 2026-11-14 | new USER-001 |",
                      self.read("specs/capabilities/users/history.md"))

    def test_no_delta_keywords_left(self) -> None:
        self.sync()
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
        self.assert_fails_without_writes("MODIFIED PROD-999: not found")

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

    # ---- more stop conditions -----------------------------------------------

    def test_added_duplicate_stops(self) -> None:
        self.edit_delta("#### ADDED PROD-004: Bulk delete", "#### ADDED PROD-001: Bulk delete")
        self.edit_delta("`PROD-004-S1`", "`PROD-001-S1`")
        self.edit_delta("`PROD-004-S2`", "`PROD-001-S2`")
        self.assert_fails_without_writes("ADDED PROD-001: already exists")

    def test_added_removed_id_stops(self) -> None:
        self.write("specs/capabilities/products/history.md", HISTORY.format(
            d="products", merged="| _(none yet)_ | | |",
            removed="| PROD-004 | 050-x | gone | — |"))
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
        self.edit_delta('capabilities: ["products", "users"]', 'capabilities: ["products"]')
        self.assert_fails_without_writes("section '### users' is not listed")

    def test_scenario_required(self) -> None:
        self.edit_delta("  - `USER-001-S1` (happy) [P1] — **Given** … **When** … **Then** …\n", "")
        self.assert_fails_without_writes("ADDED USER-001: no scenario")

    def test_renamed_then_modified(self) -> None:
        self.edit_delta("#### REMOVED PROD-002: List products\n\n- **Reason:** replaced by search\n- **Migration:** none",
                        "#### RENAMED PROD-002\n\n- **From:** List products\n- **To:** Browse products")
        self.assertEqual(self.sync()[0], 0)
        spec = self.read("specs/capabilities/products/spec.md")
        self.assertIn("### PROD-002: Browse products", spec)
        self.assertIn("change 001-products-skeleton", spec)  # body untouched by a pure rename

    def test_renamed_from_mismatch_stops(self) -> None:
        self.edit_delta("#### REMOVED PROD-002: List products\n\n- **Reason:** replaced by search\n- **Migration:** none",
                        "#### RENAMED PROD-002\n\n- **From:** Wrong name\n- **To:** Browse products")
        self.assert_fails_without_writes("does not match current name")

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

    def test_sync_twice_is_rejected(self) -> None:
        self.assertEqual(self.sync()[0], 0)
        code, _, err = self.sync()
        self.assertEqual(code, 1)
        self.assertIn("ADDED PROD-004: already exists", err)

    def test_bad_change_name(self) -> None:
        code, _, err = run(self.root, "sync", "--change", "../etc")
        self.assertEqual(code, 1)
        self.assertIn("NNN-<kebab-name>", err)

    def test_render_is_stable(self) -> None:
        self.sync()
        first = self.read("specs/capabilities/products/spec.md")
        cap = change.parse_capability(self.root, "products")
        self.assertEqual(change.render_capability(cap), first)
        self.assertEqual(textwrap.dedent(first), first)


if __name__ == "__main__":
    unittest.main()
