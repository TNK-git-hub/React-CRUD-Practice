# Research: 001-products-price-range

**Date**: 2026-11-12 · **Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md)

Brownfield: stack đã có (`specs/_system/nfr.md`, NFR-033), không chọn mới. Các quyết định dưới đây chỉ là
cách dùng stack đó cho change này và cách dựng test / type checking mà repo chưa có.

## R1. Test runner cho cả backend và frontend

- **Decision**: Vitest 5 cho cả hai phía, chạy từ gốc repo bằng `pnpm test` (Vitest `projects`: `backend`,
  `frontend`). Backend dùng `unplugin-swc` + `@swc/core` để giữ `emitDecoratorMetadata` (NestJS DI cần);
  frontend dùng môi trường `jsdom` + `@testing-library/react` + `@testing-library/user-event` + `@vitejs/plugin-react`.
- **Rationale**: một runner, một lệnh cho CI. Bản mới nhất (vitest 5.1.0, unplugin-swc 2.0.0) hỗ trợ Node 24 có sẵn
  trên máy. Jest + ts-jest bị loại: ts-jest 29 chỉ đi với jest 29, trong khi jest hiện tại là 30, và cần một bộ
  transform riêng cho Nest decorators.
- **Alternatives considered**: Jest + ts-jest (Nest mặc định) — lệch phiên bản như trên; Playwright e2e trên trình
  duyệt thật — nặng, để kiểm tay SC-004 trong quickstart thay vì tự động hoá.

## R2. Vị trí test và cách import (constitution Principle I, `spec_check.py`)

- **Decision**: mọi file test nằm dưới `tests/products/` ở gốc repo (`tests/products/backend/*.spec.ts`,
  `tests/products/frontend/*.test.ts(x)`). Tên mỗi test bắt đầu bằng scenario ID, viết tiếng Anh, ví dụ
  `it('PROD-001-S7 compares prices exactly to 2 decimals', …)`. File test chỉ import đường dẫn tương đối và `vitest`;
  thư viện test bên thứ ba được re-export qua `backend/test/support.ts` và `frontend/test/support.tsx`.
- **Rationale**: `spec_check.py` tìm scenario ID trong mọi file dưới `tests/` ở gốc; CLAUDE.md đặt test ở
  `tests/<domain>/`. Với pnpm, import thư viện trực tiếp từ `tests/` sẽ phân giải từ `node_modules` gốc và có thể
  sinh hai bản `@nestjs/core` / `react` khác nhau (DI và hooks hỏng); đi qua file support trong từng package bảo đảm
  chỉ có một bản.
- **Alternatives considered**: đặt test trong `backend/test/` và `frontend/src/**` — trái constitution và
  `spec_check`; hoist toàn bộ (`shamefully-hoist`) — đổi cách cài của cả repo, ảnh hưởng Dockerfile.

## R3. Backend test dùng DB thật

- **Decision**: test backend dựng app NestJS thật (`Test.createTestingModule` với `AppModule`, `ValidationPipe`
  như `main.ts`) và gọi HTTP bằng `supertest`, chạy trên Postgres 16 + Redis 8 thật từ `docker-compose.yml`
  (`pnpm db:up`). Dùng database riêng `crud_practice_test` (global setup tạo nếu chưa có, `synchronize: true` như
  app) và Redis DB số 1, xoá sạch trước mỗi test. Riêng PROD-001-S11 thay `RedisService` bằng bản giả có
  `isReady = false` để mô phỏng Redis tắt.
- **Rationale**: PROD-001-S7 (so sánh `numeric(10,2)`), PROD-002-S1 (ILIKE + lọc giá) và PROD-001-S14
  (khoá cache) chỉ đáng tin khi chạy trên Postgres / Redis thật; DB giả trong bộ nhớ không mô phỏng đúng `numeric`.
- **Alternatives considered**: pg-mem — không đúng ngữ nghĩa `numeric` / ILIKE; Testcontainers — thêm phụ thuộc
  và chậm hơn so với compose sẵn có.

## R4. Kiểm tra `minPrice` / `maxPrice` ở backend

- **Decision**: thêm `minPrice`, `maxPrice` vào `QueryProductDto`, giữ dạng **chuỗi** từ query string:
  chuỗi rỗng → `undefined` (PROD-003-S11); kiểm tra bằng regex số thường `^\d+(\.\d{1,2})?$` (từ chối âm,
  "1e3", "abc", hơn 2 chữ số thập phân), rồi kiểm tra ≤ `99999999.99` và `minPrice ≤ maxPrice` (validator
  liên trường). Vi phạm → 400 qua `ValidationPipe` hiện có. Service truyền nguyên chuỗi vào điều kiện TypeORM
  (`Between` / `MoreThanOrEqual` / `LessThanOrEqual`) để Postgres so sánh `numeric` chính xác, không qua `float`.
- **Rationale**: `IsNumber` sau khi ép kiểu chấp nhận "1e3" và làm tròn kiểu float — trái PROD-003-S6 và
  PROD-001-S7. So sánh bằng chuỗi số với cột `numeric` tránh lệch làm tròn.
- **Alternatives considered**: `@Type(() => Number)` + `@IsNumber({ maxDecimalPlaces: 2 })` — nhận "1e3";
  kiểm tra trong service — tách khỏi cơ chế 400 đang dùng cho các tham số khác.

## R5. Khoá cache Redis và query key của TanStack Query

- **Decision**: thêm `minPrice`, `maxPrice` vào đối tượng JSON tạo khoá danh sách trong
  `ProductsService.findAll` (`products:list:v<version>:{q,limit,skip,sortBy,order,minPrice,maxPrice}`) và vào
  `ProductQuery` của frontend; `productKeys.list(params)` đã nhận cả object nên khoá tự gồm hai giá trị mới.
- **Rationale**: thiếu một trong hai thì hai khoảng giá khác nhau trả về kết quả của nhau (PROD-001-S14,
  catalog mục 13). Cơ chế "version" hiện có vẫn làm mọi khoá cũ hết hiệu lực khi tạo / sửa / xoá (PROD-001-S9, S13).
- **Alternatives considered**: tắt cache khi có lọc giá — mất lợi ích cache, không cần thiết.

## R6. Ô nhập giá ở frontend

- **Decision**: hai ô `<input type="text" inputMode="decimal">` trong `SearchForm`, có nhãn "Giá tối thiểu ($)",
  "Giá tối đa ($)". Một hàm thuần `parsePriceInput(raw)` trong `frontend/src/utils/priceRange.ts` (bỏ khoảng trắng
  đầu/cuối → rỗng / số hợp lệ / lỗi kèm đúng câu thông báo của spec) dùng chung cho kiểm tra khi submit và khi đọc URL.
- **Rationale**: `type="number"` để trình duyệt tự xử lý "10,5", "1e3" khác nhau giữa Chrome / Safari / Firefox và
  không trả lại chuỗi gốc, nên không thể hiện đúng thông báo của PROD-003 (SC-004 yêu cầu chạy giống nhau trên ba
  trình duyệt).
- **Alternatives considered**: `type="number"` + `step="0.01"` — như trên; thư viện form — thừa cho hai ô.

## R7. Trạng thái trên URL

- **Decision**: `minPrice`, `maxPrice` là tham số URL, giống `q`, `page`, `sortBy`, `order`. Thêm hai khoá vào danh
  sách khoá giữ lại trong `updateParams` (`frontend/src/views/ProductList.tsx`). Giá trị trên URL không hợp lệ theo
  `parsePriceInput` → bỏ qua, ô để trống, không báo lỗi (PROD-002-S6); cả hai hợp lệ nhưng min > max → bỏ qua cả hai
  (PROD-002-S13). Thông báo min > max chỉ hiện khi người xem tự gõ rồi bấm Search. Hai ô giá luôn hiển thị giá trị đang áp dụng
  và được đặt lại mỗi khi URL đổi (PROD-002-S11); hành vi ô từ khoá giữ nguyên như hiện nay.
- **Rationale**: `updateParams` hiện chỉ giữ 4 khoá nên sẽ làm rơi khoảng giá khi đổi trang / xoá sản phẩm
  (PROD-002-S12).
- **Alternatives considered**: giữ khoảng giá trong state React — trái câu trả lời clarify (khoảng giá nằm trên URL).

## R8. Type checking (constitution Principle IV)

- **Decision** (người dùng, 2026-11-12): giữ cấu hình hiện có — `strict: true` ở `backend/tsconfig.json` (kèm
  `strictPropertyInitialization: false` đang có) và `frontend/tsconfig.json`; không bật thêm cờ. Backend thêm script
  `typecheck` = `tsc --noEmit`; frontend đã có `typecheck` (`next typegen && tsc --noEmit`). Test có tsconfig riêng
  (`tests/products/backend/tsconfig.json`, `tests/products/frontend/tsconfig.json`) cùng mức `strict: true`.
  `pnpm typecheck` ở gốc chạy cả bốn. "Strictest mode" của constitution IV được diễn giải là `strict: true`.
- **Rationale**: đo trên code hiện có (2026-11-12): 0 lỗi với cấu hình hiện tại; bật thêm các cờ kiểu
  `@tsconfig/strictest` thì backend ~67 lỗi (60 do `strictPropertyInitialization`), frontend ~27 lỗi — gần như toàn bộ
  ở code cũ ngoài tính năng. Không sửa entity / DTO / component cũ chỉ vì type.
- **Alternatives considered**: bật bộ cờ `@tsconfig/strictest` trong change này — bị người dùng loại; để một change
  riêng sau này.

## R9. Hiệu năng (SC-001, NFR-004)

- **Decision**: không thêm index. Một test backend `SC-001 …` chèn số sản phẩm bằng số bản ghi của dữ liệu seed
  hiện có (seed lấy toàn bộ sản phẩm dummyjson, `backend/src/seed.ts`; con số được đếm từ dữ liệu seed khi implement,
  không đoán) và đo `GET /products` có lọc giá < 1 giây; quickstart ghi cách đo tay trên dữ liệu seed thật.
- **Rationale**: vài trăm dòng thì quét tuần tự đủ nhanh; index chỉ thêm rủi ro migration (app đang dùng
  `synchronize: true`).
- **Alternatives considered**: index trên `price` — chưa cần ở quy mô này.

## R10. CI (constitution Principle IV, cổng PR)

- **Finding**: branch này (`trial/spec-on-crud` → `001-products-price-range`) không có `.github/workflows/`.
  Workflow của harness trên `new-project` dùng `npm ci` / Node 20 và không có Postgres / Redis.
- **Decision** (người dùng, 2026-11-12): không thêm CI trên branch này; bài thử, không merge, không PR. Cổng "CI xanh"
  là ngoại lệ đã biết; các bước tương đương chạy tay theo quickstart.md (`pnpm test`, `tsc --noEmit` cho backend và
  frontend, `spec_check.py`).
