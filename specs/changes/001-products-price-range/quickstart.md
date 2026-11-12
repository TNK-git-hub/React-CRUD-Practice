# Quickstart: kiểm tra 001-products-price-range

**Contracts**: [get-products.md](contracts/get-products.md), [ui-price-filter.md](contracts/ui-price-filter.md) ·
**Data model**: [data-model.md](data-model.md)

## Chuẩn bị

- Node 24, pnpm 12 (theo `packageManager` ở `package.json` gốc), Docker.
- `cp backend/.env.example backend/.env` rồi điền `DB_PASSWORD`.
- `pnpm install` rồi `pnpm db:up` (Postgres 16 + Redis 8 từ `docker-compose.yml`).

## Kiểm tra tự động (thay cho CI — ngoại lệ đã biết của bài thử, plan.md)

| Lệnh | Kỳ vọng |
| --- | --- |
| `pnpm --filter backend typecheck` (`tsc --noEmit`) | 0 lỗi, `strict: true` (research R8) |
| `pnpm --filter frontend typecheck` (`next typegen && tsc --noEmit`) | 0 lỗi, `strict: true` |
| `pnpm typecheck` | gồm hai lệnh trên và tsconfig của `tests/products/backend`, `tests/products/frontend`; 0 lỗi |
| `pnpm test` | mọi test xanh; test backend tự tạo database `crud_practice_test` và dùng Redis DB 1 |
| `grep -rho "PROD-00[1-3]-S[0-9]*" tests/products \| sort -u \| wc -l` | 44 (mỗi scenario của spec có ít nhất một test) |
| `python3 .specify/scripts/spec_check.py --change 001-products-price-range` | chỉ còn lỗi "not archived" trước `/spec-archive`; sau archive thì sạch |

## Kiểm tra tay

1. `pnpm db:up && pnpm --filter backend seed && pnpm dev`, mở `http://localhost:5173`.
2. **PROD-001**: nhập 10 và 20, bấm Search → chỉ còn sản phẩm giá 10–20 USD; URL có `minPrice=10&maxPrice=20`.
3. **PROD-002**: thêm từ khoá, đổi sắp xếp, sang trang 2, tải lại trang → bộ lọc và hai ô giá giữ nguyên.
4. **PROD-003**: nhập lần lượt `-1`, `10.123`, `1.000`, `1e3`, `10,5`, `+5`, `.5`, `5.`, `100000000`, rồi min 30 / max 10, rồi min `30,5` / max `10` → đúng thông
   báo trong [ui-price-filter.md](contracts/ui-price-filter.md), không có yêu cầu mới trong tab Network.
   Sửa tay URL thành `?minPrice=30&maxPrice=10` → hai ô trống, không lọc, không thông báo (PROD-002-S13).
5. **Trạng thái rỗng**: nhập 1000000–2000000 → tiêu đề và mô tả rỗng mới; bấm xoá bộ lọc → từ khoá và hai ô trống,
   sắp xếp giữ nguyên.
6. **SC-001**: trên dữ liệu seed, `curl -s -o /dev/null -w '%{time_total}\n' 'http://localhost:3000/products?minPrice=10&maxPrice=100&limit=10'`
   → dưới 1 giây (đo lần đầu, header `X-Cache: MISS`).
7. **SC-004**: lặp bước 2–5 trên Chrome, Safari, Firefox bản mới trên máy tính.
