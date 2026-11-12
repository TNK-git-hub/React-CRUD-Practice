# Lọc sản phẩm theo khoảng giá

## Bối cảnh
App quản lý sản phẩm đang chạy (Next.js + NestJS + Postgres). Code hiện tại là nguồn sự thật cho hành vi đã có.

## Yêu cầu
- **Ai:** người xem trang danh sách sản phẩm (app chưa có đăng nhập).
- **Làm gì:** nhập giá tối thiểu và/hoặc giá tối đa; danh sách chỉ hiện sản phẩm có giá nằm trong khoảng, tính cả hai đầu. Bỏ trống một ô thì không giới hạn phía đó. Dùng kết hợp được với tìm kiếm, sắp xếp, phân trang hiện có.
- **Vì sao:** danh sách dài, người xem muốn tìm theo ngân sách.
- **Ràng buộc:** `GET /products` nhận thêm `minPrice`, `maxPrice`; giá không âm; tối đa 2 chữ số thập phân (cột giá là numeric(10,2)).

## Ngoài phạm vi
Lọc theo mức giảm giá, lưu bộ lọc giữa các lần truy cập, đơn vị tiền khác USD (app hiện có dùng USD).