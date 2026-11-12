# Implementation Plan: Lọc sản phẩm theo khoảng giá

**Branch**: `001-products-price-range` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/changes/001-products-price-range/spec.md` (status: approved)

## Summary

Thêm lọc theo khoảng giá (giá tối thiểu / tối đa, tính cả hai đầu) vào danh sách sản phẩm, dùng chung với tìm kiếm,
sắp xếp, phân trang (PROD-001, PROD-002) và kiểm tra giá trị ở cả giao diện lẫn máy chủ (PROD-003).
Backend: `GET /products` nhận `minPrice`, `maxPrice` dạng chuỗi số thường, kiểm tra trong `QueryProductDto`, lọc bằng
so sánh `numeric` của Postgres, đưa hai tham số vào khoá cache Redis. Frontend: hai ô giá trong `SearchForm`, một hàm
kiểm tra thuần dùng chung, trạng thái trên URL, query key TanStack Query gồm hai tham số.
Change này cũng dựng test runner (Vitest) cho cả hai package và thêm lệnh `tsc --noEmit` cho backend; cấu hình type
checking giữ nguyên `strict: true` hiện có.

## Technical Context

**Language/Version**: TypeScript — backend 6.0.3, frontend 5.9.3; Node 24 (máy dev hiện có)

**Primary Dependencies**: NestJS 12 + TypeORM + class-validator / class-transformer (backend); Next.js 16 + React 19 +
TanStack Query 5 + Tailwind 4 (frontend); `redis` client 6 — stack có sẵn (NFR-033), không thêm thư viện chạy thật

**Storage**: Postgres 16 (`products.price numeric(10,2)`), Redis 8 làm cache danh sách (NFR-001); không đổi schema

**Testing**: Vitest 5 (projects `backend`, `frontend`) + `unplugin-swc` / `@swc/core` (backend), `@nestjs/testing` +
`supertest` (backend, Postgres + Redis thật qua docker compose), `jsdom` + `@testing-library/react` +
`@testing-library/user-event` + `@vitejs/plugin-react` (frontend) — research R1–R3

**Target Platform**: backend Node trong Docker (EC2); frontend trên Chrome, Safari, Firefox bản mới trên máy tính (NFR-042)

**Project Type**: web application (pnpm workspace `backend/` + `frontend/`)

**Performance Goals**: danh sách, kể cả khi lọc giá, phản hồi < 1 giây với dữ liệu seed hiện có (SC-001, NFR-004)

**Constraints**: không đổi shape response; không thêm index / migration (`synchronize: true`); so sánh giá không qua
`float` (PROD-001-S7); type checking `strict: true` như hiện có cho code và test (constitution IV, cách diễn giải ở
Constitution Check); không sửa entity / DTO / component cũ chỉ vì type

**Scale/Scope**: dữ liệu seed dummyjson (vài trăm sản phẩm); 3 requirement, 44 scenario

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc / cổng | Trước Phase 0 | Sau Phase 1 | Ghi chú |
| --- | --- | --- | --- |
| I. Mỗi scenario có test mang đúng ID, đặt ở `tests/products/` | PASS (kế hoạch) | PASS | 44/44 scenario có test (bảng Scenario → test bên dưới) |
| II. Quyền kiểm ở backend; scenario bị từ chối | PASS — ngoại lệ đã biết | PASS | NFR-011: app không có đăng nhập, lọc giá là đọc công khai; PROD-001-S8 gọi thẳng máy chủ không kèm danh tính |
| III. Chính sách xoá | N/A | N/A | change không xoá dữ liệu; S13 / S12 chỉ đọc sau khi xoá theo chính sách có sẵn trong nfr.md |
| IV. Type checking chế độ chặt nhất, cả code lẫn test | PASS — theo diễn giải | PASS — theo diễn giải | người dùng quyết 2026-11-12: "strictest mode" của constitution IV được diễn giải là `strict: true` (đang bật ở backend và frontend, 0 lỗi); test dùng cùng mức. Nâng lên các cờ chặt hơn (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …) là một change riêng sau này (research R8) |
| IV / cổng PR: type checking và test chạy trong CI, CI xanh | **Ngoại lệ đã biết** | **Ngoại lệ đã biết** | bài thử, không merge, không thêm CI trên branch này (người dùng quyết 2026-11-12). Các bước tương đương chạy tay theo quickstart.md: `pnpm test`, `tsc --noEmit` cho backend và frontend, `spec_check.py` (research R10) |
| V. PR vào `new-project`, review | **Ngoại lệ đã biết** | **Ngoại lệ đã biết** | bài thử trên branch tạo từ `trial/spec-on-crud`: không mở PR, không push (người dùng quyết 2026-11-12) |
| Không bịa số / quyền | PASS | PASS | mọi số lấy từ spec, rules.md, nfr.md; số đếm dữ liệu seed lấy khi implement (R9) |

## Project Structure

### Documentation (this feature)

```text
specs/changes/001-products-price-range/
├── spec.md              # delta spec (approved)
├── plan.md              # file này
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── get-products.md      # API GET /products
│   └── ui-price-filter.md   # hành vi giao diện + URL
├── checklists/          # requirements.md, edge-cases.md (+ quality.md sau /speckit-checklist)
└── tasks.md             # /speckit-tasks (chưa tạo)
```

### Source Code (repository root)

```text
package.json                     # + scripts test, typecheck (gọi typecheck của backend, frontend, test); + devDependency vitest
vitest.config.ts                 # mới: projects backend, frontend
backend/
├── package.json                 # + script typecheck (`tsc --noEmit`), test; + devDeps vitest, unplugin-swc, @swc/core, @nestjs/testing, supertest, @types/supertest
├── vitest.config.ts             # mới: môi trường node, SWC, dir = ../tests/products/backend, global setup
├── test/
│   ├── support.ts               # mới: re-export thư viện test; createTestApp(); fixtures
│   └── global-setup.ts          # mới: tạo DB crud_practice_test nếu chưa có
└── src/
    ├── products/dto/query-product.dto.ts   # + minPrice, maxPrice, validator theo thứ tự, thông báo tiếng Việt như spec
    └── products/products.service.ts        # + điều kiện giá; + khoá cache
frontend/
├── package.json                 # + test (typecheck đã có); + devDeps vitest, jsdom, @testing-library/*, @vitejs/plugin-react
├── vitest.config.ts             # mới: jsdom, dir = ../tests/products/frontend
├── test/support.tsx             # mới: re-export thư viện test; render với QueryClient; mock next/navigation
└── src/
    ├── utils/priceRange.ts                  # mới: parsePriceInput, validatePriceRange (R6, data-model)
    ├── api/productsQuerParam.ts             # ProductQuery + minPrice, maxPrice
    ├── hooks/useProducts.ts                 # truyền minPrice, maxPrice
    ├── views/ProductList.tsx                # đọc / ghi URL, updateParams giữ 2 khoá mới, trạng thái rỗng mới, xoá bộ lọc, 400 → thông báo dưới ô
    └── comopnents/ProductListPageCom/SearchForm.tsx   # hai ô giá, kiểm tra khi submit, lỗi theo ô
tests/products/
├── backend/
│   ├── tsconfig.json                     # strict: true, như backend
│   └── products-price-range.e2e.spec.ts   # PROD-* phía máy chủ + SC-001
└── frontend/
    ├── tsconfig.json                     # strict: true, như frontend
    ├── price-range.test.ts                # parsePriceInput / validatePriceRange
    └── product-list-price-filter.test.tsx # SearchForm + ProductList
```

**Structure Decision**: giữ workspace `backend/` + `frontend/` có sẵn; test ở `tests/products/` theo CLAUDE.md và
`spec_check.py`; cấu hình Vitest đặt trong từng package để thư viện test phân giải từ đúng `node_modules` (R2).

### Scenario → test

BE = `tests/products/backend/products-price-range.e2e.spec.ts`; FE-U = `tests/products/frontend/price-range.test.ts`;
FE = `tests/products/frontend/product-list-price-filter.test.tsx`.

| Scenario | Test | Scenario | Test | Scenario | Test |
| --- | --- | --- | --- | --- | --- |
| PROD-001-S1 | BE, FE | PROD-002-S1 | BE, FE | PROD-003-S1 | BE, FE-U, FE |
| PROD-001-S2 | BE, FE | PROD-002-S2 | BE, FE | PROD-003-S2 | FE-U, FE |
| PROD-001-S3 | BE, FE | PROD-002-S3 | FE | PROD-003-S3 | BE |
| PROD-001-S4 | BE, FE | PROD-002-S4 | FE | PROD-003-S4 | FE-U, FE |
| PROD-001-S5 | FE-U, FE | PROD-002-S5 | FE | PROD-003-S5 | FE-U, FE |
| PROD-001-S6 | BE | PROD-002-S6 | FE | PROD-003-S6 | FE-U |
| PROD-001-S7 | BE, FE-U | PROD-002-S7 | FE | PROD-003-S7 | FE-U |
| PROD-001-S8 | BE | PROD-002-S8 | FE | PROD-003-S8 | FE-U |
| PROD-001-S9 | BE | PROD-002-S9 | BE | PROD-003-S9 | FE-U |
| PROD-001-S10 | FE | PROD-002-S10 | FE | PROD-003-S10 | BE |
| PROD-001-S11 | BE | PROD-002-S11 | FE | PROD-003-S11 | BE |
| PROD-001-S12 | FE | PROD-002-S12 | FE | PROD-003-S12 | FE |
| PROD-001-S13 | BE | | | PROD-003-S13 | FE-U, FE |
| PROD-001-S14 | BE, FE | PROD-002-S13 | FE | PROD-003-S14 | FE |
| PROD-001-S15 | FE | | | PROD-003-S15 | FE-U, FE |
| | | | | PROD-003-S16 | FE-U, FE |

SC-001: test `SC-001 …` trong BE (R9). SC-004: kiểm tay theo quickstart.

## Decisions (người dùng, 2026-11-12)

1. **CI**: không thêm CI trên branch này — ngoại lệ đã biết của bài thử (Constitution Check). Chạy tay theo quickstart.md.
2. **URL có cả hai giá hợp lệ nhưng min > max**: spec đã bổ sung `PROD-002-S13` (commit `88a7c19`) — bỏ qua cả hai,
   hai ô để trống, không lọc theo giá. Luật chung: mọi giá trị giá đọc từ URL không hợp lệ đều bị bỏ qua; thông báo
   min > max chỉ hiện khi người xem tự gõ rồi bấm Search.
3. **Type checking**: giữ `strict: true` hiện có, không bật thêm cờ, không sửa code cũ chỉ vì type; backend có thêm
   script `typecheck` = `tsc --noEmit`.
4. **PR**: không mở PR, không push.
5. **Chi tiết kiểm tra giá** (spec, commit "spec(001): clarify validation details"): số thường chỉ gồm chữ số, có thể thêm
   dấu chấm và 1–2 chữ số thập phân; lỗi định dạng xét trước min > max; máy chủ từ chối giá trị giao diện đã cho qua →
   thông báo của máy chủ dưới ô giá, danh sách giữ nguyên. Hệ quả cho plan: máy chủ trả đúng câu tiếng Việt của spec
   (research R4, contracts/get-products.md).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Không có scenario permission bị từ chối (Principle II) | app không có đăng nhập; lọc giá là đọc công khai (NFR-011, ngoại lệ đã biết, người dùng chốt 2026-11-12) | thêm đăng nhập nằm ngoài phạm vi (spec, Out of Scope) |
| Không có CI, không mở PR (constitution IV, V) | bài thử, không merge (người dùng quyết 2026-11-12) | thêm workflow là sửa file harness trên branch thử; các bước tương đương chạy tay theo quickstart.md |
| "Strictest mode" diễn giải là `strict: true` (constitution IV) | bật cờ chặt hơn kéo theo sửa ~94 lỗi ở code cũ ngoài phạm vi tính năng (đo 2026-11-12, research R8) | để một change riêng sau này nâng cấu hình type checking |
