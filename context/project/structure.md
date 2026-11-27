# Project Structure

## Layout

```
/
├── package.json, pnpm-workspace.yaml   # workspace root scripts (dev, build, lint, db:up, seed)
├── docker-compose.yml                  # local postgres + redis
├── docker-compose.prod.yml             # prod: postgres, redis, backend, frontend, nginx
├── docs/                               # deploy-ec2.md, drawio architecture (drawio/pages/*.json, build.mjs), redis notes
├── backend/
│   ├── Dockerfile, nest-cli.json, tsconfig.json, .env.example
│   └── src/
│       ├── main.ts                     # bootstrap: ValidationPipe, CORS, static /uploads, Swagger /docs
│       ├── app.module.ts               # ConfigModule, TypeORM forRootAsync, feature module registration
│       ├── seed.ts                     # resets DB from dummyjson.com (pnpm seed)
│       ├── products/                   # feature module: controller, service, module, entities
│       │   └── dto/                    # create/update/query DTOs + custom validators
│       ├── redis/                      # RedisModule: RedisService, CacheService
│       └── uploads/                    # UploadsController (POST /uploads)
└── frontend/
    ├── Dockerfile, nginx.conf, next.config.ts, eslint.config.js, AGENTS.md
    ├── public/                         # favicon.svg, icons.svg
    └── src/
        ├── app/                        # App Router: layout.tsx, providers.tsx, App.css, route page.tsx files
        ├── views/                      # screen components ('use client'), one per route
        ├── comopnents/                 # shared components (root) + per-screen groups (sic: misspelling is canonical)
        ├── hooks/                      # TanStack Query hooks + UI hooks
        ├── api/                        # client.ts (apiFetch, ApiError), productsQuerParam.ts, queryKeys.ts
        ├── types/                      # shared FE types per domain
        ├── utils/                      # pure helpers + Tailwind class-string maps
        ├── styles/index.css            # Tailwind import, @theme tokens, CSS vars, dark theme
        └── assets/                     # static images
```

## Placement rules

Reviewers reject files placed outside these rules. The misspelled paths `comopnents/` and `productsQuerParam.ts` are **canonical**. Do not create `components/` or rename them unless a dedicated refactor task does so.

| Kind of file | Location | Naming | Test location [PROPOSED] |
|---|---|---|---|
| HTTP controller | `backend/src/<feature>/` | `<feature>.controller.ts`, `@ApiTags('<feature>')`, `@Controller('<feature>')`. Example: `products/products.controller.ts` | `<feature>.controller.spec.ts` next to the file |
| Service (business logic) | `backend/src/<feature>/` | `<feature>.service.ts`, `@Injectable()` | `<feature>.service.spec.ts` next to the file |
| Data access | No repository layer: services inject `Repository<T>` | n/a | n/a |
| Entity | `backend/src/<feature>/` | `<name>.entity.ts` (kebab-case), `@Entity('<plural_snake>')`. Example: `product-image.entity.ts` | n/a |
| Nest module | `backend/src/<feature>/<feature>.module.ts` | Register it in `app.module.ts` | n/a |
| DTO / validation | `backend/src/<feature>/dto/` | `create-<x>.dto.ts`, `update-<x>.dto.ts`, `query-<x>.dto.ts`, `<thing>.validator.ts` | `dto/<file>.spec.ts` |
| Cross-cutting infra | `backend/src/<infra>/` with its own module | Example: `redis/redis.module.ts`, `cache.service.ts` | `<file>.spec.ts` next to the file |
| Backend e2e | `backend/test/` | `<feature>.e2e-spec.ts` [PROPOSED, Nest default] | |
| Migration | **None.** `synchronize: true`. A schema change means editing the entity, which is a risk gate | n/a | n/a |
| Route page | `frontend/src/app/<route>/page.tsx` | A thin default export rendering `views/<Screen>`. Wrap it in `<Suspense>` if the view uses `useSearchParams` | n/a |
| Screen | `frontend/src/views/` | `PascalCase.tsx`, `'use client'`, `function X() {}` + `export default X` | `frontend/src/views/<Screen>.test.tsx` |
| UI component | `frontend/src/comopnents/` (shared, e.g. `Header.tsx`, `Toast.tsx`) or `comopnents/<ScreenGroup>/` (e.g. `ProductListPageCom/`) | `PascalCase.tsx`, default export, `interface XProps` | `<Component>.test.tsx` next to the file |
| Hook | `frontend/src/hooks/` | `useX.ts`, named export | `useX.test.ts` next to the file |
| API function | `frontend/src/api/productsQuerParam.ts` (products). A new domain gets `api/<domain>.ts` [PROPOSED] | camelCase verbs that call `apiFetch<T>` (`getProducts`, `createProduct`) | `api/<file>.test.ts` |
| Query keys | `frontend/src/api/queryKeys.ts` | key-factory object | |
| FE type | `frontend/src/types/<domain>.ts` | PascalCase types | n/a |
| Shared utility / style map | `frontend/src/utils/` | `camelCase.ts` (e.g. `listUrl.ts`, `buttonStyles.ts`) | `<file>.test.ts` next to the file |
| Design tokens | `frontend/src/styles/index.css` (`@theme inline`) | CSS vars, then Tailwind utilities | n/a |
| Config | `backend/.env` (template: `backend/.env.example`). FE: `NEXT_PUBLIC_API_URL` (build-time) | Update `.env.example` whenever you add a variable | n/a |
| Docs | `docs/` | kebab-case `.md` | n/a |

## Layering / dependency rules

- **Backend:** controller -> service -> TypeORM `Repository` / `CacheService`. Controllers contain no business logic or DB access. `@Res({ passthrough: true })` is used only to set headers (e.g. `X-Cache`).
- **Features:** feature modules do not import other features' internals. Shared infra (e.g. `RedisModule`) is imported as a module.
- **Frontend:** `app/**/page.tsx` -> `views/` -> `comopnents/` + `hooks/` -> `api/` -> `apiFetch`. Components and views never call `fetch` or `apiFetch` directly. They go through hooks.
- **Types and utils:** `types/` and `utils/` import nothing from `views/`, `comopnents/` or `hooks/`.

## Do not touch

- **Generated code:** `frontend/next-env.d.ts`, `*.tsbuildinfo`, `.next/`, `dist/`, `frontend/AGENTS.md` (managed by `next dev`).
- **Vendored code:** none.
- **Runtime data:** `backend/uploads/` (user files, cleared by `seed`).
