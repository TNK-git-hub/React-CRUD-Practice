# Edge cases — 001-product-price-filter

**Catalog**: specs/_system/edge-case-catalog.md · **Date**: 2026-11-15

| Requirement | Dimension | Result | Notes |
| --- | --- | --- | --- |
| PROD-001 | 1. Input | S6 [P3] | spaces trimmed; malformed and SQL-like values are PROD-003 (S5–S7) |
| PROD-001 | 2. Numbers and boundaries | S7 [P1], S8 [P2], S9 [P3] | exact bound to the cent, min = max, a 0.00 product; 0 / 99999999.99 bounds are PROD-003-S8 |
| PROD-001 | 3. Missing and empty | S2, S3, S5 (existing) | one or both bounds empty; empty parameter on a direct request is PROD-003-S11 |
| PROD-001 | 4. Collections | PROD-002-S8 (Covers) | an empty filtered list is PROD-002's empty state |
| PROD-001 | 5. Existence and state | S10 [P2] | the filter reads products in state "exists" only (states.md); no ✗ or no-op cell is reachable from a read-only list |
| PROD-001 | 6. Permissions | S4 (existing) | no role is denied (NFR-011, known exception to Principle II); S4 calls the backend directly with no identity |
| PROD-001 | 7. Concurrency | S11 [P2] | a newer range applied before the older results arrive |
| PROD-001 | 8. Time | N/A | the filter involves no date, time or expiry |
| PROD-001 | 9. External dependencies | S12 [P2] | Redis down (NFR-031); a failing list request is PROD-002-S14 |
| PROD-001 | 10. Resource limits | N/A | read-only, no upload or bulk operation; page size bounded by `limit` 1–100 (NFR-003) |
| PROD-001 | 11. Data and deletion | N/A | the filter deletes nothing; a delete invalidates every cached list exactly like the edit of S10 (NFR-001) |
| PROD-001 | 13. Domain-specific | S7, S13 [P1], S14 [P1]; S1, S2, S3, S5 (existing) | BR-PROD-01 → S7; BR-PROD-02 decision table: yes/yes → S1, yes/no → S2, no/yes → S3, no/no → S5, yes/yes with min > max → PROD-003-S15, S16; catalog 13: selling vs pre-discount price → S13, cache key → S14, bound or 0 → S7, S9 |
| PROD-002 | 1. Input | S4 [P2] | invalid price value or valid min > max in the URL: ignored, no message (clarify 2026-11-15) |
| PROD-002 | 2. Numbers and boundaries | S5 [P2], S6 [P3] | exactly one page / one over; page number past the last page |
| PROD-002 | 3. Missing and empty | S7 [P3] | range without keyword keeps the path `/` |
| PROD-002 | 4. Collections | S8 [P2], S9 [P2], S10 [P2], S11 [P3] | empty result with range, keyword-only empty with the new common text, "Xoá bộ lọc", stable ties |
| PROD-002 | 5. Existence and state | N/A | read-only list; a product changing state while filtered is PROD-001-S10 |
| PROD-002 | 6. Permissions | N/A | no role is denied (NFR-011); the direct call is PROD-001-S4 (Covers PROD-002) |
| PROD-002 | 7. Concurrency | S12 [P2], S13 [P3], S16 [P3] | typed but not applied; browser Back; slow response keeps the previous list |
| PROD-002 | 8. Time | N/A | no date, time or expiry involved |
| PROD-002 | 9. External dependencies | S14 [P2] | 5xx / network error: existing error state, retry with the same range |
| PROD-002 | 10. Resource limits | N/A | page size fixed at 10 in the UI, `limit` 1–100 on the server (NFR-003) |
| PROD-002 | 11. Data and deletion | N/A | the list only reads; nothing is deleted or edited |
| PROD-002 | 13. Domain-specific | S15 [P2]; S1, S2 (existing) | BR-PROD-05 → S1, S2; catalog 13: back to page 1 on a new filter → S15, cache key → PROD-001-S14 |
| PROD-003 | 1. Input | S4 [P2], S5 [P2], S6 [P1], S7 [P1], S17 [P3], S18 [P3], S20 [P2], S22 [P2], S23 [P2] | invalid values in the UI and on the server, SQL-like text, several failures at once; "010" / "20.00" kept as typed; both bounds invalid → `errors`; message disappears on edit; aria attributes (NFR-044) |
| PROD-003 | 2. Numbers and boundaries | S8 [P2], S9 [P2], S10 [P2], S19 [P3] | 0 and 99999999.99 valid; 100000000, -0.01 and -0 rejected |
| PROD-003 | 3. Missing and empty | S11 [P3], S12 [P3] | empty parameter = no bound; repeated parameter = 400 |
| PROD-003 | 4. Collections | N/A | validates two values; a rejected request returns no list |
| PROD-003 | 5. Existence and state | N/A | no object lifecycle involved; read-only request |
| PROD-003 | 6. Permissions | N/A | no role is denied (NFR-011); the checks run for every caller, S2, S3, S6 call the backend directly |
| PROD-003 | 7. Concurrency | N/A | UI checks run before any request, so a failed check sends nothing to race; the request is read-only |
| PROD-003 | 8. Time | N/A | no date, time or expiry involved |
| PROD-003 | 9. External dependencies | S13 [P2], S21 [P2] | server rejects a minimum / a maximum the UI let through: message under that bound's input |
| PROD-003 | 10. Resource limits | S14 [P3] | a 30-digit value fails check 4 without a crash |
| PROD-003 | 11. Data and deletion | N/A | the request reads only; nothing is stored or deleted |
| PROD-003 | 13. Domain-specific | S15 [P2], S16 [P1]; S1, S2, S3 (existing) | min > max (BR-PROD-02 table, yes/yes row with min > max) → S15, S16; BR-PROD-03 → S2, S10; BR-PROD-04 → S1, S3 |

## Summary

| Requirement | New scenarios | P1 | P2 | P3 | N/A |
| --- | --- | --- | --- | --- | --- |
| PROD-001 | 9 (S6–S14) | 3 | 4 | 2 | 3 |
| PROD-002 | 13 (S4–S16) | 0 | 8 | 5 | 5 |
| PROD-003 | 20 (S4–S23) | 3 | 11 | 6 | 6 |

## Open questions

- _(none)_ — the question of `PROD-002-S4` was settled in clarify (2026-11-15).
