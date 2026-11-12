# Data model: 001-products-price-range

**Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Change này **không đổi schema**: không thêm bảng, cột hay index (research R9). Thực thể `Product` giữ nguyên
(`specs/_system/domain-model.md`); cột được lọc là `products.price` (`numeric(10,2)`, USD).

## Khoảng giá (PriceRange) — giá trị truy vấn, không lưu

| Field | Kiểu khi truyền | Bắt buộc | Quy tắc | Nguồn |
| --- | --- | --- | --- | --- |
| minPrice | chuỗi số thường | no | rỗng / vắng = không giới hạn dưới; `^\d+(\.\d{1,2})?$`; ≤ 99999999.99 | BR-PROD-02, -03, -04, -06; PROD-003-S11 |
| maxPrice | chuỗi số thường | no | như `minPrice` | như trên |
| (liên trường) | — | — | có cả hai thì `minPrice ≤ maxPrice` | BR-PROD-05 |

Điều kiện lọc trên `products.price` (so sánh `numeric`, tính cả hai đầu — BR-PROD-01):

| minPrice | maxPrice | Điều kiện |
| --- | --- | --- |
| có | có | `minPrice ≤ price ≤ maxPrice` |
| có | vắng | `price ≥ minPrice` |
| vắng | có | `price ≤ maxPrice` |
| vắng | vắng | không lọc theo giá |

Điều kiện giá được AND với điều kiện tìm kiếm hiện có (`title ILIKE q` OR `description ILIKE q`), tức áp vào cả
hai nhánh OR.

## Kết quả kiểm tra một ô giá ở frontend (`parsePriceInput`)

Thứ tự kiểm tra sau khi bỏ khoảng trắng đầu / cuối (thông báo lấy nguyên văn từ spec, PROD-003):

| # | Điều kiện | Kết quả |
| --- | --- | --- |
| 1 | chuỗi rỗng | `empty` (không giới hạn) |
| 2 | dạng `-<số thường>` | lỗi "Giá không được âm" |
| 3 | không khớp `^\d+(\.\d+)?$` (số thường: chỉ chữ số, có thể thêm dấu chấm và chữ số thập phân) | lỗi "Giá phải là số" (gồm "10,5", "1,000", "1e3", "abc", "+5", ".5", "5.") |
| 4 | hơn 2 chữ số sau dấu chấm | lỗi "Giá chỉ được có tối đa 2 chữ số thập phân" (gồm "1.000") |
| 5 | lớn hơn 99999999.99 | lỗi "Giá không được lớn hơn $99,999,999.99" |
| 6 | còn lại | `value` (chuỗi đã bỏ khoảng trắng, **không** chuẩn hoá thêm: "010", "10.50" giữ nguyên; so sánh theo giá trị số — PROD-003-S17) |

Lỗi định dạng của từng ô được xét trước. Chỉ khi cả hai ô hợp lệ: có cả hai và min > max → lỗi "Giá tối thiểu không
được lớn hơn giá tối đa" (PROD-003-S16). Máy chủ kiểm theo đúng thứ tự này và trả đúng các câu trên (research R4).
So sánh ở bước 5 và min > max dùng phép so sánh chuỗi số thập phân, không qua `float`, để khớp PROD-001-S7.

## Trạng thái trên URL

| Tham số | Ý nghĩa | Ghi chú |
| --- | --- | --- |
| `q`, `page`, `sortBy`, `order` | như hiện nay | không đổi |
| `minPrice`, `maxPrice` | khoảng giá đang áp dụng | thêm mới; giá trị sai bị bỏ qua (PROD-002-S6); cả hai hợp lệ nhưng min > max → bỏ qua cả hai (PROD-002-S13); tham số lặp (`getAll(...).length > 1`) → bỏ qua đầu đó (PROD-002-S14); mỗi thay đổi là một mục lịch sử (`router.push`, PROD-002-S15); xoá bộ lọc xoá `q`, `minPrice`, `maxPrice`, `page`, giữ `sortBy`, `order` (PROD-002-S5) |

## Khoá cache

| Nơi | Khoá | Đổi |
| --- | --- | --- |
| Redis (backend) | `products:list:v<version>:` + JSON `{q, limit, skip, sortBy, order, minPrice, maxPrice}` | thêm `minPrice`, `maxPrice` |
| TanStack Query (frontend) | `['products', 'list', { q?, limit, skip, sortBy, order, minPrice?, maxPrice? }]` | thêm `minPrice`, `maxPrice` |

## States

Không đổi `specs/capabilities/products/states.md`: lọc chỉ đọc, không kích hoạt create / edit / delete.
