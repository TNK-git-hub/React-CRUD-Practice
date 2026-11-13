# React-CRUD-Practice

Monorepo pnpm gồm `frontend/` (Next.js 16 App Router, React 19, TanStack Query, Tailwind) và `backend/` (NestJS, TypeORM, PostgreSQL, Redis).

Trước khi viết code frontend, đọc `frontend/AGENTS.md`: bản Next.js này khác với kiến thức cũ, phải xem docs trong `node_modules/next/dist/docs/`.

## Lệnh
- Test public (CI chạy, bắt buộc pass): `pnpm test`
- Test một package: `pnpm --filter backend test`, `pnpm --filter frontend test`
- Lint: `pnpm lint`. Typecheck frontend: `pnpm --filter frontend typecheck`
- Test giao diện (webapp-testing): chạy Python bằng `.venv/bin/python`. Cần `pnpm db:up` trước để có DB.
- Script test giao diện đặt trong `frontend/test/e2e/`. CI chưa chạy phần này.

## Quy ước test
- Framework: Vitest cho cả hai package.
- Test mới đặt trong `<package>/test/public/`, tên file `*.test.ts` (component React: `*.test.tsx`).
- Không đọc, sửa hay tạo file trong `test/private/`.
- Chỉ mock thứ chậm hoặc bên ngoài (HTTP, DB, Redis). Không assert lên mock.
- Không sửa code production để test pass. Nghi có bug thì báo lại kèm bằng chứng.

## Quy trình agent
- Session chính chỉ điều phối: giao việc cho subagent, tổng hợp kết quả. Không tự sửa `src/` hay `test/` (hook `.claude/hooks/guard.mjs` chặn).
- Thứ tự: `code-planner` + `test-planner` → `test-writer` (test fail trước) → `code-writer` (code cho pass) → `code-reviewer` + `test-critic`. Có vấn đề thì quay lại writer tương ứng.
- Quyền ghi: `code-writer` chỉ `backend/src`, `frontend/src`, `frontend/public`; `test-writer` chỉ `<package>/test/public`, `frontend/test/e2e`. Không ai đọc/sửa `test/private`.
- Không giao cho writer này sửa phần của writer kia (vd. nhờ `test-writer` sửa test cho khớp code sai).
- Sửa file harness (`.claude/`, `CLAUDE.md`, `package.json`, config test, `.github/`, `ci/`, `k8s/`) luôn phải hỏi người dùng.
- Giao việc cho agent chạy trong pod (kind) để tự mở PR và theo dõi GitHub Actions: dùng skill `dispatch-agents` (`k8s/agents/README.md`).

## Spec (đầu vào từ spec harness nhánh `new-project`)
- Cấu trúc `specs/`: `_system/`, `capabilities/<domain>/`, `changes/NNN-<feature>/` (spec.md, plan.md, tasks.md, checklists/), `archive/`. Mô tả từng thư mục trong `.gitkeep` của nó.
- Agent CODE đọc `spec.md` (chi tiết requirement, `## Architecture Decisions`, `## Data Model`), `plan.md`, `tasks.md`. Agent TEST đọc scenario, `## Edge Cases & Error Handling`, cột NFR Verification của `spec.md`, `checklists/edge-cases.md`, `## Test Strategy` của `plan.md`.
- Không agent nào sửa `specs/`. Spec sai/thiếu: ghi `SPEC_PROBLEM: <file> <mục> <lý do>`, quay lại spec harness.
- Tên mỗi test bắt đầu bằng ID scenario, vd `it('ABC-003-S2 ...')`.
- Giao cho agent trong pod: `dispatch.sh ... --change NNN-<feature> [--tasks T001,T002]` (`k8s/agents/README.md`, mục "Làm theo spec").

## CI
- `pnpm ci:local`: install → lint, typecheck, build frontend → build backend → `pnpm test`. Phải ra `CI PASSED`.
- PR chạy cùng pipeline đó qua `.github/workflows/ci.yml` trên runner tự host ARC trong kind (`k8s/runner/RUNNER.md`).

## Thế nào là xong
Chỉ được báo hoàn thành khi `pnpm lint`, `pnpm --filter frontend typecheck` và `pnpm test` vừa chạy và pass, có output làm bằng chứng.