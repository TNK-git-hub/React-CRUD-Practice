# Business rules: products

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-PROD-01 | A price range includes both ends: a product whose price equals the minimum price or the maximum price is shown | docs/requirements/price-range.md#Requirement |
| BR-PROD-02 | An empty minimum price means no lower limit; an empty maximum price means no upper limit | docs/requirements/price-range.md#Requirement |
| BR-PROD-03 | The minimum price and the maximum price are not negative | docs/requirements/price-range.md#Requirement (Constraints) |
| BR-PROD-04 | The minimum price and the maximum price have at most 2 decimal places (the price column is `numeric(10,2)`) | docs/requirements/price-range.md#Requirement (Constraints) |
| BR-PROD-05 | The price range works together with the existing search, sort and pagination: the list shows only products that match the keyword and the range, sorted and paged as today | docs/requirements/price-range.md#Requirement |

## Decision tables

### BR-PROD-02: Price range with one end empty

Applies when every value entered is valid (BR-PROD-03, BR-PROD-04).

| Minimum price set | Maximum price set | Result |
| --- | --- | --- |
| yes | yes | Products with minimum price ≤ price ≤ maximum price. Minimum price > maximum price: [NEEDS CLARIFICATION] (see Open questions) |
| yes | no | Products with price ≥ minimum price |
| no | yes | Products with price ≤ maximum price |
| no | no | No price filter (as today) |

## Open questions

- [NEEDS CLARIFICATION: minimum price > maximum price — blocked or allowed (empty list)? On branch 001 you chose: the
  UI blocks it with "Giá tối thiểu không được lớn hơn giá tối đa" and the backend returns 400.]
- [NEEDS CLARIFICATION: is a price of 0 a valid bound? On branch 001 you chose yes.]
- [NEEDS CLARIFICATION: upper limit of a bound? On branch 001 you chose 99999999.99, the largest value of
  `numeric(10,2)`.]
- [NEEDS CLARIFICATION: invalid values (negative, more than 2 decimals, not a number) — what happens? On branch 001
  you chose: the UI blocks before sending with a specific message per case, the backend still returns 400; the exact
  messages were left to `/speckit-clarify` of the change.]
