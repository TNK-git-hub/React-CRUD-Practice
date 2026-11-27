# Mission

## Problem
A learning and practice project for building a full-stack web application. It is a product
catalog modelled on the DummyJSON products API: the catalog can be browsed, searched,
filtered and sorted, and products can be created, edited and deleted. The frontend talks to
its own NestJS backend, which replaces DummyJSON; the original DummyJSON data is loaded
with a seed script.

## Users
- **Catalog admin / staff**: manage products. They add, edit and delete products, upload
  product images (PNG, JPG or WEBP, up to 5 per product, 2 MB each), and set price, stock,
  specs and tags.
- **Shopper / visitor**: browse the catalog. They search by title or description, filter
  by price range, sort by title, price, rating or stock, page through the results, and open
  a product's detail page (gallery, price and discount, stock, specs, tags, reviews).

The app has no login today, so every visitor can also use the admin actions.

## Goals
1. Full CRUD runs against the project's own backend (`NEXT_PUBLIC_API_URL` set, not
   DummyJSON). Each of these flows works end to end:
   - list with search (`q`), price range (`minPrice`/`maxPrice`), sort and pagination
     (10 per page);
   - product detail;
   - create (`POST /products/add`) and edit (`PATCH /products/:id`);
   - delete (`DELETE /products/:id`), with a 5-second undo from the list page;
   - image upload (`POST /uploads`), at most 5 images per product and 2 MB per image.

## Out of scope
None stated yet. Shopping cart and checkout/orders are in scope (see the roadmap).

## Sources
- The existing repository: `backend/` (NestJS API, entities, DTOs, Redis cache, uploads,
  seed), `frontend/` (Next.js app, views, components, hooks, utils), `docker-compose.yml`,
  `docker-compose.prod.yml`, `package.json`, `pnpm-workspace.yaml`.
- `docs/deploy-ec2.md`, `docs/performance/redis-comparison.md`.
- `docs/requirements/` holds no requirement files (only `README.md`).
- The user's answers during `/onboard` on 2026-11-27 (purpose, users, goals, scope).
