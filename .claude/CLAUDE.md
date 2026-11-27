# Base Harness — Spec-Driven Development (SDD)

## Purpose

This repository builds a **reusable harness for Spec-Driven Development (SDD)**.
The harness will be copied into, or applied to, many different software projects, so it
must stay generic: it should not depend on any particular product, language, framework,
or tech stack.

In SDD, work on product code starts from a written specification; code is derived from
and traceable to that spec.

## Current state

The folder layout follows `docs/BaseHarness.drawio` (the source of truth for structure):

```
.claude/
  CLAUDE.md
  context/
    constitution/        # generated: mission.md, techstack.md, roadmap.md (.gitkeep for now)
    log/
      harness/           # tracks changes to the harness itself (.gitkeep for now)
      event/             # tracks what work is being done, e.g. onboard, a feature (.gitkeep for now)
  template/
    constitution/        # templates: mission.md, techstack.md, roadmap.md
  commands/
    onboard.md           # /onboard: creates the constitution from the templates
    drift.md             # /drift: finds spots missed when the harness was changed, asks what to fix
docs/
  BaseHarness.drawio     # structure and workflow diagram
  requirements/          # the developer puts the customer's requirements here
```

The workflow is still being defined. The diagram names two entry cases: a greenfield
project (a person provides the initial software requirements) and a brownfield project
(a person provides the customer's existing repository). The constitution templates are
written (headings plus an HTML comment under each saying what to fill in; the roadmap is a
phase table with a status column). `/onboard` creates the constitution: it detects greenfield (no project code; reads
`docs/requirements/`) or brownfield (reads all of the existing source code, plus
`docs/requirements/` if it has files), fills the templates, and
asks the user with AskUserQuestion when information is missing.

## Context

`.claude/context/` is the single place where all of Claude's project context is stored,
including the constitution. It lives in the repository, so it is versioned and reused
together with the harness.

- `context/constitution/` — non-negotiable project principles (mission, tech stack, roadmap),
  generated from `template/constitution/`; overrides everything else.
- `context/log/harness/` — record of changes to the harness itself.
- `context/log/event/` — record of the work being done (for example `onboard`, a feature).
  The log file format and which commands write logs are not decided yet.

Rules:
- Save new project knowledge here (not in any other location), one fact/topic per file.
- Update an existing file instead of creating a duplicate; remove context that is wrong.
- Change the constitution only when the user explicitly asks.

## Rules for Claude

- Do not assume a folder layout, workflow, command set, or file format that has not been
  agreed with the user. When something is undecided, propose options and ask.
- Keep everything stack-agnostic and reusable across projects; flag anything that would
  tie the harness to one specific project or technology.
- Update this file as decisions are made, so it only describes what is actually known.
