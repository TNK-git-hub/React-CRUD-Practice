---
description: Create a delta spec for one change in specs/changes/NNN-<name>/spec.md, against the living capability specs.
handoffs:
  - label: Clarify Spec Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
    send: true
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
scripts:
  sh: scripts/bash/resolve-template.sh spec-template --json
  ps: scripts/powershell/resolve-template.ps1 spec-template -Json
  py: scripts/python/resolve_template.py spec-template --json
---

<!--
Preset speckit-level4 (tools/speckit-level4/), thay lệnh core speckit.specify.
Khác lệnh core ở 5 chỗ:
  1. Số change do .specify/scripts/next_change.py cấp; thư mục là specs/changes/NNN-<tên>/.
  2. Tự tạo branch NNN-<tên> (repo không dùng git extension của Spec Kit).
  3. Đọc specs/_system/* và specs/capabilities/<domain>/ trước khi viết.
  4. Requirement đã có → MODIFIED <ID cũ>; requirement mới → ADDED với ID kế tiếp của domain.
  5. Điền frontmatter kind/change/capabilities/primary/status/source.
  Ngoài ra: không tự bịa con số, giới hạn, quyền, chính sách xoá (bỏ giới hạn 3 câu hỏi của lệnh core
  cho các loại này) và không hỏi người dùng giữa chừng — câu hỏi để cho __SPECKIT_COMMAND_CLARIFY__.
Sửa file này trong tools/speckit-level4/ rồi chạy lại `specify preset add --dev tools/speckit-level4`;
KHÔNG sửa tay .claude/skills/speckit-specify/SKILL.md (file sinh ra).
-->

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before specification)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_specify` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

The text the user typed after `__SPECKIT_COMMAND_SPECIFY__` in the triggering message **is** the
feature description. Assume you always have it available in this conversation even if `{ARGS}`
appears literally below. Do not ask the user to repeat it unless they provided an empty command.

Repo này là spec harness level 4 (đọc `.claude/CLAUDE.md`). Spec viết tiếng Việt; ID, tên file,
tên thư mục, tên branch viết tiếng Anh. Lệnh này tạo **một** change, chỉ ghi vào
`specs/changes/<change>/` và `.specify/feature.json`. Không sửa `specs/capabilities/`,
`specs/_system/` hay code.

### Bước 1 — Đọc kiến thức nền (trước khi viết bất cứ gì)

1. Đọc `.claude/CLAUDE.md` (luồng, quy ước ID, **bảng mã domain**) và `.specify/memory/constitution.md`.
2. Đọc mọi file có trong `specs/_system/`: `glossary.md`, `domain-model.md`, `nfr.md`, `roadmap.md`,
   `traceability.md`, `edge-case-catalog.md`. File nào chưa có thì ghi nhận, không tự tạo.
3. Xác định domain mà feature đụng tới, dựa vào glossary, domain-model và bảng mã domain:
   - Mỗi domain phải có trong bảng mã domain của `CLAUDE.md` **và** có thư mục
     `specs/capabilities/<domain>/`. Thiếu một trong hai → **DỪNG**, báo người dùng rằng domain
     mới phải được đăng ký trước (qua `/spec-bootstrap` hoặc sửa bảng mã). Không tự đăng ký.
   - `primary` = domain chứa phần lớn hành vi của change.
4. Với **mỗi** domain liên quan, đọc `specs/capabilities/<domain>/spec.md`, `states.md`, `rules.md`,
   `history.md`. Lập bảng các requirement đang có (ID, tên, tóm tắt hành vi) và các ID đã bỏ.
5. Nếu `roadmap.md` có dòng change khớp với feature: dùng đúng tên ngắn của dòng đó và ghi dòng đó
   vào frontmatter `source`. Feature không khớp dòng nào → vẫn tạo change, nhưng ghi vào
   Assumptions: "Change này không có trong roadmap.md".

### Bước 2 — Kiểm tra input

Input tốt có đủ 5 ý: **ai** (vai trò), **làm gì**, **vì sao**, **ràng buộc** (giới hạn, quyền, dữ liệu),
**ngoài phạm vi**. Ý nào thiếu → không đoán; đặt `[NEEDS CLARIFICATION: …]` đúng chỗ trong spec.

### Bước 3 — Cấp số, tạo branch và thư mục

1. Tạo tên ngắn 2–4 từ, kebab-case tiếng Anh, dạng hành động–danh từ (vd `product-bulk-delete`).
   Có dòng roadmap khớp → dùng tên của dòng đó.
2. Chạy từ thư mục gốc repo:

   ```bash
   python3 .specify/scripts/next_change.py --name <short-name> --json
   ```

   (Windows: `python` thay cho `python3`.) Lấy `FEATURE_NUM`, `CHANGE_NAME`, `FEATURE_DIR` từ JSON.
   Script lỗi → **DỪNG** và báo nguyên văn lỗi. Không tự đếm số bằng tay.
   Nếu số change khác số của dòng roadmap khớp → báo người dùng, vẫn dùng số của script.
3. Tạo branch:
   - `git rev-parse --abbrev-ref HEAD`. Nếu branch hiện tại không phải `new-project` → nói rõ
     branch hiện tại và **hỏi người dùng** có tạo branch change từ đây không; chưa có xác nhận thì dừng.
   - Branch `CHANGE_NAME` đã tồn tại (`git rev-parse --verify --quiet <CHANGE_NAME>`) → **DỪNG**, báo người dùng.
   - `git checkout -b <CHANGE_NAME>`. Thay đổi chưa commit đi theo sang branch mới; nêu chúng trong báo cáo.
4. Lấy template: chạy `{SCRIPT}` từ thư mục gốc repo, đọc `TEMPLATE_CONTENT` (bản override delta trong
   `.specify/templates/overrides/spec-template.md`). Script lỗi → **DỪNG** và báo lỗi. Không copy file
   template từ đĩa thay cho script.
5. `mkdir -p <FEATURE_DIR>`, ghi `TEMPLATE_CONTENT` vào `<FEATURE_DIR>/spec.md` làm điểm xuất phát.
6. Ghi `.specify/feature.json` với giá trị thật:

   ```json
   { "feature_directory": "specs/changes/<CHANGE_NAME>" }
   ```

   Các lệnh sau (`__SPECKIT_COMMAND_CLARIFY__`, `__SPECKIT_COMMAND_PLAN__`, …) tìm change qua file này.

### Bước 4 — Viết spec delta

Viết vào `<FEATURE_DIR>/spec.md` theo đúng khuôn template; giữ nguyên các heading tiếng Anh
(`Overview`, `Requirements`, `Success Criteria`, `Assumptions`, `Out of Scope`) vì các lệnh core tìm theo tên.
Xoá khối HTML hướng dẫn của template sau khi điền.

**Frontmatter** (bắt buộc đủ):

```yaml
---
kind: delta
change: "<CHANGE_NAME>"
capabilities: ["<domain>", ...]   # mọi domain có mục trong Requirements
primary: "<domain>"
status: draft
source: ["docs/requirements/<file>#<mục>", "roadmap <NNN>"]   # nguồn có thật; không có thì bỏ phần tử đó
---
```

**Requirements** — một mục `### <domain>` cho mỗi domain trong `capabilities`, theo thứ tự `primary` trước:

- Hành vi feature **đã có** requirement trong capability (cùng hành vi, dù tên khác) →
  `#### MODIFIED <ID cũ>: <tên>`: viết lại **toàn bộ** requirement và **tất cả** scenario như sau khi sửa
  (spec-archive thay nguyên khối). Không tạo requirement mới trùng nghĩa.
- Bỏ một requirement đang có → `#### REMOVED <ID>: <tên>` kèm **Lý do** và **Chuyển đổi**.
- Chỉ đổi tên → `#### RENAMED <ID>` kèm **Từ** / **Thành**.
- Hành vi mới → `#### ADDED <MÃ>-<NNN>: <tên>`.
  - `<MÃ>` lấy từ bảng mã domain. `<NNN>` = số lớn nhất đang dùng của mã đó + 1, xét **cả**:
    requirement trong `capabilities/<domain>/spec.md`, ID trong bảng "ID đã bỏ" của `history.md`,
    và ID `ADDED` trong các change khác đang nằm trong `specs/changes/*/spec.md`.
    ID đã bỏ **không bao giờ** cấp lại. Nhiều requirement mới → số tăng liên tục.
- Chỉ dùng MODIFIED / REMOVED / RENAMED với ID **đang có thật** trong capability; không có → không bịa ID.
- Mỗi requirement: một câu "Hệ thống MUST …" về hành vi quan sát được, không nói công nghệ;
  dòng **Quyền**; ít nhất một scenario `<ID>-S1` (happy) [P1] dạng **Given / When / Then**.
  Scenario edge case để `/spec-edge-cases` bổ sung; tình huống biên nghĩ ra lúc này ghi tạm vào mục
  `### Edge Cases (chưa gắn requirement)`.
- Luật trong `rules.md` và chuyển trạng thái trong `states.md` là chuẩn đối chiếu: requirement không được
  trái với chúng; trái → ghi `[NEEDS CLARIFICATION]` thay vì tự chọn bên.

**Không tự bịa** (luật cứng của repo, ghi đè hướng dẫn "make informed guesses" của lệnh core):

- Con số, giới hạn (số lượng tối đa, độ dài, thời gian), quyền (vai trò nào được / bị từ chối) và chính
  sách xoá dữ liệu **chỉ** lấy từ input, `specs/_system/*` hoặc `capabilities/*`. Không có → đặt
  `[NEEDS CLARIFICATION: <câu hỏi cụ thể>]` tại đúng dòng đó. **Không giới hạn số lượng** marker loại này.
- Thao tác xoá: theo bảng "Dữ liệu và chính sách xoá" trong `nfr.md`; ô đó còn `[NEEDS CLARIFICATION]`
  hoặc thiếu → ghi `[NEEDS CLARIFICATION]` trong spec, không chọn xoá mềm hay xoá cứng.
- Các chi tiết khác (cách hiển thị, câu chữ thông báo…) được dùng mặc định hợp lý, ghi vào **Assumptions**.

**Success Criteria**: đo được, có con số lấy từ input / `nfr.md`; không có con số → `[NEEDS CLARIFICATION]`.
**Out of Scope**: từ input; input không nói → ghi một dòng `[NEEDS CLARIFICATION: ngoài phạm vi gồm gì?]`.

### Bước 5 — Tự kiểm chất lượng

Tạo `<FEATURE_DIR>/checklists/requirements.md`:

```markdown
# Specification Quality Checklist: <CHANGE_NAME>

**Purpose**: Validate the delta spec before clarify / plan
**Created**: <YYYY-MM-DD>
**Feature**: [spec.md](../spec.md)

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] All mandatory sections completed; template guide block removed

## Delta Format

- [ ] Frontmatter has kind: delta, change, capabilities, primary, status, source
- [ ] Every domain in `capabilities` has a `### <domain>` section, and vice versa
- [ ] Every MODIFIED / REMOVED / RENAMED ID exists in the capability spec
- [ ] No ADDED requirement duplicates an existing requirement
- [ ] ADDED IDs are the next free numbers of the domain (incl. history.md and other open changes)
- [ ] Every requirement has a Quyền line and at least one Given/When/Then scenario with an ID

## Requirement Completeness

- [ ] No invented numbers, limits, permissions or deletion policy (each is sourced or [NEEDS CLARIFICATION])
- [ ] Requirements are testable and unambiguous
- [ ] Success criteria are measurable and technology-agnostic
- [ ] Scope is clearly bounded (Out of Scope filled or marked)
- [ ] Assumptions listed

## Notes

- Edge-case scenarios are added later by /spec-edge-cases (not checked here).
- [NEEDS CLARIFICATION] markers are expected at this stage; __SPECKIT_COMMAND_CLARIFY__ resolves them.
```

Rà spec theo từng mục. Mục trượt (không tính `[NEEDS CLARIFICATION]`) → sửa spec, rà lại (tối đa 3 vòng);
còn trượt thì ghi vào Notes và báo người dùng. Tick mục đạt.

**Không hỏi người dùng ở lệnh này** (lệnh có thể chạy trong subagent). Mọi `[NEEDS CLARIFICATION]` để lại
cho `__SPECKIT_COMMAND_CLARIFY__`, chạy ở phiên chính.

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_specify`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_specify` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Báo người dùng:

- Branch đã tạo và thư mục change (`specs/changes/<CHANGE_NAME>/`), file `spec.md`.
- Domain (`capabilities`, `primary`) và danh sách requirement: ADDED / MODIFIED / REMOVED / RENAMED kèm ID.
- **Toàn bộ** `[NEEDS CLARIFICATION]`, đánh số, kèm vị trí.
- Kết quả checklist.
- Bước tiếp theo theo `CLAUDE.md`: `__SPECKIT_COMMAND_CLARIFY__` (phiên chính) → `/spec-edge-cases` →
  `__SPECKIT_COMMAND_CHECKLIST__ edge cases` → dừng chờ duyệt spec.

## Done When

- [ ] Branch `<CHANGE_NAME>` tạo xong; `.specify/feature.json` trỏ `specs/changes/<CHANGE_NAME>`
- [ ] `spec.md` viết theo khuôn delta, frontmatter đủ, ID đúng quy ước, không có con số / quyền tự bịa
- [ ] `checklists/requirements.md` đã rà
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Đã báo cáo như mục Completion Report
