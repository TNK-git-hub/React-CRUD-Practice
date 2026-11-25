"""Tests for approval.py. Run: python3 -m unittest discover -s .specify/scripts"""

from __future__ import annotations

import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import approval  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CHANGE = "003-bulk-delete"
BUG = "20261125-price-filter-ignores-max"
SPEC = """\
---
kind: delta
change: "003-bulk-delete"
status: draft            # draft | approved | implementing | archived
---

# Change 003: Bulk delete

## Requirements

#### ADDED PROD-004: Bulk delete

The system MUST delete up to 50 products at once.

- `PROD-004-S1` (happy, P1)
  - **Given** 3 products
  - **When** the manager deletes them
  - **Then** HTTP 204
- `PROD-004-S2` (boundary, P2)
  - **Given** 51 products
  - **When** the manager deletes them
  - **Then** HTTP 400

## Architecture Decisions

_(Architecture Decisions: filled by /speckit-plan)_

## Data Model

_(Data Model: filled by /speckit-plan)_

## Clarifications

## Traceability
"""
PLAN = "# Plan\n\n## Test Strategy\n\nVitest.\n"
TASKS = "# Tasks\n\n- [ ] T001 Endpoint. Scenarios: PROD-004-S1, PROD-004-S2\n"
REPORT = "# Bug report: max ignored\n\n## Expected\n\nmax 100 filters.\n"
INVESTIGATION = """\
# Investigation: 20261125-price-filter-ignores-max

## Evidence log

| # | Command / source | What it showed |
| --- | --- | --- |
| 1 | test | fails |

## Root cause

- **Root cause:** the query builder drops `max` (`backend/src/products/query.ts:42`)
- **Fix direction:** keep `max` in the builder

```bash
# a comment line in a code block is not a heading
```

## Root cause gate

Approved with approval.py.

## Stopped after 3 failed attempts

- Attempts: none yet
"""


class FakeTTY(io.StringIO):
    def isatty(self) -> bool:
        return True


class ApprovalTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.change = self.root / "specs/changes" / CHANGE
        self.write(f"specs/changes/{CHANGE}/spec.md", SPEC)
        self.write(f"specs/changes/{CHANGE}/plan.md", PLAN)
        self.write(f"specs/changes/{CHANGE}/tasks.md", TASKS)
        self.write(f"bugs/{BUG}/report.md", REPORT)
        self.write(f"bugs/{BUG}/investigation.md", INVESTIGATION)
        # the real template, so a renamed heading in it fails these tests
        tpl = self.root / approval.TEMPLATE
        tpl.parent.mkdir(parents=True)
        shutil.copy(REPO / approval.TEMPLATE, tpl)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, rel: str, text: str) -> None:
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def edit(self, rel: str, old: str, new: str) -> None:
        p = self.root / rel
        text = p.read_text(encoding="utf-8")
        self.assertIn(old, text)
        p.write_text(text.replace(old, new, 1), encoding="utf-8")

    def cli(self, *args: str, answer: str | None = None) -> tuple[int, str]:
        """Run main(); answer=None: no TTY, otherwise a fake terminal that types `answer`."""
        out, err = (FakeTTY(), FakeTTY(answer + "\n")) if answer is not None else (io.StringIO(), io.StringIO(""))
        stderr = io.StringIO()
        with mock.patch.object(sys, "stdin", err), mock.patch.object(sys, "stdout", out), redirect_stderr(stderr):
            code = approval.main([*args, "--root", str(self.root)])
        return code, out.getvalue() + stderr.getvalue()

    def approve_change(self, gate: str) -> None:
        code, out = self.cli("approve", "--change", CHANGE, "--gate", gate, answer="y")
        self.assertEqual(code, 0, out)

    def verify(self, *extra: str) -> tuple[int, str]:
        return self.cli("verify", *extra)

    # ---- approve ----
    def test_approve_refused_without_tty(self) -> None:
        code, out = self.cli("approve", "--change", CHANGE, "--gate", "spec")
        self.assertEqual(code, 2)
        self.assertIn("must be a terminal", out)
        self.assertFalse((self.change / "approval.json").exists())

    def test_approve_needs_y(self) -> None:
        code, out = self.cli("approve", "--change", CHANGE, "--gate", "spec", answer="n")
        self.assertEqual(code, 1)
        self.assertIn("Not approved", out)
        self.assertFalse((self.change / "approval.json").exists())
        self.assertIn("status: draft", (self.change / "spec.md").read_text())

    def test_approve_spec_records_gate_and_sets_status(self) -> None:
        code, out = self.cli("approve", "--change", CHANGE, "--gate", "spec", answer="y")
        self.assertEqual(code, 0, out)
        self.assertIn("1 requirement(s), 2 scenario(s)", out)
        self.assertIn(f"specs/changes/{CHANGE}/spec.md", out)
        data = json.loads((self.change / "approval.json").read_text())
        self.assertEqual(set(data), {"spec"})
        self.assertEqual(data["spec"]["by"], "terminal")
        self.assertEqual(data["spec"]["files"], [f"specs/changes/{CHANGE}/spec.md"])
        self.assertRegex(data["spec"]["sha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(data["spec"]["at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$")
        self.assertIn(data["spec"]["sha256"], out)
        spec = (self.change / "spec.md").read_text()
        self.assertIn("status: approved            # draft", spec)
        self.assertTrue((self.change / ".approved/spec/spec.md").is_file())

    def test_approve_plan_refused_without_spec_gate(self) -> None:
        code, out = self.cli("approve", "--change", CHANGE, "--gate", "plan", answer="y")
        self.assertEqual(code, 1)
        self.assertIn("gate spec is not approved", out)
        self.assertFalse((self.change / "approval.json").exists())

    def test_approve_plan_refused_when_spec_gate_changed(self) -> None:
        self.approve_change("spec")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "**Then** HTTP 400", "**Then** HTTP 422")
        code, out = self.cli("approve", "--change", CHANGE, "--gate", "plan", answer="y")
        self.assertEqual(code, 1)
        self.assertIn("gate spec changed since approval", out)
        self.assertIn("-  - **Then** HTTP 400", out)
        self.assertIn("+  - **Then** HTTP 422", out)
        self.assertIn("--gate spec", out)
        self.assertNotIn("plan", json.loads((self.change / "approval.json").read_text()))

    def test_root_cause_needs_summary(self) -> None:
        code, out = self.cli("approve", "--bug", BUG, "--gate", "root-cause", answer="y")
        self.assertEqual(code, 1)
        self.assertIn("--summary", out)

    # ---- spec normalization ----
    def test_spec_gate_ignores_adr_and_data_model(self) -> None:
        self.approve_change("spec")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "_(Architecture Decisions: filled by /speckit-plan)_",
                  "### 003-ADR-1: Delete in one transaction")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "_(Data Model: filled by /speckit-plan)_", "No change.")
        self.assertEqual(self.verify("--change", CHANGE, "--gate", "spec")[0], 0)

    def test_spec_gate_ignores_status_line(self) -> None:
        self.approve_change("spec")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "status: approved", "status: implementing")
        self.assertEqual(self.verify("--change", CHANGE, "--gate", "spec")[0], 0)

    def test_spec_gate_changes_outside_plan_sections(self) -> None:
        self.approve_change("spec")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "up to 50 products", "up to 500 products")
        code, out = self.verify("--change", CHANGE, "--gate", "spec")
        self.assertEqual(code, 1)
        self.assertIn("gate spec changed since approval", out)
        self.assertIn("+The system MUST delete up to 500 products at once.", out)

    def test_spec_gate_changes_in_clarifications(self) -> None:
        self.approve_change("spec")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "## Clarifications\n", "## Clarifications\n\n- Q: x → A: y\n")
        self.assertEqual(self.verify("--change", CHANGE, "--gate", "spec")[0], 1)

    def test_normalize_spec_needs_both_headings(self) -> None:
        with self.assertRaises(approval.ApprovalError):
            approval.normalize_spec(SPEC.replace("## Clarifications", "## Notes"))

    # ---- plan gate ----
    def test_plan_gate_changes_with_plan_or_tasks(self) -> None:
        self.approve_change("spec")
        self.approve_change("plan")
        self.assertEqual(self.verify("--change", CHANGE)[0], 0)
        self.edit(f"specs/changes/{CHANGE}/tasks.md", "T001 Endpoint", "T001 Endpoint and UI")
        code, out = self.verify("--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("gate spec matches", out)
        self.assertIn("gate plan changed since approval", out)
        self.assertIn("+- [ ] T001 Endpoint and UI", out)

    def test_plan_gate_changes_with_plan_md(self) -> None:
        self.approve_change("spec")
        self.approve_change("plan")
        self.edit(f"specs/changes/{CHANGE}/plan.md", "Vitest.", "Jest.")
        self.assertEqual(self.verify("--change", CHANGE, "--gate", "plan")[0], 1)

    def test_adr_edit_keeps_spec_gate_but_changes_plan_gate(self) -> None:
        self.approve_change("spec")
        self.approve_change("plan")
        self.edit(f"specs/changes/{CHANGE}/spec.md", "_(Data Model: filled by /speckit-plan)_", "Table x.")
        self.assertEqual(self.verify("--change", CHANGE, "--gate", "spec")[0], 0)
        self.assertEqual(self.verify("--change", CHANGE, "--gate", "plan")[0], 1)

    # ---- verify ----
    def test_verify_without_any_gate(self) -> None:
        code, out = self.verify("--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("no gate approved yet", out)

    def test_verify_missing_gate(self) -> None:
        self.approve_change("spec")
        code, out = self.verify("--change", CHANGE, "--gate", "plan")
        self.assertEqual(code, 1)
        self.assertIn("gate plan is not approved", out)

    def test_verify_missing_file(self) -> None:
        self.approve_change("spec")
        (self.change / "spec.md").unlink()
        code, out = self.verify("--change", CHANGE)
        self.assertEqual(code, 1)
        self.assertIn("not found", out)

    # ---- root-cause gate ----
    def approve_bug(self) -> None:
        code, out = self.cli("approve", "--bug", BUG, "--gate", "root-cause", "--summary", "builder drops max",
                             answer="y")
        self.assertEqual(code, 0, out)
        self.assertIn("builder drops max", out)

    def test_root_cause_gate_records_summary(self) -> None:
        self.approve_bug()
        data = json.loads((self.root / "bugs" / BUG / "approval.json").read_text())
        self.assertEqual(data["root-cause"]["summary"], "builder drops max")
        self.assertEqual(data["root-cause"]["files"],
                         [f"bugs/{BUG}/report.md", f"bugs/{BUG}/investigation.md#Root cause"])
        self.assertEqual(self.verify("--bug", BUG)[0], 0)

    def test_root_cause_gate_changes_with_root_cause_section(self) -> None:
        self.approve_bug()
        self.edit(f"bugs/{BUG}/investigation.md", "keep `max` in the builder", "clamp `max` in the controller")
        code, out = self.verify("--bug", BUG)
        self.assertEqual(code, 1)
        self.assertIn("+- **Fix direction:** clamp `max` in the controller", out)

    def test_root_cause_gate_changes_with_report(self) -> None:
        self.approve_bug()
        self.edit(f"bugs/{BUG}/report.md", "max 100 filters.", "max 200 filters.")
        self.assertEqual(self.verify("--bug", BUG)[0], 1)

    def test_root_cause_gate_ignores_other_sections(self) -> None:
        self.approve_bug()
        self.edit(f"bugs/{BUG}/investigation.md", "- Attempts: none yet", "- Attempts: 1 widened the query; 2 …")
        self.edit(f"bugs/{BUG}/investigation.md", "| 1 | test | fails |", "| 1 | test | fails |\n| 2 | log | x |")
        self.assertEqual(self.verify("--bug", BUG)[0], 0)

    def test_root_cause_section_ignores_headings_in_code(self) -> None:
        section = approval.root_cause_section(self.root, INVESTIGATION)
        self.assertTrue(section.startswith("## Root cause\n"))
        self.assertIn("# a comment line in a code block is not a heading", section)
        self.assertNotIn("Root cause gate", section)

    def test_root_cause_heading_missing_in_template(self) -> None:
        tpl = self.root / approval.TEMPLATE
        tpl.write_text(tpl.read_text().replace("## Root cause\n", "## Cause\n"))
        with self.assertRaises(approval.ApprovalError):
            approval.root_cause_section(self.root, INVESTIGATION)


if __name__ == "__main__":
    unittest.main()
