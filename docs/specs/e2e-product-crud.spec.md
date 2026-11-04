# Spec (temporary): end-to-end product CRUD flows

Status: **draft / temporary**, written to drive the first Playwright tests.
Source of truth for `frontend/e2e/*.spec.ts`: every test name starts with a rule ID from this file.

## Setup the tests run against

- Real stack: frontend (`vite build` + `vite preview` on :4173) → backend (NestJS on :3100) → Postgres + Redis.
- Own database `crud_e2e` (never the dev database). It is reset at the start of every run.
- Each test creates the data it needs through the API (`POST /products/add`) or the UI, with a **unique title prefix**,
  and only looks at its own data (usually through a search), so tests don't depend on each other or on order.
- No `seed` / dummyjson.com: tests must not depend on the internet.
- Browser: Chromium, desktop size (1280×800).

## Flows

| ID | Flow | Expected |
|---|---|---|
| E2E-1 | Search for a word no product has | "Không tìm thấy sản phẩm nào" with the word in bold; button "Xoá từ khoá" goes back to `/` |
| E2E-2 | Add a product through the form (title, description, category, price, discount, stock) and click "Lưu sản phẩm" | Goes to `/products/<id>`; heading = the title; price shows `$<price>`; toast "created" appears; the product is in the list |
| E2E-3 | Click "Lưu sản phẩm" on an empty form | Stays on `/products/add`; banner "còn **5 field** chưa hợp lệ"; messages for title, description, category, price, stock (same texts as `VAL-*`); no product is created |
| E2E-4 | Open a product's menu "…" → "Sửa", change the price, click "Lưu thay đổi" | "Lưu thay đổi" is disabled until something changes; after saving, goes to the detail page with the new price |
| E2E-5 | Open a product's menu "…" → "Xoá" → confirm "Xoá sản phẩm" | Dialog shows the title; the card disappears at once; a toast with "Hoàn tác" appears; after the 5 s undo window the product is gone from the server too (reload → not found) |
| E2E-6 | "Hoàn tác" on the delete toast within 5 s | The card comes back and the product still exists on the server |
| E2E-7 | Search with a word matching 2 of 3 products (title **or** description) | Only those 2 cards are shown; URL is `/products/search?q=<word>` |
| E2E-8 | 25 products match a search | "Hiển thị 1-10 trong 25 sản phẩm"; page buttons `1 2 3`, "Previous" disabled on page 1; page 3 shows "21-25" and "Next" disabled |
| E2E-9 | Open `/products/<id that doesn't exist>` | "Sản phẩm không tồn tại"; "← Về danh sách" goes back to `/` |

## Open questions (not tested yet)

1. Empty database: the list shows "Không tìm thấy sản phẩm nào — Không có kết quả cho từ khoá “”" (an empty keyword).
   Should an empty shop have its own message ("Chưa có sản phẩm nào" + "Thêm sản phẩm")?
2. Error messages on the list and detail pages still say "Yêu cầu tới DummyJSON thất bại" even when the app uses our backend.
3. The delete dialog says "Hành động này không thể hoàn tác" but the toast offers "Hoàn tác" for 5 s.
