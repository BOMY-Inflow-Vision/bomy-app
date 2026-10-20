# Soft-red R5a evidence (brand pages, PageHeading, BrandCard)

Branch `feat/soft-red-r5a-brand-pages`, plan `2026-10-20-soft-red-r5a-brand-pages.md`. Production standalone build (`server.js`), Playwright, fresh signed-out contexts, light theme for layout, light and dark for contrast. Charlie chose D1a to D5a on 2026-10-20. The build was repeated after the last code commit (`889b57c`).

## What changed

| Task | Commit    | Change                                                                                                                                                               |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `66554d2` | New `PageHeading`; `/products` uses it (`mb-6`).                                                                                                                     |
| 2    | `93d908b` | New `BrandCard`; `/brands` gets heading, R4 pill tray (replaces the sidebar), card grid.                                                                             |
| 3    | `44f9130` | `/brands/[slug]`: centered heading, white "Our Story" panel, two columns only when a story exists; otherwise the Subscribe column takes the full row.                |
| 4    | `f4c80f6` | `/brands/[slug]/products`: heading row, bento empty state.                                                                                                           |
| fix  | `889b57c` | Story text uses `break-words` instead of `[overflow-wrap:anywhere]` (see "Table behaviour"). Test changed first and seen failing (1 failed), then the class changed. |
| 6    | this file | README rows for `PageHeading` and `BrandCard`.                                                                                                                       |

Untouched, as planned: `packages/ui`, `apps/admin`, `BodyRenderer`, queries, actions, `/brands/[slug]/subscribe` and `/success` (R5c).

## Gates

- `pnpm typecheck` exit 0. `pnpm lint` exit 0.
- Web (no DB env): **900 passed, 289 skipped**; 2 files fail for `DATABASE_URL` (`tests/auth/consent/actions.test.ts`, `tests/auth/magic-link-actions.test.ts`): **not evaluated**.
- Admin: 251 passed, 110 skipped (unchanged).
- `pnpm ui:audit --allow-deferred` exit 0: 92 covered, 0 deferred-open, 0 open, 0 stale, 0 invalid. No ledger entry was added (`[overflow-wrap:anywhere]` and `break-words` are not flagged). `pnpm ui:audit:test` 17 of 17.
- No DB-gated suite was run with DB env in R5a (no query changed): not evaluated.

## Browser fixtures (local dev DB, marker `r5fx`, scripts in `.andy/`, gitignored)

1 user, 4 stores, 24 products, 22 store categories (21 ordinary + one 60-character unbroken name), 16 store-category assignments, 1 product category.

- `r5fx-long-name`: 80-character name, 160-character excerpt, 13 assigned store categories, story HTML (150-character token, 12-column table, 120-character link, 2000x600 image that 404s), 17 products in one product category plus 3 uncategorised.
- `r5fx-bare`: 0 products, no excerpt, no story. `r5fx-single`: 1 product, 1 category. `r5fx-normal`: 3 products, 2 categories.

Whole-table counts (users / stores / products / store_categories / store_category_assignments / categories):

| Moment          | Counts                              |
| --------------- | ----------------------------------- |
| Before fixtures | 29165 / 2510 / 521 / 0 / 0 / 21     |
| After insert    | 29166 / 2514 / 545 / 22 / 16 / 22   |
| After cleanup   | **29165 / 2510 / 521 / 0 / 0 / 21** |

After cleanup every `r5fx` count (users, stores, products, store categories, assignments, product categories) is **0**. The fixture SQL ran as the table owner, outside `withAdmin`, so R5a wrote **no** `admin_bypass_audit` rows.

`bomy-check` exits 1 and lists many tables as changed against the last export (users, stores, products, vouchers, ledger and others). Most drift is from earlier sessions and background jobs. The R5a fixture tables are back to baseline. Run `bomy-export` before a machine switch.

## Browser results (1440 / 1024 / 768 / 390 / 320 px)

- Every checked view: `scrollWidth <= innerWidth`.
- **Form shift** (intended, from the new heading): search form top, old to new. `/brands` 188 to 200 px at 390 and 192 to 208 px at 1440 (+12 / +16). `/products` 164 to 168 at 390 and 168 to 176 at 1440 (+4 / +8). These match the plan's predicted numbers.
- `/brands`: pill tray has 23 pills (All + 22), min height 44 px, the 60-character pill sits inside the viewport. Long-name card: excerpt clamped to 3 lines, all 13 badges inside the card, name inside the card. Counts read "0 products", "3 products", "1 product", "20 products". Card checks used `/brands?q=r5` because the fixtures are not on page 1 of the real list (2,500+ stores).
- `/brands/r5fx-long-name`: two equal columns at 768 px and wider. The story link, token and image stay inside the story column (image 2000x600 scales to a 0.3 ratio). "View all" links to `/brands/r5fx-long-name/products?category=r5fx-cat-view`.
- `/brands/r5fx-bare`: no "Our Story"; the Subscribe column equals the full content width (992 / 736 / 358 / 288 px at 1440 / 768 / 390 / 320); "No products yet." shows.
- `/brands/r5fx-long-name/products`: heading text inside the viewport at every width; Back link below the title when narrow. `?category=r5fx-cat-view` shows 17 tiles.
- **Contrast** (colours alpha-composited in the page): light, 40 views, 0 below 4.5:1 (worst 5.64; avatar initials worst 12.29). Dark, 40 views, each confirmed `html.dark`, 0 below 4.5:1 (worst 5.10; avatar worst 15.11).
- **Keyboard** (real Tab, light and dark): order is Search, Clear, All, the 22 pills, then the cards. Focus rings are present (2 px primary; the card ring has a 2 px offset) and no ancestor clips them.

## Table behaviour (honest note)

In the first pass the story wrapper used `[overflow-wrap:anywhere]`. At 320 px that let table cells shrink so far that header words broke one letter per line. I replaced it with `break-words` (`889b57c`) and rebuilt. Re-measured at 320 px on the new build: page scroll width 320 (no sideways scroll); the story table is 1,809 px wide and scrolls inside its own `overflow-x-auto` box; header cells are 141 to 153 px wide and one line tall (28 px); the story image and link stay inside the 238 px story column. This re-measure was run **at 320 px only**; the 390 / 768 / 1024 / 1440 table numbers above come from the first build. At 1024 px and wider the table fits without scrolling.

## Not evaluated

Real seller HTML beyond the fixtures; Safari; Firefox; touch devices; the two `DATABASE_URL` web test files; DB-gated suites generally (no query changed).
