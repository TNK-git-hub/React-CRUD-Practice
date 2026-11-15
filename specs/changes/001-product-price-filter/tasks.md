---

description: "Tasks for change 001-product-price-filter (no test tasks; every task names its scenarios)"
---

# Tasks: Filter products by price range

**Input**: Design documents from `specs/changes/001-product-price-filter/`

**Prerequisites**: spec.md (approved: requirement details, `## Architecture Decisions` 001-ADR-1 – 001-ADR-5,
`## Data Model` — no data change), plan.md (Technical Context, Project Structure, Test Strategy, Quickstart).

**Tests**: NONE in this file. The TEST harness writes one test per scenario, named by scenario ID, from spec.md,
checklists/edge-cases.md and the Test Strategy of plan.md.

**Organization**: US1 = PROD-001 (filter by price range), US2 = PROD-002 (combine with search, sort, pagination),
US3 = PROD-003 (validate the price bounds).

## Format: `- [ ] [ID] [P?] [Story] Description — Scenarios: <ID>, <ID>`

- **[P]**: Can run in parallel (different files, no dependencies on unfinished tasks)
- **[Story]**: US1, US2, US3; none in Setup, Foundational, Polish
- **Scenarios**: scenario IDs from spec.md this task makes pass; `—` only for tasks that implement no scenario

## Path Conventions

- Web app: `backend/src/`, `frontend/src/` (plan.md, Project Structure)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: None needed — the existing stack, tooling and strict type checking are kept (plan.md, Technical
Context; NFR-033). No new dependency, no `package.json` change (001-ADR-5).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The price parameters and the shared check function every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T001 Add optional `minPrice` and `maxPrice` string properties to `QueryProductDto` in backend/src/products/dto/query-product.dto.ts: values stay strings (never `@Type(() => Number)`, 001-ADR-1), trimmed of leading and trailing spaces, an empty value (`minPrice=`) becomes absent ("An empty parameter (`minPrice=`) means no bound on that side"); declared so `whitelist: true` keeps them (NFR-012); Swagger description for both — Scenarios: PROD-001-S4, PROD-003-S11
- [ ] T002 [P] Create `checkPriceRange(min, max)` in frontend/src/utils/priceRange.ts (001-ADR-3): trims each input, runs the checks of PROD-003 in order and keeps only the first failure per input — 1 "Giá không được âm" (a minus sign followed by a number, `-0` included), 2 "Giá phải là số" (not digits optionally followed by a dot and digits: `abc`, `10,5`, `1,000`, `1e3`, `+5`, `.5`, `5.`), 3 "Giá chỉ được có tối đa 2 chữ số thập phân", 4 "Giá không được lớn hơn $99,999,999.99" (above 99999999.99), 5 "Giá tối thiểu không được lớn hơn giá tối đa" only when both inputs are set and pass 1–4 (reported for the minimum); returns per-input errors or the trimmed valid strings (kept as typed, e.g. "010", "20.00"); an empty input is valid and means no bound — Scenarios: PROD-001-S6, PROD-001-S8, PROD-003-S4, PROD-003-S5, PROD-003-S8, PROD-003-S9, PROD-003-S10, PROD-003-S14, PROD-003-S15, PROD-003-S17, PROD-003-S18, PROD-003-S19
- [ ] T003 [P] Add `minPrice?` and `maxPrice?` (strings) to `ProductQuery` in frontend/src/api/productsQuerParam.ts; `getProducts` sends each only when it is set and never sends an empty value (001-ADR-2) — Scenarios: PROD-001-S1, PROD-001-S5

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Filter the product list by price range (PROD-001, Priority: P1) 🎯 MVP

**Goal**: A visitor enters a minimum and / or a maximum price and sees only the products priced in that range,
both ends included.

**Independent Test**: PROD-001-S1 … S14 (backend: products.price-filter.test.ts; frontend: listUrl.test.ts,
priceRange.test.ts; e2e), plan.md Quickstart step 1.

### Implementation for User Story 1

- [ ] T004 [US1] In `ProductsService.loadList` (backend/src/products/products.service.ts) add the price condition from the validated strings — both set: `Between(minPrice, maxPrice)`, only min: `MoreThanOrEqual(minPrice)`, only max: `LessThanOrEqual(maxPrice)` on `price` — to both keyword branches (`title` and `description`) or alone when there is no keyword, so Postgres compares `numeric(10,2)` exactly (001-ADR-1); `total` counts the filtered products; keep the existing order (`sortBy` then `id` ascending) and `skip` / `take` — Scenarios: PROD-001-S1, PROD-001-S2, PROD-001-S3, PROD-001-S4, PROD-001-S5, PROD-001-S7, PROD-001-S8, PROD-001-S9, PROD-001-S13, PROD-002-S1, PROD-002-S2, PROD-002-S5, PROD-002-S11, PROD-003-S1, PROD-003-S11, PROD-003-S18
- [ ] T005 [US1] In `ProductsService.findAll` (backend/src/products/products.service.ts) add `minPrice` and `maxPrice` to the Redis list key object (`products:list:v<version>:{q,limit,skip,sortBy,order,minPrice,maxPrice}`, 001-ADR-2); keep the version bump on create / edit / delete and the fail-open behavior when Redis is down (NFR-031) — Scenarios: PROD-001-S10, PROD-001-S12, PROD-001-S14
- [ ] T006 [P] [US1] Create frontend/src/utils/listUrl.ts (001-ADR-4): `buildListUrl(current, changes)` writes the keys in the order `q`, `minPrice`, `maxPrice`, `page`, `sortBy`, `order`, drops empty values, never writes `page=1`, and picks the path `/products/search` when `q` is set and `/` otherwise; `readListParams(searchParams)` reads `q`, `page`, `sortBy`, `order` as today and the range through `checkPriceRange`: an invalid side is ignored (no bound, empty input, no message), both sides are ignored when both are valid but min > max, a repeated key is ignored — Scenarios: PROD-001-S1, PROD-001-S2, PROD-001-S3, PROD-001-S5, PROD-002-S3, PROD-002-S4, PROD-002-S7, PROD-002-S10, PROD-002-S12, PROD-002-S15
- [ ] T007 [US1] Pass the applied range into the query params of `useProducts` in frontend/src/hooks/useProducts.ts, so `productKeys.list(params)` differs per range (001-ADR-2), and keep `placeholderData: keepPreviousData` so the previous results stay visible while a new range loads — Scenarios: PROD-001-S11, PROD-001-S14, PROD-002-S16
- [ ] T008 [US1] Add two `type="text"` `inputMode="decimal"` inputs with visible labels "Giá tối thiểu ($)" and "Giá tối đa ($)", each label tied to its input, no placeholder, to `SearchForm` in frontend/src/comopnents/ProductListPageCom/SearchForm.tsx, next to the keyword input (layout default, own layout at ≤ 400 px per NFR-040); the inputs start from the applied range; submitting with "Search" or Enter calls `onSearch` with the trimmed keyword and the trimmed range (an empty input means no bound); typing alone reloads nothing — Scenarios: PROD-001-S1, PROD-001-S2, PROD-001-S3, PROD-001-S5, PROD-001-S6, PROD-002-S12
- [ ] T009 [US1] In frontend/src/views/ProductList.tsx read keyword, page, sort and range with `readListParams`, write every URL change with `buildListUrl` through `router.push` (one history entry each, scroll kept), pass the range to `useProducts` and `SearchForm`, and drop `page` when a search (keyword and / or range) or a sort is applied while keeping `minPrice` / `maxPrice` on sort and page changes — Scenarios: PROD-001-S1, PROD-001-S2, PROD-001-S3, PROD-001-S5, PROD-001-S11, PROD-002-S1, PROD-002-S3, PROD-002-S7, PROD-002-S12, PROD-002-S13, PROD-002-S15

**Checkpoint**: At this point, User Story 1 should be fully functional and verifiable independently

---

## Phase 4: User Story 2 - Combine the price range with search, sort and pagination (PROD-002, Priority: P1)

**Goal**: The range works with keyword, sort and pages; empty results and clearing filters behave the same for every
filter.

**Independent Test**: PROD-002-S1 … S16 (backend: products.price-filter.test.ts; frontend: listUrl.test.ts; e2e),
plan.md Quickstart steps 2 and 5.

### Implementation for User Story 2

- [ ] T010 [US2] In the empty state of frontend/src/views/ProductList.tsx show the title "Không tìm thấy sản phẩm nào" and the description "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." for every filter, keyword-only included (replacing today's keyword description); its button clears `q`, `minPrice`, `maxPrice` and `page` and keeps `sortBy` / `order`; pagination stays hidden, also for a page past the last one — Scenarios: PROD-002-S6, PROD-002-S8, PROD-002-S9, PROD-002-S10
- [ ] T011 [P] [US2] Change the empty-state button label from "Xoá từ khoá" to "Xoá bộ lọc" in frontend/src/comopnents/ProductListPageCom/StatusMessage.tsx (icon "magnifier") — Scenarios: PROD-002-S8, PROD-002-S9, PROD-002-S10

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Validate the price bounds (PROD-003, Priority: P1)

**Goal**: Every invalid bound is blocked in the UI before sending and rejected by the server with the same messages;
messages appear under the right input and are accessible.

**Independent Test**: PROD-003-S1 … S23 (backend: query-product.price.test.ts; frontend: priceRange.test.ts,
productsQuerParam.test.ts; e2e), plan.md Quickstart steps 3 and 4.

### Implementation for User Story 3

- [ ] T012 [US3] Create the custom `class-validator` constraints in backend/src/products/dto/price-bound.validator.ts (001-ADR-1): one per bound running checks 1–4 of PROD-003 in order with the verbatim messages "Giá không được âm", "Giá phải là số", "Giá chỉ được có tối đa 2 chữ số thập phân", "Giá không được lớn hơn $99,999,999.99" and reporting only the first failure (a repeated key arrives as an array and fails check 2; `-0` fails check 1); one for the pair running check 5 "Giá tối thiểu không được lớn hơn giá tối đa" only when both bounds are set and pass checks 1–4 — Scenarios: PROD-003-S2, PROD-003-S3, PROD-003-S6, PROD-003-S7, PROD-003-S9, PROD-003-S12, PROD-003-S14, PROD-003-S16, PROD-003-S19, PROD-003-S20
- [ ] T013 [US3] Apply the constraints of T012 to `minPrice` / `maxPrice` in backend/src/products/dto/query-product.dto.ts (depends on T001, T012), so an invalid request never reaches `ProductsService` and returns no list — Scenarios: PROD-003-S2, PROD-003-S3, PROD-003-S6, PROD-003-S7, PROD-003-S9, PROD-003-S12, PROD-003-S14, PROD-003-S16, PROD-003-S19, PROD-003-S20
- [ ] T014 [US3] Give the global `ValidationPipe` in backend/src/main.ts an `exceptionFactory` (options unchanged: `whitelist: true`, `transform: true`; a route-level pipe would never run because global pipes run first, 001-ADR-1): every 400 body keeps `statusCode`, `message` (array, one element per failed bound) and `error: "Bad Request"`, and adds `errors` with one key per failed bound (`minPrice` / `maxPrice` → its one message; the min > max message under `minPrice`) only when a failed property is `minPrice` / `maxPrice`; no other endpoint's 400 body changes — Scenarios: PROD-003-S13, PROD-003-S20, PROD-003-S21
- [ ] T015 [P] [US3] Make `ApiError` in frontend/src/api/client.ts carry the parsed `errors` object of a 400 body (absent otherwise), keeping `message`, `status` and `path` as today — Scenarios: PROD-003-S13, PROD-003-S21
- [ ] T016 [US3] In `SearchForm` (frontend/src/comopnents/ProductListPageCom/SearchForm.tsx) run `checkPriceRange` on "Search" / Enter: on any failure send nothing and keep the URL, the typed values and the current list; show each message under its input (min > max and server messages for the minimum under "Giá tối thiểu ($)", server messages for the maximum under "Giá tối đa ($)"); a message disappears when its input is edited (min > max and server messages: when either input is edited) and when the applied URL changes; an input with a message has `aria-invalid="true"` and `aria-describedby` pointing at the message element, an input without one has neither (NFR-044) — Scenarios: PROD-003-S4, PROD-003-S5, PROD-003-S8, PROD-003-S9, PROD-003-S10, PROD-003-S14, PROD-003-S15, PROD-003-S17, PROD-003-S18, PROD-003-S19, PROD-003-S22, PROD-003-S23
- [ ] T017 [US3] In frontend/src/views/ProductList.tsx keep the last successful list response; when the list query fails with `ApiError.status === 400` pass `error.errors` to `SearchForm` as field errors and render the last successful list instead of the error state; any other failure (5xx, network) shows the existing error state "Không tải dược danh sách sản phẩm" with "Thử lại", whose retry uses the range in the URL (001-ADR-4) — Scenarios: PROD-003-S13, PROD-003-S21, PROD-002-S14

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates before handing back to review (no test tasks)

- [ ] T018 Run `pnpm lint`, `pnpm --filter frontend typecheck`, `pnpm --filter backend typecheck:test`, `pnpm --filter frontend typecheck:test` and `pnpm test` from the repo root until all pass, and `pnpm ci:local` until it prints `CI PASSED` — Scenarios: —
- [ ] T019 Run the Quickstart of plan.md (local backend and frontend, `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3000`) and check its steps 1–5 — Scenarios: —

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: T001, T002, T003 — block every story
- **User Stories (Phase 3–5)**: depend on Phase 2; US1 first (it introduces the URL and query plumbing US2 and US3
  extend)
- **Polish (Phase 6)**: after all stories

### User Story Dependencies

- **US1 (PROD-001)**: after Phase 2
- **US2 (PROD-002)**: after US1 (T009: `ProductList` already reads and writes the range)
- **US3 (PROD-003)**: backend part (T012–T014) only after T001; frontend part (T016, T017) after US1 (T008, T009)

### Within Each User Story

- Backend: T004 → T005 (same file, sequential); T012 → T013 → T014
- Frontend: T006 → T009; T008 → T016; T009 → T010 → T017 (same file `ProductList.tsx`, sequential)

### Parallel Opportunities

- T002 and T003 (different frontend files) run in parallel with T001 (backend)
- The backend chain (T004, T005, T012, T013, T014) and the frontend chain (T006 – T011, T015 – T017) touch different
  files and can run in parallel
- T011 and T015 are single-file changes with no dependency on unfinished tasks

---

## Parallel Example: User Story 1

```bash
# Backend and frontend of US1 together:
Task: "T004 price condition in ProductsService.loadList (backend/src/products/products.service.ts)"
Task: "T006 buildListUrl / readListParams in frontend/src/utils/listUrl.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001 – T003)
2. Complete Phase 3: User Story 1 (T004 – T009)
3. **STOP and VALIDATE**: PROD-001 scenarios pass (TEST harness)

### Incremental Delivery

1. Foundational → US1 → PROD-001 scenarios pass (MVP)
2. Add US2 → PROD-002 scenarios pass
3. Add US3 → PROD-003 scenarios pass
4. Polish (T018, T019)

---

## Scenario Coverage

| Scenario | Priority | Tasks |
| --- | --- | --- |
| `PROD-001-S1` | P1 | T003, T004, T006, T008, T009 |
| `PROD-001-S2` | P1 | T004, T006, T008, T009 |
| `PROD-001-S3` | P1 | T004, T006, T008, T009 |
| `PROD-001-S4` | P1 | T001, T004 |
| `PROD-001-S5` | P1 | T003, T004, T006, T008, T009 |
| `PROD-001-S6` | P3 | T002, T008 |
| `PROD-001-S7` | P1 | T004 |
| `PROD-001-S8` | P2 | T002, T004 |
| `PROD-001-S9` | P3 | T004 |
| `PROD-001-S10` | P2 | T005 |
| `PROD-001-S11` | P2 | T007, T009 |
| `PROD-001-S12` | P2 | T005 |
| `PROD-001-S13` | P1 | T004 |
| `PROD-001-S14` | P1 | T005, T007 |
| `PROD-002-S1` | P1 | T004, T009 |
| `PROD-002-S2` | P1 | T004 |
| `PROD-002-S3` | P1 | T006, T009 |
| `PROD-002-S4` | P2 | T006 |
| `PROD-002-S5` | P2 | T004 |
| `PROD-002-S6` | P3 | T010 |
| `PROD-002-S7` | P3 | T006, T009 |
| `PROD-002-S8` | P2 | T010, T011 |
| `PROD-002-S9` | P2 | T010, T011 |
| `PROD-002-S10` | P2 | T006, T010, T011 |
| `PROD-002-S11` | P3 | T004 |
| `PROD-002-S12` | P2 | T006, T008, T009 |
| `PROD-002-S13` | P3 | T009 |
| `PROD-002-S14` | P2 | T017 |
| `PROD-002-S15` | P2 | T006, T009 |
| `PROD-002-S16` | P3 | T007 |
| `PROD-003-S1` | P1 | T004 |
| `PROD-003-S2` | P1 | T012, T013 |
| `PROD-003-S3` | P1 | T012, T013 |
| `PROD-003-S4` | P2 | T002, T016 |
| `PROD-003-S5` | P2 | T002, T016 |
| `PROD-003-S6` | P1 | T012, T013 |
| `PROD-003-S7` | P1 | T012, T013 |
| `PROD-003-S8` | P2 | T002, T016 |
| `PROD-003-S9` | P2 | T002, T012, T013, T016 |
| `PROD-003-S10` | P2 | T002, T016 |
| `PROD-003-S11` | P3 | T001, T004 |
| `PROD-003-S12` | P3 | T012, T013 |
| `PROD-003-S13` | P2 | T014, T015, T017 |
| `PROD-003-S14` | P3 | T002, T012, T013, T016 |
| `PROD-003-S15` | P2 | T002, T016 |
| `PROD-003-S16` | P1 | T012, T013 |
| `PROD-003-S17` | P3 | T002, T016 |
| `PROD-003-S18` | P3 | T002, T004, T016 |
| `PROD-003-S19` | P3 | T002, T012, T013, T016 |
| `PROD-003-S20` | P2 | T012, T013, T014 |
| `PROD-003-S21` | P2 | T014, T015, T017 |
| `PROD-003-S22` | P2 | T016 |
| `PROD-003-S23` | P2 | T016 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability; `Scenarios:` maps it to spec.md
- No test tasks: tests belong to the TEST harness (plan.md, Test Strategy)
- Commit after each task or logical group
- Same-file tasks (`products.service.ts`, `query-product.dto.ts`, `SearchForm.tsx`, `ProductList.tsx`) are sequential
