# UI changes — branch `ui-polish`

Goal: a calm, trustworthy B2B fintech look for the presale demo (Head of AutoFinance, Head of IT, business users),
consistent from the customer's phone to the Ops back-office. "Beautiful, not flashy."

- **Scope:** `public/styles.css`, `public/index.html`, the markup / display helpers of `public/app.js`, and
  `design-system/vmaf-dealer-portal/MASTER.md`. No change to `server/`, `tests/`, logic, API, router or SSE.
- **Stack:** still vanilla JS + CSS, no new dependency, no build step, no new font.
- **Wording:** every visible label, title, status chip and message is kept (Playwright and `tests/http-views.test.ts`
  rely on them). Only text glyphs used as icons were replaced by SVG icons (✓ ✗ → ← › …).
- **Design system:** `design-system/vmaf-dealer-portal/MASTER.md` records what was taken from the `ui-ux-pro-max`
  skill and what was dropped (its navy / green palette, EB Garamond / Lato, landing-page pattern and GSAP motion).
  The ValueMax brand wins.

## Commits

| Step | Commit | What |
|---|---|---|
| 1 | `ui: design tokens, base components and icon sprite` | `:root` semantic tokens; base type, buttons, inputs, chips, cards, focus ring; SVG sprite + `icon()`; MASTER.md |
| 2 | `ui: shell — compact header, dealer navigation, demo clock bar, toast, sign-in` | Header, sidebar → tab bar below 1024 px, "Demo time" bar, toast top right, role cards |
| 3 | `ui: dealer screens — stepper, 12-column form, sticky actions, success, tracker` | Quick Apply, Review & Submit, Interest Received, My Applications, Application Status |
| 4 | `ui: Ops — list, expired links, two-column application details, timeline` | All Applications, Expired links, Application Details, dialog |
| 5 | `ui: customer phone pages — portal, simulated gateway, result pages` | `/verify/<token>`, `/gateway/<LinkId>` (login, consent, review), done, cancelled, invalid |
| 6 | `ui: Demo Control — grouped cards, danger reset, compact logs` | `/demo` |
| 7 | `docs: UI_CHANGES` + final checks | This file, last accessibility fixes |

## Final tokens (`public/styles.css` → `:root`)

Components use only `var(--…)`: there is no raw hex or `rgb()` outside `:root`.

| Group | Tokens |
|---|---|
| Brand | `--brand-header #7A1C2E` · `--brand-hover #5C1424` · `--accent #A3203A` · `--accent-subtle #FBE8EC` (active nav only) · `--gold #D9A33A` (logo dot, avatar only) |
| Neutral | `--bg #F6F6F7` · `--surface #FFF` · `--surface-2 #FAFAFB` · `--surface-3 #F0F0F2` · `--border #E2E2E6` · `--border-input #D6D6DB` · `--border-strong #C9C9D0` · `--text #1F1F24` · `--text-2 #55555F` · `--text-muted #6B6B76` |
| Status (fg / bg / line / dot) | success `#17714A #E3F4EC #BFE3D1 #1F8A5B` (Fulfilled, Approved) · warning `#8A5A00 #FBF1DE #EED9AE #D9A33A` (Pending, IPA) · danger `#B42318 #FDE7E7 #F5C2C0 #D92D20` (Mismatch, Expired, Declined) · info `#1E4FA8 #E3ECFB #C3D4F5 #2E6BD8` (Credit Review) |
| Gateway (neutral grey) | `--gw-ink #18202B` · `--gw-2 #4A5464` · `--gw-3 #5B6575` · `--gw-line #DDE2EA` · `--gw-bar #3A4352` · `--gw-bg #F4F6F8` |
| Type | Inter (all ValueMax screens) · Manrope (simulated gateway headings only) · `--fs-xs 12 / sm 13 / base 14 / md 16 / lg 18 / xl 22 / 2xl 28` · `.num` = `tabular-nums` |
| Space | `--space-1…8` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 |
| Shape | `--radius-sm 8` (inputs, buttons) · `--radius-lg 12` (cards) · `--radius-full` (chips) · one shadow `--shadow-sm 0 1px 2px rgb(16 24 40 / .06)` · borders 1 px |
| Controls | `--control-h 40` · `--control-h-sm 32` · `--control-h-lg 48` · `--touch 44` |
| Motion | `--dur-fast 150ms` · `--dur 200ms` (hover, focus, state change); live-update flash kept; all transitions off under `prefers-reduced-motion` |
| Focus | `:focus-visible` 2 px outline in `--accent` (white on the burgundy header, `--gw-ink` on the gateway); inputs: border + `--ring` |

Contrast checked for every text/background pair in use: all ≥ 4.5:1. The previous `#8A8A94` text (3.4:1), grey
disabled text (3.0:1), green text `#1F8A5B` (4.3:1) and the white-on-orange review button (3.2:1) are gone.

## Screens — before / after

**Before:** the screenshots at commit `0302d71`. To view one:
`git show 0302d71:docs/claude-code-demo/screens/<file>.png > /tmp/before.png`.

**After:** the same file names in `docs/claude-code-demo/screens/` (`npm run screens`, desktop 1280 px, phone 390 px).

| Screen | Files | Before → after |
|---|---|---|
| Shell (all signed-in pages) | every desktop file | Tall header with "Org — Name" text → compact header: name + organisation, avatar, icon "Switch role". Sidebar with a heavy left bar → inset items with a clear active state; **below 1024 px a tab bar** (before: the menu disappeared below 860 px). "Demo time" bar → calm amber with a clock icon |
| Toast | (transient) | Bottom right, over the form's buttons → top right just below the header / demo bar; icon per kind (ok, info, error) |
| Sign-in | — | Plain cards, all-burgundy title → clean role cards with a chevron, neutral title |
| Quick Apply | `01-main-quick-apply` | Big underline stepper → compact stepper with check marks. 3-column grid with an empty cell → 12-column grid (name 8 / NRIC 4, email 6 / phone 6), holds at 1024 and 768 px. "✓ Valid…" text → icon hints under each field (`aria-describedby`, `aria-invalid`). Pink guarantor box → neutral white card. Cancel / Next → sticky action bar |
| Review & Submit | `02-dealer-submit` | Solid burgundy "DEALER'S ATTESTATION" band → section label; confirmations in bordered rows; amber note → neutral info note; sticky actions |
| Interest Received | `03-dealer-received` | Outside the dealer shell, big pink reference pill, two plain boxes → inside the shell; light success mark; neutral reference badge; one row per person with link status and expiry |
| Customer email | `04-customer-email` | Unchanged: the email HTML is rendered by `server/mail.ts` (out of scope) |
| Link check | `05a`, `05b` | Burgundy titles, "✓" chip → neutral titles, status icon, 48 px button with arrow icon |
| Gateway landing / login | `06a`, `06b` | Wrapping SIMULATED bar → centred, balanced bar (always shown); segmented login control; tidier decorative QR; 52 px persona rows |
| Consent | `07-customer-consent` | "›" rows that looked clickable, buttons at the very end → same items, same order (singpass-reference 3 and 4), names only (D-51), a small tick per row; Cancel / "I agree, share my details" in a sticky bottom bar |
| Review | `08a-customer-review` | Orange title / button and blue tabs (close to the real Myinfo identity) → neutral grey; segmented sections; "Submit Application" in the sticky bar |
| Done | `08b-customer-done` | Kept the message; status icon; no raw colour override |
| Dealer status | `09a`…`09e` | Centred card, bullets with "…" → left-aligned vertical tracker with a connecting line (done / in progress / not started), chips with icons that flash softly when they change live; resend and demo actions in the card footer |
| Ops list | `10-ops-list` | Numbers, dates, chips and "NRIC mismatch" wrapped; "View" as an underlined link; status by colour only → nothing of that wraps; dot + text status; row hover; "View" button; **no horizontal scroll at 1280 px**, own scroll box below; neutral "Expired links (n)" button with a warning icon |
| Ops details | `11a`…`11f` | One long column, amber reference chip, boxed activity lines, glyph checklist → **two columns from 1200 px** (left: details, activity, MyInfo, vehicle; right: Singpass Status per person + Change Status). The right column is sticky **only when it fits the window** (measured in JS after each render and on resize); otherwise it scrolls with the page, so "Apply Status Change" is always reachable (checked at 1280 × 800 with two guarantors). Below 1200 px: one column in the previous order. Activity as a timeline; neutral reference badge; AA conditions as an icon checklist; disabled buttons readable |
| Expired links | `12-ops-expired-links` | Same table style; "Resend link" with icon |
| Demo Control | `13-demo-control` | Stacked plain cards, red-text reset → grouped cards (two columns from 1024 px); "Reset all data" as a danger button; links table like the Ops lists; outbox and gateway log as compact lists in their own scroll box. Headings kept as they were ("Gateway, job and clock" stays one card, split in two rows; "Links" kept), so no wording changed |

## Checks run

- After each step: `npx eslint . --ignore-pattern ".claude/**"`, `npm run typecheck`, `npm test` (76/76), `npm run screens`; `npm run test:e2e` after steps 3, 4, 5, 6 and at the end — all green.
- **`npm run lint` itself fails before and after this branch** with the same 147 errors, all in
  `.claude/skills/*/scripts/*.cjs` (CommonJS skill scripts added in `0302d71`). `eslint.config.js` is outside this
  task's scope; adding `.claude/**` to its ignores would fix it.
- Extra screenshots and an audit script (not committed) at 1280, 1024, 768 and 375 px:
  - no horizontal page scroll on any screen at any width (the Ops tables scroll inside their box below 1280 px);
  - keyboard: tabbing through every page always shows a focus indicator;
  - touch (375 / 768 px, touch emulation): every button and link ≥ 44 px; text buttons ("Show", "QR (presenter only)")
    keep their line height and get a 44 px touch area;
  - `prefers-reduced-motion: reduce` turns transitions off.
- Pro-rules checklist (`references/pro-rules.md`): no emoji / glyph icons, one outline icon family, decorative icons
  `aria-hidden`, colour never the only signal, visible labels, inline errors, semantic tokens only, disabled states
  clear, sticky bars do not hide focus (`scroll-padding-bottom`), safe areas on the phone pages. Dark mode is not part
  of this demo.
