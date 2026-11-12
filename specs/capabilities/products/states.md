# States: Product (products)

Tài liệu yêu cầu không mô tả vòng đời sản phẩm; bảng dưới ghi hành vi hiện có của code (brownfield) —
backend/src/products/products.service.ts, backend/src/products/products.controller.ts.
Xoá là xoá cứng (xem `specs/_system/nfr.md`), nên không có trạng thái "đã xoá".

## States

| State | Meaning |
| --- | --- |
| (does not exist) | Chưa có, hoặc đã bị xoá cứng; `GET /products/:id` trả 404 |
| exists | Có trong DB, hiện trong danh sách, tìm kiếm và lọc |

## Events

| Event | Triggered by |
| --- | --- |
| create | Người xem gửi `POST /products/add` |
| edit | Người xem gửi `PATCH /products/:id` |
| delete | Người xem gửi `DELETE /products/:id` (UI chờ 5 giây cho phép hoàn tác trước khi gửi) |

## Transition table

| State \ Event | create | edit | delete |
| --- | --- | --- | --- |
| (does not exist) | → exists (id mới; trùng `sku` → ✗ 409) | ✗ does not exist (404) | ✗ does not exist (404) |
| exists | ✗ không áp dụng: tạo luôn sinh sản phẩm mới với id mới | → exists (trùng `sku` → ✗ 409) | → (does not exist) — xoá cứng, cascade ảnh / đánh giá / liên kết tag |

## Open questions

- _(không có)_
