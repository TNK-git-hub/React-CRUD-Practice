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

## Thế nào là xong
Chỉ được báo hoàn thành khi `pnpm test` vừa chạy và pass, có output làm bằng chứng.