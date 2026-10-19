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
