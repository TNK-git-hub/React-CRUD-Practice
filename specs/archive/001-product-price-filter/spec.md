---
kind: delta
change: "001-product-price-filter"
capabilities: ["products/filtering"]
primary: "products/filtering"
status: archived
source: ["docs/requirements/price-range.md#Requirement", "docs/requirements/price-range.md#Out of scope", "roadmap 001"]
---

# Change 001: Filter products by price range

## Overview

### Context

The product list (page `/`, `/products/search` with a keyword, backed by `GET /products`) can already be searched by
keyword, sorted and paged, with its state kept in the URL (frontend/src/views/ProductList.tsx). It cannot be narrowed
by price, so visitors looking for products within a budget page through the whole list
(docs/requirements/price-range.md#Requirement, "Why"). The app has no login; every visitor is anonymous.

Brownfield: the feature `products/filtering` has no requirement yet, so the existing search, sort and pagination
behaviors this change relies on are stated in the requirement details below, with their code source. Two existing
behaviors change (PROD-002): the empty-result description becomes common to every filter, keyword-only included, and
the empty state's button, renamed "Xoá bộ lọc", clears the range as well as the keyword.

### Goals

- **Find by budget:** a visitor narrows the product list to a minimum and/or maximum price in one step.
- **Works with what exists:** the price range combines with keyword search, sort and pagination.
- **Shareable state:** the applied range lives in the URL like the keyword, sort and page.
- **No silent wrong results:** an invalid price bound is rejected, never guessed.

## Success Criteria

- **SC-001:** The product list responds in < 1 second on the current seed data, also when filtered by price
  (NFR-004). Measured by the e2e script on the real PostgreSQL with the seed data: one `GET /products` with a price
  range returns in < 1 second.
- **SC-002:** On the seed data, for the sample ranges — only a minimum; only a maximum; both; minimum = maximum; a range
  with no product — 0 products outside the range appear and 0 products inside it are missing, compared with a manual
  filter of the seed data.
- **SC-003:** 100% of negative bounds and of bounds with more than 2 decimal places sent straight to the server are
  rejected with HTTP 400 (PROD-003).
- **SC-004:** The price filter works as specified in the current stable Chrome, Safari and Firefox on desktop
  (NFR-042). Measured by a manual check in each browser.

## Scope

### In Scope

- Optional `minPrice` and `maxPrice` query parameters on `GET /products`.
- Two price inputs in the existing search form of the product list page.
- The applied range kept in the URL and combined with keyword, sort and pagination.
- Validation of the price bounds in the UI before sending, and on the server (PROD-003).
- List cache keys (Redis, NFR-001) that include the range.

### Out of Scope

- Filtering by discount (docs/requirements/price-range.md#Out of scope).
- Keeping the filter between visits (docs/requirements/price-range.md#Out of scope); keeping the applied range in the
  URL (PROD-002) does not count as keeping it between visits.
- Currencies other than USD (docs/requirements/price-range.md#Out of scope; NFR-041).
- Adding login or permission checks (NFR-011).
- The price conflict `≥ 0` (server, backend/src/products/dto/create-product.dto.ts) / `> 0` (create / edit form,
  frontend/src/utils/productForm.ts) — not fixed in this change (user decision, clarify 2026-11-15); the open question
  stays in specs/_system/roadmap.md.

## Requirements

### products/filtering

#### ADDED PROD-001: Filter the product list by price range

The system MUST show in the product list only the products whose price is within the range the visitor enters: it
follows BR-PROD-01, a range includes both ends, so a product priced exactly at the minimum or the maximum is shown,
and BR-PROD-02, an empty minimum means no lower limit, an empty maximum no upper limit, and both empty means no price
filter (capability products, rules.md).

**Price compared.** The bounds are compared with the product's stored selling price `price`, in USD — the number shown
prominently on the product card — not with the struck-through pre-discount price (specs/_system/glossary.md, "Price",
"Pre-discount price"). Comparison is exact to 2 decimal places, without rounding (`price` is `numeric(10,2)`).

**API.** `GET /products` accepts two optional query parameters; the response shape does not change.

| Parameter | Meaning | Valid values |
| --- | --- | --- |
| `minPrice` | only products with `price ≥ minPrice` | see PROD-003 |
| `maxPrice` | only products with `price ≤ maxPrice` | see PROD-003 |

```json
{ "products": [ /* products of the page */ ], "total": 2, "skip": 0, "limit": 10 }
```

- An absent parameter drops its condition; with both absent the list is not filtered by price.
- `total` counts the products that match every filter (PROD-002).
- The `X-Cache: HIT | MISS` header is sent as today (backend/src/products/products.controller.ts); the list cache key
  includes `minPrice` and `maxPrice` (NFR-001), so the cached list of another range is never returned.

**UI.** Two text inputs with visible labels "Giá tối thiểu ($)" (minimum price) and "Giá tối đa ($)" (maximum price),
each label tied to its input (NFR-044), no placeholder, sit in the existing search form next to the keyword input (layout default). The range is applied together with the
keyword when the visitor submits the search form with the "Search" button or Enter, as the keyword is today
(frontend/src/comopnents/ProductListPageCom/SearchForm.tsx); typing alone does not reload the list (default). The
applied range is written to the URL as `minPrice` / `maxPrice`; an empty input drops its key. The inputs show the range
currently applied in the URL (default).

**Permissions:** Every visitor, no login needed; no role is denied. Not checking permissions is a known exception to
constitution Principle II: the app has no identity, so there is no permission to check in the backend (NFR-011).

**Scenarios:**

Fixture unless stated: products priced 5.00, 10.00, 20.00 and 30.00 USD, no keyword.

- `PROD-001-S1` (happy, P1)
  - **Given** the fixture products
  - **When** the visitor enters "10" in "Giá tối thiểu ($)" and "20" in "Giá tối đa ($)" and presses "Search"
  - **Then** the list shows exactly the 10.00 and 20.00 products; the URL has `minPrice=10&maxPrice=20`
- `PROD-001-S2` (happy, P1)
  - **Given** the fixture products
  - **When** the visitor enters only "20" in "Giá tối thiểu ($)" and presses "Search"
  - **Then** the list shows exactly the 20.00 and 30.00 products; the URL has `minPrice=20` and no `maxPrice`
- `PROD-001-S3` (happy, P1)
  - **Given** the fixture products
  - **When** the visitor enters only "10" in "Giá tối đa ($)" and presses "Search"
  - **Then** the list shows exactly the 5.00 and 10.00 products; the URL has `maxPrice=10` and no `minPrice`
- `PROD-001-S4` (happy, P1)
  - **Given** the fixture products and no identity sent (the app has no login)
  - **When** `GET /products?minPrice=10&maxPrice=20` is sent straight to the server
  - **Then** HTTP 200; `products` are exactly the 10.00 and 20.00 products; `total` is 2
  - Covers: PROD-002
- `PROD-001-S5` (happy, P1)
  - **Given** the fixture products and a range 10–20 applied
  - **When** the visitor empties both price inputs and presses "Search"
  - **Then** the list shows all 4 products; the URL has neither `minPrice` nor `maxPrice`
- `PROD-001-S6` (input, P3)
  - **Given** the fixture products
  - **When** the visitor enters " 10 " in "Giá tối thiểu ($)" and " 20 " in "Giá tối đa ($)" (leading and trailing
    spaces) and presses "Search"
  - **Then** the spaces are dropped; no error message; the list shows exactly the 10.00 and 20.00 products; the URL
    has `minPrice=10&maxPrice=20`
- `PROD-001-S7` (boundary, P1)
  - **Given** products priced 19.99, 20.00 and 20.01 USD
  - **When** the visitor enters "19.99" in "Giá tối thiểu ($)" and "20" in "Giá tối đa ($)" and presses "Search"
  - **Then** the list shows the 19.99 and 20.00 products and not the 20.01 product (both ends included, exact to 2
    decimal places, no rounding)
- `PROD-001-S8` (boundary, P2)
  - **Given** the fixture products
  - **When** the visitor enters "20" in both price inputs and presses "Search"
  - **Then** no error message (a minimum equal to the maximum is valid); the list shows exactly the 20.00 product
- `PROD-001-S9` (boundary, P3)
  - **Given** the fixture products and a product priced 0.00 USD
  - **When** `GET /products?maxPrice=0` is sent straight to the server
  - **Then** HTTP 200; `products` is exactly the 0.00 product; `total` is 1
- `PROD-001-S10` (state, P2)
  - **Given** the results for 10–20 (the 10.00 and 20.00 products) were just loaded and are in the list cache
  - **When** the 10.00 product's price is edited to 25.00 (`PATCH /products/:id`) and the visitor applies 10–20 again
    within 30 seconds
  - **Then** the list shows only the 20.00 product: editing a product invalidates every cached list (NFR-001), so the
    old result is not served
- `PROD-001-S11` (concurrency, P2)
  - **Given** the fixture products
  - **When** the visitor applies 10–20 and, before its results arrive, applies 20–30
  - **Then** the list ends up showing exactly the 20.00 and 30.00 products — the range in the URL — and never the
    10–20 results; the inputs show "20" and "30"
- `PROD-001-S12` (dependency, P2)
  - **Given** the fixture products and the list cache (Redis) is down
  - **When** the visitor applies 10–20
  - **Then** the list shows exactly the 10.00 and 20.00 products, read straight from the database (NFR-031); no
    message is shown
- `PROD-001-S13` (domain, P1)
  - **Given** the fixture products and a product priced 20.00 USD with `discountPercentage` 50, whose card also shows
    the struck-through pre-discount price 40.00
  - **When** the visitor applies 30–50, then 10–20
  - **Then** for 30–50 the list shows only the 30.00 product (the discounted product is not shown); for 10–20 it shows
    the 10.00, 20.00 and the discounted 20.00 products — the stored selling price is compared, never the pre-discount
    price
- `PROD-001-S14` (domain, P1)
  - **Given** the results for 10–20 were just loaded and are in the list cache (lives 30 seconds, NFR-001)
  - **When** the visitor applies 30–40 within those 30 seconds
  - **Then** the list shows exactly the 30.00 product, not the cached 10–20 results (the cache key includes
    `minPrice` and `maxPrice`)

#### ADDED PROD-002: Combine the price range with search, sort and pagination

The system MUST apply the price range together with the keyword, the sort order and pagination, on the server over
all products (not only the page shown), with `total` and the page count computed on the filtered result, and MUST
keep the applied range in the URL together with the keyword, sort and page.

**Keyword, sort, pages.** Follows the existing list behavior (frontend/src/views/ProductList.tsx,
backend/src/products/products.service.ts): the keyword `q` matches part of `title` or `description`, case-insensitive;
sort is by `title`, `price`, `rating` or `stock`, `asc` / `desc`, ties ordered by ascending `id`, default `title asc`
in the UI; 10 products per page (NFR-003), with the line "Hiển thị <first>-<last> trong <total> sản phẩm". A product
must match the keyword AND the range.

**URL state.** Every change below is one browser history entry, as search does today.

| Action | URL after the action |
| --- | --- |
| Submit the search form (keyword and / or range) | sets `q`, `minPrice`, `maxPrice` (an empty input drops its key); drops `page` — follows the existing rule "a new search returns to page 1" (frontend/src/views/ProductList.tsx, `handleSearch`) |
| Change the sort | sets `sortBy`, `order`; drops `page` (existing rule, `handleSort`); keeps `q`, `minPrice`, `maxPrice` |
| Change the page | sets `page` (page 1 is not written, existing rule); keeps every other key |
| Press "Xoá bộ lọc" in the empty state | drops `q`, `minPrice`, `maxPrice`, `page`; keeps `sortBy`, `order` |
| Open a URL with an invalid `minPrice` / `maxPrice` (fails a check of PROD-003, e.g. `abc`, `-1`, a repeated key) | that value is ignored: its input is empty, no bound on that side, no message; the other side still applies |
| Open a URL where both values are valid but `minPrice > maxPrice` | both are ignored: both inputs empty, no price filter, no message |

Ignoring invalid URL values follows how the list already treats an invalid `sortBy` / `order` in the URL
(frontend/src/views/ProductList.tsx, `isSortField`, `isSortOrder`); the messages of PROD-003 appear only after the
visitor types and presses "Search" / Enter. A request sent straight to the server with such a value is still
rejected (PROD-003).

The path stays `/products/search` when a keyword is set and `/` otherwise (existing rule); a range alone does not
change the path.

**Loading and errors.** While the results of a newly applied range (or keyword, sort, page) load, the previous
results stay visible until the new ones arrive, as page and sort changes do today (frontend/src/hooks/useProducts.ts,
`keepPreviousData`); only the first load of the page, with no previous results, shows the existing loading skeleton.
When the list request fails, the existing error state is shown, title "Không tải dược danh sách sản phẩm", with the
"Thử lại" button (frontend/src/views/ProductList.tsx). The same states apply to a filtered list.

**Empty result.** When the filters return no product, the page shows the title "Không tìm thấy sản phẩm nào" and the
description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." — the same description
for every filter, keyword-only included (it replaces today's keyword description,
frontend/src/views/ProductList.tsx). The empty state's button is labelled "Xoá bộ lọc" (today "Xoá từ khoá",
frontend/src/comopnents/ProductListPageCom/StatusMessage.tsx); it clears both the keyword and the range and keeps the
sort; pagination is hidden, as today.

**Permissions:** Every visitor, no login needed (NFR-011); no role is denied.

**Scenarios:**

- `PROD-002-S1` (happy, P1)
  - **Given** products whose title contains "phone" priced 50, 150, 300 and 600 USD, and a product without "phone"
    priced 200 USD
  - **When** the visitor enters keyword "phone", range 100–500, presses "Search", then sorts by price descending
  - **Then** the list shows only the "phone" products priced 300 then 150 USD; the total shown is 2; the URL keeps
    `q=phone`, `minPrice=100`, `maxPrice=500`
  - Covers: PROD-001
- `PROD-002-S2` (happy, P1)
  - **Given** 15 products in the applied range, 10 products per page
  - **When** the visitor opens page 2
  - **Then** page 2 shows the remaining 5 products; the line reads "Hiển thị 11-15 trong 15 sản phẩm"; there are 2 pages
- `PROD-002-S3` (happy, P1)
  - **Given** range 10–20 is applied and the visitor is on page 2
  - **When** the visitor changes the sort to price ascending
  - **Then** the list is still filtered by 10–20 and shows page 1; the URL has `minPrice=10&maxPrice=20`, the new
    `sortBy` / `order` and no `page`
- `PROD-002-S4` (input, P2)
  - **Given** products priced 5.00, 10.00, 20.00 and 30.00 USD, and the visitor opens `/?minPrice=abc&maxPrice=20`
    (hand-edited or an old link), then `/?minPrice=30&maxPrice=10`
  - **When** the list page loads each time
  - **Then** for the first URL "Giá tối thiểu ($)" is empty, "Giá tối đa ($)" shows "20", no error message, and the
    list shows exactly the 5.00, 10.00 and 20.00 products; for the second URL both inputs are empty, no message, and
    the list shows all 4 products
- `PROD-002-S5` (boundary, P2)
  - **Given** exactly 10 products in the applied range, 10 products per page
  - **When** the list loads, then an 11th product priced in the range is added and the visitor applies the range again
  - **Then** first: 1 page, the line reads "Hiển thị 1-10 trong 10 sản phẩm"; after: 2 pages, page 2 shows 1 product,
    the line on page 2 reads "Hiển thị 11-11 trong 11 sản phẩm"
- `PROD-002-S6` (boundary, P3)
  - **Given** 15 products in the range 10–20 (2 pages)
  - **When** the visitor opens `/?minPrice=10&maxPrice=20&page=5`
  - **Then** no product is on that page, so the empty state is shown: title "Không tìm thấy sản phẩm nào",
    description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc.", pagination hidden
  - → Recovery: the visitor presses "Xoá bộ lọc" or opens page 1; read-only, so no duplicate
- `PROD-002-S7` (missing, P3)
  - **Given** products priced 5.00, 10.00, 20.00 and 30.00 USD and no keyword
  - **When** the visitor applies only the range 10–20 and presses "Search"
  - **Then** the path stays `/` (not `/products/search`); the URL is `/?minPrice=10&maxPrice=20`; the list shows
    exactly the 10.00 and 20.00 products
- `PROD-002-S8` (collection, P2)
  - **Given** no product is priced between 1000 and 2000 USD
  - **When** the visitor applies 1000–2000, with or without a keyword
  - **Then** the page shows the title "Không tìm thấy sản phẩm nào", the description "Không có sản phẩm nào khớp bộ lọc
    hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." and the "Xoá bộ lọc" button; pagination is hidden
  - → Recovery: the visitor widens the range or presses "Xoá bộ lọc"; the typed values stay in the inputs
  - Covers: PROD-001
- `PROD-002-S9` (collection, P2)
  - **Given** no product matches the keyword "zzzz" and no range is applied
  - **When** the visitor searches for "zzzz"
  - **Then** the empty state shows the same description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá
    hoặc xoá bộ lọc." (not today's keyword description) and the "Xoá bộ lọc" button
  - → Recovery: the visitor changes the keyword or presses "Xoá bộ lọc"
- `PROD-002-S10` (collection, P2)
  - **Given** the empty state with keyword "phone", range 1000–2000 and sort by price descending
  - **When** the visitor presses "Xoá bộ lọc"
  - **Then** the keyword input and both price inputs are empty; the list shows every product, still sorted by price
    descending, page 1; the URL keeps `sortBy` and `order` only and the path is `/`
- `PROD-002-S11` (collection, P3)
  - **Given** three products priced 15.00 USD with ids 3, 7 and 9, all in the range 10–20
  - **When** the visitor sorts by price ascending
  - **Then** the three products appear in the order of ids 3, 7, 9 (ties ordered by ascending id), on every reload
- `PROD-002-S12` (concurrency, P2)
  - **Given** range 10–20 is applied and the visitor has typed 30–40 without pressing "Search"
  - **When** the visitor changes the sort or the page
  - **Then** the list is still filtered by the applied 10–20; the price inputs show "10" and "20" again (the typed
    values are discarded)
- `PROD-002-S13` (concurrency, P3)
  - **Given** the visitor applied 10–20, then 30–40
  - **When** the visitor presses the browser's Back button
  - **Then** the URL, the list and both price inputs return to 10–20; pressing Back again returns to the state before
    filtering
- `PROD-002-S14` (dependency, P2)
  - **Given** the server fails (5xx or network error) when the list is fetched
  - **When** the visitor applies 10–20 and presses "Search"
  - **Then** the existing error state is shown: title "Không tải dược danh sách sản phẩm", "Thử lại" button; the URL
    keeps `minPrice=10&maxPrice=20`
  - → Recovery: the visitor presses "Thử lại"; the request uses the same range from the URL; read-only, so a retry
    creates no duplicate
- `PROD-002-S15` (domain, P2)
  - **Given** the visitor is on page 3 of the results for 10–20
  - **When** the visitor applies 30–40 and presses "Search"
  - **Then** the list shows page 1 of the results for 30–40; the URL has no `page`
- `PROD-002-S16` (concurrency, P3)
  - **Given** the list shows the results for 10–20 and the server answers the next list request slowly
  - **When** the visitor applies 30–40 and presses "Search"
  - **Then** until the new results arrive the 10–20 results stay visible (no loading skeleton); then the list shows
    the 30–40 results

#### ADDED PROD-003: Validate the price bounds

The system MUST reject a price bound that is negative (follows BR-PROD-03: the minimum and maximum price are not
negative, capability products, rules.md) or that has more than 2 decimal places (follows BR-PROD-04: at most 2
decimal places, the price column is `numeric(10,2)`, rules.md), and a range whose minimum is greater than its
maximum; it MUST NOT return a list for such a request.

**Checks.** Each bound is checked in this order; the first failure wins and only its message is shown. Check 5 runs
only when both bounds are set and both pass checks 1–4. The UI and the server use the same messages, verbatim.

| # | Check | Rejected examples | Source | Message (verbatim) |
| --- | --- | --- | --- | --- |
| 1 | Not negative: any value starting with a minus sign followed by a number is rejected, `-0` included | `-1`, `-0.01`, `-0` | BR-PROD-03 | "Giá không được âm" |
| 2 | Is a plain number: digits, optionally a dot followed by digits | `abc`, `10,5`, `1,000`, `1e3`, `+5`, `.5`, `5.` | clarify 2026-11-15 | "Giá phải là số" |
| 3 | At most 2 decimal places | `1.000`, `10.123` | BR-PROD-04 | "Giá chỉ được có tối đa 2 chữ số thập phân" |
| 4 | At most 99999999.99 (the largest value of `numeric(10,2)`) | `100000000` | clarify 2026-11-15 | "Giá không được lớn hơn $99,999,999.99" |
| 5 | Minimum ≤ maximum: a minimum greater than the maximum is rejected, never answered with an empty list | min `30`, max `10` | clarify 2026-11-15 | "Giá tối thiểu không được lớn hơn giá tối đa" |

Each value is trimmed of leading and trailing spaces before the checks, in the UI and on the server. `0` is a valid
bound, so the valid bounds are the plain numbers from 0 to 99999999.99 with at most 2 decimal places. Leading zeros
and a trailing zero decimal are valid ("010", "10.5", "10.50"): valid values are compared as numbers, so "010" gives
the same result as "10" and "10.50" the same as "10.5"; the URL keeps the trimmed string as typed, not normalised.

**Server.** `GET /products` answers an invalid price parameter with HTTP 400 in the existing `ValidationPipe` shape —
follows NFR-012: input of the wrong type or out of range gets 400 (specs/_system/nfr.md):

```json
{
  "statusCode": 400,
  "message": ["<message of the failed check>"],
  "error": "Bad Request",
  "errors": { "minPrice": "<message of the minimum's failed check>", "maxPrice": "<message of the maximum's failed check>" }
}
```

`message` stays the existing `ValidationPipe` array (one element per failed bound). For a rejected price parameter the
body also carries `errors`, with one key per bound that failed (`minPrice` and / or `maxPrice`, each holding its one
message verbatim); the minimum > maximum message is under `minPrice`. A bound that passed has no key.

An empty parameter (`minPrice=`) means no bound on that side, as an empty input does (follows BR-PROD-02,
rules.md). A repeated parameter (`minPrice=10&minPrice=20`) is not a single plain number, so it fails check 2:
HTTP 400 with "Giá phải là số".

**UI.** The same checks run in the UI when the visitor presses "Search" or Enter, before any request: on a failed
check no request is sent and the URL does not change; the message appears under the input that failed (the
minimum > maximum message under "Giá tối thiểu ($)" — layout default); the typed values and the current list are
kept. A message disappears as soon as the visitor edits the input it belongs to; the minimum > maximum message and a
server message disappear when either price input is edited; every message also
disappears when the applied URL changes (new search, sort, page, "Xoá bộ lọc"). The checks run again only on the next
"Search" / Enter. While an input shows a message it is marked invalid (`aria-invalid="true"`) and the message is linked to it
by `aria-describedby`; an input without a message has neither (NFR-044). The server still runs every check on a
request sent straight to it. If the server answers HTTP 400 to a range
the UI let through, each message of `errors` is shown under the input of its bound (`minPrice` under
"Giá tối thiểu ($)", `maxPrice` under "Giá tối đa ($)"; both when both are present), the typed values and the last
successful list are kept, and the list-load error state is not shown; other errors (5xx, network) show the existing list-load
error state (PROD-002).

**Permissions:** Every visitor, no login needed (NFR-011); no role is denied.

**Scenarios:**

- `PROD-003-S1` (happy, P1)
  - **Given** products priced 5.00, 10.00, 10.50, 20.00 and 30.00 USD
  - **When** `GET /products?minPrice=10.50&maxPrice=20` is sent straight to the server
  - **Then** HTTP 200; `products` are exactly the 10.50 and 20.00 products (2 decimal places are accepted)
- `PROD-003-S2` (input, P1)
  - **Given** the server is running
  - **When** `GET /products?minPrice=-1` is sent straight to the server
  - **Then** HTTP 400 in the `ValidationPipe` shape; `message` contains "Giá không được âm"; no list is returned
  - → Recovery: the caller fixes the parameter and resends; the request is read-only, so resending creates no
    duplicate
- `PROD-003-S3` (input, P1)
  - **Given** the server is running
  - **When** `GET /products?maxPrice=10.123` is sent straight to the server
  - **Then** HTTP 400 in the `ValidationPipe` shape; `message` contains "Giá chỉ được có tối đa 2 chữ số thập phân";
    no list is returned
  - → Recovery: the caller fixes the parameter and resends; read-only, so no duplicate
- `PROD-003-S4` (input, P2)
  - **Given** the list shows the results for 10–20
  - **When** the visitor enters "-5" in "Giá tối thiểu ($)" and "10.123" in "Giá tối đa ($)" and presses "Search"
  - **Then** no request is sent and the URL does not change; "Giá không được âm" appears under "Giá tối thiểu ($)" and
    "Giá chỉ được có tối đa 2 chữ số thập phân" under "Giá tối đa ($)"; the inputs keep "-5" and "10.123"; the list
    still shows the 10–20 results
  - → Recovery: the visitor fixes the inputs (typed values kept) and presses "Search" again; read-only, so no
    duplicate
- `PROD-003-S5` (input, P2)
  - **Given** the product list page
  - **When** the visitor enters "abc", then "10,5", then "1e3" in "Giá tối thiểu ($)", pressing "Search" each time
  - **Then** each time no request is sent and "Giá phải là số" appears under "Giá tối thiểu ($)"
  - → Recovery: the visitor types a plain number such as "10.5"; the typed value is kept until then
- `PROD-003-S6` (input, P1)
  - **Given** the server is running
  - **When** `GET /products` is sent straight to the server with `minPrice` "abc", "10,5", "1e3", "+5", ".5" and "5."
    in turn
  - **Then** each request gets HTTP 400 in the `ValidationPipe` shape with `message` containing "Giá phải là số"; no
    list is returned
  - → Recovery: the caller fixes the parameter and resends; read-only, so no duplicate
- `PROD-003-S7` (input, P1)
  - **Given** the server is running
  - **When** `GET /products?minPrice=' OR 1=1 --` (URL-encoded) is sent straight to the server
  - **Then** HTTP 400 with `message` containing "Giá phải là số"; no list is returned; the value is never used in a
    database query
  - → Recovery: the caller sends a plain number; read-only, so no duplicate
- `PROD-003-S8` (boundary, P2)
  - **Given** the fixture of PROD-001 (products priced 5.00, 10.00, 20.00 and 30.00 USD)
  - **When** the visitor enters "0" in "Giá tối thiểu ($)" and "99999999.99" in "Giá tối đa ($)" and presses "Search"
  - **Then** no error message; the range is accepted; the list shows all 4 products; the URL has
    `minPrice=0&maxPrice=99999999.99`
- `PROD-003-S9` (boundary, P2)
  - **Given** the product list page and the server running
  - **When** the visitor enters "100000000" in "Giá tối đa ($)" and presses "Search"; and
    `GET /products?maxPrice=100000000` is sent straight to the server
  - **Then** in the UI no request is sent and "Giá không được lớn hơn $99,999,999.99" appears under "Giá tối đa ($)";
    the server answers HTTP 400 with `message` containing "Giá không được lớn hơn $99,999,999.99"
  - → Recovery: the visitor enters at most "99999999.99" (typed value kept until then); read-only, so no duplicate
- `PROD-003-S10` (boundary, P2)
  - **Given** the product list page
  - **When** the visitor enters "-0.01" in "Giá tối thiểu ($)" and presses "Search", then replaces it with "0"
  - **Then** "-0.01" gives "Giá không được âm" and no request; "0" is accepted with no message
  - → Recovery: as stated in the When step: the visitor enters 0 or more; the typed value is kept until then
- `PROD-003-S11` (missing, P3)
  - **Given** products priced 5.00, 10.00, 20.00 and 30.00 USD
  - **When** `GET /products?minPrice=&maxPrice=10` is sent straight to the server
  - **Then** HTTP 200; `products` are exactly the 5.00 and 10.00 products (an empty parameter means no lower bound)
- `PROD-003-S12` (missing, P3)
  - **Given** the server is running
  - **When** `GET /products?minPrice=10&minPrice=20` is sent straight to the server
  - **Then** HTTP 400 with `message` containing "Giá phải là số"; no list is returned
  - → Recovery: the caller sends the parameter once; read-only, so no duplicate
- `PROD-003-S13` (dependency, P2)
  - **Given** the list shows the results for 10–20 and the server rejects a minimum the UI checks let through (HTTP 400
    with `errors.minPrice`)
  - **When** the visitor applies that value and presses "Search"
  - **Then** the message of `errors.minPrice` appears under "Giá tối thiểu ($)"; the list-load error state is not
    shown; the list keeps the 10–20 results; the inputs keep the typed values
  - → Recovery: the visitor changes the value and presses "Search" again; read-only, so no duplicate
- `PROD-003-S14` (resource, P3)
  - **Given** the product list page and the server running
  - **When** a 30-digit value ("123456789012345678901234567890") is entered in "Giá tối đa ($)" and "Search" is
    pressed, and the same value is sent straight to the server as `maxPrice`
  - **Then** the UI shows "Giá không được lớn hơn $99,999,999.99" and sends no request; the server answers HTTP 400
    with that message; nothing crashes
  - → Recovery: the visitor enters at most "99999999.99"; read-only, so no duplicate
- `PROD-003-S15` (domain, P2)
  - **Given** the list shows the results for 10–20
  - **When** the visitor enters "30" in "Giá tối thiểu ($)" and "10" in "Giá tối đa ($)" and presses "Search"
  - **Then** no request is sent and the URL does not change; "Giá tối thiểu không được lớn hơn giá tối đa" appears
    under "Giá tối thiểu ($)"; the list still shows the 10–20 results; no empty-result state is shown
  - → Recovery: the visitor edits either input; the typed values are kept; read-only, so no duplicate
- `PROD-003-S16` (domain, P1)
  - **Given** the server is running
  - **When** `GET /products?minPrice=30&maxPrice=10` is sent straight to the server
  - **Then** HTTP 400 with `message` containing "Giá tối thiểu không được lớn hơn giá tối đa"; no list (and no empty
    list) is returned
  - → Recovery: the caller fixes the parameters (min ≤ max) and resends; read-only, so no duplicate
- `PROD-003-S17` (input, P3)
  - **Given** the product list page
  - **When** the visitor enters "30,5" in "Giá tối thiểu ($)" and "10" in "Giá tối đa ($)" and presses "Search"
  - **Then** no request is sent; only "Giá phải là số" appears, under "Giá tối thiểu ($)"; "Giá tối thiểu không được
    lớn hơn giá tối đa" is not shown (check 5 runs only when both bounds pass checks 1–4)
  - → Recovery: the visitor fixes the minimum; the typed values are kept
- `PROD-003-S18` (input, P3)
  - **Given** products priced 5.00, 10.00, 20.00 and 30.00 USD
  - **When** the visitor enters "010" in "Giá tối thiểu ($)" and "20.00" in "Giá tối đa ($)" and presses "Search"
  - **Then** no error message; the list shows exactly the 10.00 and 20.00 products, as for 10–20; the URL keeps
    `minPrice=010&maxPrice=20.00`
- `PROD-003-S19` (boundary, P3)
  - **Given** the product list page and the server running
  - **When** the visitor enters "-0" in "Giá tối thiểu ($)" and presses "Search"; and `GET /products?minPrice=-0` is
    sent straight to the server
  - **Then** the UI sends no request and shows "Giá không được âm" under "Giá tối thiểu ($)"; the server answers
    HTTP 400 with `message` containing "Giá không được âm"
  - → Recovery: the visitor enters "0"; the typed value is kept until then; read-only, so no duplicate
- `PROD-003-S20` (input, P2)
  - **Given** the server is running
  - **When** `GET /products?minPrice=-1&maxPrice=abc` is sent straight to the server
  - **Then** HTTP 400; `message` contains "Giá không được âm" and "Giá phải là số"; `errors` is
    `{ "minPrice": "Giá không được âm", "maxPrice": "Giá phải là số" }`; no list is returned
  - → Recovery: the caller fixes both parameters and resends; read-only, so no duplicate
- `PROD-003-S21` (dependency, P2)
  - **Given** the list shows the results for 10–20 and the server rejects a maximum the UI checks let through (HTTP
    400 with `errors.maxPrice`)
  - **When** the visitor applies that value and presses "Search"
  - **Then** the message of `errors.maxPrice` appears under "Giá tối đa ($)" and nothing under "Giá tối thiểu ($)";
    the list keeps the 10–20 results; no list-load error state
  - → Recovery: the visitor changes the maximum and presses "Search" again; read-only, so no duplicate
- `PROD-003-S22` (input, P2)
  - **Given** "Giá không được âm" is shown under "Giá tối thiểu ($)" and "Giá phải là số" under "Giá tối đa ($)"
    after a failed "Search"
  - **When** the visitor types one character in "Giá tối thiểu ($)"
  - **Then** the message under "Giá tối thiểu ($)" disappears and the one under "Giá tối đa ($)" stays; no request is
    sent; pressing "Search" runs the checks again
  - → Recovery: the visitor finishes correcting both inputs and presses "Search"; typed values are kept
- `PROD-003-S23` (input, P2)
  - **Given** the product list page
  - **When** the visitor enters "abc" in "Giá tối thiểu ($)" and presses "Search", then edits that input
  - **Then** after "Search" the input has `aria-invalid="true"` and `aria-describedby` pointing at the element with
    "Giá phải là số"; after the edit the message is gone and the input has neither attribute; each input is reachable
    through its label "Giá tối thiểu ($)" / "Giá tối đa ($)" (NFR-044)
  - → Recovery: the visitor types a plain number; the typed value is kept until then

## Non-Functional Requirements

| ID | Change | Category | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-001 | MODIFIED | Performance | `GET /products` results are cached in Redis per set of query parameters (`q`, `limit`, `skip`, `sortBy`, `order`, `minPrice`, `maxPrice`); creating / editing / deleting a product invalidates every cached list | lives at most 30 seconds | backend/src/products/products.service.ts; change 001-product-price-filter | PROD-001-S14, PROD-001-S10 |
| NFR-003 | Applies | Performance | Maximum number of products in one `GET /products` call | `limit` 1–100; the UI uses 10 | backend/src/products/dto/query-product.dto.ts; frontend/src/views/ProductList.tsx | PROD-002-S2 |
| NFR-004 | MODIFIED | Performance | Response time of the product list (also when filtered by price) | < 1 second on the current seed data (backend/src/seed.ts) | user decision, clarify 2026-11-15 (change 001-product-price-filter) | SC-001 |
| NFR-011 | MODIFIED | Security and permissions | The app has no login; no endpoint checks identity or permission. This is deliberate (practice app) and a known exception to constitution Principle II: with no identity there is no permission to check in the backend | — | docs/requirements/price-range.md#Requirement; backend/src/products/products.controller.ts; user decision, clarify 2026-11-15 | PROD-001-S4 |
| NFR-012 | Applies | Security and permissions | Input is validated by `ValidationPipe` (`whitelist: true`, `transform: true`): wrong type / out of range → 400; undeclared fields or parameters are dropped silently | — | backend/src/main.ts | PROD-003-S2, PROD-003-S3 |
| NFR-031 | Applies | Availability and operations | Redis does not persist to disk; when Redis fails or is down the cache fails open and every read goes to Postgres | — | docker-compose.prod.yml; backend/src/redis/cache.service.ts | PROD-001-S12 |
| NFR-040 | MODIFIED | User environment | UI language: new UI text (labels, messages) is Vietnamese; existing English labels stay as they are. Narrow screens (≤ 400 px, `max-xs`) have their own layout | — | frontend/src/styles/index.css; frontend/src/comopnents/; user decision, clarify 2026-11-15 | Review |
| NFR-041 | Applies | User environment | Currency: USD (the UI shows `$`); other currencies are out of scope | — | docs/requirements/price-range.md#Out of scope; frontend/src/comopnents/ProductListPageCom/ProductCard.tsx | Review |
| NFR-042 | MODIFIED | User environment | Supported browsers: current Chrome, Safari and Firefox on desktop | — | user decision, clarify 2026-11-15 | SC-004 manual check |
| NFR-044 | ADDED | User environment | Each price input has a visible label tied to it; an input whose check failed is marked `aria-invalid="true"` and its message is linked to it by `aria-describedby` | — | change 001-product-price-filter (clarify 2026-11-15) | PROD-003-S23 |

## Edge Cases & Error Handling

| Situation | Decision | Scenario |
| --- | --- | --- |
| A product priced exactly at the minimum or the maximum | Shown: both ends included (BR-PROD-01), exact to 2 decimals | PROD-001-S7 |
| Both price inputs empty | No price filter (BR-PROD-02) | PROD-001-S5 |
| A bound with exactly 2 decimal places | Accepted (BR-PROD-04) | PROD-003-S1 |
| A negative bound sent to the server | HTTP 400, no list (BR-PROD-03, NFR-012) | PROD-003-S2 |
| A bound with more than 2 decimal places sent to the server | HTTP 400, no list (BR-PROD-04, NFR-012) | PROD-003-S3 |
| An invalid bound typed in the UI (negative, more than 2 decimals) | No request sent; message under the faulty input; typed values and current list kept | PROD-003-S4 |
| A bound of exactly 0 or exactly 99999999.99 | Valid | PROD-003-S8, PROD-003-S10 |
| A bound above 99999999.99 | Rejected (check 4), in the UI and on the server | PROD-003-S9 |
| Not a plain number ("abc", "10,5", "1e3", "+5", ".5", "5.") | Rejected (check 2), in the UI and on the server | PROD-003-S5, PROD-003-S6 |
| Several checks fail at once (e.g. min "30,5", max "10") | Only the first failing check's message per input; min > max only when both inputs pass checks 1–4 | PROD-003-S17 |
| Spaces around a value (" 10 ") | Trimmed before the checks, then valid | PROD-001-S6 |
| Minimum greater than the maximum (e.g. 30–10) | Rejected: blocked in the UI with a message; HTTP 400 from the server; never an empty list | PROD-003-S15, PROD-003-S16 |
| Empty price parameter on a direct request (`minPrice=`) | No bound on that side | PROD-003-S11 |
| Repeated price parameter on a direct request (`minPrice=10&minPrice=20`) | HTTP 400 "Giá phải là số" | PROD-003-S12 |
| The server answers 400 to a minimum the UI let through | `errors.minPrice` under "Giá tối thiểu ($)"; typed values and last list kept; no list-load error state | PROD-003-S13 |
| The list request fails with 5xx or a network error while filtering | Existing list-load error state "Không tải dược danh sách sản phẩm" with "Thử lại"; the retry uses the same range | PROD-002-S14 |
| No product in the range (with or without keyword) | Common empty state: "Không tìm thấy sản phẩm nào" / "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." | PROD-002-S8, PROD-002-S9 |
| "Xoá bộ lọc" is pressed in the empty state | Clears keyword and range, keeps the sort | PROD-002-S10 |
| The range changes while the visitor is on a later page | Back to page 1 (existing rule of search, PROD-002) | PROD-002-S15 |
| The list of another range is still in the Redis cache | Not returned: the cache key includes the range (NFR-001) | PROD-001-S14 |
| Redis is down while filtering | The cache fails open; the filtered list is read from Postgres, same result (NFR-031) | PROD-001-S12 |
| Minimum equal to the maximum | Valid; products at exactly that price | PROD-001-S8 |
| A product priced 0.00 with a maximum of 0 | Shown | PROD-001-S9 |
| A product's price is edited while a filtered list is cached | The next filtered list reflects the new price (edit invalidates every cached list, NFR-001) | PROD-001-S10 |
| A new range is applied before the previous results arrive | The list shows the results of the range in the URL, never the older one | PROD-001-S11 |
| A discounted product (card shows a struck-through pre-discount price) | Filtered by its stored selling price, never the pre-discount price | PROD-001-S13 |
| Opening a URL with an invalid price value or min > max | Invalid side ignored (empty input, no message); valid min > max: both ignored; as an invalid `sortBy` today | PROD-002-S4 |
| Exactly one page of results; one result over a page | 1 page, then 2 pages; the "Hiển thị" line counts the filtered total | PROD-002-S5 |
| A page number beyond the last page of the filtered results | Empty state, pagination hidden | PROD-002-S6 |
| A range without a keyword | Path stays `/` | PROD-002-S7 |
| Several products with the same price in the range | Ties ordered by ascending id, stable | PROD-002-S11 |
| Range typed but not applied, then sort or page change | Applied range kept; typed values discarded | PROD-002-S12 |
| Back after several filters | Each applied range is one history entry | PROD-002-S13 |
| A value that looks like SQL (`' OR 1=1 --`) | Treated as text: "Giá phải là số", never used in a query | PROD-003-S7 |
| A very long digit string | Rejected by check 4, no crash | PROD-003-S14 |
| A direct request with both bounds invalid | HTTP 400; `message` has both messages; `errors` has `minPrice` and `maxPrice` | PROD-003-S20 |
| The server rejects a maximum the UI let through | `errors.maxPrice` shown under "Giá tối đa ($)" | PROD-003-S21 |
| "-0" as a bound | Rejected by check 1, "Giá không được âm" | PROD-003-S19 |
| "010", "10.5", "10.50" as bounds | Valid; same results as "10" / "10.5"; the URL keeps the string as typed | PROD-003-S18 |
| A new range is loading | Previous results stay visible until the new ones arrive; skeleton only on the first load | PROD-002-S16 |
| The visitor edits an input that shows a message | That message disappears (min > max and server messages: on editing either input); no check runs until the next "Search" | PROD-003-S22 |
| A check fails: the input and its message for assistive technology | Input `aria-invalid="true"`, message linked by `aria-describedby`; removed when the message goes (NFR-044) | PROD-003-S23 |

**Fallback mode.** When Redis is down, the list cache fails open (NFR-031): every list request, filtered or not, reads
Postgres directly and the result is unchanged; nothing is shown to the visitor (PROD-001-S12). When the list request
itself fails (5xx, network), the existing list-load error state is shown and "Thử lại" retries with the same range
(PROD-002-S14).

## Architecture Decisions

### 001-ADR-1: Validating price parameters on the server

**Status:** Accepted.

**Context.** The server must accept exactly the bounds PROD-003 allows and answer the rest with the spec's messages,
first failing check only, because the UI shows the server's message (PROD-003-S13). Prices are `numeric(10,2)`;
converting the query string to a JS number accepts "1e3" / "+5" and loses exactness (against PROD-003-S6 and
PROD-001-S7). Today `QueryProductDto` (backend/src/products/dto/query-product.dto.ts) validates the other parameters
through the global `ValidationPipe` (`whitelist: true`, `transform: true`, backend/src/main.ts, NFR-012), so an
undeclared parameter would be dropped silently.

**Options:**

| Option | How | Rejects "1e3", "+5" | Exact decimals | One message per bound, in the spec's order | Same 400 path as the other parameters |
| --- | --- | --- | --- | --- | --- |
| String + one custom validator per bound in the DTO | `minPrice` / `maxPrice` stay strings (trimmed; `''` → absent); a custom `class-validator` constraint runs checks 1–4 in order and reports only the first failure; a second constraint runs check 5 only when both bounds are set and pass checks 1–4; a repeated key arrives as an array and fails check 2 | Yes | Yes (Postgres compares the string as `numeric`) | Yes | Yes |
| `@Type(() => Number)` + `@IsNumber({ maxDecimalPlaces: 2 })`, `@Min`, `@Max` | Convert to a number, then built-in validators | No | No (float) | No (several built-in messages, their order not fixed) | Yes |
| Validate in `ProductsService` | Custom checks before the query, throw `BadRequestException` | Yes | Yes | Yes | No (a second, hand-built 400 shape) |

**Decision.** String + one custom validator per bound in `QueryProductDto`. The `errors` object of PROD-003
(`minPrice` / `maxPrice` → its one message) is added to the 400 body by an `exceptionFactory` on the **global**
`ValidationPipe` in backend/src/main.ts (options unchanged: `whitelist: true`, `transform: true`). A pipe bound to
the route would never run its factory: NestJS runs global pipes before route and parameter pipes, so the global pipe
already rejects the query. The factory keeps `statusCode`, `message` (same array) and `error: "Bad Request"` for every
endpoint and adds `errors` only when a failed property is `minPrice` or `maxPrice`, so no other endpoint's 400 body
changes.
The service passes the validated strings
to TypeORM (`Between` / `MoreThanOrEqual` / `LessThanOrEqual` on `price`), combined with the existing keyword
condition (both `title` and `description` branches get the price condition).

**Rationale.** The only option that rejects exactly what PROD-003 rejects, keeps decimals exact and reuses the
existing 400 shape of NFR-012.

**Trade-offs.** The checks and their order exist twice, in the backend validator and in the frontend
(001-ADR-3), and can drift; PROD-003-S13 defines what the visitor sees when they do, and the shared table of
PROD-003 is the single source both tests use.

### 001-ADR-2: Caching filtered lists

**Status:** Accepted.

**Context.** `GET /products` results are cached in Redis under
`products:list:v<version>:{q,limit,skip,sortBy,order}` and invalidated on create / edit / delete by bumping the
version (backend/src/products/products.service.ts, NFR-001); the client caches lists in TanStack Query under
`productKeys.list(params)` (frontend/src/api/queryKeys.ts). A key without the range returns another range's
results (PROD-001-S14).

**Options:**

| Option | How | Keeps the cache benefit | Correct per range | Invalidation on edit / delete |
| --- | --- | --- | --- | --- |
| Add the range to both keys | Redis key object gains `minPrice`, `maxPrice`; `ProductQuery` gains both fields, so `productKeys.list` follows | Yes | Yes | Unchanged version mechanism (PROD-001-S10) |
| Bypass the cache when a range is set | Skip Redis for filtered requests | No | Yes | Not needed |

**Decision.** Add `minPrice` and `maxPrice` (the validated strings) to the Redis key object and to `ProductQuery`;
`getProducts` sends them only when set.

**Rationale.** Keeps caching for repeated ranges, and the existing version bump still invalidates every list key,
filtered or not, on create / edit / delete.

**Trade-offs.** More distinct keys; "10.5" and "10.50" are cached separately (same result). Redis down still fails
open (NFR-031, PROD-001-S12).

### 001-ADR-3: Price inputs and the shared check function

**Status:** Accepted.

**Context.** PROD-003 needs the raw typed string to pick the right message, identically in every browser of NFR-042,
and the same checks must also decide which URL values to ignore (PROD-002 URL state, PROD-002-S4).

**Options:**

| Option | How | Raw string available | Same in all browsers | Reusable for URL values |
| --- | --- | --- | --- | --- |
| `type="text"` + `inputMode="decimal"`, one pure check function | `checkPriceRange(min, max)` in `frontend/src/utils/priceRange.ts` returns per-input errors (checks 1–5, first failure) or the trimmed valid strings | Yes | Yes | Yes |
| `type="number"` + `step="0.01"` | The browser parses the value | No (empty value for invalid text) | No ("10,5", "1e3" differ per browser) | No |
| A form library | Library-managed inputs and rules | Yes | Yes | Partly; a new dependency for two inputs |

**Decision.** Two `type="text"` inputs with `inputMode="decimal"`, labels "Giá tối thiểu ($)" and "Giá tối đa ($)",
in `SearchForm`; `checkPriceRange` runs on submit (show messages, send nothing on failure) and on URL read (drop the
invalid side; drop both when both are valid but min > max).

**Rationale.** Gives the exact typed string, behaves the same in every browser, and one pure function serves both
the submit checks and the URL reading, which also makes them unit-testable without a browser.

**Trade-offs.** No native number spinner; the mobile keyboard depends on `inputMode`.

### 001-ADR-4: Range state in the URL and the server-400 display

**Status:** Accepted.

**Context.** The list keeps its state in the URL (`ProductList.updateParams` rebuilds the query string from the fixed
key list `q`, `page`, `sortBy`, `order`, so any other key is dropped; frontend/src/views/ProductList.tsx). PROD-002
needs `minPrice` / `maxPrice` kept by sort and page changes and dropped by "Xoá bộ lọc"; PROD-003 needs each message of a server 400 shown under the input of its bound (`errors`, 001-ADR-1) with the last
successful list kept, while `useProducts` only exposes `status: 'error'`
(frontend/src/hooks/useProducts.ts).

**Options:**

| Option | How | Shareable / Back works (PROD-002-S13) | Server 400 keeps the last list (PROD-003-S13) |
| --- | --- | --- | --- |
| URL is the single source; 400 handled in `ProductList` | `updateParams` key list becomes `q`, `minPrice`, `maxPrice`, `page`, `sortBy`, `order`; the applied range is read from the URL through `checkPriceRange`; when the list query fails with `ApiError.status === 400`, `ProductList` shows each message of the body's `errors` under the input of its bound (`ApiError` gains the parsed `errors`) and renders the last successful list instead of the error state | Yes | Yes |
| Range in component state only | `useState` in `SearchForm`, not in the URL | No | Yes |

**Decision.** URL is the single source of the applied range; `ProductList` keeps the last successful list response
and shows a 400's `errors` as field errors under their inputs; other errors keep today's error state (PROD-002-S14).
While a new range loads, the previous results stay visible through the existing `keepPreviousData` of `useProducts`
(PROD-002-S16).

**Rationale.** Matches the existing URL-state pattern and gives Back / reload / shared links for free; only a 400 is
a field error, so a network failure is still reported as today.

**Trade-offs.** `ProductList` grows a small "last successful result" state; the list query key changes on every
applied range, so the previous key's data is what gets kept.

### 001-ADR-5: Test levels: Vitest for every scenario, component tests for the UI

**Status:** Accepted (revised after the first agent run, PR #42 closed).

**Context.** Tests are Vitest in both packages (backend with `unplugin-swc`); backend tests fake the repository and
Redis (backend/test/public/products.fakes.ts). The agent pipeline (k8s/agents/run.sh) approves a change only when
every assigned scenario has a `describe` / `it` / `test` in `test/public` whose name starts with its ID, so a scenario
tested only in the hand-run e2e script can never pass (PROD-002-S13 and PROD-002-S16 blocked the first run). The
frontend now has jsdom and Testing Library (`@testing-library/react`, `@testing-library/user-event`) as
devDependencies; a component test starts with `// @vitest-environment jsdom` (root `CLAUDE.md`, Quy ước test).

**Options:**

| Option | How | Every scenario passes the pipeline gate | Rendering (labels, messages, `aria-*`) in CI | Real-Postgres exactness |
| --- | --- | --- | --- | --- |
| Vitest everywhere: pure functions, fakes and component tests; e2e only as an extra check | Backend: DTO through a real `ValidationPipe`, service against the in-memory fake repository; frontend: pure modules plus component tests of `SearchForm` and `ProductList` with `fetch` and `next/navigation` faked; `frontend/test/e2e/` keeps SC-001, SC-002 and a real-database check of PROD-001-S7 / S13 | Yes | Yes | Yes, by hand-run e2e |
| Pure functions in Vitest, rendering only in e2e (previous decision) | As above without component tests | No | No | Yes |

**Decision.** Every scenario has at least one Vitest test in `test/public` (backend or frontend); UI scenarios are
component tests (`*.test.tsx`) that render `SearchForm` / `ProductList` with only the network (`fetch`) and the
router (`next/navigation`, a fake that keeps a history so Back can be exercised) faked. The e2e script is an extra
check on real Postgres, not the only test of any scenario.

**Rationale.** All 53 scenarios run in CI and pass the pipeline's scenario gate; nothing of the app is mocked except
the network and the router.

**Trade-offs.** jsdom is not a real browser (no layout); layout at ≤ 400 px (NFR-040) and SC-004 stay manual checks.

## Data Model

No data change: no table, column or index is added (no index is needed at the seed data size, NFR-004); the filter
reads the existing `products.price` column (`numeric(10,2)`, USD). Nothing is deleted, so the deletion policy of
specs/_system/nfr.md is not involved.

## Clarifications

### Session 2026-11-15

- Q: When the minimum price is greater than the maximum price, what happens? → A: Rejected: the UI blocks it with a
  message and the server answers HTTP 400.
- Q: When a visitor types an invalid price and presses Search, what does the page do? → A: Blocked in the UI first: no
  request is sent, a message appears under the faulty input, the typed values and the current list are kept; the
  server still rejects a direct request.
- Q: Which values count as a valid price bound? → A: A plain number (digits, optionally a dot and digits, at most 2
  decimals) from 0 to 99999999.99; spaces around it are trimmed; "10,5", "1e3", "+5", ".5", "5." are not numbers.
- Q: Which messages do the price checks show, and in which order are they run? → A: Vietnamese, same text in the UI
  and the server: negative "Giá không được âm"; not a number "Giá phải là số"; more than 2 decimals "Giá chỉ được có
  tối đa 2 chữ số thập phân"; over the limit "Giá không được lớn hơn $99,999,999.99"; min > max "Giá tối thiểu không
  được lớn hơn giá tối đa"; checked in that order, first failure wins, min > max only when both bounds pass the others.
- Q: When no product matches, what does the empty result say and what does its button clear? → A: One text for every
  filter: title "Không tìm thấy sản phẩm nào", description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng
  giá hoặc xoá bộ lọc."; the button clears keyword and range and keeps the sort.
- Q: What visible labels do the two price inputs have? → A: "Giá tối thiểu ($)" and "Giá tối đa ($)", no placeholder.
- Q: What label does the empty-result button show, now that it clears keyword and range? → A: "Xoá bộ lọc".
- Q: What does the server do with an empty (`minPrice=`) or repeated (`minPrice=10&minPrice=20`) price parameter? →
  A: Empty means no bound on that side; repeated is rejected with HTTP 400 "Giá phải là số".
- Q: Do the earlier answers on response time, browsers, no-login and UI language, and on the price conflict, still
  hold? → A: Yes: < 1 second on the current seed data (NFR-004); current Chrome, Safari, Firefox on desktop (NFR-042);
  no login is a deliberate, known exception to constitution Principle II (NFR-011); new UI text is Vietnamese
  (NFR-040); the price conflict `≥ 0` / `> 0` is not fixed in this change.
- Q: If the server rejects (HTTP 400) a price the page's checks let through, what does the page show? → A: The
  server's message under "Giá tối thiểu ($)"; typed values and the last successful list kept; no general error state.
  (Where the message appears was refined below: under the input of the bound it concerns.)
- Q: What does the list page show when the URL holds an invalid price value, or a valid minimum greater than the
  maximum? → A: The invalid value is ignored (its input empty, no bound on that side, no message); with both valid but
  min > max, both are ignored; as an invalid `sortBy` in the URL is ignored today. A direct server request is still
  rejected.
- Q: What accessibility rules do the price inputs and their messages follow? → A: Each input has a label tied to it;
  an input whose check failed is marked `aria-invalid="true"` and its message is linked by `aria-describedby`
  (NFR-044).
- Q: When does a check message disappear? → A: When the visitor edits the input it belongs to (the min > max and
  server messages when either input is edited), and whenever the applied URL changes; checks run again only on the
  next "Search" / Enter.
- Q: Where does a server 400 message appear, and what if there are two? → A: Under the input of the bound it
  concerns; the min > max message under "Giá tối thiểu ($)"; with two messages, each under its own input. The 400
  body therefore names the bound: `errors.minPrice` / `errors.maxPrice`, next to the unchanged `message` array.
- Q: While the results of a newly applied range load, what does the list area show? → A: The previous results stay
  visible until the new ones arrive (as page and sort today); only the first load shows the loading skeleton.
- Q: Is "-0" valid, are "010" / "10.50" valid, and does the URL keep the value as typed? → A: "-0" is rejected
  ("Giá không được âm"); "010", "10.5", "10.50" are valid and compared as numbers; the URL keeps the trimmed string as
  typed.
- Q: How is SC-001 measured, given that backend tests fake the database? → A: By the e2e script on the real
  PostgreSQL with the seed data: one `GET /products` with a price range returns in < 1 second.

## Assumptions

- The feature `products/filtering` has no requirement yet; search, sort and pagination keep their current behavior,
  and this change states only the parts it relies on. If a later change specifies them differently first, PROD-002
  must be revised.
- The worked example `docs/examples/products-price-range-spec.md` describes the same feature; this spec takes none of
  its decisions by default. Rejection of min > max, UI-first validation, the valid number format and limit, the
  messages, the check order, the empty result, the labels, the direct-request parameters, the server-400 display and
  the NFR values were settled by the user (Clarifications, 2026-11-15). If a later review reverts one of them, the
  requirement details and NFR rows that quote it must change with it.

## Open Questions

## Traceability

| Requirement | Scenarios |
| --- | --- |
| PROD-001 | S1–S14; also PROD-002-S1, PROD-002-S8 (Covers) |
| PROD-002 | S1–S16; also PROD-001-S4 (Covers) |
| PROD-003 | S1–S23 |

| NFR | Verified by |
| --- | --- |
| NFR-001 | PROD-001-S14, PROD-001-S10 |
| NFR-003 | PROD-002-S2 |
| NFR-004 | SC-001 |
| NFR-011 | PROD-001-S4 |
| NFR-012 | PROD-003-S2, PROD-003-S3 |
| NFR-031 | PROD-001-S12 |
| NFR-040 | Review |
| NFR-041 | Review |
| NFR-042 | SC-004 manual check |
| NFR-044 | PROD-003-S23 |
