# Change roadmap — React-CRUD-Practice (product management)

| Change | Goal (what the user sees) | Domain | Source | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001-products-price-range | A viewer enters a minimum and/or maximum price; the list shows only products priced within the range (both ends inclusive), combined with search, sort and pagination | products | REQ-01–REQ-04; BR-PROD-01–BR-PROD-07; NFR-004, NFR-042 | — | archived |
| 002-products-discount-filter | A viewer chooses a minimum discount; the list shows only products discounted at least that much, combined with search, price range, sort and pagination | products | docs/requirements/discount-filter.md | 001 | planned |

## Ordering notes

- 001 is specified and archived for the trial; its code is not implemented on this branch.
- 002 modifies PROD-002 (combining the filters, URL state, clearing the filters), which 001 added.
- Brownfield: the app is running, so there is no walking skeleton; the roadmap holds only new changes, existing
  behavior is not specified again.
- The repo has no test framework and no CI workflow (no test files, no `.github/workflows/`). The constitution
  (Principles I, IV) requires a test for every scenario and type checking in CI, so the `plan.md` of 001 must add a
  test runner and CI for the parts it touches, with the existing stack (NFR-033), not a new one.
- 001's spec puts in Out of Scope: the price conflict `≥ 0` (backend) / `> 0` (create form) is not fixed in that change.
- Filtering by price is a public read with no permission check — a known exception to constitution Principle II
  (nfr.md, NFR-011).
- A new price filter must be part of the list cache key (NFR-001) and the TanStack Query key
  (frontend/src/api/queryKeys.ts), otherwise the result of another filter is returned.

## Open questions

- _(none)_
