# Filter products by price range

> Source: `docs/requirements/price-range.md` on branch `001-products-price-range` (Vietnamese original), translated to
> English as `.claude/CLAUDE.md` ("Language") requires.

## Context
The product management app is running (Next.js + NestJS + Postgres). The current code is the source of truth for the
behavior that already exists.

## Requirement
- **Who:** a visitor of the product list page (the app has no login yet).
- **What:** enter a minimum price and/or a maximum price; the list shows only products whose price lies within the
  range, both ends included. An empty field means no limit on that side. Works together with the existing search,
  sorting and pagination.
- **Why:** the list is long; visitors want to find products within their budget.
- **Constraints:** `GET /products` accepts two new parameters, `minPrice` and `maxPrice`; prices are not negative; at
  most 2 decimal places (the price column is `numeric(10,2)`).

## Out of scope
Filtering by discount, keeping the filter between visits, currencies other than USD (the app uses USD today).
