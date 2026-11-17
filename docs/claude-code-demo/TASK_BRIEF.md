# Nhiệm vụ: Code demo "Dealer Portal – Singpass Myinfo Auto Verify" cho ValueMax

> Bản giao việc cho Claude Code. Đặt cả thư mục này (TASK_BRIEF.md, `design/`, `singpass-reference/`, `prototype-screens/`) vào repo, dưới `docs/brief/`, rồi bảo Claude Code: "Đọc docs/brief/TASK_BRIEF.md và làm theo".

## 1. Bối cảnh

- CMC APAC đang chào thầu cho **ValueMax AutoFinance (Singapore)**: mở rộng hệ thống AutoFinance và làm mới **Dealer Portal**.
- Điểm nhấn của demo: **auto verify bằng Singpass Myinfo**. Dealer nhập hồ sơ khách, bấm gửi, hệ thống tự gửi link Singpass cho người vay (hirer) và người bảo lãnh (guarantor). Khách mở link **trên điện thoại của mình**, đăng nhập Singpass, bấm **I Agree** chia sẻ dữ liệu. Chỉ khi đó trạng thái trên **máy dealer** (và màn Ops) mới chuyển sang "Fulfilled", tự cập nhật không cần F5.
- Người xem: **khách hàng ValueMax**. Demo phải chạy mượt, đẹp, ổn định khi trình bày trực tiếp.

## 2. Tài liệu tham khảo đi kèm

| Thư mục | Nội dung | Dùng để |
|---|---|---|
| `design/` | 11 màn thiết kế (file `.dc.html`, HTML + inline style) và `canvas.json` (tên và thứ tự màn). Bản xem trực tuyến: https://claude.ai/artifact/XX2XpiWV5wv7E4eDsotcXi (cần đăng nhập claude.ai, có thể không mở được từ máy bạn, nên đã kèm file) | **Nguồn chính** cho bố cục, màu, chữ, nhãn trạng thái. Bỏ qua dòng `<script src="./support.js">` và thẻ `<x-dc>`, `<helmet>`: đó là định dạng của công cụ thiết kế |
| `singpass-reference/` | 5 ảnh màn Singpass Myinfo thật mà khách hàng đang dùng | Bố cục các màn phía khách (bước 4 đến 8 bên dưới) |
| `prototype-screens/` | 36 ảnh Prototype v54 của ValueMax + `README.txt` chú thích từng ảnh | Tên trường, nhãn, bố cục chi tiết cho màn Dealer và Ops |

Màu chính (lấy từ thiết kế): đỏ đô header `#7A1C2E`, accent `#A3203A`, nền `#F6F6F7`, vàng `#D9A33A`, xanh thành công `#1F8A5B`. Font Inter.

## 3. Phạm vi: 11 màn, theo thứ tự chạy

**A. Dealer (desktop)**
1. **Quick Apply – Application Details** (`design/Main.dc.html`): nhập hirer (tên, NRIC, email, SĐT), bật "Add Guarantor Info" để nhập guarantor, LTA Access Code. Kiểm tra định dạng NRIC/FIN Singapore (checksum), email, SĐT 8 số.
2. **Review & Submit** (`Dealer_Submit.dc.html`): tóm tắt hirer/guarantor, 2 checkbox xác nhận bắt buộc, nút **Send Singpass Request** chỉ bật khi tick đủ.
3. **Interest Received** (`Dealer_Received.dc.html`): mã hồ sơ (VD `VMAF-2026-05121`), giờ hết hạn link của từng người.

**B. Khách (điện thoại, mobile-first)**

4. **Email** (`Customer_Email.dc.html`): email thật gửi tới hộp thư khách, có nút "Verify with Singpass", ghi hạn 72 giờ.
5. **Kiểm tra link** (`Customer_LinkCheck.dc.html`): server kiểm tra link còn hạn và là link mới nhất của người đó. Link hết hạn hoặc bị thay bằng link mới thì dừng ở đây với thông báo "This link is no longer valid". Link hợp lệ thì hiện nút **Retrieve Myinfo with Singpass** (theo `singpass-reference/1_retrieve-myinfo-button.png`).
6. **Đăng nhập Singpass giả lập** (`Customer_Singpass.dc.html` + `singpass-reference/2_singpass-login.png`): QR (trang trí) và tuỳ chọn "Use password". Chọn persona test hoặc nhập NRIC test để "đăng nhập".
7. **Màn đồng ý** (`Customer_Consent.dc.html` + `singpass-reference/3_…`, `4_…`): danh sách dữ liệu được yêu cầu, nút **Cancel** và **I Agree**.
8. **Review rồi hoàn tất** (`singpass-reference/5_review-and-submit.png` rồi `Customer_Done.dc.html`): hiện dữ liệu Myinfo theo tab Personal / Employment & Education / Property, nút **Submit Application**, sau đó màn "Details shared". Không redirect quay về portal dealer.

**C. Kết quả về hồ sơ (desktop)**

9. **Dealer – Application Status** (`Dealer_Status.dc.html`): tracker "Application Submitted → Pending Singpass Verification → Credit Review → IPA Issued → AA". Trạng thái Singpass từng người **Pending / Fulfilled** cập nhật realtime.
10. **Ops – All Applications** (`Ops_List.dc.html`): danh sách hồ sơ mọi dealer, cột Singpass của hirer và guarantor, realtime.
11. **Ops – Application Details & Issue AA** (`Ops_Detail.dc.html`): khối "Singpass Status" từng người (Status, Trigger Date, Fulfilled Date, nút **Resend Email**), dấu "NRIC matched", bảng đối chiếu dữ liệu dealer nhập với dữ liệu Myinfo, hộp **"Cannot issue AA yet"** liệt kê điều kiện còn thiếu. Nút Issue IPA bấm được khi Singpass còn Pending. Nút Issue AA bị khoá **ở server** cho tới khi mọi người đều Fulfilled.

Thêm một trang **Demo Control** nhỏ (ẩn, VD `/demo`) để reset dữ liệu, tạo sẵn hồ sơ mẫu, chuyển nhanh link sang trạng thái hết hạn để trình bày ca lỗi.

## 4. Luồng phối hợp nhiều thiết bị (phần quan trọng nhất)

```
Dealer (laptop)            Backend                      Khách (điện thoại)
  Send Singpass Request ─▶ tạo hồ sơ, tạo 1 link
                           active/người, hạn 72h
                           gửi email ──────────────────▶ mở email, bấm link
                           kiểm tra link ◀───────────── mở /v/{token}
                           mock gateway: GetToken,
                           GetLinkId ─────────────────▶ đăng nhập Singpass giả lập
                                                         bấm I Agree, Submit
                           person/autofin/{LinkId}
                           so NRIC, lưu dữ liệu,
  màn 9 tự đổi Fulfilled ◀─ đẩy sự kiện realtime
  Ops màn 10, 11 tự đổi ◀──┘
```

Yêu cầu:
- **Realtime**: dùng WebSocket hoặc Server-Sent Events. Dealer và Ops thấy trạng thái đổi trong khoảng 1 giây sau khi khách bấm Submit, không cần tải lại trang.
- **Email thật**: gửi qua SMTP cấu hình trong `.env` (VD Gmail app password, SendGrid, hoặc Mailtrap). Nếu chưa cấu hình SMTP thì dùng Mailpit chạy local và in link ra log. Màn 3 có thêm nút hiện **QR của link** làm phương án dự phòng khi trình diễn.
- **Điện thoại truy cập được**: link trong email phải mở được từ điện thoại thật. Hỗ trợ biến `PUBLIC_BASE_URL`, chạy được qua mạng LAN và qua tunnel (cloudflared hoặc ngrok). Ghi rõ cách chạy trong README.
- **Mock gateway của ValueMax**: tách thành một module riêng mô phỏng 3 API mà ValueMax sẽ cung cấp: `GetToken`, `GetLinkId`, `person/autofin/{LinkId}`. Spec thật chưa có (đang chờ ValueMax, Q&A mục B1.1), nên thiết kế interface sao cho sau này thay bằng gateway thật chỉ cần đổi adapter.

## 5. Quy tắc nghiệp vụ (đã đối chiếu tài liệu dự án)

| Quy tắc | Nguồn |
|---|---|
| Submit hồ sơ tự kích hoạt link Singpass "Retrieve MyInfo"; hirer và guarantor mỗi người nhận **link riêng qua email** | AutoFinance_High level requirement.docx |
| Sản phẩm là **Myinfo qua Singpass login**, không phải Singpass Verify | QnA Filled, B1.3 |
| Link hết hạn sau **72 giờ**; resend tạo link mới và vô hiệu link cũ (1 link active/người) | QnA Filled, A3.3 và B1.5; Proposal v2 §5.4 |
| Dữ liệu trả về có `uinfin`; hệ thống chỉ so **NRIC** để phát hiện lệch, phần còn lại lưu mã hoá | QnA Filled, B1.4 |
| Gateway **không redirect** khách về portal sau khi đồng ý | QnA Filled, B1.7 |
| Kênh go-live chỉ email (SMS chỉ để báo đã gửi, giai đoạn sau) | QnA Filled, A3.5 |
| Email chung chung, không cần người ký | QnA Filled, A3.6 |
| **IPA** cấp được khi Singpass còn Pending; **AA** chỉ khi Singpass Fulfilled | Prototype Walkthrough §5.3, §5.6 |

Các trạng thái Singpass của mỗi người: `Pending`, `Fulfilled`, `Expired`, `Superseded` (bị thay bằng link mới), `NRIC mismatch`, `Declined` (khách bấm Cancel).

Ca lỗi cần demo được: link hết hạn, link cũ sau khi Resend, NRIC đăng nhập khác NRIC dealer nhập (báo đỏ cho Ops, không chuyển Fulfilled), khách bấm Cancel.

## 6. Dữ liệu mẫu

- Persona test (NRIC lấy từ danh sách persona staging trong QnA B2.2): `F4440488P`, `F4440489M`, `G4440425M`, `G4440427W`, `G4440430W`, `G4440431T`, `G4440432Q`, `G4440433N`, `M5004553J`. Tự tạo dữ liệu Myinfo giả cho từng persona (tên, ngày sinh, địa chỉ, chủ lao động, CPF, NOA, nhà ở) theo danh sách trường trong `singpass-reference/3_…` và `4_…`. Ví dụ ảnh 5: `F4440488P` = HENG SHI ZHENG.
- **Không** gọi Singpass thật, **không** lưu hay dùng mật khẩu staging thật trong code.
- Một tài khoản dealer mẫu (VD Demo Motors Pte Ltd, Alex Tan) và một tài khoản Ops. Đăng nhập đơn giản hoặc nút chuyển vai trò là đủ.

## 7. Công nghệ

Không bắt buộc. Gợi ý để chạy nhanh và dễ deploy: một repo TypeScript, frontend React + Vite + Tailwind, backend Node (Fastify hoặc Express) + SQLite, realtime bằng Socket.IO hoặc SSE, email bằng Nodemailer. Có `docker-compose` (app + Mailpit) và lệnh chạy một phát (`npm run dev` hoặc `docker compose up`).

## 8. Màn Singpass giả lập: lưu ý trình bày

Màn 6 đến 8 bám bố cục ảnh tham khảo để khách thấy quen, nhưng luôn có dải nhỏ **"SIMULATED · DEMO ONLY"** ở đầu trang như trong `design/Customer_Singpass.dc.html`, để không ai nhầm là trang Singpass thật.

## 9. Cách làm và bàn giao

1. Đọc hết thư mục brief, xem ảnh, rồi viết `docs/PLAN.md` (kiến trúc, mô hình dữ liệu, API, danh sách màn) và commit trước khi code.
2. Làm theo lát cắt dọc: chạy được trọn luồng hirer từ màn 1 đến 9 trước, rồi thêm guarantor, Ops, ca lỗi, cuối cùng chỉnh giao diện cho sát thiết kế.
3. Commit nhỏ, push lên branch riêng (VD `feature/singpass-demo`), mở Pull Request vào nhánh chính.
4. Có test tối thiểu cho: kiểm tra NRIC, hết hạn và thay link, so NRIC, khoá AA.
5. README: cách cài, cấu hình `.env` (SMTP, `PUBLIC_BASE_URL`), cách cho điện thoại truy cập, **kịch bản demo từng bước** (khoảng 5 phút), cách reset dữ liệu.

## 10. Tiêu chí hoàn thành

- [ ] Dealer gửi request trên laptop, điện thoại nhận email thật trong vòng 1 phút.
- [ ] Khách đi hết luồng trên điện thoại; màn dealer và Ops tự đổi sang Fulfilled trong khoảng 1 giây.
- [ ] Hirer + guarantor chạy độc lập; AA chỉ mở khi cả hai Fulfilled.
- [ ] Demo được 4 ca lỗi ở mục 5.
- [ ] Giao diện 11 màn khớp thiết kế trong `design/`; màn khách hiển thị tốt trên điện thoại.
- [ ] Reset dữ liệu từ trang Demo Control.

## 11. Điểm chưa chốt với khách (đừng tự quyết, ghi vào PLAN.md)

- Prototype v54 ghi request gửi tới **Singpass app**, còn High level requirement ghi gửi **link qua email**. Demo đang theo email.
- QnA B1.4: ValueMax nói chỉ hiện NRIC để kiểm tra lệch, nhưng ảnh tham khảo 5 lại cho khách xem toàn bộ dữ liệu trước khi Submit. Demo theo ảnh, làm màn này bật/tắt được bằng cấu hình.
- Spec thật của 3 API gateway chưa có (B1.1).
