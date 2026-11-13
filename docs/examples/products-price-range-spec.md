---
kind: delta
change: "001-products-price-range"
capabilities: ["products"]
primary: "products"
status: approved
source: ["docs/requirements/price-range.md", "roadmap 001"]
---

# Change 001: Filter products by price range

> **Worked example of the rich spec template** (`.specify/templates/overrides/spec-template.md`). Abridged from the
> approved spec on branch `001-products-price-range`: every section is at full detail, but only representative
> scenarios are shown (the approved change has 48). Scenario IDs are those of the approved spec, so gaps in the
> numbering are scenarios left out here. Architecture Decisions and Data Model come from that change's `research.md`
> and `data-model.md`. User-facing text is quoted verbatim in the product's language (Vietnamese); everything else is
> English.

## Overview

### Context

The product list (`GET /products` API and the list page) can already be searched by keyword, sorted and paged, but
cannot be narrowed by price, so viewers looking for products within a budget page through the whole list. The app has
no login; filtering is a public read. The app is brownfield: existing search, sort and pagination have no requirements
yet, and two of their behaviors change (see Assumptions).

### Goals

- **Find by budget:** a viewer narrows the list to a price range in one step.
- **Works with what exists:** the range combines with keyword search, sorting and pagination.
- **Shareable state:** the applied range lives in the URL, so reload, Back or a shared link keeps it.
- **No silent wrong results:** invalid input is rejected with a specific message, never guessed.

## Success Criteria

- **SC-001:** The product list responds in < 1 s on the current seed data, also when filtered by price (NFR-004).
  Measured by a backend test that loads as many products as the seed data and times a filtered `GET /products`, and
  by a manual check on the real seed data.
- **SC-002:** On the seed data, for the sample ranges — only min; only max; both; min = max; 0–0; a range with no
  products; max = 99999999.99 — 0 products outside the range appear and 0 products inside it are missing, compared
  with a manual filter of the seed data.
- **SC-003:** 100% of invalid price ranges are blocked in the UI before sending, and 100% of invalid requests sent
  straight to the server are rejected.
- **SC-004:** The price filter works as specified in the current stable Chrome, Firefox and Safari on desktop
  (NFR-042).

## Scope

### In Scope

- `minPrice` and `maxPrice` query parameters on `GET /products`.
- Two price inputs in the existing search form on the product list page.
- The range kept in the URL and combined with keyword, sort and pagination.
- Validation in the UI and on the server, with the same messages and check order.
- Cache keys (Redis and TanStack Query) that include the range.

### Out of Scope

- Filtering by discount (docs/requirements/price-range.md).
- Saving filters between visits, in the browser or on the server (docs/requirements/price-range.md); keeping the range
  in the URL (PROD-002) does not count as saving.
- Currencies other than USD (docs/requirements/price-range.md; NFR-041).
- The price conflict `≥ 0` (server) / `> 0` (create form) — not fixed in this change (roadmap; see Open Questions).
- Adding login or permission checks (NFR-011).
- Full accessibility conformance beyond NFR-044.
- Optimising for narrow screens.

## Requirements

### products

#### ADDED PROD-001: Filter the product list by price range

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

#### ADDED PROD-002: Combine the price range with search, sort and pagination

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

#### ADDED PROD-003: Validate the price range

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

## Non-Functional Requirements

| ID | Change | Category | Requirement | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | MODIFIED | Performance | `GET /products` results are cached in Redis per set of query parameters (`q`, `limit`, `skip`, `sortBy`, `order`, `minPrice`, `maxPrice`), live at most 30 seconds, and every list cache is invalidated by create / edit / delete | PROD-001-S14 |
| NFR-004 | Applies | Performance | The product list responds in < 1 s on the current seed data, also when filtered by price | SC-001 |
| NFR-011 | Applies | Security and permissions | No login; no endpoint checks identity or permissions — known exception to constitution Principle II | PROD-001-S8 |
| NFR-031 | Applies | Availability and operations | Redis fails open: when it is down, every read goes straight to Postgres | PROD-001-S11 |
| NFR-041 | Applies | User environment | Currency is USD (UI shows `$`); other currencies are out of scope | Review |
| NFR-042 | Applies | User environment | Supported browsers: current Chrome, Safari, Firefox on desktop | SC-004 manual check |
| NFR-044 | ADDED | User environment | Each price input has a visible label, and its error message is linked to it by `aria-describedby` | Accessibility assertions in the tests of PROD-003-S2, S6, S7, S9, S16 |

## Edge Cases & Error Handling

| Situation | Decision | Scenario |
| --- | --- | --- |
| min = max | Valid; products at exactly that price | PROD-001-S6 |
| Prices one cent apart around a bound | Exact comparison to 2 decimals, no rounding | PROD-001-S7 |
| Spaces around a value | Trimmed before the checks | PROD-001-S5 |
| A previous range is still cached | The cache key includes the range | PROD-001-S14 |
| Server error while filtering | Existing list-load error state; the inputs keep the range for retry | PROD-001-S12 |
| No product in the range | Common empty state; clear-filter button | PROD-002-S4 |
| Clear filter | Clears keyword and range; keeps the sort | PROD-002-S5 |
| Range changed while on a later page | Back to page 1 | PROD-002-S10 |
| Typed but not applied, then sort / page change | Typed values discarded; inputs show the applied range | PROD-002-S11 |
| Invalid value in the URL | That side ignored; input empty; no message | PROD-002-S6 |
| URL min > max, both valid | Both ignored | PROD-002-S13 |
| Repeated price parameter | UI ignores that side; server answers 400 "Giá phải là số" | PROD-002-S14, PROD-003-S18 |
| Several errors at once | Format checks per input first; min > max only when both are valid | PROD-003-S16 |
| "010", "10.5", "10.50" | Valid, compared as numbers; URL string kept as typed | PROD-003-S17 |
| Empty parameter on a direct request | No bound on that side | PROD-003-S11 |
| Server rejects a value the UI let through | Server message under "Giá tối thiểu ($)"; previous list kept | PROD-003-S14 |
| Page beyond the last page after filtering | As search today: empty state, pagination hidden | PROD-002-S8 (not shown in this example) |

**Fallback mode.** When Redis is down the list cache fails open (NFR-031): every list request reads Postgres directly
and the filtered result is unchanged (PROD-001-S11). No message is shown to the viewer.

## Architecture Decisions

### 001-ADR-1: Validating price parameters on the server

**Status:** Accepted.

**Context.** The server must accept exactly the values PROD-003 allows and reject the rest with the UI's messages, in
the UI's order, because the UI shows the server's message (PROD-003-S14). Prices are `numeric(10,2)`; float parsing
accepts "1e3" and rounds (against PROD-003-S6 and PROD-001-S7).

**Options:**

| Option | How | Accepts "1e3" | Exact decimals | Spec messages, same order as UI |
| --- | --- | --- | --- | --- |
| String + pattern in the DTO | Keep the query string; check the plain-number pattern, ≤ 99999999.99 and min ≤ max with validators; pass the string to TypeORM so Postgres compares `numeric` | No | Yes | Yes, through the existing `ValidationPipe` 400 |
| `@Type(() => Number)` + `@IsNumber({ maxDecimalPlaces: 2 })` | Convert to a number, validate numerically | Yes | No (float) | Hard |
| Validate in the service | Custom checks in `ProductsService` | Depends on the code | Yes | Yes, but outside the 400 path the other parameters use |

**Decision.** String + pattern in the DTO; the service passes the strings to `Between` / `MoreThanOrEqual` /
`LessThanOrEqual`.

**Rationale.** The only option that matches PROD-003 exactly, keeps decimals exact and reuses the existing 400 path.

**Trade-offs.** The checks and their order exist twice (frontend and backend) and can drift; PROD-003-S14 defines what
the viewer sees when they do.

### 001-ADR-2: Caching filtered lists

**Status:** Accepted.

**Context.** Lists are cached in Redis (versioned key, invalidated on create / edit / delete; NFR-001) and in TanStack
Query on the client. A key without the range returns another range's results (PROD-001-S14).

**Options:**

| Option | How | Keeps the cache benefit | Correct per range |
| --- | --- | --- | --- |
| Add the range to both keys | `products:list:v<version>:{q,limit,skip,sortBy,order,minPrice,maxPrice}`; `ProductQuery` gains both fields | Yes | Yes |
| Bypass the cache when a range is set | Skip Redis for filtered requests | No | Yes |

**Decision.** Add `minPrice` and `maxPrice` to the Redis key and to `ProductQuery` (the client query key follows it).

**Rationale.** Keeps caching for repeated ranges; the existing version mechanism still invalidates every key on
create / edit / delete (PROD-001-S9, PROD-001-S13).

**Trade-offs.** More distinct keys; "10.5" and "10.50" are cached separately (same result).

### 001-ADR-3: Price input type

**Status:** Accepted.

**Context.** PROD-003 needs the raw typed string to show the right message, identically in every browser of SC-004.

**Options:**

| Option | How | Raw string available | Same in all browsers |
| --- | --- | --- | --- |
| `type="text"` + `inputMode="decimal"` | One pure function `parsePriceInput` checks submit and URL values | Yes | Yes |
| `type="number"` + `step="0.01"` | Browser parses the value | No (empty value for invalid text) | No ("10,5", "1e3" differ) |
| Form library | Library-managed inputs | Yes | Yes, but too much for two inputs |

**Decision.** `type="text"` with `inputMode="decimal"`, labels "Giá tối thiểu ($)" and "Giá tối đa ($)", validated by
`parsePriceInput` in `frontend/src/utils/priceRange.ts`.

**Trade-offs.** No native number spinner; the mobile keyboard depends on `inputMode`.

## Data Model

No data change: no table, column or index is added (no index needed at the seed data size). The filter reads the
existing `products.price` column (`numeric(10,2)`, USD).

## Clarifications

### Session 2026-11-12

- Q: Is the price range kept in the URL like keyword, sort and page? → A: Yes; reload, Back and shared links keep it.
  It is stored nowhere else, so it is not "saving filters between visits".
- Q: Which message for each invalid value? → A: Negative: "Giá không được âm"; more than 2 decimals: "Giá chỉ được có
  tối đa 2 chữ số thập phân"; not a number: "Giá phải là số"; over the limit: "Giá không được lớn hơn $99,999,999.99".
- Q: When is the range applied? → A: The two inputs are in the existing search form; Search or Enter applies keyword
  and range together, after validation.
- Q: Empty result, and what does clearing filters clear? → A: Title "Không tìm thấy sản phẩm nào"; description
  "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc."; clearing removes keyword and
  range and keeps the sort.
- Q: Decimal comma ("10,5") and spaces? → A: Only a decimal dot; spaces trimmed; "10,5" and "1,000" give
  "Giá phải là số".
- Q: Invalid price in the URL? → A: Ignored, input left empty, as an invalid `sortBy` is today; a direct server call is
  still rejected.
- Q: URL with both prices valid but min > max? → A: Both ignored; the min > max message appears only after the viewer
  types and presses Search.
- Q: Server rejects a value the UI let through? → A: Show the server's message under the price input; keep the list.
- Q: What is a plain number? → A: Digits, optionally a dot and 1–2 decimals; "+5", ".5", "5." give "Giá phải là số".
- Q: One input badly formatted and min > max as well? → A: Per-input format errors first; min > max only when both
  inputs are valid.
- Q: Are "010", "10.5", "10.50" valid and equal? → A: All valid, compared as numbers; the URL string is not normalised.
- Q: Repeated price parameter? → A: Invalid: the UI ignores it; the server answers "Giá phải là số".
- Q: Back after several filters? → A: As search today: every URL change on the list is one history entry
  (`router.push`, `frontend/src/views/ProductList.tsx:51`).

## Assumptions

- The price filtered on is the current selling price shown on the product card, in USD (glossary), not a pre-discount
  price. If false, results differ from what the viewer sees.
- Filtering runs on the server over all products, not on the page shown, so the total and page count are right.
- "The server rejects" means HTTP 400 (rules BR-PROD-05, BR-PROD-07).
- Brownfield: search, sort and pagination have no requirements yet; this change assumes they keep their current
  behavior.
- This change alters two existing behaviors (PROD-002): (1) the empty-state description becomes common to every
  filter, keyword-only included; (2) the clear-filter button also clears the price range. They cannot be `MODIFIED`
  requirements because the old behavior has no requirement in `specs/capabilities/products/spec.md` yet.
- Loading keeps the current behavior: the previous list stays visible while new results load.
- Layout: the two inputs use the existing responsive layout of the search bar.
- SC-004 names Chrome, Firefox and Safari (NFR-042); in the trial only the browsers available on the machine are
  checked by hand.

## Open Questions

1. **Price 0 in the create / edit form.** The server accepts a price `≥ 0` but the create form requires `> 0`.
   Provisional direction: the filter accepts 0 (BR-PROD-03); the form is left as is and settled in a later change
   (roadmap). Approved by: the user, 2026-11-12. Does not block this change.
2. **Typo in the existing list-load error title.** The app shows "Không tải dược danh sách sản phẩm" ("dược" instead of
   "được"; `frontend/src/views/ProductList.tsx:104`, `frontend/src/views/ProductDetail.tsx:26`). Should it be fixed?
   Provisional direction: this change quotes the text exactly as the code shows it, so PROD-001-S12 matches the
   current UI; a fix belongs to a later change. Approved by: the user, 2026-11-13. Does not block this change.

## Traceability

| Requirement | Scenarios (in this example) |
| --- | --- |
| PROD-001 | S1–S3, S5–S8, S11, S12, S14; also PROD-002-S1 (Covers) |
| PROD-002 | S1, S2, S4–S6, S10, S11, S13–S15 |
| PROD-003 | S1–S3, S6, S7, S9–S11, S14, S16–S18 |

| NFR | Verified by |
| --- | --- |
| NFR-001 | PROD-001-S14 |
| NFR-004 | SC-001: backend timing test and manual check on the seed data |
| NFR-011 | PROD-001-S8 |
| NFR-031 | PROD-001-S11 |
| NFR-041 | Review |
| NFR-042 | SC-004 manual check |
| NFR-044 | Accessibility assertions in the tests of PROD-003-S2, S6, S7, S9, S16 |
