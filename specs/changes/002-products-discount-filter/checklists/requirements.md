# Specification Quality Checklist: 002-products-discount-filter

**Purpose**: Validate the delta spec before clarify / plan
**Created**: 2026-11-13
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] All mandatory sections completed; template guide block removed

## Delta Format

- [x] Frontmatter has kind: delta, change, capabilities, primary, status, source
- [x] All template headings present, in template order; Architecture Decisions / Data Model left to the plan
- [x] Every domain in `capabilities` has a `### <domain>` section, and vice versa
- [x] Every MODIFIED / REMOVED / RENAMED ID exists in the capability spec
- [x] No ADDED requirement duplicates an existing requirement
- [x] ADDED IDs are the next free numbers of the domain (incl. history.md and other open changes)
- [x] Every requirement has details, a Permissions line and at least one nested Given/When/Then scenario `<ID>` (type, Pn)
- [x] Every error scenario at P1/P2 has → Recovery
- [x] Every NFR row has Change Applies / ADDED / MODIFIED and a Category that is a section of nfr.md
- [x] Traceability lists every scenario and every NFR row

## Requirement Completeness

- [x] No invented numbers, limits, permissions or deletion policy (each is sourced or [NEEDS CLARIFICATION])
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable and technology-agnostic
- [x] Scope is clearly bounded (In Scope and Out of Scope filled or marked)
- [x] Assumptions listed

## Notes

- Edge-case scenarios are added later by /spec-edge-cases (not checked here).
- [NEEDS CLARIFICATION] markers are expected at this stage; /speckit-clarify resolves them.
- "No implementation details": the API parameter, URL keys and response shape are the observable contract the rich
  template asks for (as in the worked example); no language, framework or storage choice is made. `router.push` and
  `ValidationPipe` appear only in text carried over from PROD-002 / nfr.md.
- "Requirements are testable and unambiguous": the 4 points first marked [NEEDS CLARIFICATION] were settled by
  /speckit-clarify on 2026-11-13 (plus the 400 message); none is left.
- MODIFIED PROD-002 repeats every existing scenario unchanged under its ID; new scenarios continue at S16.
- /spec-edge-cases turned every `_(unassigned)_` row into a scenario; `spec_check.py --stage spec` passes.
- "Back to page 1" and "invalid `minDiscount` in the URL is ignored" are written in PROD-002's URL table as following
  PROD-002 (capability products, change 001), not as assumptions.
