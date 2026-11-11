# CLAUDE.md — AI-native-practice

Spec harness theo Spec-Driven Development (Spec Kit, level 4), chưa gắn với app nào.
Spec là nguồn sự thật; code và test phải truy ngược về spec qua ID.
Khi có app: đưa tài liệu yêu cầu vào `docs/requirements/`, chạy `/spec-bootstrap`, rồi làm lần lượt các change trong `specs/_system/roadmap.md`.

## Branch

- Branch chính là `new-project` (KHÔNG dùng `main`). Mọi PR vào `new-project`; mọi so sánh diff lấy `new-project` làm gốc.
- Setup harness: branch `harness/<việc>` (vd `harness/day1-init`).
- Change tính năng: branch `NNN-<tên>` do `/speckit-specify` tự tạo. Không tự đặt tên branch dạng `NNN-...` cho việc khác.

## Cấu trúc thư mục

```
.claude/
  CLAUDE.md                 file này
  skills/                   speckit-* (do Spec Kit sinh, KHÔNG sửa tay) + spec-bootstrap, spec-edge-cases, spec-archive (tự viết)
  agents/                   spec-writer.md, planner.md, implementer.md
  hooks/                    allow_paths.py (chặn ghi sai thư mục)
  settings.json             quyền chung
.specify/
  memory/constitution.md    nguyên tắc dự án
  templates/overrides/      template đã sửa (spec-template.md = khuôn delta, capability-template.md = khuôn spec sống)
  scripts/                  next_change.py, spec_check.py + script core của Spec Kit
tools/speckit-level4/       preset local thay lệnh speckit.specify
docs/requirements/          tài liệu yêu cầu gốc (BA, khách)
specs/
  _system/                  edge-case-catalog.md (dùng chung); glossary.md, domain-model.md, nfr.md, roadmap.md, traceability.md (do spec-bootstrap tạo cho từng app)
  capabilities/<domain>/    SPEC SỐNG: spec.md, states.md, rules.md, history.md
  changes/NNN-<tên>/        CHANGE ĐANG LÀM: spec.md (kind: delta), plan.md, research.md, tasks.md, checklists/, contracts/
  archive/NNN-<tên>/        change đã gộp vào capabilities
tests/<domain>/             test, tên test bắt đầu bằng scenario ID
```

Hai loại `spec.md`, phân biệt bằng vị trí:
- `specs/capabilities/<domain>/spec.md`: hệ thống ĐANG làm gì. Không bao giờ chứa chữ ADDED/MODIFIED/REMOVED.
- `specs/changes/NNN-<tên>/spec.md`: change này thêm/sửa/bỏ gì. Có frontmatter `kind: delta`, `capabilities: [...]`, `primary`, `status`; nội dung chia mục `## <domain>`, mỗi requirement ghi `ADDED` / `MODIFIED <ID>` / `REMOVED <ID>`.

## Quy ước ID

- Requirement: `<MÃ>-<NNN>`, vd `ABC-003`.
- Scenario: `<MÃ>-<NNN>-S<n>`, vd `ABC-003-S2`, dạng Given / When / Then.
- Mã domain: chưa có. `/spec-bootstrap` tạo bảng mã ở đây khi có tài liệu yêu cầu; domain mới phải có trong bảng trước khi dùng.

| Mã | Domain |
| --- | --- |
| _(chưa có)_ | |

- ID đã bỏ (ghi trong `history.md`) không bao giờ được cấp lại.
- Tên (hoặc mô tả) của test bắt đầu bằng scenario ID, vd `ABC-003-S2 ...`, bất kể framework test nào.

## Luồng một change

1. `/speckit-specify` → tạo `specs/changes/NNN-<tên>/spec.md`. Trước khi viết: đọc `specs/_system/*` và `capabilities/<domain>/` liên quan.
2. `/speckit-clarify` → luôn chạy ở phiên chính (subagent không hỏi người dùng được).
3. `/spec-edge-cases` → rà `edge-case-catalog.md`, thêm scenario có ID và P1–P3 vào `spec.md`; ghi `checklists/edge-cases.md`.
4. `/speckit-checklist edge cases`
5. **DỪNG — chờ người dùng duyệt spec.**
6. `/speckit-plan` → `/speckit-tasks`
7. **DỪNG — chờ người dùng duyệt plan và tasks.**
8. `/speckit-implement` → `/speckit-converge` đến khi báo `Converged`; bộ test của stack phải xanh.
9. `/spec-archive <change>` ở phiên chính → gộp vào `capabilities/`, chuyển change sang `archive/`.
10. Hai commit (code; spec) → push → PR vào `new-project` → CI → review → merge.

## Luật cứng

- Chỉ `spec-archive` được sửa `specs/capabilities/`.
- Spec sai hoặc thiếu khi đang implement: dừng lại và báo, không tự sửa spec cho khớp code.
- Test đỏ: sửa code, không sửa test cho xanh.
- Không tự bịa giới hạn, con số, quyền: chỗ chưa rõ ghi `[NEEDS CLARIFICATION]`.
- Xoá dữ liệu theo đúng chính sách trong `specs/_system/nfr.md`; chưa có chính sách thì ghi `[NEEDS CLARIFICATION]`, không tự chọn.
- Stack do `plan.md` của change đầu tiên chọn; luôn bật chế độ kiểm tra kiểu chặt nhất của stack đó.
- Không `git push` thay người dùng; không push thẳng vào `new-project`.
- Không sửa tay `.claude/skills/speckit-*` hay template core: thay đổi đặt trong `tools/speckit-level4/` hoặc `.specify/templates/overrides/`.

## Trạng thái harness

Đang setup theo roadmap 7 ngày. Skill hoặc file nào được nhắc ở trên mà chưa tồn tại thì báo người dùng, không tự tạo thay.

## Ngôn ngữ

Spec, plan, tasks viết tiếng Việt. ID, tên file, tên biến, code và commit message viết tiếng Anh.
