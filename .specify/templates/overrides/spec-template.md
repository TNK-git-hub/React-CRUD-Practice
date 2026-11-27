---
kind: delta
change: "[NNN-change-name]"
capabilities: ["[domain]/[feature]"]   # every feature the change touches, incl. the From of a MOVED
primary: "[domain]/[feature]"
status: draft            # draft | approved | implementing | archived
source: ["[docs/requirements/<file>#<section>]", "roadmap [NNN]"]
---

<!--
INSTRUCTIONS FOR THE AGENT (delete this block once filled in)

This is the DELTA SPEC of one change: everything the change adds / modifies / removes, at full detail.
Worked example: `docs/examples/` _(none yet: fill in when bootstrapping a new system)_. Write it in English; quote user-facing product text
(UI labels, messages, emails) verbatim in the product's language, in double quotes.

Who fills which section:

| Section                         | Filled by                                                        |
| ------------------------------- | ---------------------------------------------------------------- |
| frontmatter, Overview           | /speckit-specify                                                 |
| Success Criteria, Scope         | /speckit-specify (sharpened by /speckit-clarify)                 |
| Requirements                    | /speckit-specify: statement, details, Permissions, happy scenarios |
|                                 | /spec-edge-cases: every other scenario                           |
| Non-Functional Requirements     | /speckit-specify                                                 |
| Edge Cases & Error Handling     | /speckit-clarify adds rows (Scenario "_(unassigned)_");          |
|                                 | /spec-edge-cases fills the Scenario column and adds rows         |
| Architecture Decisions          | /speckit-plan                                                    |
| Data Model                      | /speckit-plan (only when the change alters stored data)          |
| Clarifications, Open Questions  | /speckit-clarify                                                 |
| Assumptions                     | /speckit-specify, /speckit-clarify                               |
| Traceability                    | /speckit-specify, updated by /spec-edge-cases                    |

Parsed by scripts — keep EXACTLY (change.py merges Requirements into specs/capabilities/<domain>/<feature>/spec.md):
- frontmatter keys kind, change, capabilities, primary, status, source. capabilities / primary are features,
  written "<domain>/<feature>" (names from the Features table of specs/_system/domain-model.md).
- "## Requirements" → "### <domain>/<feature>" (one per entry in capabilities; the From feature of a MOVED needs no
  section of its own) → "#### ADDED|MODIFIED|REMOVED|RENAMED|MOVED <CODE>-<NNN>: <name>".
- A feature that does not exist yet is created by archive: list it in capabilities, give it a row in the
  Features table of domain-model.md (its scope becomes the feature's Overview), and put only ADDED / MOVED in its section.
- Scenario IDs in backticks: `<CODE>-<NNN>-S<n>`. Inside a requirement block never put another requirement's
  scenario ID in backticks (write it plain, e.g. "see ABC-003-S10"); use "Covers:" for cross-checks.
- No "##", "###" or "####" heading inside a requirement: use bold paragraph labels ("**API.**", "**UI.**").
- REMOVED / RENAMED / MOVED fields are bullets: "- **Reason:**", "- **Migration:**", "- **Replaced by:**", "- **From:**", "- **To:**".
- The whole requirement block (statement, details, Permissions, Scenarios) is copied into the feature spec:
  never write ADDED / MODIFIED / REMOVED / RENAMED / MOVED inside it.
Kept by name for core Spec Kit commands: Overview, Requirements, Success Criteria, Assumptions, Clarifications, Out of Scope.

Never invent numbers, limits, messages or permissions: write [NEEDS CLARIFICATION: question].

Self-contained: archive merges ONLY the requirement blocks (and NFR rows). So:
- A behavior that is still true after the change (loading state, layout, "the server filters all <domain> records", an
  existing rule the change relies on) goes into the details of a requirement, never into Assumptions.
- An existing rule of a capability the change relies on is written where it applies as "follows <ID>" with its source
  (e.g. "follows ABC-002: a new range returns to page 1 (capability <domain>/<feature>)").
- Never point to another change or to research instead of stating the content: no "as for change 001", "as in
  change 001", "see research R2". State the behavior itself; a source in parentheses is fine when it is a capability ID, a `specs/_system/` file, a code path or `docs/requirements/`; never `specs/archive/` (a rule found only
  in the archive means the capability is missing it: stop and report).
-->

# Change [NNN]: [Change name]

## Overview

<!-- /speckit-specify. No technology here. -->

### Context

[What exists today, what problem this change solves, for whom. Brownfield: say which existing behaviors change.]

### Goals

- **[Goal]:** [one line, user-visible outcome]

## Success Criteria

<!-- /speckit-specify. Each criterion is measurable: a number from the input or specs/_system/nfr.md, and how it is
     measured. No number → [NEEDS CLARIFICATION]. -->

- **SC-001:** [measurable outcome with a number; how it is measured]

## Scope

<!-- /speckit-specify. Out of Scope cites its source (requirement document, roadmap, NFR) when there is one;
     input silent → one line [NEEDS CLARIFICATION: what is out of scope?]. -->

### In Scope

- [what this change delivers]

### Out of Scope

- [what this change deliberately does NOT do] ([source])

## Requirements

<!--
/speckit-specify writes each requirement: the "The system MUST …" statement, the details, Permissions and at least
one happy scenario. /spec-edge-cases adds the other scenarios (walking specs/_system/edge-case-catalog.md).
Existing requirement in a feature → MODIFIED <old ID> under that feature's section, never a duplicate. New ID = next
free number of the DOMAIN (every <domain>/<feature>/spec.md + the domain's history.md + ADDED IDs of open changes;
removed IDs are never reused). An ID never changes when its requirement moves to another feature (MOVED).

Details: anything the tests need to be exact — tables (parameters, checks in order, messages), JSON bodies, headers,
status / error codes, URL state. Message text is quoted verbatim.

Scenario format:
- one bullet per scenario: `<ID>` (<type>, <P1|P2|P3>); type from the catalog's "Scenario types";
- nested bullets **Given** / **When** / **Then**; Then states exact observable values: status code, header, body field,
  verbatim message, counts, URL;
- "→ Recovery:" for every error scenario (what the user does next; is entered data kept; does a retry duplicate);
- "Covers: <other requirement ID>" when the scenario also verifies another requirement.
A shared fixture may be stated once, before the first scenario.
-->

### [domain]/[feature]

#### ADDED [CODE]-[NNN]: [Requirement name]

The system MUST [observable behavior, one sentence].

**[Aspect, e.g. API].** [Detail the tests need:]

| [Column] | [Column] | [Column] |
| --- | --- | --- |
| [value] | [value] | [value] |

```json
{ "[field]": "[value]" }
```

**[Aspect, e.g. UI].** [Labels, messages verbatim in double quotes, where they appear, URL state.]

**Permissions:** [which roles may do it; which roles are denied, and what they get]

**Scenarios:**

[Fixture for scenarios unless stated: …]

- `[CODE]-[NNN]-S1` (happy, P1)
  - **Given** [initial state]
  - **When** [action: UI steps, or the exact request]
  - **Then** [exact observable result]
- `[CODE]-[NNN]-S2` ([type], P2)
  - **Given** [initial state]
  - **When** [action]
  - **Then** [exact observable result, e.g. HTTP 400; `message` contains "[verbatim]"]
  - → Recovery: [what the user does next; data kept; retry safe?]
  - Covers: [OTHER-CODE]-[NNN]

#### MODIFIED [CODE]-[NNN]: [Existing requirement name]

[Rewrite the WHOLE requirement as it is after the change — statement, details, Permissions and ALL scenarios
(existing ones keep their IDs). spec-archive replaces the whole block.]

#### REMOVED [CODE]-[NNN]: [Existing requirement name]

- **Reason:** [why it is removed]
- **Migration:** [how existing data / users are handled]
- **Replaced by:** [new ID or —]

#### RENAMED [CODE]-[NNN]

- **From:** [old name]
- **To:** [new name]

#### MOVED [CODE]-[NNN]: [Existing requirement name]

[Written under the section of the feature it moves TO. The block moves unchanged and keeps its ID; to change its
content as well, add a MODIFIED of the same ID in the same section. Both features must be in capabilities.]

- **From:** [feature it leaves, e.g. catalog]
- **To:** [feature of this section, e.g. filtering]
- **Reason:** [why it belongs to the other feature]

## Non-Functional Requirements

<!-- /speckit-specify. One row per NFR of specs/_system/nfr.md this change relies on or changes.
     Columns = the columns of nfr.md (ID, Requirement, Number, Source, Verification) + Change + Category.
     Change: Applies (unchanged, relied on; ignored by spec-archive) | ADDED (next free NFR ID, must not exist yet) |
     MODIFIED (existing ID, full new row). spec-archive copies ADDED / MODIFIED rows into specs/_system/nfr.md.
     Category = exactly the "## " section name of nfr.md that holds the row. Number "—" when there is none.
     Verification: scenario ID, SC-xxx, test or review. -->

| ID | Change | Category | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-[NNN] | Applies | [Performance] | [requirement as in nfr.md] | [number as in nfr.md] | [source as in nfr.md] | [SC-001 / scenario ID / review] |
| NFR-[NNN] | ADDED | [section of nfr.md] | [new requirement] | [number or —] | [source] | [how it is checked] |

## Edge Cases & Error Handling

<!-- /speckit-clarify adds a row per edge case it settles, Scenario "_(unassigned)_".
     /spec-edge-cases turns each unassigned row into a scenario and adds a row per scenario it writes.
     No row may stay "_(unassigned)_" when the spec is approved. -->

| Situation | Decision | Scenario |
| --- | --- | --- |
| [situation] | [what the system does] | [CODE]-[NNN]-S[n] |

**Fallback mode.** [Only when a dependency can fail: what the system does while it is down (degraded behavior,
messages, recovery), with scenario IDs. Otherwise delete this paragraph.]

## Architecture Decisions

<!-- /speckit-plan. One ADR per decision a reviewer must approve. /speckit-specify keeps only the placeholder line
     below this comment; the plan replaces that line with the ADRs (by Edit: the placeholder must appear exactly once
     in the spec, so never copy it elsewhere). ADR format:

### [NNN]-ADR-1: [Decision title]

**Status:** [Proposed | Accepted | Superseded by [NNN]-ADR-[n]].

**Context.** [Forces: which requirements / NFRs drive it, what the current code does.]

**Options:**

| Option | How | [Criterion] | [Criterion] |
| --- | --- | --- | --- |
| [option] | [one line] | [value] | [value] |

**Decision.** [The chosen option, concretely.]

**Rationale.** [Why it wins against the criteria above.]

**Trade-offs.** [What gets worse, and which scenario / NFR guards it.]
-->

_(Architecture Decisions: filled by /speckit-plan)_

## Data Model

<!-- /speckit-plan. Only when the change alters stored data: entities, fields (type, required, constraints quoted
     verbatim), migrations, deletion per specs/_system/nfr.md. Otherwise one line: "No data change: [why]".
     /speckit-specify keeps only the placeholder line below this comment; the plan replaces it (it must appear
     exactly once in the spec). -->

_(Data Model: filled by /speckit-plan)_

## Clarifications

<!-- /speckit-clarify appends one session per run. -->

### Session [YYYY-MM-DD]

- Q: [question] → A: [answer]

## Assumptions

<!-- Only what is TEMPORARY to this change (true while it is in progress, dropped at archive): e.g. "change 001's
     code is in place", "this change is not in roadmap.md". Say where the spec goes wrong if one is false.
     A behavior that stays true after the change is NOT an assumption: write it in the requirement details
     (Assumptions are not merged into the feature spec at archive). -->

- [assumption]

## Open Questions

<!-- Only questions that do NOT block this change, each with a provisional direction the reviewer approved.
     A blocking question is a [NEEDS CLARIFICATION] in the section it affects, never here. -->

1. **[Topic].** [Question.] Provisional direction: [what this change does meanwhile]. Approved by: [who, date].
   Does not block this change.

## Traceability

<!-- /speckit-specify, updated by /spec-edge-cases. Every requirement lists all its scenarios, plus scenarios of
     other requirements that cover it ("Covers"). Every NFR row of the table above appears here. -->

| Requirement | Scenarios |
| --- | --- |
| [CODE]-[NNN] | S1–S[n]; also [OTHER]-[NNN]-S[n] (Covers) |

| NFR | Verified by |
| --- | --- |
| NFR-[NNN] | [SC-001 / scenario ID / review] |
