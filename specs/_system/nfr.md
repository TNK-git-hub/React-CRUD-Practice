# Non-functional requirements — React-CRUD-Practice (product management)

Brownfield: rows whose source is a file path record what the code does today; they are not new targets. The
requirement document (docs/requirements/price-range.md) gives no measured NFR. Values decided on branch
`001-products-price-range` (bootstrap of 2026-11-12) are not reused silently: each is a `[NEEDS CLARIFICATION]`
that names the earlier answer, so it can be confirmed or changed.

## Performance

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | `GET /products` results are cached in Redis per set of query parameters (`q`, `limit`, `skip`, `sortBy`, `order`, `minPrice`, `maxPrice`); creating / editing / deleting a product invalidates every cached list | lives at most 30 seconds | backend/src/products/products.service.ts; change 001-product-price-filter | PROD-001-S14, PROD-001-S10 |
| NFR-002 | `GET /products/:id` results are cached in Redis; editing / deleting the product removes that entry | lives at most 60 seconds | backend/src/products/products.service.ts | [to be set by the first change] |
| NFR-003 | Maximum number of products in one `GET /products` call | `limit` 1–100; the UI uses 10 | backend/src/products/dto/query-product.dto.ts; frontend/src/views/ProductList.tsx | [to be set by the first change] |
| NFR-004 | Response time of the product list (also when filtered by price) | < 1 second on the current seed data (backend/src/seed.ts) | user decision, clarify 2026-11-15 (change 001-product-price-filter) | SC-001 |

## Security and permissions

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-010 | Every permission check happens in the backend (constitution, Principle II) | constitution | denied-case test per protected operation |
| NFR-011 | The app has no login; no endpoint checks identity or permission. This is deliberate (practice app) and a known exception to constitution Principle II: with no identity there is no permission to check in the backend | docs/requirements/price-range.md#Requirement; backend/src/products/products.controller.ts; user decision, clarify 2026-11-15 | PROD-001-S4 |
| NFR-012 | Input is validated by `ValidationPipe` (`whitelist: true`, `transform: true`): wrong type / out of range → 400; undeclared fields or parameters are dropped silently, without an error | backend/src/main.ts | [to be set by the first change] |
| NFR-013 | CORS allows only the origin in the environment variable `FRONTEND_URL` | backend/src/main.ts | [to be set by the first change] |

### Permission matrix

From the existing code; the app has no login, so there is one role. Not checking permissions is pending NFR-011.

| Action \ Role | Visitor |
| --- | --- |
| List, search, sort, page through products | ✓ |
| Filter the list by price range | ✓ — public read (docs/requirements/price-range.md#Requirement) |
| View a product | ✓ |
| Create / edit / delete a product, upload an image | ✓ — no permission check today (NFR-011) |

## Data and deletion policy (mandatory)

The requirement documents say nothing about deletion. Current behavior, for reference only (not a policy):
`DELETE /products/:id` hard-deletes the product and the database cascades to its images, reviews and tag links
(backend/src/products/products.service.ts); the frontend waits 5 seconds before sending `DELETE`, so the user can undo
(frontend/src/hooks/useProductMutations.ts); the response carries `isDeleted: true` and `deletedOn` in the dummyjson
shape although the row is gone; uploaded files under `backend/uploads/` are not removed.

| Data type | Soft / hard delete | Keep deleted data for | Who may restore | Source |
| --- | --- | --- | --- | --- |
| Product (`products`) | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | — (documents silent; code hard-deletes) |
| Product image (`product_images`) | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | — (documents silent; code cascades with the product) |
| Review (`reviews`) | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | — (documents silent; code cascades with the product) |
| Tag link (`product_tags`); `tags` rows | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | — (documents silent; code cascades the links, keeps the tags) |
| Uploaded image file (`backend/uploads/`) | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | [NEEDS CLARIFICATION] | — (documents silent; code never removes the file) |

## Availability and operations

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-030 | Deployed with Docker Compose (Postgres 16, Redis 8, backend, frontend, nginx) on one EC2 instance, set up by hand; only nginx exposes port 80 | — | docker-compose.prod.yml; docs/deploy-ec2.md | [to be set by the first change] |
| NFR-031 | Redis does not persist to disk; when Redis fails or is down the cache fails open and every read goes to Postgres | — | docker-compose.prod.yml; backend/src/redis/cache.service.ts | [to be set by the first change] |
| NFR-032 | Uploaded images are stored on the `uploads` volume and survive container rebuilds | — | docker-compose.prod.yml | [to be set by the first change] |
| NFR-033 | Existing stack (recorded, not chosen): frontend Next.js 16 + React 19 + TanStack Query 5 + Tailwind 4; backend NestJS 12 + TypeORM + PostgreSQL; Redis; TypeScript `strict: true` in both; Vitest in both; pnpm workspace | — | frontend/package.json; backend/package.json; frontend/tsconfig.json; backend/tsconfig.json; pnpm-workspace.yaml | [to be set by the first change] |
| NFR-034 | Uptime and Postgres backups | [NEEDS CLARIFICATION: on branch 001 you chose "no uptime target; no backups"; keep?] | [NEEDS CLARIFICATION] | [to be set by the first change] |
| NFR-035 | Every PR runs CI: `pnpm ci:local` (lint, typecheck, build, tests) and `spec-check`, on GitHub-hosted runners (`ubuntu-latest`) | — | .github/workflows/ci.yml | [to be set by the first change] |

## User environment

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-040 | UI language: new UI text (labels, messages) is Vietnamese; existing English labels stay as they are. Narrow screens (≤ 400 px, `max-xs`) have their own layout | frontend/src/styles/index.css; frontend/src/comopnents/; user decision, clarify 2026-11-15 | Review |
| NFR-041 | Currency: USD (the UI shows `$`); other currencies are out of scope | docs/requirements/price-range.md#Out of scope; frontend/src/comopnents/ProductListPageCom/ProductCard.tsx | [to be set by the first change] |
| NFR-042 | Supported browsers: current Chrome, Safari and Firefox on desktop | user decision, clarify 2026-11-15 | SC-004 manual check |
| NFR-043 | Image upload: PNG, JPG or WEBP only; at most 2 MB per file | backend/src/uploads/uploads.controller.ts | [to be set by the first change] |
| NFR-044 | Each price input has a visible label tied to it; an input whose check failed is marked `aria-invalid="true"` and its message is linked to it by `aria-describedby` | change 001-product-price-filter (clarify 2026-11-15) | PROD-003-S23 |

## Open questions

- [NEEDS CLARIFICATION: deletion policy, every cell of "Data and deletion policy" — soft or hard delete, how long
  deleted data is kept, who may restore. Not needed by 001 (it deletes nothing), but required before any change that
  deletes data (constitution Principle III).]
- NFR-004, NFR-011, NFR-034, NFR-040, NFR-042: confirm or change the answers given on branch 001 (see each row).
