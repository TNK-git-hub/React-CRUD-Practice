# Roadmap

Status values: `planned`, `in progress`, `done`.
Update the status of an item as work moves forward. Do not delete finished items.

## Phases

| # | Phase | Goal | Status |
|---|-------|------|--------|
| 1 | Foundation | pnpm monorepo (`frontend/`, `backend/`), NestJS API, TypeORM + Postgres, seed from DummyJSON, Swagger at `/docs` | done |
| 2 | Browse catalog | Product list with search, sort and pagination; product detail page; light/dark theme | done |
| 3 | Manage products | Create, edit (changed-field highlight, unsaved-changes guard), delete with 5 s undo; validation on client and server | done |
| 4 | Image upload | `POST /uploads` (PNG/JPG/WEBP, ≤ 2 MB, ≤ 5 per product); first image is the thumbnail | done |
| 5 | Redis cache | Cache-aside for list and detail, fail-open, invalidated on writes; before/after load test in `docs/performance/` | done |
| 6 | Price-range filter | `minPrice` / `maxPrice` on `GET /products` with shared client/server rules (PROD-003, 001-ADR-1..4) | done |
| 7 | Deploy | Docker images, `docker-compose.prod.yml` with nginx, manual deploy to one EC2 instance | done |
| 8 | Shopping cart | Shoppers can add products to a cart | planned |
| 9 | Checkout and orders | Shoppers can check out a cart and place an order | planned |

## Notes
- 2026-11-27: Roadmap created by `/onboard` from the existing code. The user confirmed that
  cart and checkout/orders are in scope (this replaces an earlier answer that put them out of
  scope).
- 2026-11-27: The code refers to PROD-003 and 001-ADR-1..4, but those spec and ADR files
  are not in the repository.
