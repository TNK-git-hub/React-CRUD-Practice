---
kind: delta
change: "001-products-price-range"
capabilities: ["products"]
primary: "products"
status: approved
source: ["docs/requirements/price-range.md#Yêu cầu", "docs/requirements/price-range.md#Ngoài phạm vi", "roadmap 001"]
---

# Change 001: Lọc sản phẩm theo khoảng giá

## Overview

Danh sách sản phẩm dài nên người xem khó tìm hàng vừa ngân sách. Change này cho người xem nhập giá tối thiểu
và/hoặc giá tối đa để danh sách chỉ còn sản phẩm có giá trong khoảng đó, dùng chung được với tìm kiếm, sắp xếp
và phân trang đang có. App chưa có đăng nhập; lọc giá là thao tác đọc công khai.

## Clarifications

### Session 2026-11-12

- Q: Khoảng giá có được ghi lên địa chỉ trang (URL) giống từ khoá tìm kiếm, sắp xếp và số trang hiện nay không? → A: Có. Khoảng giá được ghi lên URL như `q`, `sortBy`; tải lại, Quay lại hay gửi link đều giữ bộ lọc. Không lưu ở đâu khác nên không tính là "lưu bộ lọc giữa các lần truy cập".
- Q: Khi người xem nhập giá không hợp lệ thì hiện thông báo gì cho từng trường hợp (giá âm, có hơn 2 chữ số thập phân, không phải số, lớn hơn 99999999.99)? → A: Âm: "Giá không được âm"; hơn 2 chữ số thập phân: "Giá chỉ được có tối đa 2 chữ số thập phân"; không phải số: "Giá phải là số"; quá giới hạn: "Giá không được lớn hơn $99,999,999.99".
- Q: Bộ lọc giá được áp dụng vào lúc nào: khi người xem bấm nút Search hoặc Enter như tìm kiếm hiện nay, khi bấm một nút riêng, hay tự động trong lúc gõ? → A: Hai ô giá nằm trong form tìm kiếm hiện có; bấm Search hoặc Enter thì áp dụng cả từ khoá và khoảng giá, kiểm tra giá trị trước khi gửi.
- Q: Khi khoảng giá hợp lệ nhưng không có sản phẩm nào, trang hiện gì, và nút "xoá bộ lọc" xoá những gì? → A: Tiêu đề giữ "Không tìm thấy sản phẩm nào"; mô tả "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc."; nút xoá bộ lọc xoá cả từ khoá và khoảng giá, giữ sắp xếp.
- Q: Ô giá có nhận dấu phẩy làm dấu thập phân kiểu Việt ("10,5") hay chỉ nhận dấu chấm ("10.5")? Khoảng trắng đầu và cuối có được bỏ đi không? → A: Chỉ nhận dấu chấm thập phân; bỏ khoảng trắng đầu và cuối; "10,5" hay "1,000" báo "Giá phải là số".
- Q: Địa chỉ trang có giá không hợp lệ thì làm gì? (PROD-002-S6) → A: Bỏ qua giá trị đó và để trống ô, như cách đang xử lý `sortBy` sai; gọi thẳng máy chủ thì vẫn bị từ chối.
- Q: Mở trang vượt số trang của kết quả đã lọc thì làm gì? (PROD-002-S8) → A: Như app hiện xử lý với kết quả tìm kiếm: hiện trạng thái rỗng, ẩn thanh phân trang (frontend/src/views/ProductList.tsx:109, :150; frontend/src/hooks/useProducts.ts:20; backend/src/products/products.service.ts:65-75).
- Q: Đã gõ khoảng giá nhưng chưa bấm Search rồi đổi sắp xếp / trang thì sao? (PROD-002-S11) → A: Dùng khoảng giá đang áp dụng; hai ô trở về giá trị đang áp dụng.
- Q: "1.000" và "1e3" được hiểu thế nào? (PROD-003-S6) → A: Chỉ nhận số thường, dấu chấm là dấu thập phân, tối đa 2 chữ số sau dấu chấm; "1.000" → "Giá chỉ được có tối đa 2 chữ số thập phân", "1e3" → "Giá phải là số".
- Q: Gọi thẳng máy chủ với tham số giá có mặt nhưng rỗng thì sao? (PROD-003-S11) → A: Coi như không giới hạn phía đó.
- Q: Địa chỉ trang có cả hai giá hợp lệ nhưng giá tối thiểu lớn hơn giá tối đa thì sao? (PROD-002-S13) → A: Bỏ qua cả hai giá trị, hai ô để trống, danh sách không lọc theo giá. Luật chung: mọi giá trị giá đọc từ địa chỉ trang không hợp lệ đều bị bỏ qua; thông báo "Giá tối thiểu không được lớn hơn giá tối đa" chỉ hiện khi người xem tự gõ rồi bấm Search.

## Requirements

### products

#### ADDED PROD-001: Lọc danh sách theo khoảng giá

Hệ thống PHẢI chỉ hiển thị trong danh sách sản phẩm những sản phẩm có giá nằm trong khoảng giá người xem nhập,
tính cả hai đầu (BR-PROD-01); bỏ trống một đầu thì không giới hạn phía đó, bỏ trống cả hai thì không lọc theo giá
(BR-PROD-02). Khoảng giá được nhập ở hai ô trong form tìm kiếm hiện có và chỉ được áp dụng khi người xem bấm
Search hoặc Enter, cùng lúc với từ khoá.

- **Permissions:** Người xem (mọi người dùng, không cần đăng nhập) đều được lọc; không vai trò nào bị từ chối.
  Không kiểm tra quyền là ngoại lệ đã biết so với constitution Principle II (`specs/_system/nfr.md`, NFR-011).
- **Scenarios:**
  - `PROD-001-S1` (happy) [P1] — **Given** danh sách có các sản phẩm giá 5, 10, 20 và 30 USD **When** người xem nhập giá tối thiểu 10, giá tối đa 20 rồi bấm Search **Then** danh sách chỉ hiện sản phẩm giá 10 và 20 USD
  - `PROD-001-S2` (happy) [P1] — **Given** danh sách có các sản phẩm giá 5, 10, 20 và 30 USD **When** người xem chỉ nhập giá tối thiểu 20, bỏ trống giá tối đa rồi bấm Search **Then** danh sách chỉ hiện sản phẩm giá 20 và 30 USD
  - `PROD-001-S3` (happy) [P1] — **Given** danh sách có các sản phẩm giá 5, 10, 20 và 30 USD **When** người xem chỉ nhập giá tối đa 10, bỏ trống giá tối thiểu rồi bấm Search **Then** danh sách chỉ hiện sản phẩm giá 5 và 10 USD
  - `PROD-001-S4` (missing) [P2] — **Given** người xem đang lọc theo một khoảng giá **When** người xem xoá trống cả hai ô giá rồi bấm Search **Then** danh sách hiện mọi sản phẩm như khi không lọc
  - `PROD-001-S5` (input) [P3] — **Given** danh sách có các sản phẩm giá 5, 10, 20 và 30 USD **When** người xem nhập giá tối thiểu " 10 " và giá tối đa " 20 " (có khoảng trắng đầu, cuối) rồi bấm Search **Then** khoảng trắng bị bỏ, danh sách chỉ hiện sản phẩm giá 10 và 20 USD, không có thông báo lỗi
  - `PROD-001-S6` (boundary) [P2] — **Given** danh sách có các sản phẩm giá 5, 10, 20 và 30 USD **When** người xem nhập giá tối thiểu 20 và giá tối đa 20 rồi bấm Search **Then** danh sách chỉ hiện sản phẩm giá 20 USD
  - `PROD-001-S7` (boundary) [P1] — **Given** có các sản phẩm giá 19.99, 20.00 và 20.01 USD **When** người xem nhập giá tối thiểu 19.99 và giá tối đa 20 rồi bấm Search **Then** danh sách hiện sản phẩm giá 19.99 và 20.00 USD, không hiện sản phẩm 20.01 USD (so sánh đúng đến 2 chữ số thập phân, không lệch do làm tròn)
  - `PROD-001-S8` (permission) [P2] — **Given** app không có đăng nhập (NFR-011) **When** một yêu cầu lọc giá 10–20 được gửi thẳng tới máy chủ, không kèm danh tính nào **Then** máy chủ trả danh sách đã lọc như khi người xem dùng giao diện (thao tác đọc công khai, ngoại lệ đã biết so với constitution Principle II)
  - `PROD-001-S9` (concurrency) [P2] — **Given** người xem đang xem kết quả lọc giá 10–20 có sản phẩm A giá 15 USD **When** sản phẩm A được sửa giá thành 50 USD, rồi người xem bấm Search lại hoặc tải lại trang **Then** sản phẩm A không còn trong kết quả (danh sách được làm mới ngay sau khi sửa, NFR-001)
  - `PROD-001-S10` (concurrency) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem bấm Search với giá 10–20 rồi ngay lập tức bấm Search với giá 30–40, trước khi kết quả đầu về **Then** danh sách cuối cùng và hai ô giá là của khoảng 30–40, không bị kết quả 10–20 về sau ghi đè
  - `PROD-001-S11` (dependency) [P2] — **Given** bộ nhớ đệm của danh sách (Redis) không hoạt động **When** người xem lọc giá 10–20 **Then** danh sách vẫn hiện đúng sản phẩm giá 10–20 USD (đọc thẳng dữ liệu gốc, NFR-031)
  - `PROD-001-S12` (dependency) [P3] — **Given** máy chủ gặp lỗi khi lấy danh sách **When** người xem lọc giá 10–20 rồi bấm Search **Then** trang hiện trạng thái lỗi tải danh sách đang có (tiêu đề "Không tải dược danh sách sản phẩm", nút thử lại) → Recovery: người xem bấm thử lại; hai ô giá vẫn giữ 10 và 20 nên thử lại dùng đúng khoảng giá; thao tác chỉ đọc nên thử lại không tạo trùng
  - `PROD-001-S13` (data) [P2] — **Given** người xem đang xem kết quả lọc giá 10–20 có sản phẩm A **When** sản phẩm A bị xoá (xoá cứng, `specs/_system/nfr.md`), rồi người xem bấm Search lại hoặc tải lại trang **Then** sản phẩm A không còn trong kết quả và tổng số giảm 1
  - `PROD-001-S14` (domain) [P1] — **Given** kết quả lọc giá 10–20 vừa được tải (đang nằm trong bộ nhớ đệm của danh sách, NFR-001) **When** người xem đổi sang giá 30–40 rồi bấm Search trong thời gian bộ nhớ đệm còn hiệu lực **Then** danh sách hiện sản phẩm giá 30–40 USD, không phải kết quả đã lưu của 10–20
  - `PROD-001-S15` (domain) [P3] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhìn hai ô giá **Then** hai ô ghi rõ đơn vị USD bằng ký hiệu "$", giống giá trên thẻ sản phẩm (ví dụ nhãn "Giá tối thiểu ($)", "Giá tối đa ($)")

#### ADDED PROD-002: Lọc giá kết hợp với tìm kiếm, sắp xếp, phân trang

Hệ thống PHẢI áp dụng khoảng giá cùng lúc với từ khoá tìm kiếm, thứ tự sắp xếp và phân trang đang có, với tổng
số sản phẩm và số trang tính trên kết quả đã lọc; khoảng giá được giữ trên địa chỉ trang cùng với từ khoá, sắp xếp
và số trang. Khi bộ lọc không cho ra sản phẩm nào, hệ thống PHẢI hiện trạng thái rỗng với mô tả chung cho mọi bộ
lọc, và nút xoá bộ lọc xoá cả từ khoá lẫn khoảng giá, giữ nguyên sắp xếp. Giá trị giá đọc từ địa chỉ trang mà không hợp
lệ (từng ô sai, hoặc giá tối thiểu lớn hơn giá tối đa) bị bỏ qua, không hiện thông báo lỗi.

- **Permissions:** Như PROD-001: mọi người xem, không cần đăng nhập; không vai trò nào bị từ chối (NFR-011).
- **Scenarios:**
  - `PROD-002-S1` (happy) [P1] — **Given** có các sản phẩm chứa từ "phone" với giá 50, 150, 300 và 600 USD, và sản phẩm không chứa "phone" giá 200 USD **When** người xem nhập từ khoá "phone", giá 100–500, bấm Search rồi chọn sắp xếp theo giá giảm dần **Then** danh sách chỉ hiện sản phẩm chứa "phone" giá 300 rồi 150 USD, và tổng số hiển thị là 2
  - `PROD-002-S2` (happy) [P1] — **Given** có 15 sản phẩm trong khoảng giá đang lọc và danh sách hiện 10 sản phẩm mỗi trang **When** người xem mở trang 2 **Then** trang 2 hiện 5 sản phẩm còn lại, tổng số hiển thị là 15 và có 2 trang
  - `PROD-002-S3` (happy) [P2] — **Given** người xem đang lọc giá 10–20 **When** người xem tải lại trang, hoặc mở chi tiết một sản phẩm rồi bấm Quay lại **Then** danh sách vẫn lọc theo 10–20 và hai ô giá vẫn hiện 10 và 20
  - `PROD-002-S4` (collection) [P2] — **Given** không có sản phẩm nào giá từ 1000 đến 2000 USD **When** người xem nhập giá 1000–2000 rồi bấm Search **Then** trang hiện tiêu đề "Không tìm thấy sản phẩm nào" và mô tả "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." → Recovery: bấm nút xoá bộ lọc
  - `PROD-002-S5` (collection) [P2] — **Given** người xem đang ở trạng thái rỗng với từ khoá "phone", giá 1000–2000 và sắp xếp theo giá giảm dần **When** người xem bấm nút xoá bộ lọc **Then** từ khoá và hai ô giá được xoá trống, danh sách hiện mọi sản phẩm, vẫn sắp xếp theo giá giảm dần
  - `PROD-002-S6` (input) [P2] — **Given** người xem mở một địa chỉ trang có giá tối thiểu không hợp lệ (ví dụ "abc", do sửa tay hoặc link cũ) và giá tối đa 20 **When** trang danh sách tải **Then** giá trị sai bị bỏ qua: ô giá tối thiểu để trống, không có thông báo lỗi, danh sách chỉ lọc theo giá tối đa 20 (như trang đang xử lý giá trị sắp xếp sai trên địa chỉ); gọi thẳng máy chủ với giá trị đó vẫn bị từ chối (PROD-003-S10)
  - `PROD-002-S7` (boundary) [P3] — **Given** có đúng 10 sản phẩm trong khoảng giá đang lọc và danh sách hiện 10 sản phẩm mỗi trang **When** người xem lọc **Then** danh sách có 1 trang, tổng số hiển thị là 10 và không có trang 2
  - `PROD-002-S8` (collection) [P2] — **Given** khoảng giá đang lọc cho ra 15 sản phẩm (2 trang) **When** người xem mở thẳng địa chỉ trang 5 với khoảng giá đó **Then** như app hiện xử lý với kết quả tìm kiếm: trang hiện trạng thái rỗng (tiêu đề "Không tìm thấy sản phẩm nào", mô tả chung của PROD-002) và ẩn thanh phân trang (nguồn: mục Clarifications) → Recovery: người xem bấm Search để về trang 1 với cùng bộ lọc, hoặc bấm nút xoá bộ lọc
  - `PROD-002-S9` (collection) [P2] — **Given** có 12 sản phẩm cùng giá 10 USD trong khoảng giá đang lọc **When** người xem sắp xếp theo giá rồi chuyển từ trang 1 sang trang 2 **Then** không sản phẩm nào xuất hiện ở cả hai trang và không sản phẩm nào bị thiếu (sản phẩm cùng giá giữ thứ tự ổn định)
  - `PROD-002-S10` (collection) [P2] — **Given** người xem đang ở trang 3 của kết quả lọc giá 10–20 **When** người xem đổi sang giá 30–40 rồi bấm Search **Then** danh sách về trang 1 của kết quả 30–40
  - `PROD-002-S11` (concurrency) [P2] — **Given** người xem đang áp dụng giá 10–20 và đã gõ 30–40 vào hai ô nhưng chưa bấm Search **When** người xem đổi sắp xếp hoặc chuyển trang **Then** danh sách vẫn lọc theo khoảng đang áp dụng 10–20, và hai ô giá trở về 10 và 20
  - `PROD-002-S12` (data) [P2] — **Given** người xem đang lọc giá 10–20 ở trang 2, và trang 2 chỉ còn 1 sản phẩm **When** người xem xoá sản phẩm đó **Then** danh sách lùi về trang 1 như hiện nay và vẫn lọc theo 10–20, hai ô giá vẫn hiện 10 và 20
  - `PROD-002-S13` (input) [P2] — **Given** người xem mở một địa chỉ trang có giá tối thiểu 30 và giá tối đa 10 (mỗi giá trị tự nó hợp lệ) **When** trang danh sách tải **Then** cả hai giá trị bị bỏ qua: hai ô giá để trống, không có thông báo lỗi, danh sách không lọc theo giá

#### ADDED PROD-003: Kiểm tra giá trị khoảng giá

Hệ thống PHẢI từ chối khoảng giá không hợp lệ — giá âm, có hơn 2 chữ số thập phân, không phải số, lớn hơn
99999999.99, hoặc giá tối thiểu lớn hơn giá tối đa — bằng cách chặn trên giao diện kèm thông báo lỗi trước khi
gửi, và máy chủ cũng từ chối khi yêu cầu được gửi thẳng tới (BR-PROD-03 – BR-PROD-07).

Thông báo lỗi trên giao diện, theo từng trường hợp:

| Trường hợp | Thông báo |
| --- | --- |
| Giá tối thiểu lớn hơn giá tối đa | "Giá tối thiểu không được lớn hơn giá tối đa" |
| Giá âm | "Giá không được âm" |
| Có hơn 2 chữ số thập phân | "Giá chỉ được có tối đa 2 chữ số thập phân" |
| Không phải số | "Giá phải là số" |
| Lớn hơn 99999999.99 | "Giá không được lớn hơn $99,999,999.99" |

Ô giá bỏ khoảng trắng đầu, cuối trước khi kiểm tra và chỉ nhận số thường: chữ số, dấu chấm là dấu thập phân, tối đa
2 chữ số sau dấu chấm (đếm theo những gì người xem gõ). Dạng khác là "không phải số", ví dụ "10,5", "1,000", "1e3";
"1.000" có 3 chữ số sau dấu chấm nên vi phạm BR-PROD-04. Gọi thẳng máy chủ với tham số giá có mặt nhưng rỗng thì
coi như không giới hạn phía đó.

- **Permissions:** Như PROD-001: mọi người xem, không cần đăng nhập; không vai trò nào bị từ chối (NFR-011).
- **Scenarios:**
  - `PROD-003-S1` (happy) [P1] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối thiểu 0, giá tối đa 99999999.99 rồi bấm Search **Then** khoảng giá được chấp nhận, không có thông báo lỗi và danh sách được lọc theo khoảng đó
  - `PROD-003-S2` (input) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối thiểu 30, giá tối đa 10 rồi bấm Search **Then** giao diện không gửi yêu cầu lọc và hiện thông báo "Giá tối thiểu không được lớn hơn giá tối đa"; danh sách giữ nguyên → Recovery: người xem sửa một trong hai ô, giá trị đã nhập được giữ lại
  - `PROD-003-S3` (input) [P1] — **Given** máy chủ đang chạy **When** một yêu cầu lấy danh sách được gửi thẳng tới máy chủ với giá tối thiểu 30 và giá tối đa 10 **Then** máy chủ từ chối yêu cầu như dữ liệu không hợp lệ và không trả danh sách → Recovery: bên gọi sửa tham số (giá tối thiểu ≤ giá tối đa) rồi gửi lại; thao tác chỉ đọc nên gửi lại không tạo trùng
  - `PROD-003-S4` (input) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối thiểu "10,5" (hoặc "1,000") rồi bấm Search **Then** giao diện không gửi yêu cầu lọc và hiện "Giá phải là số" ở ô đó → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S5` (input) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối đa là chữ hoặc chuỗi giống tấn công (ví dụ "abc", "<script>", "' OR 1=1 --") rồi bấm Search **Then** giao diện không gửi yêu cầu lọc, hiện "Giá phải là số" và chuỗi được hiển thị nguyên văn, không chạy như mã → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S6` (input) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá "1.000" hoặc "1e3" rồi bấm Search **Then** giao diện không gửi yêu cầu lọc; "1.000" báo "Giá chỉ được có tối đa 2 chữ số thập phân", "1e3" báo "Giá phải là số" → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S7` (boundary) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối thiểu "-0.01" (hoặc "-1") rồi bấm Search **Then** giao diện không gửi yêu cầu lọc và hiện "Giá không được âm"; nhập "0" thì hợp lệ (BR-PROD-03) → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S8` (boundary) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối đa "10.123" rồi bấm Search **Then** giao diện không gửi yêu cầu lọc và hiện "Giá chỉ được có tối đa 2 chữ số thập phân"; nhập "10.12" thì hợp lệ (BR-PROD-04) → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S9` (boundary) [P2] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối đa "100000000" (lớn hơn 99999999.99) rồi bấm Search **Then** giao diện không gửi yêu cầu lọc và hiện "Giá không được lớn hơn $99,999,999.99"; nhập "99999999.99" thì hợp lệ (BR-PROD-06) → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S10` (input) [P1] — **Given** máy chủ đang chạy **When** một yêu cầu lấy danh sách được gửi thẳng tới máy chủ, lần lượt với giá tối thiểu "-1", "10.123", "abc" và "100000000" **Then** máy chủ từ chối từng yêu cầu như dữ liệu không hợp lệ và không trả danh sách (BR-PROD-07) → Recovery: bên gọi sửa tham số rồi gửi lại; thao tác chỉ đọc nên gửi lại không tạo trùng
  - `PROD-003-S11` (missing) [P3] — **Given** có các sản phẩm giá 5, 10, 20 và 30 USD **When** một yêu cầu được gửi thẳng tới máy chủ với tham số giá tối thiểu có mặt nhưng rỗng và giá tối đa 10 **Then** máy chủ coi như không giới hạn phía dưới và trả sản phẩm giá 5 và 10 USD
  - `PROD-003-S12` (missing) [P3] — **Given** người xem đang ở danh sách sản phẩm **When** người xem nhập giá tối thiểu "-1" và giá tối đa "abc" rồi bấm Search **Then** giao diện không gửi yêu cầu lọc và hiện cả hai thông báo, mỗi thông báo ở đúng ô của nó: "Giá không được âm" và "Giá phải là số" → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó
  - `PROD-003-S13` (resource) [P3] — **Given** người xem đang ở danh sách sản phẩm **When** người xem dán vào ô giá một chuỗi rất dài toàn chữ số (ví dụ 100 chữ số) rồi bấm Search **Then** trang không bị treo, giao diện không gửi yêu cầu lọc và hiện "Giá không được lớn hơn $99,999,999.99" → Recovery: người xem sửa ô bị lỗi; giá trị đã nhập được giữ lại; danh sách giữ nguyên kết quả trước đó

### Edge Cases (unassigned)

- _(không còn — đã chuyển thành scenario bởi /spec-edge-cases)_

## Success Criteria

### Measurable Outcomes

- **SC-001:** Danh sách sản phẩm, kể cả khi có lọc khoảng giá, phản hồi trong < 1 giây với dữ liệu seed hiện có (NFR-004).
- **SC-002:** Với mọi khoảng giá hợp lệ trên dữ liệu seed, 0 sản phẩm ngoài khoảng xuất hiện và 0 sản phẩm trong khoảng bị thiếu.
- **SC-003:** 100% khoảng giá không hợp lệ bị chặn trên giao diện trước khi gửi, và 100% yêu cầu không hợp lệ gửi thẳng tới máy chủ bị từ chối.
- **SC-004:** Ô lọc giá hoạt động như trên ở Chrome, Safari, Firefox bản mới trên máy tính (NFR-042).

## Assumptions

- Giá dùng để lọc là giá bán hiện tại hiển thị trên thẻ sản phẩm, đơn vị USD (glossary "Giá"); không phải giá trước giảm. Sai → kết quả lọc lệch với số người xem thấy.
- Lọc chạy trên toàn bộ sản phẩm phía máy chủ, không chỉ trên trang đang hiển thị; nhờ đó tổng số và số trang đúng.
- Đổi khoảng giá đưa danh sách về trang 1, giống tìm kiếm và sắp xếp hiện nay.
- Ràng buộc kỹ thuật từ tài liệu (`GET /products` nhận thêm `minPrice`, `maxPrice`; cột giá `numeric(10,2)`) được xử lý ở plan và contracts, không nằm trong câu requirement. "Máy chủ từ chối" tương ứng với trả 400 trong `rules.md` (BR-PROD-05, BR-PROD-07).
- Brownfield: tìm kiếm, sắp xếp, phân trang đã có chưa được spec; change này giả định chúng giữ nguyên hành vi hiện tại.
- Change này sửa 2 hành vi có sẵn (PROD-002): (1) thông báo khi danh sách rỗng đổi thành mô tả chung cho mọi bộ lọc,
  kể cả khi chỉ tìm theo từ khoá; (2) nút xoá bộ lọc xoá cả khoảng giá, không chỉ từ khoá. Không ghi được `MODIFIED`
  vì hành vi cũ chưa có requirement trong `specs/capabilities/products/spec.md` (brownfield), nên hai thay đổi nằm trong
  requirement `ADDED` PROD-002.

## Out of Scope

- Lọc theo mức giảm giá (docs/requirements/price-range.md#Ngoài phạm vi).
- Lưu bộ lọc giữa các lần truy cập (docs/requirements/price-range.md#Ngoài phạm vi): không lưu trong trình duyệt hay trên máy chủ; giữ khoảng giá trên URL (PROD-002) không tính là lưu.
- Đơn vị tiền khác USD (docs/requirements/price-range.md#Ngoài phạm vi).
- Mâu thuẫn giá `≥ 0` (máy chủ) / `> 0` (form tạo sản phẩm) — không sửa trong change này (roadmap.md).
- Thêm đăng nhập hoặc kiểm tra quyền (NFR-011).
