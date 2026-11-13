# Business rules: products

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-PROD-01 | The price range includes both ends: a product priced exactly at the minimum or the maximum price is shown | docs/requirements/price-range.md#Yêu cầu |
| BR-PROD-02 | An empty minimum price means no lower bound; an empty maximum price means no upper bound | docs/requirements/price-range.md#Yêu cầu |
| BR-PROD-03 | The minimum and maximum prices are not negative; a price of 0 is valid | docs/requirements/price-range.md#Yêu cầu; user decision, 2026-11-12 |
| BR-PROD-04 | The minimum and maximum prices have at most 2 decimals (the price column is `numeric(10,2)`) | docs/requirements/price-range.md#Yêu cầu |
| BR-PROD-05 | The minimum price may not exceed the maximum price: the UI blocks it with "Giá tối thiểu không được lớn hơn giá tối đa"; the backend returns 400 | user decision, 2026-11-12 |
| BR-PROD-06 | The minimum and maximum prices do not exceed 99999999.99 (the limit of the `numeric(10,2)` column) | user decision, 2026-11-12 |
| BR-PROD-07 | A negative value, a value with more than 2 decimals or a value that is not a number: the UI blocks it before sending, with a specific error for each case; the backend still returns 400 | user decision, 2026-11-12 |

## Decision tables

### BR-PROD-02: Price range with an empty end

Applies when every value entered is valid (BR-PROD-03, BR-PROD-04, BR-PROD-06, BR-PROD-07).

| Has a minimum price | Has a maximum price | Result |
| --- | --- | --- |
| yes | yes | Minimum ≤ maximum: show products with minimum ≤ price ≤ maximum. Minimum > maximum: blocked by BR-PROD-05 |
| yes | no | Show products with price ≥ minimum |
| no | yes | Show products with price ≤ maximum |
| no | no | No price filter (as today) |

## Open questions

- _(none)_ — the exact text of each BR-PROD-07 error was left to the `/speckit-clarify` step of 001.
