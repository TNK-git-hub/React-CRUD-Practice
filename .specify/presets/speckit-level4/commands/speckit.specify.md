---
description: Create a delta spec for one change in specs/changes/NNN-<name>/spec.md, against the living capability specs.
handoffs:
  - label: Clarify Spec Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
    send: true
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
scripts:
  sh: scripts/bash/resolve-template.sh spec-template --json
  ps: scripts/powershell/resolve-template.ps1 spec-template -Json
  py: scripts/python/resolve_template.py spec-template --json
---

<!--
Preset speckit-level4 (tools/speckit-level4/), replaces the core speckit.specify command.
Differs from the core command in 5 places:
  1. The change number comes from .specify/scripts/next_change.py; the folder is specs/changes/NNN-<name>/.
  2. Creates branch NNN-<name> itself (this repo does not use the Spec Kit git extension).
  3. Reads specs/_system/* and specs/capabilities/<domain>/ before writing.
  4. Existing requirement → MODIFIED <old ID>; new requirement → ADDED with the domain's next ID.
  5. Fills the frontmatter kind/change/capabilities/primary/status/source.
  Also: never invents numbers, limits, permissions or deletion policy (drops the core command's
  3-question limit for these) and never asks the user mid-way — questions are left for __SPECKIT_COMMAND_CLARIFY__.
Edit this file in tools/speckit-level4/ then re-run `specify preset add --dev tools/speckit-level4`;
do NOT hand-edit .claude/skills/speckit-specify/SKILL.md (generated file).
-->

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before specification)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_specify` key
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

The text the user typed after `__SPECKIT_COMMAND_SPECIFY__` in the triggering message **is** the
feature description. Assume you always have it available in this conversation even if `{ARGS}`
appears literally below. Do not ask the user to repeat it unless they provided an empty command.

This repo is a level-4 spec harness (read `.claude/CLAUDE.md`). Everything is written in English.
This command creates **one** change and writes only to `specs/changes/<change>/` and
`.specify/feature.json`. It does not modify `specs/capabilities/`, `specs/_system/` or code.

### Step 1 — Read the knowledge base (before writing anything)

1. Read `.claude/CLAUDE.md` (flow, ID conventions, **domain code table**) and `.specify/memory/constitution.md`.
2. Read every file present in `specs/_system/`: `glossary.md`, `domain-model.md`, `nfr.md`, `roadmap.md`,
   `traceability.md`, `edge-case-catalog.md`. A missing file is noted, never created.
3. Determine the domains the feature touches, using the glossary, domain model and domain code table:
   - Each domain must be in the domain code table of `CLAUDE.md` **and** have a folder
     `specs/capabilities/<domain>/`. Either one missing → **STOP**, tell the user that the new domain must
     be registered first (via `/spec-bootstrap` or by editing the code table). Never register it yourself.
   - `primary` = the domain that holds most of the change's behavior.
4. For **each** related domain, read `specs/capabilities/<domain>/spec.md`, `states.md`, `rules.md`,
   `history.md`. List the existing requirements (ID, name, behavior summary) and the removed IDs.
5. If `roadmap.md` has a change row matching the feature: use exactly that row's short name and put the row
   in frontmatter `source`. No matching row → still create the change, but add to Assumptions:
   "This change is not in roadmap.md".

### Step 2 — Check the input

Good input covers 5 points: **who** (role), **what**, **why**, **constraints** (limits, permissions, data),
**out of scope**. A missing point → do not guess; put `[NEEDS CLARIFICATION: …]` at the right place in the spec.

### Step 3 — Number, branch and folder

1. Make a 2–4 word English kebab-case short name, action-noun style (e.g. `product-bulk-delete`).
   Matching roadmap row → use that row's name.
2. Run from the repo root:

   ```bash
   python3 .specify/scripts/next_change.py --name <short-name> --json
   ```

   (Windows: `python` instead of `python3`.) Take `FEATURE_NUM`, `CHANGE_NAME`, `FEATURE_DIR` from the JSON.
   Script error → **STOP** and report the error verbatim. Never count numbers by hand.
   If the change number differs from the number of the matching roadmap row → tell the user, still use the script's number.
3. Create the branch:
   - `git rev-parse --abbrev-ref HEAD`. If the current branch is not `new-project` → state the current branch
     and **ask the user** whether to create the change branch from here; stop until confirmed.
   - Branch `CHANGE_NAME` already exists (`git rev-parse --verify --quiet <CHANGE_NAME>`) → **STOP**, tell the user.
   - `git checkout -b <CHANGE_NAME>`. Uncommitted changes follow to the new branch; list them in the report.
4. Get the template: run `{SCRIPT}` from the repo root and read `TEMPLATE_CONTENT` (the delta override in
   `.specify/templates/overrides/spec-template.md`). Script error → **STOP** and report it. Never copy the
   template file from disk instead of using the script.
5. `mkdir -p <FEATURE_DIR>`, write `TEMPLATE_CONTENT` to `<FEATURE_DIR>/spec.md` as the starting point.
6. Write `.specify/feature.json` with the real value:

   ```json
   { "feature_directory": "specs/changes/<CHANGE_NAME>" }
   ```

   Later commands (`__SPECKIT_COMMAND_CLARIFY__`, `__SPECKIT_COMMAND_PLAN__`, …) find the change through this file.

### Step 4 — Write the delta spec

Write into `<FEATURE_DIR>/spec.md` following the template exactly; keep the headings
(`Overview`, `Requirements`, `Success Criteria`, `Assumptions`, `Out of Scope`) because the core commands look
them up by name. Delete the template's HTML guide block once filled.

**Frontmatter** (all keys required):

```yaml
---
kind: delta
change: "<CHANGE_NAME>"
capabilities: ["<domain>", ...]   # every domain that has a section under Requirements
primary: "<domain>"
status: draft
source: ["docs/requirements/<file>#<section>", "roadmap <NNN>"]   # real sources only; drop an element that does not exist
---
```

**Requirements** — one `### <domain>` section per domain in `capabilities`, `primary` first:

- Behavior that **already has** a requirement in the capability (same behavior, even under another name) →
  `#### MODIFIED <old ID>: <name>`: rewrite the **whole** requirement and **all** its scenarios as they are after
  the change (spec-archive replaces the whole block). Never create a new requirement with the same meaning.
- Removing an existing requirement → `#### REMOVED <ID>: <name>` with **Reason** and **Migration**.
- Rename only → `#### RENAMED <ID>` with **From** / **To**.
- New behavior → `#### ADDED <CODE>-<NNN>: <name>`.
  - `<CODE>` comes from the domain code table. `<NNN>` = the highest number in use for that code + 1, taking
    into account **all of**: requirements in `capabilities/<domain>/spec.md`, IDs in the "Removed IDs" table of
    `history.md`, and `ADDED` IDs in other changes currently in `specs/changes/*/spec.md`.
    A removed ID is **never** reissued. Several new requirements → consecutive numbers.
- Only use MODIFIED / REMOVED / RENAMED with an ID that **really exists** in the capability; otherwise never invent an ID.
- Each requirement: one sentence "The system MUST …" about observable behavior, no technology;
  a **Permissions** line; at least one scenario `<ID>-S1` (happy) [P1] in **Given / When / Then** form.
  Edge-case scenarios are added by `/spec-edge-cases`; edge cases you think of now go temporarily into
  `### Edge Cases (unassigned)`.
- Rules in `rules.md` and transitions in `states.md` are the reference: a requirement must not contradict them;
  if it does → write `[NEEDS CLARIFICATION]` instead of picking a side.

**Never invent** (hard rule of this repo, overrides the core command's "make informed guesses" guidance):

- Numbers, limits (maximum count, length, duration), permissions (which roles may / are denied) and the data
  deletion policy come **only** from the input, `specs/_system/*` or `capabilities/*`. Not there → write
  `[NEEDS CLARIFICATION: <specific question>]` on that very line. **No limit on the number** of such markers.
- Deletion: follow the "Data and deletion policy" table in `nfr.md`; that cell still `[NEEDS CLARIFICATION]`
  or missing → write `[NEEDS CLARIFICATION]` in the spec, never choose soft or hard delete.
- Other details (layout, message wording…) may use reasonable defaults, recorded under **Assumptions**.

**Success Criteria**: measurable, with numbers taken from the input / `nfr.md`; no number → `[NEEDS CLARIFICATION]`.
**Out of Scope**: from the input; input silent → one line `[NEEDS CLARIFICATION: what is out of scope?]`.

### Step 5 — Quality self-check

Create `<FEATURE_DIR>/checklists/requirements.md`:

```markdown
# Specification Quality Checklist: <CHANGE_NAME>

**Purpose**: Validate the delta spec before clarify / plan
**Created**: <YYYY-MM-DD>
**Feature**: [spec.md](../spec.md)

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] All mandatory sections completed; template guide block removed

## Delta Format

- [ ] Frontmatter has kind: delta, change, capabilities, primary, status, source
- [ ] Every domain in `capabilities` has a `### <domain>` section, and vice versa
- [ ] Every MODIFIED / REMOVED / RENAMED ID exists in the capability spec
- [ ] No ADDED requirement duplicates an existing requirement
- [ ] ADDED IDs are the next free numbers of the domain (incl. history.md and other open changes)
- [ ] Every requirement has a Permissions line and at least one Given/When/Then scenario with an ID

## Requirement Completeness

- [ ] No invented numbers, limits, permissions or deletion policy (each is sourced or [NEEDS CLARIFICATION])
- [ ] Requirements are testable and unambiguous
- [ ] Success criteria are measurable and technology-agnostic
- [ ] Scope is clearly bounded (Out of Scope filled or marked)
- [ ] Assumptions listed

## Notes

- Edge-case scenarios are added later by /spec-edge-cases (not checked here).
- [NEEDS CLARIFICATION] markers are expected at this stage; __SPECKIT_COMMAND_CLARIFY__ resolves them.
```

Review the spec against each item. A failing item (not counting `[NEEDS CLARIFICATION]`) → fix the spec and
review again (at most 3 rounds); still failing → record it under Notes and tell the user. Tick passing items.

**Do not ask the user anything in this command** (it may run in a subagent). Every `[NEEDS CLARIFICATION]` is
left for `__SPECKIT_COMMAND_CLARIFY__`, which runs in the main session.

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_specify`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_specify` key.
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

Tell the user:

- The branch created and the change folder (`specs/changes/<CHANGE_NAME>/`), file `spec.md`.
- Domains (`capabilities`, `primary`) and the requirements: ADDED / MODIFIED / REMOVED / RENAMED with IDs.
- **Every** `[NEEDS CLARIFICATION]`, numbered, with its location.
- The checklist result.
- Next steps per `CLAUDE.md`: `__SPECKIT_COMMAND_CLARIFY__` (main session) → `/spec-edge-cases` →
  `__SPECKIT_COMMAND_CHECKLIST__ edge cases` → stop and wait for spec approval.

## Done When

- [ ] Branch `<CHANGE_NAME>` created; `.specify/feature.json` points to `specs/changes/<CHANGE_NAME>`
- [ ] `spec.md` follows the delta template, frontmatter complete, IDs follow the conventions, no invented numbers / permissions
- [ ] `checklists/requirements.md` reviewed
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Reported as described in Completion Report
