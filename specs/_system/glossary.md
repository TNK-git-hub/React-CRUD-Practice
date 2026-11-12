# Glossary — React-CRUD-Practice (quản lý sản phẩm)

| Term | Definition | In code | Do not use | Source |
| --- | --- | --- | --- | --- |
| Sản phẩm | Một mặt hàng trong danh mục, có tên, mô tả, danh mục, thương hiệu, giá, tồn kho, ảnh, đánh giá, tag | `Product`, bảng `products` | — | backend/src/products/product.entity.ts |
| Giá | Giá bán hiện tại của sản phẩm, là số hiển thị nổi bật trên thẻ sản phẩm; đơn vị USD (UI hiển thị `$`); kiểu `numeric(10,2)` | `price` | "giá gốc" (dễ nhầm với Giá trước giảm) | docs/requirements/price-range.md#Yêu cầu, #Ngoài phạm vi; backend/src/products/product.entity.ts; frontend/src/comopnents/ProductListPageCom/ProductCard.tsx |
| Phần trăm giảm giá | Mức giảm (0–100) gắn với sản phẩm | `discountPercentage` | — | backend/src/products/dto/create-product.dto.ts |
| Giá trước giảm | Giá gạch ngang trên UI, frontend tự tính `price / (1 − discountPercentage/100)`; không lưu trong DB | `getPreviousPrice` | — | frontend/src/utils/getPreviousPrice.ts |
| Khoảng giá | Cặp giá tối thiểu và/hoặc giá tối đa (USD) người xem nhập để lọc danh sách; tính cả hai đầu; mỗi đầu từ 0 đến 99999999.99 và giá tối thiểu ≤ giá tối đa (xem `capabilities/products/rules.md`) | `minPrice`, `maxPrice` | — | docs/requirements/price-range.md#Yêu cầu |
| Giá tối thiểu | Đầu dưới của khoảng giá; bỏ trống = không giới hạn phía dưới | `minPrice` | — | docs/requirements/price-range.md#Yêu cầu |
| Giá tối đa | Đầu trên của khoảng giá; bỏ trống = không giới hạn phía trên | `maxPrice` | — | docs/requirements/price-range.md#Yêu cầu |
| Danh sách sản phẩm | Trang `/` (thành `/products/search` khi có từ khoá), gọi `GET /products`; trạng thái lọc/trang nằm trên URL | `ProductList`, `GET /products` | — | frontend/src/views/ProductList.tsx; backend/src/products/products.controller.ts |
| Tìm kiếm | Từ khoá `q`, khớp một phần, không phân biệt hoa thường, theo `title` hoặc `description` | `q` | — | backend/src/products/products.service.ts |
| Sắp xếp | Theo `title`, `price`, `rating` hoặc `stock`, chiều `asc`/`desc`; trùng giá trị thì xếp tiếp theo `id` tăng dần. UI mặc định `title asc`; backend không có `sortBy` thì xếp theo `id` | `sortBy`, `order` | — | backend/src/products/dto/query-product.dto.ts; backend/src/products/products.service.ts; frontend/src/views/ProductList.tsx |
| Phân trang | Backend nhận `limit` (1–100) và `skip` (≥ 0), trả `total`; UI hiển thị 10 sản phẩm/trang, số trang trên URL là `page` | `limit`, `skip`, `total`, `page` | — | backend/src/products/dto/query-product.dto.ts; frontend/src/views/ProductList.tsx |
| Ảnh sản phẩm | Một URL ảnh của sản phẩm, có thứ tự | `ProductImage`, bảng `product_images` | — | backend/src/products/product-image.entity.ts |
| Ảnh đại diện | Ảnh hiển thị trên thẻ; không gửi thì lấy ảnh đầu tiên | `thumbnail` | — | backend/src/products/products.service.ts |
| Đánh giá | Một nhận xét có điểm của người mua cho sản phẩm | `Review`, bảng `reviews` | — | backend/src/products/review.entity.ts |
| Tag | Nhãn gắn cho sản phẩm; mỗi tên lưu một lần, dùng chung giữa các sản phẩm | `Tag`, bảng `tags`, `product_tags` | — | backend/src/products/tag.entity.ts |
| SKU | Mã hàng do người nhập đặt, không bắt buộc, duy nhất | `sku` | — | backend/src/products/product.entity.ts |
| Barcode | 13 chữ số ngẫu nhiên, hệ thống tự sinh khi tạo, duy nhất | `barcode` | — | backend/src/products/products.service.ts |
| Tồn kho | Số lượng còn, số nguyên ≥ 0 | `stock` | — | backend/src/products/dto/create-product.dto.ts |
| Trạng thái hàng | Chuỗi tự do mô tả tình trạng hàng (không phải vòng đời) | `availabilityStatus` | — | backend/src/products/product.entity.ts |

## Roles

| Role | Description | In code |
| --- | --- | --- |
| Người xem | Người dùng trang danh sách sản phẩm; app chưa có đăng nhập nên mọi người dùng đều ẩn danh | — (không có khái niệm người dùng / vai trò trong code) |

## Open questions

- _(không có)_ — đơn vị tiền đã chốt là USD (người dùng trả lời, 2026-11-12).
