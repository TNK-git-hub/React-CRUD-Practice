# Đặc tả giao diện theo Prototype Walkthrough (bổ sung cho spec demo)

- Nguồn: `Dealer Online Application Platform - Prototype Walkthrough.docx`, VM AutoFinance, Terence Yeo (Business Operations), 7/10/2026, prototype "Online Application build v54" (1/9/2026). Gồm 36 hình.
- Đường dẫn gợi ý trong repo: `docs/requirements/ui-spec-prototype.md`
- Ngày viết: 2026-11-20
- Cách đọc: mỗi màn hình có mã `UI-xx`, kèm hình gốc (Figure), bố cục, bảng trường (nhãn giữ **nguyên văn tiếng Anh** như prototype), hành vi, và mục **"Ghi chú cho demo"** nêu chỗ khác với demo hiện tại hoặc với các quyết định đã chốt (`D-xx` trong `decisions.md`).
- Nhãn phạm vi (chờ chốt, xem mục 9, câu Q1):
  - **[CORE]**: liên quan trực tiếp tới luồng Singpass auto verify, demo phải có.
  - **[FULL]**: có trong prototype, chỉ làm nếu chọn dựng đủ prototype.
  - **[OUT]**: ngoài phạm vi demo.
- Chỗ nào prototype không thể hiện rõ, tài liệu ghi **[KHÔNG RÕ]** và đưa vào mục 9.

Lưu ý quan trọng: prototype mô phỏng Singpass theo kiểu **"request vào app Singpass của hirer"** và Ops **bấm tay "Retrieve MyInfo"**. Demo của chúng ta theo gateway thật của ValueMax: **link qua email + tự poll (auto verify)**. Mọi chỗ prototype nói "Singpass app" đều phải đổi theo luồng email link (Round 2 F1 vẫn đang hỏi).

---

## 1. Quy ước chung cho mọi màn hình

### 1.1 Khung trang
| Thành phần | Mô tả theo prototype |
|---|---|
| Header | Nền đỏ đô, chấm vàng + "ValueMax AutoFinance", dòng phụ "DEALER PORTAL". Bên phải: tên công ty — tên người dùng (ví dụ "Demo Motors Pte Ltd — Alex Tan") + avatar tròn chữ viết tắt (AT) |
| Chuyển vai | Prototype: dropdown "PREVIEW AS" (All / Dealer / Ops). Demo: nút "Switch role" (D-08). Giữ cách của demo |
| Menu trái | Nhóm **FINANCE**: Home, Application, Account. Nhóm **SUPPORT**: Document Centre, Contact Us. Mục đang mở tô nền hồng + viền trái đỏ. Prototype có icon emoji trước mỗi mục |
| Nhãn phiên bản | Góc dưới phải "Online Application v54" (chỉ prototype, demo có thể bỏ) |
| Tiêu đề trang | Mũi tên ← quay lại + tiêu đề lớn, dòng mô tả xám bên dưới |

### 1.2 Định dạng
| Loại | Prototype dùng | Ghi chú |
|---|---|---|
| Ngày trong danh sách / tiêu đề | `07 Oct 2026` | |
| Ngày giờ trạng thái Singpass, IPA/AA locked, Created | `07-10-2026 12:03` | Khớp D-06 (`DD-MM-YYYY HH:mm`, giờ SGT) |
| Activity log (Ops) | `05/10/2026, 11:08:05 am` | Không thống nhất với các chỗ khác. Demo đang dùng `DD-MM-YYYY HH:mm SGT`, nên giữ của demo |
| Tiền | `98,000`, `S$ 1,313.69` | Trong ô nhập Ops edit lại không có dấu phẩy (`98000`). Nên thống nhất có dấu phẩy khi hiển thị |
| Lãi suất | `2.98%`, `2.98` (% p.a.) | |
| NRIC | Prototype hiện **đầy đủ** ở mọi nơi | Demo che (`S****249H`) theo D-41. Giữ che |

### 1.3 Nhãn trạng thái hồ sơ (chip màu)
| Nhãn | Màu | Thấy ở |
|---|---|---|
| Draft | xám | Dealer, Ops |
| Pending | vàng | Ops (dealer thấy "Application Submitted") |
| Application Submitted | vàng | Dealer |
| Submitted | xanh lá | Dealer, Ops (khác Pending thế nào: [KHÔNG RÕ], Round 2 H1) |
| Credit Review | xanh dương | Ops |
| Approved — IPA | vàng cam | Dealer, Ops |
| Approved — AA | xanh lá | Dealer, Ops |
| More Documents Needed | vàng cam | Dealer, Ops |
| Declined | đỏ | Dealer, Ops |
| Lapsed | xám | Ops |

---

## 2. Trang chủ

### UI-01 Home — Dealer [FULL]
Figure 2.2.
- "Welcome, {tên}" + dòng "{công ty} (Reg. {UEN})".
- 2 thẻ:
  - **My Applications**: mô tả "View status, resume drafts, or download documents for past submissions." Nút viền "View My Applications →".
  - **Quick Apply** + nhãn BETA: mô tả "Capture just the essentials — Singpass & LTA auto-fill the rest once the hirer verifies." Nút đỏ "+ Quick Apply via Singpass".
- Ghi chú cho demo: mô tả thẻ Quick Apply nhắc "LTA auto-fill", trái với D-51 (không tra LTA). Đề xuất sửa thành "Capture just the essentials — Singpass fills the rest once each person verifies."

### UI-02 Home — Ops [FULL]
Figure 2.3.
- 1 thẻ **Ops — All Applications** + nhãn OPS: "Every case submitted today, across every dealer — process, update status, and issue IPA/AA." Nút đỏ "View All Applications", nút viền "+ New Application (manual entry)".
- Figure 2.1 (view "All") chỉ là màn hình dev, không làm.

---

## 3. Dealer — Quick Apply

### UI-03 Chọn loại hồ sơ [FULL]
Figure 3.1. Tiêu đề "Quick Apply — Singpass Auto-Fill" + BETA. Mô tả: "Capture just the essentials below — the rest of the application is retrieved automatically via Singpass MyInfo and LTA once the hirer verifies."

Khung "Select Application Type", mô tả "All products use the same Quick Apply form below. Choose the product this application is for." Lưới 2 cột thẻ chọn (một lựa chọn, thẻ chọn có viền đỏ + nền hồng):

| Thẻ | Mô tả | Trạng thái |
|---|---|---|
| Personal — Hire Purchase Loan (PARF / COE) | Standard personal auto financing for PARF or COE vehicles. | Chọn được (mặc định) |
| Private Hire — Hire Purchase Loan (Z10/11 - PARF / COE) | For vehicles registered/used for private hire. Requires PHV Licence + expiry date. | Chọn được |
| PQP Renewal — Hire Purchase Loan | Financing for a Certificate of Entitlement (COE) PQP renewal. | Chọn được |
| Company Registered — Hire Purchase Loan | Under development — not yet available. | Mờ, nhãn UNDER DEVELOPMENT |
| New Car Personal — Hire Purchase Loan | Under development — not yet available. | Mờ, nhãn UNDER DEVELOPMENT |

Nút "Continue →".
- Ghi chú cho demo: demo hiện vào thẳng form, sản phẩm mặc định Personal (tiêu đề hồ sơ hiện "Personal — Hire Purchase Loan (PARF / COE) — Quick Apply"). Câu "and LTA" trong mô tả trái D-51.
- [KHÔNG RÕ] Private Hire cần PHV Licence + ngày hết hạn nhưng form không có ô nào cho việc này (Round 2 C2).

### UI-04 Bước 1 — Application Details: Section A Applicant [CORE]
Figure 3.2. Thanh bước 3 bước: "1 Application Details", "2 Documents", "3 Review & Submit" (bước đang làm: số đỏ, chữ đỏ, gạch chân đỏ; bước xong: tick xanh).

**Section A — Applicant Details**, mô tả "Used to send the hirer their Singpass verification request."

| Nhãn | Kiểu | Bắt buộc | Kiểm tra / ghi chú |
|---|---|---|---|
| Name of Applicant | text, IN HOA | Có | |
| NRIC of Applicant | text | Có | Hiện "✓ Valid NRIC / FIN" khi hợp lệ (kiểm tra khi gõ) |
| Email Address *(to send Singpass request)* | email | Có | "✓ Looks good" |
| Phone Number *(for WhatsApp updates)* | số SG, hiển thị `9123 4567` | Có | "✓ Valid Singapore mobile number". Demo đã đổi nhãn thành "Phone Number" (WhatsApp chưa chốt, J1) |
| Add Guarantor Info | công tắc | Không | Mô tả: "Optional — if added, the guarantor's NRIC and an income document will also be required" |

Khi bật guarantor, hiện khung hồng **Guarantor Details**: Name of Guarantor*, NRIC of Guarantor* (✓ Valid NRIC / FIN), Email Address*, Phone Number*.
- Ghi chú cho demo: prototype chỉ có **1 guarantor**; demo cho 2 (D1 đang hỏi, QnA A2.7 nói tối đa 2). Giữ 2 như demo.
- Kiểm tra hiện **ngay khi gõ**, thông báo xanh dưới ô. Thông báo lỗi khi sai: [KHÔNG RÕ] prototype không chụp, đề xuất chữ đỏ cùng vị trí.

### UI-05 Bước 1: Section B Loan Requirements [FULL]
Figure 3.3, 3.4.

Trạng thái khoá: chỉ hiện ô **Input LTA Access Code*** (placeholder "e.g. A1B2C3D4") + dòng "Key in the LTA Access Code to show the vehicle plate, financing request and the rest of this application." Nhập xong thì các ô dưới hiện ra.

| Nhãn | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| Input LTA Access Code | text | Có | Chỉ lưu, không tra LTA (D-51). Proposal: mã hoá, che trên màn hình, xoá sau khi dùng |
| Vehicle Reg. No. / Plate | text, IN HOA (ví dụ SKV2468M) | Có | |
| Purchase Price (S$) | tiền | Có | |
| Deposit (S$) | tiền | Có | Ops edit lại để không bắt buộc (Round 2 D4) |
| Loan Amount (S$) | tiền | Có | Nhập tay hay = Purchase Price − Deposit: [KHÔNG RÕ] (D4). Ví dụ prototype: 98,000 − 29,400 = 68,600. Quy tắc QnA A2.8: Loan Amount ≤ Purchase Price |
| Repayment Period / Tenure (months) | số | Có | |
| Interest Rate (% p.a.) | dropdown (ví dụ 2.98%) | Có | Danh sách lấy từ bảng tham chiếu (A2.5) |
| Do you have an existing vehicle to trade in / dispose? | radio Yes / No / Not applicable | Có | |
| **Monthly Instalment Payable: S$ x (indicative)** | tính tự động, cập nhật ngay | — | Công thức mục 8 |
| Chú thích | — | — | "** The figures shown are for illustration purposes only and do not constitute a loan offer. Final loan amount, interest rate and repayment terms will be determined based on the terms set out in the final loan agreement." |

Dải đỏ **DECLARATION PURSUANT TO MAS NOTICE 642**:
1. "Has the applicant received any discount, rebate or other benefit from the vendor of the vehicle or any other person?" * Yes / No
2. "Has the applicant obtained any other credit or hire purchase facility for the purchase / hire of this vehicle?" * Yes / No

- Ghi chú cho demo: **demo hiện chưa có phần này.** Sau khi nhập LTA Access Code, dòng "The rest of the form unlocks once this is entered." vẫn hiện nhưng không mở thêm ô nào. Hoặc làm đủ Section B, C, hoặc bỏ dòng chữ đó (xem Q1).

### UI-06 Bước 1: Section C Employment [FULL]
Figure 3.5.

| Nhãn | Kiểu | Bắt buộc |
|---|---|---|
| Employer | text | Có |
| Job Title | text | Có |
| Monthly Salary (S$) | tiền | Có |
| Length of Service | 2 ô: Years, Months (0–11) | Có |

Nút: "Cancel" (trái), "Next: Documents →" (phải, đỏ).
- [KHÔNG RÕ] Guarantor có cần phần Employment không (Round 2 D2).

### UI-07 Bước 2: Documents [FULL]
Figure 3.6.

Khung **Relevant Document(s)**. Mô tả: "Drag & drop a file onto each row, or click to browse. Allowed types: JPEG, PNG, PDF, DOC, ZIP · Max 4MB, 1 file per document. **Documents marked Mandatory are required. For income documents (Payslip / CPF / NOA), at least ONE must be uploaded.**"

Hàng chip tiến độ trên cùng: mỗi tài liệu một chip; đã tải thì tick xanh, chưa tải thì hiện số thứ tự xám.

Danh sách ô tải (mỗi tài liệu một thẻ có viền trái màu, nhãn "UPLOADED" khi xong, dòng file "✅ tên.pdf 2 KB ✕ Remove"):

| # | Tài liệu | Mô tả phụ | Bắt buộc | Viền |
|---|---|---|---|---|
| 1 | NRIC | NRIC — front and back in one file | Có (*) | đỏ |
| 2 | Driving Licence | Copy of valid driving licence | Không | vàng |
| 3 | Vehicle Sales Agreement | Signed sales agreement between buyer and dealer | Có (*) | đỏ |
| 4 | Car Seller Log Card | [KHÔNG RÕ] | [KHÔNG RÕ] (Round 2 E5) | |
| 5 | Hirer Payslip | | Nhóm thu nhập: ít nhất 1 | |
| 6 | Hirer CPF (Past 15 Months) | | Nhóm thu nhập | |
| 7 | Hirer NOA (Latest) | | Nhóm thu nhập | |
| 8 | Guarantor NRIC | (chỉ khi có guarantor) | Có khi có guarantor (theo mô tả công tắc) | |
| 9 | Guarantor Payslip | (chỉ khi có guarantor) | Nhóm thu nhập guarantor | |
| 10 | Guarantor CPF (Past 15 Months) | | | |
| 11 | Guarantor NOA (Latest) | | | |

- Ghi chú cho demo: quy tắc file **khác** QnA và Proposal. Prototype: JPEG, PNG, PDF, DOC, **ZIP**, 4 MB. QnA A2.10: **không ZIP**. Proposal: PDF, DOC, DOCX, JPEG, PNG, HEIC, 10 MB/file, 30 file/hồ sơ, quét mã độc. Cần chốt (Q4).
- [KHÔNG RÕ] "1 file per document" khi payslip có 3 file (Round 2 G3).
- [KHÔNG RÕ] Màn hình demo hiện tại ở bước Documents làm gì (tải thật, giả, hay bỏ qua): cần kiểm tra.

### UI-08 Bước 3: Review & Submit [CORE]
Figure 3.7, 3.8.

Khung **Dealer Declaration** (điền sẵn từ hồ sơ đại lý, D12 hỏi có được sửa không):

| Nhãn | Ví dụ |
|---|---|
| Name of Dealer | Demo Motors Pte Ltd |
| Company Reg No. | 202612345D |
| Salesperson Name | Alex Tan |
| Salesperson Email | alex.tan@demomotors.sg |

Ô tick 1: "I confirm the information given is true and correct, and that I have verified the applicant's identity against their supporting documents."

Khung **Declaration by Applicant / Guarantor(s) — MAS Notice 642, Credit Checks, PDPA & Online Submission** + liên kết "▾ View full text". Đoạn "By the Applicant:" gồm 8 điều (giữ nguyên văn khi có văn bản chính thức).

Ô tick 2: "I confirm that the Applicant and Guarantor(s) have been shown the declarations above, have read and understood them in a language they understand, and have agreed to them — including consent to identity, employment and credit bureau verification."

Dải đỏ **DEALER'S ATTESTATION**, đoạn (a)–(d), có liên kết "ValueMax Privacy Policy". Ô tick 3: "I have explained the above (including the Privacy Policy) to the Applicant / Guarantor(s), and I make the Dealer's Attestation set out above."

Hộp thông tin vàng (prototype): "On submit, a Singpass verification request is sent to the hirer's Singpass app, and the LTA Access Code above is used to retrieve the vehicle's log card and PARF/COE rebate details automatically. Please still upload the supporting documents above."
- Demo đã đổi (D-51): "On submit, a Singpass verification link is emailed to each person (one active link each, valid 72 hours)." Giữ của demo.

Nút: "← Back", "Cancel", "Send Singpass Request →" (chỉ bật khi đã tick đủ).
- [KHÔNG RÕ] Prototype có **3 ô tick** nhưng chú thích Figure 3.8 nói "Both confirmations must be ticked". Demo hiện có 2 ô (thiếu ô dưới Dealer Declaration). Cần chốt (Q5).
- Ghi chú cho demo: demo đang có thêm khung "Singpass requests" liệt kê hirer/guarantor + email trước phần cam kết. Đây là bổ sung hữu ích, nên giữ.

### UI-09 Xác nhận đã nộp [CORE]
Figure 3.9. Vòng tròn tick xanh, tiêu đề "Interest Received", đoạn "Thanks — we've received your interest for **{TÊN HIRER}**. We're now triggering a Singpass verification request to the hirer, and retrieving their vehicle documents via LTA." Chip "Application Ref: VMAF-2026-05121". Dòng "Keep an eye on the **My Applications** page for updates — this application now shows as **Pending**." Nút "Submit Another", "Go to My Applications →".
- Ghi chú cho demo: demo đã bỏ câu LTA, thêm 2 thẻ "Hirer · link sent / Expires …", nút chính là "View Application Status →". Prototype dẫn về **My Applications** (danh sách). Cả hai đều hợp lý; nếu làm UI-10 thì nên thêm lại nút "Go to My Applications".
- Chú thích prototype: hồ sơ vào hàng đợi Ops với trạng thái **Pending**, dealer thấy **Application Submitted**.

---

## 4. Dealer — My Applications

### UI-10 Danh sách hồ sơ của dealer [FULL]
Figure 4.1 (ghi nhầm "Figure 5.1"). Tiêu đề "My Applications", mô tả "All loan applications submitted by {công ty} (Reg. {UEN})." Bộ lọc "Filter by status:" (dropdown, mặc định All).

| Cột | Ví dụ |
|---|---|
| APPLICATION NO. | VMAF-2026-05121 |
| APPLICATION DATE | 07 Oct 2026 |
| HIRER NAME | JASON LIM KAI WEN |
| CAR PLATE NO. | SKV2468M (nháp thì "—") |
| STATUS | chip mục 1.3 |
| ACTIONS | "▶ Continue" (chỉ Draft) + "👁 View Details" |

- Dealer chỉ thấy hồ sơ của mình. [KHÔNG RÕ] "của mình" là của agent hay của cả đại lý: prototype ghi "submitted by Demo Motors" (cả đại lý); Proposal có tài khoản riêng cho từng agent.
- Ghi chú cho demo: demo chưa thấy màn hình này trong ảnh chụp (menu "Application" đang mở thẳng form). Cần kiểm tra.

### UI-11 Chi tiết hồ sơ — tab Status [CORE]
Figure 4.2–4.7. Tiêu đề "← Application Details", dòng phụ "{Ref} · Submitted {dd Mon yyyy} · {sản phẩm} — Quick Apply". 2 tab: "Status", "Submitted Details". Khung "Application Status" + chip Ref + thanh tiến trình dọc:

| Bước | Chữ phụ theo trạng thái (prototype) |
|---|---|
| Application Submitted | "Application details submitted by the dealer" |
| Pending Singpass Verification | Chờ: "Awaiting the hirer's approval on their Singpass app". Có IPA mà chưa xong: "Still awaiting the hirer's Singpass approval — an AA (final approval) needs this to complete first". Xong: "Hirer's Singpass MyInfo has been retrieved" |
| Credit Review | Chờ: "ValueMax Ops is reviewing the submitted documents". Xong: "ValueMax Ops has completed its review" |
| Bước cuối (đổi theo kết quả) | "Awaiting ValueMax Decision — IPA, AA, a request for more documents, or a decline will appear here once ValueMax Ops completes its review." / "IPA Issued — In-Principle Approval — click below to view the notice" + nút "📄 View IPA Notice" / "More Info Required" / "Application Declined — See the message below" (icon ✕ đỏ) |

Trạng thái Declined: thêm khối "Application Declined — Sorry, we are unable to proceed with this loan application." Lý do nội bộ của Ops **không** hiện cho dealer.

- Ghi chú cho demo:
  - Chữ "on their Singpass app" phải đổi theo luồng email link. Demo đã có chip từng người ("Hirer · Pending · link expires in 72 h", "Hirer · Fulfilled …", "NRIC mismatch — Ops is following up"). Đây là cải tiến so với prototype (prototype chỉ nói về hirer, không có guarantor).
  - Prototype có bước cuối đổi tên theo kết quả; demo đang có 2 bước riêng "IPA Issued" và "AA". Cần chốt kiểu nào (Q6).
  - Demo có thêm nút "Resend link (Hirer)" và "Demo: see the Ops view →". Prototype không có resend phía dealer (D-04 bổ sung).

### UI-12 Thông báo IPA / AA (popup) [FULL]
Figure 4.4, 4.5. Popup có ✕. Dải đỏ đô: trái "ValueMax AutoFinance", phải "IN-PRINCIPLE APPROVAL (IPA)" hoặc "APPROVAL ADVICE (AA)".

| Trường | |
|---|---|
| Application Ref, Date Issued, Issued By | 3 cột |
| Car Plate | |
| "Dear {TÊN HIRER}," + đoạn thư | IPA: "...accorded an in-principle approval. This is an indicative approval only — it is conditional on completion of Singpass verification, income verification and vehicle inspection, and a formal Approval Advice (AA) will be issued once all of these are complete." AA: "Congratulations! ... Singpass verification and ValueMax's credit review are both complete ... Please submit the full set of loan documents to your Relationship Manager (RM) to proceed with the loan disbursement." |
| Bảng số | (Indicative) Loan Amount (S$), (Indicative) Tenure (months), (Indicative) Interest Rate (% p.a.), (Indicative) Monthly Instalment (S$), (Indicative) Effective Interest Rate |
| Chú thích nghiêng | "This notice is generated from the application record held in this prototype and does not constitute the actual signed ... letter issued by ValueMax AutoFinance." |
| Nút | "🖨 Print / Save as PDF" |

- Ghi chú cho demo: D-48 ghi demo chỉ đổi trạng thái, không có nội dung thông báo. Muốn có popup này thì demo cần thêm phần nhập số IPA/AA (UI-19).

### UI-13 Bổ sung tài liệu theo yêu cầu (phía dealer) [FULL]
Figure 4.6. Bước cuối "More Info Required — ValueMax Ops needs additional document(s) — see below". Khối "Additional Document(s) Requested": "ValueMax Ops has asked for: **{danh sách}**", "Ops comment: "{ghi chú}"". Vùng tải "Upload Zone (Drag & Drop or Choose file)" + quy tắc file. Danh sách file đã chọn (📎 tên, dung lượng, ↗open, ✕ Remove). Nút "Submit Document(s)". Sau khi nộp, hồ sơ quay về Ops.

### UI-14 Chi tiết hồ sơ — tab Submitted Details [FULL]
Figure 4.8, 4.9. Chỉ đọc.
- **APPLICANT** + liên kết "EDIT" (dealer sửa được gì, đến khi nào: Round 2 H7): Applicant Name, Applicant NRIC, Applicant Email, Applicant Phone.
- **ADDITIONAL PERSONAL PARTICULARS** (lấy từ Myinfo): Salutation, Date of Birth, Marital Status, Nationality, Sex, Property Ownership, Property Type, Education Level, Home No. / Office No., Home Address, Mailing Address. Trống thì hiện "—".
- **SUPPORTING DOCUMENTS**: danh sách đánh số, có thì nền xanh "✅ Uploaded ↗open", thiếu thì "— {tên} Missing" (đỏ nhạt, không đánh số). Dòng "Income Doc Submitted: Payslip + CPF". Nhấp đúp để mở.
- Nút: "← Back to My Applications", "⬇ Download Prefilled Application Form" (K3: tải lúc nào cũng được hay chỉ sau AA).
- Ghi chú cho demo: QnA B1.4 nói hiện chỉ hiển thị NRIC; D-49 cho Ops thấy thêm trường Myinfo. **Dealer có được thấy "Additional Personal Particulars" không**: [KHÔNG RÕ] (F5). Demo đang không cho dealer thấy NRIC trả về khi mismatch, phải giữ quy tắc này dù hiện phần này.

---

## 5. VMAF Ops

### UI-15 Ops — All Applications [CORE]
Figure 5.1. Tiêu đề "Ops — All Applications", mô tả "All loan applications submitted today across every dealer — Ops review queue." (chữ "today" có lẽ không đúng ý, [KHÔNG RÕ]). Nút đỏ "+ New Application" góc phải.

Thanh lọc: ô tìm "Search by applicant name / car pl…", dropdown "Singpass Fulfilled? — All" (All/Yes/No), "Filter by status:" dropdown.

| Cột | Nội dung |
|---|---|
| APPLICATION NO. | |
| APPLICATION DATE | 07 Oct 2026 |
| DEALER NAME | |
| HIRER NAME | Tên + NRIC dòng dưới (xám, nhỏ) |
| GUARANTOR | Tên + NRIC, hoặc "—" |
| CAR PLATE NO. | |
| SINGPASS FULFILLED | "Yes" xanh / "No" đỏ |
| CREATED | Người tạo + `DD-MM-YYYY HH:mm` (nháp: "—") |
| STATUS | chip |
| ACTIONS | 👁 xem, ✏️ sửa, 📋 copy link; nháp có thêm "▶ Continue" |

- Ghi chú cho demo:
  - NRIC trong danh sách: demo che (D-41), prototype đầy đủ. Giữ che.
  - "Singpass Fulfilled" = Yes chỉ khi **mọi** party đã xác thực (F9, demo đang làm vậy).
  - Demo chưa có ô tìm kiếm / bộ lọc (đã ghi trong danh sách lệch), và thay "+ New Application" bằng "Expired links (n)", "Demo Control".
  - Nút 📋 copy link để làm gì (gửi qua WhatsApp?): [KHÔNG RÕ] (F8). Nếu làm, phải copy **link hiện hành** và ghi audit.
  - Ops có thấy và "Continue" được nháp của dealer không: [KHÔNG RÕ] (H8).

### UI-16 Ops — Application Details (xem nhanh, popup) [CORE]
Figure 5.2, 5.3. Popup tiêu đề "Application Details" + chip Ref, nút ✕.

Các khối theo thứ tự:
1. **Applicant**: Applicant Name, Applicant NRIC, Applicant Email, Applicant Phone.
2. **Singpass Status**: cho hirer và guarantor, mỗi người 3 cột: "— Status" (Fulfilled / Not Fulfilled), "— Trigger Date", "— Fulfilled Date" + 2 nút "Retrieve MyInfo ({vai})", "Resend Email ({vai})". Sau đó "FI Review Status" (Pending / Completed) + nút "✓ Completed (locked)".
3. **Guarantor Info**: Name, NRIC, Email, Phone.
4. **Vehicle Info**: Car Plate, Make, Model, Registered Date, Manufacturing Year, Engine No., Chassis No., OMV (S$).
5. **Application Info**: Purchase Price (S$), Requested Loan Amount (S$), Requested Tenure, Interest Rate (%), Created At, Last Modified.
6. **Relevant Document(s)**: danh sách đánh số (Uploaded ↗open / Not provided), sau đó các mục sinh ra: "Prefilled Application Form — Generated", "IPA (In-Principle Approval) Notice — Locked {ngày giờ}", "AA (Approval Advice) Notice — Locked {ngày giờ}".
7. **Activity**: danh sách mới nhất ở trên, mỗi dòng "{thời gian} — {hành động} — {chi tiết} ({người})".

Nút cuối: "Close", "✏️ Edit".
- Ghi chú cho demo:
  - Demo hiển thị chi tiết thành **trang** (`/ops/applications/{ref}`), không phải popup. Giữ trang là được, nhưng nên giữ đúng thứ tự khối.
  - Trạng thái Singpass của demo chi tiết hơn prototype (Pending / Opened / Fulfilled / NRIC mismatch / Expired / Queued + lịch sử link "no longer valid"). Prototype chỉ có Fulfilled / Not Fulfilled. Giữ của demo.
  - "Trigger Date" của prototype = thời điểm gửi link hiện hành ở demo.
  - "Retrieve MyInfo" trong prototype là thao tác chính; trong demo chỉ là làm mới tay (F3).
  - FI Review là gì, Ops kiểm tra gì, vì sao khoá vĩnh viễn: [KHÔNG RÕ] (H2). Demo đang không có (D-10).

### UI-17 Ops — Edit Loan Application: Dealer, Applicant, Singpass [FULL]
Figure 5.4. Tiêu đề "← Edit Loan Application" + chip Ref. Mô tả: "Update any field below — vehicle fields can be re-extracted by uploading a fresh logcard PDF. Changes save back onto this same application and are visible to the dealer immediately."
- **Dealer**: Dealer Name*, Dealer Reg. No., Salesperson Name, Salesperson Email.
- **Applicant Details**: như UI-04 + công tắc + Guarantor Details.
- **Singpass Status** + nhãn OPS ONLY: như khối 2 của UI-16.
- Ghi chú cho demo: demo **không cho sửa tự do**. Sửa NRIC/email chỉ qua nút "Correct NRIC / email" có lý do và audit (D-40), vì sửa NRIC phải phát hành link mới. Nếu làm trang Edit đầy đủ thì ô NRIC/email phải đi qua đúng quy tắc D-40 (Round 2 H6 đang hỏi Ops được sửa trường nào ở trạng thái nào).

### UI-18 Ops — Edit: Vehicle Information [FULL]
Figure 5.5. Khối **Vehicle Information**: Input LTA Access Code; vùng tải nét đứt "Upload the OneMotoring "Enquire PARF/COE Rebate" PDF to auto-fill the fields below" (mô tả "reads the PDF export directly in your browser, no server/AI/OCR call"); dòng kết quả "✅ {tên file} Enquire PARF/COE Rebate — 7 field(s) extracted — please verify against the source."; nút "🗑 Clear Upload & Auto-filled Fields". Các ô (viền xanh khi được điền tự động): Vehicle Reg. No. / Plate*, Make, Model, Year of Manufacture, Engine No., Chassis No., OMV (S$).
- Ghi chú: đây là tính năng "LTA log card autofill" trong Proposal 3.1, không liên quan Singpass. Demo đang [OUT].
- Mâu thuẫn nhỏ: prototype đọc PDF ngay trên trình duyệt; Proposal nói hệ thống đọc lớp chữ của PDF. Không ảnh hưởng demo.

### UI-19 Ops — Edit: Loan Requirements, IPA Details, AA Details [FULL, phần khoá AA là CORE]
Figure 5.6.
- **Loan Requirements**: Purchase Price (S$)*, Deposit (S$), Loan Amount (S$)*, Tenure (months)*, Interest Rate (% p.a.)*.
- **IPA Details** + OPS ONLY. Mô tả: "Fill this in whenever the figures for an In-Principle Approval are ready — this does not require Singpass to be Fulfilled first. "Change Status → Issue IPA" checks these three fields before it will let the status change through." Ô: IPA Loan Amount (S$), IPA Tenure (months), IPA Interest Rate (% p.a.), Indicative Monthly Instalment (S$) — computed, Indicative Effective Interest Rate — computed. Dòng xanh "✓ IPA Details complete — Save, then Change Status → Issue IPA is unblocked." + nút "📄 Preview Dummy IPA". Sau khi cấp: dải vàng "🔒 IPA figures locked — issued {ngày giờ} by Ops." + nút "✏️ Amend".
- **AA Details** + OPS ONLY. Mô tả: "An AA (final Approval Advice) additionally requires Singpass to be Fulfilled — that's the one difference between the two. "Change Status → Issue AA" checks both this section and the Singpass status." Ô tương tự (AA Loan Amount, AA Tenure, AA Interest Rate, Monthly Instalment — computed, Effective Interest Rate — computed). Dòng xanh "✓ AA Details complete and Singpass Fulfilled — Save, then Change Status → Issue AA is unblocked." + "📄 Preview Dummy AA".
- Ghi chú cho demo:
  - Điều kiện AA của prototype: **đủ 3 số AA + Singpass Fulfilled**. Demo hiện chỉ kiểm Singpass (D-10, D-11), không nhập số. Nếu làm UI-12, UI-19 thì thêm điều kiện "đủ số AA" vào danh sách điều kiện mở rộng (`approval.ts`).
  - Amend IPA: prototype có, demo không (D-48).
  - Khi dòng "AA is unblocked" chưa thoả, prototype không chụp thông báo đỏ. Demo đã có hộp "Cannot issue AA yet ✗ …", giữ.

### UI-20 Ops — Dummy preview IPA/AA [FULL]
Figure 5.7. Giống UI-12 nhưng: dải đỏ trên cùng "DUMMY — FOR INTERNAL REVIEW ONLY · NOT YET ISSUED", tiêu đề "APPROVAL ADVICE (AA) — DUMMY PREVIEW", Date Issued "Not yet issued — preview only", Issued By "—", chú thích thêm "This copy is a preview only and has not been issued — nothing here has been saved to the application record."

### UI-21 Ops — Edit: Relevant Document(s) [FULL]
Figure 5.8. Mô tả "Documents already submitted with this application are listed below, numbered, alongside the auto-generated Prefilled Application Form. Use the upload zone to attach any further document received after the applicant's original submission (e.g. an additional document Ops asked for)." Mỗi dòng: "Submitted with original application ↗open" hoặc "Generated by Ops — double-click to open". Vùng tải. Nút "🖨 Regenerate Prefilled Application Form".

### UI-22 Ops — Change Status, Request Documents, nút cuối trang [CORE cho Change Status, FULL cho phần còn lại]
Figure 5.9, 5.10.
- **Change Status** + OPS ONLY: dropdown "New Status" (ví dụ "Issue AA"), nút "Apply Status Change". Có kiểm tra điều kiện trước khi đổi.
- **Document(s) Requested From Dealer** + OPS ONLY: chưa có thì "No documents have been requested from the dealer yet." + nút "Request Documents from Dealer". Đã có: Requested, Requested At, "Comment to dealer: …", "✅ Dealer submitted — {ngày giờ}", danh sách file, nút "Request Additional Documents".
- Hàng nút cuối trang: "Cancel", "✓ FI Review Completed (locked)" (khoá vĩnh viễn khi đã bấm), "Decline Application" (chữ đỏ), "Lapse Application", "Save Changes" (đỏ).
- [KHÔNG RÕ] Danh sách giá trị đầy đủ của dropdown New Status (H1). Decline: lý do chọn từ danh sách hay gõ tự do (H4). Lapse: tay hay tự động (H3).
- Ghi chú cho demo: demo đặt Change Status ngay trên trang chi tiết (không cần vào Edit), các lựa chọn hiện có: Issue IPA, Issue AA.

### UI-23 Ops — New Application (manual entry) [FULL]
Figure 5.11. Tiêu đề "← New Application" + nhãn "OPS · MANUAL ENTRY". Mô tả: "Use this only when a dealer's application came in outside the digital form (phone / paper / email) and Singpass still needs to be triggered. Every normal application already appears in the list automatically once the dealer submits it." Khối Dealer (Dealer Name*, Dealer Reg. No., Salesperson Name, Salesperson Email), Applicant Details (như UI-04), khối Singpass Status + OPS ONLY với dòng "Save this application first — Singpass is triggered automatically once it leaves Draft, and its status will show here."
- Ghi chú: lưu xong là phát hành link Singpass giống dealer nộp. Hồ sơ nhập tay thì "người nộp" là Ops, nên quyền resend của dealer (D-04) không áp dụng: [KHÔNG RÕ], đề xuất chỉ Ops resend.

---

## 6. Đầu ra hệ thống [OUT]
Figure 6.1–6.4: file `APPLICATION DETAILS.xlsx` 5 tab (Summary, Applicant & Guarantor, Employment & Commitments, Vehicle & Loan, Documents), thư mục lưu `output/<date> - <application no.>` với tài liệu đổi tên theo chuẩn VMAF, và Prefilled Application Form (Part B, trang 6–7). Không thuộc luồng Singpass; ghi lại để biết. Các câu K1, K3 (Round 2) liên quan.

---

## 7. Điểm demo khác prototype có chủ ý (giữ nguyên)

| Prototype | Demo | Lý do |
|---|---|---|
| Request vào app Singpass của hirer | Link email riêng cho từng người, mở qua `/verify` | Gateway thật của ValueMax (QnA B1.3, BRD Figure 5) |
| Ops bấm Retrieve MyInfo để đánh dấu Fulfilled | Job tự poll mỗi 2 giây, nút Retrieve chỉ là làm mới tay | Mục tiêu "auto verify" (F3) |
| Chỉ hirer có Singpass trên thanh tiến trình | Chip cho từng người | Guarantor cũng phải xác thực (High level requirement) |
| Fulfilled / Not Fulfilled | 7 trạng thái link + lịch sử | Chống lỗi "lệch ID" |
| NRIC hiện đầy đủ | Che, bấm Show có audit | PDPC, D-41 |
| Câu "LTA retrieve automatically" | Bỏ | D-51, Proposal 3.1 |
| 1 guarantor | Tối đa 2 | QnA A2.7 |
| Sửa tự do mọi trường | Sửa NRIC/email có lý do, phát hành link mới | D-40 |

---

## 8. Công thức tính trong prototype

Đối chiếu 3 ví dụ trong prototype:

| Ví dụ | Loan | Tenure | Flat rate | Instalment (prototype) | EIR (prototype) |
|---|---|---|---|---|---|
| Quick Apply / IPA 05121 | 68,600 | 60 | 2.98% | 1,313.69 | 5.86% |
| IPA 05117 | 47,600 | 60 | 3.28% | 923.44 | 6.45% |
| AA 05115 | 75,600 | 72 | 2.98% | 1,237.74 | 5.88% |

- **Monthly Instalment** = Loan × (1 + Flat rate × Tenure / 12) / Tenure, làm tròn 2 số. Khớp cả 3 ví dụ (lãi phẳng, flat rate).
- **Effective Interest Rate** của prototype = Flat rate × 2 × Tenure / (Tenure + 1). Khớp cả 3 ví dụ (5.86, 6.45, 5.88). Đây là **công thức xấp xỉ**. EIR tính đúng theo dòng tiền (annuity) cho ví dụ đầu là khoảng **5.61% (danh nghĩa năm)** hoặc **5.75% (hiệu dụng năm)**, khác 5.86%. Hire purchase ở Singapore phải công bố EIR, nên cần ValueMax xác nhận công thức chính thức (Q7). Chỉ ảnh hưởng nếu demo hiện số (UI-05, UI-12, UI-19).

---

## 9. Câu hỏi cần chốt

| # | Câu hỏi | Ảnh hưởng | Đề xuất mặc định |
|---|---|---|---|
| Q1 | Demo dựng tới đâu: chỉ chuẩn hoá các màn hình [CORE] theo prototype, hay dựng đủ [FULL] (Section B, C, Documents thật, My Applications, IPA/AA số + thông báo, Request Documents, Decline/Lapse, Edit, Manual entry)? | Khối lượng gấp nhiều lần | Chỉ [CORE] + bỏ những dòng chữ hứa hẹn chức năng không có |
| Q2 | Nếu chỉ [CORE]: với dòng "The rest of the form unlocks once this is entered.", bỏ dòng này hay làm thêm Section B/C dạng tối giản (không lưu nhiều)? | UI-05, UI-06 | Làm Section B/C hiển thị đủ ô như prototype, Fill sample điền sẵn, chỉ lưu để hiển thị lại |
| Q3 | Bước Documents trong demo: tải file thật (lưu đĩa), giả lập (chỉ ghi tên file), hay bỏ qua? | UI-07, UI-14, UI-16 | Giả lập: chọn file chỉ lưu tên + dung lượng, kiểm tra quy tắc bắt buộc |
| Q4 | Quy tắc file theo prototype (có ZIP, 4 MB) hay theo QnA/Proposal (không ZIP, có HEIC, 10 MB, 30 file)? | UI-07, UI-13, UI-21 | Theo Proposal |
| Q5 | Bước Review cần 3 ô tick (như hình prototype) hay 2 (như chú thích prototype và demo hiện tại)? | UI-08 | 3 ô như hình |
| Q6 | Thanh tiến trình phía dealer: bước cuối đổi tên theo kết quả (prototype) hay tách "IPA Issued", "AA" (demo)? | UI-11 | Theo prototype, thêm trạng thái AA vào bước cuối |
| Q7 | Công thức EIR: dùng xấp xỉ như prototype hay tính đúng? | UI-05, UI-12, UI-19 | Theo prototype cho demo, ghi chú chờ ValueMax |
| Q8 | Dealer có xem được "Additional Personal Particulars" (dữ liệu Myinfo) trong tab Submitted Details không? | UI-14 | Không, chỉ Ops (theo B1.4), chờ F5 |
| Q9 | "My Applications" của dealer: thấy hồ sơ của cả đại lý hay chỉ của agent đang đăng nhập? | UI-10, quyền resend | Cả đại lý xem được, chỉ agent đã nộp mới resend (D-04) |
| Q10 | Hồ sơ Ops nhập tay: ai được resend? | UI-23 | Chỉ Ops |

Các câu đang chờ ValueMax trả lời (không cần bạn chốt, ghi lại để biết): C2 (PHV Licence), D1 (số guarantor), D2 (employment của guarantor), D3 (FIN), D4 (Loan Amount), D12 (sửa Dealer Declaration), D14 (nháp), E5 (Car Seller Log Card), F1 (kênh gửi), F5 (dữ liệu Myinfo hiển thị), F8 (copy link), G3 (nhiều file một tài liệu), H1 (danh sách trạng thái), H2 (FI Review), H3 (Lapse), H4 (Decline), H6, H7 (quyền sửa), H8 (Ops xem nháp), I6 (IPA trước Credit Review), J1 (WhatsApp), K3 (tải Prefilled Form lúc nào), L5 (che NRIC).
