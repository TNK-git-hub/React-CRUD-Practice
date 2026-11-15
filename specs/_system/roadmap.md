# Change roadmap — React-CRUD-Practice (product management)

| Change | Goal (what the user sees) | Features | Source | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001-product-price-filter | A visitor enters a minimum price and/or a maximum price; the product list shows only products whose price is in the range (both ends included), together with the existing search, sort and pagination | products/filtering | REQ-01–REQ-04; BR-PROD-01–BR-PROD-05; NFR-004, NFR-042 | — | planned |

## Ordering notes

- Brownfield: the app already runs and already has its scaffold, tests (Vitest), strict type checking and CI
  (NFR-033, NFR-035), so there is no walking-skeleton change; `001` is the first new behavior. Existing behavior is not
  specified again; a change specifies the existing behavior it touches.
- 001 keeps the existing stack (NFR-033) and adds no login or permission check (NFR-011).
- The new price parameters must be part of the Redis list cache key (NFR-001) and of the TanStack Query key
  (frontend/src/api/queryKeys.ts); otherwise a cached list of another filter is returned.

## Open questions

- [NEEDS CLARIFICATION: the price conflict `≥ 0` (server) / `> 0` (create form) — out of scope of 001, as decided on
  branch 001, or a change of its own?]
