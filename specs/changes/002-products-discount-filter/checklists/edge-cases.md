# Edge cases — 002-products-discount-filter

**Catalog**: specs/_system/edge-case-catalog.md · **Date**: 2026-11-13

| Requirement | Dimension | Result | Notes |
| --- | --- | --- | --- |
| PROD-002 | 1. Input | S18 [P2] | invalid / repeated `minDiscount` in the URL is ignored; price cases unchanged (S6, S13, S14) |
| PROD-002 | 2. Numbers and boundaries | N/A | discount boundaries belong to PROD-004 (S1, S8); page boundaries are under dimension 4 |
| PROD-002 | 3. Missing and empty | S20 [P3] | empty `minDiscount=` in the URL |
| PROD-002 | 4. Collections | S19 [P2], S21 [P2], S22 [P2], S26 [P2] | total / page count with the discount filter; empty result; back to page 1; page beyond the last page; existing S2, S4, S10 kept |
| PROD-002 | 5. Existence and state | N/A | combining filters acts on no single product; the ✗ cells of states.md (edit / delete a missing product) are not reachable from the list filters |
| PROD-002 | 6. Permissions | N/A | public read, no role can be denied (NFR-011); the no-identity request is PROD-004-S10 |
| PROD-002 | 7. Concurrency and ordering | S23 [P2], S24 [P3] | typed-but-not-applied price + discount choice; Back after discount changes; existing S11, S15 kept |
| PROD-002 | 8. Time | N/A | no dates, deadlines or expiry in combining filters; cache lifetime is PROD-004-S4 |
| PROD-002 | 9. External dependencies | N/A | combining adds no dependency; Redis down / server error are PROD-004-S12, S13 |
| PROD-002 | 10. Resource limits | N/A | one more small query parameter; page size limit unchanged (NFR-003) |
| PROD-002 | 11. Data and deletion | S25 [P2] | last product of a page deleted while a discount filter is applied |
| PROD-002 | 13. Domain-specific | S19 [P2] | catalog Q1 (cache key) → PROD-004-S4; Q2 (total / page count) → S19, page beyond the new last page → S26 (as for search today, change 001); Q3 price rounding unchanged (PROD-001-S7); Q4 USD: N/A. rules.md: BR-PROD-01–07 are price-value rules owned by PROD-001 / PROD-003 (BR-PROD-02 table rows covered there) |
| PROD-004 | 1. Input | S5 [P2], S7 [P3] | the dropdown only sends valid values; direct requests with other values are rejected |
| PROD-004 | 2. Numbers and boundaries | S8 [P2] | upper boundary 49.99 / 50.00 / 100.00; lower boundary 9.99 / 10.00 and 0.00 already pinned by S1, S3 |
| PROD-004 | 3. Missing and empty | S6 [P3] | empty `minDiscount=`; absent = Any is S3 |
| PROD-004 | 4. Collections | N/A | empty result and pagination of the filtered list belong to PROD-002: S19 (Covers PROD-004), S21 |
| PROD-004 | 5. Existence and state | S9 [P2] | discount edited while filtered; states.md ✗ cells are not reachable from a list filter |
| PROD-004 | 6. Permissions | S10 [P2] | no-identity request → public read (NFR-011); nothing can be denied |
| PROD-004 | 7. Concurrency and ordering | S11 [P2] | second choice before the first result arrives |
| PROD-004 | 8. Time | N/A | no dates or expiry; the 30-second cache lifetime (NFR-001) only matters for S4 |
| PROD-004 | 9. External dependencies | S12 [P2], S13 [P3] | Redis fail-open (NFR-031); server error → existing load-error state |
| PROD-004 | 10. Resource limits | N/A | one small enum parameter; no upload, bulk or payload |
| PROD-004 | 11. Data and deletion | S14 [P2] | hard delete (nfr.md): gone after reload, total decreases |
| PROD-004 | 13. Domain-specific | S4 [P1] (existing) | catalog Q1 (cache key) → S4; Q3 rounding: `numeric(5,2)`, S1 pins 9.99 vs 10.00; Q2 → PROD-002-S19; Q4 USD: N/A; rules.md has no discount rule |

## Summary

| Requirement | New scenarios | P1 | P2 | P3 | N/A |
| --- | --- | --- | --- | --- | --- |
| PROD-002 | 9 (S18–S26) | 0 | 7 | 2 | 6 |
| PROD-004 | 10 (S5–S14) | 0 | 7 | 3 | 3 |

## Open questions

- _(none)_ — "page beyond the last page" settled by the user: as change 001 (empty state, pagination hidden) → PROD-002-S26.
