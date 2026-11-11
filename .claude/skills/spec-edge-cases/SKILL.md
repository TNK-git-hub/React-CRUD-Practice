---
name: spec-edge-cases
description: Bổ sung scenario edge case có ID (Given/When/Then, P1–P3, đường khôi phục) cho mọi requirement của change đang làm, bằng cách rà từng chiều trong specs/_system/edge-case-catalog.md đối chiếu states.md và rules.md; ghi vào spec.md của change và bảng đối chiếu checklists/edge-cases.md. Chạy sau /speckit-clarify, trước /speckit-checklist edge cases.
argument-hint: "[thư mục change, mặc định theo .specify/feature.json]"
license: Apache-2.0
metadata:
  derived-from: "pm-skills deliver-edge-cases 2.1.1 (Apache-2.0) — xem NOTICE.md"
---
<!-- Derived from PM-Skills deliver-edge-cases | https://github.com/product-on-purpose/pm-skills | Apache 2.0 | modified, see NOTICE.md -->

# spec-edge-cases

Happy path thường đã được viết rõ; lỗi thật thì hay nằm ở các trường hợp biên. Skill này rà **có hệ thống**
mọi requirement của change đang làm qua từng chiều của catalog dùng chung, rồi thêm scenario có ID vào
spec để test sau này mang đúng ID đó. Bạn KHÔNG viết code, KHÔNG sửa `specs/capabilities/` hay
`specs/_system/`, KHÔNG tạo file nào khác ngoài hai file ở mục Đầu ra.

## Đầu vào

```text
$ARGUMENTS
```

1. Thư mục change = `$ARGUMENTS` nếu có; ngược lại đọc `feature_directory` trong `.specify/feature.json`.
   Thư mục không nằm trong `specs/changes/`, hoặc không có `spec.md` → **DỪNG**, báo người dùng chạy
   `/speckit-specify` trước.
2. `spec.md` của change: frontmatter `kind: delta` (thiếu → DỪNG), `capabilities`, mọi requirement
   `ADDED` / `MODIFIED` (bỏ qua `REMOVED`, `RENAMED`), mục `### Edge Cases (chưa gắn requirement)`.
3. `specs/_system/edge-case-catalog.md`: các chiều 1–13, mức ưu tiên, loại scenario, mẫu bảng đối chiếu.
4. Với mỗi domain trong `capabilities`: `specs/capabilities/<domain>/states.md` và `rules.md`
   (không có file → ghi nhận, dùng N/A cho chiều cần file đó, kèm lý do "chưa có states.md").
5. `specs/_system/nfr.md` (ma trận quyền, chính sách xoá) và `glossary.md` nếu có.

## Cách làm

Làm lần lượt **từng requirement**, trong mỗi requirement đi qua **từng chiều** theo thứ tự catalog.
Bảy bước phân tích của skill gốc nằm trong các chiều như sau:

| Bước của skill gốc | Chiều catalog |
| --- | --- |
| 1. Xác định phạm vi feature | đọc requirement, Quyền, scenario happy |
| 2. Kiểm tra input | 1. Input, 3. Thiếu và rỗng |
| 3. Điều kiện biên | 2. Số và biên, 4. Tập hợp, 8. Thời gian, 10. Tài nguyên |
| 4. Trạng thái lỗi | 5. Trạng thái, 6. Quyền, 9. Phụ thuộc ngoài, 11. Dữ liệu và xoá |
| 5. Đồng thời | 7. Đồng thời và thứ tự |
| 6. Đường khôi phục | 12. Thông báo lỗi và đường khôi phục (bắt buộc trong mọi scenario lỗi) |
| 7. Ưu tiên theo khả năng xảy ra × tác động | P1–P3 theo bảng mức ưu tiên của catalog |

### Luật cho từng chiều

- Mỗi cặp requirement × chiều (1–11 và 13) cho ra **một trong hai**: một hoặc nhiều scenario mới, hoặc
  `N/A — <lý do một dòng>` gắn với requirement đó. Không bỏ trống; N/A phải có lý do cụ thể.
- Chiều 5: mỗi ô `✗` trong `states.md` mà requirement có thể chạm tới cần ít nhất một scenario;
  ô `= (no-op)` cần một scenario idempotent.
- Chiều 6: scenario bị từ chối ghi rõ "gọi thẳng backend" (constitution, nguyên tắc II); đối chiếu
  ma trận quyền trong `nfr.md`.
- Chiều 11: đối chiếu bảng chính sách xoá trong `nfr.md`; ô còn `[NEEDS CLARIFICATION]` → scenario vẫn
  viết, phần kết quả liên quan ghi `[NEEDS CLARIFICATION: chính sách xoá trong nfr.md]`.
- Chiều 13: mỗi luật trong `rules.md` mà requirement chạm tới → ít nhất một scenario; bảng quyết định →
  **mỗi dòng của bảng một scenario**. Cộng thêm các câu hỏi ở mục 13 của catalog.
- Mọi dòng đang có trong `### Edge Cases (chưa gắn requirement)` phải được chuyển thành scenario của
  requirement phù hợp (rồi xoá dòng đó), hoặc giữ lại kèm `[NEEDS CLARIFICATION: thuộc requirement nào?]`.
- Scenario đã có trong spec mà trùng nghĩa với scenario định thêm → không thêm; ghi ID cũ vào bảng đối chiếu.

### Không tự bịa

Con số, giới hạn, quyền và chính sách xoá **chỉ** lấy từ spec, `specs/_system/*` hoặc `capabilities/*`.
Không có → viết scenario với `[NEEDS CLARIFICATION: <câu hỏi>]` tại chỗ cần con số / quyền, không chọn số.
Câu chữ thông báo lỗi được đề xuất (đặt trong ngoặc kép), vì đó là chi tiết hiển thị, không phải luật.

## Đầu ra

### 1. Scenario trong `spec.md` của change

Thêm vào danh sách **Scenarios** của đúng requirement, ngay sau scenario cuối cùng đang có:

```markdown
  - `<MÃ>-<NNN>-S<n>` (<loại>) [P1|P2|P3] — **Given** … **When** … **Then** … → Khôi phục: …
```

- `<n>` tiếp nối số lớn nhất đang có của requirement đó, **liên tục, không nhảy số, không đánh lại**
  scenario cũ. Với `MODIFIED`, đánh tiếp sau các scenario đã chép từ capability.
- `<loại>` lấy từ danh sách "Loại scenario" của catalog; mức ưu tiên theo bảng P1–P3 của catalog.
- Scenario lỗi **bắt buộc** có thông báo người dùng thấy và `→ Khôi phục:` (chiều 12): làm gì tiếp,
  dữ liệu đã nhập có được giữ không, thử lại có tạo bản trùng không. Scenario không lỗi thì bỏ `→ Khôi phục`.
- Không sửa nội dung requirement, Quyền hay scenario đã có. Thấy requirement sai / mâu thuẫn với
  `rules.md`, `states.md` → không tự sửa; ghi vào báo cáo và vào cột Ghi chú của bảng đối chiếu.

### 2. Bảng đối chiếu `checklists/edge-cases.md`

Ghi đè toàn bộ file (tạo mới nếu chưa có) theo **mẫu bảng đối chiếu** ở cuối catalog:

```markdown
# Edge cases — <change>

**Catalog**: specs/_system/edge-case-catalog.md · **Ngày**: <YYYY-MM-DD>

| Requirement | Chiều | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| ABC-004 | 1. Input | S2, S3 | |
| ABC-004 | 2. Số và biên | N/A | không nhận input số |
...

## Tổng hợp

| Requirement | Scenario mới | P1 | P2 | P3 | N/A |
| --- | --- | --- | --- | --- | --- |

## Câu hỏi còn mở

- [NEEDS CLARIFICATION: …] — `<scenario ID>`
```

- Mỗi requirement × mỗi chiều 1–11 và 13 = **đúng một dòng** (12 dòng / requirement). Chiều 12 không có dòng
  riêng: kiểm tra trong từng scenario lỗi.
- Cột Kết quả: các scenario ID (dạng ngắn `S4`) kèm mức ưu tiên, hoặc `N/A`.

## Tự kiểm tra trước khi báo

- [ ] Mỗi requirement ADDED/MODIFIED có đủ 12 dòng trong bảng đối chiếu; không dòng nào trống; mọi N/A có lý do.
- [ ] Scenario ID liên tục trong từng requirement, không trùng, không đánh lại scenario cũ.
- [ ] Mọi scenario mới có loại và P1–P3; mọi scenario lỗi có thông báo và `→ Khôi phục`.
- [ ] Mọi ô ✗ có thể chạm tới trong `states.md` và mọi dòng bảng quyết định trong `rules.md` có scenario.
- [ ] Mục `### Edge Cases (chưa gắn requirement)` không còn dòng nào chưa xử lý.
- [ ] Không con số / giới hạn / quyền nào bịa ra; chỗ thiếu là `[NEEDS CLARIFICATION]`.
- [ ] Chỉ hai file bị sửa: `spec.md` và `checklists/edge-cases.md` của change.

Mục nào không đạt → sửa rồi kiểm lại.

## Báo cáo

1. Bảng Tổng hợp (scenario mới theo requirement và mức ưu tiên).
2. Toàn bộ `[NEEDS CLARIFICATION]` mới, đánh số, kèm scenario ID.
3. Chỗ requirement mâu thuẫn với `rules.md` / `states.md` (nếu có).
4. Bước tiếp theo: `/speckit-checklist edge cases`, rồi **dừng chờ người dùng duyệt spec**.
