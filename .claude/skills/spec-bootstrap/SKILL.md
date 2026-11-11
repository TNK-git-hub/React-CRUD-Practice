---
name: spec-bootstrap
description: Biến tài liệu yêu cầu trong docs/requirements/ thành kiến thức nền (specs/_system/), thư mục capability cho từng domain, bảng mã domain, roadmap change và traceability. Chạy MỘT lần khi bắt đầu một app mới, trước change 001.
argument-hint: "[thư mục tài liệu yêu cầu, mặc định docs/requirements/]"
disable-model-invocation: true
---

# spec-bootstrap

Bạn đang khởi tạo kiến thức nền cho một app mới từ tài liệu yêu cầu. Kết quả là đầu vào cho mọi
change sau này, nên ưu tiên **đúng và đủ** hơn nhanh. Bạn KHÔNG viết code, KHÔNG chọn stack,
KHÔNG tạo change hay branch.

## Đầu vào

```text
$ARGUMENTS
```

Thư mục tài liệu yêu cầu = `$ARGUMENTS` nếu có, ngược lại `docs/requirements/`.

## Bước 0 — Điều kiện trước

1. Đọc mọi file `.md` trong thư mục tài liệu yêu cầu. Không có file nào → dừng, báo người dùng.
2. Nếu `specs/_system/roadmap.md` đã tồn tại → app đã được bootstrap. Dừng và hỏi người dùng:
   chạy lại sẽ ghi đè kiến thức nền. Không tự ghi đè.
3. Đọc `.specify/memory/constitution.md`, `.claude/CLAUDE.md`, `specs/_system/edge-case-catalog.md`.
4. Lấy template bằng script (bản trong `.specify/templates/overrides/` được ưu tiên):

   ```bash
   bash .specify/scripts/bash/resolve-template.sh <tên-template>
   ```

   Các template cần: `glossary-template`, `domain-model-template`, `nfr-template`,
   `roadmap-template`, `traceability-template`, `capability-template`, `states-template`,
   `rules-template`, `history-template`.

## Bước 1 — Phân tích tài liệu (chưa ghi file)

Lập danh sách làm việc, mỗi mục ghi rõ nguồn (file + mục):

- **Mục yêu cầu chức năng.** Tài liệu chưa đánh mã → tự đánh `REQ-01`, `REQ-02`… theo thứ tự xuất hiện.
- **Vai trò người dùng** và quyền của từng vai trò.
- **Entity** và quan hệ; entity nào có vòng đời (trạng thái).
- **Luật nghiệp vụ** (giữ mã gốc nếu tài liệu có, vd `BR-01`).
- **Yêu cầu phi chức năng** (hiệu năng, bảo mật, môi trường…).
- **Ngoài phạm vi** và **thứ tự ưu tiên** nếu tài liệu có.
- **Chỗ chưa rõ** → câu hỏi `[NEEDS CLARIFICATION: …]`.

Không suy diễn thêm yêu cầu không có trong tài liệu.

## Bước 2 — Chia domain

- Nhóm theo khái niệm **người dùng nhận ra** (vd "Phòng", "Hoá đơn"), KHÔNG chia theo tầng kỹ thuật
  (API, UI, DB).
- Mỗi entity thuộc đúng một domain.
- Mỗi domain: tên thư mục `kebab-case` tiếng Anh + mã 3–5 chữ in hoa, duy nhất (vd `rooms` / `ROOM`).
- Mã không được trùng với từ hay gặp trong code hoặc ghi chú, vì sẽ lẫn khi tìm kiếm:
  `TODO`, `FIX`, `NOTE`, `TEST`, `TASK`, `BUG`, `HACK`, `XXX`, `NFR`, `REQ`, `BR`, `SC`.
  Gặp trường hợp này thì chọn mã khác (vd domain `todos` → `TDO` hoặc `ITEM`).
- Đăng nhập / tài khoản thường là domain riêng (vd `auth` / `AUTH`) nếu tài liệu có.

## Bước 3 — Ghi kiến thức nền vào `specs/_system/`

Điền từ template, giữ mọi heading của template, xoá khối HTML hướng dẫn sau khi điền:

| File | Nội dung |
| --- | --- |
| `glossary.md` | Thuật ngữ, vai trò, tên dùng trong code |
| `domain-model.md` | Entity, thuộc tính, quan hệ, sơ đồ mermaid |
| `nfr.md` | NFR có con số. **Mục "Dữ liệu và chính sách xoá" bắt buộc**: tài liệu không nói → để `[NEEDS CLARIFICATION]` cho từng ô, không tự chọn xoá mềm hay xoá cứng |
| `roadmap.md` | Danh sách change (Bước 5) |
| `traceability.md` | Mục yêu cầu → change (Bước 5) |

Không sửa `edge-case-catalog.md` trừ mục "13. Domain riêng": thêm câu hỏi cho những bẫy nghiệp vụ
mà tài liệu cho thấy rõ (vd "phòng đã đủ người"), mỗi dòng một câu hỏi.

## Bước 4 — Tạo `specs/capabilities/<domain>/` cho từng domain

| File | Nội dung |
| --- | --- |
| `spec.md` | Từ `capability-template`: chỉ điền Overview; phần Requirements giữ `_(chưa có)_` |
| `states.md` | Từ `states-template`, cho mỗi entity có vòng đời của domain. Mọi ô phải có giá trị |
| `rules.md` | Từ `rules-template`: luật nghiệp vụ của domain, mã `BR-<MÃ>-NN`, ghi nguồn |
| `history.md` | Từ `history-template`, để trống |

**Không viết requirement vào `spec.md`.** Spec sống chỉ có nội dung khi một change được archive.

## Bước 5 — Roadmap và traceability

Chia change theo luật trong `roadmap-template`:

- `001` là walking skeleton: khung app + test + kiểm tra kiểu + CI chạy được + MỘT luồng nhỏ nhất
  xuyên suốt (thường là đăng nhập hoặc tạo/xem đối tượng chính).
- Mỗi change một kết quả người dùng thấy được, làm xong trong 1–3 ngày.
- Change chỉ phụ thuộc change có số nhỏ hơn.
- Mọi mục REQ, BR, NFR có change phụ trách trong `traceability.md`; mục ngoài phạm vi ghi
  "ngoài phạm vi"; mục không xếp được → "Chưa xếp được" + `[NEEDS CLARIFICATION]`.

## Bước 6 — Đăng ký mã domain

Trong `.claude/CLAUDE.md`, chỉ sửa **bảng mã domain** (bảng có cột `Mã | Domain` trong mục
"Quy ước ID"): thay dòng `_(chưa có)_` bằng một dòng cho mỗi domain. Không sửa phần nào khác của file.

Nếu không tìm thấy bảng đó, hoặc bảng đã có mã khác (không phải `_(chưa có)_`): KHÔNG tự sửa dòng nào.
Ghi danh sách mã vào báo cáo Bước 8 và báo người dùng rằng `CLAUDE.md` không đúng mẫu harness.

## Bước 7 — Tự kiểm tra trước khi báo

- [ ] Đủ 5 file trong `specs/_system/` (không tính catalog), không còn khối HTML hướng dẫn.
- [ ] Mỗi domain có đủ 4 file; `spec.md` chưa có requirement nào.
- [ ] Mọi ô trong mọi bảng `states.md` có giá trị.
- [ ] Mọi mục REQ / BR / NFR trong tài liệu xuất hiện trong `traceability.md`.
- [ ] `roadmap.md`: số liên tục, `001` là walking skeleton, không phụ thuộc ngược.
- [ ] Không con số, giới hạn hay quyền nào bịa ra ngoài tài liệu.
- [ ] Mã domain trong `CLAUDE.md` khớp tên thư mục trong `specs/capabilities/`.

Mục nào không đạt → sửa rồi kiểm lại.

## Bước 8 — Báo cáo và DỪNG

Báo cho người dùng:

1. Danh sách domain (thư mục, mã, entity chính).
2. Bảng roadmap rút gọn (change, mục tiêu, phụ thuộc).
3. **Toàn bộ câu hỏi `[NEEDS CLARIFICATION]`**, gom theo file, đánh số để người dùng trả lời.
4. Các file đã tạo / sửa.

Sau đó **dừng lại chờ người dùng duyệt `roadmap.md`** và trả lời các câu hỏi.
Không tự chạy `/speckit-specify`, không tạo branch, không commit.
