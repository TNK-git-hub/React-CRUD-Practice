---
description: Phase 2 - create the implementation plan and test cases for an approved spec
argument-hint: [feature-id]
---

Create the implementation plan for an approved spec.

Target: `$ARGUMENTS`, or (if empty) the most recent feature in `context/features/` whose Gate 1 is approved.

Use the `implementation-planning` skill: write `03-plan.md` and `04-test-cases.md` with sequential tasks only (no `[P]`), run the consistency check, then present the plan and wait for my approval (Gate 2). On approval, store the plan hash and `diffBase` in `status.json`, then continue automatically into the `tdd-loop` skill.
