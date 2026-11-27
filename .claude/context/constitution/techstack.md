# Tech stack

## Languages
- **TypeScript**, in strict mode in both packages:
  - backend: `typescript ^6.0.3`, target ES2023, CommonJS;
  - frontend: `typescript ~5.9.3`, target ES2022, ESNext modules.
- **Node.js 24** as the runtime (`node:24-alpine` images).
- **CSS** with Tailwind v4 and design tokens as CSS variables (light and dark themes).

## Frameworks and libraries
Each tool was chosen to learn and practise that tool.

Backend (`backend/package.json`):
- **NestJS 12** (`@nestjs/core`, `common`, `platform-express`, `config`, `mapped-types`):
  the HTTP API, modules and dependency injection.
- **TypeORM 1.1** with `@nestjs/typeorm 12` and `pg 8`: the ORM for PostgreSQL.
- **class-validator 0.15** and **class-transformer 0.5**: DTO validation through a global
  `ValidationPipe` (`whitelist`, `transform`).
- **@nestjs/swagger 12**: OpenAPI docs served at `/docs`.
- **multer 2.5**: image uploads on disk.
- **redis 6.3** (node-redis client): the cache.

Frontend (`frontend/package.json`):
- **Next.js 16.4.6**, App Router, with the React Compiler and `output: 'standalone'`.
- **React 19.2**.
- **TanStack Query 5.104**, plus its devtools: server state, caching and mutations.
- **Tailwind CSS 4.3** through `@tailwindcss/postcss`.

## Data storage
- **PostgreSQL 16**. Tables: `products`, `product_images`, `reviews`, `tags` and the join
  table `product_tags`. TypeORM creates the schema with `synchronize: true`; there are no
  migrations. The seed script (`pnpm seed`) loads the products from
  `https://dummyjson.com/products?limit=0`.
- **Redis 8**: a cache-aside cache with no persistence. Product detail is kept for 60 s;
  product lists for 30 s, with keys versioned and invalidated on create, update and delete.
  The cache fails open: when Redis is down, the app reads straight from Postgres.
- **Local disk / Docker volume** `uploads`: uploaded images in `backend/uploads/`, served
  at `/uploads/*`.

## Infrastructure and deployment
- **Local development:** `docker-compose.yml` runs Postgres and Redis (`pnpm db:up`, with
  `backend/.env`). The backend runs on port 3000 and the frontend on port 5173.
- **Production:** one AWS EC2 instance (Amazon Linux 2023, t3.micro or another free-tier
  type) runs `docker-compose.prod.yml` with five services: `postgres`, `redis`, `backend`,
  `frontend` (Next.js standalone) and `web` (nginx 1.29). nginx is the only public port
  (80); it sends `/api/*` to the backend and everything else to the frontend. Data lives in
  the volumes `pgdata` and `uploads`. Deploys are manual: `git pull`, then
  `docker compose -f docker-compose.prod.yml up -d --build` (see `docs/deploy-ec2.md`).
- `NEXT_PUBLIC_API_URL` is embedded at build time (`/api` in production). When it is not
  set, the frontend calls DummyJSON.

## Tooling
| Tool | Command |
|------|---------|
| Package manager (pnpm 12.9.1 workspace) | `pnpm install` |
| Run frontend and backend in dev | `pnpm dev` (or `pnpm dev:fe`, `pnpm dev:be`) |
| Start or stop local Postgres and Redis | `pnpm db:up` / `pnpm db:down` |
| Build both packages | `pnpm build` |
| Lint (ESLint 9 with `eslint-config-next`, frontend only) | `pnpm lint` |
| Type-check the frontend | `pnpm --filter frontend typecheck` |
| Reset the DB to the DummyJSON data | `pnpm seed` |
| Load test (see `docs/performance/`) | `docs/performance/stress-test.sh` |

There is no test runner and no formatter yet.

## Constraints
- A pnpm workspace monorepo with two packages, `frontend/` and `backend/`, managed with
  pnpm (`packageManager: pnpm@12.9.1`) and run on Node.js 24.
