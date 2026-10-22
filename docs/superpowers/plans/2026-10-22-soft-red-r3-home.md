# Soft-red R3: Home page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Coming soon" placeholder at `/` with BOMY's home page, built in the section order measured from the Kvist demo, using BOMY's own words (in one `home-copy.ts` Charlie approves), BOMY's own visuals and only real data.

**Architecture:** One server-rendered page that reads existing public data with `withPublicRead` (no `withAdmin`, so no audit rows), composed of small server components under `apps/web/src/app/_home/`. Layout and tokens only; motion is R6, so every animated Kvist element (marquee scroll, rotating badge, word reveal, counters, travelling badge) is built in its final, static state. Reuse `ProductCard`, `BrandCard`, `FilterPill(s)`, `CoverImage`, `PageHeading`'s type scale idea and the R1 to R4 tokens (`bg-tint`, `rounded-bento`, `tracking-eyebrow`, `bg-card`).

**Tech Stack:** Next 15.5, React 19, Tailwind 3.4, Vitest 2.1.9 (jsdom per file), Playwright MCP.

**Spec:** `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R3 and the 2026-10-17 amendment) and `docs/superpowers/plans/2026-10-17-kvist-parity-spec.md` (section order and measured sizes). Charlie, 2026-10-21 and 2026-10-22: follow the Kvist structure first, with BOMY's own content and visuals; copy lives in `home-copy.ts` for Charlie to approve before the PR merges; placeholder copy may support development but must not ship.

**Revision 2026-10-22 (Bob's review):** decisions D1a to D5a chosen by Charlie. Six plan changes made: original wording for the browse heading (the earlier draft matched the reference's copy); the copy gate is defined as R3-owned copy only; one visibility table drives every section test and the page test; the empty page is proved with mocked data and an isolated database, not by deleting fixtures; the featured product has its own query (not the first 20 of `getProducts`) and tolerates a missing price; R3's audit effect is attributed by reason and time window.

## What the home page is today (read 2026-10-22)

- `apps/web/src/app/page.tsx` is 8 lines: a centred `h1` "BOMY" and "A curated brand collective. Coming soon." No test pins it. There is no `home-copy.ts`.
- Public data that already exists (all behind `withPublicRead`): `getProducts` (newest first, joined to store and category, min price, variant counts) and `getCategories` in `app/products/queries.ts`; `getBrands` (name, slug, excerpt, product count) and `getStoreCategories` in `app/brands/queries.ts`; `productBadge` for the real "New" and "Sold out" badges.
- What does **not** exist: product ratings, reviews, a newsletter table or sender, category or store images, store logos. The membership price is read with `withAdmin` (writes an audit row per read), so the home page does not show it.
- `platform_config.checkout_enabled` is `false`, so a visitor cannot buy yet. The home copy and CTAs must not promise ordering, delivery times or free shipping.

## Global Constraints

- **No copied Kvist text, images, logo or code.** Section order and measured proportions only. Every word comes from `home-copy.ts`; every visual is BOMY-drawn (inline SVG or CSS shapes) or a real product cover from the database.
- **Real data only.** No invented ratings, review counts, testimonials, "happy customers" numbers or delivery estimates. A number on the page is a count computed from the database at request time, or it is not on the page.
- **Copy gate (hard), scoped to R3-owned copy.** _R3-owned copy_ is every string authored for the home page: headings, subheadings, button and link labels, tile titles, marquee words, the stats and sellers labels, count wording (a `countProducts(n)` function that only builds the unit word), aria text written for home elements, and the page `<title>` and description. All of it is a key in `HOME_COPY`. **Not in `home-copy.ts`, and not subject to the gate:** real data (product, brand and category names, excerpts, prices, counts and numbers), the "New" and "Sold out" words from `productBadge`, and any text rendered by a reused component (`ProductCard`, `BrandCard`, `FilterPill`, `CoverImage`). `home-copy.ts` imports nothing; it holds plain strings and small string-builder functions only.
- **Original wording.** No heading, button or label may match the reference demo's text. A denylist in the copy test (the reference phrases we noted: "Find your corner", "This week's favourites", "Buy once, keep for good", "Bag", and the reference's button and stats captions) fails on any match. This plan's first draft used one of them ("Find your corner"); it is replaced.
- **The gate flag.** `HOME_COPY_STATUS` is `"draft"` until Charlie approves; the PR is opened as a draft titled "DO NOT MERGE until copy approved" and the merge-gate test (Task 1) fails while the status is `"draft"`. Charlie's final copy commit omits the Claude Co-Authored-By trailer (his content-finalisation convention).
- **Where the gate applies, in one sentence:** all words that the home page itself writes are Charlie's to approve; words that come from data or from a shared component are real data or reviewed in their own PRs.
- **Only `withPublicRead` reads.** No `withAdmin`, no new table, no migration, no change to existing queries (`app/products/queries.ts`, `app/brands/queries.ts` are reused as they are).
- **No motion in R3** (R6 owns it). No `animate-*`, no scroll listener, no `IntersectionObserver`. Static finals: marquee band is a fixed row, the "rotating" badge is still, the word-reveal statement shows all words in the dark colour, stats show their final numbers.
- **Forbidden paths (diff against `main` must be empty):** `apps/web/src/lib/**`, `apps/web/src/auth.ts`, `auth.config.ts`, `middleware.ts`, `apps/web/src/app/checkout/**`, `apps/web/src/app/products/**`, `apps/web/src/app/brands/**` (read-only reuse), `apps/web/src/components/nav-bar.tsx`, `footer.tsx`, `packages/**`, `apps/admin/**`, `apps/api/**`.
- Palette and type as shipped (R1): soft red, near-white ground, white `bg-card` cards, blush `--tint` tiles. Hero display sizes come from two new Tailwind font-size tokens (`text-display`, `text-display-sm`, one line each in `tailwind.config.ts`, with a test beside `tests/design-tokens`), not arbitrary values.
- Every colour pair on every new tile is tested alpha-composited, text at least 4.5:1, light and dark.
- Prettier, `--max-warnings 0` lint, `pnpm ui:audit --allow-deferred` exit 0 (ledger any new arbitrary value, one entry per match), `ui:audit:test` 17/17.
- Commits use explicit paths and the Claude Co-Authored-By trailer (except Charlie's copy commit); check `git log` after each commit; floating `act()` promises are rejected by lint (wrap in a block body). `products/loading.tsx` (untracked) is moved aside for builds and restored. Standalone run: `AUTH_TRUST_HOST=true PORT=3000 HOSTNAME=localhost node --env-file=/Users/charlie/Documents/Projects/BOMY/app/apps/web/.env.local server.js` from `apps/web/.next/standalone/apps/web`. `.env.local` holds real HitPay values: the home page does not use them, but start the server with `HITPAY_API_KEY= HITPAY_API_URL=` on the command line anyway.
- **DB-gated suites are a hard gate:** the new home queries test (DB-backed, `describe.skipIf(!shouldRun)`) and the existing `tests/storefront` DB suites run with `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL=redis://:changeme_local@localhost:6379` after `node scripts/check-integration-env.mjs` exits 0; a suite that cannot run, fails, or is fully skipped stops the PR gate. Tests must not create users (the app role cannot delete them); fixtures are inserted by owner SQL and removed with zero-count proof.
- Repo visibility flow (BOMY/CLAUDE.md): public before the push, public through CI, merge and the production build, private after Charlie says the build is done.

## Sections, in order (from the parity spec), and what each is made of

| #   | Section                               | BOMY content and data                                                                                                                                                                                                                                          | Static final state in R3                                          |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Hero bento (4 tiles)                  | Headline card (eyebrow, h1, sub, two buttons); tall featured-product card (the newest active product that has a cover image, chosen by its own query; real name, store, link, and the price only when a variant price exists); pastel link tile; delivery tile | "rotating" circular-text badge and the travelling badge are still |
| 2   | Marquee band                          | Words from `HOME_COPY.marquee` plus real category names                                                                                                                                                                                                        | Fixed row, clipped, `aria-hidden`                                 |
| 3   | Browse bento                          | One large card and up to four tiles, one per real category (name, count of active products, arrow link to `/products?category=<id>`)                                                                                                                           | Arrow buttons round, no hover motion beyond today's tokens        |
| 4   | Favourites                            | Pills (All + real categories) as plain links to `/products?category=…`; the 8 newest products (first 8 of `getProducts` page 1) as `ProductCard` with `productBadge`                                                                                           | —                                                                 |
| 5   | Promise cards ("keep for good" shape) | Left: a statement card (copy only, all words dark). Right: a BOMY-drawn illustration card with a glass chip that links to `/membership` (no price)                                                                                                             | Word reveal is final (no fade)                                    |
| 6   | Stats row                             | Up to four tiles, each a real count: active brands, active products, active categories (and a fourth only if it is a real count, otherwise three tiles)                                                                                                        | Final numbers, no count-up                                        |
| 7   | "Testimonials" slot                   | **Replaced** by "From our sellers": up to three `BrandCard`s (real brand name, excerpt, product count). No testimonials exist, so none are shown                                                                                                               | —                                                                 |
| 8   | "Newsletter" slot                     | **Replaced** by a dark CTA card with two real links: "Sell with us" (`/seller/apply`) and "Become a member" (`/membership`). No newsletter exists, so no email box                                                                                             | —                                                                 |
| 9   | Footer                                | Existing R2 footer, unchanged                                                                                                                                                                                                                                  | —                                                                 |

### Visibility rules (one table; every section test and the full-page test read it)

The table lives in `apps/web/tests/home/visibility.ts` as data (`VISIBILITY_CASES`: a name, the `getHomeData()` input, and the list of elements that must be present and absent). The section tests and `home-page.test.tsx` both iterate it, so the rules cannot drift apart.

| Element                             | Shown when                                                                                                         | Otherwise                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Hero headline card                  | always                                                                                                             | —                                            |
| Hero featured card                  | `featured` is not null (newest active product with a cover image, own query)                                       | omitted; the headline card spans the row     |
| Price line inside the featured card | `featured.minPriceSen` is not null (an active variant has a price)                                                 | the card shows name and store, no price      |
| Hero themed link tile               | `counts.products > 0`                                                                                              | omitted                                      |
| Hero delivery tile                  | always (static Pos Laju fact and the per-seller fee sentence)                                                      | —                                            |
| Marquee band                        | always (copy words; category names are appended when there are any)                                                | —                                            |
| Browse bento                        | at least one category has `activeProductCount >= 1`; tiles are those categories, most products first, at most five | whole section omitted                        |
| Favourites pills                    | at least one category has `activeProductCount >= 1` (the "All" pill plus those categories)                         | no pill tray                                 |
| Favourites grid                     | `favourites.length >= 1` (at most 8)                                                                               | whole section omitted (the pills go with it) |
| Promise cards                       | always (copy and a BOMY-drawn illustration; the chip links to `/membership`)                                       | —                                            |
| Stats tile                          | its own count is greater than 0                                                                                    | that tile omitted                            |
| Stats row                           | at least one tile                                                                                                  | whole row omitted                            |
| Sellers row                         | at least one brand with `productCount >= 1` (own query: top three by active products)                              | whole row omitted                            |
| CTA card                            | always (two real links, no form)                                                                                   | —                                            |

**The empty page** (no products, no brands, no categories) therefore shows: hero headline card, hero delivery tile, marquee, promise cards, CTA card and the footer. Nothing else: no empty frames, no "0" tile, no pill tray.

## Draft copy (all of it lives in `HOME_COPY`; DRAFT until Charlie approves)

Words not in this table are not R3-owned (see the Copy gate constraint). Only facts we can stand behind: BOMY is a curated collective of independent sellers; each store sets its own flat shipping fee (`stores.flat_shipping_fee_sen`); shipping is by Pos Laju (locked decision); sellers apply at `/seller/apply`; membership exists at `/membership`. No delivery times, no "free shipping", no promise to order while checkout is paused.

| Key                       | Draft text                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `meta.title`              | "BOMY — a curated brand collective"                                                      |
| `meta.description`        | "Discover independent brands in one place."                                              |
| `hero.eyebrow`            | "A curated brand collective"                                                             |
| `hero.title`              | "Good things from brands worth knowing."                                                 |
| `hero.sub`                | "BOMY brings independent sellers together, so you can see who made what you buy."        |
| `hero.primary`            | "Browse products" (to `/products`)                                                       |
| `hero.secondary`          | "Meet the brands" (to `/brands`)                                                         |
| `hero.themed.title`       | "New from our sellers" (to `/products`)                                                  |
| `hero.delivery.title`     | "Shipping by Pos Laju"                                                                   |
| `hero.delivery.sub`       | "Each seller sets their own shipping fee."                                               |
| `hero.themed.sub`         | "See what just arrived."                                                                 |
| `marquee`                 | ["Curated", "Independent", "Brand by brand"]                                             |
| `browse.title`            | "Start with what you like"                                                               |
| `browse.all`              | "See every product"                                                                      |
| `browse.count(n)`         | "1 product" / "n products" (builds only the unit word)                                   |
| `favourites.title`        | "Fresh from our sellers"                                                                 |
| `favourites.all`          | "All"                                                                                    |
| `promise.statement`       | "We pick sellers one at a time, so what you find here has a name and a story behind it." |
| `promise.chip`            | "Membership" (to `/membership`)                                                          |
| `stats.labels`            | "Brands", "Products", "Categories"                                                       |
| `sellers.title`           | "From our sellers"                                                                       |
| `cta.title`               | "Sell with us, or join as a member."                                                     |
| `cta.sell` / `cta.member` | "Sell with us" / "Become a member"                                                       |

The statement "We pick sellers one at a time" rests on the locked brand-vetting decision (5 criteria, Q&A 2026-04-23); Charlie confirms or rewrites it.

## Review Focus

1. **Empty data:** zero products, zero brands, zero categories. Expect exactly the empty page defined by the visibility table (headline card, delivery tile, marquee, promise cards, CTA card, footer); no empty frames, no "0" tiles, no console error. Proved by mocked data and, where it can be provisioned, an isolated database (Task 2 and Task 8), never by deleting fixtures from the populated local database.
2. **One of everything:** one product, one brand, one category. Expect: favourites shows one card without a stretched row; browse shows one tile; stats show three real counts.
3. **Long and odd data:** an 80-character unbroken product name, store name and category name; a product with no cover image; a failing cover URL; a category with no active products; 20+ categories. Expect: nothing overflows at 320 px; the pill tray scrolls inside its box or wraps; browse shows at most five categories; no layout shift on image error.
4. **Copy-length stress:** render with a headline, sub and card titles three times longer than the draft. Expect: no overflow or clipping at 320 px, the hero card grows, buttons wrap.
5. **Pastel tile contrast and dark mode:** every text colour on every tint tile, light and dark, composited. Expect: at least 4.5:1; decorative SVG shapes carry `aria-hidden`.
6. **Keyboard and focus order:** Tab goes hero buttons, featured card, browse tiles, pills, product cards, brand cards, CTA buttons, with a visible 2 px ring that is not clipped by the rounded tiles.
7. **Build safety:** the page reads the database, so it must not be prerendered at build time (Vercel builds without database access). Expect: `export const dynamic = "force-dynamic"` and a successful `pnpm build` with no database environment.
8. **Featured product edge cases:** more than 20 newer products without a cover and one older product with a cover (the featured card must still find it); a featured product whose variants are all inactive (no price: the card shows no price line and no "RM0"); a featured product with a failing cover URL (Package fallback, no layout shift).
9. **Honesty gates:** a test scans `HOME_COPY` for rating, review, "customers", "free shipping", "delivery in" and star glyphs and fails on a match.

## Decisions for Charlie (recommended option first; answer like "D1a, D2a…")

- **D1 — Favourites pills.** (a) Plain links to `/products?category=<id>` (server-rendered, no client code, same pills as `/products`). (b) Client-side tabs that swap the 8 cards in place. **Pick a:** no client JS, works with JS off, keeps the home page cheap; cost: choosing a pill leaves the home page.
- **D2 — Sections with no real data.** (a) Replace "Testimonials" with "From our sellers" (real `BrandCard`s) and "Newsletter" with a "Sell with us / Become a member" CTA card. (b) Leave both slots out. **Pick a:** keeps the Kvist rhythm with real content; (b) is simpler but leaves the page shorter.
- **D3 — Motion.** (a) Static finals now; R6 adds marquee scroll, rotating badge, word reveal and counters after Kvist's timings are measured. (b) Add motion in R3. **Pick a:** the parity spec says those timings are not yet measured, and R6 is the slice with reduced-motion gates.
- **D4 — Hero art.** (a) BOMY-drawn SVG shapes on blush tiles, plus the newest real product cover in the tall card. (b) Shapes only, no product cover. **Pick a:** the product photo is real and changes with the catalogue; (b) avoids a photo on the home page entirely.
- **D5 — Stats.** (a) Three real counts (brands, products, categories) from the database. (b) No stats row. **Pick a:** real numbers only, so no fake claim; (b) if you would rather not show small numbers while the catalogue is young.

Not offered as decisions (technical): `force-dynamic` rendering (Review Focus 7), one PR (the sections share one page and one copy file), two new font-size tokens.

## File Structure

| File                                                                                          | Responsibility                                                                                                 | Task   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| `apps/web/src/app/_home/home-copy.ts` (new)                                                   | every visible word, typed, `HOME_COPY_STATUS`                                                                  | 1      |
| `apps/web/tests/home/home-copy.test.ts` (new)                                                 | structure, honesty scan, merge gate                                                                            | 1      |
| `apps/web/src/app/_home/home-queries.ts` (new)                                                | `getHomeData()`: featured product, 8 newest, categories with counts, 3 brands, 3 counts; `withPublicRead` only | 2      |
| `apps/web/tests/home/home-queries.test.ts` (new, DB-gated)                                    | real rows via owner-SQL fixtures, empty database                                                               | 2      |
| `apps/web/tailwind.config.ts`, `apps/web/tests/design-tokens/display-type.test.ts` (new)      | `text-display`, `text-display-sm`                                                                              | 3      |
| `apps/web/src/app/_home/{hero,marquee,browse,favourites,promise,stats,sellers,cta}.tsx` (new) | one server component per section                                                                               | 3 to 7 |
| `apps/web/tests/home/*.test.tsx` (new)                                                        | section structure, empty and long-data states, copy stress                                                     | 3 to 7 |
| `apps/web/src/app/page.tsx`                                                                   | composition, metadata, `force-dynamic`                                                                         | 8      |
| `.andy/r3fx-*.sql` (gitignored)                                                               | home fixtures                                                                                                  | 9      |
| evidence, PR body                                                                             | docs                                                                                                           | 9      |

## Tasks

### Task 1: `home-copy.ts`, the visibility table and the copy tests

- [ ] **Step 1: Failing tests** (`tests/home/home-copy.test.ts`): `HOME_COPY` has every key in the draft table and no empty string; `home-copy.ts` has no `import` line (a file-content scan); `HOME_COPY_STATUS` is exported; **honesty scan** fails on `/rating|review|customers|free shipping|delivery in|★|⭐/i`; **originality denylist** fails on any of the reference phrases ("Find your corner", "This week's favourites", "Buy once, keep for good", "Bag", and the reference's button and stats captions) in any `HOME_COPY` string; the Pos Laju sentence appears once, only under `hero.delivery`; `browse.count(1)` is "1 product" and `browse.count(5)` is "5 products"; **merge gate:** `HOME_COPY_STATUS === "approved"` (fails while `"draft"`, so a draft PR is visibly red on this one test).
- [ ] **Step 2: Sentinel-copy helper** (`tests/home/sentinel-copy.ts`): a function that returns a copy object with every string replaced by `«key»` and every builder function by `«key(n)»`, used with `vi.mock("@/app/_home/home-copy")` in every section test. A helper `visibleTextOutside(container, allowed)` returns the visible text that is neither a sentinel nor an allowed real-data string nor an allowed reused-component word ("New", "Sold out", `ProductCard` and `BrandCard` text). Every section test and the page test assert it returns nothing, so a hard-coded R3-owned word cannot hide outside `home-copy.ts`.
- [ ] **Step 3: Visibility data** (`tests/home/visibility.ts`): `VISIBILITY_CASES` as data, one case per row of the visibility table plus the empty page, one featured product with no price, and one case with 25 products. Section tests and the page test import it.
- [ ] **Step 4-5:** implement `home-copy.ts` with the draft text and `HOME_COPY_STATUS = "draft"`; run (only the gate test fails); commit tests, helper, data and file.

### Task 2: `getHomeData()` (public reads only)

`getHomeData()` returns `{ featured, favourites, categories, brands, counts }`:

- `featured`: its **own query**, not the first 20 rows of `getProducts` (which has `PAGE_SIZE = 20` and would miss an older product with a cover when 20 newer ones have none). Newest active product, on an active store, whose `cover_image_url` is not null and not empty; `minPriceSen` from a left join on active variants (`min(price)`, null when none); limit 1.
- `favourites`: `getProducts({ page: 1 })` sliced to 8 (its 20-row page is fine here because the rule is "the 8 newest"), each with the `productBadge` input fields.
- `categories`: active categories with `activeProductCount` (own grouped count query), only those with count at least 1, most products first.
- `brands`: its **own query** (not `getBrands`, which pages 24 by name and could return only empty brands): top three active stores by active product count, at least 1 product, with name, slug, excerpt and count.
- `counts`: active stores, active products, active categories (three `count` queries).
  All five run in one `withPublicRead` transaction group; none imports `withAdmin`.

- [ ] **Step 1: Failing tests, three layers.**
  1. _Unit, mocked data_ (always runs): a stubbed `withPublicRead` returns rows; assert the mapping, that `featured.minPriceSen` is null when the join finds no active variant, that the module never imports `withAdmin`, and that all-empty rows give `{ featured: null, favourites: [], categories: [], brands: [], counts: {0,0,0} }`.
  2. _DB-backed, populated_ (`describe.skipIf(!shouldRun)`, owner-SQL fixtures, marker `r3fx`): 3 active stores, 3 categories, 9 active products (one with no cover, one with an 80-character name), one inactive store and one draft product that must not appear; **25 newer active products without a cover plus one older product with a cover, to prove `featured` finds it**; a featured candidate whose only variant is inactive (price null, still featured, no price). Counts and per-category counts equal the fixture truth.
  3. _DB-backed, empty_: an **isolated database**, never the populated local one (removing fixture rows from the populated database does not make it empty). Provision `bomy_r3_empty` from the owner role, run the repository migrations against it (`DATABASE_URL` pointing at it), grant the `bomy_app` role what the migrations grant, run `home-queries.empty.test.ts` with `DATABASE_URL` and `DATABASE_APP_URL` pointing at it, then drop the database. If the app role cannot be provisioned in an isolated database, this layer is reported **"not evaluated"** with the reason, the mocked-data layer is the only empty proof, and the evidence says that plainly.
- [ ] **Step 2-4:** implement in `home-queries.ts` (no edit to `products/queries.ts` or `brands/queries.ts`); run all layers; commit.

### Task 3: Display type tokens and the hero bento

- [ ] **Step 1: Failing tests:** `display-type.test.ts` (the two sizes, line height 0.95 and tracking exist in the Tailwind config); `hero.test.tsx` iterating `VISIBILITY_CASES` with the sentinel copy: headline card always; featured card only when `featured` is not null, linking to `/products/<storeSlug>/<productSlug>` with the real name, store and `CoverImage`; **the price line only when `minPriceSen` is not null (no "RM0", no empty price element)**; the themed tile only when `counts.products > 0`; the delivery tile always; decorative SVGs `aria-hidden`; `visibleTextOutside` returns nothing; a copy-stress case (3x text) keeps every element inside its tile.
- [ ] **Step 2-4:** implement `hero.tsx` (bento grid: big white card, tall blush featured card, pastel link tile, delivery tile with a static dotted track and round badge) and the two font-size tokens; run; commit.

### Task 4: Marquee band and browse bento

- [ ] **Step 1: Failing tests** (iterating `VISIBILITY_CASES`): marquee always renders, is `aria-hidden`, clipped, shows copy words and (when present) category names, no animation class; browse renders only when a category has `activeProductCount >= 1`, shows at most five, most products first, each a link to `/products?category=<id>` with the real count through `browse.count(n)`, plus the `browse.all` link; with no qualifying category the section is absent (not an empty frame); an 80-character category name wraps inside its tile.
- [ ] **Step 2-4:** implement; run; commit.

### Task 5: Favourites

- [ ] **Step 1: Failing tests** (iterating `VISIBILITY_CASES`): the pill tray renders only when a category has `activeProductCount >= 1` ("All" from `favourites.all` plus those categories, plain links, `aria-current` on none); the grid renders only when `favourites.length >= 1`, shows at most 8 `ProductCard`s with badges, and the pills go with the grid (no pills without products); one product shows one card; long names wrap (the card's own behaviour stays in its tests).
- [ ] **Step 2-4:** implement; run; commit.

### Task 6: Promise cards, stats, sellers, CTA

- [ ] **Step 1: Failing tests** (iterating `VISIBILITY_CASES`): promise cards always render (statement words all in the dark colour, chip links to `/membership`, no price); a stats tile renders only for a count above 0 and the row only when at least one tile does; the sellers row renders only for brands with `productCount >= 1`, at most three `BrandCard`s; the CTA card always renders with exactly the two real links and **no** `input` or `form`; `visibleTextOutside` returns nothing for each.
- [ ] **Step 2-4:** implement; run; commit.

### Task 7: Page composition

- [ ] **Step 1: Failing tests** (`tests/home/home-page.test.tsx`, mocks `getHomeData`, iterates `VISIBILITY_CASES` with the sentinel copy): for every case, the sections that are present and absent equal the table (the same table the section tests use); **the empty case equals the empty page exactly** (headline card, delivery tile, marquee, promise cards, CTA card; no featured card, themed tile, browse, pills, grid, stats row or sellers row; no element with the text "0"); the full case shows the sections in the table's order; metadata title and description come from copy; the module exports `dynamic = "force-dynamic"`.
- [ ] **Step 2-4:** replace `page.tsx` (composition, `generateMetadata`, `force-dynamic`); run; commit.

### Task 8: Browser proof, gates, diff proof and docs

- [ ] **Step 1: Baselines and fixtures** (marker `r3fx`, owner SQL, scripts under `.andy/`): whole-table baselines for `stores`, `products`, `product_variants`, `categories`, `store_categories`, `users`, `user_consents`, `action_rate_limits`, `admin_bypass_audit` (total and rows with no actor), and `checkout_enabled`. Fixtures for the Review Focus cases that can be shown on the populated local database: one of everything is shown with a **separate fixture-only view** (the page rendered from the isolated database when Task 2 layer 3 could be provisioned; otherwise "not evaluated in the browser"), many categories, long names, no cover, failing cover, no price. **The empty page is never claimed from the populated local database.** Its proof is the mocked-data page test and, when provisioned, the isolated database run with the app pointed at it.
- [ ] **Step 2: Browser pass** on the new build at 1440, 1024, 768, 390 and 320: page width equals the viewport, no overflow, section order, real data on every tile, contrast table (light and dark, composited), real Tab order with ring and clipping checks, copy-stress screenshot, reduced-motion emulation (nothing moves anyway), 0 console errors. The old page is a placeholder, so there is no old-versus-new overflow table; the evidence says so.
- [ ] **Step 3: Gates:** typecheck, lint, `ui:audit --allow-deferred`, `ui:audit:test`, web and admin tests, `pnpm build` with no database environment, then the required DB-env suites (new `home-queries` layers and all `tests/storefront`), then fixture cleanup with zero-count proof, suite-residue check (users created by suites: identify by creation time, check every foreign key for dependents, clean what is safe, report the rest; Charlie accepts any retained rows explicitly), `checkout_enabled` check, `bomy-check` reported honestly.
- [ ] **Step 4: Audit rows attributed to R3, not to everything that ran.** The home page reads with `withPublicRead` and must write **zero** `admin_bypass_audit` rows. Unrelated local jobs (the `apps/api` startup jobs, `bomy-export`, other dev servers) can append rows during the same hours, so the evidence separates the causes: (1) before the pass, prove ports 3001 and 3002 are free and no `apps/api` or admin process is running (`lsof`, `ps`); (2) take `max(created_at)` and the total, load the home page ten times at each of the five widths against the built server, and read every audit row created in that window with its `reason`, `actor_user_id` and `created_at`; (3) R3's expected count is **0**: any row in the window whose `reason` is not one the test or the fixture scripts wrote is listed by reason and time and marked "not R3" with its likely source; (4) one single-load check with nothing else running (before and after counts identical, three repeats). A row is attributed to R3 only if the home page caused it; if the evidence cannot separate a row, it is reported as unexplained, not folded into "R3 added none". The DB suites' own rows are reconciled separately, by cause and time window, as in R5c-1 and R5c-2.
- [ ] **Step 5: Diff proof:** forbidden-path diff empty; every non-class changed line listed.
- [ ] **Step 6: Docs and the copy gate:** write `docs/superpowers/plans/2026-10-22-soft-red-r3-evidence.md` and `.andy/soft-red-r3-pr-body.md`, **stop before push**, then after Bob's review and Charlie's go: make the repo public, push, open the PR as a **draft** ("DO NOT MERGE until copy approved"). Charlie edits `home-copy.ts` (or tells Andy the words); his final copy commit sets `HOME_COPY_STATUS = "approved"` and omits the Co-Authored-By trailer; re-run the home tests and the copy test; only then Charlie merges, keeping the repo public through CI, the merge and the Vercel production build.

## Self-review

- **Spec coverage:** all nine sections of the parity spec are either built (1 to 6, 9) or replaced with a real-data equivalent (7, 8) with the reason stated; motion is deferred to R6 by D3; copy gate, no-fake-data and `withPublicRead`-only rules are Global Constraints and Task 1 and 2 tests.
- **Placeholders:** none in the plan; the draft copy table is explicit draft text, gated by `HOME_COPY_STATUS`.
- **Consistency:** `getHomeData()` returns `featured`, `favourites`, `categories`, `brands`, `counts`; every section task reads those names; `HOME_COPY` keys match the table.
- **Risks:** (1) the page reads the database, so build-time prerendering must be off (`force-dynamic`, Review Focus 7). (2) Draft copy must not over-claim while checkout is off; the table keeps to verifiable facts. (3) Small catalogue: sections hide on empty data, so the live page may look short until sellers add products. (4) Two new font-size tokens touch the design-token tests only. (5) Not evaluated whatever the outcome: Safari, Firefox, touch, real production data volume, Core Web Vitals.
