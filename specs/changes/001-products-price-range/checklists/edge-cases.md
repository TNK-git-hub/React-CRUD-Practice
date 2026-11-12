# Edge cases — 001-products-price-range

**Catalog**: specs/_system/edge-case-catalog.md · **Date**: 2026-11-12

| Requirement | Dimension | Result | Notes |
| --- | --- | --- | --- |
| PROD-001 | 1. Input | S5 [P3] | bỏ khoảng trắng đầu/cuối; dấu phẩy, chữ, chuỗi tấn công thuộc PROD-003 (S4, S5) |
| PROD-001 | 2. Numbers and boundaries | S6 [P2], S7 [P1]; S1 (có sẵn) | S1 đã kiểm hai đầu tính cả biên; S7 bẫy so sánh số thập phân (catalog 13) |
| PROD-001 | 3. Missing and empty | S2, S3, S4 (có sẵn) | bỏ trống một đầu / cả hai đầu |
| PROD-001 | 4. Collections | PROD-002-S4 (có sẵn) | kết quả rỗng thuộc PROD-002 |
| PROD-001 | 5. Existence and state | N/A | lọc chỉ đọc, không kích hoạt create / edit / delete trong states.md; sản phẩm bị sửa / xoá khi đang xem ở chiều 7 và 11 |
| PROD-001 | 6. Permissions | S8 [P2] | không vai trò nào bị từ chối (NFR-011, ngoại lệ đã biết Principle II); S8 gọi thẳng máy chủ không kèm danh tính |
| PROD-001 | 7. Concurrency and ordering | S9 [P2], S10 [P2] | sửa giá khi đang xem; hai lần Search liền nhau, kết quả về không theo thứ tự |
| PROD-001 | 8. Time | N/A | không có ngày giờ, hạn hay lịch |
| PROD-001 | 9. External dependencies | S11 [P2], S12 [P3] | Redis tắt (fail-open, NFR-031); máy chủ lỗi → trạng thái lỗi có sẵn |
| PROD-001 | 10. Resource limits | N/A | chỉ hai số, không upload hay payload lớn; nfr.md không có giới hạn tần suất; chuỗi rất dài thuộc PROD-003 (S13) |
| PROD-001 | 11. Data and deletion | S13 [P2] | xoá cứng theo nfr.md → sản phẩm biến mất khỏi kết quả, tổng giảm |
| PROD-001 | 13. Domain-specific | S7 [P1], S14 [P1], S15 [P3]; S1–S4 (có sẵn) | BR-PROD-01 → S1, S6, S7; bảng BR-PROD-02: yes/yes → S1 (min > max → PROD-003-S2), yes/no → S2, no/yes → S3, no/no → S4; catalog 13: khoá cache → S14, số thập phân → S7, USD → S15, tổng / số trang → PROD-002 |
| PROD-002 | 1. Input | S6 [P2], S13 [P2] | địa chỉ trang có giá sai (sửa tay / link cũ) → bỏ qua, để trống ô; cặp min > max trên địa chỉ → bỏ qua cả hai (S13, thêm 2026-11-12) |
| PROD-002 | 2. Numbers and boundaries | S7 [P3]; S2 (có sẵn) | đúng một trang (10) và hơn một trang (15) |
| PROD-002 | 3. Missing and empty | N/A | tổ hợp bỏ trống đã có ở PROD-001-S2–S4; từ khoá trống là hành vi tìm kiếm đã có (brownfield) |
| PROD-002 | 4. Collections | S8 [P2], S9 [P2], S10 [P2]; S4, S5 (có sẵn) | trang vượt số trang (trạng thái rỗng như hiện nay, ProductList.tsx:109, :150); sắp xếp ổn định khi trùng giá; đổi bộ lọc về trang 1 |
| PROD-002 | 5. Existence and state | N/A | lọc chỉ đọc, không kích hoạt sự kiện nào trong states.md |
| PROD-002 | 6. Permissions | PROD-001-S8 (có sẵn) | cùng ngoại lệ NFR-011; không có vai trò bị từ chối |
| PROD-002 | 7. Concurrency and ordering | S11 [P2] | đã gõ khoảng giá nhưng chưa bấm Search rồi đổi sắp xếp / trang |
| PROD-002 | 8. Time | N/A | không có ngày giờ, hạn hay lịch |
| PROD-002 | 9. External dependencies | PROD-001-S11, PROD-001-S12 (có sẵn) | cùng đường gọi danh sách |
| PROD-002 | 10. Resource limits | N/A | số sản phẩm mỗi trang cố định 10 trên giao diện (glossary); không có upload hay payload lớn |
| PROD-002 | 11. Data and deletion | S12 [P2] | xoá sản phẩm cuối của trang khi đang lọc: phải giữ khoảng giá. Lưu ý cho plan: `updateParams` trong frontend/src/views/ProductList.tsx chỉ giữ `q`, `page`, `sortBy`, `order` |
| PROD-002 | 13. Domain-specific | S2, S7 (tổng / số trang theo bộ lọc — catalog 13); S8 | BR-PROD-02 đã phủ ở PROD-001; khoá cache → PROD-001-S14 |
| PROD-003 | 1. Input | S4 [P2], S5 [P2], S6 [P2] | dấu phẩy; chữ / chuỗi tấn công; "1.000" → lỗi thập phân, "1e3" → không phải số |
| PROD-003 | 2. Numbers and boundaries | S7 [P2], S8 [P2], S9 [P2], S10 [P1]; S1 (có sẵn) | âm / 0; 2 vs 3 chữ số thập phân; 99999999.99 vs 100000000; gọi thẳng máy chủ |
| PROD-003 | 3. Missing and empty | S11 [P3], S12 [P3] | tham số có mặt nhưng rỗng → không giới hạn; hai ô cùng sai |
| PROD-003 | 4. Collections | N/A | kiểm tra giá trị không tạo hay trả danh sách |
| PROD-003 | 5. Existence and state | N/A | không tác động lên sản phẩm nào trong states.md |
| PROD-003 | 6. Permissions | N/A | không có quyền để từ chối (NFR-011); gọi thẳng máy chủ đã ở S3, S10 |
| PROD-003 | 7. Concurrency and ordering | N/A | giá trị sai không được gửi đi; thao tác chỉ đọc nên không có ghi trùng |
| PROD-003 | 8. Time | N/A | không có ngày giờ, hạn hay lịch |
| PROD-003 | 9. External dependencies | N/A | kiểm tra trên giao diện không gọi máy chủ; lỗi máy chủ thuộc PROD-001-S12 |
| PROD-003 | 10. Resource limits | S13 [P3] | chuỗi số rất dài (100 chữ số là dữ liệu ví dụ, không phải giới hạn) |
| PROD-003 | 11. Data and deletion | N/A | không xoá hay sửa dữ liệu |
| PROD-003 | 13. Domain-specific | S2, S3 (có sẵn); S7, S8, S9, S10 | BR-PROD-03 → S1, S7; BR-PROD-04 → S8; BR-PROD-05 → S2, S3; BR-PROD-06 → S1, S9; BR-PROD-07 → S4, S5, S10 |

## Summary

| Requirement | New scenarios | P1 | P2 | P3 | N/A |
| --- | --- | --- | --- | --- | --- |
| PROD-001 | 11 (S5–S15) | 2 | 6 | 3 | 3 |
| PROD-002 | 8 (S6–S13) | 0 | 7 | 1 | 4 |
| PROD-003 | 10 (S4–S13) | 1 | 6 | 3 | 7 |
| **Total** | **29** | **3** | **19** | **7** | **14** |

## Open questions

- _(không còn)_ — 5 câu đã được người dùng trả lời ngày 2026-11-12, ghi trong mục Clarifications của spec.md.
