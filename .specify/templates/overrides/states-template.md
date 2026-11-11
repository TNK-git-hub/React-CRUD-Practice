# Trạng thái: [entity] ([domain])

<!--
Vòng đời của một entity. Dùng để tìm edge case: MỌI ô trong bảng phải có giá trị.
- "→ X": chuyển sang trạng thái X
- "✗ <lý do>": bị từ chối (cần ít nhất một scenario chiều 5 cho mỗi ô ✗ có thể xảy ra)
- "= (no-op)": hợp lệ nhưng không đổi gì (idempotent)
Đây là LUẬT NGHIỆP VỤ ĐÃ CHỐT (từ tài liệu yêu cầu), dùng làm chuẩn đối chiếu.
Hành vi đã thực sự có trong hệ thống thì xem spec.md.
-->

## Trạng thái

| Trạng thái | Ý nghĩa |
| --- | --- |
| [draft] | [...] |
| [active] | [...] |

## Sự kiện

| Sự kiện | Ai gây ra |
| --- | --- |
| [create] | [...] |
| [edit] | [...] |

## Bảng chuyển trạng thái

| Trạng thái \ Sự kiện | [create] | [edit] | [delete] |
| --- | --- | --- | --- |
| (chưa tồn tại) | → [draft] | ✗ không tồn tại | ✗ không tồn tại |
| [draft] | ✗ đã tồn tại | → [draft] | → [deleted] |

## Câu hỏi còn mở

- [NEEDS CLARIFICATION: …]
