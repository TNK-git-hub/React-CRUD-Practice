# Spec (temporary): frontend utility functions

Status: **draft / temporary**, written to drive the first unit tests.
Source of truth for `frontend/src/utils/*.test.ts`: every test name starts with a rule ID from this file
(e.g. `PAGE-2`), so a failing test points straight to the rule it breaks.

Scope: pure functions in `frontend/src/utils/` (no API, no browser).

---

## 1. `getPreviousPrice(price, discountPercentage)` — `getPreviousPrice.ts`

Shows the "old" price next to the discounted price on a product card.
`price` is the price **after** the discount.

| ID | Rule | Example |
|---|---|---|
| PRICE-1 | Returns `price / (1 - discountPercentage / 100)` | `(80, 20)` → `"100.00"`, `(100, 50)` → `"200.00"` |
| PRICE-2 | Result is a **string** with exactly 2 decimals (rounded) | `(19.99, 10.48)` → `"22.33"` |
| PRICE-3 | No discount → same price | `(9.99, 0)` → `"9.99"` |

## 2. `genPageArray(totalPage, currentPage)` — `genPageArray.ts`

Builds the pagination buttons. `'...'` is a gap.

| ID | Rule | Example |
|---|---|---|
| PAGE-1 | `totalPage ≤ 6` → every page, no gap | `(6, 3)` → `[1,2,3,4,5,6]`, `(1, 1)` → `[1]`, `(0, 1)` → `[]` |
| PAGE-2 | `totalPage > 6` and `currentPage ≤ 5` → first 5 pages, gap, last page | `(20, 1)` and `(20, 5)` → `[1,2,3,4,5,'...',20]`, `(7, 5)` → `[1,2,3,4,5,'...',7]` |
| PAGE-3 | `currentPage ≥ 6` and `currentPage < totalPage - 1` → first, gap, current, gap, last | `(20, 6)` → `[1,'...',6,'...',20]`, `(20, 18)` → `[1,'...',18,'...',20]` |
| PAGE-4 | `currentPage = totalPage - 1` → no second gap | `(20, 19)` → `[1,'...',19,20]` |
| PAGE-5 | `currentPage = totalPage` → last page shown once | `(20, 20)` → `[1,'...',20]` |
| PAGE-6 | The current page always appears in the result (for `1 ≤ currentPage ≤ totalPage`) | any valid input |

## 3. `isSortField(v)` / `isSortOrder(v)` — `sortParams.ts`

URL query values can be anything the user types, so they are checked before use.

| ID | Rule | Example |
|---|---|---|
| SORT-1 | `isSortField` is true only for `title`, `price`, `rating`, `stock` | `'price'` → true; `'id'`, `'Price'`, `''`, `null` → false |
| SORT-2 | `isSortOrder` is true only for `asc`, `desc` (lower case) | `'desc'` → true; `'ASC'`, `''`, `null` → false |

## 4. `validateProduct(form)` — `productForm.ts`

Validates the Add / Edit product form. Returns `{ fieldId: message }`; `{}` means valid.
Only these fields are required: title, description, category, price, stock.

| ID | Rule | Message |
|---|---|---|
| VAL-1 | Title required (spaces only = empty) | `Tên sản phẩm là bắt buộc.` |
| VAL-2 | Title length 3–100 after trimming | `Tên phải từ 3–100 ký tự.` |
| VAL-3 | Description required | `Mô tả là bắt buộc.` |
| VAL-4 | Category must be one of `CATEGORIES` | `Hãy chọn danh mục.` |
| VAL-5 | Price required; must be a number > 0 (`0`, `-1`, `abc` are invalid; `0.01` is valid) | `Giá là bắt buộc.` / `Giá phải lớn hơn 0.` |
| VAL-6 | Stock required; must be an integer ≥ 0 (`0` is valid; `1.5`, `-1`, `abc` are invalid) | `Tồn kho là bắt buộc.` / `Tồn kho phải là số nguyên ≥ 0.` |
| VAL-7 | Optional fields (brand, sku, weight, …) never produce errors, even when empty | — |
| VAL-8 | All errors are reported at once: the empty form has errors for exactly title, description, category, price, stock | — |

## 5. `buildPayload(form, tags, images?)` — `productForm.ts`

Turns form values (always strings) into the JSON body sent to the backend.

| ID | Rule | Example |
|---|---|---|
| PAY-1 | `title` and `description` are trimmed | `'  Lipstick  '` → `'Lipstick'` |
| PAY-2 | Number fields: `''` → `undefined` (left out of the JSON), otherwise `Number(v)` | `price: '12.5'` → `12.5`, `weight: ''` → `undefined` |
| PAY-3 | Optional text fields: trimmed; empty or spaces → `undefined` | `brand: ' Apple '` → `'Apple'`, `sku: '   '` → `undefined` |
| PAY-4 | `availabilityStatus: ''` → `undefined` | — |
| PAY-5 | `width`, `height`, `depth` are grouped into `dimensions` | `{ width: 1, height: 2, depth: undefined }` |
| PAY-6 | `tags` are passed through; `images` defaults to `[]` | — |
| PAY-7 | No `barcode` field: the backend generates it | — |

## 6. `productToForm(product)` — `productForm.ts`

Fills the Edit form from a product returned by the API.

| ID | Rule | Example |
|---|---|---|
| FORM-1 | Numbers become strings | `price: 11.49` → `'11.49'`, `stock: 0` → `'0'` |
| FORM-2 | `null` / `undefined` become `''` | `brand: null` → `''` |
| FORM-3 | `dimensions` is flattened into `width`, `height`, `depth` | `{ width: 10, height: null }` → `width: '10'`, `height: ''` |
| FORM-4 | Round trip: `buildPayload(productToForm(p), p.tags)` keeps the same numbers and text | — |

## 7. `getChangedFields(form, initialForm, tags, initialTags, images?, initialImageUrls?)` — `productForm.ts`

Used to warn about unsaved changes and to highlight edited fields. Returns a `Set` of field ids.

| ID | Rule | Example |
|---|---|---|
| CHG-1 | Nothing changed → empty set | — |
| CHG-2 | Each form field that differs is listed by its id | title + price edited → `{'title', 'price'}` |
| CHG-3 | Tags: added, removed or **reordered** → `'tags'` | `['a','b']` vs `['b','a']` → `{'tags'}` |
| CHG-4 | Images: added (new file, no url), removed or reordered → `'images'`; same urls in the same order → not changed | — |

---

## Open questions (not tested yet; decide the intended behavior first)

1. `getPreviousPrice(x, 100)` divides by zero and returns `"Infinity"`. Should a 100% discount hide the old price instead?
2. `genPageArray` with `currentPage < 1` or `currentPage > totalPage` (e.g. a hand-typed URL `?page=99`) returns odd arrays. Should the page be clamped first?
3. `validateProduct` accepts `price: '1e3'` (= 1000) because it uses `Number()`. Is scientific notation OK?
4. `StockStatus` ignores its `status` prop and always shows "In Stock"; `SaveErrorBanner` always shows "HTTP 500". Both need a spec before they can be tested.
