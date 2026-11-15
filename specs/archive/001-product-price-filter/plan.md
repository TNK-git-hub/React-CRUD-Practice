# Implementation Plan: Filter products by price range

**Branch**: `001-product-price-filter` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Delta spec from `specs/changes/001-product-price-filter/spec.md`

## Summary

Visitors narrow the product list to a minimum and/or maximum price (PROD-001), combined with keyword, sort and
pagination and kept in the URL (PROD-002), with every invalid bound rejected in the UI before sending and by the
server (PROD-003). Technical approach:

- **Backend**: `GET /products` gains `minPrice` / `maxPrice`, validated as strings in `QueryProductDto` by custom
  validators that run the spec's checks in order (001-ADR-1); `ProductsService` adds the price condition to both
  keyword branches and puts both values into the Redis list key (001-ADR-2).
- **Frontend**: two text inputs in `SearchForm`; one pure function `checkPriceRange` serves the submit checks and
  the URL reading (001-ADR-3); the URL stays the single source of the applied range, and a server 400 becomes a field
  error with the last list kept (001-ADR-4).
- **Tests**: every scenario has a Vitest test in `test/public`: pure functions and fakes for the logic, component
  tests (jsdom + Testing Library) for the UI; an e2e script adds real-Postgres checks (001-ADR-5).

No stored data changes (spec.md, Data Model).

## Technical Context

**Language/Version**: TypeScript, `strict: true` in both packages (frontend ~5.9, backend ^6.0; frontend/tsconfig.json,
backend/tsconfig.json)

**Primary Dependencies**: Frontend Next.js 16.4 (App Router) + React 19 + TanStack Query 5 + Tailwind 4; backend
NestJS 12 + TypeORM + `class-validator` / `class-transformer` (NFR-033). No new dependency.

**Storage**: PostgreSQL 16 (`products.price` `numeric(10,2)`, unchanged); Redis 8 list cache (NFR-001, NFR-031)

**Testing**: Vitest 5 in both packages (backend through `unplugin-swc`); Python Playwright scripts in
`frontend/test/e2e/` for browser checks (details in Test Strategy)

**Target Platform**: Web: current Chrome, Safari, Firefox on desktop (NFR-042); Linux containers via Docker Compose
on one EC2 instance (NFR-030)

**Project Type**: Web application (pnpm monorepo `frontend/` + `backend/`)

**Performance Goals**: The product list responds in < 1 second on the current seed data, also when filtered by price
(NFR-004, SC-001)

**Constraints**: Exact 2-decimal comparison, no float parsing (PROD-001-S7, 001-ADR-1); the same 5 checks and
messages in UI and server (PROD-003); list cache key must include the range (NFR-001); existing stack only, no
`package.json` change in this change (jsdom and Testing Library came with the harness change `harness/dom-tests`, 001-ADR-5)

**Scale/Scope**: Current seed data (`backend/src/seed.ts`, all products of dummyjson); one page, one endpoint, 3
requirements, 53 scenarios

## Constitution Check

*GATE: Must pass before Phase 0 (ADRs). Re-check after Phase 1 design.*

| Principle | Check | Result |
| --- | --- | --- |
| I. Scenario ID traceability | Every one of the 53 scenarios is mapped to a test level and file below; every test name starts with its scenario ID | Pass |
| II. Authorization in the backend | No permission exists (no login); recorded as a known exception to Principle II (NFR-011, user decision, clarify 2026-11-15); validation is enforced in the backend, not only in the UI (PROD-003) | Pass (documented exception) |
| III. Deletion policy | The change deletes nothing; the deletion policy cells of `specs/_system/nfr.md` are not needed | Pass (N/A) |
| IV. Strict type checking | Application code: `strict: true` in both packages (`pnpm --filter frontend typecheck`, backend build). Test files: strict type check by `pnpm --filter backend typecheck:test` / `pnpm --filter frontend typecheck:test` (`tsconfig.test.json`: `src` + `test/public`), run by `pnpm ci:local` — added by the harness change `harness/test-typecheck`, which must be merged into the base branch before this change is dispatched | Pass once `harness/test-typecheck` is merged |
| V. PR into the base branch | Change branch `001-product-price-filter` from `refine-test-code-ci-cd`; PR after `/spec-archive` | Pass |

Re-check after Phase 1: unchanged — the design adds no dependency, no stored data and no permission; Principle IV
holds for test files through `harness/test-typecheck`.

## Project Structure

### Documentation (this feature)

```text
specs/changes/001-product-price-filter/
├── spec.md              # Delta spec; /speckit-plan filled "## Architecture Decisions" and "## Data Model"
├── plan.md              # This file
├── checklists/          # requirements.md, edge-cases.md, quality.md (/speckit-checklist)
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/main.ts                         # global ValidationPipe gains the `errors` exceptionFactory (001-ADR-1)
├── src/products/
│   ├── dto/query-product.dto.ts        # + minPrice, maxPrice (strings) with the custom validators (001-ADR-1)
│   ├── dto/price-bound.validator.ts    # NEW: checks 1–4 per bound, check 5 on the pair, first failure only
│   └── products.service.ts             # price condition on both keyword branches; range in the Redis list key (001-ADR-2)
└── test/public/
    ├── products.fakes.ts               # + in-memory repository that evaluates where / order / skip / take
    ├── query-product.price.test.ts     # NEW: server checks of PROD-003 through a real ValidationPipe
    └── products.price-filter.test.ts   # NEW: filtering, totals, cache key, invalidation, Redis down

frontend/
├── src/
│   ├── utils/priceRange.ts             # NEW: checkPriceRange (checks 1–5, trim, first failure per input) (001-ADR-3)
│   ├── utils/listUrl.ts                # NEW: build / read the list URL (key list q, minPrice, maxPrice, page, sortBy, order) (001-ADR-4)
│   ├── api/client.ts                   # ApiError carries the 400 body's `errors` (per-bound messages)
│   ├── api/productsQuerParam.ts        # ProductQuery + minPrice / maxPrice; getProducts sends them only when set
│   ├── hooks/useProducts.ts            # passes the range into the query params (query key follows, 001-ADR-2)
│   ├── views/ProductList.tsx           # range from the URL, common empty state, "Xoá bộ lọc", 400 as field error, last list kept
│   └── comopnents/ProductListPageCom/
│       ├── SearchForm.tsx              # two inputs "Giá tối thiểu ($)" / "Giá tối đa ($)", submit checks, messages
│       └── StatusMessage.tsx           # empty-state button label "Xoá bộ lọc"
└── test/
    ├── public/priceRange.test.ts       # NEW
    ├── public/listUrl.test.ts          # NEW
    ├── public/productsQuerParam.test.ts# + minPrice / maxPrice in the request, 400 `errors`
    ├── public/SearchForm.test.tsx      # NEW: component tests (jsdom): inputs, checks, messages, aria-*
    ├── public/ProductList.test.tsx     # NEW: component tests (jsdom): URL state, empty / error / loading states, server 400
    └── e2e/price_filter.py             # NEW: extra checks on real Postgres (not in CI)
```

**Structure Decision**: The existing monorepo layout; new code sits next to the code it extends
(`backend/src/products/dto/`, `frontend/src/utils/`). `listUrl.ts` and `priceRange.ts` are pure modules so the URL and
check logic run in Vitest without a browser; `SearchForm` and `ProductList` are covered by component tests (001-ADR-5).

## Test Strategy

### Runner and commands

| Part | Test runner | Command (from repo root) | Test file location / pattern |
| --- | --- | --- | --- |
| backend | Vitest 5 + `unplugin-swc` | `pnpm --filter backend test` | `backend/test/public/*.test.ts` |
| frontend | Vitest 5 (node environment; component tests `*.test.tsx` start with `// @vitest-environment jsdom`, Testing Library) | `pnpm --filter frontend test` | `frontend/test/public/*.test.ts`, `*.test.tsx` |
| both (CI gate) | — | `pnpm test` (and `pnpm ci:local`, must print `CI PASSED`) | — |
| browser (e2e, not in CI) | Python Playwright | `.venv/bin/python frontend/test/e2e/price_filter.py` (Windows: `.venv\Scripts\python`) with backend and frontend running | `frontend/test/e2e/*.py` |

- Run a single scenario: `pnpm --filter backend test -- -t "PROD-003-S2"` (frontend the same with
  `--filter frontend`); in the e2e script, each check prints its scenario ID and PASS / FAIL.
- Strict type check of the test files: `pnpm --filter backend typecheck:test` and `pnpm --filter frontend typecheck:test`
  (both in `pnpm ci:local`). Application code: `pnpm --filter frontend typecheck`; backend through `pnpm --filter backend build`.

### Environment

| Needs | What (version) | How to set it up | Isolated from dev by |
| --- | --- | --- | --- |
| Database | Vitest: none — the repository is an in-memory fake (`products.fakes.ts`); e2e: the dev PostgreSQL 16 `crud_practice`, seed data | e2e: `pnpm db:up`, then `pnpm --filter backend seed` | Vitest never opens a connection; e2e is read-only (Data safety) |
| Cache | Vitest: `fakeRedis()` (in-memory; `isReady: false` = Redis down); e2e: the dev Redis 8 | e2e: started by `pnpm db:up` | Vitest: no connection; e2e: read-only list keys only |
| External services | None (dummyjson only during `seed`); browser errors (5xx, 400 the UI let through, slow responses) are produced by Playwright route interception | — | — |
| Seed / sample data | Vitest: fixtures built in each test file with `productRow()` (prices of the scenario's Given); e2e: the seed data, bounds picked from prices read through `GET /products` at the start of the script | `pnpm --filter backend seed` (resets the dev data from dummyjson) | e2e writes nothing |

### Naming

- Every test name (or description) starts with exactly one scenario ID from spec.md: `PROD-NNN-S<n> <short description>`
  (`it('PROD-003-S2 rejects a negative minimum', …)`; e2e: the check's label starts with the ID).
- Tests live in `backend/test/public/` / `frontend/test/public/` (e2e: `frontend/test/e2e/`); every scenario of
  spec.md has at least one test (constitution Principle I).

### Test level per scenario type

| Scenario type | Level (unit / integration / e2e) | Why / what is real, what is faked |
| --- | --- | --- |
| happy | integration (backend: real `ValidationPipe` + real `ProductsService` + fake repository) + unit (frontend `listUrl`) + component (`SearchForm`, `ProductList`) | Real DTO, service, URL code and components; only the database, Redis, `fetch` and the router are faked |
| input | unit (`checkPriceRange`) + integration (DTO through `ValidationPipe`) + component (messages under the inputs, `aria-*`) | Same check table on both sides |
| boundary | integration (service + fake repository) + unit / component for UI bounds; e2e adds the real `numeric` comparison (PROD-001-S7) | The fake compares like Postgres on 2-decimal strings |
| missing | integration (DTO + service) + unit (`listUrl`) | — |
| collection | integration (service totals, order) + unit (`listUrl`) + component (empty-state text, "Xoá bộ lọc", pagination hidden) | — |
| state | integration (service: `update` then `findAll` with `fakeRedis`) | Real version-bump invalidation; database faked |
| permission | N/A as a type in this spec; the direct-call scenarios (PROD-001-S4, PROD-003 server scenarios) call the backend's DTO + service directly with no identity (Principle II) | No permission exists (NFR-011) |
| concurrency | component (`ProductList` with a delayed fake `fetch` and a fake router keeping a history for Back) + unit (`listUrl` for typed-not-applied) | Only the network timing and the router are faked |
| time | N/A | No scenario of this type |
| dependency | integration (`fakeRedis({ isReady: false })` for Redis down) + component (fake `fetch` answering 5xx / 400 with `errors`) | — |
| resource | unit + integration (30-digit value) | — |
| data | N/A | No scenario of this type |
| domain | integration (selling vs pre-discount price, cache key, min > max on the server) + unit (min > max in the UI, page reset in `listUrl`) | — |

Scenario → test file (each scenario has at least these):

| Test file | Scenarios |
| --- | --- |
| `backend/test/public/query-product.price.test.ts` | PROD-001-S4 (DTO part); PROD-003-S1, S2, S3, S6, S7, S9 (server part), S11, S12, S14 (server part), S16, S18 (server part), S19 (server part), S20 |
| `backend/test/public/products.price-filter.test.ts` | PROD-001-S1, S2, S3, S4, S5, S7, S8, S9, S10, S12, S13, S14; PROD-002-S1, S2, S5, S11; PROD-003-S1, S11 |
| `frontend/test/public/priceRange.test.ts` | PROD-001-S6, S8; PROD-003-S4, S5, S8, S9 (UI part), S10, S14 (UI part), S15, S17, S18, S19 (UI part) |
| `frontend/test/public/listUrl.test.ts` | PROD-001-S1, S2, S3, S5 (URL part); PROD-002-S3, S4, S7, S10, S12, S15 |
| `frontend/test/public/productsQuerParam.test.ts` | PROD-001-S1 (request carries `minPrice` / `maxPrice`), PROD-001-S5 (neither sent) |
| `frontend/test/public/productsQuerParam.test.ts` (400 body) | PROD-003-S13, S21 (`ApiError` carries `errors.minPrice` / `errors.maxPrice`) |
| `frontend/test/public/SearchForm.test.tsx` | PROD-001-S1, S2, S3, S5, S6 (form part); PROD-002-S12; PROD-003-S4, S5, S8, S9, S10, S14, S15, S17, S18, S19 (UI part), S22, S23 |
| `frontend/test/public/ProductList.test.tsx` | PROD-001-S11; PROD-002-S1, S2, S6, S8, S9, S10, S13, S14, S16; PROD-003-S13, S21 |
| `frontend/test/e2e/price_filter.py` (extra, real Postgres, not the only test of any scenario) | PROD-001-S7, S13 on seed prices; SC-001, SC-002 |

The fixtures of PROD-001-S7 / S13 are not in the seed data; the e2e script checks the same rule on seed prices
(a bound equal to a real product's price; a discounted seed product), the exact fixtures are in the backend tests.

### Data safety

- Tests and seed commands MUST NOT touch dev data: Vitest uses only in-memory fakes (no `DataSource`, no Redis
  connection); the e2e script only reads.
- Guard: the e2e script registers a Playwright route that aborts every request to the API whose method is not `GET`
  and fails the run, before any page action; `products.fakes.ts` builds the service without a real repository, so a
  Vitest run cannot reach Postgres.
- Clean-up between tests: each Vitest test builds a new `makeService()` / `fakeRedis()`; the e2e script opens a new
  browser context per check.

## Quickstart

**Prerequisites**: Docker (Postgres 16 + Redis 8 via `docker-compose.yml`), Node with pnpm, `backend/.env` (from
`backend/.env.example`), internet for the seed (dummyjson); for the e2e script Python 3.9+ with Playwright in `.venv`.

**Setup**:

```bash
pnpm install
pnpm db:up
pnpm --filter backend seed
# the frontend must call the local backend, otherwise it falls back to dummyjson (frontend/src/api/client.ts);
# backend/.env keeps FRONTEND_URL=http://localhost:5173 for CORS (NFR-013)
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > frontend/.env.local
pnpm dev            # backend on :3000, frontend on http://localhost:5173
# e2e only, once:
python3 -m venv .venv && .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium
```

**Check it works**:

1. Open http://localhost:5173, enter "10" in "Giá tối thiểu ($)" and "20" in "Giá tối đa ($)", press "Search" →
   only products priced 10–20 USD, URL `/?minPrice=10&maxPrice=20` (PROD-001-S1).
2. Add keyword "phone" and sort by price descending → only "phone" products in the range, total updated, range kept
   in the URL (PROD-002-S1).
3. Enter "30" / "10" and press "Search" → "Giá tối thiểu không được lớn hơn giá tối đa" under "Giá tối thiểu ($)",
   list unchanged (PROD-003-S15).
4. `curl -i "http://localhost:3000/products?minPrice=-1"` → HTTP 400, `message` contains "Giá không được âm"
   (PROD-003-S2).
5. Apply 1000000–2000000 → "Không tìm thấy sản phẩm nào" with "Xoá bộ lọc"; press it → full list, sort kept
   (PROD-002-S8, PROD-002-S10).
6. Tests: `pnpm test` (all Vitest scenarios), then `.venv/bin/python frontend/test/e2e/price_filter.py` with
   `pnpm dev` running (browser scenarios, SC-001, SC-002).

## Complexity Tracking

None: the Constitution Check has no unjustified violation (Principle IV holds through `harness/test-typecheck`, UI
scenarios run in CI through `harness/dom-tests`).
