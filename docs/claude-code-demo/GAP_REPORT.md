# GAP REPORT: Singpass Myinfo auto verify demo (2026-11-18)

Đối chiếu code hiện có (commit `37188c5`, nhánh `singpass-2`) với "Luồng bắt buộc" của prompt giao việc.
Quyết định cuối nằm trong `docs/requirements/decisions.md`; các câu Q1–Q9 bên dưới đã được chốt và ghi vào đó
(D-01, D-04, D-13, D-16, D-19, D-23, D-24, D-33 … D-43).

> Ghi chú: bản GAP_REPORT đầu tiên (nơi đặt ra Q1–Q9) không được lưu trong repo. File này được dựng lại từ code và
> từ câu trả lời đã chốt; nội dung Q9 được người dùng xác nhận lại ngày 2026-11-18.

## 1. Hiện trạng tóm tắt

- Backend: Node `http` thuần (`server/index.ts`), lưu JSON file (`data/db.json`), SSE realtime, Nodemailer.
- Frontend: SPA vanilla JS (`public/app.js`) cho Dealer, Ops, màn khách trên điện thoại và Demo Control.
- Gateway: interface `MyinfoGateway` (GetToken / GetLinkId / getPerson) với 2 bản cài: `MockGateway` (màn Singpass giả
  lập trong app) và `MockPassGateway` (MockPass Myinfo v3, OAuth). Mặc định đang là MockPass.
- Luồng hiện tại là **đồng bộ**: khách bấm Submit → backend gọi `getPerson` ngay → gắn kết quả. Không có job polling,
  không có QUEUED, không có SMS, không có audit, không có giới hạn resend, không có clock inject.
- Test: `tests/rules.test.ts` (10 test, xanh) theo mô hình cũ; `tests/mockpass.test.ts` đỏ vì thiếu `node_modules`.
  Không có lint; `npm run typecheck` cần `npm install`.

## 2. Bảng yêu cầu

| # | Yêu cầu | Trạng thái | File liên quan / ghi chú |
|---|---|---|---|
| 1 | Nộp hồ sơ, 1 link/party, huỷ link trước (REPLACED), tối đa 1 link hoạt động | Partial | `store.ts` `createApplication`, `resend`: có 1 link/party và Superseded; chưa có trạng thái QUEUED/SENT/OPENED/REPLACED |
| 2 | Gửi email + SMS (outbox xem được), hạn 72 h tính từ lúc gửi | Partial | `mail.ts`, outbox chỉ có email; hạn tính từ lúc tạo link; chưa có SMS |
| 3 | Gateway hỏng: nộp vẫn thành công, QUEUED, tự gửi lại, không gửi trùng | Missing | gateway chỉ được gọi khi khách bấm Retrieve (D-24 cũ) |
| 4 | `/verify/<portalToken>` ≥128 bit, kiểm tra link hiện hành + còn hạn, OPENED, chuyển gateway kèm LinkId | Partial | `/v/{token}` (144 bit) + `checkLink`; chưa có OPENED, chưa redirect sang gateway |
| 5 | Gateway giả lập: Retrieve → login persona → consent → I agree/từ chối → review → done, nhãn SIMULATED, không redirect | Partial | màn có trong `app.js` (screen 5–8) nhưng chạy như một phần của AutoFinance, không phải hệ thống riêng |
| 6 | Polling job nền, chu kỳ cấu hình được | Missing | — |
| 7 | Kiểm tra link hiện hành + so NRIC; MISMATCH giữ riêng; dữ liệu trên link cũ chỉ ghi sự kiện; FULFILLED mã hoá | Partial | `store.attachResult`: có so NRIC, mã hoá AES-GCM, ghi chú lỗi; nhưng chạy đồng bộ và đánh dấu link cũ "Rejected" (đổi trạng thái) |
| 8 | Nút Ops "Retrieve MyInfo" dùng chung logic job | Missing | nút có trên UI nhưng `disabled` |
| 9 | Danh sách link hết hạn; resend có lý do, 3 lần/24 h trượt, Ops + dealer đã nộp, không resend khi FULFILLED | Partial | resend chỉ Ops, không lý do, không giới hạn; không có danh sách link hết hạn |
| 10 | Quá 72 h → EXPIRED | Done (tính động) | `linkStatus`; cần chuyển thành trạng thái lưu + audit qua job |
| 11 | Khách từ chối: hệ thống không phân biệt, link giữ nguyên tới hết hạn | Missing (đang làm ngược) | hiện có trạng thái `Declined` |
| 12 | IPA bất cứ lúc nào; AA khoá ở server, trả danh sách party còn thiếu | Partial | `issueAa` khoá ở server, trả chuỗi lỗi; chưa trả danh sách có cấu trúc, IPA chỉ ở stage Submitted |
| — | Adapter `issueLink` / `fetchPerson` / `GatewayUnavailable`; ValueMax adapter stub | Partial | interface khác (`getToken`/`getLinkId`/`getPerson`) |
| — | Gateway giả lập nhận consent trên LinkId cũ | Missing | `/api/v/:token/login` từ chối link không hợp lệ |
| — | Clock inject; hạn link, chu kỳ poll, giới hạn resend cấu hình được; không dò môi trường test | Missing | `Date.now()` rải rác trong `index.ts` |
| — | Job idempotent, an toàn khi chạy chồng | Missing | — |
| — | NRIC che trong danh sách, xem đầy đủ phải bấm + audit; log không có NRIC/person | Missing | NRIC hiện đầy đủ ở Ops list/detail và Demo Control |
| — | Audit log (phát hành, mở, resend, thay, hết hạn, kết quả bị từ chối, FULFILLED, MISMATCH, xem NRIC, IPA, AA, AA bị từ chối) | Missing | chỉ có `notes` |
| — | Demo control: bật/tắt gateway, chạy job ngay, tua đồng hồ, xem outbox, reset | Partial | có reset, seed, expire link, outbox email |
| — | Một lệnh chạy + seed | Done | `npm run dev`, Demo Control → seed |
| — | ESLint + typecheck xanh | Missing | chưa có ESLint (Q7) |
| — | Test SC-xx + 1 e2e | Missing | test hiện có theo mô hình cũ |

## 3. Màn hình frontend

Tất cả màn đã gọi API thật (không có dữ liệu cứng về hồ sơ). Phần còn thiếu so với luồng mới:

| Màn | Trạng thái | Cần làm |
|---|---|---|
| 1–2 Quick Apply, Review & Submit | Nối API | không đổi |
| 3 Interest Received | Nối API | hiện "Queued" khi link chưa gửi được; hạn link chỉ có khi đã gửi |
| 4 Email | Email thật (Nodemailer) | thêm SMS báo đã gửi email (outbox, không chứa link) |
| 5 Link check | Nối API (`/v/{token}`) | chuyển sang `/verify/<token>`, đánh dấu OPENED, chuyển sang URL gateway |
| 6–8 Singpass giả lập | Nối API nhưng là một phần của AutoFinance | tách thành trang của gateway giả lập (`/gateway/<LinkId>`), "Cancel" chỉ ghi log phía gateway |
| 9 Dealer status | Nối API + SSE | nhãn trạng thái mới; dealer đã nộp được resend (có lý do) |
| 10 Ops list | Nối API + SSE | che NRIC, nhãn trạng thái mới, danh sách link hết hạn |
| 11 Ops detail | Nối API + SSE | bật "Retrieve MyInfo", resend có lý do + giới hạn, sửa NRIC khi MISMATCH, xem NRIC (audit), lý do khoá AA từ API, audit log |
| Demo Control | Nối API | bật/tắt gateway, chạy job ngay, tua đồng hồ, outbox email + SMS, nhật ký từ chối phía gateway |

## 4. Kế hoạch (theo thứ tự)

Mỗi bước: viết test SC trước → xác nhận đỏ → code cho xanh → `npm test`, `npm run lint`, `npm run typecheck` →
commit. (Cập nhật 2026-11-18: thêm bước 3b, đánh số lại các bước sau.)

1. ✅ **Nền móng + nộp hồ sơ.** Gỡ MockPass (Q6); ESLint (Q7); `Clock` inject, `config`; adapter `issueLink`,
   `fetchPerson`, `GatewayUnavailable` + gateway giả lập bật/tắt được + `ValueMaxGatewayAdapter` stub; link QUEUED …
   REPLACED, phát hành link lúc nộp, outbox email + SMS, audit. Test: SC-01, SC-50, SC-51.
2. ✅ **Portal link check.** `/verify/<portalToken>`, con trỏ `currentLinkId`. Test: SC-10, SC-11, SC-11b, SC-12.
3. ✅ **Job auto verify + Retrieve thủ công.** Poll link hiện hành SENT/OPENED (fetch trước, xét hạn sau, D-44), pass
   riêng cho kết quả muộn trên link REPLACED/EXPIRED (D-45), so NRIC, MISMATCH, EXPIRED, idempotent, chạy chồng an
   toàn; Retrieve MyInfo dùng đúng hàm xử lý party của job. Test: SC-20 … SC-30, SC-22b, 2 test D-44, test chạy chồng.
3b. ✅ **Chuyển `server/index.ts` sang service mới** cho các luồng đã có: nộp hồ sơ, `/verify`, trang gateway giả lập,
   job poll, Retrieve MyInfo; xoá `store.ts` và hành vi cũ. Sau bước này app chạy luồng chính trên code mới.
4. ✅ **Resend / sửa NRIC, email / link hết hạn.** Lý do, 3 lần/24 h trượt (D-39), Ops + dealer đã nộp; Ops sửa NRIC/email
   (D-40); gateway tắt (D-46); danh sách link hết hạn (D-47); khoá mã hoá bắt buộc (D-03); dữ liệu mẫu chỉ dùng persona
   (D-29). Test: SC-40, SC-41, SC-42, SC-44, SC-46 + các test D-xx.
5. **IPA / AA.** Test: SC-60, SC-61, SC-62, SC-63; thêm test: không sửa NRIC/email sau khi AA đã cấp (D-40).
6. **Giao diện.** Che NRIC + audit xem, nhật ký hoạt động Ops (gồm "kết quả bị từ chối (link cũ)"), danh sách link
   hết hạn, resend có lý do, sửa NRIC, guarantor thứ 2, Demo Control mới (không thiết kế lại giao diện).
7. **E2E + tài liệu.** 1 test Playwright cho kịch bản chính (Q8), README, chạy tay 7 kịch bản, báo cáo cuối.

## 5. Quyết định đã chốt (2026-11-18)

| Q | Chốt | Ghi vào |
|---|---|---|
| Q1 | Bỏ trạng thái Declined. Khách từ chối: link giữ nguyên tới hết hạn; gateway giả lập tự ghi lại việc từ chối (log + Demo Control) để người trình diễn giải thích, AutoFinance không biết | D-16, D-33 |
| Q2 | Ops và dealer agent đã nộp hồ sơ đều được resend (Proposal 3.1) | D-04 |
| Q3 | Gọi GetLinkId lúc nộp; QUEUED khi gateway hỏng; hạn 72 h tính từ lúc link thực sự được gửi | D-24 |
| Q4 | Chu kỳ poll mặc định 2 giây, cấu hình được, có nút "Run job now" | D-01 |
| Q5 | SMS chỉ báo đã gửi email, không chứa link | D-13 |
| Q6 | Gỡ MockPass (`mockpass.ts`, test, dependency) | D-34 |
| Q7 | ESLint cấu hình tối giản, `npm run lint` | D-35 |
| Q8 | Playwright, 1 test e2e cho kịch bản trình diễn chính; các SC khác test ở mức API/service | D-36 |
| Q9 | `tests/rules.test.ts` kiểm tra hành vi cũ (Declined, Superseded, Rejected): thay bằng bộ SC-xx; giữ các test NRIC, số điện thoại, mã hồ sơ vì vẫn đúng | D-43 |
| — | Job: fetch trước, xét hạn sau; link đã EXPIRED/REPLACED thì mọi dữ liệu về sau bị từ chối | D-44 |
| — | Kết quả muộn trên link cũ: pass riêng trong job (không đổi trạng thái, 1 sự kiện result.rejected/link) | D-45 |
| — | Sửa NRIC/email: chỉ Ops, có lý do, link mới, xoá kết quả cũ, không tính vào giới hạn resend, không sửa sau AA | D-40 |
| — | Stack: giữ Node `http`, JSON file, SPA vanilla JS, SSE (đã xác nhận) | D-37 |
| — | Giữ D-22: khi sai NRIC chỉ lưu `uinfin`, không lưu phần còn lại của dữ liệu person | D-22 |

## 6. Điểm mâu thuẫn và cách xử lý

- Prompt mục 1 nói "huỷ mọi link trước đó (REPLACED)"; D-19/D-20 nói link đã có kết quả (Expired, NRIC mismatch) giữ
  nguyên. Đã chốt: khi phát hành link mới, link còn hoạt động (QUEUED, SENT, OPENED) → REPLACED; link EXPIRED và
  MISMATCH giữ trạng thái làm lịch sử. "Link hiện hành" là con trỏ `currentLinkId` trên party, không suy ra từ trạng
  thái link. Thêm test: dữ liệu trên link A (MISMATCH/EXPIRED) sau khi resend ra link B → bị từ chối, party không
  đổi, B vẫn SENT, có audit; mở /verify của A → bị chặn. Ghi ở D-19.
- D-23 (đã chốt): khách consent trên link cũ thì điện thoại vẫn hiện "Details shared"; AutoFinance từ chối khi poll.
  Trang chi tiết hồ sơ của Ops hiện sự kiện "kết quả bị từ chối (link cũ)" trong nhật ký hoạt động.
- Tối đa 2 guarantor (đã chốt): domain hỗ trợ; giao diện thêm ô bật guarantor thứ 2, không đổi bố cục.
- Trạng thái Singpass của party = trạng thái của link hiện hành; nhãn Dealer/Ops ánh xạ: QUEUED/SENT/OPENED → Pending.
  Ghi ở D-38.
- Dữ liệu sample `VMAF-2026-05118` có guarantor "Declined": đổi thành EXPIRED (Q1). Ghi ở D-29.
