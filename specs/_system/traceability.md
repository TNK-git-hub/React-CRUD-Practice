# Traceability — React-CRUD-Practice (quản lý sản phẩm)

Tài liệu không đánh số nên các mục được đánh `REQ-NN` theo thứ tự xuất hiện trong
docs/requirements/price-range.md; quy tắc nghiệp vụ lấy ID từ `capabilities/products/rules.md`.

| Requirement item | Summary | Type | Owning change | Requirement ID |
| --- | --- | --- | --- | --- |
| REQ-01 (price-range.md#Yêu cầu, "Làm gì") | Người xem nhập giá tối thiểu và/hoặc giá tối đa; danh sách chỉ hiện sản phẩm có giá trong khoảng | functional | 001-products-price-range | |
| REQ-02 (price-range.md#Yêu cầu, "Làm gì") | Bỏ trống một ô thì không giới hạn phía đó | functional | 001-products-price-range | |
| REQ-03 (price-range.md#Yêu cầu, "Làm gì") | Lọc giá dùng kết hợp được với tìm kiếm, sắp xếp, phân trang hiện có | functional | 001-products-price-range | |
| REQ-04 (price-range.md#Yêu cầu, "Ràng buộc") | `GET /products` nhận thêm `minPrice`, `maxPrice` | functional | 001-products-price-range | |
| BR-PROD-01 | Khoảng giá tính cả hai đầu | business rule | 001-products-price-range | |
| BR-PROD-02 | Một đầu bỏ trống thì không giới hạn phía đó | business rule | 001-products-price-range | |
| BR-PROD-03 | Giá trị lọc giá không âm; giá 0 hợp lệ | business rule | 001-products-price-range | |
| BR-PROD-04 | Giá trị lọc giá tối đa 2 chữ số thập phân (cột giá `numeric(10,2)`) | business rule | 001-products-price-range | |
| BR-PROD-05 | Giá tối thiểu > giá tối đa: UI chặn và báo "Giá tối thiểu không được lớn hơn giá tối đa"; backend trả 400 | business rule | 001-products-price-range | |
| BR-PROD-06 | Giá trị lọc không vượt quá 99999999.99 | business rule | 001-products-price-range | |
| BR-PROD-07 | Giá trị lọc không hợp lệ: UI chặn trước và báo lỗi cụ thể; backend trả 400 | business rule | 001-products-price-range | |
| price-range.md#Bối cảnh | Code hiện tại là nguồn sự thật cho hành vi đã có (Next.js + NestJS + Postgres) | NFR | đã có (NFR-033), không thuộc change nào | — |
| NFR-004 (quyết định người dùng, 2026-11-12) | Danh sách (kể cả khi lọc giá) phản hồi < 1 giây với dữ liệu seed hiện có | NFR | 001-products-price-range | |
| NFR-011 (quyết định người dùng, 2026-11-12) | Không kiểm tra quyền là chủ ý; lọc giá là thao tác đọc công khai; ngoại lệ đã biết so với constitution Principle II | NFR | đã có, không thuộc change nào; 001 không thêm kiểm tra quyền | — |
| NFR-042 (quyết định người dùng, 2026-11-12) | Chrome, Safari, Firefox bản mới trên máy tính | NFR | 001-products-price-range (phần UI lọc giá) | |
| price-range.md#Ngoài phạm vi | Lọc theo mức giảm giá | out of scope | out of scope | — |
| price-range.md#Ngoài phạm vi | Lưu bộ lọc giữa các lần truy cập | out of scope | out of scope | — |
| price-range.md#Ngoài phạm vi | Đơn vị tiền khác USD | out of scope | out of scope | — |
| quyết định người dùng, 2026-11-12 | Mâu thuẫn giá `≥ 0` (backend, create-product.dto.ts) / `> 0` (form tạo sản phẩm, frontend/src/utils/productForm.ts) | out of scope | out of scope | — |

## Unassigned

- _(không có)_
