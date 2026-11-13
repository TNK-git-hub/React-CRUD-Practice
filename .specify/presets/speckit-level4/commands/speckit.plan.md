---
description: Plan one change of the spec harness - plan.md (Technical Context, Constitution Check, Test Strategy, Quickstart) plus the Architecture Decisions and Data Model sections of the change's spec.md.
handoffs:
  - label: Create Checklist
    agent: speckit.checklist
    prompt: Create the quality checklist (checklists/quality.md) for the plan
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
scripts:
  sh: scripts/bash/setup-plan.sh --json
  ps: scripts/powershell/setup-plan.ps1 -Json
  py: scripts/python/setup_plan.py --json
---

<!--
Preset speckit-level4 (tools/speckit-level4/), replaces the core speckit.plan command.
Based on the core plan command (Spec Kit 1.4.0); differs in 4 places:
  1. Creates NO research.md, data-model.md, contracts/ or quickstart.md. A change folder holds only spec.md,
     plan.md, tasks.md and checklists/.
  2. Phase 0 decisions are written as ADRs into "## Architecture Decisions" of the change's spec.md; Phase 1 writes
     "## Data Model" of spec.md. Nothing else in spec.md is touched (the planner's hook enforces it).
  3. Interfaces (API, UI, messages) are the requirement details of spec.md; the plan never restates or extends them.
     Missing detail = a spec problem: stop and report.
  4. plan.md follows .specify/templates/overrides/plan-template.md, incl. the mandatory Test Strategy and Quickstart.
Edit this file in tools/speckit-level4/ then run `specify preset update speckit-level4 --dev tools/speckit-level4`;
do NOT hand-edit .claude/skills/speckit-plan/SKILL.md (generated file).
-->

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

This repo is a level-4 spec harness (read `.claude/CLAUDE.md`). Write in English; quote user-facing product text
verbatim in the product's language, in double quotes. The spec of the change must already be approved by the user.

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `{SCRIPT}` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, FEATURE_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
   FEATURE_DIR not under `specs/changes/` → **STOP** and report.

2. **Load context**: Read FEATURE_SPEC (the delta spec), `.specify/memory/constitution.md`, every file in
   `specs/_system/`, and `specs/capabilities/<domain>/` for each domain in the spec's `capabilities`. Load the
   IMPL_PLAN template (already copied by the script). The worked example `docs/examples/products-price-range-spec.md`
   shows the expected Architecture Decisions and Data Model.

3. **Check the spec before planning**: `[NEEDS CLARIFICATION]` left in the spec, a `_(unassigned)_` row in
   `## Edge Cases & Error Handling`, or a requirement whose details are too thin to build or test from → **STOP**:
   report what is missing; the main session runs `__SPECKIT_COMMAND_CLARIFY__` / `/spec-edge-cases`. Never fix it in
   the plan and never edit those parts of the spec.

4. **Execute plan workflow**: Follow the structure in the IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION"). The first change of an app chooses the stack
     and the strictest type-checking mode (constitution, Principle IV).
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: write the ADRs into `## Architecture Decisions` of spec.md (see Phases)
   - Phase 1: write `## Data Model` of spec.md; fill `## Test Strategy` and `## Quickstart` of plan.md
   - Re-evaluate Constitution Check post-design

## Writing into spec.md

- Only the content **between** the line `## Architecture Decisions` and the line `## Clarifications` may change:
  the ADRs and `## Data Model`. Never touch any heading line, never add a `## ` heading, never edit another section.
- Use the Edit tool, never Write, on spec.md. First edit: replace the line
  `_(Architecture Decisions: filled by /speckit-plan)_` with the ADRs; then replace
  `_(Data Model: filled by /speckit-plan)_` with the data model. Re-planning: edit the existing ADR / Data Model text.
- The planner subagent's hook enforces this (`.claude/hooks/allow_paths.py`, rule `edit-section:`): an edit outside
  that range, or a Write on spec.md, is blocked. Blocked → do not try another way; stop and report.

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Report: branch, IMPL_PLAN path, the ADR IDs written into spec.md (title + decision, one line each), whether
`## Data Model` records a data change, the stack / type-checking mode (first change), open NEEDS CLARIFICATION, and the
next steps per `.claude/CLAUDE.md`: `__SPECKIT_COMMAND_CHECKLIST__` (`checklists/quality.md`) →
`__SPECKIT_COMMAND_TASKS__` → `__SPECKIT_COMMAND_ANALYZE__` → stop and wait for the user to approve plan and tasks.

## Phases

### Phase 0: Decisions (Architecture Decisions in spec.md)

1. **Find the decisions** the change needs: each NEEDS CLARIFICATION in Technical Context, each technology choice,
   each integration, and every point where the spec allows more than one design (parsing, caching, storage,
   UI component, …).

2. **Research** each one (read the code of a brownfield app; dispatch research agents if useful):

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Write one ADR per decision** into `## Architecture Decisions` of spec.md, numbered `<NNN>-ADR-<n>` (NNN = the
   change number), in the template format:

   ```markdown
   ### <NNN>-ADR-<n>: <decision title>

   **Status:** Accepted.

   **Context.** <requirements / NFRs that drive it; what the current code does>

   **Options:**

   | Option | How | <criterion> | <criterion> |
   | --- | --- | --- | --- |

   **Decision.** <the chosen option, concretely>

   **Rationale.** <why it wins against the criteria>

   **Trade-offs.** <what gets worse, and which scenario / NFR guards it>
   ```

   At least two options per ADR; criteria come from the spec (scenarios, NFRs), not from taste.

**Output**: ADRs in spec.md, all NEEDS CLARIFICATION in Technical Context resolved.

### Phase 1: Design (Data Model in spec.md; Test Strategy and Quickstart in plan.md)

**Prerequisites:** Phase 0 complete

1. **Data Model** → `## Data Model` of spec.md: only when the change alters stored data — entities, fields (type,
   required, constraints quoted verbatim from the requirement details), relationships, state transitions, migrations,
   deletion per `specs/_system/nfr.md` (no policy → `[NEEDS CLARIFICATION]`). No stored-data change → one line
   "No data change: <why>".

2. **Interfaces**: the API / UI / message details are already in the spec's requirements. Do not create contracts and
   do not restate them in plan.md. A detail the code needs but the spec lacks → **STOP** and report it as a spec gap.

3. **Test Strategy** → plan.md: every subsection of the template's `## Test Strategy` (runner and commands,
   environment, naming by scenario ID, test level per scenario type, data safety with a guard against dev data).

4. **Quickstart** → plan.md `## Quickstart`: prerequisites, setup commands, and a few run steps with the expected
   result of each, citing scenario IDs. No implementation code, no test code.

**Output**: spec.md (`## Architecture Decisions`, `## Data Model`), plan.md (all sections).

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- ERROR on gate failures or unresolved clarifications
- Never create research.md, data-model.md, contracts/ or quickstart.md
- Never invent limits, numbers, permissions or messages: `[NEEDS CLARIFICATION]`

## Done When

- [ ] plan.md filled, incl. Test Strategy and Quickstart; Constitution Check re-evaluated
- [ ] spec.md `## Architecture Decisions` and `## Data Model` filled; no other part of spec.md changed
- [ ] No research.md, data-model.md, contracts/ or quickstart.md in the change folder
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported to user with branch, plan path, ADRs and next steps
