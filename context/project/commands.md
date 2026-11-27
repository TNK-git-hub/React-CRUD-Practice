# Commands

All commands run from the repository root. Verified on 2026-11-27.

| Purpose | Command |
|---|---|
| Install deps | `pnpm install` |
| Start DB + Redis | `pnpm db:up` / `pnpm db:down` (needs `backend/.env`, copied from `backend/.env.example`) |
| Seed DB | `pnpm seed` (builds BE, resets DB from dummyjson.com, clears uploads. Needs network) |
| Run all tests | **none.** No runner is installed. [PROPOSED] `pnpm -r test` once Jest/Vitest are added |
| Run a single test file | **none.** [PROPOSED] `pnpm --filter backend exec jest <path>` / `pnpm --filter frontend exec vitest run <path>` |
| Run tests matching a name | **none.** [PROPOSED] `... jest -t "<name>"` / `... vitest run -t "<name>"` |
| Lint | `pnpm lint` (runs `pnpm -r lint`; only the frontend has a lint script) |
| Format | **none configured** |
| Typecheck FE | `pnpm --filter frontend typecheck` (`next typegen && tsc --noEmit`) |
| Typecheck BE | `pnpm --filter backend exec tsc --noEmit` |
| Build | `pnpm build` (both), `pnpm --filter backend build`, `pnpm --filter frontend build` |
| Run locally | `pnpm dev` (both), `pnpm dev:be` (Nest watch on :3000, Swagger at :3000/docs), `pnpm dev:fe` (Next on :5173) |
| Prod (Docker) | `docker compose -f docker-compose.prod.yml up -d --build` (needs root `.env` with `DB_PASSWORD`) |
| Security scan (optional) | `pnpm audit` |

## Baseline (2026-11-27)

| Check | Result |
|---|---|
| Tests | 0 test files, no runner |
| Lint (`pnpm lint`) | exit 0. 0 errors, 6 warnings, all `@next/next/no-img-element` (known baseline) |
| Typecheck FE | exit 0 |
| Typecheck BE | exit 0 |
| Build | not run during onboarding [UNVERIFIED] |
