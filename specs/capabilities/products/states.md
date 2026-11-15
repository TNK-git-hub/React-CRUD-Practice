# States: Product (products)

The requirement documents do not describe a product lifecycle; the table records the behavior of the existing code
(brownfield) — backend/src/products/products.service.ts, backend/src/products/products.controller.ts. Today a delete
removes the row, so there is no "deleted" state; the deletion policy itself is still open (`specs/_system/nfr.md`).

## States

| State | Meaning |
| --- | --- |
| (does not exist) | Never created, or removed by a delete; `GET /products/:id` returns 404 |
| exists | Stored; appears in the product list, search and filters, and on its detail page |

## Events

| Event | Triggered by |
| --- | --- |
| create | A visitor sends `POST /products/add` (create page) |
| edit | A visitor sends `PATCH /products/:id` (edit page) |
| delete | A visitor sends `DELETE /products/:id` (list card; the UI waits 5 seconds so the delete can be undone before it is sent) |
| view | A visitor opens the detail page (`GET /products/:id`) |

## Transition table

| State \ Event | create | edit | delete | view |
| --- | --- | --- | --- | --- |
| (does not exist) | → exists (new id; duplicate `sku` → ✗ 409 "sku already exists") | ✗ does not exist (404) | ✗ does not exist (404) | ✗ does not exist (404) |
| exists | = (no-op) for this product: create always makes another product with a new id | → exists (duplicate `sku` → ✗ 409) | → (does not exist); images, reviews and tag links go with it | = (no-op) |

## Open questions

- [NEEDS CLARIFICATION: should a delete keep the product in a "deleted" state (soft delete) or remove it as today?
  Depends on the deletion policy in `specs/_system/nfr.md`.]
