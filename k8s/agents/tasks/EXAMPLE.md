<!-- Mẫu file task cho dispatch.sh. Claude tổng viết một file như thế này cho mỗi task.
     Gọi: bash k8s/agents/dispatch.sh search-btn-yellow k8s/agents/tasks/EXAMPLE.md --title "Make the Search button yellow" -->

## Goal
Make the Search button on the product list page yellow (e.g. Tailwind `bg-yellow-400` with dark text).

## Files you may change
- `frontend/src/comopnents/ProductListPageCom/SearchForm.tsx`
- `frontend/src/comopnents/ProductListPageCom/Button.tsx` (only to add an optional `className` prop, if needed)

## Out of scope
- Other buttons must keep their current style.

## Done when
- The Search button is yellow; no other button changes.
- `pnpm ci:local` prints CI PASSED.
