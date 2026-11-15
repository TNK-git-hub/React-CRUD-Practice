---
kind: capability
domain: "products"
feature: "filtering"
code: "PROD"
---

# Feature: products/filtering (PROD)

## Overview

The product list page (`/`, `/products/search`) and `GET /products`: listing, keyword search, sort, pagination and
every filter that narrows the list. Used by every visitor (the app has no login).

Domain files: [states.md](../states.md) · [rules.md](../rules.md) · [history.md](../history.md)

## Requirements

### PROD-001: Filter the product list by price range

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
- **Source:** change 001-product-price-filter

### PROD-002: Combine the price range with search, sort and pagination

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
- **Source:** change 001-product-price-filter

### PROD-003: Validate the price bounds

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
- **Source:** change 001-product-price-filter

## Merged changes

<!-- Written by /spec-archive: one row per archived change that touched this feature. Do not edit by hand. -->

| Change | Date | Change in this feature |
| --- | --- | --- |
| 001-product-price-filter | 2026-11-15 | new PROD-001; new PROD-002; new PROD-003 |
