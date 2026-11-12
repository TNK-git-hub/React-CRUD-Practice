# Contract: `GET /products` (thêm lọc khoảng giá)

**Spec**: PROD-001, PROD-002, PROD-003 · **Nguồn ràng buộc**: docs/requirements/price-range.md#Yêu cầu

Endpoint công khai, không cần xác thực (NFR-011, ngoại lệ đã biết so với constitution Principle II).
Hành vi hiện có của các tham số khác giữ nguyên; response **không đổi shape**.

## Query parameters

| Tên | Kiểu | Bắt buộc | Quy tắc | Mới? |
| --- | --- | --- | --- | --- |
| `q` | string | no | tìm trong `title` / `description`, không phân biệt hoa thường | không |
| `limit` | int | no | 1–100 | không |
| `skip` | int | no | ≥ 0, mặc định 0 | không |
| `sortBy` | `title` \| `price` \| `rating` \| `stock` | no | trùng giá trị thì xếp tiếp theo `id` tăng dần | không |
| `order` | `asc` \| `desc` | no | mặc định `asc` | không |
| `minPrice` | chuỗi số thường | no | `^\d+(\.\d{1,2})?$`, ≤ `99999999.99`; rỗng (`minPrice=`) = vắng | **có** |
| `maxPrice` | chuỗi số thường | no | như `minPrice`; có cả hai thì `minPrice ≤ maxPrice` | **có** |

## Response 200 (không đổi)

```json
{ "products": [ /* ProductSummary */ ], "total": 2, "skip": 0, "limit": 10 }
```

- `products`: chỉ sản phẩm có `minPrice ≤ price ≤ maxPrice` (đầu nào vắng thì bỏ điều kiện đó), AND với `q`.
- `total`: số sản phẩm thoả **mọi** điều kiện lọc, không phụ thuộc `skip` / `limit` (PROD-002-S2).
- `skip` vượt quá `total` → `products: []`, `total` vẫn là tổng thật (hành vi hiện có, PROD-002-S8).
- Header `X-Cache: HIT | MISS` như hiện nay; khoá cache gồm `minPrice`, `maxPrice` (research R5).

## Response 400 (mới cho hai tham số giá)

Dạng lỗi của `ValidationPipe` hiện có: `{ "statusCode": 400, "message": [ ... ], "error": "Bad Request" }`.
Mỗi phần tử `message` là **đúng câu tiếng Việt** trong bảng thông báo của spec, vì giao diện hiện thông báo này cho người
xem khi máy chủ từ chối một giá trị giao diện đã cho qua (PROD-003-S14). Thứ tự kiểm như giao diện; min > max chỉ xét
khi cả hai giá trị hợp lệ.

| Trường hợp | Ví dụ | `message` | Scenario |
| --- | --- | --- | --- |
| min > max | `minPrice=30&maxPrice=10` | "Giá tối thiểu không được lớn hơn giá tối đa" | PROD-003-S3 |
| âm | `minPrice=-1` | "Giá không được âm" | PROD-003-S10 |
| hơn 2 chữ số thập phân | `minPrice=10.123`, `minPrice=1.000` | "Giá chỉ được có tối đa 2 chữ số thập phân" | PROD-003-S10 |
| không phải số thường | `minPrice=abc`, `1e3`, `10,5`, `+5`, `.5`, `5.` | "Giá phải là số" | PROD-003-S10 |
| tham số lặp | `minPrice=10&minPrice=20` (Express parse thành mảng) | "Giá phải là số" | PROD-003-S18 |
| lớn hơn 99999999.99 | `minPrice=100000000` | "Giá không được lớn hơn $99,999,999.99" | PROD-003-S10 |

## Ví dụ

| Request | Kết quả (sản phẩm giá 5, 10, 20, 30) |
| --- | --- |
| `GET /products?minPrice=10&maxPrice=20` | giá 10, 20 |
| `GET /products?minPrice=20` | giá 20, 30 |
| `GET /products?maxPrice=10` | giá 5, 10 |
| `GET /products?minPrice=&maxPrice=10` | giá 5, 10 (PROD-003-S11) |
| `GET /products?minPrice=20&maxPrice=20` | giá 20 |
| `GET /products?minPrice=010&maxPrice=20.00` | giá 10, 20 — cùng kết quả với `10`–`20` (PROD-003-S17) |
