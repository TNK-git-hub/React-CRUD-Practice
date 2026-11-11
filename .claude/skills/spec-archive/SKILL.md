---
name: spec-archive
description: Merges a finished change's delta spec into the living specs (specs/capabilities/<domain>/spec.md + history.md) by requirement ID, then moves the change from specs/changes/ to specs/archive/. Stops without writing anything when an ID does not match. Run in the main session after /speckit-converge reports Converged and the test suite is green.
argument-hint: "<change, e.g. 001-product-bulk-delete>"
disable-model-invocation: true
license: MIT
metadata:
  derived-from: "OpenSpec archive-change + sync-specs workflows (MIT) — see NOTICE.md"
---
<!-- Derived from OpenSpec | https://github.com/Fission-AI/OpenSpec | MIT | modified, see NOTICE.md -->

# spec-archive

This is the **only** step allowed to modify `specs/capabilities/`. All writes to specs go through
`scripts/change.py`, which validates the whole change first and writes nothing if any check fails.
Never edit `specs/capabilities/*/spec.md` or `history.md` by hand in this skill, and never "fix" the delta spec
or the capability to make the script pass — report the problem instead.

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
  - MODIFIED / REMOVED / RENAMED with an ID that is not in the capability;
  - ADDED with an ID that already exists, or that is in "Removed IDs" of `history.md`;
  - an ID used by two operations (only RENAMED + MODIFIED of the same ID is allowed);
  - an ID whose code does not match the domain's `code`;
  - `capabilities` frontmatter and `### <domain>` sections that do not match;
  - an ADDED / MODIFIED requirement without a `<ID>-S<n>` scenario, or with `[NEEDS CLARIFICATION]` still open;
  - a result that would leave ADDED / MODIFIED / REMOVED / RENAMED words in `specs/capabilities/`.
- Exit code 0 → show the plan per domain from the JSON (`applied`), in the order the script applies it:
  RENAMED → MODIFIED → REMOVED → ADDED.

## Step 4 — Confirm and sync

Ask the user to confirm the plan (one question: "Merge these into capabilities?"). Then:

```bash
python3 $S sync --change <change>
```

What the script does, per domain in `capabilities`:

- **RENAMED** `<ID>`: changes only the name in `### <ID>: <name>`; `From` must equal the current name.
- **MODIFIED** `<ID>`: replaces the whole block (statement, Permissions, every scenario) with the delta's block.
- **REMOVED** `<ID>`: deletes the block, adds a row to "Removed IDs" of `history.md` (ID, change, Reason,
  `Replaced by` if the delta gives `- **Replaced by:**`). That ID is never reissued.
- **ADDED** `<ID>`: adds the block; requirements are kept in ascending ID order, so a new ID lands last.
- Every ADDED / MODIFIED block gets `- **Source:** change <change>` (replacing an older Source line).
- Adds a row to "Merged changes" of `history.md`: change · date · `new` / `updated` / `dropped` / `renamed` + IDs.

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
grep -rnE '\b(ADDED|MODIFIED|REMOVED|RENAMED)\b' specs/capabilities/ || echo "no delta keywords"
```

Report:

1. Change archived and where to (`specs/archive/<change>/`).
2. Per domain: requirements renamed / updated / dropped / new, with IDs.
3. Files changed (`spec.md`, `history.md` per domain, roadmap / traceability).
4. Next step per `CLAUDE.md`: two commits (code; spec) → push → PR into `new-project`.

Do not commit or push in this skill.
