---
kind: delta
change: "[NNN-ten-change]"
capabilities: ["[domain]"]
primary: "[domain]"
status: draft            # draft | approved | implementing | archived
source: ["[docs/requirements/<file>#<mục>]", "roadmap [NNN]"]
---

<!--
HƯỚNG DẪN CHO AGENT (xoá khối này sau khi điền xong)
- Đây là SPEC DELTA của một change, không phải spec sống. Nó mô tả change này THÊM / SỬA / BỎ gì.
- Trước khi viết: đọc specs/_system/* và specs/capabilities/<domain>/ của mọi domain liên quan.
  Requirement đã tồn tại trong capability → dùng MODIFIED <ID cũ>; không tạo requirement trùng.
- ID requirement mới = số tiếp theo của domain đó (xem capability spec.md và history.md; ID đã bỏ không dùng lại).
- Mỗi requirement: một câu "Hệ thống MUST …" mô tả hành vi quan sát được, KHÔNG nói công nghệ.
- Mỗi requirement có ít nhất 1 scenario happy; scenario edge case do /spec-edge-cases bổ sung.
- Không tự bịa con số, giới hạn, quyền: ghi [NEEDS CLARIFICATION: câu hỏi].
- Giữ nguyên các heading tiếng Anh (Overview, Requirements, Success Criteria, Assumptions):
  các lệnh core của Spec Kit (clarify, analyze, checklist, plan) tìm theo tên này.
-->

# Change [NNN]: [Tên change]

## Overview

[2–4 câu: change này giải quyết việc gì, cho ai, vì sao cần. Không nói công nghệ.]

## Requirements

### [domain]

#### ADDED [MÃ]-[NNN]: [Tên requirement]

Hệ thống MUST [hành vi quan sát được].

- **Quyền:** [vai trò nào được làm; vai trò nào bị từ chối]
- **Scenarios:**
  - `[MÃ]-[NNN]-S1` (happy) [P1] — **Given** [trạng thái ban đầu] **When** [hành động] **Then** [kết quả quan sát được]

#### MODIFIED [MÃ]-[NNN]: [Tên requirement đã có]

[Viết lại TOÀN BỘ requirement và TẤT CẢ scenario như sau khi sửa — spec-archive sẽ thay nguyên khối.]

#### REMOVED [MÃ]-[NNN]: [Tên requirement đã có]

- **Lý do:** [vì sao bỏ]
- **Chuyển đổi:** [dữ liệu / người dùng hiện tại được xử lý thế nào]

#### RENAMED [MÃ]-[NNN]

- **Từ:** [tên cũ]
- **Thành:** [tên mới]

### Edge Cases (chưa gắn requirement)

<!-- Chỗ để /speckit-clarify ghi tạm. /spec-edge-cases sẽ chuyển từng dòng thành scenario có ID rồi xoá dòng ở đây. -->

- [mô tả tình huống biên chưa xếp vào requirement nào]

## Success Criteria

### Measurable Outcomes

- **SC-001:** [kết quả đo được, có con số; vd "người dùng tạo xong một mục trong ≤ 3 thao tác"]

## Assumptions

- [giả định đang dùng; mỗi giả định sai sẽ làm spec sai ở đâu]

## Out of Scope

- [những gì change này cố ý KHÔNG làm]
