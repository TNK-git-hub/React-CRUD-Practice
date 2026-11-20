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
5. ✅ **IPA / AA.** Danh sách điều kiện AA mở rộng được (D-11), audit lần thử AA bị từ chối, chặn sửa/resend sau AA,
   sửa email khi đã FULFILLED chỉ cập nhật email (D-40). Test: SC-60 … SC-65 + test chặn sau AA.
6. ✅ **Giao diện** (chờ duyệt ảnh chụp, `docs/claude-code-demo/screens/README.md`). Lịch sử link: link không còn hiện hành (kể cả FULFILLED/MISMATCH cũ) mang nhãn "không còn hiệu
   lực" để không nhầm với trạng thái hiện tại của party; che NRIC + audit xem, nhật ký hoạt động Ops (gồm "kết quả bị từ chối (link cũ)"), danh sách link
   hết hạn, resend có lý do, sửa NRIC, guarantor thứ 2, Demo Control mới (không thiết kế lại giao diện).
7. ✅ **E2E + tài liệu.** 1 test Playwright cho kịch bản chính (Q8), README, chạy tay 7 kịch bản, báo cáo cuối.

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

## 7. Kiểm tra chạy từ đầu (2026-11-18)

Clone sạch nhánh `singpass-2` (commit `0581596`) vào thư mục tạm, làm đúng theo README: `npm ci` → `cp .env.example .env`
→ sinh khoá bằng lệnh `node -e …` và ghi vào `.env` → `npm start` (app chạy, trang chủ 200) → `npm test` (74/74) →
`npm run lint`, `npm run typecheck` (sạch) → `npx playwright install chromium` → `npm run test:e2e` (1/1 xanh). Bản clone
không sinh file lạ.

README thiếu (đã bổ sung): cổng 3000 có thể đang bị chiếm trên máy (ở máy kiểm tra là VS Code) → hướng dẫn đổi `PORT`;
`npm run setup` là cách nhanh nhất để có `.env` với khoá mới; `npm ci` in cảnh báo `npm audit`. Không kiểm được việc
tải Chromium lần đầu trên bản clone vì trình duyệt đã có trong cache dùng chung của máy; việc tải với
`NODE_OPTIONS=--use-system-ca` đã được kiểm ở bước 6 trên cùng máy (máy có CA riêng).

## 8. Đối chiếu với Prototype Walkthrough, màn hình [CORE] (2026-11-20)

Nguồn: `docs/requirements/ui-spec-from-prototype.md` (prompt gọi là `ui-spec-prototype.md`). Phạm vi chốt: chỉ [CORE], giữ
các điểm lệch có chủ ý ở mục 7 của spec (D-52). Quyết định: D-50 (đổi), D-52 … D-58. Ảnh: `screens/` (chạy `npm run screens`).

| Màn hình | Chỗ lệch so với spec | Sửa / Giữ | Lý do |
|---|---|---|---|
| UI-01 Home dealer | Spec: mô tả thẻ Quick Apply nhắc "LTA auto-fill" | **Không có gì để sửa** | Demo không có trang Home dealer (menu "Home" mở My Applications); UI-01 là [FULL]. Không có chuỗi "auto-fill" nào trong app |
| UI-04 Quick Apply | Ô LTA tên "LTA Access Code *", có dòng "The rest of the form unlocks once this is entered." | **Sửa** | Q2: bỏ dòng hứa hẹn (không có Section B/C); nhãn "Input LTA Access Code *", placeholder "e.g. A1B2C3D4" (D-53) |
| UI-04 | Tên không tự IN HOA | **Sửa** | Spec: "text, IN HOA"; gõ thì tự in hoa, gửi lên server in hoa |
| UI-04 | Số điện thoại không định dạng `9123 4567` | **Sửa** | Spec 1.2; tự định dạng khi rời ô, placeholder "e.g. 9123 4567" |
| UI-04 | Tối đa 2 guarantor (prototype 1); có "Fill sample" | Giữ | Spec mục 7 (QnA A2.7); nút mẫu là công cụ trình diễn |
| UI-04 | Nút "Next: Documents →" đi thẳng tới bước 3, thanh bước đánh dấu "Documents" đã xong | Giữ, **cần chốt** | Bước Documents là UI-07 [FULL], Q3 chưa chốt. Nếu muốn, đổi nhãn thành "Next: Review & Submit" |
| UI-08 Review & Submit | Thiếu khung **Dealer Declaration** (4 trường) và ô tick dưới khung | **Sửa** | Q5: 4 trường chỉ đọc, điền từ hồ sơ đại lý (Demo Motors Pte Ltd, 202612345D, Alex Tan, alex.tan@demomotors.sg); thêm ô tick đúng câu UI-08 (D-54) |
| UI-08 | Thiếu khung "Declaration by Applicant / Guarantor(s) — MAS Notice 642, …" nên câu tick 2 ("declarations above") không có gì ở trên | **Sửa** | Thêm khung, 8 điều "By the Applicant" của prototype, gập sau "View full text", ghi chú là văn bản prototype chờ bản chính thức |
| UI-08 | Đoạn DEALER'S ATTESTATION bị rút gọn ("… receiving …") | **Sửa** | Thay bằng nguyên văn prototype (a)–(d). "ValueMax Privacy Policy" in đậm, không gắn link vì chưa có URL thật |
| UI-08 | "Send Singpass Request" bật với 2 ô tick | **Sửa** | Q5: chỉ bật khi đủ 3 ô (e2e kiểm tra từng ô) |
| UI-08 | Hộp thông tin nói link email thay vì "Singpass app + LTA" | Giữ | D-51, spec mục 7 |
| UI-08 | Khung "Singpass requests" không có trong prototype | Giữ (đứng đầu) | Spec ghi nên giữ |
| UI-09 Interest Received | Thiếu nút "Go to My Applications →" | **Sửa** | Demo có danh sách `/dealer/applications`; thêm nút cạnh "View Application Status" |
| UI-09 | Câu "retrieving their vehicle documents via LTA" bị bỏ; có 2 thẻ link | Giữ | D-51; thẻ link là cải tiến của demo |
| UI-09 | "Demo: see what the hirer gets" mở trang khách của **hồ sơ mẫu** | **Sửa** | Mở link hirer của **chính hồ sơ này** (tab mới), tắt khi link đang queued (D-50 đổi) |
| UI-11 Application Status | 5 bước (… "IPA Issued", "AA") thay vì 4 bước với bước cuối đổi tên | **Sửa** | Q6: 4 bước; bước cuối "Awaiting ValueMax Decision" / "IPA Issued" / "Approved — AA" / "Application Declined" (D-55) |
| UI-11 | Chữ phụ khác prototype ("An AA (final approval) needs every person…", "ValueMax Ops reviews the application"…) | **Sửa** | Theo bảng UI-11; "on their Singpass app" → "through the Singpass link emailed to them"; nêu đúng người còn thiếu |
| UI-11 | Trạng thái Declined không có khối thông báo | **Sửa** | Thêm "Application Declined — Sorry, we are unable to proceed with this loan application.", không hiện lý do nội bộ |
| UI-11 | Chip từng người, nút "Resend link", "Updates live" | Giữ | Spec mục 7, D-04 |
| UI-11 | "Demo: see the Ops view →" mở hồ sơ mẫu 05117 thay vì hồ sơ đang xem | **Sửa (lỗi)** | Mở Ops view của chính hồ sơ, tự chuyển vai trước (D-50 đổi) |
| UI-11 | "View IPA Notice" chỉ đổi chữ thành "out of scope" | Giữ | UI-12 là [FULL], D-48 |
| UI-15 Ops list | Không có ô tìm kiếm, lọc "Singpass Fulfilled?", lọc trạng thái | **Sửa** | Tìm theo tên hirer / biển số / mã hồ sơ; NRIC chỉ khớp đúng và đủ, kết quả vẫn che (D-57) |
| UI-15 | Thiếu cột APPLICATION DATE; tên cột DEALER / HIRER / CAR PLATE | **Sửa** | Thêm cột `07 Oct 2026`; đổi thành DEALER NAME, HIRER NAME, CAR PLATE NO. |
| UI-15 | Nút "View" có chữ; thêm 1 cột thì bảng tràn ở 1280 px | **Sửa** | Nút con mắt chỉ có icon như prototype (`aria-label` "View {ref}") |
| UI-15 | Mô tả bỏ chữ "today"; "Expired links", "Demo Control" thay "+ New Application"; NRIC che; "1 of 2" | Giữ | Spec ghi "today" là [KHÔNG RÕ]; UI-23 [FULL]; D-41; "1 of 2" vẫn tính là "No" khi lọc |
| UI-15 | Nút ✏️ sửa, 📋 copy link | Giữ (không làm) | UI-17 [FULL]; F8 chưa rõ |
| UI-16 Ops details | Thứ tự khối: Applicant (+ Dealer, Created by, LTA) → Activity → MyInfo → Vehicle | **Sửa** | Theo spec: Applicant → Singpass Status → Guarantor → Vehicle → Application Info → Documents → Activity (D-58) |
| UI-16 | Thiếu Applicant Phone, khối Guarantor Info, Application Info, Relevant Document(s); Vehicle Info chỉ 3 trường | **Sửa** | Thêm đủ nhãn; trường / khối không có dữ liệu hiện "—" |
| UI-16 | LTA Access Code hiện rõ (`DEMO01`) | **Sửa** | Proposal 3.1: che `DE****01`, server không gửi mã đầy đủ (D-53) |
| UI-16 | Ngày sinh `2000-02-02`, tiền `SGD 84,000` trong bảng MyInfo | **Sửa** | Spec 1.2: `02 Feb 2000`, `S$ 84,000` |
| UI-16 | Trang thay popup; 2 cột (Singpass Status + Change Status bên phải); trạng thái Singpass chi tiết; bảng MyInfo; không có FI Review | Giữ | Spec mục 7 và ghi chú UI-16; D-10, D-49. Dưới 1200 px: Applicant → Singpass Status → Change Status → phần còn lại |
| UI-16 | Không có lối chuyển sang góc nhìn dealer của hồ sơ | **Sửa** | "Demo: see the dealer's view →" mở chính hồ sơ (chỉ khi thuộc Demo Motors; hồ sơ Sample Auto thì ẩn) |
| UI-19 khoá AA | Prototype: đủ 3 số AA + Singpass Fulfilled; demo chỉ kiểm Singpass | Giữ | Không nhập số IPA/AA (D-11, D-48); hộp "Cannot issue AA yet" đã có |
| UI-22 Change Status | Đặt ngay trên trang chi tiết, chỉ có "Issue IPA", "Issue AA" | Giữ | Nhãn "New Status", "Apply Status Change", "OPS ONLY" đã khớp; các lựa chọn khác là [FULL] (H1) |
| Q8 (UI-14) | API dealer vẫn có trường `myinfo: null` | **Sửa** | Dealer không nhận trường `myinfo`; chỉ Ops (D-56) |
| Demo Control | Lối tắt hồ sơ mẫu nằm trên trang chi tiết các hồ sơ khác | **Sửa** | Chuyển vào thẻ "Open a sample", nhãn ghi trạng thái + mã hồ sơ, tính theo dữ liệu hiện tại (D-50) |
| Customer Done | "Demo: see the dealer's view" mở hồ sơ mẫu | **Sửa** | Mở dealer view của chính hồ sơ vừa xác thực; hồ sơ của đại lý khác thì báo lỗi |

Test viết trước (đỏ rồi mới xanh): `tests/prototype-alignment.test.ts` (13 test: tracker theo trạng thái, Myinfo chỉ cho Ops,
che LTA code, tìm kiếm / lọc / NRIC khớp đúng, hồ sơ đại lý cho Dealer Declaration, nhãn lối tắt Demo Control),
`tests/e2e/demo-views.spec.ts` (nút chuyển góc nhìn giữ đúng hồ sơ, lối tắt Demo Control, tìm kiếm / lọc trên giao
diện), `tests/e2e/main-flow.spec.ts` (3 ô tick, khung Dealer Declaration chỉ đọc, bước cuối "Approved — AA").
