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

### Known Lenis edge (not fixed, reported)

When the page starts at an exact half pixel (`scrollIntoView` with centring gave `1922.5`) and the wheel adds a whole number, Lenis aims at `2322.5`, approaches it without reaching it, and stays in its "smooth" state for several seconds; during that time it pulls a native jump back (a second `scrollIntoView` was reverted). From a whole-number start the same sequence settles at once. A real device gives fractional wheel deltas, so an exact `.5` target is unlikely, and normal wheel scrolling, Tab focus scrolling and navigation all passed. Not seen with real input; noted for Bob.

### Not evaluated

- Safari and Firefox; touch devices (touch scroll is left native, `syncTouch: false`); a Retina display.
- First Load JS change: the build reports "First Load JS shared by all: 101 kB" with Lenis; a build without Lenis was not run, so no before/after number. Lenis is 33 kB source, 8.3 kB gzipped by itself.
- `tests/auth/magic-link-actions.test.ts` and `tests/auth/consent/actions.test.ts` need `DATABASE_URL`: not evaluated.
