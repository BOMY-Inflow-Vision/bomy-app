# Soft-red R2: evidence

Branch `feat/soft-red-r2-nav-footer`. Local dev data, seeded seller. Production build run with the standalone recipe (`node --env-file=… server.js`, `AUTH_TRUST_HOST=true`), Chromium through Playwright, viewport 1440x900 unless stated. Temporary test routes under `apps/web/src/app/zz-harness/` were used and are **not** in the diff (deleted before commit).

## A2: Lenis smooth scroll (`lenis` 1.3.27, exact pin)

Version check: 1.3.27 (published 2026-10-15) has `stopInertiaOnNavigate` (`dist/lenis.d.ts`) and ships `dist/lenis.css`, imported in `layout.tsx`.

### Mandatory gate (Bob): all four ran and passed

1. **Numeric scroll gate, three runs** (`mouse.wheel(0, 400)`, page 6000+ px tall, production build). Final 800 px in all three (accepted 720 to 880). Settled within 2 px at 973, 974 and 971 ms (limit 1600). Never decreased, never overshot. Distance at 125 ms: 440, 441, 422 (limit: at least 320, 40%). Information only, demo samples: 469 at 124 ms, 655 at 249, 733 at 373, 771 at 498. Ours: 440, 629, 719, 762. **Finding that changed the code:** the first run with `wheelMultiplier: 2` moved 1600 px (failed the distance gate). Set to 1; all three runs then passed.
2. **Navigation** (real clicks, Lenis on): a header link clicked 120 ms into a glide (at y=423) opens `/brands` at y=0 and stays there; a normal link opens the new page at 0, Back restores y=1600, Forward goes to the new page at 0; a link with `scroll={false}` keeps y=1600. No route-change code exists in the component. (The reduced-motion comparison run was not a valid baseline because its click missed the link at a different scroll height; the expected results are absolute, so it was not needed.)
3. **Nested scrollers** (Lenis on; each row: the page does or does not move as expected):
   - vertical box 0 to 100 px, page unchanged; textarea 0 to 60, page unchanged;
   - open Select list scrolled (0 to 150), page unchanged; open DropdownMenu scrolled (0 to 150), page unchanged;
   - horizontal strip: vertical wheel moved the page 400 px, horizontal wheel scrolled the strip 300 px;
   - real seller product table: vertical wheel moved the page 400 px, table did not scroll; real account tabs strip: same;
   - the real `ProductImageGallery` thumbnail strip (12 images, harness page, because the seeded product has one image): vertical wheel moved the page 400 px; horizontal wheel scrolled the strip 200 px at three pointer positions, with and without Lenis;
   - real seller sidebar strip at 390 px: vertical wheel moved the page 400 px;
   - the open mobile menu panel at 390x420 and 667x375: panel bottom at 408 of 420 and 363 of 375, scrollable (364 vs 322 and 273), wheel over it scrolled the panel (42 and 91) with the page unchanged, last link ("Account") fully visible and a real click opened `/account`.
4. **Reduced motion** (`prefers-reduced-motion: reduce` emulated before load): `html` has no `lenis` class, no Lenis instance, one 400 px wheel notch moved exactly 400 px in the first frame. The nav background changed from alpha 0.7 to 0.95 at once with `transition-property: none` (with the preference off it changed over 300 ms, with `transition-property: background-color, box-shadow`). With the preference off and a reload, the `lenis` class returns.

### Extra checks

- Programmatic scrolls after a wheel hold (`scrollTo`, `scrollTo({behavior:'instant'})`, `documentElement.scrollTop`, `scrollIntoView`, `focus()`), 6 of 6; real keyboard: Tab, two wheel notches, Tab to an off-screen link scrolled it into view and held, 3 of 3.
- Console: the only error seen was a missing `favicon.ico` (404), not related to this work.

### Follow-up for Bob (2026-10-19): findings, fixes and re-runs

Run on the final production build (standalone `server.js`, `lenis` 1.3.27). Two real defects were found and fixed; each fix has a unit test and a browser re-run.

1. **Half-pixel glide that never finishes (fixed).** Reproduced with real keyboard focus, not only a script: on a **2x display** (CDP `deviceScaleFactor: 2`), `Tab` to a link put the page at `4687.5`; one wheel notch (+400) aimed Lenis at `5087.5`, which it approaches from below and never reaches (Lenis ends a glide when the rounded values match, and 5087.5 rounds up while the value stays below). Lenis stayed "smooth" for seconds: `Shift+Tab` to a link above did **not** scroll (the link stayed off screen) and `PageDown` did nothing, 3 of 3 runs. At 1x the same sequence was fine. **Fix:** `instance.on("scroll")` snaps a smooth glide that is within 0.6 px of a half-pixel target to the whole pixel (`scrollTo(round(target), { immediate: true, force: true })`). **Re-run:** 2x, 3 of 3: the link is in view and `PageDown` moves +880 px; 1x unchanged. Impact before the fix: keyboard users on a Retina display who mix Tab and the wheel; the page ignored native scrolling for several seconds.
2. **Page scrolled behind an open Radix Select or menu (fixed).** With Radix's scroll lock on (`body[data-scroll-locked]`), a wheel moved the page 0 to 800 px behind an open Select and an open Seller menu; the baseline (no Lenis) stayed at 0. The locked body ignores the pointer, so the wheel event targets `<html>` and Lenis never asks `prevent` about any element. **Fix:** `virtualScroll: isPageScrollFree`, which Lenis calls for every wheel and touch event and which returns `false` while the lock is set. **Re-run:** Select and menu both hold the page at 0 while open, and the wheel moves it again after Escape (800 px).
3. **Radix Dialog:** the app has no Radix Dialog (`@bomy/ui` ships Select, DropdownMenu, Popover; no dialog package is installed). The modal scroll lock is covered by the Select and DropdownMenu results above, which use the same `react-remove-scroll` lock.

### Keyboard keys (Space, PageDown, End and friends), final build, long page `/privacy`

| Key       | Lenis on              | Baseline (reduced motion) |
| --------- | --------------------- | ------------------------- |
| Space     | 0 to 880              | 0 to 880                  |
| PageDown  | 880 to 1760           | 880 to 1760               |
| ArrowDown | 1760 to 1800          | 1760 to 1800              |
| End       | 1800 to 2001 (bottom) | 1800 to 2001              |
| PageUp    | 2001 to 1121          | 2001 to 1121              |
| Home      | 1121 to 0             | 1121 to 0                 |

A wheel notch after the keys still moves 800 px (Lenis) / 400 px (native).

### Paused checkout panel (`/checkout`, checkout off)

The panel reads "Checkout is paused. We'll let you know when it's back.", no horizontal overflow, Lenis class present. The page is only 909 px tall, so a notch moves it 9 px. Lenis re-measures a page about 300 ms after its height changes; a wheel inside that window is clamped to the old height and the next wheel works (800 px at a 300 ms wait, 9 px at 0 and 100 ms). That is normal Lenis behaviour.

### Final-build re-run of the earlier gates (all pass)

- Wheel gate, three runs: final 800, settled 975 ms, monotonic, no overshoot, at 125 ms 421 to 440.
- Reduced motion: no `lenis` class, a 400 px notch moves 400 px, nav `transition-property: none`.
- Navigation: link clicked 120 ms into a glide (y=441) opens `/brands` at 0; a footer link opens `/terms` at 0, Back restores 1600, Forward goes to `/terms` at 0.
- Nested: real seller product table, account tabs and seller sidebar strip (390 px): a vertical wheel moves the page 400 px. Mobile panel at 390x420: scrolls itself (42 px), page stays 0.

### Not evaluated

- Safari and Firefox; touch devices (touch scroll is left native, `syncTouch: false`); a Retina display.
- First Load JS change: the build reports "First Load JS shared by all: 101 kB" with Lenis; a build without Lenis was not run, so no before/after number. Lenis is 33 kB source, 8.3 kB gzipped by itself.
- Display scale 2 was emulated through the browser's device-metrics override, not a physical Retina display.
- `tests/auth/magic-link-actions.test.ts` and `tests/auth/consent/actions.test.ts` need `DATABASE_URL`: not evaluated.

## Task 5 results (final build, HEAD `b794913`, before the audit-ledger commit `1ba9bec`, Lenis on)

### First Load JS, before and after Lenis

Next's route table is identical with and without Lenis (101 kB shared, `/` 102 kB), because it does not count layout-level chunks. So the real script weight was summed (gzip, per page, from `app-build-manifest.json` plus `build-manifest.json`) for a build with and a build without Lenis (the no-Lenis build had zero Lenis chunks):

| Page        | With Lenis | Without  | Delta |
| ----------- | ---------- | -------- | ----- |
| `/`         | 198.7 kB   | 193.4 kB | +5.3  |
| `/cart`     | 202.1 kB   | 196.8 kB | +5.3  |
| `/products` | 199.7 kB   | 194.4 kB | +5.3  |
| `/privacy`  | 198.9 kB   | 193.5 kB | +5.4  |

### Contrast, 18 views (390 / 767 / 1440 by `/`, `/products`, `/brands`, `/cart`, `/seller/dashboard`, `/account`)

- Light: 0 text nodes below limit, worst 5.64:1, no horizontal scroll.
- Dark (theme set through `localStorage.theme` then reload; every view confirmed `html.dark`): 0 below limit, worst 5.10:1, no horizontal scroll. An earlier dark run was discarded because no view was actually dark.
- Cart hover (`brightness-90` on `bg-primary`, white text): about 6.3:1 by computation from the measured colours (text 4.5 needed). Counter on the pill: same pair, above 3:1.

### Cart counter, seller state

Counts 0, 99 and 100 (shows "99+") at 1440, 1024, 390 and 320 px: the 24x24 counter sits inside the cart, 0 px² overlap with the label, no horizontal scroll. Cart is 120x48 with the label (from `lg`), 84x48 without.

### Interaction (real keys and mouse, production build)

- Desktop Tab order: BOMY, Brands, Products, Membership, Sell with us, Become a provider, Cart, Account, Seller menu, theme toggle. Cart focus shows a 2 px outline plus ring.
- 390 px menu: opens with `aria-expanded=true`; Escape closes from the button and from inside the panel (focus ends on the menu button both times); a click on the scrim at (195, 790) closes it; resizing to 1100 px closes it.
- Side gap: the point (6, 40) at 1440 px hits `BODY`, not the nav shell, so clicks pass through the gutter.

### Footer final geometry

| Width | Card                      | Wordmark box                                                 | Notes                |
| ----- | ------------------------- | ------------------------------------------------------------ | -------------------- |
| 1440  | x=20, 1400 wide, 587 high | x=68, 1304 wide; letters 68 to 1372 (the card's inner edges) | no horizontal scroll |
| 768   | full width less gutters   | x=68, 632 wide                                               | no horizontal scroll |
| 390   | gutters 12 px             | x=36, 318 wide                                               | no horizontal scroll |

Screenshots: `.playwright-mcp/r2-footer2-*.png`.

### Gates

`pnpm typecheck` and `pnpm lint` exit 0. `pnpm build` passed. Web tests: 802 passed, 281 skipped. Admin: 251 passed, 110 skipped. `pnpm ui:audit --allow-deferred` first FAILED (5 open hits, 2 stale entries in `scripts/ui-audit/exceptions.json`, caused by the new nav and footer classes); fixed in commit `1ba9bec`, now exit 0 (92 covered, 0 open, 0 stale). `pnpm ui:audit:test` 17 of 17.

### Not evaluated (added in Task 5)

- 768 to 1023 px: the seller nav does not fit at 768 px (see PR body, decision D6).
- Signed-out and buyer (non-seller) nav in the browser: unit tests only.
- Pixel contrast of the pill at alpha 0.7 over a product photo: not run. The pill sits over the near-white ground and cards in every view tested.
- A real toast under the pill: only the position is pinned by `toaster-position-guard.test.ts`.
- Safari, Firefox, touch devices, a physical Retina display, the two `DATABASE_URL` test files.

## Task 5 follow-up (Charlie chose D6 option 1; checks that were open)

Build from the final code (standalone `server.js`, Lenis on), seeded seller, a fresh signed-out context, and a new local buyer `r2-buyer-check@test.bomy` (signed in through Mailhog; I clicked "I Agree" on the consent page for this throwaway local user).

### D6: hamburger switch moved from 768 px to 1024 px

The desktop row, the mobile cluster, the mobile panel and the scrim now switch at `lg` (1024 px). The menu-close listener watches `(min-width: 1024px)`. Pinned tests updated first and seen failing (4, then 15 helper selectors), then passing.

| State      | 768 to 1023 px                                                                                       | 1024 px                                                                                                                         | 1100 px      | 1440 px      |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| Seller     | hamburger layout, 0 controls outside the pill, no horizontal scroll (checked at 768, 800, 900, 1023) | desktop row; logo to first link 69 px, last link to cluster 69 px, links 36 px high (one line), cluster 9 px from the pill edge | 107 / 107 px | 277 / 277 px |
| Buyer      | hamburger layout (768, 1023), 0 outside                                                              | desktop row, 0 outside                                                                                                          | 0 outside    | 0 outside    |
| Signed out | hamburger layout (768, 1023), 0 outside                                                              | 87 px between links and cluster, links 36 px                                                                                    | 125 px       | 295 px       |

Signed-out mobile at 320 and 390 px: 0 outside, no horizontal scroll. The buyer has no Seller menu (names: Cart, Account, Switch to dark mode).

### Pill over a busy backdrop (contrast of the "Brands" link)

Local seed photos come from `cdn.bomy.com` and do not load here, so the test used a fixed solid backdrop behind the pill (black, mid-grey, white, saturated red `#d00000`) and computed the ratio from the real pill colour and link colour (blur ignored). This is a worst-case sample, not a real photo.

At the old resting alpha 0.7 the light theme failed 4.5:1 over black (3.23) and over red (3.82). The plan rule applied: raise the resting alpha, not below 0.85. `bg-card/70` became `bg-card/85` (test first). At 0.85:

| Backdrop      | Light | Dark |
| ------------- | ----- | ---- |
| black         | 4.81  | 7.96 |
| mid-grey      | 5.75  | 6.41 |
| white         | 6.80  | 4.87 |
| saturated red | 5.15  | 7.17 |

Scrolled (alpha 0.95) was 6.09 or better in every light case at the earlier run. Worst resting value: 4.81:1 (light over pure black). A real photo was not evaluated.

### Real toast

"Store ID copied." from the seller dashboard Copy button: the toast top is 92 px (pill bottom 76) at 390 px and 96 px (pill bottom 80) at 1440 px, that is 16 px below the pill. Right edge 1424 at 1440 (16 px from the viewport edge); at 390 px it spans 16 to 374. Screenshots: `.playwright-mcp/r2-toast-390.png`, `.playwright-mcp/r2-toast-1440.png`.

### Gates after these changes

typecheck, lint and build exit 0. Web 802 passed, 281 skipped; 2 files need `DATABASE_URL`: not evaluated. Admin 251 passed. `ui:audit --allow-deferred` exit 0 (92 covered, 0 open, 0 stale); `ui:audit:test` 17 of 17.

### Still not evaluated

A real product photo behind the pill, Safari, Firefox, touch devices, a physical Retina display, the two `DATABASE_URL` test files.
