# Tech Stack

Onboarded 2026-11-27. pnpm monorepo `react-crud-practice` with workspace packages `backend` and `frontend`.

| Area | Choice | Version | Notes |
|---|---|---|---|
| Language | TypeScript | BE ^6.0.3, FE ~5.9.3 | Versions differ per package. BE is CommonJS, ES2023, strict, decorators. FE is ESM |
| Runtime | Node.js | 24 (node:24-alpine images) | |
| Backend framework | NestJS (Express platform) | ^12.1 | `@nestjs/config` (global), `@nestjs/swagger` with the CLI plugin, docs at `/docs` |
| Frontend framework | Next.js App Router | 16.4.6 | React Compiler on, `output: 'standalone'`. React ^19.2.8 |
| Database / ORM | PostgreSQL 16 + TypeORM ^1.1 (`pg`) | | `synchronize: true`, `autoLoadEntities`. **No migrations** |
| Cache | Redis 8 (`redis` ^6.3) | | Cache-aside only. The app must keep working when Redis is down |
| Data fetching (FE) | TanStack Query + devtools | ^5.104 | |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` | ^4.3 | Custom tokens. Default palette disabled |
| Validation | class-validator / class-transformer | ^0.15 | BE DTOs. FE uses hand-written validators in `utils/` |
| File upload | multer | ^2.5 | Disk storage in `./uploads` |
| Test framework | **none installed** | | [PROPOSED] Jest + `@nestjs/testing` (BE), Vitest + React Testing Library (FE). Adding them requires the dependency risk gate |
| Lint / format | ESLint 9 flat config, FE only (`eslint-config-next` core-web-vitals + typescript) | | No Prettier, no `.editorconfig`, no backend lint |
| Package manager | pnpm | 12.9.1 | `pnpm-lock.yaml`. Docker uses `--frozen-lockfile` |
| CI | **none** | | No `.github/` folder |
| Deploy | Docker Compose (postgres, redis, backend, frontend, nginx) on EC2 | | Only port 80 is exposed. nginx routes `/api/*` to the backend and strips the prefix. See `docs/deploy-ec2.md` |

## Key libraries

| Library | Purpose | Usage rule |
|---|---|---|
| TypeORM `Repository<T>` | Data access | Inject with `@InjectRepository` in services. Use `DataSource.transaction` for multi-table writes |
| `CacheService` (`backend/src/redis/cache.service.ts`) | JSON get/set/del/incr | Use it for caching. Never call the Redis client directly from features. Every write must bump the list version key |
| Nest HTTP exceptions | Error responses | Throw `NotFoundException`, `ConflictException`, etc. Never return error objects |
| `apiFetch` (`frontend/src/api/client.ts`) | HTTP from the FE | Every FE request goes through `apiFetch`. Components and views never call `fetch` |
| TanStack Query | Server state | Query keys come from `api/queryKeys.ts`. Wrap queries and mutations in hooks under `hooks/` |

## Stack-specific best practices to enforce

- **Next 16:** the APIs differ from older Next.js. Before writing Next-specific code, read `node_modules/next/dist/docs/` (see `frontend/AGENTS.md`).
- **Client components:** a view that uses `useSearchParams` must be rendered inside `<Suspense>` in its `page.tsx`. Add `'use client'` only where hooks or state are needed.
- **Validation:** request input is validated by DTOs and the global `ValidationPipe` (`whitelist`, `transform`). Never read raw `req.body`.
- **Configuration:** read config through `ConfigService` in modules and providers. Existing direct `process.env` reads in `main.ts` are tolerated, but do not add more.
- **Caching:** cache-aside. Detail TTL is 60s. List cache keys include a version that is bumped on write. Cache failures must degrade gracefully.
- **Schema changes:** entity changes alter the DB through `synchronize`. They are a migration risk gate.
- **Images:** the lint warns on `<img>` (`@next/next/no-img-element`). Existing uses are a known baseline. Prefer `next/image` in new code [PROPOSED].

## Security-relevant facts

- **Auth mechanism:** **none.** All product CRUD and `POST /uploads` are public. The only protection is CORS (`origin: FRONTEND_URL`, `backend/src/main.ts`). Swagger is reachable in prod via `/api/docs` [UNVERIFIED].
- **Secrets management:** `backend/.env` (gitignored) holds them; `backend/.env.example` is the template. The prod root `.env` must set `DB_PASSWORD`. The FE has only `NEXT_PUBLIC_API_URL` (build-time). It falls back to `https://dummyjson.com`.
- **Input validation library:** class-validator (BE). Custom decorator in `backend/src/products/dto/price-bound.validator.ts`.
- **Data stores holding PII:** the Postgres table `reviews` (`reviewerName`, `reviewerEmail`). These columns are returned by `GET /products/:id` and cached in Redis. The seeded data is fake, but treat the columns as PII.
- **Uploads:** 2MB limit, png/jpg/webp, UUID file names. The type check trusts the client mimetype (no content sniffing). Files are served statically at `/uploads`.
- **Search:** `ILike` with bound parameters. `%` and `_` in `q` are not escaped (wildcard injection, not SQL injection).
