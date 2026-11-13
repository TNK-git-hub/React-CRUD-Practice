# Traceability — React-CRUD-Practice (product management)

The documents have no numbering, so items are numbered `REQ-NN` in order of appearance: REQ-01–REQ-04 in
docs/requirements/price-range.md, REQ-05 onward in docs/requirements/discount-filter.md; business rules take their IDs
from `capabilities/products/rules.md`.

| Requirement item | Summary | Type | Owning change | Requirement ID |
| --- | --- | --- | --- | --- |
| REQ-01 (price-range.md#Yêu cầu, "Làm gì") | A viewer enters a minimum and/or maximum price; the list shows only products priced within the range | functional | 001-products-price-range | PROD-001 |
| REQ-02 (price-range.md#Yêu cầu, "Làm gì") | An empty input means no bound on that side | functional | 001-products-price-range | PROD-001 |
| REQ-03 (price-range.md#Yêu cầu, "Làm gì") | The price filter combines with the existing search, sort and pagination | functional | 001-products-price-range | PROD-002 |
| REQ-04 (price-range.md#Yêu cầu, "Ràng buộc") | `GET /products` also takes `minPrice`, `maxPrice` | functional | 001-products-price-range | PROD-001 |
| BR-PROD-01 | The price range includes both ends | business rule | 001-products-price-range | PROD-001 |
| BR-PROD-02 | An empty end means no bound on that side | business rule | 001-products-price-range | PROD-001 |
| BR-PROD-03 | Price filter values are not negative; 0 is valid | business rule | 001-products-price-range | PROD-003 |
| BR-PROD-04 | Price filter values have at most 2 decimals (price column `numeric(10,2)`) | business rule | 001-products-price-range | PROD-003 |
| BR-PROD-05 | Minimum price > maximum price: the UI blocks it with "Giá tối thiểu không được lớn hơn giá tối đa"; the backend returns 400 | business rule | 001-products-price-range | PROD-003 |
| BR-PROD-06 | Price filter values do not exceed 99999999.99 | business rule | 001-products-price-range | PROD-003 |
| BR-PROD-07 | Invalid price filter values: the UI blocks them first with a specific error; the backend returns 400 | business rule | 001-products-price-range | PROD-003 |
| price-range.md#Bối cảnh | The current code is the source of truth for existing behavior (Next.js + NestJS + Postgres) | NFR | existing (NFR-033), owned by no change | — |
| NFR-004 (user decision, 2026-11-12) | The list (also when filtered by price) responds in < 1 second on the current seed data | NFR | 001-products-price-range | NFR-004 |
| NFR-011 (user decision, 2026-11-12) | No permission check is intended; filtering by price is a public read; known exception to constitution Principle II | NFR | existing, owned by no change; 001 adds no permission check | — |
| NFR-042 (user decision, 2026-11-12) | Current Chrome, Safari, Firefox on desktop | NFR | 001-products-price-range (the price filter UI) | NFR-042 |
| price-range.md#Ngoài phạm vi | Filtering by discount | out of scope | out of scope for 001; requested later as 002-products-discount-filter (docs/requirements/discount-filter.md) | — |
| price-range.md#Ngoài phạm vi | Saving filters between visits | out of scope | out of scope | — |
| price-range.md#Ngoài phạm vi | Currencies other than USD | out of scope | out of scope | — |
| user decision, 2026-11-12 | The price conflict `≥ 0` (backend, create-product.dto.ts) / `> 0` (create form, frontend/src/utils/productForm.ts) | out of scope | out of scope | — |
| REQ-05 (discount-filter.md#What we want) | A viewer chooses a minimum discount: Any, 10%, 20%, 30% or 50% or more | functional | 002-products-discount-filter | |
| REQ-06 (discount-filter.md#What we want) | Only products whose discount is at least the chosen value are shown | functional | 002-products-discount-filter | |
| REQ-07 (discount-filter.md#What we want) | The discount filter works with keyword search, price range, sorting and pagination | functional | 002-products-discount-filter | |
| REQ-08 (discount-filter.md#What we want) | The chosen discount is kept in the URL, so a link or Back restores it | functional | 002-products-discount-filter | |
| REQ-09 (discount-filter.md#What we want) | Clearing the filters also clears the discount | functional | 002-products-discount-filter | |
| discount-filter.md#Notes | Products already have a discount percentage (e.g. 12.96) | NFR | existing (domain-model.md, `discountPercentage`), owned by no change | — |
| discount-filter.md#Notes | No change to how products are created or edited | out of scope | out of scope | — |
| discount-filter.md#Notes | Sorting by discount | out of scope | out of scope | — |

## Unassigned

- _(none)_
