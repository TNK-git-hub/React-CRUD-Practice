# Design System Master File — VMAF Dealer Portal (Singpass Myinfo demo)

> **LOGIC:** When building a specific page, first check `design-system/vmaf-dealer-portal/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.

**Source:** generated 2026-11-19 by the `ui-ux-pro-max` skill —
`search.py "fintech loan application B2B portal trustworthy minimal" --design-system --variance 3 --motion 2 --density 6 --persist -p "VMAF Dealer Portal"` —
then edited by hand: **the ValueMax brand wins over every palette the skill suggests.** The tokens live in
`public/styles.css` (`:root`); components use only `var(--…)`, never raw hex.

Audience: Head of AutoFinance, Head of IT and business users at a Singapore finance company. The UI must read as a
real, trustworthy B2B fintech product: calm, tidy, no decoration.

---

## What was taken from the skill, and what was dropped

| Skill output | Decision | Why |
|---|---|---|
| Style **Minimalism & Swiss** (clean, grid-based, high contrast, sans-serif, essential) | **Taken** | Fits enterprise tools and dashboards |
| Spacing scale for density 6 (4 · 8 · 16 · 24 · 32 · 48 · 64) | **Taken**, plus 12 | 4/8 rhythm; 12 is needed for compact controls |
| Effects: subtle hover 150–300 ms, sharp shadows if any, clear type hierarchy | **Taken** | Matches "beautiful, not flashy" |
| Pre-delivery checklist (no emoji icons, cursor-pointer, contrast 4.5:1, visible focus, reduced motion, 375/768/1024/1440, no horizontal scroll) | **Taken** | — |
| UX rules found with `--domain ux`: compact label overflow (chips never wrap), inline validation next to the field, table overflow in its own scroll box, focus never hidden by sticky UI, visible focus ring, step indicator for multi-step forms, contextual live status | **Taken** | — |
| Status icon family (`--domain icons`: check-circle, warning, warning-circle, outline style) | **Taken as a style only** | Icons are drawn by hand in an inline SVG sprite; no icon library is added |
| Palette navy `#1E3A5F` / blue `#2563EB` / green CTA `#16A34A` | **Dropped** | Brand colours win (burgundy, accent, gold) |
| Fonts EB Garamond + Lato | **Dropped** | No new fonts: Inter (already loaded) for all ValueMax screens; Manrope (already loaded) only for the headings of the simulated gateway |
| Page pattern "Marketplace / Directory" (hero search, featured carousel) | **Dropped** | Landing-page pattern; this is an application portal |
| Motion "Scroll reveal" (GSAP + ScrollTrigger) | **Dropped** | No library, no decorative animation |
| Shadow scale `md` / `lg` / `xl` | **Dropped** | One very light shadow only |
| Domain searches `"timeline activity log"` and `"vertical timeline history"` | **No database match** | Activity timeline follows general convention (dot + line), not skill data |

---

## Tokens (final values are in `public/styles.css`)

### Colour

| Token | Value | Use |
|---|---|---|
| `--brand-header` | `#7A1C2E` | Header bar, phone header |
| `--brand-hover` | `#5C1424` | Hover of primary, avatar text |
| `--accent` | `#A3203A` | Primary button, active state, links, focus ring (7.4:1 on white) |
| `--accent-subtle` | `#FBE8EC` | Active nav item background only |
| `--gold` | `#D9A33A` | Accents only: logo dot, avatar |
| `--bg` | `#F6F6F7` | Page background |
| `--surface` / `--surface-2` / `--surface-3` | `#FFFFFF` / `#FAFAFB` / `#F0F0F2` | Cards / table header, quiet fills / hover + disabled fill |
| `--border` / `--border-input` / `--border-strong` | `#E2E2E6` / `#D6D6DB` / `#C9C9D0` | 1 px lines / inputs / hover |
| `--text` / `--text-2` / `--text-muted` | `#1F1F24` / `#55555F` / `#6B6B76` | Body / secondary / muted (≥ 4.6:1 on `--surface-3`; `#8A8A94` is no longer used for text: 3.4:1) |
| success `fg / bg / line / dot` | `#17714A / #E3F4EC / #BFE3D1 / #1F8A5B` | Fulfilled, Approved, NRIC matched |
| warning `fg / bg / line / dot` | `#8A5A00 / #FBF1DE / #EED9AE / #D9A33A` | Pending, IPA, queued, demo clock |
| danger `fg / bg / line / dot` | `#B42318 / #FDE7E7 / #F5C2C0 / #D92D20` | NRIC mismatch, Expired, Declined, destructive buttons |
| info `fg / bg / line / dot` | `#1E4FA8 / #E3ECFB / #C3D4F5 / #2E6BD8` | Credit Review |
| `--gw-*` | ink `#18202B`, 2 `#4A5464`, 3 `#5B6575`, line `#DDE2EA`, bar `#3A4352`, bg `#F4F6F8` | Simulated gateway only (neutral grey, **no Singpass / Myinfo identity**) |

Status colours carry meaning only. A status is never shown by colour alone: always a dot or icon **plus** text.

### Typography

- Inter for body and all ValueMax headings; Manrope only for gateway headings. Max two families.
- Scale: `--fs-xs 12` · `--fs-sm 13` · `--fs-base 14` (desktop body, tables) · `--fs-md 16` (inputs, customer body) · `--fs-lg 18` (section title) · `--fs-xl 22` · `--fs-2xl 28` (page title).
- Hierarchy: page title (bold, `--text`) > section title (600, `--text`, not burgundy) > label (13/600, `--text-2`).
- `font-variant-numeric: tabular-nums` (`.num`) for application numbers, NRIC, dates and money.

### Space, shape, motion

- Space `--space-1…8` = 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: `--radius-sm 8` (inputs, buttons), `--radius-lg 12` (cards), `--radius-full` (chips).
- Shadow: `--shadow-sm: 0 1px 2px rgb(16 24 40 / .06)` — the only level. Border 1 px `--border`.
- Motion: `--dur-fast 150ms`, `--dur 200ms` for hover / focus / state change only; the live-update flash (background
  fade, no movement) stays. `prefers-reduced-motion: reduce` turns transitions off.
- Focus: `:focus-visible` outline 2 px `--accent`, offset 2 px (white on the burgundy header, `--gw-ink` on the gateway).
- Breakpoints: 640 · 768 · 1024 · 1200.

---

## Anti-patterns (do not use)

- Gradients, glassmorphism, neumorphism, heavy shadows, decorative animation, emoji or text glyphs (✓ ✗ → ←) as icons.
- Large tinted blocks (e.g. pink guarantor box, solid burgundy band): use a white card with a thin border and a label.
- Every heading big and burgundy; raw hex in components; placeholder used as label.
- Status chips, application numbers, dates or masked NRICs wrapping onto two lines.
- Any Singpass / Myinfo logo, red, orange or other real identity on the simulated gateway; the
  "SIMULATED GATEWAY · DEMO ONLY · NOT REAL SINGPASS" bar is always shown there.

## Pre-delivery checklist

- [ ] `npm run lint && npm run typecheck && npm test` and `npm run test:e2e` green
- [ ] No emoji / glyph icons; one outline icon family; decorative icons `aria-hidden`, icon-only buttons have `aria-label`
- [ ] Text contrast ≥ 4.5:1; colour is never the only indicator
- [ ] Focus visible everywhere; sticky bars never hide the focused control
- [ ] Touch targets ≥ 44 px on customer pages and on touch screens (tablet)
- [ ] Visible labels; inline errors under the field with an icon
- [ ] 1280 / 1024 / 768 px (dealer, Ops) and 375 px (customer): no bad wrapping, no overlap, no horizontal scroll except the Ops table box
- [ ] `prefers-reduced-motion` respected
