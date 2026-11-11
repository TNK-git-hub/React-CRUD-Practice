# Edge Case Catalog

Danh mục **các chiều** cần rà khi viết scenario cho một requirement. Dùng chung cho mọi app.
Agent chỉ ĐỌC file này; người (bạn/team) bổ sung khi retro phát hiện loại lỗi mới.

Nguồn tham khảo đã gộp: `edge-case-discovery` (openagentskills, MIT), `edge-case-coverage`
(skillstack, MIT), `deliver-edge-cases` (pm-skills, Apache-2.0).

## Cách dùng

1. Với **mỗi requirement** trong spec delta, đi qua **từng chiều** dưới đây theo thứ tự.
2. Mỗi chiều cho ra **một trong hai**:
   - một hoặc nhiều scenario `<MÃ>-<NNN>-S<n>` (Given / When / Then), kèm loại và mức ưu tiên; hoặc
   - `N/A — <lý do một dòng>` (vd "requirement không nhận input số").
3. Chiều nào cũng phải có kết quả. Không bỏ trống, không ghi "N/A" mà thiếu lý do.
4. Scenario lỗi phải có **thông báo người dùng thấy** và **đường khôi phục** (chiều 12).
5. Đối chiếu `capabilities/<domain>/states.md` và `rules.md` cho chiều 5 và 13.
6. Không tự bịa giới hạn hay con số: nếu requirement không nói giới hạn là bao nhiêu,
   ghi scenario với `[NEEDS CLARIFICATION: giới hạn tối đa?]` thay vì chọn đại một số.

### Mức ưu tiên

| Mức | Khi nào |
| --- | --- |
| **P1** | Mất hoặc sai dữ liệu, lộ dữ liệu / vượt quyền, crash, sai tiền |
| **P2** | Hành vi sai nhưng không mất dữ liệu; trải nghiệm kém rõ rệt |
| **P3** | Hiếm gặp, ảnh hưởng nhỏ; chỉ cần xử lý "êm" (không crash, có thông báo) |

### Loại scenario (ghi trong ngoặc sau ID)

`happy` · `input` · `biên` · `thiếu` · `tập hợp` · `trạng thái` · `quyền` · `đồng thời` ·
`thời gian` · `phụ thuộc` · `tài nguyên` · `dữ liệu` · `domain`

Ví dụ: `ABC-004-S3 (biên) [P1] — Given … When … Then … → Khôi phục: …`

---

## 1. Input và định dạng chuỗi

**Áp dụng khi:** requirement nhận chữ do người dùng nhập (tên, mô tả, email, tìm kiếm…).

- Rỗng `""`? Chỉ có khoảng trắng / xuống dòng?
- Vượt độ dài tối đa? Đúng bằng độ dài tối đa?
- Tiếng Việt có dấu, emoji, ký tự đặc biệt, chữ viết từ phải sang trái?
- Sai định dạng (email, số điện thoại, ngày, mã)?
- Chuỗi trông giống mã độc (`<script>`, `' OR 1=1 --`) — hệ thống có coi đó là chữ thường không?
- Chuỗi trông giống kiểu khác (`"null"`, `"true"`, `"123"`)?
- Khoảng trắng đầu/cuối: cắt bỏ hay giữ? Hai giá trị chỉ khác hoa/thường có bị coi là trùng không?

## 2. Số và giá trị biên

**Áp dụng khi:** có số lượng, giá tiền, tuổi, thời lượng, số trang, giới hạn.

- 0? Số âm?
- min − 1, min, max, max + 1 (phân tích giá trị biên)?
- Số thập phân khi chỉ chấp nhận số nguyên? Làm tròn tiền thế nào?
- Số rất lớn (tràn, chậm)? Với số thực: NaN, vô cực?

## 3. Thiếu và rỗng

**Áp dụng khi:** có form, request body, tham số tuỳ chọn.

- Thiếu trường bắt buộc? Trường có mặt nhưng là `null`?
- Trường tuỳ chọn bị bỏ qua → giá trị mặc định là gì?
- Có trường thừa không mong đợi → bỏ qua hay báo lỗi?
- Object chỉ điền một phần?

## 4. Tập hợp, danh sách và phân trang

**Áp dụng khi:** hiển thị danh sách, chọn nhiều, import, tìm kiếm, lọc.

- 0 phần tử (trạng thái rỗng hiển thị gì)? 1 phần tử? Rất nhiều?
- Đúng bằng ngưỡng một trang; vượt ngưỡng một phần tử?
- Phần tử trùng lặp?
- Lọc / tìm không ra kết quả?
- Sắp xếp khi nhiều phần tử có cùng giá trị — thứ tự có ổn định không?
- Chọn nhiều mà một phần tử không hợp lệ → làm cả lô hay một phần?

## 5. Tồn tại và trạng thái

**Áp dụng khi:** thao tác trên một đối tượng có vòng đời. Đối chiếu `states.md`.

- Đối tượng không tồn tại (ID sai)?
- Đối tượng đã bị xoá (theo chính sách xoá trong `nfr.md`)?
- Thao tác không hợp lệ với trạng thái hiện tại (mọi ô ✗ trong `states.md` cần ít nhất một scenario)?
- Tạo trùng giá trị phải là duy nhất?
- Làm lại cùng thao tác lần hai — kết quả có giống lần một không (idempotent)?

## 6. Quyền và danh tính

**Áp dụng khi:** requirement có ràng buộc ai được làm gì (gần như mọi requirement ghi dữ liệu).

- Chưa đăng nhập? Phiên / token hết hạn?
- Đúng người nhưng sai vai trò?
- Truy cập tài nguyên của người khác bằng cách đổi ID trong request?
- Client tự khai vai trò / user ID trong body — backend có bỏ qua không?
- Quyền bị thu hồi khi đang thao tác dở?
- Scenario bị từ chối phải được test **gọi thẳng backend** (constitution, nguyên tắc II).

## 7. Đồng thời và thứ tự

**Áp dụng khi:** nhiều người cùng sửa một dữ liệu, có nút gửi, có xử lý nền.

- Hai người sửa cùng lúc — người lưu sau có ghi đè mất dữ liệu của người trước không?
- Bấm nút gửi hai lần nhanh?
- Một người xoá trong khi người khác đang sửa?
- Sự kiện / request đến sai thứ tự?
- Thử lại sau timeout tạo ra bản ghi trùng?

## 8. Thời gian

**Áp dụng khi:** có ngày giờ, hạn chót, lịch, hết hạn, thống kê theo kỳ.

- Múi giờ: lưu và hiển thị theo giờ nào (Asia/Saigon hay UTC)?
- Ranh giới ngày / tháng / năm (23:59 → 00:00, cuối tháng, năm nhuận)?
- Hết hạn đúng thời điểm biên: trước 1 giây, đúng giây, sau 1 giây?
- Đồng hồ máy người dùng sai?

## 9. Phụ thuộc ngoài và hạ tầng

**Áp dụng khi:** gọi dịch vụ ngoài, gửi email, thanh toán, ghi nhiều bảng.

- Dịch vụ ngoài lỗi / timeout / trả dữ liệu sai dạng?
- Cơ sở dữ liệu lỗi hoặc vi phạm ràng buộc?
- Thất bại giữa chừng: một phần đã ghi, một phần chưa → có rollback không?
- Mạng chập chờn khi đang gửi?

## 10. Giới hạn tài nguyên

**Áp dụng khi:** upload file, payload lớn, thao tác hàng loạt, API công khai.

- File quá lớn? Sai loại? File rỗng?
- Request quá lớn? Quá nhiều request (rate limit)?
- Vượt hạn mức (quota) của người dùng?

## 11. Dữ liệu và xoá

**Áp dụng khi:** có thao tác xoá, sửa dữ liệu có liên kết. Đối chiếu chính sách xoá trong `nfr.md`.

- Xoá xong, dữ liệu còn xuất hiện ở đâu (danh sách, tìm kiếm, báo cáo, dữ liệu liên quan)?
- Khôi phục được không? Ai được khôi phục?
- Xoá đối tượng cha khi còn đối tượng con tham chiếu?
- Sửa một giá trị mà dữ liệu khác đang dựa vào (vd đổi giá khi đã có hoá đơn)?

## 12. Thông báo lỗi và đường khôi phục

**Áp dụng cho:** mọi scenario lỗi ở các chiều trên (đây là phần bắt buộc kèm theo, không phải chiều riêng để N/A).

- Người dùng thấy thông báo gì? Có nói rõ phải làm gì tiếp không?
- Dữ liệu đã nhập có được giữ lại để sửa không?
- Thử lại được không? Có tạo bản trùng không?
- Lỗi có được ghi log để điều tra không (không lộ thông tin nhạy cảm trong thông báo)?

## 13. Domain riêng

Bẫy nghiệp vụ của từng app. Để trống ở harness; `/spec-bootstrap` hoặc retro của từng app bổ sung
vào đây (trên branch của app), mỗi dòng một câu hỏi.

- _(chưa có)_

---

## Mẫu bảng đối chiếu (`checklists/edge-cases.md`)

```markdown
# Edge cases — <change>

| Requirement | Chiều | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| ABC-004 | 1. Input | S2, S3 | |
| ABC-004 | 2. Số và biên | N/A | không nhận input số |
| ABC-004 | 6. Quyền | S4 [P1] | test gọi thẳng backend |
| ABC-004 | 13. Domain riêng | N/A | chưa có mục nào áp dụng |
```

Mỗi requirement × mỗi chiều 1–11 và 13 = một dòng. Chiều 12 kiểm tra trong từng scenario lỗi.
