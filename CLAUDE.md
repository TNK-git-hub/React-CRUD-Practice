# AI-native harness

Khung harness (spec, code, test, CI, agent pod), chưa có code app. App theo khung này là monorepo pnpm gồm `frontend/` (Next.js 16 App Router, React 19, TanStack Query, Tailwind) và `backend/` (NestJS, TypeORM, PostgreSQL, Redis).

Trước khi viết code frontend, đọc `frontend/AGENTS.md`: bản Next.js này khác với kiến thức cũ, phải xem docs trong `node_modules/next/dist/docs/`.

## Lệnh
- Test public (CI chạy, bắt buộc pass): `pnpm test`
- Test một package: `pnpm --filter backend test`, `pnpm --filter frontend test`
- Lọc theo tên test: `pnpm --filter backend test -t=<scenario ID>` (dấu `=`, không cách; tham số đường dẫn chỉ được bắt đầu bằng
  `test/public/`). Hook `guard.mjs` chặn mọi dạng khác của lệnh test, và chặn `test:private` / `typecheck:private` với mọi vai.
- Lint: `pnpm lint`. Typecheck frontend: `pnpm --filter frontend typecheck`
- Typecheck test files (strict, constitution Principle IV; CI runs it): `pnpm --filter backend typecheck:test`, `pnpm --filter frontend typecheck:test` (`tsconfig.test.json`: `src` + `test/public`, never `test/private`)
- Test giao diện (webapp-testing): chạy Python bằng `.venv/bin/python`. Cần `pnpm db:up` trước để có DB.
- Script test giao diện đặt trong `frontend/test/e2e/`. CI chưa chạy phần này.

## Quy ước test
- Framework: Vitest cho cả hai package.
- Test mới đặt trong `<package>/test/public/`, tên file `*.test.ts` (component React: `*.test.tsx`).
- Test component React: dòng đầu file `// @vitest-environment jsdom`, dùng `@testing-library/react` + `@testing-library/user-event`, `cleanup` sau mỗi test. Chỉ mock thứ bên ngoài (HTTP, `next/navigation`), không mock component của app.
- Không đọc, sửa hay tạo file trong `test/private/`.
- Chỉ mock thứ chậm hoặc bên ngoài (HTTP, DB, Redis). Không assert lên mock.
- Không sửa code production để test pass. Nghi có bug thì báo lại kèm bằng chứng.

## Quy trình agent
- Session chính chỉ điều phối: giao việc cho subagent, tổng hợp kết quả. Không tự sửa `src/` hay `test/` (hook `.claude/hooks/guard.mjs` chặn).
- Thứ tự: `code-planner` + `test-planner` → `test-writer` (test fail trước) → `code-writer` (code cho pass) → `code-reviewer` + `test-critic` + `security-reviewer` (chạy song song được, cả ba chỉ đọc). Có vấn đề thì quay lại writer tương ứng.
- Finding HIGH/MEDIUM của `security-reviewer` là vấn đề nghiêm trọng: `test-writer` viết test chứng minh lỗ hổng (vd user A gọi tài nguyên của user B phải bị từ chối), `code-writer` sửa cho pass. Finding cho thấy spec thiếu scenario: ghi `SPEC_PROBLEM`, quay lại spec harness.
- Quyền ghi: `code-writer` chỉ `backend/src`, `frontend/src`, `frontend/public`; `test-writer` chỉ `<package>/test/public`, `frontend/test/e2e`; `spec-writer`, `planner` chỉ `specs/changes/`, `.specify/feature.json`. Không ai đọc/sửa `test/private`.
- Không giao cho writer này sửa phần của writer kia (vd. nhờ `test-writer` sửa test cho khớp code sai).
- Sửa file harness (`.claude/`, `CLAUDE.md`, `package.json`, config test, `.github/`, `ci/`, `k8s/`) luôn phải hỏi người dùng.
- Giao việc cho agent chạy trong pod (kind) để tự mở PR và theo dõi GitHub Actions: dùng skill `dispatch-agents` (`k8s/agents/README.md`).

## Quy trình sửa bug
- Người dùng báo bug, test fail bất thường hay hành vi sai: làm theo skill `bug-fix-flow`. Không sửa khi người dùng chưa đồng ý root cause.
- Thứ tự: phân loại (vi phạm scenario nào; không scenario nào nói tới thì là lỗ hổng spec, chuyển sang spec harness) → `bugs/<id>/report.md` → RED (`test-writer` viết test tái hiện, tên bắt đầu bằng scenario ID, phải fail đúng vì bug) → điều tra (`bug-investigator`, chỉ đọc) → gate root cause (dừng chờ người dùng đồng ý) → GREEN (`code-writer` sửa một chỗ ở gốc, tối đa 3 lần thất bại) → review (`code-reviewer` + `test-critic`).
- Session chính ghi hồ sơ `bugs/<id>/` (`report.md`, `investigation.md`, `fix.md`). Đó là toàn bộ hồ sơ: làm tiếp ở chat mới chỉ cần thư mục này, không cần log chat cũ.
- Không sửa, xoá hay skip test tái hiện để cho pass; không sửa `specs/`.

## Branches
- Base branch: `harness-base`. Change branches (`NNN-<name>`) start from it and their PRs merge into it. The skills and agents of the spec harness read the base branch name from this line; no other file hard-codes it.

## Spec (spec harness: `.claude/CLAUDE.md`)
- Spec harness (viết spec, plan, tasks) đã ghép vào repo: quy tắc trong `.claude/CLAUDE.md`, nguyên tắc trong `.specify/memory/constitution.md`, agent `spec-writer` + `planner`, skill `speckit-*`, `spec-bootstrap`, `spec-edge-cases`, `spec-archive`. Spec viết bằng tiếng Anh. Máy cần Python 3.9+ có PyYAML.
- Thứ tự: `/spec-bootstrap` (một lần) → mỗi change: `/speckit-specify` → `/speckit-clarify` → `/spec-edge-cases` → duyệt spec → `/speckit-plan` → `/speckit-checklist` → `/speckit-tasks` → `/speckit-analyze` → duyệt plan + tasks → CODE/TEST (bên dưới) → `/spec-archive`.
- Cấu trúc `specs/`: `_system/`, `capabilities/<domain>/<feature>/` (one living spec per feature; `states.md`, `rules.md`, `history.md` shared at domain level), `changes/NNN-<feature>/` (spec.md, plan.md, tasks.md, checklists/), `archive/`. Mô tả từng thư mục trong `.gitkeep` của nó.
- Agent CODE đọc `spec.md` (chi tiết requirement, `## Architecture Decisions`, `## Data Model`), `plan.md`, `tasks.md`. Agent TEST đọc scenario, `## Edge Cases & Error Handling`, cột NFR Verification của `spec.md`, `checklists/edge-cases.md`, `## Test Strategy` của `plan.md`.
- Không agent nào sửa `specs/`. Spec sai/thiếu: ghi `SPEC_PROBLEM: <file> <mục> <lý do>`, quay lại spec harness.
- Tên mỗi test bắt đầu bằng ID scenario, vd `it('ABC-003-S2 ...')`.
- Giao cho agent trong pod: `dispatch.sh ... --change NNN-<feature> [--tasks T001,T002]` (`k8s/agents/README.md`, mục "Làm theo spec").

## CI
- `pnpm ci:local`: install → lint, typecheck, build frontend → build backend → `pnpm test`. Phải ra `CI PASSED`.
- PR chạy cùng pipeline đó qua `.github/workflows/ci.yml` trên runner cloud của GitHub (`ubuntu-latest`).
- Job thứ hai `spec-check`: unittest của script spec harness + `python3 .specify/scripts/spec_check.py --stage spec --change <branch>`. Chạy local được bằng chính lệnh đó.

## Thế nào là xong
Chỉ được báo hoàn thành khi `pnpm lint`, `pnpm --filter frontend typecheck` và `pnpm test` vừa chạy và pass, có output làm bằng chứng.