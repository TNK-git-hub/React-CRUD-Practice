---
name: spec-edge-cases
description: Adds edge-case scenarios with IDs (Given/When/Then, P1–P3, recovery path) to every requirement of the current change by walking each dimension of specs/_system/edge-case-catalog.md against states.md and rules.md; writes them into the change's spec.md and the coverage table checklists/edge-cases.md. Run after /speckit-clarify, before /speckit-checklist edge cases.
argument-hint: "[change folder, default from .specify/feature.json]"
license: Apache-2.0
metadata:
  derived-from: "pm-skills deliver-edge-cases 2.1.1 (Apache-2.0) — see NOTICE.md"
---
<!-- Derived from PM-Skills deliver-edge-cases | https://github.com/product-on-purpose/pm-skills | Apache 2.0 | modified, see NOTICE.md -->

# spec-edge-cases

The happy path is usually well specified; real bugs tend to live in the edge cases. This skill walks
**systematically** through every requirement of the current change, dimension by dimension of the shared
catalog, and adds scenarios with IDs to the spec so later tests carry exactly those IDs. You do NOT write
code, do NOT edit `specs/capabilities/` or `specs/_system/`, do NOT create any file other than the two in Output.

## Input

```text
$ARGUMENTS
```

1. Change folder = the argument above if given; otherwise read `feature_directory` in `.specify/feature.json`.
   Folder not inside `specs/changes/`, or without `spec.md` → **STOP**, tell the user to run
   `/speckit-specify` first.
2. The change's `spec.md`: frontmatter `kind: delta` (missing → STOP), `capabilities`, every requirement
   marked `ADDED` / `MODIFIED` (skip `REMOVED`, `RENAMED`), the section `### Edge Cases (unassigned)`.
3. `specs/_system/edge-case-catalog.md`: dimensions 1–13, priorities, scenario types, coverage table template.
4. For each domain in `capabilities`: `specs/capabilities/<domain>/states.md` and `rules.md`
   (file missing → note it, and use N/A for the dimensions that need it, with the reason "no states.md yet").
5. `specs/_system/nfr.md` (permission matrix, deletion policy) and `glossary.md` if present.

## Method

Work **one requirement at a time**; within each requirement go through **each dimension** in catalog order.
The seven analysis steps of the upstream skill map onto the dimensions like this:

| Upstream step | Catalog dimension |
| --- | --- |
| 1. Define the feature scope | read the requirement, Permissions, happy scenarios |
| 2. Walk through input validation | 1. Input, 3. Missing and empty |
| 3. Explore boundary conditions | 2. Numbers and boundaries, 4. Collections, 8. Time, 10. Resource limits |
| 4. Map error states | 5. State, 6. Permissions, 9. External dependencies, 11. Data and deletion |
| 5. Consider concurrency | 7. Concurrency and ordering |
| 6. Define recovery paths | 12. Error messages and recovery (mandatory in every error scenario) |
| 7. Prioritise by likelihood × impact | P1–P3 per the catalog's priority table |

### Rules per dimension

- Each requirement × dimension pair (1–11 and 13) yields **one of two**: one or more new scenarios, or
  `N/A — <one-line reason>` for that requirement. Never empty; every N/A has a concrete reason.
- Dimension 5: each `✗` cell in `states.md` the requirement can reach needs at least one scenario;
  each `= (no-op)` cell needs an idempotency scenario.
- Dimension 6: denied scenarios say explicitly "calls the backend directly" (constitution, Principle II);
  check against the permission matrix in `nfr.md`.
- Dimension 11: check the deletion policy table in `nfr.md`; a cell still `[NEEDS CLARIFICATION]` → still write
  the scenario, with the affected result written as `[NEEDS CLARIFICATION: deletion policy in nfr.md]`.
- Dimension 13: each rule in `rules.md` that the requirement touches → at least one scenario; decision table →
  **one scenario per table row**. Plus the questions in section 13 of the catalog.
- Every line currently in `### Edge Cases (unassigned)` must become a scenario of the right requirement
  (then delete the line), or stay with `[NEEDS CLARIFICATION: which requirement?]`.
- An existing scenario with the same meaning as one you would add → do not add it; put the old ID in the coverage table.

### Never invent

Numbers, limits, permissions and the deletion policy come **only** from the spec, `specs/_system/*` or `capabilities/*`.
Missing → write the scenario with `[NEEDS CLARIFICATION: <question>]` where the number / permission is needed; never pick a number.
Error message wording may be proposed (in double quotes), since it is a display detail, not a rule.

## Output

### 1. Scenarios in the change's `spec.md`

Append to the **Scenarios** list of the right requirement, right after its last existing scenario:

```markdown
  - `<CODE>-<NNN>-S<n>` (<type>) [P1|P2|P3] — **Given** … **When** … **Then** … → Recovery: …
```

- `<n>` continues from the requirement's highest existing number, **consecutive, no gaps, never renumber**
  old scenarios. For `MODIFIED`, continue after the scenarios copied from the capability.
- `<type>` comes from the catalog's "Scenario types" list; priority per the catalog's P1–P3 table.
- Error scenarios **must** have a user-visible message and `→ Recovery:` (dimension 12): what to do next,
  whether entered data is kept, whether a retry creates a duplicate. Non-error scenarios omit `→ Recovery`.
- Do not change the text of a requirement, its Permissions or existing scenarios. If a requirement looks wrong /
  contradicts `rules.md` or `states.md` → do not fix it; put it in the report and in the Notes column of the coverage table.

### 2. Coverage table `checklists/edge-cases.md`

Overwrite the whole file (create it if missing), following the **coverage table template** at the end of the catalog:

```markdown
# Edge cases — <change>

**Catalog**: specs/_system/edge-case-catalog.md · **Date**: <YYYY-MM-DD>

| Requirement | Dimension | Result | Notes |
| --- | --- | --- | --- |
| ABC-004 | 1. Input | S2, S3 | |
| ABC-004 | 2. Numbers and boundaries | N/A | takes no numeric input |
...

## Summary

| Requirement | New scenarios | P1 | P2 | P3 | N/A |
| --- | --- | --- | --- | --- | --- |

## Open questions

- [NEEDS CLARIFICATION: …] — `<scenario ID>`
```

- Each requirement × each dimension 1–11 and 13 = **exactly one row** (12 rows per requirement). Dimension 12 has
  no row of its own: it is checked inside each error scenario.
- Result column: scenario IDs (short form `S4`) with priority, or `N/A`.

## Self-check before reporting

- [ ] Each ADDED/MODIFIED requirement has all 12 rows in the coverage table; no empty row; every N/A has a reason.
- [ ] Scenario IDs are consecutive within each requirement, unique, old scenarios not renumbered.
- [ ] Every new scenario has a type and P1–P3; every error scenario has a message and `→ Recovery`.
- [ ] Every reachable ✗ cell in `states.md` and every decision-table row in `rules.md` has a scenario.
- [ ] `### Edge Cases (unassigned)` has no unhandled line left.
- [ ] No invented number / limit / permission; gaps are `[NEEDS CLARIFICATION]`.
- [ ] Only two files changed: the change's `spec.md` and `checklists/edge-cases.md`.

Any item failing → fix it and check again.

## Report

1. The Summary table (new scenarios per requirement and priority).
2. Every new `[NEEDS CLARIFICATION]`, numbered, with its scenario ID.
3. Requirements that contradict `rules.md` / `states.md` (if any).
4. Next step: `/speckit-checklist edge cases`, then **stop and wait for the user to approve the spec**.
