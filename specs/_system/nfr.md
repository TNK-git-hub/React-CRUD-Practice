# Non-functional requirements — React-CRUD-Practice (quản lý sản phẩm)

Brownfield: các mục có nguồn là đường dẫn file ghi lại hành vi hiện có của code, không phải mục tiêu mới.
Tài liệu yêu cầu (docs/requirements/price-range.md) không nêu NFR có số đo; các mục có nguồn
"quyết định người dùng" là câu trả lời khi bootstrap.

## Performance

| ID | Requirement | Number | Source |
| --- | --- | --- | --- |
| NFR-001 | Kết quả `GET /products` được cache trong Redis theo từng bộ tham số truy vấn (`q`, `limit`, `skip`, `sortBy`, `order`); tạo / sửa / xoá sản phẩm làm mọi cache danh sách cũ hết hiệu lực | sống tối đa 30 giây | backend/src/products/products.service.ts |
| NFR-002 | Kết quả `GET /products/:id` được cache trong Redis; sửa / xoá sản phẩm xoá cache đó | sống tối đa 60 giây | backend/src/products/products.service.ts |
| NFR-003 | Số sản phẩm tối đa trong một lần gọi `GET /products` | `limit` 1–100; UI dùng 10 | backend/src/products/dto/query-product.dto.ts; frontend/src/views/ProductList.tsx |
| NFR-004 | Danh sách sản phẩm phản hồi (kể cả khi có lọc khoảng giá) | < 1 giây với dữ liệu seed hiện có (backend/src/seed.ts) | quyết định người dùng, 2026-11-12 |

## Security and permissions

| ID | Requirement | Source |
| --- | --- | --- |
| NFR-010 | Every permission check happens in the backend (constitution, Principle II) | constitution |
| NFR-011 | App chưa có đăng nhập; không endpoint nào kiểm tra danh tính hay quyền. Đây là chủ ý (app luyện tập) và là **ngoại lệ đã biết so với constitution, Principle II**: chưa có danh tính nên không có quyền nào để kiểm tra ở backend | docs/requirements/price-range.md#Yêu cầu; backend/src/products/products.controller.ts; quyết định người dùng, 2026-11-12 |
| NFR-012 | Dữ liệu vào được kiểm tra bằng `ValidationPipe` (`whitelist: true`, `transform: true`): sai kiểu / ngoài khoảng → 400; trường hoặc tham số không khai báo bị bỏ qua lặng lẽ, không báo lỗi | backend/src/main.ts |
| NFR-013 | CORS chỉ cho phép origin trong biến môi trường `FRONTEND_URL` | backend/src/main.ts |

### Permission matrix

Theo code hiện có; app không có đăng nhập nên chỉ có một vai trò. Không kiểm tra quyền là chủ ý — ngoại lệ
đã biết so với constitution Principle II (NFR-011).

| Action \ Role | Người xem |
| --- | --- |
| Xem danh sách, tìm kiếm, sắp xếp, phân trang | ✓ |
| Lọc danh sách theo khoảng giá | ✓ — thao tác đọc công khai (docs/requirements/price-range.md#Yêu cầu) |
| Xem chi tiết sản phẩm | ✓ |
| Tạo / sửa / xoá sản phẩm, upload ảnh | ✓ — chủ ý, không kiểm tra quyền (ngoại lệ đã biết, NFR-011) |

## Data and deletion policy (mandatory)

Hành vi hiện có: `DELETE /products/:id` xoá cứng sản phẩm; DB cascade xoá ảnh, đánh giá và liên kết tag.

| Data type | Soft / hard delete | Keep deleted data for | Who may restore | Source |
| --- | --- | --- | --- | --- |
| Sản phẩm (`products`) | Xoá cứng | Không giữ: dòng bị xoá ngay khỏi Postgres; cache chi tiết bị xoá và cache danh sách hết hiệu lực ngay sau đó | Không ai (không có chức năng khôi phục) | backend/src/products/products.service.ts |
| Ảnh sản phẩm (`product_images`) | Xoá cứng, cascade theo sản phẩm | Không giữ | Không ai | backend/src/products/products.service.ts; backend/src/products/product-image.entity.ts |
| Đánh giá (`reviews`) | Xoá cứng, cascade theo sản phẩm | Không giữ | Không ai | backend/src/products/products.service.ts; backend/src/products/review.entity.ts |
| Liên kết tag (`product_tags`) | Xoá cứng, cascade theo sản phẩm; bản ghi `tags` giữ nguyên | Không giữ | Không ai | backend/src/products/products.service.ts; backend/src/products/product.entity.ts |

Không có sao lưu (NFR-034), nên ngoài Postgres không còn bản nào của dữ liệu đã xoá.

**Hiện trạng đã biết** (hành vi hiện có, ghi lại; không sửa trong roadmap hiện tại):

- **File ảnh mồ côi:** xoá sản phẩm (hoặc thay danh sách ảnh khi sửa) chỉ xoá dòng URL trong `product_images`;
  file trong `backend/uploads/` vẫn nằm lại trên volume `uploads` và vẫn truy cập được qua `/uploads/<tên file>` —
  backend/src/products/products.service.ts, backend/src/uploads/uploads.controller.ts, backend/src/main.ts.
- **`isDeleted` gây hiểu nhầm:** response của `DELETE /products/:id` có `isDeleted: true` và `deletedOn` (giữ dạng
  dummyjson), trông như xoá mềm, nhưng bản ghi đã bị xoá cứng và không khôi phục được —
  backend/src/products/products.service.ts.
- **Hoàn tác chỉ là trình duyệt chờ:** nút "hoàn tác" trên UI chỉ là trình duyệt chờ 5 giây trước khi gửi `DELETE`;
  đóng tab trong lúc chờ thì request không được gửi, còn đã gửi thì không khôi phục được —
  frontend/src/hooks/useProductMutations.ts.

## Availability and operations

| ID | Requirement | Number | Source |
| --- | --- | --- | --- |
| NFR-030 | Triển khai bằng Docker Compose (Postgres 16, Redis 8, backend, frontend, nginx) trên EC2 tạo bằng Terraform | — | docker-compose.prod.yml; infra/ |
| NFR-031 | Redis không lưu xuống đĩa; Redis lỗi / tắt thì cache "fail-open", mọi đọc đi thẳng Postgres | — | docker-compose.prod.yml; backend/src/redis/cache.service.ts |
| NFR-032 | Ảnh upload lưu trên volume `uploads`, giữ qua rebuild container | — | docker-compose.prod.yml |
| NFR-033 | Stack hiện có (ghi lại, không chọn mới): frontend Next.js 16 + React 19 + TanStack Query 5 + Tailwind 4; backend NestJS 12 + TypeORM + Postgres; Redis; TypeScript `strict: true` ở cả hai; pnpm workspace | — | frontend/package.json; backend/package.json; frontend/tsconfig.json; backend/tsconfig.json; pnpm-workspace.yaml |
| NFR-034 | Uptime, sao lưu Postgres | Không yêu cầu uptime; không yêu cầu sao lưu | quyết định người dùng, 2026-11-12 |

## User environment

| ID | Requirement | Source |
| --- | --- | --- |
| NFR-040 | Giao diện tiếng Việt; có bố cục riêng cho màn hình hẹp (breakpoint `xs`) | frontend/src/views/ProductList.tsx |
| NFR-041 | Đơn vị tiền: USD (UI hiển thị `$`); đơn vị khác nằm ngoài phạm vi | docs/requirements/price-range.md#Ngoài phạm vi; frontend/src/comopnents/ProductListPageCom/ProductCard.tsx; quyết định người dùng, 2026-11-12 |
| NFR-042 | Trình duyệt được hỗ trợ: Chrome, Safari, Firefox bản mới trên máy tính | quyết định người dùng, 2026-11-12 |
| NFR-043 | Upload ảnh: chỉ PNG, JPG, WEBP; tối đa 2 MB/file | backend/src/uploads/uploads.controller.ts |

## Open questions

- _(không có)_
