---
name: spec-archive
description: Merges a finished change's delta spec into the living specs (specs/capabilities/<domain>/<feature>/spec.md by requirement ID, the domain's history.md for removed IDs; ADDED / MODIFIED NFR rows into specs/_system/nfr.md), then moves the change from specs/changes/ to specs/archive/. Stops without writing anything when an ID does not match. Run in the main session only after the CODE and TEST harnesses are done and the test suite is green.
argument-hint: "<change, e.g. 001-product-bulk-delete>"
disable-model-invocation: true
license: MIT
metadata:
  derived-from: "OpenSpec archive-change + sync-specs workflows (MIT) — see NOTICE.md"
---
<!-- Derived from OpenSpec | https://github.com/Fission-AI/OpenSpec | MIT | modified, see NOTICE.md -->

# spec-archive

This is the **only** step allowed to modify `specs/capabilities/` and `specs/_system/nfr.md`. All writes to specs go
through `scripts/change.py`, which validates the whole change first and writes nothing if any check fails.
Never edit `specs/capabilities/<domain>/<feature>/spec.md` or `history.md` by hand in this skill, and never "fix" the
delta spec or the capability to make the script pass — report the problem instead.

Layout the script works on: `specs/capabilities/<domain>/{states.md, rules.md, history.md}` are shared by the domain;
`specs/capabilities/<domain>/<feature>/spec.md` holds one feature's requirements (with its own `## Merged changes`).
There is no `spec.md` at domain level. The delta's `capabilities` lists features (`<domain>/<feature>`) and its
`## Requirements` has one `### <domain>/<feature>` section per feature.

Always run in the **main session**: steps 2 and 4 may need the user's confirmation.

## Input

```text
$ARGUMENTS
```

Script (run from the repo root; Windows: `python` instead of `python3`):

```bash
S=.claude/skills/spec-archive/scripts/change.py
```

## Step 1 — Select the change

- Change = the argument above. Empty → read `feature_directory` in `.specify/feature.json`; still nothing, or
  several candidates in `specs/changes/` → list them and ask the user which one. Never guess.
- The change must be a folder `specs/changes/NNN-<name>/` with a `spec.md` whose frontmatter has `kind: delta`.
- Announce: "Using change: `<change>`".

## Step 2 — Check tasks

```bash
python3 $S status --change <change>
```

- `open_tasks` not empty → show them and **ask the user** whether to archive anyway. No confirmation → stop.
- No `tasks.md` → say so; continue.

## Step 3 — Validate and show the plan (no writes)

```bash
python3 $S sync --change <change> --dry-run
```

- Exit code 1 → **STOP**. Show the `ERROR:` text verbatim, explain each problem in one line, and say what has to
  change (usually: the delta spec, through the normal change flow). Nothing was written; do not retry with edits.
  The script refuses, among others:
  - MODIFIED / REMOVED / RENAMED with an ID that is not in the feature of its section (also when it is in another
    feature of the domain: the message names that feature);
  - ADDED with an ID that already exists in any feature of the domain, or that is in "Removed IDs" of the domain's
    `history.md`;
  - an ID used by two operations (only RENAMED / MOVED + MODIFIED and MOVED + RENAMED of the same ID, in one section,
    are allowed);
  - MOVED without `- **From:**` / `- **To:**`, with To other than its section's feature, From in another domain or
    not in `capabilities`, or an ID that is not in its From feature;
  - a declared feature that does not exist yet and holds anything but ADDED / MOVED, or has no row in the Features
    table of `specs/_system/domain-model.md` (its scope line becomes the new feature's Overview);
  - a `specs/capabilities/<domain>/spec.md` (requirements must live in features) or the same ID in two features;
  - an ID whose code does not match the domain's `code`;
  - `capabilities` frontmatter and `### <domain>/<feature>` sections that do not match (the From feature of a MOVED
    needs no section);
  - an ADDED / MODIFIED requirement without a `<ID>-S<n>` scenario, or with `[NEEDS CLARIFICATION]` still open;
  - a result that would leave ADDED / MODIFIED / REMOVED / RENAMED / MOVED words in `specs/capabilities/` or `nfr.md`;
  - an NFR row whose Change is not `Applies` / `ADDED` / `MODIFIED`, an ADDED NFR ID that already exists, a MODIFIED
    NFR ID that does not exist or sits in another section, a Category that is not a `## ` section of `nfr.md` with an
    ID table, or a value for a column that section does not have.
- Exit code 0 → show the plan per feature from the JSON (`applied`, keys `<domain>/<feature>`), in the order the
  script applies it: MOVED → RENAMED → MODIFIED → REMOVED → ADDED. Point out new feature folders (`files`).

## Step 4 — Confirm and sync

Ask the user to confirm the plan (one question: "Merge these into capabilities?"). Then:

```bash
python3 $S sync --change <change>
```

What the script does, per domain, for the features in `capabilities`:

- **MOVED** `<ID>`: moves the whole block from the From feature to the feature of its section (To); ID, content and
  Source unchanged.
- **RENAMED** `<ID>`: changes only the name in `### <ID>: <name>`; `From` must equal the current name.
- **MODIFIED** `<ID>`: replaces the whole block (statement, Permissions, every scenario) with the delta's block.
- **REMOVED** `<ID>`: deletes the block, adds a row to "Removed IDs" of the domain's `history.md` (ID, feature,
  change, Reason, `Replaced by` if the delta gives `- **Replaced by:**`). That ID is never reissued in the domain.
- **ADDED** `<ID>`: adds the block; requirements are kept in ascending ID order. A declared feature that does not
  exist yet is created first: `<domain>/<feature>/spec.md` with the Overview taken from its Features-table row.
- Every ADDED / MODIFIED block gets `- **Source:** change <change>` (replacing an older Source line).
- Adds a row to `## Merged changes` of **each touched feature's** `spec.md`: change · date · `new` / `updated` /
  `dropped` / `renamed` / `moved … to / from <feature>` + IDs. Features the change does not touch are not written.

And once for the change, from its `## Non-Functional Requirements` table (`applied["_system/nfr"]`):

- **ADDED** `NFR-NNN`: appended to the ID table of the `nfr.md` section named in Category, with the columns that
  table has (ID, Requirement, Number, Source, Verification).
- **MODIFIED** `NFR-NNN`: the row with that ID is replaced.
- **Applies**: ignored.

Everything else in the change's spec.md (Architecture Decisions, Data Model, Edge Cases, Traceability…) stays in the
change and goes to `specs/archive/<change>/` in step 5.

## Step 5 — Archive

```bash
python3 $S archive --change <change>
```

- Sets `status: archived` in the delta frontmatter and moves `specs/changes/<change>/` to
  `specs/archive/<change>/` (same name, no date prefix).
- Refuses when `specs/archive/<change>/` already exists (never overwrites) or when the capabilities do not reflect
  the delta yet. On refusal: stop and report; do not delete or rename anything to get around it.

## Step 6 — Knowledge base bookkeeping

If they exist, update (these are outside `specs/capabilities/`, so editing them here is allowed):

- `specs/_system/roadmap.md`: the change's row → Status `archived`.
- `specs/_system/traceability.md`: fill the "Requirement ID" column of the rows this change owns with the
  ADDED / MODIFIED IDs.

## Step 7 — Verify and report

```bash
git status --short specs/
grep -rnE '\b(ADDED|MODIFIED|REMOVED|RENAMED|MOVED)\b' specs/capabilities/ specs/_system/nfr.md || echo "no delta keywords"
python3 .specify/scripts/spec_check.py --stage archive --change <change>
```

Report:

1. Change archived and where to (`specs/archive/<change>/`).
2. Per feature: requirements moved / renamed / updated / dropped / new, with IDs; new feature folders.
3. Files changed (`<feature>/spec.md`, the domain's `history.md` when an ID was removed, `nfr.md`, roadmap /
   traceability).
4. Next step per `CLAUDE.md`: two commits (code; spec) → push → PR into the base branch (section "Branches" of the root `CLAUDE.md`).

Do not commit or push in this skill.
