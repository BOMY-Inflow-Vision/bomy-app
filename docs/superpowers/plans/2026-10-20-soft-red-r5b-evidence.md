# Soft-red R5b evidence (product detail page)

Branch `feat/soft-red-r5b-product-detail`, plan `2026-10-20-soft-red-r5b-product-detail.md` (Bob approved; Charlie chose D1a to D5a). Production standalone build (`server.js`), Playwright, signed-out. Final browser pass ran on the build from commit `104d68a`.

## What changed

| Task | Commit               | Change                                                                                                                                                                                                                            |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `e65f8c2`            | Tests only: pin page, picker and gallery behaviour on the old code (they passed on the old code).                                                                                                                                 |
| 2    | `393e3d6`            | `page.tsx`: labelled breadcrumb list that wraps, `PageHeading` title and description (D1a), eyebrow store link, both columns `min-w-0`, details in a white bento panel (D3a), story text `break-words`.                           |
| 3    | `801d1f8`            | `variant-picker.tsx`: pill chips (D2a), at least 44 px, selected filled plus `aria-pressed`, `role="group"`, focus ring, wrapping names, full-width Add to cart below `sm` (D4a).                                                 |
| 4    | `cd427ce`            | `product-image-gallery.tsx`: blush bento tile, Package icon fallback (D5a), thumbnail focus ring and `aria-current`, strip `p-1.5`.                                                                                               |
| fix  | `ed127f0`, `104d68a` | Found in the browser check, beyond the plan: strip `scroll-px-2`, and a thumbnail `onFocus` that calls `scrollIntoView({ block: "nearest", inline: "nearest" })` (see "Keyboard"). Test written first and seen failing each time. |

Untouched: queries, actions, cart, `generateMetadata`, `BodyRenderer`, `PageHeading`, `@bomy/ui`, `apps/admin`. Add to cart sends the same cart item and the same toast text as before (pinned by tests and checked in the browser).

## Gates

- `pnpm typecheck` and `pnpm lint` exit 0.
- Web (no DB env): **935 passed, 289 skipped**; 2 files fail for `DATABASE_URL` (`tests/auth/consent/actions.test.ts`, `tests/auth/magic-link-actions.test.ts`): **not evaluated**.
- Admin: 251 passed, 110 skipped (unchanged).
- `pnpm ui:audit --allow-deferred` exit 0 (92 covered, 0 open, 0 stale, 0 invalid; no ledger entry needed). `pnpm ui:audit:test` 17 of 17.
- No DB-gated suite was run with DB env (no query changed): not evaluated.

## Browser fixtures (local dev DB, marker `r5bfx`, scripts in `.andy/`, gitignored)

1 user, 2 stores (one with an 80-character name), 4 products, 15 variants, 9 images. `r5bfx-long`: 80-character unbroken name, description with a 150-character token, 12 variants (one 60-character unbroken name, one out of stock, one back-order, pre-orders of 14 days and 1 day), 7 images, story HTML (150-character token, 12-column table, 120-character link, 2000x600 image). `r5bfx-plain`: 1 variant, 1 image, no description, no body. `r5bfx-empty`: 0 variants, 0 images. `r5bfx-broken`: 2 variants, 1 image URL that 404s. The database forbids a pre-order without positive lead days (`product_variants_preorder_days_chk`), so the null-days wording is covered by a unit test with props.

Whole-table counts (users / stores / products / product_variants / product_images):

| Moment          | Counts                            |
| --------------- | --------------------------------- |
| Before fixtures | 29165 / 2510 / 521 / 487 / 11     |
| After insert    | 29166 / 2512 / 525 / 502 / 20     |
| After cleanup   | **29165 / 2510 / 521 / 487 / 11** |

After cleanup every `r5bfx` count (users, stores, products, variants, images) is **0**. The fixture SQL ran as the table owner, outside `withAdmin`, so R5b wrote **no** `admin_bypass_audit` rows. `bomy-check` exits 1 (drift from earlier sessions and background jobs); the fixture tables are back to baseline. Run `bomy-export` before a machine switch.

## Before and after on `r5bfx-long` (old code `a4a0bb9` vs final build)

| Width | Page scroll width, old / new | Breadcrumb scrollW/clientW, old / new | h1 font, old / new | Chip min height, old / new |
| ----- | ---------------------------- | ------------------------------------- | ------------------ | -------------------------- |
| 1440  | 2218 / 1440                  | 1572/992 / 992/992                    | 24 / 36 px         | 34 / 44 px                 |
| 1024  | 2010 / 1024                  | 1572/992 / 992/992                    | 24 / 36 px         | 34 / 44 px                 |
| 768   | 1882 / 768                   | 1572/736 / 736/736                    | 24 / 36 px         | 34 / 44 px                 |
| 390   | 1587 / 390                   | 1572/358 / 358/358                    | 24 / 30 px         | 34 / 44 px                 |
| 320   | 1587 / 320                   | 1572/288 / 288/288                    | 24 / 30 px         | 34 / 44 px                 |

So the suspected overflow was real on the old page: the long product name, long variant name and description pushed the page up to 2218 px wide. On the new build the page width equals the viewport at every width, chips end inside the column (right edge 1216, 1008, 752, 374, 304), and the h1 and description sit inside their columns (h1 right edge 1216 at 1440, 304 at 320).

The story panel, image (ratio 0.30) and link stay inside the panel at every width. The 12-column fixture table is 1,979 px wide and **scrolls inside its own box at every width** (box scrollW/clientW: 1979/718 at 1440 and 1024, 1979/686 at 768, 1979/308 at 390, 1979/238 at 320); the page does not scroll. The thumbnail strip (7 images) scrolls inside its own box (508/480 at 1440 and 1024, 508/352 at 768, 508/358 at 390, 508/288 at 320).

Layout numbers above come from the final build; the same layout was also measured on an earlier build (before the two focus-scroll fixes) and was identical. The final layout pass ran in the dark theme (left from the keyboard check); the earlier pass ran in light.

Other products (1440 / 390 / 320): `r5bfx-plain` (1 image, 1 variant, no description, no body) and `r5bfx-empty` (0 variants, 0 images) and `r5bfx-broken` never exceed the viewport. `r5bfx-empty` shows the Package icon on the blush tile (`rgb(42, 34, 29)` in dark), no emoji, "No variants available.", no chooser, no "Product Details". `r5bfx-plain` shows no arrows, no thumbnails, no chooser (one variant), no description paragraph, no "Product Details". `r5bfx-broken` keeps today's behaviour for a failing image URL (blank tile, natural width 0; a failed-image fallback is a follow-up) and shows the chooser for its 2 variants. The tile is square at every width (480, 358, 288 px).

## Contrast (alpha-composited in the page, 4 products x 1440 and 390, light and dark)

Light: 0 text below 4.5:1 (worst 6.49). Dark: each view confirmed `html.dark`; 0 below 4.5:1 (worst 5.10, the Add to cart label). Disabled (out-of-stock) chip text is exempt from WCAG; measured 3.16:1 in light and 5.17:1 in dark. Focus ring colour against the page ground (computed from the ring colours read in the browser): light `rgb(155, 59, 59)` on `rgb(252, 249, 247)` is 6.50:1; dark `rgb(226, 99, 90)` on `rgb(23, 18, 13)` is 5.46:1 (both above 3:1).

## Keyboard (real Tab presses, light and dark, 1440 / 390 / 320 px)

On `r5bfx-long`, Tab reaches in order: 2 gallery arrows, 7 thumbnails, 11 variant chips (the 12th, the out-of-stock one, is disabled and skipped), Add to cart. Final build, every control: `:focus-visible` matches and a ring is present, no ring is clipped by an `overflow` ancestor, and every ring box is inside the viewport (all six theme and width combinations, `htmlDark` confirmed).

- Chips and thumbnails use the new `ring-2 ring-ring ring-offset-2` ring (box-shadow). The arrows and Add to cart use the shared `Button`'s own 2 px solid outline (plus a 1 px shadow); they were not changed.
- Two real problems found by this check and fixed (not in the plan): (1) Chrome does **not** scroll a part-hidden thumbnail into view on Tab (before the fix: image 7 was 22 px out of the strip at 1440 and 1024 and image 5 was 6 px out at 768), and (2) a thumbnail sitting exactly at the strip's edge had its 4 px ring clipped (image 5 at 390 px had 0 px of room). Fix: `scroll-px-2` on the strip plus a thumbnail `onFocus` calling `scrollIntoView`. After the fix none of the six combinations reported a clipped or out-of-view ring.
- Not changed and not measured for outline: the store-name links in the breadcrumb and the eyebrow have no custom ring (box-shadow none); the BOMY logo link shows the browser default `auto` outline. This is the same as before R5b and is outside the plan.

## Add to cart end to end (signed out, light)

Cart count was empty, then after the click: button text "Added to cart", cart count 1, toast "R5B Plain Product added to cart"; 2.2 s later the button reads "Add to cart" again. The browser console showed one error, the expected 404 of the broken-image fixture. Screenshots: `.playwright-mcp/r5b-long-light-1440.png`, `r5b-long-light-390.png`, `r5b-plain-light-1440-added.png`.

## Recorded separately (not changed in R5b)

- **Copy fix, separate PR:** a pre-order with 1 lead day reads "ships in 1 days" (`variant-picker.tsx`). Charlie asked to keep it pinned for this layout slice; a test pins the current wording.
- A failed-image fallback in the gallery, and a "more from this brand" row (needs a query), are follow-ups.

## Not evaluated

Real seller HTML beyond the fixtures; story tables other than the 12-column fixture; Safari; Firefox; touch zoom and swipe; screen-reader output; the two `DATABASE_URL` web test files; DB-gated suites generally (no query changed); the outline of the store-name links.
