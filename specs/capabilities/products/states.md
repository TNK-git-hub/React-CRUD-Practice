# States: Product (products)

The requirement document does not describe a product lifecycle; the table records the current behavior of the code
(brownfield) — backend/src/products/products.service.ts, backend/src/products/products.controller.ts.
Deleting is a hard delete (see `specs/_system/nfr.md`), so there is no "deleted" state.

## States

| State | Meaning |
| --- | --- |
| (does not exist) | Not created yet, or hard-deleted; `GET /products/:id` returns 404 |
| exists | In the database; shown in the list, search and filters |

## Events

| Event | Triggered by |
| --- | --- |
| create | A viewer sends `POST /products/add` |
| edit | A viewer sends `PATCH /products/:id` |
| delete | A viewer sends `DELETE /products/:id` (the UI waits 5 seconds, allowing undo, before sending) |

## Transition table

| State \ Event | create | edit | delete |
| --- | --- | --- | --- |
| (does not exist) | → exists (new id; duplicate `sku` → ✗ 409) | ✗ does not exist (404) | ✗ does not exist (404) |
| exists | ✗ not applicable: create always makes a new product with a new id | → exists (duplicate `sku` → ✗ 409) | → (does not exist) — hard delete, cascading to images / reviews / tag links |

## Open questions

- _(none)_
