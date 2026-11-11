# NOTICE

Skill `spec-edge-cases` is derived from `deliver-edge-cases` of **pm-skills**.

- Source: https://github.com/product-on-purpose/pm-skills/tree/main/skills/deliver-edge-cases
- Upstream version: 2.1.1 (commit `9b920db418c5bf641edea9afb4915a286e1d42ea`, 2026-11-03)
- Copyright: product-on-purpose and pm-skills contributors
- License: Apache License 2.0 — full text in [LICENSE](LICENSE)

## Changes from upstream (Apache-2.0 §4b)

- `SKILL.md` rewritten for this repo's spec harness (Vietnamese):
  - input is the current change (`.specify/feature.json`), `specs/_system/edge-case-catalog.md`
    and `states.md` / `rules.md` of the related capabilities, instead of a free-form feature;
  - output is Given/When/Then scenarios with IDs (`<CODE>-<NNN>-S<n>`), P1–P3 and a recovery path,
    written into the change's `spec.md`, plus a coverage table `checklists/edge-cases.md`;
    the standalone edge-case document (`references/TEMPLATE.md`) is no longer produced;
  - the 7 analysis steps of upstream (scope, input, boundary, error states, concurrency, recovery,
    prioritisation) are kept and mapped to the 13 dimensions of the shared catalog.
- `references/TEMPLATE.md`, `references/EXAMPLE.md`, `evals/` and `HISTORY.md` were not copied
  (they describe the upstream output format).
- `references/upstream-SKILL.md` is the unmodified upstream `SKILL.md`, kept for reference.
