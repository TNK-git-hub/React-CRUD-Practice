---

description: "Tasks for 001-products-price-range"
---

# Tasks: Lọc sản phẩm theo khoảng giá

**Input**: Design documents from `specs/changes/001-products-price-range/`

**Prerequisites**: plan.md, spec.md (approved), research.md, data-model.md, contracts/, quickstart.md

**Tests**: BẮT BUỘC (constitution Principle I): mỗi scenario có ít nhất một test, tên test bắt đầu bằng đúng scenario ID,
viết tiếng Anh, đặt dưới `tests/products/`. Viết test trước, chạy thấy đỏ, rồi mới viết code.

**Organization**: mỗi requirement của spec là một user story — US1 = PROD-001, US2 = PROD-002, US3 = PROD-003.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (khác file, không phụ thuộc task chưa xong)
- **[Story]**: US1 / US2 / US3
- Đường dẫn tính từ gốc repo; web app: `backend/src/`, `frontend/src/`, test ở `tests/products/`

## Quy ước chung cho mọi task

- Không sửa entity, DTO hay component cũ chỉ vì type; type checking giữ `strict: true` hiện có (plan, research R8).
- File test chỉ import đường dẫn tương đối và `vitest`; thư viện test lấy qua `backend/test/support.ts` /
  `frontend/test/support.tsx` (research R2).
- Thông báo hiển thị dùng nguyên văn từ `contracts/ui-price-filter.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dựng test runner và lệnh kiểm tra kiểu (research R1, R2, R8)

- [ ] T001 Thêm devDependency `vitest` (^5.1.0) và scripts vào `package.json` gốc: `"test": "vitest run"`, `"typecheck": "pnpm --filter backend typecheck && pnpm --filter frontend typecheck && pnpm --filter backend exec tsc --noEmit -p ../tests/products/backend/tsconfig.json && pnpm --filter frontend exec tsc --noEmit -p ../tests/products/frontend/tsconfig.json"`; tạo `vitest.config.ts` gốc với `test.projects: ['backend/vitest.config.ts', 'frontend/vitest.config.ts']`
- [ ] T002 [P] Trong `backend/package.json`: thêm scripts `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`; thêm devDependencies `vitest` (cùng phiên bản với gốc), `unplugin-swc`, `@swc/core`, `@nestjs/testing` (cùng major 12 với `@nestjs/core`), `supertest`, `@types/supertest`
- [ ] T003 [P] Trong `frontend/package.json`: thêm script `"test": "vitest run"` (giữ nguyên `typecheck` đang có); thêm devDependencies `vitest` (cùng phiên bản với gốc), `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@vitejs/plugin-react`
- [ ] T004 Chạy `pnpm install` ở gốc để cập nhật `pnpm-lock.yaml` (sau T001–T003)
- [ ] T005 [P] Tạo `backend/vitest.config.ts`: `environment: 'node'`, plugin `swc.vite()` (giữ `emitDecoratorMetadata`), `dir` = `../tests/products/backend` (đường dẫn tuyệt đối), `include: ['**/*.spec.ts']`, `globalSetup: './test/global-setup.ts'`, `setupFiles: ['./test/setup-env.ts']`, `fileParallelism: false` (dùng chung một DB)
- [ ] T006 [P] Tạo `frontend/vitest.config.ts`: `environment: 'jsdom'`, plugin `react()`, `dir` = `../tests/products/frontend`, `include: ['**/*.test.ts', '**/*.test.tsx']`, `setupFiles: ['./test/setup.ts']`
- [ ] T007 [P] Tạo `tests/products/backend/tsconfig.json` (extends `../../../backend/tsconfig.json`, `strict: true` như backend, `noEmit`, include `*.spec.ts` và `../../../backend/test/**/*.ts`) và `tests/products/frontend/tsconfig.json` (extends `../../../frontend/tsconfig.json`, include `*.test.ts`, `*.test.tsx`, `../../../frontend/test/**/*`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: hạ tầng test và phần dùng chung cho cả ba story

**⚠️ CRITICAL**: chưa xong phase này thì không làm story nào

- [ ] T008 [P] Tạo `backend/test/setup-env.ts`: `process.loadEnvFile('backend/.env')` (đường dẫn tính từ gốc repo), rồi ghi đè `process.env.DB_NAME = 'crud_practice_test'` và `process.env.REDIS_URL = 'redis://localhost:6379/1'`
- [ ] T009 [P] Tạo `backend/test/global-setup.ts`: đọc `backend/.env`, kết nối database `postgres` bằng `pg`, chạy `CREATE DATABASE crud_practice_test` nếu chưa có; báo lỗi rõ ràng nếu Postgres chưa chạy ("run pnpm db:up")
- [ ] T010 Tạo `backend/test/support.ts`: `createTestApp({ redisDown?: boolean })` dựng `Test.createTestingModule({ imports: [AppModule] })`, khi `redisDown` thì `overrideProvider(RedisService)` bằng bản giả có `isReady = false` và `client` không kết nối; gắn `new ValidationPipe({ whitelist: true, transform: true })` như `backend/src/main.ts`; `resetDb()` (`TRUNCATE products, product_images, reviews, product_tags, tags RESTART IDENTITY CASCADE`); `flushRedis()` (`FLUSHDB` trên DB 1); `insertProducts(rows: { title: string; price: string; description?: string }[])` qua repository; re-export `request` từ `supertest`
- [ ] T011 [P] Tạo `frontend/test/setup.ts` (nạp `@testing-library/jest-dom/vitest`) và `frontend/test/support.tsx`: `vi.mock('next/navigation')` với `useRouter().push` là spy cập nhật một `URLSearchParams` dùng chung và `useSearchParams()` trả về nó; `setUrl(query: string)`; `renderProductList()` bọc `QueryClientProvider` (mỗi test một `QueryClient` mới, `retry: false`); `mockFetch(handler)` thay `globalThis.fetch` và ghi lại URL được gọi; re-export `screen`, `within`, `waitFor`, `userEvent`
- [ ] T012 Trong `backend/src/products/dto/query-product.dto.ts` thêm `minPrice?: string` và `maxPrice?: string` (data-model "Khoảng giá"): chuỗi rỗng → `undefined` bằng `@Transform` ("rỗng / vắng = không giới hạn"); `@Matches(/^\d+(\.\d{1,2})?$/)` ("chuỗi số thường"); ràng buộc "≤ 99999999.99" (tương đương phần nguyên sau khi bỏ số 0 đầu có tối đa 8 chữ số); validator liên trường trên `maxPrice`: "có cả hai thì `minPrice ≤ maxPrice`", so sánh chuỗi thập phân, không dùng `Number`/`parseFloat`; thêm `@ApiPropertyOptional` cho Swagger
- [ ] T013 Tạo `frontend/src/utils/priceRange.ts`: `parsePriceInput(raw: string)` → `{ kind: 'empty' } | { kind: 'value'; value: string } | { kind: 'error'; message: string }` theo đúng thứ tự bảng "Kết quả kiểm tra một ô giá" trong data-model.md (bỏ khoảng trắng đầu/cuối; `-<số>` → "Giá không được âm"; không khớp `^\d+(\.\d+)?$` → "Giá phải là số"; hơn 2 chữ số sau dấu chấm → "Giá chỉ được có tối đa 2 chữ số thập phân"; lớn hơn 99999999.99 → "Giá không được lớn hơn $99,999,999.99"); `compareDecimal(a, b)` so sánh chuỗi thập phân không qua `float`; `validatePriceRange(minRaw, maxRaw)` trả lỗi theo ô và lỗi "Giá tối thiểu không được lớn hơn giá tối đa" khi cả hai hợp lệ và min > max

**Checkpoint**: `pnpm test` chạy được (chưa có test), `pnpm typecheck` 0 lỗi

---

## Phase 3: User Story 1 — Lọc danh sách theo khoảng giá (PROD-001, P1) 🎯 MVP

**Goal**: người xem nhập giá tối thiểu và/hoặc tối đa, bấm Search, danh sách chỉ còn sản phẩm có giá trong khoảng (tính cả hai đầu).

**Independent Test**: `pnpm test -t "PROD-001"` xanh; quickstart bước 2.

### Tests for User Story 1 ⚠️ (viết trước, phải đỏ trước khi làm T017–T021)

- [ ] T014 [P] [US1] Trong `tests/products/backend/products-price-range.e2e.spec.ts`, `describe('PROD-001')` với `beforeEach(resetDb, flushRedis)`: `PROD-001-S1` (giá 5/10/20/30, `minPrice=10&maxPrice=20` → 10, 20), `PROD-001-S2` (`minPrice=20` → 20, 30), `PROD-001-S3` (`maxPrice=10` → 5, 10), `PROD-001-S4` (không tham số giá → cả 4), `PROD-001-S6` (`20`–`20` → chỉ 20), `PROD-001-S7` (19.99/20.00/20.01, `19.99`–`20` → 19.99, 20.00), `PROD-001-S8` (gọi không kèm header danh tính nào → 200 đã lọc), `PROD-001-S9` (lấy 10–20, `PATCH /products/:id` giá 50, lấy lại → không còn), `PROD-001-S11` (`createTestApp({ redisDown: true })` → kết quả đúng), `PROD-001-S13` (`DELETE /products/:id` rồi lấy lại → không còn, `total` giảm 1), `PROD-001-S14` (lấy 10–20 rồi 30–40 trong lúc cache còn hiệu lực → lần hai `X-Cache: MISS` và đúng sản phẩm 30–40)
- [ ] T015 [P] [US1] Trong `tests/products/frontend/price-range.test.ts`: `PROD-001-S5` (`" 10 "` → `value '10'`), `PROD-001-S7` (`"19.99"` hợp lệ; `compareDecimal('19.99', '20')` < 0, `compareDecimal('20.00', '20')` = 0)
- [ ] T016 [P] [US1] Trong `tests/products/frontend/product-list-price-filter.test.tsx`: `PROD-001-S1`…`PROD-001-S4` (gõ hai ô, bấm Search → `push` có `minPrice`/`maxPrice` đúng, fetch có đúng tham số, danh sách hiện đúng; xoá trống hai ô → URL không còn khoá giá), `PROD-001-S5` (khoảng trắng bị bỏ trên URL), `PROD-001-S10` (fetch 10–20 trả về sau fetch 30–40 → danh sách và hai ô là 30–40), `PROD-001-S12` (fetch trả 500 → tiêu đề "Không tải dược danh sách sản phẩm" và nút thử lại; hai ô vẫn 10 và 20), `PROD-001-S14` (hai khoảng khác nhau → hai lần fetch với hai bộ tham số, không dùng lại dữ liệu cũ), `PROD-001-S15` (nhãn "Giá tối thiểu ($)", "Giá tối đa ($)")

### Implementation for User Story 1

- [ ] T017 [US1] Trong `backend/src/products/products.service.ts`: `loadList` thêm điều kiện giá theo bảng "Điều kiện lọc" của data-model.md (`Between` / `MoreThanOrEqual` / `LessThanOrEqual` với giá trị **chuỗi**, so sánh `numeric` ở Postgres), áp vào **cả hai** nhánh OR của `q`; `findAll` thêm `minPrice`, `maxPrice` vào `JSON.stringify({ q, limit, skip, sortBy, order, minPrice, maxPrice })` của khoá cache (research R5)
- [ ] T018 [P] [US1] Trong `frontend/src/api/productsQuerParam.ts`: `ProductQuery` thêm `minPrice?: string`, `maxPrice?: string`; `getProducts` chỉ đặt hai tham số khi có giá trị
- [ ] T019 [US1] Trong `frontend/src/hooks/useProducts.ts`: nhận `minPrice`, `maxPrice` và đưa vào `params` (nên vào `productKeys.list(params)` — query key, research R5)
- [ ] T020 [US1] Trong `frontend/src/comopnents/ProductListPageCom/SearchForm.tsx`: thêm hai ô `<input type="text" inputMode="decimal">` nhãn "Giá tối thiểu ($)" và "Giá tối đa ($)", giá trị ban đầu từ props; khi submit dùng `validatePriceRange` của `frontend/src/utils/priceRange.ts`, hợp lệ thì gọi `onSearch({ query, minPrice, maxPrice })` với giá trị đã chuẩn hoá (ô trống → không có khoá)
- [ ] T021 [US1] Trong `frontend/src/views/ProductList.tsx`: đọc `minPrice`, `maxPrice` từ URL qua `parsePriceInput` (giá trị không hợp lệ → bỏ qua, ô để trống, không thông báo); `handleSearch` đặt `q`, `minPrice`, `maxPrice`, bỏ `page`; danh sách khoá giữ lại trong `updateParams` thành `['q', 'page', 'minPrice', 'maxPrice', 'sortBy', 'order']`; truyền giá đang áp dụng vào `SearchForm` và `useProducts`

**Checkpoint**: US1 chạy độc lập; mọi test `PROD-001-*` xanh

---

## Phase 4: User Story 2 — Lọc giá kết hợp với tìm kiếm, sắp xếp, phân trang (PROD-002, P1)

**Goal**: khoảng giá đi cùng từ khoá, sắp xếp, phân trang; giữ trên URL; trạng thái rỗng và nút xoá bộ lọc mới; giá trị sai trên URL bị bỏ qua.

**Independent Test**: `pnpm test -t "PROD-002"` xanh; quickstart bước 3 và 5.

### Tests for User Story 2 ⚠️

- [ ] T022 [P] [US2] Trong `tests/products/backend/products-price-range.e2e.spec.ts`, `describe('PROD-002')`: `PROD-002-S1` (sản phẩm chứa "phone" giá 50/150/300/600 và sản phẩm không chứa "phone" giá 200; `q=phone&minPrice=100&maxPrice=500&sortBy=price&order=desc` → 300 rồi 150, `total` 2), `PROD-002-S2` (15 sản phẩm trong khoảng, `limit=10&skip=10` → 5 sản phẩm, `total` 15), `PROD-002-S9` (12 sản phẩm cùng giá 10, `sortBy=price`, trang 1 và trang 2 không trùng, hợp lại đủ 12)
- [ ] T023 [P] [US2] Trong `tests/products/frontend/product-list-price-filter.test.tsx`: `PROD-002-S1` (từ khoá + giá + đổi sắp xếp → URL giữ cả ba), `PROD-002-S2` (`total` 15 → 2 trang, trang 2), `PROD-002-S3` (`setUrl('?minPrice=10&maxPrice=20')` → hai ô hiện 10, 20 và fetch có hai tham số), `PROD-002-S4` (fetch trả rỗng → "Không tìm thấy sản phẩm nào" và "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc."), `PROD-002-S5` (bấm xoá bộ lọc → URL chỉ còn `sortBy`, `order`), `PROD-002-S6` (`?minPrice=abc&maxPrice=20` → ô min trống, không có thông báo, fetch chỉ có `maxPrice=20`), `PROD-002-S7` (`total` 10 → không có nút trang 2), `PROD-002-S8` (`?page=5`, `total` 15, rỗng → trạng thái rỗng, thanh phân trang ẩn), `PROD-002-S10` (đang `page=3`, Search khoảng mới → URL không còn `page`), `PROD-002-S11` (gõ 30–40 chưa Search rồi đổi sắp xếp → fetch vẫn 10–20, hai ô về 10 và 20), `PROD-002-S12` (trang 2 còn 1 sản phẩm, xoá → `push` trang 1 vẫn có `minPrice=10&maxPrice=20`), `PROD-002-S13` (`?minPrice=30&maxPrice=10` → hai ô trống, không có thông báo, fetch không có tham số giá)

### Implementation for User Story 2

- [ ] T024 [US2] Trong `frontend/src/views/ProductList.tsx`: khi cả hai giá trên URL hợp lệ nhưng min > max (`compareDecimal`) → bỏ qua cả hai (PROD-002-S13), không thông báo; mô tả trạng thái rỗng đổi thành "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." (tiêu đề giữ "Không tìm thấy sản phẩm nào"); hành động xoá bộ lọc bỏ `q`, `minPrice`, `maxPrice`, `page`, giữ `sortBy`, `order`
- [ ] T025 [US2] Trong `frontend/src/comopnents/ProductListPageCom/SearchForm.tsx` (và cách `ProductList.tsx` truyền props): hai ô giá được đặt lại về giá đang áp dụng mỗi khi URL đổi (PROD-002-S11); hành vi ô từ khoá giữ nguyên như hiện nay

**Checkpoint**: US1 và US2 đều xanh

---

## Phase 5: User Story 3 — Kiểm tra giá trị khoảng giá (PROD-003, P1)

**Goal**: giá trị sai bị chặn trên giao diện với đúng thông báo; máy chủ từ chối khi gọi thẳng.

**Independent Test**: `pnpm test -t "PROD-003"` xanh; quickstart bước 4.

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] Trong `tests/products/backend/products-price-range.e2e.spec.ts`, `describe('PROD-003')`: `PROD-003-S1` (`minPrice=0&maxPrice=99999999.99` → 200), `PROD-003-S3` (`minPrice=30&maxPrice=10` → 400, body không có `products`), `PROD-003-S10` (lần lượt `minPrice=-1`, `10.123`, `abc`, `100000000` → 400), `PROD-003-S11` (giá 5/10/20/30, `minPrice=&maxPrice=10` → 5, 10)
- [ ] T027 [P] [US3] Trong `tests/products/frontend/price-range.test.ts`: `PROD-003-S1` (`"0"`, `"99999999.99"` hợp lệ), `PROD-003-S2` (`validatePriceRange('30', '10')` → "Giá tối thiểu không được lớn hơn giá tối đa"), `PROD-003-S4` (`"10,5"`, `"1,000"` → "Giá phải là số"), `PROD-003-S5` (`"abc"`, `"<script>"`, `"' OR 1=1 --"` → "Giá phải là số"), `PROD-003-S6` (`"1.000"` → "Giá chỉ được có tối đa 2 chữ số thập phân"; `"1e3"` → "Giá phải là số"), `PROD-003-S7` (`"-0.01"`, `"-1"` → "Giá không được âm"; `"0"` hợp lệ), `PROD-003-S8` (`"10.123"` lỗi, `"10.12"` hợp lệ), `PROD-003-S9` (`"100000000"` → "Giá không được lớn hơn $99,999,999.99"; `"99999999.99"` hợp lệ), `PROD-003-S13` (chuỗi 100 chữ số → "Giá không được lớn hơn $99,999,999.99")
- [ ] T028 [P] [US3] Trong `tests/products/frontend/product-list-price-filter.test.tsx`: `PROD-003-S1` (0 và 99999999.99 → không thông báo, có fetch), `PROD-003-S2` (30 và 10 → thông báo dưới ô giá tối thiểu, không fetch, không `push`, hai ô giữ 30 và 10), `PROD-003-S4` ("10,5" → "Giá phải là số"), `PROD-003-S5` (`<script>` hiện nguyên văn trong ô, không có thẻ `script` mới trong DOM), `PROD-003-S12` (min "-1", max "abc" → hai thông báo, mỗi cái dưới đúng ô), `PROD-003-S13` (100 chữ số → thông báo, không fetch)

### Implementation for User Story 3

- [ ] T029 [US3] Trong `frontend/src/comopnents/ProductListPageCom/SearchForm.tsx`: khi `validatePriceRange` trả lỗi thì không gọi `onSearch`, hiện thông báo dưới đúng ô (lỗi min > max hiện dưới ô giá tối thiểu), gắn thông báo với ô bằng `aria-describedby`, giữ nguyên giá trị đã gõ; thông báo biến mất khi lần submit sau hợp lệ
- [ ] T030 [US3] Rà `backend/src/products/dto/query-product.dto.ts` (T012) với các trường hợp 400 trong `contracts/get-products.md` ("min > max", "âm", "hơn 2 chữ số thập phân", "không phải số thường", "lớn hơn 99999999.99"); sửa nếu test T026 còn đỏ

**Checkpoint**: cả ba story xanh

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T031 Đếm số sản phẩm của dữ liệu seed: chạy `pnpm --filter backend seed` trên DB dev rồi `SELECT count(*) FROM products`; ghi con số và nguồn vào comment của test `SC-001` (research R9 — không đoán)
- [ ] T032 Trong `tests/products/backend/products-price-range.e2e.spec.ts` thêm test `SC-001 list with price filter responds in under 1 second on seed-sized data`: chèn đúng số sản phẩm ở T031, cache trống, đo `GET /products?minPrice=10&maxPrice=100&limit=10` < 1000 ms
- [ ] T033 Chạy `pnpm typecheck` → 0 lỗi (backend, frontend, hai tsconfig test)
- [ ] T034 Chạy `pnpm test` → xanh; `grep -rho "PROD-00[1-3]-S[0-9]*" tests/products | sort -u | wc -l` → 41
- [ ] T035 Chạy `python3 .specify/scripts/spec_check.py --change 001-products-price-range` → chỉ còn lỗi "not archived"
- [ ] T036 Kiểm tay theo `specs/changes/001-products-price-range/quickstart.md` (bước 1–7, gồm SC-001 trên dữ liệu seed thật và SC-004 trên Chrome, Safari, Firefox); báo kết quả cho người dùng (thay cho CI — ngoại lệ của bài thử)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001–T003 song song được (T001 khác file), T004 sau T001–T003, T005–T007 sau T004
- **Foundational (Phase 2)**: sau Phase 1; T010 sau T008–T009; T012, T013 độc lập với hạ tầng test
- **US1 (Phase 3)**: sau Phase 2
- **US2 (Phase 4)**: sau US1 (dùng đọc URL / `updateParams` của T021)
- **US3 (Phase 5)**: sau US1 (dùng ô giá của T020); độc lập với US2
- **Polish (Phase 6)**: sau cả ba story

### Within Each User Story

- Test viết trước và phải đỏ → backend → frontend API / hook → component
- T014, T022, T026 cùng file test backend: viết tuần tự theo thứ tự story (đánh [P] so với task frontend, không với nhau)
- T016, T023, T028 cùng file test frontend: tương tự

### Parallel Opportunities

- Phase 1: T002 ∥ T003; T005 ∥ T006 ∥ T007
- Phase 2: T008 ∥ T009 ∥ T011; T012 ∥ T013
- US1: T014 ∥ T015 ∥ T016 (ba file khác nhau); T017 (backend) ∥ T018 (frontend)
- US2 ∥ US3 sau khi US1 xong, nếu tách người (khác file implementation, chung file test → viết lần lượt)

---

## Parallel Example: User Story 1

```bash
# Ba file test khác nhau:
Task: "T014 backend e2e PROD-001 in tests/products/backend/products-price-range.e2e.spec.ts"
Task: "T015 unit PROD-001 in tests/products/frontend/price-range.test.ts"
Task: "T016 component PROD-001 in tests/products/frontend/product-list-price-filter.test.tsx"

# Backend và frontend độc lập:
Task: "T017 price condition + cache key in backend/src/products/products.service.ts"
Task: "T018 ProductQuery in frontend/src/api/productsQuerParam.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1) → `pnpm test -t "PROD-001"` xanh → dừng, kiểm quickstart bước 2

### Incremental Delivery

1. US1 → lọc cơ bản chạy được
2. US2 → kết hợp tìm kiếm / sắp xếp / phân trang, URL, trạng thái rỗng
3. US3 → thông báo lỗi đầy đủ và từ chối phía máy chủ
4. Polish → SC-001, typecheck, test, spec_check, kiểm tay

---

## Notes

- 41 scenario: PROD-001 (15), PROD-002 (13), PROD-003 (13); bảng Scenario → test trong plan.md.
- Spec sai hoặc thiếu khi implement → dừng và báo, không sửa spec cho khớp code (CLAUDE.md).
- Test đỏ → sửa code, không sửa test cho xanh.
- Không commit trong lúc implement nếu người dùng chưa yêu cầu; cuối change là hai commit (code; spec).
