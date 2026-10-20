# Soft-red R4 evidence (ProductCard, filter pills, blush tint)

Branch `feat/soft-red-r4-product-card`, plan `2026-10-20-soft-red-r4-product-card-pills-tint.md`. Production standalone build (`server.js`), Playwright, fresh signed-out browser contexts. Charlie chose D1a to D5a on 2026-10-20.

## Tests (written first; each seen failing before the code)

| Task     | Test file                                                                                     | Seen failing because                                                                       |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1 tokens | `tests/design-tokens/tint.test.ts`                                                            | `--tint` missing (4 failed)                                                                |
| 2 pills  | `tests/components/filter-pill.test.tsx`                                                       | component file removed: import failed                                                      |
| 3 card   | `tests/components/cover-image.test.tsx`, `product-card.test.tsx`                              | components missing                                                                         |
| 4 pages  | `tests/storefront/products-page.test.tsx` (new), `store-products-page.test.tsx` (tokens only) | 7 failed on the old markup; the old "border included" and placeholder tests pass unchanged |
| 5 badges | `tests/lib/product-badge.test.ts`, `tests/storefront/products-badge-queries.test.ts`          | helper missing; DB test: 7 of 8 failed before the new columns                              |

Task 5 caught one of my own mistakes: wiring the badge made the page test crash (the mocked rows had no `createdAt`); fixed the fixture and added badge assertions.

## Required DB gate (D2a), run and not skipped

`DATABASE_URL=postgresql://bomy:…@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:…@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web exec vitest run tests/storefront/products-badge-queries.test.ts`: **8 passed, 0 skipped**, through the real `getProducts` under public read. Six seeded products: A active in stock (1, 1), B active zero stock (1, 0), C no variants (0, 0), D one inactive with stock plus one active zero (1, 0), E inactive only (0, 0), F two active with stock 0 and 3 (2, 1). `createdAt` is returned, A's price is unchanged, `total` is 6 (each product once), C and E have no price. The wider `tests/storefront tests/filters tests/lib` set with the same env: 20 files, 213 tests passed.

The extra columns extend the existing aggregate select (no second read, no new join).

Test hygiene (Bob's review, fixed in `eca6c94`): `bomy_app` may not delete `users`, so my first version created a user it could not remove, and a failed `afterAll` rolled back its whole cleanup (3 early runs leaked 18 products, 3 stores and 3 users, which I removed as the owner). The test now creates **no user**: the fixture store is owned by the seeded system user (`00000000-0000-0000-0000-000000000001`, `system@bomy.internal`), and `afterAll` deletes the variants, products and store. The store owner is not used by `getProducts`, so the query still runs under public read. Re-run twice with the env above: **8 passed, 0 skipped each time**, and whole-table counts were identical before, after run 1 and after run 2 (29165 users, 2510 stores, 521 products, 487 variants, 21 categories). Zero rows left.

## Gates

`pnpm typecheck` and `pnpm lint` exit 0; `pnpm build` passes. Web (no DB env): 859 passed, 289 skipped, 2 files fail for `DATABASE_URL` (`magic-link-actions`, `consent/actions`: not evaluated). Admin: 251 passed, 110 skipped (unchanged). `pnpm ui:audit --allow-deferred` exit 0 (92 covered, 0 open, 0 stale; `[overflow-wrap:anywhere]` is not flagged by the scanner so no ledger entry was needed). `pnpm ui:audit:test` 17 of 17. The other DB-gated suites were not run with DB env: not evaluated.

## Browser fixtures (local dev DB, marker `r4fx`, scripts in `.andy/`)

1 user, 1 active store, **23 categories** (22 ordinary plus one 60-character unbroken name), **8 products** (plus 9 extra products `r4fx-more-1…9` in the long category for the follow-up, so 17 in all), **7 variants** (every variant `sku` starts `r4fx-`): normal, no price (no variants), no category, broken image (non-null URL `http://localhost:3000/r4fx-missing.jpg`, a real 404), 80-character unbroken name, sold out (stock 0), new (created now), 50-character Chinese name. Cleanup: before 0/0/0/0/0, after insert 7/8/23/1/1 (17 products with the extras), **after cleanup 0 variants, 0 products, 0 categories, 0 stores, 0 users** (loaded and removed twice: once for the main pass, once for the follow-up). Whole-table counts after the final cleanup equal the counts before my DB test runs.

`bomy-check` (`infra/docker/sync-check.sh`) exits 1 and lists many tables (users, vouchers, ledger, audit…) as changed against the last export. That drift is not attributable to R4 (it includes background-job and earlier-session data); it only says to run `bomy-export` before a machine switch.

## Browser results (1440 / 1024 / 768 / 390 / 320 px)

- `/products?q=r4` (6 tiles), the long-category view, the Chinese-name view, `/brands/r4fx-store`, `/brands/r4fx-store/products`: every tile sits inside the viewport at every width (the products pages never overflowed; the brand-store heading overflow is fixed below); art areas are all 4:5; no tile text overflows its box.
- No-image tile and the real 404-image tile both show the blush area and the Package icon, with the same 4:5 height as the others (fresh page loads). Which failure path ran (the `error` event or the mount check) is not distinguishable here; both are unit tested.
- Badges: "Sold out" on the sold-out tile and "New" on the new tile; nowhere else. No price line on the no-price tile; no eyebrow on the no-category tile; the gap from art to the first text is 16 px on every tile (no extra gap without a category).
- Pill tray: 40 pills (23 fixtures plus 17 real seed categories, including real duplicate "Apparel" names in the seed). Minimum pill height 44 px. The 60-character pill at 320 px: box right 300, text right 278, viewport 320; at 390: 370 / 349; 768: 631 / 615; page scroll width never exceeded by the products page.
- Contrast, alpha-composited, 25 views per theme (5 pages by 5 widths): light **0 nodes below 4.5:1, worst 6.04**; dark (every view confirmed dark) **0 below, worst 5.10**. This includes text on the blush tint, badges and the active and inactive pills.
- Keyboard (real Tab): the "All" pill and the first tile show a 2 px primary ring (the tile ring has a 2 px offset) in light and dark, with no clipping ancestor. Search plus category: `?q=r4&category=<id>` keeps `q` on every pill link; only "R4 Cat 01" is current; "All" drops the category.
- Screenshots: `.playwright-mcp/r4-products-light-1440.png`, `r4-products-light-390.png`, `r4-focus-tile-light.png`, `r4-focus-tile-dark.png`.

### Follow-up fix (Bob): long category name on `/brands/[slug]`

The first pass found horizontal scroll (796 px) at 768, 390 and 320 px: the category section `<h2>` held the 60-character unbroken name. Fixed in `2103ccc`: the heading is `min-w-0 [overflow-wrap:anywhere]`; the header row is `flex flex-wrap … gap-x-4 gap-y-1` (also on the Uncategorized row); the category link's visible text is now "View all" with `aria-label="View all in <category>"` (the shared `Button` is `whitespace-nowrap` by design and was not touched, and nothing pinned the old longer text). Rerun on the production build:

- `/brands/r4fx-store` and `/brands/r4fx-store/products`, light and dark, 1440 / 1024 / 768 / 390 / 320 px: **20 views, page scroll width equals the viewport in every one** (max overshoot 0), every tile inside the viewport, every view confirmed in the right theme.
- Heading text right edge at 320 px: 296 (viewport 320); at 390: 363. The heading wraps to 2 lines at 768 and 3 at 390 and 320.
- The "View all" link (shown after adding 9 products so the category exceeds the 8-item preview): present at all 5 widths, `aria-label` names the category, `href` `/brands/r4fx-store/products?category=r4fx-cat-long`, wraps below the heading at 768 and under and sits beside it at 1024 and over, no horizontal scroll. Screenshot: `.playwright-mcp/r4-brand-longcat-390.png`.

## Deviations from the plan

- The long-pill wrap rule is `[overflow-wrap:anywhere]` on the anchor itself, not an inner span (Bob allowed either). Measured results above.
- The tile keeps today's `hover:shadow-md` (no other motion; lift and scale are R6).
- The empty-image emoji on the brand store page is replaced by the Package icon already used on the brand products page. `store-products-page.test.tsx` already expected an icon with no emoji and passes unchanged.

## Not evaluated

- A real, successfully loading seller photo in the tile (the local seed photos come from `cdn.bomy.com` and do not load; only no-image and 404 images were run in the browser; the loaded-image path is unit tested).
- The image that fails before hydration, separately from the `error` event (unit tested only).
- "Sold out" and "New" on real (non-fixture) data in the browser.
- Brand pages other than the one 390 px screenshot of the long-category view (the rest were measured, not reviewed by eye).
- Safari, Firefox, touch devices.
- `magic-link-actions.test.ts` and `consent/actions.test.ts` (need `DATABASE_URL`) and all other DB-gated suites outside the storefront set.
