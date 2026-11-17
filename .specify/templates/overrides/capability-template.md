---
kind: capability
domain: "[domain]"
feature: "[feature]"
code: "[CODE]"
---

<!--
LIVING SPEC of one FEATURE of a domain: describes what the system DOES now in this area of behavior.
Path: specs/capabilities/[domain]/[feature]/spec.md. The domain's states.md, rules.md and history.md are shared by all
its features and live one level up, in specs/capabilities/[domain]/.
- A feature is a long-lived area of behavior inside a domain (e.g. <domain>/<feature>), listed in the domain's
  "Features" table of specs/_system/domain-model.md. It is NOT a change: one change may touch several features.
- Only /spec-archive may modify this file (merging the delta spec of a finished change).
- Never contains the delta keywords (add, modify, remove, rename, move) of a delta spec.
- Requirement IDs keep the domain code ([CODE]-NNN), are unique in the whole domain and do not change when a
  requirement moves to another feature.
- Requirements are ordered by ascending ID; each requirement records the change that last set or modified it.
- Right after bootstrap: Requirements stays "(none yet)". Requirements appear only after a change is archived.
-->

# Feature: [domain]/[feature] ([CODE])

## Overview

[1–3 sentences: which behaviors of the domain live in this feature, who uses them. Same scope as the feature's row
in the Features table of specs/_system/domain-model.md.]

Domain files: [states.md](../states.md) · [rules.md](../rules.md) · [history.md](../history.md)

## Requirements

_(none yet)_

<!-- Shape of one requirement after archive:

### [CODE]-001: [Requirement name]

The system MUST [behavior].

**[Aspect, e.g. API].** [details copied from the change: tables, JSON, messages verbatim]

**Permissions:** [...]

**Scenarios:**

- `[CODE]-001-S1` (happy, P1)
  - **Given** …
  - **When** …
  - **Then** …
- `[CODE]-001-S2` (permission, P1)
  - **Given** …
  - **When** … (calls the backend directly)
  - **Then** …
  - → Recovery: …
  - Covers: [OTHER]-[NNN]
- **Source:** change [NNN-change-name]

The change's NFR rows go to specs/_system/nfr.md; its Architecture Decisions stay in specs/archive/<change>/spec.md.
-->

## Merged changes

<!-- Written by /spec-archive: one row per archived change that touched this feature. Do not edit by hand. -->

| Change | Date | Change in this feature |
| --- | --- | --- |
| _(none yet)_ | | |
