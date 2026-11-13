# Non-functional requirements — React-CRUD-Practice (product management)

Brownfield: rows whose source is a file path record the current behavior of the code, not a new target.
The requirement document (docs/requirements/price-range.md) states no measured NFR; rows sourced
"user decision" are answers given at bootstrap.

## Performance

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | `GET /products` results are cached in Redis per set of query parameters (`q`, `limit`, `skip`, `sortBy`, `order`, `minPrice`, `maxPrice`); create / edit / delete invalidates every list cache | lives at most 30 seconds | backend/src/products/products.service.ts; change 001-products-price-range | PROD-001-S14 |
| NFR-002 | `GET /products/:id` results are cached in Redis; edit / delete removes that cache entry | lives at most 60 seconds | backend/src/products/products.service.ts | — |
| NFR-003 | Maximum number of products in one `GET /products` call | `limit` 1–100; the UI uses 10 | backend/src/products/dto/query-product.dto.ts; frontend/src/views/ProductList.tsx | — |
| NFR-004 | The product list responds, also when filtered by price | < 1 second on the current seed data (backend/src/seed.ts) | user decision, 2026-11-12 | — |

## Security and permissions

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-010 | Every permission check happens in the backend (constitution, Principle II) | constitution | — |
| NFR-011 | The app has no login; no endpoint checks identity or permissions. This is intended (practice app) and is a **known exception to constitution, Principle II**: with no identity there is no permission to check in the backend | docs/requirements/price-range.md#Yêu cầu; backend/src/products/products.controller.ts; user decision, 2026-11-12 | — |
| NFR-012 | Input is validated by `ValidationPipe` (`whitelist: true`, `transform: true`): wrong type / out of range → 400; undeclared fields or parameters are dropped silently, without an error | backend/src/main.ts | — |
| NFR-013 | CORS allows only the origin in the `FRONTEND_URL` environment variable | backend/src/main.ts | — |

### Permission matrix

From the current code; the app has no login, so there is a single role. Not checking permissions is intended — a
known exception to constitution Principle II (NFR-011).

| Action \ Role | Viewer |
| --- | --- |
| See the list, search, sort, paginate | ✓ |
| Filter the list by price range | ✓ — public read (docs/requirements/price-range.md#Yêu cầu) |
| See a product's details | ✓ |
| Create / edit / delete products, upload images | ✓ — intended, no permission check (known exception, NFR-011) |

## Data and deletion policy (mandatory)

Current behavior: `DELETE /products/:id` hard-deletes the product; the database cascades to its images, reviews and
tag links.

| Data type | Soft / hard delete | Keep deleted data for | Who may restore | Source |
| --- | --- | --- | --- | --- |
| Product (`products`) | Hard delete | Not kept: the row is removed from Postgres at once; its detail cache is deleted and list caches are invalidated right after | No one (there is no restore) | backend/src/products/products.service.ts |
| Product image (`product_images`) | Hard delete, cascaded from the product | Not kept | No one | backend/src/products/products.service.ts; backend/src/products/product-image.entity.ts |
| Review (`reviews`) | Hard delete, cascaded from the product | Not kept | No one | backend/src/products/products.service.ts; backend/src/products/review.entity.ts |
| Tag link (`product_tags`) | Hard delete, cascaded from the product; the `tags` row is kept | Not kept | No one | backend/src/products/products.service.ts; backend/src/products/product.entity.ts |

There are no backups (NFR-034), so no copy of deleted data exists outside Postgres.

**Known current issues** (current behavior, recorded; not fixed in the current roadmap):

- **Orphan image files:** deleting a product (or replacing its images on edit) only deletes the URL rows in
  `product_images`; the files in `backend/uploads/` stay on the `uploads` volume and are still reachable at
  `/uploads/<file name>` — backend/src/products/products.service.ts, backend/src/uploads/uploads.controller.ts,
  backend/src/main.ts.
- **Misleading `isDeleted`:** the response of `DELETE /products/:id` has `isDeleted: true` and `deletedOn` (kept in
  the dummyjson shape), which looks like a soft delete, but the row is hard-deleted and cannot be restored —
  backend/src/products/products.service.ts.
- **Undo is only the browser waiting:** the UI's "undo" button only makes the browser wait 5 seconds before sending
  `DELETE`; closing the tab while waiting means the request is never sent, and once sent it cannot be undone —
  frontend/src/hooks/useProductMutations.ts.

## Availability and operations

| ID | Requirement | Number | Source | Verification |
| --- | --- | --- | --- | --- |
| NFR-030 | Deployed with Docker Compose (Postgres 16, Redis 8, backend, frontend, nginx) on EC2 created with Terraform | — | docker-compose.prod.yml; infra/ | — |
| NFR-031 | Redis does not persist to disk; when Redis fails or is down the cache fails open and every read goes straight to Postgres | — | docker-compose.prod.yml; backend/src/redis/cache.service.ts | — |
| NFR-032 | Uploaded images are stored on the `uploads` volume and survive container rebuilds | — | docker-compose.prod.yml | — |
| NFR-033 | Current stack (recorded, not chosen anew): frontend Next.js 16 + React 19 + TanStack Query 5 + Tailwind 4; backend NestJS 12 + TypeORM + Postgres; Redis; TypeScript `strict: true` in both; pnpm workspace | — | frontend/package.json; backend/package.json; frontend/tsconfig.json; backend/tsconfig.json; pnpm-workspace.yaml | — |
| NFR-034 | Uptime, Postgres backups | No uptime requirement; no backup requirement | user decision, 2026-11-12 | — |

## User environment

| ID | Requirement | Source | Verification |
| --- | --- | --- | --- |
| NFR-040 | Vietnamese UI; a separate layout for narrow screens (breakpoint `xs`) | frontend/src/views/ProductList.tsx | — |
| NFR-041 | Currency: USD (the UI shows `$`); other currencies are out of scope | docs/requirements/price-range.md#Ngoài phạm vi; frontend/src/comopnents/ProductListPageCom/ProductCard.tsx; user decision, 2026-11-12 | — |
| NFR-042 | Supported browsers: current Chrome, Safari, Firefox on desktop | user decision, 2026-11-12 | — |
| NFR-043 | Image upload: PNG, JPG, WEBP only; at most 2 MB per file | backend/src/uploads/uploads.controller.ts | — |
| NFR-044 | Each price input has a visible label, and its error message is linked to it by `aria-describedby` | change 001-products-price-range (clarify, 2026-11-12) | Accessibility assertions in the tests of PROD-003-S2, S6, S7, S9, S16 |

## Open questions

- _(none)_
