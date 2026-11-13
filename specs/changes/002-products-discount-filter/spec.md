---
kind: delta
change: "002-products-discount-filter"
capabilities: ["products"]
primary: "products"
status: draft
source: ["docs/requirements/discount-filter.md#What we want", "docs/requirements/discount-filter.md#Notes", "roadmap 002"]
---

# Change 002: Filter products by minimum discount

## Overview

### Context

The product list can be searched by keyword, sorted, paged and filtered by price range (PROD-001–PROD-003). Shoppers
keep asking to see only the products that are on sale, but the list cannot be narrowed by discount. Every product
already has a discount percentage (0–100, stored with 2 decimals, e.g. 12.96). Brownfield: PROD-002 changes — the
combination of filters, the URL state and the clear-filter button now include the discount, and the empty-state
description now speaks of filters in general.

### Goals

- **See what is on sale:** a viewer narrows the list to products discounted at least a chosen amount, in one step.
- **Works with what exists:** the discount filter combines with keyword search, price range, sorting and pagination.
- **Shareable state:** the chosen discount lives in the URL, so a link or Back restores it.
- **One reset:** clearing the filters also clears the discount.

## Success Criteria

- **SC-001:** On the seed data, for each minimum discount — Any, 10%, 20%, 30%, 50% — 0 products below the minimum
  appear and 0 products at or above it are missing, compared with a filter computed independently from the same data
  (`SELECT id FROM products WHERE "discountPercentage" >= <n>`, every page of the list collected).
- **SC-002:** The product list responds in < 1 second on the current seed data when filtered by minimum discount,
  alone or together with the price range and keyword (NFR-004). Measured by a backend test that inserts as many
  products as the current seed data has (count taken from `backend/src/seed.ts`), with discounts spread over 0–100,
  and times `GET /products?minDiscount=20` and the same request with a keyword and a price range, each on a cache MISS
  (`X-Cache: MISS`).
- **SC-003:** With keyword, price range, minimum discount, sort and page all set, the list shows exactly the products
  that satisfy every filter, and the total and page count describe that set (PROD-002-S16).
- **SC-004:** The discount filter works as specified in the current Chrome, Safari and Firefox on desktop (NFR-042).

## Scope

### In Scope

- A minimum-discount query parameter on `GET /products`.
- A minimum-discount control on the product list page with the choices Any, 10%, 20%, 30% and 50% or more.
- The minimum discount kept in the URL and combined with keyword, price range, sort and pagination.
- The clear-filter button also clearing the discount.
- The list cache key including the minimum discount.

### Out of Scope

- Sorting by discount (docs/requirements/discount-filter.md#Notes).
- Any change to how products are created or edited (docs/requirements/discount-filter.md#Notes).
- Optimising the discount control for narrow screens (quality review, 2026-11-13).
- Delete and its 5-second undo are unchanged by this change (quality review, 2026-11-13).

## Requirements

### products

#### MODIFIED PROD-002: Combine the price range and discount filters with search, sort and pagination

The system MUST apply the price range and the minimum discount together with the keyword, the sort order and
pagination, with the total and the page count computed on the filtered result, and MUST keep the range and the
minimum discount in the URL with the keyword, sort and page.

**Empty result.** When the filters return no product, the page shows the title "Không tìm thấy sản phẩm nào" and the
description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới bộ lọc hoặc xoá bộ lọc." — the same description
for every filter, keyword-only included. Changed by change 002-products-discount-filter: the description used to end with "Thử nới khoảng giá
hoặc xoá bộ lọc." (PROD-002 before this change); it now names the filters in general because the discount alone can empty the list
(quality review, 2026-11-13). The clear-filter button clears the keyword, the range and the minimum discount, and keeps
the sort. It is shown only in the empty state, as today (frontend/src/views/ProductList.tsx:113).

**URL state.** Every change below is one browser history entry (`router.push`, as search does today).

| Action | URL after the action |
| --- | --- |
| Search with a valid keyword / range | sets `q`, `minPrice`, `maxPrice` (empty input drops its key); drops `page`; keeps `minDiscount` |
| Choose a minimum discount (applied as soon as it is chosen, like the sort control; no Search needed) | sets `minDiscount` (Any drops the key); drops `page` — follows PROD-002: a new range or a new sort also returns to page 1 (capability products, change 001; Clarifications 2026-11-13); keeps `q`, `minPrice`, `maxPrice`, `sortBy`, `order` |
| Change sort | sets `sortBy`, `order`; drops `page`; keeps `q`, `minPrice`, `maxPrice`, `minDiscount` |
| Change page / delete the last product of a page | sets `page`; keeps every other key |
| Clear-filter button | drops `q`, `minPrice`, `maxPrice`, `minDiscount`, `page`; keeps `sortBy`, `order` |
| Open a URL with an invalid `minPrice` / `maxPrice` | that value is ignored: input empty, no bound on that side, no message |
| Open a URL where both values are valid but `minPrice > maxPrice` | both ignored: inputs empty, no price filter, no message |
| Open a URL with a repeated price parameter | that side is ignored: input empty, no message |
| Open a URL with an invalid `minDiscount` (any value other than 10, 20, 30, 50, incl. empty or repeated) | ignored: the control shows "Tất cả", no discount filter, no message — follows PROD-002: invalid price values in the URL are ignored the same way (capability products, change 001) |

Values typed but not applied are discarded when the URL changes; the inputs return to the applied range. Choosing the
minimum discount that is already applied changes nothing: no request, no URL change, no new history entry.
URL parameters are compared as a set: their order is not specified, and the URLs written in the scenarios are examples
of the parameter set, not exact strings.

**Permissions:** As PROD-001: every viewer, no login; no role is denied (NFR-011).

**Scenarios:**

- `PROD-002-S1` (happy, P1)
  - **Given** products containing "phone" priced 50, 150, 300 and 600 USD, and a product without "phone" priced 200 USD
  - **When** the viewer enters keyword "phone" and range 100–500, presses Search, then sorts by price descending
  - **Then** the list shows only the "phone" products priced 300 then 150 USD; the total shown is 2
  - Covers: PROD-001
- `PROD-002-S2` (happy, P1)
  - **Given** 15 products in the applied range and 10 products per page
  - **When** the viewer opens page 2
  - **Then** page 2 shows the remaining 5 products; the total shown is 15; there are 2 pages
- `PROD-002-S4` (collection, P2)
  - **Given** no product is priced between 1000 and 2000 USD
  - **When** the viewer enters 1000–2000 and presses Search
  - **Then** the page shows the title "Không tìm thấy sản phẩm nào" and the description "Không có sản phẩm nào khớp bộ
    lọc hiện tại. Thử nới bộ lọc hoặc xoá bộ lọc."
  - → Recovery: the viewer presses the clear-filter button
- `PROD-002-S5` (collection, P2)
  - **Given** the empty state with keyword "phone", range 1000–2000 and sort by price descending
  - **When** the viewer presses the clear-filter button
  - **Then** the keyword and both price inputs are empty; the list shows every product, still sorted by price
    descending; the URL keeps `sortBy` and `order` only
- `PROD-002-S6` (input, P2)
  - **Given** the viewer opens a URL with `minPrice=abc` (hand-edited or an old link) and `maxPrice=20`
  - **When** the list page loads
  - **Then** the invalid value is ignored: "Giá tối thiểu ($)" is empty, no error message, the list is filtered by the
    maximum 20 only (as an invalid sort value in the URL is ignored today); the same value sent straight to the server
    is still rejected (see PROD-003-S10)
- `PROD-002-S10` (collection, P2)
  - **Given** the viewer is on page 3 of the results for 10–20
  - **When** the viewer changes to 30–40 and presses Search
  - **Then** the list shows page 1 of the results for 30–40; the URL has no `page`
- `PROD-002-S11` (concurrency, P2)
  - **Given** range 10–20 is applied and the viewer has typed 30–40 without pressing Search
  - **When** the viewer changes the sort or the page
  - **Then** the list is still filtered by the applied 10–20; the inputs show 10 and 20 again
- `PROD-002-S13` (input, P2)
  - **Given** the viewer opens a URL with `minPrice=30&maxPrice=10` (each value valid on its own)
  - **When** the list page loads
  - **Then** both values are ignored: both inputs are empty, no error message, the list is not filtered by price
- `PROD-002-S14` (input, P3)
  - **Given** the viewer opens a URL with `minPrice=10&minPrice=20`
  - **When** the list page loads
  - **Then** the minimum is ignored: "Giá tối thiểu ($)" is empty, no error message, the list is not filtered by a
    minimum
- `PROD-002-S15` (concurrency, P3)
  - **Given** the viewer filtered 10–20, then 30–40
  - **When** the viewer presses the browser's Back button
  - **Then** the list and both inputs return to 10–20; pressing Back again returns to the state before filtering
- `PROD-002-S16` (happy, P1)
  - **Given** "phone" products priced 150 USD with a 25.00% discount, 300 USD with 5.00% and 600 USD with 30.00%, and a
    product without "phone" priced 200 USD with 40.00%
  - **When** the viewer enters keyword "phone" and range 100–500, presses Search, chooses "Từ 20%" in "Giảm giá",
    then sorts by price descending
  - **Then** the list shows only the "phone" product priced 150 USD; the total shown is 1; the URL has
    `q=phone&minPrice=100&maxPrice=500&minDiscount=20` with `sortBy=price&order=desc`
  - Covers: PROD-004
- `PROD-002-S17` (happy, P2)
  - **Given** the empty state with keyword "phone", range 1000–2000, minimum discount 50% and sort by price descending
  - **When** the viewer presses the clear-filter button
  - **Then** the keyword and both price inputs are empty and "Giảm giá" shows "Tất cả"; the list shows every
    product, still sorted by price descending; the URL keeps `sortBy` and `order` only

- `PROD-002-S18` (input, P2)
  - **Given** the viewer opens a URL with `minDiscount=15` (or `minDiscount=abc`, `minDiscount=10.0`, `minDiscount=%2010`,
    or `minDiscount=10&minDiscount=20`)
    and `maxPrice=500`
  - **When** the list page loads
  - **Then** the discount value is ignored: "Giảm giá" shows "Tất cả", no error message, the list is filtered by the
    maximum price 500 only; the same value sent straight to the server is still rejected (see PROD-004-S5)
- `PROD-002-S19` (collection, P2)
  - **Given** 15 products discounted 20% or more, 8 products discounted less, and 10 products per page
  - **When** the viewer chooses "Từ 20%", then opens page 2
  - **Then** the total shown is 15 and there are 2 pages; page 2 shows the remaining 5 products, all discounted 20% or
    more
  - Covers: PROD-004
- `PROD-002-S20` (missing, P3)
  - **Given** the viewer opens a URL with an empty `minDiscount=` and `q=phone`
  - **When** the list page loads
  - **Then** "Giảm giá" shows "Tất cả", no error message, the list is filtered by the keyword "phone" only
- `PROD-002-S21` (collection, P2)
  - **Given** no "phone" product priced 100–500 USD is discounted 50% or more
  - **When** the viewer enters keyword "phone" and range 100–500, presses Search, then chooses "Từ 50%"
  - **Then** the page shows the title "Không tìm thấy sản phẩm nào" and the description "Không có sản phẩm nào khớp bộ
    lọc hiện tại. Thử nới bộ lọc hoặc xoá bộ lọc."
  - → Recovery: the viewer chooses a lower minimum discount, or presses the clear-filter button (keyword, range and
    discount are cleared, the sort is kept)
- `PROD-002-S22` (collection, P2)
  - **Given** the viewer is on page 3 of the results for keyword "phone" with "Giảm giá" on "Tất cả"
  - **When** the viewer chooses "Từ 20%"
  - **Then** the list shows page 1 of the results for "phone" discounted 20% or more; the URL has `minDiscount=20`
    and no `page`
- `PROD-002-S23` (concurrency, P2)
  - **Given** range 10–20 is applied and the viewer has typed 30–40 without pressing Search
  - **When** the viewer chooses "Từ 20%"
  - **Then** the list is filtered by the applied 10–20 and a minimum discount of 20%; the inputs show 10 and 20 again;
    the URL has `minPrice=10&maxPrice=20&minDiscount=20`
- `PROD-002-S24` (concurrency, P3)
  - **Given** the viewer chose "Từ 10%", then "Từ 30%"
  - **When** the viewer presses the browser's Back button
  - **Then** "Giảm giá" shows "Từ 10%" and the list matches a minimum discount of 10%; pressing Back again returns to
    "Tất cả" and the list before the discount filter
- `PROD-002-S25` (data, P2)
  - **Given** the viewer is on page 2 of the results for "Từ 20%", and page 2 holds a single product
  - **When** the viewer deletes that product
  - **Then** the list goes back to page 1, still filtered by a minimum discount of 20% ("Giảm giá" shows "Từ 20%"); the
    URL keeps `minDiscount=20`

- `PROD-002-S26` (collection, P2)
  - **Given** "Từ 20%" gives 15 products (2 pages of 10)
  - **When** the viewer opens the URL with `minDiscount=20&page=5`
  - **Then** as the app does today for a search beyond the last page: the page shows the title "Không tìm thấy sản phẩm nào"
    and the description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới bộ lọc hoặc xoá bộ lọc.", and the
    pagination bar is hidden
  - → Recovery: the viewer chooses a minimum discount again or presses Search, which returns to page 1 with the same
    filters, or presses the clear-filter button

- `PROD-002-S27` (happy, P2)
  - **Given** the products of PROD-002-S16 and the list with "Giảm giá" on "Tất cả"
  - **When** the viewer chooses "Từ 20%" first, then enters keyword "phone" and range 100–500 and presses Search
  - **Then** the list shows only the "phone" product priced 150 USD; the total shown is 1; "Giảm giá" still shows
    "Từ 20%"; the URL has `minDiscount=20`, `q=phone`, `minPrice=100` and `maxPrice=500`
  - Covers: PROD-004

#### ADDED PROD-004: Filter the product list by minimum discount

The system MUST let a viewer narrow the product list to the products whose discount percentage is at least a chosen
minimum — 10%, 20%, 30% or 50% — or show every product when the choice is Any.

**API.** `GET /products` accepts one more optional query parameter; the response shape does not change.

| Parameter | Type | Rule | Meaning |
| --- | --- | --- | --- |
| `minDiscount` | string | exactly `10`, `20`, `30` or `50`; absent = Any; any other value → HTTP 400 | `discountPercentage ≥ value` |

```json
{ "products": [ /* ProductSummary */ ], "total": 3, "skip": 0, "limit": 10 }
```

- `discountPercentage` is the stored value (0–100, 2 decimals); the comparison is inclusive: a product discounted
  exactly 10.00% is shown for 10% or more.
- `products` holds only products that satisfy the minimum discount AND every other filter (`q`, `minPrice`,
  `maxPrice`); `total` counts that set.
- The list cache key includes `minDiscount` (NFR-001).
- The parameter name `minDiscount` is part of the API contract (quality review, 2026-11-13).
- Only the exact strings `10`, `20`, `30` and `50` are accepted. This differs on purpose from the price inputs, which
  trim spaces and compare by numeric value (PROD-003): discount values come from a fixed list and are never typed, so
  `" 10"`, `"10.0"`, `"010"` and every other variant are invalid.
- Any other value — e.g. `15`, `abc`, `-5`, `101`, `" 10"`, `10.0`, `010`, an empty `minDiscount=` or a repeated
  parameter (`minDiscount=10&minDiscount=20`) — is rejected with HTTP 400 in the existing `ValidationPipe` shape (NFR-012), and
  no list is returned:

  ```json
  { "statusCode": 400, "message": ["Mức giảm giá không hợp lệ"], "error": "Bad Request" }
  ```

**UI.** One control labelled "Giảm giá" on the product list page offers five choices, shown in this order:

| Choice | Label (verbatim) | `minDiscount` in the URL |
| --- | --- | --- |
| Any (default) | "Tất cả" | absent |
| 10% or more | "Từ 10%" | `10` |
| 20% or more | "Từ 20%" | `20` |
| 30% or more | "Từ 30%" | `30` |
| 50% or more | "Từ 50%" | `50` |

The control always shows the minimum discount applied in the URL. Its visible label "Giảm giá" is also its
accessible name for screen readers (NFR-044). While the results for a new minimum discount load, the previous list
stays visible — the same loading behavior as the price filter (specs/archive/001-products-price-range/spec.md,
Assumptions).

**Permissions:** As PROD-001: every viewer, no login; no role is denied (NFR-011).

**Scenarios:**

Fixture unless stated: products discounted 0.00%, 9.99%, 10.00%, 25.50% and 50.00%.

- `PROD-004-S1` (happy, P1)
  - **Given** the fixture products and the product list with "Giảm giá" on "Tất cả"
  - **When** the viewer chooses "Từ 10%"
  - **Then** the list shows exactly the products discounted 10.00%, 25.50% and 50.00%; the total shown is 3; the URL
    has `minDiscount=10`
- `PROD-004-S2` (happy, P1)
  - **Given** the fixture products
  - **When** `GET /products?minDiscount=20`
  - **Then** HTTP 200; `products` are exactly the products discounted 25.50% and 50.00%; `total: 2`
- `PROD-004-S3` (happy, P2)
  - **Given** the fixture products and a minimum discount of 20% applied
  - **When** the viewer chooses "Tất cả"
  - **Then** the list shows all 5 fixture products; the URL has no `minDiscount`
- `PROD-004-S4` (domain, P1)
  - **Given** the results for a minimum discount of 10% were just loaded and are in the list cache (NFR-001)
  - **When** the viewer chooses "Từ 30%" while that cache entry is still valid
  - **Then** the list shows only the product discounted 50.00%, not the cached results for 10%

- `PROD-004-S5` (input, P2)
  - **Given** the fixture products
  - **When** `GET /products` is sent straight to the server with `minDiscount` `15`, `abc`, `-5` and `101` in turn
  - **Then** each request gets HTTP 400 with `message` containing "Mức giảm giá không hợp lệ"; no list is returned
  - → Recovery: the caller resends with `minDiscount` 10, 20, 30 or 50 (or without it for Any); the request is
    read-only, so resending creates no duplicate
- `PROD-004-S6` (missing, P3)
  - **Given** the fixture products
  - **When** `GET /products?minDiscount=` (present but empty) is sent straight to the server
  - **Then** HTTP 400 with `message` containing "Mức giảm giá không hợp lệ"; no list is returned
  - → Recovery: the caller drops the empty parameter (Any) or sends 10, 20, 30 or 50; read-only, so no duplicate
- `PROD-004-S7` (input, P3)
  - **Given** the fixture products
  - **When** `GET /products?minDiscount=10&minDiscount=20` is sent straight to the server
  - **Then** HTTP 400 with `message` containing "Mức giảm giá không hợp lệ"; no list is returned
  - → Recovery: the caller sends the parameter once; read-only, so no duplicate
- `PROD-004-S8` (boundary, P2)
  - **Given** products discounted 49.99%, 50.00% and 100.00%
  - **When** the viewer chooses "Từ 50%"
  - **Then** the list shows exactly the products discounted 50.00% and 100.00%; the total shown is 2
- `PROD-004-S9` (state, P2)
  - **Given** "Từ 30%" is applied and the list shows product A discounted 35.00%
  - **When** product A's discount is edited to 10.00%, then the viewer reloads the page
  - **Then** product A is no longer in the list (the list cache is invalidated by the edit, NFR-001)
- `PROD-004-S10` (permission, P2)
  - **Given** the app has no login (NFR-011)
  - **When** `GET /products?minDiscount=20` is sent straight to the server with no identity
  - **Then** HTTP 200; `products` are exactly the fixture products discounted 25.50% and 50.00%, as through the UI
- `PROD-004-S11` (concurrency, P2)
  - **Given** the fixture products and the product list with "Giảm giá" on "Tất cả"
  - **When** the viewer chooses "Từ 10%" and, before its results arrive, chooses "Từ 30%"
  - **Then** the final list shows only the product discounted 50.00% and "Giảm giá" shows "Từ 30%"; the results for
    10% arriving later do not overwrite them
- `PROD-004-S12` (dependency, P2)
  - **Given** the list cache (Redis) is down
  - **When** the viewer chooses "Từ 20%"
  - **Then** the list still shows exactly the fixture products discounted 25.50% and 50.00%, read straight from the
    database (NFR-031)
- `PROD-004-S13` (dependency, P3)
  - **Given** the server fails when fetching the list
  - **When** the viewer chooses "Từ 20%"
  - **Then** the existing list-load error state is shown (title "Không tải dược danh sách sản phẩm", retry button)
  - → Recovery: the viewer presses retry; "Giảm giá" still shows "Từ 20%", so the retry uses the same filter; the
    action is read-only, so a retry creates no duplicate
- `PROD-004-S14` (data, P2)
  - **Given** "Từ 20%" is applied and the list shows product B discounted 25.50% among 2 products
  - **When** product B is deleted (hard delete, nfr.md), then the viewer reloads the page
  - **Then** product B is no longer in the list and the total shown is 1

- `PROD-004-S15` (input, P3)
  - **Given** the fixture products
  - **When** `GET /products` is sent straight to the server with `minDiscount` `%2010` (value `" 10"`), `10.0` and
    `010` in turn
  - **Then** each request gets HTTP 400 with `message` containing "Mức giảm giá không hợp lệ"; no list is returned
    (exact strings only, unlike the price inputs)
  - → Recovery: the caller sends exactly `10`, `20`, `30` or `50`; read-only, so no duplicate
- `PROD-004-S16` (concurrency, P3)
  - **Given** the list shows the results for "Từ 10%"
  - **When** the viewer chooses "Từ 30%" and its results have not arrived yet
  - **Then** the list still shows the results for 10% until the results for 30% arrive, then shows only the product
    discounted 50.00%; "Giảm giá" shows "Từ 30%" throughout

## Non-Functional Requirements

| ID | Change | Category | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | MODIFIED | Performance | `GET /products` results are cached in Redis per set of query parameters (`q`, `limit`, `skip`, `sortBy`, `order`, `minPrice`, `maxPrice`, `minDiscount`); create / edit / delete invalidates every list cache | lives at most 30 seconds | backend/src/products/products.service.ts; change 001-products-price-range; change 002-products-discount-filter | PROD-004-S4 |
| NFR-004 | MODIFIED | Performance | The product list responds, also when filtered by any filter (price range, minimum discount, or both) | < 1 second on the current seed data (backend/src/seed.ts) | user decision, 2026-11-12; change 002-products-discount-filter (clarify, 2026-11-13) | SC-002 |
| NFR-011 | Applies | Security and permissions | The app has no login; no endpoint checks identity or permissions — known exception to constitution, Principle II | — | docs/requirements/price-range.md#Yêu cầu; backend/src/products/products.controller.ts; user decision, 2026-11-12 | Review: no auth guard added |
| NFR-012 | Applies | Security and permissions | Input is validated by `ValidationPipe` (`whitelist: true`, `transform: true`): wrong type / out of range → 400; undeclared fields or parameters are dropped silently | — | backend/src/main.ts | PROD-004-S5, PROD-004-S6, PROD-004-S7 |
| NFR-031 | Applies | Availability and operations | Redis does not persist to disk; when Redis fails or is down the cache fails open and every read goes straight to Postgres | — | docker-compose.prod.yml; backend/src/redis/cache.service.ts | PROD-004-S12 |
| NFR-040 | Applies | User environment | Vietnamese UI; a separate layout for narrow screens (breakpoint `xs`) | — | frontend/src/views/ProductList.tsx | Review of the discount control labels |
| NFR-044 | MODIFIED | User environment | Each price input and the "Giảm giá" discount control has a visible label that is also its accessible name for screen readers; each price input's error message is linked to it by `aria-describedby` | — | change 001-products-price-range (clarify, 2026-11-12); change 002-products-discount-filter (quality review, 2026-11-13) | Accessibility assertions in the tests of PROD-003-S2, S6, S7, S9, S16 and PROD-004-S1 |
| NFR-042 | Applies | User environment | Supported browsers: current Chrome, Safari, Firefox on desktop | — | user decision, 2026-11-12 | SC-004 manual check |

## Edge Cases & Error Handling

| Situation | Decision | Scenario |
| --- | --- | --- |
| Discount exactly equal to the chosen minimum (e.g. 10.00% with 10% or more) | Shown: "at least" is inclusive | PROD-004-S1 |
| Product with no discount (0.00%) | Shown only with Any | PROD-004-S1, PROD-004-S3 |
| Discount, price range and keyword together match no product | Common empty state of PROD-002, description "… Thử nới bộ lọc hoặc xoá bộ lọc." | PROD-002-S21 |
| Back after changing the minimum discount | The previous minimum discount and list come back (one history entry per change) | PROD-002-S24 |
| Clear filters | Also resets the discount to Any | PROD-002-S17 |
| Choose Any | No discount filter; `minDiscount` dropped from the URL | PROD-004-S3 |
| Direct request with a `minDiscount` other than 10, 20, 30, 50 (incl. empty or repeated) | HTTP 400 with "Mức giảm giá không hợp lệ", no list | PROD-004-S5, PROD-004-S6, PROD-004-S7 |
| `" 10"`, `10.0`, `010` on a direct request | 400: exact strings only, unlike the price inputs (fixed list, never typed) | PROD-004-S15 |
| A new minimum discount still loading | The previous list stays visible until the new results arrive | PROD-004-S16 |
| Upper boundary: 49.99% / 50.00% / 100.00% with "Từ 50%" | 50.00% and 100.00% shown, 49.99% not | PROD-004-S8 |
| Discount edited while a filter is applied | The edit invalidates the list cache; reload shows the new result | PROD-004-S9 |
| No identity on a direct request | Public read, same result as the UI (NFR-011) | PROD-004-S10 |
| Discount changed again before the first result arrives | The last choice wins; late results do not overwrite | PROD-004-S11 |
| Redis down | Fail-open: read from Postgres, same result | PROD-004-S12 |
| Server error while filtering by discount | Existing list-load error state; the control keeps the choice for retry | PROD-004-S13 |
| Product deleted while a discount filter is applied | Gone after reload; total decreases | PROD-004-S14 |
| Invalid, empty or repeated `minDiscount` in the URL (incl. `10.0`, `" 10"`) | Ignored: "Tất cả", no message | PROD-002-S18, PROD-002-S20 |
| Discount filter with pagination | Total and page count follow the filter | PROD-002-S19 |
| Discount chosen while on a later page | Back to page 1 | PROD-002-S22 |
| Price typed but not applied, then a discount chosen | Typed values discarded; applied range kept | PROD-002-S23 |
| Discount chosen first, then keyword and price range | All filters apply together; the discount is kept | PROD-002-S27 |
| Last product of a page deleted with a discount filter | Back to the previous page; the discount filter is kept | PROD-002-S25 |
| URL with a discount filter and a page beyond the last page | Empty state, pagination hidden (as for search today) | PROD-002-S26 |

**Fallback mode.** When Redis is down the list cache fails open (NFR-031): every list request, with or without a
minimum discount, reads Postgres directly and the filtered result is unchanged (PROD-004-S12). No message is shown.

## Architecture Decisions

### 002-ADR-1: Validating `minDiscount` on the server

**Status:** Accepted.

**Context.** PROD-004 accepts exactly `10`, `20`, `30` or `50` and rejects every other value — including an empty
`minDiscount=` and a repeated parameter — with HTTP 400 and the message "Mức giảm giá không hợp lệ" in the existing
`ValidationPipe` shape (PROD-004-S5–S7, NFR-012). `QueryProductDto` already validates `sortBy` / `order` with
`@IsIn`, and `ValidationPipe` runs with `whitelist: true, transform: true` (backend/src/main.ts).

**Options:**

| Option | How | Exact values only ("10", not "10.0" / " 10") | Empty and repeated → 400 | Same 400 shape as other parameters |
| --- | --- | --- | --- | --- |
| String allow-list in the DTO | `@IsOptional() @IsIn(['10','20','30','50'], { message: 'Mức giảm giá không hợp lệ' })` on a string `minDiscount` | Yes | Yes (`''` and an array are not in the list) | Yes |
| Number in the DTO | `@Type(() => Number) @IsIn([10,20,30,50])` | No: `"10.0"`, `" 10"` become 10 | Partly: `''` becomes 0 (rejected), but by accident | Yes |
| `ParseEnumPipe` in the controller | Validate the query parameter outside the DTO | Yes | Yes | No: a different error body |

**Decision.** String allow-list in `QueryProductDto`; the service converts the accepted string to a number for the
query (`discountPercentage >= 10 | 20 | 30 | 50`).

**Rationale.** The only option that accepts exactly the four strings of the spec, rejects empty and repeated values
by construction, and keeps the 400 body identical to the other list parameters.

**Trade-offs.** The four values exist twice (backend DTO, frontend control); a drift shows as a 400 for a value the UI
sends — PROD-004-S1 and PROD-004-S2 exercise every UI value end to end.

### 002-ADR-2: Applying the discount together with the other filters

**Status:** Accepted.

**Context.** PROD-002 requires every filter to apply together, with `total` and the page count on the filtered set
(PROD-002-S16, S19). The list query uses TypeORM `findAndCount` with a `where` that is an array of two branches
(`title ILIKE q` OR `description ILIKE q`) when there is a keyword (products.service.ts, `loadList`); PROD-001 adds the price range
(`minPrice ≤ price ≤ maxPrice`) to that `where`.

**Options:**

| Option | How | AND with every keyword branch | `total` on the filtered set |
| --- | --- | --- | --- |
| Add to the shared condition object | `discountPercentage: MoreThanOrEqual(n)` merged into the same condition object as the price range, used in each `where` branch | Yes | Yes (`findAndCount`) |
| Filter after loading | Load the page, then drop products below the minimum | — | No: pages and `total` would be wrong |

**Decision.** Build one condition object (price range from 001 + `discountPercentage >= n`) and spread it into every
`where` branch; `findAndCount` keeps computing `total` and the page on the filtered set.

**Rationale.** Matches PROD-002-S16 / S19 / S26 by construction and reuses the query shape 001 introduces.

**Trade-offs.** A future filter must also go into that shared object; PROD-002-S16 fails if one branch misses it.

### 002-ADR-3: Cache keys include the minimum discount

**Status:** Accepted.

**Context.** List results are cached in Redis under `products:list:v<version>:{q,limit,skip,sortBy,order,…}` and in
TanStack Query under `productKeys.list(params)` (products.service.ts, frontend/src/api/queryKeys.ts). A key without the
discount returns another discount's results (PROD-004-S4, NFR-001). Late responses for an older choice must not
replace the current list (PROD-004-S11).

**Options:**

| Option | How | Keeps the cache benefit | Correct per discount (S4) | Late responses ignored (S11) |
| --- | --- | --- | --- | --- |
| Add `minDiscount` to both keys | Redis key JSON gains `minDiscount`; `ProductQuery` gains `minDiscount?: '10' \| '20' \| '30' \| '50'` | Yes | Yes | Yes: each choice has its own query key; the list shows only the current key's data |
| Bypass the cache when a discount is set | Skip Redis and TanStack caching for discount requests | No | Yes | Needs extra request cancelling |

**Decision.** Add `minDiscount` to the Redis key and to `ProductQuery` (and so to `productKeys.list`), and pass it in
`getProducts` only when set.

**Rationale.** Reuses the version-based invalidation on create / edit / delete (PROD-004-S9, S14) and gives S11 for
free through per-key queries.

**Trade-offs.** Up to five times more list keys per page / sort combination; each lives at most 30 seconds (NFR-001).

### 002-ADR-4: Discount control and URL handling in the list page

**Status:** Accepted.

**Context.** The choice is applied as soon as it is made, like the sort control (Clarifications 2026-11-13). The URL
is the list's state; `updateParams` rebuilds the query string from a fixed list of keys (`q`, `page`, `sortBy`,
`order`, plus `minPrice` / `maxPrice` from 001), so a key not in that list is dropped (frontend/src/views/ProductList.tsx).
Invalid, empty or repeated `minDiscount` in the URL is ignored (PROD-002-S18, S20).

**Options:**

| Option | How | Applied on choose | Matches the "dropdown next to sort" assumption | Fits the URL rules |
| --- | --- | --- | --- | --- |
| Separate `DiscountFilter` select | New component next to `Sorting`; `onChange` → `updateParams({ minDiscount, page: null })`; a pure `parseMinDiscount(searchParams)` returns `'10' \| '20' \| '30' \| '50' \| null` (null for absent, invalid, empty or repeated via `getAll().length > 1`) | Yes | Yes | Yes, once `minDiscount` is added to the ordered key list and to the clear-filter action |
| Select inside `SearchForm` | Part of the search form, applied with Search | No (contradicts the clarification) | Partly | Yes |
| Row of chip buttons | Five buttons instead of a select | Yes | No | Yes |

**Decision.** A separate `DiscountFilter` select labelled "Giảm giá" with the options "Tất cả", "Từ 10%", "Từ 20%",
"Từ 30%", "Từ 50%"; `parseMinDiscount` in `frontend/src/utils/discountParams.ts`; `minDiscount` added to the key
list of `updateParams` and cleared by the clear-filter action.

**Rationale.** The only option that applies on choose and follows the layout assumption; a pure parser makes the
URL rules unit-testable.

**Trade-offs.** One more control in the toolbar; on narrow screens it follows the existing responsive toolbar
(NFR-040), not optimised here.

## Data Model

No data change: no table, column or index is added. The filter reads the existing `products.discountPercentage`
column (`numeric(5,2)`, 0–100, default 0 — backend/src/products/product.entity.ts). No index is added at the seed
data size; the `price` column used by the price filter has no index either (product.entity.ts); SC-002 (NFR-004) is checked by a timing test, and an index would be
a separate decision if that test fails.

## Clarifications

### Session 2026-11-13

- Q: Is the minimum discount applied as soon as the viewer chooses it, or only when they press Search? → A: As soon as it is chosen, like the sort control: the URL changes at once, the list goes back to page 1, one history entry per choice.
- Q: What does the server do with a `minDiscount` other than 10, 20, 30 or 50 (e.g. `15`, `abc`, `-5`, `101`)? → A: Only `10`, `20`, `30`, `50` are accepted; any other value → HTTP 400.
- Q: What are the exact labels of the discount control and its choices? → A: Label "Giảm giá"; choices "Tất cả", "Từ 10%", "Từ 20%", "Từ 30%", "Từ 50%".
- Q: Does the < 1 second target of NFR-004, set for the price filter, also apply to the discount filter? → A: Yes, to every filter, alone or combined (NFR-004 modified).
- Q: What is the exact `message` of the HTTP 400 for an invalid `minDiscount`? → A: "Mức giảm giá không hợp lệ".
- Q: Does NFR-044 (labels for screen readers) cover the discount control? → A: Yes: NFR-044 extended to "Giảm giá" (quality review CHK002).
- Q: Are `" 10"` and `"10.0"` accepted like the trimmed, numeric price inputs? → A: No: only the exact strings "10", "20", "30", "50"; every other variant → 400 on the server and ignored in the URL — a deliberate difference, the values come from a fixed list (quality review CHK007).
- Q: Is the empty-state description, which mentions only the price range, still right when the discount empties the list? → A: No: it becomes "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới bộ lọc hoặc xoá bộ lọc." (quality review CHK012).
- Q: What does the list show while results for a new minimum discount load? → A: The previous list stays visible, as for the price filter in change 001 (quality review CHK001).
- Q: How are the remaining quality-review points settled? → A: The clear-filter button stays in the empty state only; narrow screens and delete / undo are out of scope; SC-001 / SC-002 state their measurement; re-choosing the applied discount changes nothing; URL parameters are compared as a set; the discount-first order gets a scenario; `minDiscount` is part of the API contract (quality review CHK003, 004, 009, 011, 014, 017, 020, 022, 028).

## Assumptions

- The price range filter of change 001 (PROD-001–PROD-003) is in place; this change builds on its URL state and empty
  state.
- The discount compared is the stored `discountPercentage`, the value that also gives the struck-through pre-discount
  price on the product card (glossary).
- The control "Giảm giá" is a dropdown next to the existing sort control (layout default).

## Open Questions

## Traceability

| Requirement | Scenarios |
| --- | --- |
| PROD-002 | S1, S2, S4–S6, S10, S11, S13–S27 |
| PROD-004 | S1–S16; also PROD-002-S16, PROD-002-S19, PROD-002-S27 (Covers) |

| NFR | Verified by |
| --- | --- |
| NFR-001 | PROD-004-S4 |
| NFR-004 | SC-002 |
| NFR-011 | Review: no auth guard added |
| NFR-012 | PROD-004-S5, PROD-004-S6, PROD-004-S7 |
| NFR-031 | PROD-004-S12 |
| NFR-040 | Review of the discount control labels |
| NFR-044 | Accessibility assertions in the tests of PROD-003-S2, S6, S7, S9, S16 and PROD-004-S1 |
| NFR-042 | SC-004 manual check |
