# Yêu cầu phi chức năng — [Tên app]

<!--
Mỗi mục có ID NFR-NNN và CON SỐ đo được. Tài liệu yêu cầu không nói → [NEEDS CLARIFICATION], không tự chọn.
Mục "Dữ liệu và chính sách xoá" là BẮT BUỘC theo constitution (nguyên tắc III):
change nào có thao tác xoá dữ liệu không được merge khi mục này còn NEEDS CLARIFICATION.
Không chọn stack ở đây; stack do plan.md của change đầu tiên quyết định.
-->

## Hiệu năng

| ID | Yêu cầu | Con số | Nguồn |
| --- | --- | --- | --- |
| NFR-001 | [trang danh sách hiển thị trong] | [≤ 1 giây với N bản ghi] | [...] |

## Bảo mật và phân quyền

| ID | Yêu cầu | Nguồn |
| --- | --- | --- |
| NFR-010 | Mọi kiểm tra quyền thực hiện ở backend (constitution, nguyên tắc II) | constitution |
| NFR-011 | [cách đăng nhập, thời hạn phiên] | [...] |

### Ma trận quyền

| Thao tác \ Vai trò | [Vai trò 1] | [Vai trò 2] |
| --- | --- | --- |
| [tạo X] | ✓ | ✗ |

## Dữ liệu và chính sách xoá (bắt buộc)

| Loại dữ liệu | Xoá mềm / xoá cứng | Giữ dữ liệu đã xoá trong | Ai được khôi phục | Nguồn |
| --- | --- | --- | --- | --- |
| [X] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [...] |

## Khả dụng và vận hành

| ID | Yêu cầu | Con số | Nguồn |
| --- | --- | --- | --- |
| NFR-030 | [thời gian hoạt động, sao lưu] | [...] | [...] |

## Môi trường người dùng

| ID | Yêu cầu | Nguồn |
| --- | --- | --- |
| NFR-040 | [trình duyệt, thiết bị, ngôn ngữ giao diện, múi giờ] | [...] |

## Câu hỏi còn mở

- [NEEDS CLARIFICATION: …]
