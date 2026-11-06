<!-- Mẫu file task cho dispatch.sh. Claude tổng viết một file như thế này cho mỗi task.
     Gọi: bash k8s/agents/dispatch.sh search-btn-yellow k8s/agents/tasks/EXAMPLE.md --title "Make the Search button yellow" --mode code-only
     Mode full (mặc định) cần mục "Behaviors to test": test-planner/test-writer viết test từ đó TRƯỚC khi có code. -->

## Goal
Make the Search button on the product list page yellow (e.g. Tailwind `bg-yellow-400` with dark text).

## Behaviors to test
<!-- Chỉ cho --mode full. Hành vi quan sát được từ bên ngoài: input → output. Mỗi dòng phải fail trên code hiện tại. -->
- Rendering the search form shows a submit button with the `bg-yellow-400` class.
- Other buttons on the page (e.g. pagination) do not get `bg-yellow-400`.

## Files you may change
- `frontend/src/comopnents/ProductListPageCom/SearchForm.tsx`
- `frontend/src/comopnents/ProductListPageCom/Button.tsx` (only to add an optional `className` prop, if needed)
- Tests: `frontend/test/public/` (test-writer only, --mode full)

## Out of scope
- Other buttons must keep their current style.

## Done when
- The Search button is yellow; no other button changes.
- `pnpm ci:local` prints CI PASSED.
