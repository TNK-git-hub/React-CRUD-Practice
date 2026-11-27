---
name: requirement-analysis
description: Business analysis skill that turns a raw user requirement into an approved, testable specification through a structured dialogue (independent questions batched, dependent questions asked next), then runs a clarification pass for ambiguities. Use when the user describes a new feature, change request, or user story, or runs /feature or /requirement.
---

# Requirement Analysis (Phase 1)

Turn a vague request into a spec precise enough that tests can be derived from it mechanically. **Do not write code or plans in this phase.**

Based on: obra/superpowers `brainstorming` (Socratic, one-question-at-a-time dialogue) and GitHub spec-kit `/specify` + `/clarify` (structured spec + ambiguity taxonomy).

## Output

```
context/features/<YYYYMMDD>-<slug>/
├── STATUS.md          # from ai-dev-workflow/templates/STATUS.md
├── 01-discussion.md   # Q&A log, decisions, rejected options (templates/discussion.md)
└── 02-spec.md         # approved specification (templates/spec.md)
```

## Process

### Step 1: Understand context (silent)
- Read `context/project/*` and skim related code/docs so you don't ask questions the codebase already answers.
- Check `context/features/` for related or overlapping features.
- Create the feature folder from the feature templates (`status.json`, `STATUS.md`), set `branch` to `feat/<id>`, create or check out that branch if git is available, and claim `context/ACTIVE.json`.

### Step 2: Restate
Restate the request in 2-4 sentences: who, what, why. Ask the user to confirm or correct.

### Step 3: Elicit
- Skip anything the codebase or the user already answered.
- Put every question whose answer does not depend on another unknown into **one message**, at most 5, each with a recommended option. Send a later message only when the next question depends on an answer.
- Stop when more questions would not change the design or the tests.
- Log every Q&A and decision in `01-discussion.md` as you go (not at the end).

| Dimension | Ask about |
|---|---|
| Goal & value | Problem being solved, success metric, why now |
| Actors & roles | Who uses it, permissions per role |
| Scope | In scope / explicitly out of scope (YAGNI: cut aggressively) |
| Main flow | Happy path step by step |
| Alternative & error flows | Invalid input, empty states, failures of dependencies, concurrency, retries |
| Business rules | Calculations, limits, validation, state transitions |
| Data | Entities, fields, constraints, retention, PII |
| Interfaces | UI source per `ui-source.md`, API contract, events, integrations |
| Non-functional | Performance, security/authz, audit, i18n, accessibility, compatibility |
| Constraints | Deadlines, tech constraints, backward compatibility, migrations |

### Step 4: Propose approaches (when there is a design choice)
Offer 2-3 approaches with trade-offs and a recommendation. Record the chosen one and why in `01-discussion.md`.

### Step 5: Draft the spec
Fill `templates/spec.md`. Requirements:
- User stories follow INVEST.
- Every acceptance criterion has an ID (`AC-01`...) and uses **Given / When / Then** with concrete values.
- Each AC is independently testable and unambiguous; cover error and edge cases, not just the happy path.
- Mark unresolved items inline with `[NEEDS CLARIFICATION: question]`.
- **UI source.** Read `context/project/ui-source.md` before drafting section 8.
  - `none`: do not add screens. If the user wants UI anyway, stop and ask them to change the mode.
  - `figma`: each screen is the file URL plus `node-id`, including empty, loading, and error when the story has those states. Do not copy pixels into the spec. A screen without a node-id, or "make it look nice", is `[NEEDS CLARIFICATION]`.
  - `codebase`: each screen names the reference path and what may differ. A missing path is `[NEEDS CLARIFICATION]`.
  - A feature with no UI writes `UI source: n/a` in section 8.

### Step 6: Clarification pass (spec-kit /clarify)
Scan the draft against this taxonomy and list what is missing or vague: functional scope, data model, UX flow, non-functional qualities, integrations, edge cases, constraints/trade-offs, terminology consistency, completion signals.
- Ask at most **5** targeted questions in total, batched the same way as Step 3, highest impact first.
- Fold each answer back into the spec immediately and remove the marker.

### Step 7: GATE 1
Present a short summary: goal, scope in/out, number of ACs, key decisions, risks. Ask the user to **approve** or request changes. On approval, follow the hash procedure in `ai-dev-workflow`: set `gates.spec` to `approved` with the sha256 of `02-spec.md`, mirror it in `STATUS.md`, claim `context/ACTIVE.json`, and **immediately start `implementation-planning`**. A verbal approval without the hash is not Gate 1.

## Rules

- Never assume a business rule. If it matters for behavior or tests, ask.
- Vague words (`fast`, `secure`, `user-friendly`, `etc.`, `and so on`) must become measurable statements or be removed.
- Keep the spec about **what/why**, not **how**. Technical design goes into the plan. A Figma `node-id` or a reference path is the source, not a pixel spec.
- Gate 1 does not approve a UI spec that still lacks its node-id (`figma`) or reference path (`codebase`).
- If the request is too large (more than ~10 ACs or several independent subsystems), propose splitting it into multiple features and spec the first one.
