# Tổng hợp quy trình tạo spec — bản thử `001-products-price-range`

Tài liệu ghi lại quy trình Spec-Driven Development (harness level 4) đã chạy trên app CRUD sản phẩm (brownfield),
từ tài liệu yêu cầu tới `tasks.md`. Mọi khẳng định trỏ tới file trong repo hoặc commit trên branch
`trial/spec-on-crud` và `001-products-price-range`. Ngày chạy: 2026-11-12.

Commit liên quan (`git log trial/spec-on-crud`, `git log trial/spec-on-crud..001-products-price-range`):

| Commit | Branch | Message |
| --- | --- | --- |
| `b533570` | trial/spec-on-crud | chore(trial): add level-4 spec harness to CRUD app |
| `0835aed` | trial/spec-on-crud | chore(trial): brownfield bootstrap for products |
| `08eac90` | trial/spec-on-crud | docs(harness): agent-written content in Vietnamese, structure and harness stay English |
| `273db55` | 001-products-price-range | spec(001): products price range — approved |
| `88a7c19` | 001-products-price-range | spec(001): URL min>max ignored |
| `3dcff2c` | 001-products-price-range | plan(001): plan, research, contracts, tasks — for review |
| `fcf8dc5` | 001-products-price-range | spec(001): clarify validation details |
| `163c986` | 001-products-price-range | spec(001): resolve quality checklist |

---

## Phần A — Quy trình tổng quát (áp dụng cho mọi change)

### Sơ đồ

```text
docs/requirements/*.md
        │
        ▼
[0] /spec-bootstrap  (chỉ lần đầu của app)  ──► specs/_system/*, specs/capabilities/<domain>/*, bảng mã domain
        │   duyệt: roadmap.md + trả lời [NEEDS CLARIFICATION]
        ▼
[1] /speckit-specify   ──► branch NNN-<name>, specs/changes/NNN-<name>/spec.md, checklists/requirements.md
        ▼
[2] /speckit-clarify   ──► spec.md: ## Clarifications (tối đa 5 câu / lần)
        ▼
[3] /spec-edge-cases   ──► spec.md: scenario edge case; checklists/edge-cases.md
        ▼
[4] Làm rõ còn lại (người trả lời các [NEEDS CLARIFICATION])
        │   CỔNG DUYỆT SPEC: checklists/requirements.md + checklists/edge-cases.md → status: approved, commit
        ▼
[5] /speckit-plan      ──► plan.md, research.md, data-model.md, contracts/*, quickstart.md
        ▼
[6] /speckit-checklist ──► checklists/quality.md   (sau plan: script setup cần plan.md)
        ▼
[7] /speckit-tasks     ──► tasks.md
        │   CỔNG DUYỆT PLAN + TASKS
        ▼
(chưa làm) /speckit-implement → /speckit-converge → /spec-archive → 2 commit → PR
```

Thứ tự trên khác `.claude/CLAUDE.md` (mục "Flow of one change", dòng 55–66) ở một điểm: CLAUDE.md đặt
`/speckit-checklist edge cases` (bước 4) **trước** cổng duyệt spec; bản thử chuyển checklist ra **sau** `/speckit-plan`
(xem Phần B, "Những chỗ vướng", mục 1).

### Từng bước

| # | Lệnh / skill | Đầu vào | Đầu ra | Ai duyệt, duyệt gì | Điều kiện sang bước sau |
| --- | --- | --- | --- | --- | --- |
| 0 | `/spec-bootstrap` (`.claude/skills/spec-bootstrap/SKILL.md`) — chỉ chạy một lần cho mỗi app | `docs/requirements/*.md`, `.specify/memory/constitution.md`, `.claude/CLAUDE.md`, `specs/_system/edge-case-catalog.md`, template lấy qua `resolve-template.sh` | `specs/_system/{glossary,domain-model,nfr,roadmap,traceability}.md`; `specs/capabilities/<domain>/{spec,states,rules,history}.md`; mục 13 của catalog; bảng mã domain trong `.claude/CLAUDE.md` | Người dùng: duyệt `roadmap.md`, trả lời mọi `[NEEDS CLARIFICATION]` (SKILL.md "Step 8 — Report and STOP") | Roadmap được duyệt; skill không tự chạy `/speckit-specify`, không tạo branch, không commit |
| 1 | `/speckit-specify` (preset `tools/speckit-level4/commands/speckit.specify.md`, sinh ra `.claude/skills/speckit-specify/SKILL.md`) | Dòng change trong `roadmap.md`; `specs/_system/*`; `specs/capabilities/<domain>/*` | Branch `NNN-<name>` (số từ `.specify/scripts/next_change.py`); `specs/changes/NNN-<name>/spec.md` (`kind: delta`); `checklists/requirements.md`; `.specify/feature.json` | Agent tự kiểm tra theo `requirements.md`; không hỏi người dùng; nếu branch hiện tại không phải `new-project` thì hỏi có tạo branch từ đây không (SKILL.md dòng 119) | Spec theo template delta; các câu chưa rõ để `[NEEDS CLARIFICATION]` |
| 2 | `/speckit-clarify` — chạy ở phiên chính (CLAUDE.md dòng 58) | `spec.md`, constitution | Mục `## Clarifications` / `### Session YYYY-MM-DD` trong `spec.md`; sửa đúng chỗ bị ảnh hưởng | Người dùng trả lời từng câu (tối đa 5) | Hết câu quan trọng hoặc đủ 5 câu |
| 3 | `/spec-edge-cases` (`.claude/skills/spec-edge-cases/SKILL.md`) | `spec.md`, `edge-case-catalog.md`, `capabilities/<domain>/{states,rules}.md`, `nfr.md` | Scenario có ID, loại, P1–P3 thêm vào `spec.md`; `checklists/edge-cases.md` (ghi đè toàn bộ, SKILL.md dòng 91) | Agent tự kiểm tra; các `[NEEDS CLARIFICATION]` mới để người trả lời | Mỗi requirement đủ 12 dòng trong bảng độ phủ |
| 4 | Làm rõ còn lại (thủ công) | Các `[NEEDS CLARIFICATION]` còn trong spec | `spec.md` (Clarifications, scenario mới nếu cần), `edge-cases.md` | **Cổng duyệt spec** — người dùng: `requirements.md` đạt hết, `edge-cases.md` đủ, 0 `[NEEDS CLARIFICATION]` | `status: approved` trong frontmatter; commit spec |
| 5 | `/speckit-plan` (`.claude/skills/speckit-plan/SKILL.md`) | `spec.md`, constitution, template plan | `plan.md` (Technical Context, Constitution Check, cấu trúc, bảng scenario → test), `research.md`, `data-model.md`, `contracts/*`, `quickstart.md` | Người dùng: các mục Constitution Check chưa đạt, các quyết định kỹ thuật cần chọn | Mọi cổng constitution PASS hoặc được ghi là ngoại lệ có người duyệt |
| 6 | `/speckit-checklist` (`.claude/skills/speckit-checklist/SKILL.md`) | `spec.md`, `plan.md` | `checklists/quality.md` — câu hỏi về **chất lượng câu chữ** của spec/plan, tất cả để trống | Người dùng (reviewer) đánh dấu `[x]`; agent không tự đánh dấu | Reviewer xử lý hết các mục |
| 7 | `/speckit-tasks` (`.claude/skills/speckit-tasks/SKILL.md`) | `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` | `tasks.md` (task theo phase / user story, test viết trước) | **Cổng duyệt plan + tasks** — người dùng (CLAUDE.md dòng 63) | Người dùng duyệt |
| — | `/speckit-implement` → `/speckit-converge` → `/spec-archive` → 2 commit → PR | — | — | **Chưa làm.** `/speckit-implement` có cổng: mọi checklist phải được đánh dấu hết, nếu không thì dừng hỏi (`.claude/skills/speckit-implement/SKILL.md` dòng 87) | — |

Chuẩn bị máy: Python 3.9+ có PyYAML, nếu không mọi lệnh resolve template đều lỗi (`.claude/CLAUDE.md` mục "Machine setup",
thêm ở `08eac90`).

---

## Phần B — Áp dụng cho change `001-products-price-range`

Bối cảnh: app đang chạy (Next.js + NestJS + Postgres + Redis), tài liệu yêu cầu duy nhất là
`docs/requirements/price-range.md`. Người dùng yêu cầu chạy bootstrap ở chế độ brownfield: code là nguồn sự thật cho
hành vi đã có, chỉ tạo domain `products` (mã `PROD`), roadmap chỉ có một change, không có walking skeleton
(`specs/_system/roadmap.md` dòng 9; `specs/capabilities/products/spec.md` dòng 11).

### File đã tạo

| Đường dẫn | Bước tạo | Chứa gì | Trạng thái duyệt | Commit |
| --- | --- | --- | --- | --- |
| `docs/requirements/price-range.md` | Người dùng (tài liệu nguồn); sửa ở bước 0 | Yêu cầu lọc theo khoảng giá; đơn vị tiền đổi thành USD theo quyết định bootstrap | Người dùng viết | `0835aed` |
| `specs/_system/glossary.md` | 0 | Thuật ngữ (Giá, Khoảng giá, Tìm kiếm, Sắp xếp, Phân trang…), tên trong code, nguồn là file code; vai trò "Người xem" | Câu hỏi đã trả lời; dùng làm cơ sở cho 001 | `0835aed` |
| `specs/_system/domain-model.md` | 0 | Product, ProductImage, Review, Tag; thuộc tính và ràng buộc lấy từ entity / DTO; sơ đồ mermaid | Như trên | `0835aed` |
| `specs/_system/nfr.md` | 0 | NFR-001…043 (cache 30 s / 60 s, `limit` 1–100, < 1 giây, không kiểm quyền là ngoại lệ Principle II, USD, trình duyệt); chính sách xoá cứng theo code; "Hiện trạng đã biết" | Như trên | `0835aed` |
| `specs/_system/roadmap.md` | 0 | Một change `001-products-price-range`; ghi chú brownfield, thiếu test/CI, bẫy khoá cache | Người dùng chạy 001 theo dòng này | `0835aed` |
| `specs/_system/traceability.md` | 0 | REQ-01…04, BR-PROD-01…07, NFR, mục ngoài phạm vi → change sở hữu | Như trên | `0835aed` |
| `specs/_system/edge-case-catalog.md` | 0 (chỉ mục 13) | 4 câu hỏi bẫy riêng của domain (khoá cache, tổng / số trang, số thập phân, đơn vị tiền) | — | `0835aed` |
| `specs/capabilities/products/spec.md` | 0 | Living spec rỗng; Overview "Brownfield: hành vi đã có chưa được spec…" | — | `0835aed` |
| `specs/capabilities/products/states.md` | 0 | Vòng đời Product theo code: (does not exist) / exists; create / edit / delete (xoá cứng) | — | `0835aed` |
| `specs/capabilities/products/rules.md` | 0 | BR-PROD-01…07 và bảng quyết định BR-PROD-02 | — | `0835aed` |
| `specs/capabilities/products/history.md` | 0 | Bảng rỗng, chờ `/spec-archive` | — | `0835aed` |
| `specs/changes/001-products-price-range/spec.md` | 1–4, sửa lại sau | Delta spec: PROD-001, -002, -003 (ADDED); 48 scenario; 22 dòng Clarifications; Assumptions; Out of Scope | `status: approved` | `273db55`, `88a7c19`, `fcf8dc5`, `163c986` |
| `…/checklists/requirements.md` | 1 | 14 mục chất lượng spec (do `/speckit-specify` quản lý) | 14/14 | `273db55` |
| `…/checklists/edge-cases.md` | 3 | Bảng độ phủ 3 requirement × 12 chiều = 36 dòng; bảng tóm tắt | Đủ 36 dòng, 0 câu mở | `273db55`, cập nhật ở 3 commit sau |
| `…/plan.md` | 5 | Technical Context; Constitution Check (có ngoại lệ CI / PR / cách diễn giải "strictest"); cấu trúc file; bảng scenario → test; Decisions | Người dùng duyệt | `3dcff2c`, `fcf8dc5`, `163c986` |
| `…/research.md` | 5 | R1–R10: Vitest, vị trí test, DB thật, kiểm tra giá bằng chuỗi, khoá cache, ô nhập `type="text"`, URL, type checking, hiệu năng, CI | Như trên | `3dcff2c`, `fcf8dc5` |
| `…/data-model.md` | 5 | Không đổi schema; quy tắc khoảng giá, thứ tự kiểm tra một ô, trạng thái URL, khoá cache | Như trên | `3dcff2c`, `fcf8dc5`, `163c986` |
| `…/contracts/get-products.md` | 5 | `GET /products` thêm `minPrice`, `maxPrice`; response 200 không đổi; bảng 400 với câu thông báo tiếng Việt | Như trên | `3dcff2c`, `fcf8dc5`, `163c986` |
| `…/contracts/ui-price-filter.md` | 5 | Hai ô giá, thông báo nguyên văn, thay đổi URL theo từng hành động, xử lý 400 | Như trên | `3dcff2c`, `fcf8dc5`, `163c986` |
| `…/quickstart.md` | 5 | Lệnh kiểm tra tự động thay cho CI; 8 bước kiểm tay (SC-001, SC-002, SC-004) | Như trên | `3dcff2c`, `fcf8dc5`, `163c986` |
| `…/checklists/quality.md` | 6 | 30 câu hỏi chất lượng spec + plan, mỗi mục có bằng chứng `file:dòng` | 30/30 (người dùng duyệt bảng đánh giá) | `3dcff2c`, `163c986` |
| `…/tasks.md` | 7 | 37 task, 6 phase, test trước code | Người dùng duyệt | `3dcff2c`, `fcf8dc5`, `163c986` |

### Con số chính

| Chỉ số | Giá trị | Nguồn |
| --- | --- | --- |
| Requirement | 3 (PROD-001, PROD-002, PROD-003), đều `ADDED` | `spec.md` |
| Scenario | 48 — PROD-001: 15, PROD-002: 15, PROD-003: 18 | `spec.md` |
| Theo ưu tiên | P1: 10, P2: 26, P3: 12 | `spec.md` (đếm theo nhãn) |
| Scenario lúc duyệt lần đầu | 40 | `git show 273db55:…/spec.md` |
| Độ phủ edge case | 36 dòng (3 × 12 chiều); 36 scenario do bước edge case / làm rõ thêm (P1 3, P2 21, P3 12); 13 dòng N/A có lý do | `checklists/edge-cases.md` mục Summary |
| Câu làm rõ ghi trong spec | 22 dòng `- Q:` | `spec.md` dòng 22–43 |
| Checklist | `requirements.md` 14/14; `quality.md` 30/30; `edge-cases.md` bảng độ phủ (không có ô đánh dấu) | `checklists/*` |
| Task | 37 (lúc tạo: 36 ở `3dcff2c`); 17 task `[P]`; US1 8, US2 4, US3 6; 8 task test mang scenario ID phủ 48/48 scenario | `tasks.md` |

### Những gì người đã quyết

**Bootstrap** (ghi ở `0835aed`):

| Quyết định | Ghi ở |
| --- | --- |
| Đơn vị tiền là USD; sửa tài liệu yêu cầu | `docs/requirements/price-range.md` dòng 13; `specs/_system/glossary.md` dòng 6; `nfr.md` NFR-041 (dòng 77) |
| Ô lọc nhận giá 0; mâu thuẫn ≥ 0 / > 0 của form tạo sản phẩm là ngoài phạm vi | `rules.md` BR-PROD-03 (dòng 9); `traceability.md` dòng 26 |
| Danh sách phản hồi < 1 giây với dữ liệu seed | `nfr.md` NFR-004 (dòng 14) |
| Không kiểm quyền là chủ ý — ngoại lệ đã biết của Principle II | `nfr.md` NFR-011 (dòng 21), permission matrix (dòng 28–35) |
| Không yêu cầu uptime hay sao lưu | `nfr.md` NFR-034 (dòng 70) |
| Trình duyệt: Chrome, Safari, Firefox bản mới trên máy tính | `nfr.md` NFR-042 (dòng 78) |
| min > max: UI chặn với thông báo, backend 400 | `rules.md` BR-PROD-05 (dòng 11) |
| Giá trị sai: UI chặn, backend 400 | `rules.md` BR-PROD-07 (dòng 13) |
| Giới hạn trên 99999999.99 | `rules.md` BR-PROD-06 (dòng 12) |
| Ghi 3 hành vi xoá hiện có là hiện trạng đã biết | `nfr.md` dòng 50 trở đi |

**Làm rõ spec** (mỗi dòng là một `- Q:` trong `specs/changes/001-products-price-range/spec.md`):

| Quyết định | Dòng | Commit |
| --- | --- | --- |
| Khoảng giá ghi lên URL | 22 | `273db55` |
| Câu thông báo cho từng lỗi | 23 | `273db55` |
| Áp dụng khi bấm Search / Enter, hai ô nằm trong form tìm kiếm | 24 | `273db55` |
| Trạng thái rỗng mới; xoá bộ lọc xoá cả từ khoá và khoảng giá | 25 | `273db55` |
| Chỉ nhận dấu chấm thập phân; bỏ khoảng trắng | 26 | `273db55` |
| URL có giá sai → bỏ qua, ô trống | 27 | `273db55` |
| Trang vượt số trang → như app hiện xử lý (nguồn code) | 28 | `273db55` |
| Gõ chưa Search rồi đổi sắp xếp / trang → ô về giá đang áp dụng | 29 | `273db55` |
| "1.000" → lỗi thập phân, "1e3" → không phải số | 30 | `273db55` |
| Tham số rỗng → không giới hạn | 31 | `273db55` |
| URL có min > max hợp lệ → bỏ qua cả hai | 32 | `88a7c19` |
| Máy chủ 400 với giá trị UI đã cho qua → thông báo dưới ô, giữ danh sách | 33 | `fcf8dc5` |
| Định nghĩa "số thường" | 34 | `fcf8dc5` |
| Lỗi định dạng xét trước min > max | 35 | `fcf8dc5` |
| Nhãn ô + `aria-describedby`; tiếp cận đầy đủ ngoài phạm vi | 36 | `fcf8dc5` |
| Giữ cách tải hiện có | 37 | `163c986` |
| "010", "10.5", "10.50" theo giá trị số, không chuẩn hoá URL | 38 | `163c986` |
| Tham số giá lặp → UI bỏ qua, máy chủ 400 | 39 | `163c986` |
| SC-002 đo trên tập khoảng mẫu | 40 | `163c986` |
| "Bản mới" = bản ổn định hiện hành của Chrome, Edge, Firefox, Safari | 41 | `163c986` |
| Quay lại theo lịch sử như tìm kiếm (`router.push`, `frontend/src/views/ProductList.tsx:51`) | 42 | `163c986` |
| Màn hình hẹp ngoài phạm vi | 43 | `163c986` |

**Plan** (`specs/changes/001-products-price-range/plan.md`, mục "Decisions", dòng 139–152):

| Quyết định | Ghi ở |
| --- | --- |
| Không thêm CI trên branch này — ngoại lệ đã biết; chạy tay theo quickstart | `plan.md` dòng 141, 52; `research.md` R10 |
| URL min > max → bỏ qua cả hai (sửa spec trước) | `plan.md` dòng 142 |
| Type checking giữ `strict: true`, không bật thêm cờ; "strictest" diễn giải là `strict: true` | `plan.md` dòng 145, 51; `research.md` R8 |
| Không mở PR, không push | `plan.md` dòng 147, 53 |
| Chi tiết kiểm tra giá; máy chủ trả đúng câu tiếng Việt của spec | `plan.md` dòng 148; `research.md` R4 |
| Kết quả xử lý `quality.md` | `plan.md` dòng 152 |

**7 mục `quality.md` đã sửa spec** (commit `163c986`): CHK002 (giữ cách tải, `spec.md` dòng 37), CHK004 ("010"… dòng 38),
CHK006 (tham số lặp, dòng 39), CHK019 (SC-002, dòng 40), CHK020 ("bản mới", dòng 41), CHK022 (lịch sử, dòng 42),
CHK025 (màn hình hẹp, dòng 43). Bằng chứng của từng mục nằm cuối dòng tương ứng trong `checklists/quality.md`.

### Những chỗ vướng và cách xử lý

| # | Vướng | Bằng chứng | Cách xử lý |
| --- | --- | --- | --- |
| 1 | `/speckit-checklist` không chạy được trước `/speckit-plan`: script setup bắt buộc có `plan.md`, trong khi CLAUDE.md đặt checklist trước cổng duyệt spec | `.specify/scripts/bash/check-prerequisites.sh` dòng 146; `.claude/CLAUDE.md` dòng 60 | Người dùng đổi thứ tự cho change này: cổng duyệt spec dùng `requirements.md` + `edge-cases.md`; checklist chạy sau plan, ghi vào `quality.md` (không dùng `edge-cases.md` vì `/spec-edge-cases` ghi đè file đó — SKILL.md dòng 91) |
| 2 | Cổng `/speckit-implement` chặn: `quality.md` 0/30 mục được đánh dấu | `git show 3dcff2c:…/checklists/quality.md` (30 mục `- [ ]`); `.claude/skills/speckit-implement/SKILL.md` dòng 87 | Người dùng trả lời "no"; agent lập bảng đánh giá 30 mục (23 tick, 7 cần sửa spec); sửa spec ở `fcf8dc5`, `163c986`; người dùng duyệt, `quality.md` 30/30 kèm bằng chứng |
| 3 | T032 ("chạy `pnpm --filter backend seed` trên DB dev rồi đếm") sẽ xoá dữ liệu dev: seed chạy `TRUNCATE` mọi bảng sản phẩm và xoá file ảnh upload | `specs/changes/001-products-price-range/tasks.md` dòng 131; `backend/src/seed.ts` dòng 58 | **Chưa sửa.** Đã đề xuất: chạy seed với `DB_NAME=crud_practice_test`, hoặc lấy `total` từ API dummyjson; thêm chốt chặn trong `resetDb()` / `flushRedis()` (T010) báo lỗi nếu không ở DB test / Redis DB 1 |
| 4 | Lệnh resolve template lỗi khi thiếu PyYAML | `.claude/CLAUDE.md` mục "Machine setup" (từ `08eac90`) | Cài PyYAML; ghi vào CLAUDE.md |
| 5 | Branch change tạo từ `trial/spec-on-crud`, không phải `new-project`; branch không có `.github/workflows/` | `.claude/skills/speckit-specify/SKILL.md` dòng 119; `ls .github` không tồn tại | Người dùng xác nhận tạo từ branch thử; CI và PR ghi là ngoại lệ đã biết (`plan.md` dòng 52–53) |
| 6 | Bootstrap (`0835aed`) viết prose tiếng Việt trong khi CLAUDE.md lúc đó còn ghi "Everything … written in English" | `git show 0835aed:.claude/CLAUDE.md` dòng 86; `08eac90` | Quy ước ngôn ngữ mới được đưa vào ở `08eac90` |
| 7 | Spec đã `status: approved` nhưng vẫn phải sửa ba lần trong lúc plan / review | commit `88a7c19`, `fcf8dc5`, `163c986` | Mỗi lần: người dùng quyết, chạy lại tự kiểm tra `requirements.md`, commit riêng; status giữ `approved` |
| 8 | SC-004 (Chrome, Edge, Firefox, Safari) lệch NFR-042 (Chrome, Safari, Firefox) | `spec.md` dòng 160; `specs/_system/nfr.md` dòng 78; `plan.md` dòng 152 | **Chưa xử lý**: `nfr.md` chưa sửa, đang chờ người dùng quyết |
| 9 | `spec_check.py` luôn báo 2 lỗi "change not archived" trước `/spec-archive` | `.specify/scripts/spec_check.py` dòng 7–8, 47 | Ghi trong `quickstart.md` là lỗi được mong đợi ở giai đoạn này |

---

## Phần C — Điều chỉnh harness rút ra từ bản thử (chỉ liệt kê, chưa sửa)

1. **Thứ tự luồng trong `.claude/CLAUDE.md`** ("Flow of one change"): chuyển `/speckit-checklist` ra sau `/speckit-plan`; cổng
   duyệt spec dùng `checklists/requirements.md` + `checklists/edge-cases.md`.
2. **Tên file checklist**: quy định tên mặc định (ví dụ `quality.md`) và cấm `edge-cases.md`, vì `/spec-edge-cases` ghi đè file đó.
3. **Chế độ brownfield cho `/spec-bootstrap`**: cho phép lấy hành vi và chính sách xoá từ code (ghi nguồn là file), roadmap không
   bắt buộc walking skeleton, capability spec để trống với Overview brownfield — hiện đều là ngoại lệ thủ công so với
   SKILL.md (dòng 50, 71, 94, 115).
4. **Sửa spec sau khi đã approved**: định nghĩa quy trình (đổi lại `draft`? ghi lần duyệt lại? commit riêng?) — bản thử
   giữ `approved` qua ba lần sửa.
5. **Base branch của `/speckit-specify`**: hỗ trợ có chủ đích branch thử / branch app khác `new-project` (hiện chỉ hỏi).
6. **`spec_check.py`**: thêm chế độ kiểm trước khi archive (scenario ↔ test trong `specs/changes/`) để không luôn báo "not archived".
7. **CI mẫu cho app Node dùng pnpm + Postgres / Redis**: workflow harness trên `new-project` dùng `npm ci`, Node 20, không có service
   (`research.md` R10).
8. **Constitution Principle IV**: định nghĩa rõ "strictest mode" và cách áp dụng cho brownfield (bản thử diễn giải là `strict: true`).
9. **An toàn dữ liệu trong `/speckit-tasks` và test**: cảnh báo lệnh phá dữ liệu (seed, `TRUNCATE`) chạy trên DB dev; yêu cầu chốt chặn
   DB test trong hạ tầng test.
10. **Cập nhật `specs/_system/*` giữa chừng một change** (ví dụ NFR-042 khi spec đổi danh sách trình duyệt): chưa có bước nào được phép
    sửa, hiện chỉ ghi lệch trong plan.
11. **Kiểm tra trước khi chạy**: các skill dùng `resolve-template.sh` nên báo sớm khi thiếu PyYAML.
12. **Bằng chứng cho checklist do reviewer sở hữu**: chuẩn hoá dạng "— Bằng chứng: file:dòng" cuối mục khi agent hỗ trợ đánh giá.
