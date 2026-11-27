# UI source

Visual source of truth for this project. Confirmed at `/onboard`. Features with no UI skip this file.

| Field | Value |
|---|---|
| mode | `codebase` |
| Confirmed | 2026-11-27 by the user at `/onboard`. No Figma Dev Mode MCP was connected |

## figma

Not used (mode is `codebase`).

## codebase

| Role | Path | Notes |
|---|---|---|
| Components | `frontend/src/comopnents/` | Shared components: `Header.tsx` (theme toggle), `Toast.tsx`. Per-screen groups: `ProductListPageCom/`, `ProductDetail/`, `ProductFormCom/` |
| Style maps | `frontend/src/utils/buttonStyles.ts`, `dialogStyles.ts`, `formPageStyles.ts` | `btn.primary/secondary/danger`, dialog and form-page class strings. Reuse them; do not restyle |
| Tokens | `frontend/src/styles/index.css` | `@theme inline` CSS vars become Tailwind utilities (`bg-accent`, `text-muted`, `rounded-card`, `text-h1`, `max-xs` breakpoint at 400px or narrower). Default palette is disabled (`--color-*: initial`). Dark mode uses `[data-theme="dark"]`. Fonts: Instrument Serif, Public Sans |
| Base typography | `frontend/src/app/App.css` | `@layer base` styles for h1, h2, span, p, code |
| App shell | `frontend/src/app/layout.tsx` + `frontend/src/app/providers.tsx` | QueryClient, ToastContext, Header, global Toast |
| Reference screen | `frontend/src/views/ProductList.tsx` | List, search, sort, price filter, pagination, delete dialog, empty and error states |
| Reference screen | `frontend/src/views/ProductDetail.tsx` | Breadcrumb, gallery, badges |
| Reference screen | `frontend/src/views/CreateProduct.tsx` | Form page pattern: `page.*` styles, error banner, leave-guard dialog |
| Reference screen | `frontend/src/views/EditProduct.tsx` | Load, then form, plus delete |
| Reference component | `frontend/src/comopnents/ProductListPageCom/ProductCard.tsx` | Card styling with tokens |

## Rules

- `codebase`: reuse layout, components and tokens from the reference paths. A new visual pattern is a review finding.
- New colors, radii or font sizes are added as tokens in `styles/index.css`, never as arbitrary Tailwind values.
- Every new screen supports both light and dark theme and the `max-xs` breakpoint.
- UI copy is in Vietnamese.
- If a reference file cannot be read, stop and ask. Do not design the screen from memory.
