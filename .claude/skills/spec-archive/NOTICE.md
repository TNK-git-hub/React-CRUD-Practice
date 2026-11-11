# NOTICE

Skill `spec-archive` is derived from **OpenSpec**.

- Source: https://github.com/Fission-AI/OpenSpec
  - `src/core/templates/workflows/archive-change.ts` and `sync-specs.ts` (archive / sync workflow prompts)
  - `src/core/specs-apply.ts` (delta application: operation order RENAMED → MODIFIED → REMOVED → ADDED,
    validate everything before writing anything)
- Upstream commit: `a959be77cf045ea3156dc5089c9e2f1d6ce9ce70` (2026-11-10)
- Copyright (c) 2024 OpenSpec Contributors
- License: MIT — full text in [LICENSE](LICENSE)

## Changes from upstream

- The 7-day roadmap said to copy `commands/sync.md`, `commands/archive.md` and `scripts/python/change.py`;
  those files do not exist in OpenSpec (it is a TypeScript CLI). So nothing is copied verbatim:
  - `SKILL.md` merges the ideas of the two workflow prompts into one skill for this repo's harness
    (`specs/changes/` → `specs/capabilities/`, `specs/archive/`);
  - `scripts/change.py` is a new Python (stdlib) implementation, not a port of the TypeScript code.
- Requirements are matched by **ID** (`<CODE>-<NNN>`), not by heading text as in OpenSpec.
- Archive folders keep the name `NNN-<name>` (no date prefix) and are never overwritten.
- REMOVED IDs are recorded in `history.md` and can never be reissued.
- A change may touch several domains, listed in the delta frontmatter `capabilities`.
