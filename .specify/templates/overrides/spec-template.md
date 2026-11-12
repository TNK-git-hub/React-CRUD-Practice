---
kind: delta
change: "[NNN-change-name]"
capabilities: ["[domain]"]
primary: "[domain]"
status: draft            # draft | approved | implementing | archived
source: ["[docs/requirements/<file>#<section>]", "roadmap [NNN]"]
---

<!--
INSTRUCTIONS FOR THE AGENT (delete this block once filled in)
- This is the DELTA SPEC of one change, not a living spec. It describes what this change ADDS / MODIFIES / REMOVES.
- Before writing: read specs/_system/* and specs/capabilities/<domain>/ of every related domain.
  Requirement already exists in the capability → use MODIFIED <old ID>; never create a duplicate requirement.
- New requirement ID = the next number of that domain (see the capability spec.md and history.md; removed IDs are never reused).
- Each requirement: one sentence "The system MUST …" describing observable behavior, NO technology.
- Each requirement has at least 1 happy scenario; edge-case scenarios are added by /spec-edge-cases.
- Never invent numbers, limits or permissions: write [NEEDS CLARIFICATION: question].
- Keep the section headings (Overview, Requirements, Success Criteria, Assumptions):
  the Spec Kit core commands (clarify, analyze, checklist, plan) look them up by name.
-->

# Change [NNN]: [Change name]

## Overview

[2–4 sentences: what problem this change solves, for whom, why it is needed. No technology.]

## Requirements

### [domain]

#### ADDED [CODE]-[NNN]: [Requirement name]

The system MUST [observable behavior].

- **Permissions:** [which roles may do it; which roles are denied]
- **Scenarios:**
  - `[CODE]-[NNN]-S1` (happy) [P1] — **Given** [initial state] **When** [action] **Then** [observable result]

#### MODIFIED [CODE]-[NNN]: [Existing requirement name]

[Rewrite the WHOLE requirement and ALL its scenarios as they are after the change — spec-archive replaces the whole block.]

#### REMOVED [CODE]-[NNN]: [Existing requirement name]

- **Reason:** [why it is removed]
- **Migration:** [how existing data / users are handled]

#### RENAMED [CODE]-[NNN]

- **From:** [old name]
- **To:** [new name]

### Edge Cases (unassigned)

<!-- Scratch space for /speckit-clarify. /spec-edge-cases turns each line into a scenario with an ID, then deletes the line here. -->

- [description of an edge case not yet assigned to a requirement]

## Success Criteria

### Measurable Outcomes

- **SC-001:** [measurable outcome with a number; e.g. "a user creates an item in ≤ 3 steps"]

## Assumptions

- [assumption in use; where the spec goes wrong if it is false]

## Out of Scope

- [what this change deliberately does NOT do]
