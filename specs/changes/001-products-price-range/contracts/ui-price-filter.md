# Contract: bộ lọc khoảng giá trên trang danh sách

**Spec**: PROD-001, PROD-002, PROD-003 · Trang `/` và `/products/search` (`frontend/src/views/ProductList.tsx`)

## Thành phần

| Thành phần | Nội dung |
| --- | --- |
| Ô "Giá tối thiểu ($)" | ô chữ, bàn phím số thập phân; nằm trong form tìm kiếm hiện có |
| Ô "Giá tối đa ($)" | như trên |
| Nút Search / phím Enter | áp dụng cùng lúc từ khoá và khoảng giá; đưa về trang 1 |
| Thông báo lỗi | hiện dưới đúng ô bị lỗi; min > max hiện ở ô giá tối thiểu |

## Thông báo (nguyên văn từ spec)

| Trường hợp | Thông báo |
| --- | --- |
| Giá tối thiểu lớn hơn giá tối đa | "Giá tối thiểu không được lớn hơn giá tối đa" |
| Giá âm | "Giá không được âm" |
| Có hơn 2 chữ số thập phân | "Giá chỉ được có tối đa 2 chữ số thập phân" |
| Không phải số | "Giá phải là số" |
| Lớn hơn 99999999.99 | "Giá không được lớn hơn $99,999,999.99" |
| Danh sách rỗng (tiêu đề) | "Không tìm thấy sản phẩm nào" |
| Danh sách rỗng (mô tả) | "Không có sản phẩm nào khớp bộ lọc hiện tại. Thử nới khoảng giá hoặc xoá bộ lọc." |

Có lỗi → không gửi yêu cầu, không đổi URL, giữ nguyên giá trị đã gõ và danh sách đang hiện. Các thông báo này chỉ hiện
khi người xem tự gõ rồi bấm Search; giá trị sai đọc từ URL không bao giờ sinh thông báo.

## Trạng thái trên URL

| Hành động | URL sau hành động |
| --- | --- |
| Search với từ khoá / khoảng giá hợp lệ | đặt `q`, `minPrice`, `maxPrice` (ô trống → bỏ khoá), bỏ `page` |
| Đổi sắp xếp | đặt `sortBy`, `order`, bỏ `page`; giữ `q`, `minPrice`, `maxPrice` |
| Chuyển trang / xoá sản phẩm cuối trang | đặt `page`; giữ mọi khoá khác |
| Nút xoá bộ lọc (ở trạng thái rỗng) | bỏ `q`, `minPrice`, `maxPrice`, `page`; giữ `sortBy`, `order` |
| Mở URL có `minPrice` / `maxPrice` không hợp lệ | giá trị đó bị bỏ qua: ô để trống, không lọc theo đầu đó, không báo lỗi (PROD-002-S6) |
| Mở URL có cả hai giá hợp lệ nhưng `minPrice > maxPrice` | bỏ qua cả hai: hai ô để trống, không lọc theo giá, không báo lỗi (PROD-002-S13) |

Hai ô giá luôn hiện khoảng đang áp dụng trên URL; giá trị đã gõ mà chưa bấm Search bị bỏ khi URL đổi (PROD-002-S11).
