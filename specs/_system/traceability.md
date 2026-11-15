# Traceability — React-CRUD-Practice (product management)

The requirement document is not numbered, so its items are numbered `REQ-NN` in order of appearance in
docs/requirements/price-range.md; business rules take their IDs from `capabilities/products/rules.md`.

| Requirement item | Summary | Type | Owning change | Requirement ID |
| --- | --- | --- | --- | --- |
| REQ-01 (price-range.md#Requirement, "What") | A visitor enters a minimum price and/or a maximum price; the list shows only products whose price is in the range | functional | 001-product-price-filter | |
| REQ-02 (price-range.md#Requirement, "What") | An empty field means no limit on that side | functional | 001-product-price-filter | |
| REQ-03 (price-range.md#Requirement, "What") | The price range works together with the existing search, sort and pagination | functional | 001-product-price-filter | |
| REQ-04 (price-range.md#Requirement, "Constraints") | `GET /products` accepts two new parameters, `minPrice` and `maxPrice` | functional | 001-product-price-filter | |
| BR-PROD-01 | A price range includes both ends | business rule | 001-product-price-filter | |
| BR-PROD-02 | An empty end means no limit on that side | business rule | 001-product-price-filter | |
| BR-PROD-03 | Price bounds are not negative | business rule | 001-product-price-filter | |
| BR-PROD-04 | Price bounds have at most 2 decimal places | business rule | 001-product-price-filter | |
| BR-PROD-05 | The range combines with search, sort and pagination | business rule | 001-product-price-filter | |
| price-range.md#Context | The current code is the source of truth for existing behavior (Next.js + NestJS + Postgres) | NFR | existing (NFR-033), no change | — |
| price-range.md#Requirement, "Who" | The app has no login; the visitor is anonymous | NFR | existing (NFR-011), no change | — |
| price-range.md#Requirement, "Why" | Visitors want to find products within their budget | functional (goal of REQ-01) | 001-product-price-filter | |
| NFR-004 | Response time of the product list, also when filtered | NFR | 001-product-price-filter | |
| NFR-042 | Supported browsers (price filter UI) | NFR | 001-product-price-filter | |
| price-range.md#Out of scope | Filtering by discount | out of scope | out of scope | — |
| price-range.md#Out of scope | Keeping the filter between visits | out of scope | out of scope | — |
| price-range.md#Out of scope | Currencies other than USD | out of scope | out of scope | — |

## Unassigned

- Price conflict `≥ 0` (server, backend/src/products/dto/create-product.dto.ts) / `> 0` (create form,
  frontend/src/utils/productForm.ts) — [NEEDS CLARIFICATION: out of scope as on branch 001, or its own change?]
