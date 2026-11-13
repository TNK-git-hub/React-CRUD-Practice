# Implementation Plan: Filter products by minimum discount

**Branch**: `002-products-discount-filter` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Delta spec from `specs/changes/002-products-discount-filter/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add an optional `minDiscount` query parameter (`10` | `20` | `30` | `50`) to `GET /products`, validated as a string
allow-list in `QueryProductDto` (002-ADR-1) and applied as `discountPercentage >= n` in the same condition object as
the price range of change 001, inside every keyword branch, so `total` and pages stay on the filtered set
(002-ADR-2). The Redis list key and the TanStack Query key gain `minDiscount` (002-ADR-3). On the list page a new
"Giảm giá" select next to the sort control applies the choice at once through the URL; `updateParams` and the
clear-filter action learn the new key, and invalid URL values fall back to "Tất cả" (002-ADR-4). No data change.

## Technical Context

**Language/Version**: TypeScript (backend and frontend), Node 24 — existing stack (NFR-033; backend/package.json,
frontend/package.json)

**Primary Dependencies**: NestJS 12 + TypeORM + class-validator / class-transformer (backend); Next.js 16 + React 19 +
TanStack Query 5 + Tailwind 4 (frontend); no new runtime dependency

**Storage**: Postgres 16 (`products.discountPercentage numeric(5,2)`, 0–100), Redis 8 as list cache (NFR-001); no
schema change

**Testing**: Vitest 5 (projects `backend`, `frontend`), `@nestjs/testing` + `supertest` on real Postgres + Redis,
`jsdom` + Testing Library — details in Test Strategy

**Target Platform**: backend Node in Docker (EC2, NFR-030); frontend in the current Chrome, Safari, Firefox on desktop
(NFR-042, SC-004)

**Project Type**: web application (pnpm workspace `backend/` + `frontend/`)

**Performance Goals**: the list responds in < 1 second on the current seed data when filtered by minimum discount,
alone or combined (SC-002, NFR-004 modified)

**Constraints**:
- **Prerequisite — change 001's code.** PROD-001–PROD-003 (price range filter, its URL keys, the common empty state)
  and 001's test setup (Vitest, `tests/products/`, test database) are specified and archived but **not implemented on
  this branch** (roadmap.md, Ordering notes). 002's code builds on them; the CODE harness must have 001's code in place
  before 002's tasks. This plan does not re-plan 001.
- Response shape unchanged; no index, no migration (`synchronize: true`).
- Discount comparison in Postgres on `numeric(5,2)`; the four accepted values are integers, so no float rounding.
- TypeScript `strict: true` for code and tests, as interpreted for change 001 (user decision, 2026-11-12).

**Scale/Scope**: seed data (dummyjson, a few hundred products); 2 requirements (PROD-002 modified, PROD-004 added),
38 scenarios (PROD-002: 22, PROD-004: 16)

## Constitution Check

*GATE: Must pass before Phase 0 (ADRs). Re-check after Phase 1 design.*

| Principle / gate | Before Phase 0 | After Phase 1 | Notes |
| --- | --- | --- | --- |
| I. Every scenario has a test named by its ID, in `tests/products/` | PASS (planned) | PASS | Test Strategy maps every scenario type to a level; the TEST harness writes one test per scenario |
| II. Permissions checked in the backend; denied scenarios | PASS — known exception | PASS | NFR-011: no login, the list is a public read; PROD-004-S10 calls the backend directly with no identity |
| III. Deletion policy | N/A | N/A | the change deletes nothing; PROD-004-S14 and PROD-002-S25 only read after a delete done under the existing hard-delete policy (nfr.md) |
| IV. Strictest type checking for code and tests | PASS — as interpreted | PASS — as interpreted | `strict: true` (on in backend and frontend), the interpretation decided for change 001 (user decision, 2026-11-12) |
| IV / PR gate: type checking and tests in CI | **Known exception** | **Known exception** | fixture branch, never merged; CI is out of scope for this fixture (user decision, 2026-11-13). The equivalent commands run by hand (Quickstart) |
| V. PR into `new-project`, review | **Known exception** | **Known exception** | fixture branch from `fixture/crud-change`: no PR, no push (user decision, 2026-11-13) |
| No invented numbers / permissions / messages | PASS | PASS | values, labels and the 400 message come from the spec (Clarifications 2026-11-13) |

## Project Structure

### Documentation (this feature)

```text
specs/changes/002-products-discount-filter/
├── spec.md              # Delta spec; /speckit-plan filled "## Architecture Decisions" and "## Data Model"
├── plan.md              # This file (incl. Test Strategy and Quickstart)
├── checklists/          # requirements.md (/speckit-specify), edge-cases.md (/spec-edge-cases), quality.md (/speckit-checklist)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/src/products/
├── dto/query-product.dto.ts        # + minDiscount: string allow-list, message "Mức giảm giá không hợp lệ" (002-ADR-1)
└── products.service.ts             # findAll: + minDiscount in the Redis key (002-ADR-3); loadList: + discount condition in every where branch (002-ADR-2)

frontend/src/
├── api/productsQuerParam.ts        # ProductQuery + minDiscount; getProducts sends it when set (002-ADR-3)
├── hooks/useProducts.ts            # passes minDiscount into params (query key follows)
├── utils/discountParams.ts         # NEW: parseMinDiscount(searchParams) → '10' | '20' | '30' | '50' | null (002-ADR-4)
├── comopnents/ProductListPageCom/
│   └── DiscountFilter.tsx          # NEW: select "Giảm giá" with "Tất cả", "Từ 10%" … "Từ 50%" (002-ADR-4)
└── views/ProductList.tsx           # reads minDiscount from the URL; updateParams key list + minDiscount; clear-filter clears it; renders DiscountFilter next to Sorting

tests/products/
├── backend/products-discount-filter.e2e.spec.ts      # API scenarios (see Test Strategy)
└── frontend/
    ├── discount-params.test.ts                       # parseMinDiscount
    └── product-list-discount-filter.test.tsx         # list page scenarios
```

**Structure Decision**: existing web application layout (`backend/`, `frontend/`, pnpm workspace); tests under
`tests/products/` at the repo root (CLAUDE.md: `tests/<domain>/`), so `spec_check.py --stage archive` finds them.

## Test Strategy

### Runner and commands

| Part | Test runner | Command (from repo root) | Test file location / pattern |
| --- | --- | --- | --- |
| backend | Vitest 5, project `backend`: environment `node`, plugin `unplugin-swc` (`@swc/core`) so NestJS decorator metadata is emitted; files run one at a time (`fileParallelism: false`) because they share one database | `pnpm test` (all) | `tests/products/backend/*.spec.ts` |
| frontend | Vitest 5, project `frontend`: environment `jsdom`, plugin `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | `pnpm test` (all) | `tests/products/frontend/*.test.ts`, `*.test.tsx` |

- The root `package.json` script `test` runs `vitest run` with both projects (`backend/vitest.config.ts`,
  `frontend/vitest.config.ts`).
- Run a single scenario: `pnpm test -t "PROD-004-S5"`.
- Strict type check of code and test files: `pnpm typecheck` = `tsc --noEmit` for `backend/` and `frontend/` and for
  a `tsconfig.json` in `tests/products/backend` and `tests/products/frontend` that extends the package's own tsconfig
  (`strict: true`).
- Test files import only relative paths and `vitest`; third-party test libraries are re-exported from one support
  file per package (`backend/test/support.ts`, `frontend/test/support.tsx`) so pnpm resolves a single copy of
  `@nestjs/core` and `react`.
- None of this exists on this branch yet: it comes with change 001's code (see Constraints).

### Environment

| Needs | What (version) | How to set it up | Isolated from dev by |
| --- | --- | --- | --- |
| Database | Postgres 16, database `crud_practice_test` | `pnpm db:up` (docker-compose.yml); a backend global setup connects to the `postgres` database and runs `CREATE DATABASE crud_practice_test` if it is missing; the app's `synchronize: true` creates the tables | separate database name; dev uses the name in `backend/.env` |
| Cache | Redis 8, DB index 1 (`redis://localhost:6379/1`) | same compose service | Redis DB 1; dev uses DB 0 |
| Backend app under test | the real `AppModule` through `Test.createTestingModule`, with `new ValidationPipe({ whitelist: true, transform: true })` as in `backend/src/main.ts`; HTTP calls through `supertest` | `createTestApp()` in `backend/test/support.ts` | — |
| External services | none; the Redis-down case overrides `RedisService` with a fake whose `isReady` is `false` and whose client never connects (PROD-004-S12) | `createTestApp({ redisDown: true })` | — |
| Seed / sample data | per-test fixtures inserted through the product repository: title, price, `discountPercentage` (and description) as each scenario's Given states | `insertProducts([...])` in `backend/test/support.ts` | written only to `crud_practice_test` |
| Frontend page under test | the list page in jsdom; `next/navigation` mocked (`useRouter().push` updates a shared `URLSearchParams` and records history; `useSearchParams()` returns it); `fetch` replaced by a handler that records each URL and can answer in any order or with a 500 / 400 | `frontend/test/support.tsx`: `setUrl(query)`, `mockFetch(handler)`, `renderProductList()` (fresh `QueryClient`, `retry: false`) | no network, no backend |

### Naming
### Naming

- Every test name (or description) starts with exactly one scenario ID from spec.md: `PROD-004-S5 rejects a minDiscount other than 10, 20, 30, 50`.
- Tests live in `tests/products/`; every scenario of spec.md has at least one test (constitution Principle I).
- PROD-002's carried-over scenarios (S1, S2, S4–S6, S10, S11, S13–S15) keep their tests from change 001; this change
  adds tests for PROD-002-S16–S27 and PROD-004-S1–S16, and updates the test of PROD-002-S4 (new empty-state
  description).

### Test level per scenario type

Levels: **unit** = pure function (`parseMinDiscount`); **integration (BE)** = real Nest app over HTTP (`supertest`) on
Postgres + Redis; **integration (FE)** = list page rendered in jsdom with mocked router and `fetch`; **e2e** = none
automated (manual Quickstart, SC-004).

| Scenario type | Level (unit / integration / e2e) | Why / what is real, what is faked |
| --- | --- | --- |
| happy | integration (BE) for API scenarios (PROD-004-S2); integration (FE) for UI scenarios (PROD-004-S1, S3, PROD-002-S16, S17, S27) | BE: real filtering in Postgres; FE: real component, URL and labels, fetch mocked |
| input | integration (BE) for 400s (PROD-004-S5, S7, S15); unit + integration (FE) for URL values (PROD-002-S18) | 400 body comes from the real `ValidationPipe`; URL parsing is pure |
| boundary | integration (BE) (PROD-004-S8) | `numeric(5,2)` comparison only trustworthy on real Postgres |
| missing | integration (BE) (PROD-004-S6); unit + integration (FE) (PROD-002-S20) | as input |
| collection | integration (FE) for empty state / page reset / page beyond the last (PROD-002-S21, S22, S26); integration (BE) + (FE) for total and pages (PROD-002-S19) | `total` from real `findAndCount`; UI shows it |
| state | integration (BE) (PROD-004-S9) | real edit through `PATCH`, real cache invalidation |
| permission | integration (BE), request with no identity (PROD-004-S10) | constitution II: call the backend directly |
| concurrency | integration (FE) (PROD-004-S11, S16, PROD-002-S23, S24) | fetch mock resolves out of order; router mock records history |
| time | N/A | no time-dependent scenario in this change |
| dependency | integration (BE) with fake `RedisService` (PROD-004-S12); integration (FE) with fetch → 500 (PROD-004-S13) | Redis down is simulated; Postgres real |
| resource | N/A | no resource-limit scenario in this change |
| data | integration (BE) (PROD-004-S14); integration (FE) (PROD-002-S25) | real hard delete then GET; FE: delete of the last card |
| domain | integration (BE) (PROD-004-S4) + integration (FE) query key check | real Redis key; TanStack key from `ProductQuery` |

SC-001 (seed data, every minimum discount) and SC-002 (< 1 s) are backend tests named `SC-001 …` / `SC-002 …`:
they insert as many products as the seed data has (the count is taken from `backend/src/seed.ts` when implementing,
never guessed), with discounts spread over 0–100, then check the result of each minimum discount against an
in-memory filter (SC-001) and time a filtered `GET /products` with a cache MISS (SC-002). SC-003 is PROD-002-S16;
SC-004 is manual (Quickstart).

### Data safety

- Tests never use the dev database or Redis DB 0: backend tests use `crud_practice_test` and Redis DB 1 only (a setup
  file sets `DB_NAME=crud_practice_test` and `REDIS_URL=redis://localhost:6379/1` after loading `backend/.env`);
  frontend tests use no backend at all. `pnpm --filter backend seed` is used only by hand in Quickstart, never by a
  test.
- Guard: before any write, the global setup and `createTestApp()` fail fast unless the database name is exactly
  `crud_practice_test`, the database host is `localhost` or `127.0.0.1`, and the Redis URL ends with `/1`; the run
  aborts with an error naming the bad value.
- Clean-up between tests: `TRUNCATE products, product_images, reviews, product_tags, tags RESTART IDENTITY CASCADE`
  and `FLUSHDB` on Redis DB 1, run before each test.

## Quickstart

**Prerequisites**: Node 24, pnpm 12 (`packageManager` in the root `package.json`), Docker; change 001's code merged
into this branch (see Constraints).

**Setup**:

```bash
cp backend/.env.example backend/.env   # then fill DB_PASSWORD
pnpm install
pnpm db:up                             # Postgres 16 + Redis 8
pnpm --filter backend seed             # dev data (by hand only)
pnpm dev                               # frontend http://localhost:5173, backend http://localhost:3000
```

**Check it works**:

1. `pnpm typecheck` and `pnpm test` → 0 type errors, every test green; `python3 .specify/scripts/spec_check.py --stage spec --change 002-products-discount-filter` → OK.
2. Open the list, choose "Từ 20%" in "Giảm giá" → only products discounted 20% or more; the URL has `minDiscount=20`; back on page 1 (PROD-004-S1, PROD-002-S22).
3. Add keyword "phone", a price range and sort by price descending → every filter applies together; reload keeps them (PROD-002-S16).
4. Choose "Tất cả" → `minDiscount` leaves the URL (PROD-004-S3); press Back → the previous choice returns (PROD-002-S24).
5. Edit the URL to `minDiscount=15` → "Giảm giá" shows "Tất cả", no message (PROD-002-S18); `curl -i 'http://localhost:3000/products?minDiscount=15'` → `400` with `"Mức giảm giá không hợp lệ"` (PROD-004-S5).
6. Choose a combination with no result → empty state; press the clear-filter button → keyword, range and discount cleared, sort kept (PROD-002-S21, S17).
7. SC-004: repeat steps 2–6 in the current Chrome, Safari and Firefox available on the machine.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| No CI on this branch (constitution IV PR gate) | Fixture branch, never merged; CI out of scope for the fixture (user decision, 2026-11-13) | Adding CI here would test nothing of the spec harness and the branch is never merged |
| Plan depends on change 001's code, absent on this branch | 001 is specified and archived only for the trial (roadmap.md) | Re-planning 001 inside 002 would mix two changes and duplicate 001's tasks |
