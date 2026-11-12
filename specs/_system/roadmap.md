# Change roadmap — React-CRUD-Practice (quản lý sản phẩm)

| Change | Goal (what the user sees) | Domain | Source | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001-products-price-range | Người xem nhập giá tối thiểu và/hoặc giá tối đa; danh sách chỉ còn sản phẩm có giá trong khoảng (tính cả hai đầu), dùng kết hợp được với tìm kiếm, sắp xếp, phân trang | products | REQ-01–REQ-04; BR-PROD-01–BR-PROD-07; NFR-004, NFR-042 | — | planned |

## Ordering notes

- Brownfield: app đang chạy, nên không có walking skeleton; roadmap chỉ gồm thay đổi mới, hành vi đã có không được spec lại.
- Repo chưa có framework test lẫn workflow CI (không có file test, không có `.github/workflows/`). Constitution (Principle I, IV) bắt buộc mỗi scenario có test và type checking chạy trong CI, nên `plan.md` của 001 phải thêm test runner và CI cho phần nó đụng tới, dùng stack đã có (NFR-033), không chọn stack mới.
- Spec của 001 ghi vào `Out of Scope`: mâu thuẫn giá `≥ 0` (backend) / `> 0` (form tạo sản phẩm) không sửa trong change này.
- Lọc giá là thao tác đọc công khai, không kiểm tra quyền — ngoại lệ đã biết so với constitution Principle II (nfr.md, NFR-011).
- Bộ lọc giá mới phải nằm trong khoá cache danh sách (NFR-001) và query key của TanStack Query (frontend/src/api/queryKeys.ts), nếu không sẽ trả kết quả của bộ lọc khác.

## Open questions

- _(không có)_
