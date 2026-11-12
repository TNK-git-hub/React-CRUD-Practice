---
name: spec-bootstrap
description: Turns the requirement documents in docs/requirements/ into the knowledge base (specs/_system/), one capability folder per domain, the domain code table, the change roadmap and traceability. Run ONCE when starting a new app, before change 001.
argument-hint: "[requirement documents folder, default docs/requirements/]"
disable-model-invocation: true
---

# spec-bootstrap

You are initialising the knowledge base of a new app from its requirement documents. The result is the
input of every later change, so favour **correct and complete** over fast. You do NOT write code, do NOT
choose a stack, do NOT create a change or a branch.

## Input

```text
$ARGUMENTS
```

Requirement documents folder = `$ARGUMENTS` if given, otherwise `docs/requirements/`.

## Step 0 — Preconditions

1. Read every `.md` file in the requirement documents folder. No files → stop and tell the user.
2. If `specs/_system/roadmap.md` already exists → the app has already been bootstrapped. Stop and ask the user:
   running again would overwrite the knowledge base. Never overwrite on your own.
3. Read `.specify/memory/constitution.md`, `.claude/CLAUDE.md`, `specs/_system/edge-case-catalog.md`.
4. Get templates with the script (versions in `.specify/templates/overrides/` take precedence):

   ```bash
   bash .specify/scripts/bash/resolve-template.sh <template-name>
   ```

   Templates needed: `glossary-template`, `domain-model-template`, `nfr-template`,
   `roadmap-template`, `traceability-template`, `capability-template`, `states-template`,
   `rules-template`, `history-template`.

## Step 1 — Analyse the documents (no files written yet)

Build a working list; each item records its source (file + section):

- **Functional requirement items.** Documents without numbering → number them `REQ-01`, `REQ-02`… in order of appearance.
- **User roles** and the permissions of each role.
- **Entities** and relationships; which entities have a lifecycle (states).
- **Business rules** (keep the original code if the documents have one, e.g. `BR-01`).
- **Non-functional requirements** (performance, security, environment…).
- **Out of scope** and **priority order** if the documents give them.
- **Unclear points** → questions `[NEEDS CLARIFICATION: …]`.

Do not infer requirements that are not in the documents.

## Step 2 — Split into domains

- Group by concepts **the user recognises** (e.g. "Rooms", "Invoices"), NOT by technical layer
  (API, UI, DB).
- Each entity belongs to exactly one domain.
- Each domain: an English `kebab-case` folder name + a unique code of 3–5 upper-case letters (e.g. `rooms` / `ROOM`).
- The code must not collide with words common in code or notes, because searches would mix them up:
  `TODO`, `FIX`, `NOTE`, `TEST`, `TASK`, `BUG`, `HACK`, `XXX`, `NFR`, `REQ`, `BR`, `SC`.
  In that case pick another code (e.g. domain `todos` → `TDO` or `ITEM`).
- Login / accounts is usually its own domain (e.g. `auth` / `AUTH`) if the documents cover it.

## Step 3 — Write the knowledge base into `specs/_system/`

Fill from the templates, keep every template heading, delete the HTML guide block once filled:

| File | Content |
| --- | --- |
| `glossary.md` | Terms, roles, names used in code |
| `domain-model.md` | Entities, attributes, relationships, mermaid diagram |
| `nfr.md` | NFRs with numbers. **The "Data and deletion policy" section is mandatory**: documents silent → `[NEEDS CLARIFICATION]` in every cell, never choose soft or hard delete |
| `roadmap.md` | List of changes (Step 5) |
| `traceability.md` | Requirement item → change (Step 5) |

Do not edit `edge-case-catalog.md` except section "13. Domain-specific": add questions for business traps
that the documents clearly show (e.g. "the room is already full"), one question per line, replacing the
`_(none yet)_` line.

## Step 4 — Create `specs/capabilities/<domain>/` for each domain

| File | Content |
| --- | --- |
| `spec.md` | From `capability-template`: fill only Overview; Requirements stays `_(none yet)_` |
| `states.md` | From `states-template`, for each entity of the domain that has a lifecycle. Every cell must have a value |
| `rules.md` | From `rules-template`: the domain's business rules, code `BR-<CODE>-NN`, with source |
| `history.md` | From `history-template`, left empty |

**Do not write requirements into `spec.md`.** The living spec only gets content when a change is archived.

## Step 5 — Roadmap and traceability

Split changes following the rules in `roadmap-template`:

- `001` is the walking skeleton: app scaffold + tests + type checking + CI running + ONE smallest
  end-to-end flow (usually login, or create/view the main object).
- Each change has one user-visible outcome and can be finished in 1–3 days.
- A change depends only on changes with a smaller number.
- Every REQ, BR and NFR item has an owning change in `traceability.md`; out-of-scope items are marked
  "out of scope"; items that fit nowhere → "Unassigned" + `[NEEDS CLARIFICATION]`.

## Step 6 — Register domain codes

In `.claude/CLAUDE.md`, only edit the **domain code table** (the table with columns `Code | Domain` in the
"ID conventions" section): replace the `_(none yet)_` row with one row per domain. Do not edit any other part of the file.

If that table cannot be found, or it already has other codes (not `_(none yet)_`): do NOT edit any row.
Put the list of codes in the Step 8 report and tell the user that `CLAUDE.md` does not match the harness template.

## Step 7 — Self-check before reporting

- [ ] All 5 files exist in `specs/_system/` (catalog not counted), no HTML guide blocks left.
- [ ] Each domain has all 4 files; `spec.md` has no requirements.
- [ ] Every cell of every `states.md` table has a value.
- [ ] Every REQ / BR / NFR item of the documents appears in `traceability.md`.
- [ ] `roadmap.md`: consecutive numbers, `001` is the walking skeleton, no backward dependency.
- [ ] No number, limit or permission invented beyond the documents.
- [ ] Domain codes in `CLAUDE.md` match the folder names in `specs/capabilities/`.

Any item failing → fix it and check again.

## Step 8 — Report and STOP

Tell the user:

1. The list of domains (folder, code, main entities).
2. A short roadmap table (change, goal, dependencies).
3. **Every `[NEEDS CLARIFICATION]` question**, grouped by file and numbered so the user can answer.
4. The files created / modified.

Then **stop and wait for the user to approve `roadmap.md`** and answer the questions.
Do not run `/speckit-specify` on your own, do not create a branch, do not commit.
