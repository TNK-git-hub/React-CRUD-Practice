---
kind: capability
domain: "products"
code: "PROD"
---

<!--
LIVING SPEC of one domain: describes what the system DOES now.
- Only /spec-archive may modify this file (merging the delta spec of a finished change).
- Never contains the delta keywords (add, modify, remove, rename) of a delta spec.
- Requirements are ordered by ascending ID; each requirement records the change that last set or modified it.
- Right after bootstrap: Requirements stays "(none yet)". Requirements appear only after the domain's first change is archived.
-->

# Capability: products (PROD)

## Overview

Brownfield: existing behavior has not been specified; only new changes are specified.

Related: [states.md](states.md) · [rules.md](rules.md) · [history.md](history.md)

## Requirements

### PROD-001: Filter the product list by price range

The system MUST show in the product list only the products whose price is within the range the viewer enters, both
ends inclusive (BR-PROD-01); an empty end means no bound on that side, and both ends empty means no price filter
(BR-PROD-02). The range is entered in two inputs of the existing search form and applied only when the viewer presses
Search or Enter, together with the keyword.

**API.** `GET /products` accepts two optional query parameters; the response shape does not change.

| Parameter | Type | Rule | Meaning |
| --- | --- | --- | --- |
| `minPrice` | string | plain number, ≤ 99999999.99 (PROD-003); empty (`minPrice=`) = absent | price ≥ value |
| `maxPrice` | string | as `minPrice`; with both, `minPrice ≤ maxPrice` | price ≤ value |

```json
{ "products": [ /* ProductSummary */ ], "total": 2, "skip": 0, "limit": 10 }
```

- `products` holds only products with `minPrice ≤ price ≤ maxPrice` (an absent end drops that condition), AND the
  keyword `q`.
- The `X-Cache: HIT | MISS` header stays as today; the list cache key includes `minPrice` and `maxPrice`.

**UI.** Two text inputs labelled "Giá tối thiểu ($)" and "Giá tối đa ($)" sit in the existing search form. Search or
Enter applies keyword and range together: the URL gets `minPrice` / `maxPrice` (an empty input drops its key) and
loses `page`. The inputs always show the range applied in the URL.

**Permissions:** Every viewer, no login needed; no role is denied. Not checking permissions is a known exception to
constitution Principle II (NFR-011).

**Scenarios:**

Fixture unless stated: products priced 5.00, 10.00, 20.00 and 30.00 USD.

- `PROD-001-S1` (happy, P1)
  - **Given** the fixture products
  - **When** the viewer enters "10" in "Giá tối thiểu ($)", "20" in "Giá tối đa ($)" and presses Search
  - **Then** the list shows exactly the 10.00 and 20.00 products; the URL has `minPrice=10&maxPrice=20`
- `PROD-001-S2` (happy, P1)
  - **Given** the fixture products
  - **When** the viewer enters only "20" in "Giá tối thiểu ($)" and presses Search
  - **Then** the list shows exactly the 20.00 and 30.00 products
- `PROD-001-S3` (happy, P1)
  - **Given** the fixture products
  - **When** the viewer enters only "10" in "Giá tối đa ($)" and presses Search
  - **Then** the list shows exactly the 5.00 and 10.00 products
- `PROD-001-S5` (input, P3)
  - **Given** the fixture products
  - **When** the viewer enters " 10 " and " 20 " (leading and trailing spaces) and presses Search
  - **Then** the spaces are dropped; the list shows exactly the 10.00 and 20.00 products; no error message
- `PROD-001-S6` (boundary, P2)
  - **Given** the fixture products
  - **When** the viewer enters "20" in both inputs and presses Search
  - **Then** the list shows exactly the 20.00 product
- `PROD-001-S7` (boundary, P1)
  - **Given** products priced 19.99, 20.00 and 20.01 USD
  - **When** the viewer enters min "19.99", max "20" and presses Search
  - **Then** the list shows the 19.99 and 20.00 products and not the 20.01 product (exact to 2 decimals, no rounding)
- `PROD-001-S8` (permission, P2)
  - **Given** the app has no login (NFR-011)
  - **When** `GET /products?minPrice=10&maxPrice=20` is sent straight to the server with no identity
  - **Then** HTTP 200; `products` are exactly the 10.00 and 20.00 products, as through the UI
- `PROD-001-S11` (dependency, P2)
  - **Given** the list cache (Redis) is down
  - **When** the viewer filters 10–20
  - **Then** the list still shows exactly the 10.00 and 20.00 products, read straight from the database (NFR-031)
- `PROD-001-S12` (dependency, P3)
  - **Given** the server fails when fetching the list
  - **When** the viewer filters 10–20 and presses Search
  - **Then** the existing list-load error state is shown (title "Không tải dược danh sách sản phẩm", retry button)
  - → Recovery: the viewer presses retry; the inputs still hold 10 and 20, so the retry uses the same range; the
    action is read-only, so a retry creates no duplicate
- `PROD-001-S14` (domain, P1)
  - **Given** the results for 10–20 were just loaded and are in the list cache (NFR-001)
  - **When** the viewer changes to 30–40 and presses Search while that cache entry is still valid
  - **Then** the list shows the products priced 30–40 USD, not the cached 10–20 results
- **Source:** change 001-products-price-range

### PROD-002: Combine the price range with search, sort and pagination

The system MUST apply the price range together with the keyword, the sort order and pagination, with the total and the
page count computed on the filtered result, and MUST keep the range in the URL with the keyword, sort and page.

**Empty result.** When the filters return no product, the page shows the title "Không tìm thấy sản phẩm nào" and the
description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." — the same description
for every filter, keyword-only included. The clear-filter button clears both the keyword and the range and keeps the
sort.

**URL state.** Every change below is one browser history entry (`router.push`, as search does today).

| Action | URL after the action |
| --- | --- |
| Search with a valid keyword / range | sets `q`, `minPrice`, `maxPrice` (empty input drops its key); drops `page` |
| Change sort | sets `sortBy`, `order`; drops `page`; keeps `q`, `minPrice`, `maxPrice` |
| Change page / delete the last product of a page | sets `page`; keeps every other key |
| Clear-filter button | drops `q`, `minPrice`, `maxPrice`, `page`; keeps `sortBy`, `order` |
| Open a URL with an invalid `minPrice` / `maxPrice` | that value is ignored: input empty, no bound on that side, no message |
| Open a URL where both values are valid but `minPrice > maxPrice` | both ignored: inputs empty, no price filter, no message |
| Open a URL with a repeated price parameter | that side is ignored: input empty, no message |

Values typed but not applied are discarded when the URL changes; the inputs return to the applied range.

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
    lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc."
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
- **Source:** change 001-products-price-range

### PROD-003: Validate the price range

The system MUST reject an invalid price range — negative, more than 2 decimals, not a number, greater than
99999999.99, or a minimum greater than the maximum — by blocking it in the UI with an error message before sending,
and the server MUST reject it too when the request is sent straight to it (BR-PROD-03 – BR-PROD-07).

**Checks.** Each input is trimmed of leading and trailing spaces, then checked in this order; the first failure wins.
A **plain number** is digits only, optionally followed by a dot and digits (counted as typed).

| # | Check | Rejected examples | Message (verbatim) |
| --- | --- | --- | --- |
| 1 | Not negative (`-` followed by a number) | `-1`, `-0.01` | "Giá không được âm" |
| 2 | Plain number | `abc`, `10,5`, `1,000`, `1e3`, `+5`, `.5`, `5.` | "Giá phải là số" |
| 3 | At most 2 decimals | `1.000`, `10.123` | "Giá chỉ được có tối đa 2 chữ số thập phân" |
| 4 | ≤ 99999999.99 | `100000000` | "Giá không được lớn hơn $99,999,999.99" |
| 5 | min ≤ max — only when both inputs pass 1–4 | min `30`, max `10` | "Giá tối thiểu không được lớn hơn giá tối đa" |

Valid values are compared as numbers: "010", "10.5" and "10.50" are valid, equal values give equal results, and the
URL keeps the string as typed (after trimming), not normalised. `0` is valid (BR-PROD-03).

**UI.** On a failed check no request is sent, the URL does not change, the typed values and the current list are
kept. Each message appears under its own input; the min > max message and server messages appear under
"Giá tối thiểu ($)"; every message is linked to its input by `aria-describedby` (NFR-044). Messages appear only when
the viewer types and presses Search; invalid values read from the URL never produce a message (PROD-002). If the
server rejects a value the UI let through, the server's message is shown under "Giá tối thiểu ($)", the list-load
error state is not shown, and the list keeps its last successful results. Other errors (5xx, network) show the
existing list-load error state (see PROD-001-S12).

**Server.** `GET /products` answers an invalid price parameter with HTTP 400 in the existing `ValidationPipe` shape;
each `message` element is the exact sentence from the checks table, checked in the same order:

```json
{ "statusCode": 400, "message": ["Giá phải là số"], "error": "Bad Request" }
```

An empty parameter (`minPrice=`) means no bound; a repeated parameter (`minPrice=10&minPrice=20`) fails check 2.

**Permissions:** As PROD-001: every viewer, no login; no role is denied (NFR-011).

**Scenarios:**

Recovery for UI input errors unless stated: the viewer fixes the failing input; the typed values are kept; the list
keeps its previous results.

- `PROD-003-S1` (happy, P1)
  - **Given** the product list page
  - **When** the viewer enters min "0", max "99999999.99" and presses Search
  - **Then** the range is accepted; no error message; the list is filtered by that range
- `PROD-003-S2` (input, P2)
  - **Given** the product list page
  - **When** the viewer enters min "30", max "10" and presses Search
  - **Then** no request is sent; "Giá tối thiểu không được lớn hơn giá tối đa" appears under "Giá tối thiểu ($)"; the
    list is unchanged
  - → Recovery: the viewer edits either input; the typed values are kept
- `PROD-003-S3` (input, P1)
  - **Given** the server is running
  - **When** `GET /products?minPrice=30&maxPrice=10` is sent straight to the server
  - **Then** HTTP 400; `message` contains "Giá tối thiểu không được lớn hơn giá tối đa"; no list is returned
  - → Recovery: the caller fixes the parameters (min ≤ max) and resends; the request is read-only, so resending
    creates no duplicate
- `PROD-003-S6` (input, P2)
  - **Given** the product list page
  - **When** the viewer enters "1.000", then "1e3", pressing Search each time
  - **Then** no request is sent; "1.000" shows "Giá chỉ được có tối đa 2 chữ số thập phân"; "1e3" shows
    "Giá phải là số"
  - → Recovery: as stated above the scenarios
- `PROD-003-S7` (boundary, P2)
  - **Given** the product list page
  - **When** the viewer enters min "-0.01" (or "-1") and presses Search
  - **Then** no request is sent; "Giá không được âm" appears; entering "0" instead is valid (BR-PROD-03)
  - → Recovery: as stated above the scenarios
- `PROD-003-S9` (boundary, P2)
  - **Given** the product list page
  - **When** the viewer enters max "100000000" and presses Search
  - **Then** no request is sent; "Giá không được lớn hơn $99,999,999.99" appears; entering "99999999.99" instead is
    valid (BR-PROD-06)
  - → Recovery: as stated above the scenarios
- `PROD-003-S10` (input, P1)
  - **Given** the server is running
  - **When** `GET /products` is sent straight to the server with `minPrice` "-1", "10.123", "abc" and "100000000" in turn
  - **Then** each request gets HTTP 400 with `message` containing, in turn, "Giá không được âm",
    "Giá chỉ được có tối đa 2 chữ số thập phân", "Giá phải là số", "Giá không được lớn hơn $99,999,999.99"; no list
    is returned (BR-PROD-07)
  - → Recovery: the caller fixes the parameter and resends; read-only, so no duplicate
- `PROD-003-S11` (missing, P3)
  - **Given** products priced 5.00, 10.00, 20.00 and 30.00 USD
  - **When** `GET /products?minPrice=&maxPrice=10` is sent straight to the server
  - **Then** HTTP 200; `products` are exactly the 5.00 and 10.00 products (no lower bound)
- `PROD-003-S14` (dependency, P2)
  - **Given** the list shows the results for 10–20
  - **When** the viewer applies a range the UI lets through and the server answers HTTP 400
  - **Then** the server's message appears under "Giá tối thiểu ($)"; the list-load error state is not shown; the list
    keeps the 10–20 results
  - → Recovery: as stated above the scenarios
- `PROD-003-S16` (input, P3)
  - **Given** the product list page
  - **When** the viewer enters min "30,5", max "10" and presses Search
  - **Then** no request is sent; only "Giá phải là số" appears, under "Giá tối thiểu ($)";
    "Giá tối thiểu không được lớn hơn giá tối đa" is not shown
  - → Recovery: as stated above the scenarios
- `PROD-003-S17` (boundary, P3)
  - **Given** products priced 5.00, 10.00, 20.00 and 30.00 USD
  - **When** the viewer enters min "010", max "20.00" and presses Search
  - **Then** the range is accepted; the list shows the 10.00 and 20.00 products, as for 10–20; the URL keeps
    `minPrice=010&maxPrice=20.00`
- `PROD-003-S18` (missing, P3)
  - **Given** the server is running
  - **When** `GET /products?minPrice=10&minPrice=20` is sent straight to the server
  - **Then** HTTP 400; `message` contains "Giá phải là số"; no list is returned
  - → Recovery: the caller fixes the parameter and resends; read-only, so no duplicate
- **Source:** change 001-products-price-range

<!-- Shape of one requirement after archive:

### [CODE]-001: [Requirement name]

The system MUST [behavior].

**[Aspect, e.g. API].** [details copied from the change: tables, JSON, messages verbatim]

**Permissions:** [...]

**Scenarios:**

- `[CODE]-001-S1` (happy, P1)
  - **Given** …
  - **When** …
  - **Then** …
- `[CODE]-001-S2` (permission, P1)
  - **Given** …
  - **When** … (calls the backend directly)
  - **Then** …
  - → Recovery: …
  - Covers: [OTHER]-[NNN]
- **Source:** change [NNN-change-name]

The change's NFR rows go to specs/_system/nfr.md; its Architecture Decisions stay in specs/archive/<change>/spec.md.
-->
