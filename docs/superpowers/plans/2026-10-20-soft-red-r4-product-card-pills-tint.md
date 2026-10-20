# Soft-red R4: ProductCard, filter pills, blush tile tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the public storefront one shared pastel `ProductCard`, web-only category filter pills, and the blush tile colour as real tokens, using only data BOMY already holds.

**Architecture:** Add a `--tint` token (blush) plus a few Tailwind steps. Build two web-only components in `apps/web/src/components/` (`product-card.tsx`, `filter-pill.tsx`). Replace the three hand-copied cards (`products/page.tsx`, `brands/[slug]/page.tsx`, `brands/[slug]/products/page.tsx`) with `ProductCard`, and the `/products` category sidebar with a pill tray. `@bomy/ui` and `apps/admin` are not touched.

**Tech Stack:** Next 15.5, React 19, Tailwind 3.4, Vitest 2.1.9 (jsdom per file), Playwright MCP for browser proof.

**Spec:** `docs/superpowers/plans/2026-10-17-kvist-parity-spec.md` (favourites tile, filter tray) and `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R4 section, Amendment 2026-10-17). R2 plan `docs/superpowers/plans/2026-10-17-soft-red-r2-floating-nav-footer.md` for the verification style.

## Global Constraints

- **Real data only (Charlie, 2026-10-20).** No invented ratings, review counts, "bestseller" flags, sold counts or stock numbers. A badge appears only when a real field proves it (Decision D2).
- Layout and motion follow the Kvist parity spec by measurement only. No Kvist code, text, images or logo.
- Palette as shipped in R1/R2: soft red `#9A3B3B`, near-white ground, blush `#EFDED7` for tiles only. The page ground stays near white.
- `apps/admin` and `packages/ui` are byte-identical after this PR. The shared `Badge` and `FilterTabs` variants do not change (`status-variants.test.tsx`, `filter-tabs.test.tsx` pin them).
- Keep `group-hover:text-primary` on the product name (pinned by `tests/storefront/store-products-page.test.tsx`).
- Keep all link targets, `aria-current`, `aria-label`s, search and pagination behaviour. `checkout_enabled` stays `false`.
- Every colour pair is tested alpha-composited, text at least 4.5:1, in light and dark.
- No motion in R4 beyond today's colour change on hover. Lift, reveal and scale are R6.
- Prettier, `--max-warnings 0` lint, `pnpm ui:audit --allow-deferred` exit 0 (ledger every new arbitrary value or avoid it with a token), `ui:audit:test` 17/17.
- Commits use explicit paths (never `git add <dir>`), carry the Claude Co-Authored-By trailer, and `products/loading.tsx` (untracked) is never touched; move it aside for builds and restore it.

## Review Focus

Failure modes the spec implies but no screen test shows today:

1. **Long or unbreakable names** (80 characters, no spaces; 50 Chinese characters) overflow the tile at 320 and 390 px (R1 found this weakness on other pages). Expect: the name wraps or clamps inside the tile, no horizontal scroll.
2. **No cover image** (null) and a **non-null image URL that fails to load** (404, blocked, offline). Expect: the tint and a Package icon fill the art area, same height as a tile with an image, also when the image fails before hydration.
3. **No price** (`minPriceSen` null: product has no active variant) and **no category** (null). Expect: no "from RM" line, no empty label, and no gap above the name when the category is absent.
4. **Pill tray with many categories** (20+) at 320 px, and one very long unbroken category name (60 characters, no spaces). Expect: the tray wraps, the long pill breaks inside its own box and stays within the 320 px viewport, pills stay at least 44 px tall to tap, no horizontal scroll.
5. **Keyboard focus on the tile.** The tile clips its corners (`overflow-hidden`); the focus ring must still show fully. Expect: ring on the link, not clipped, in light and dark.
6. **Search plus category together** (`?q=tea&category=<id>`) and an **invalid category id**. Expect: pills keep `q` in their links; an unknown id leaves no pill active, as today (Task 4 test).
7. **Badge counts under public read:** active in-stock, active zero-stock, inactive-only, mixed active and inactive, and no-variant products. Expect: "Sold out" only when there is at least one active variant and none in stock; inactive variants never count; no variants gives no badge.

---

## Decisions (Charlie, 2026-10-20: all five recommended options)

- **D1a:** cover-fit photos (`object-cover`) in the tall art area; blush shows only behind a missing, loading or failed image.
- **D2a:** real "Sold out" and "New" badges on `/products` only, from fields we already store, added to the existing aggregate query (no second read).
- **D3a:** the `/products` sidebar becomes a pill tray above a full-width grid.
- **D4a:** brand pages use the compact card (image and name, no price; their queries do not select price).
- **D5a:** one blush `--tint` token (plus a dark value). Several rotating pastels wait for Charlie's word.

Bob's review (2026-10-20) asked for seven changes; they are folded into the tasks below and into Review Focus.

---

## File Structure

| File                                                                                                                                                                              | Responsibility                                             | Task |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| `apps/web/src/app/globals.css`                                                                                                                                                    | `--tint` in `:root` and `.dark`                            | 1    |
| `apps/web/tailwind.config.ts`                                                                                                                                                     | `tint` colour, `aspectRatio.tile`, `letterSpacing.eyebrow` | 1    |
| `apps/web/tests/design-tokens/tint.test.ts` (new)                                                                                                                                 | token values, contrast on the tint                         | 1    |
| `apps/web/src/components/filter-pill.tsx` (new)                                                                                                                                   | `FilterPills` (nav) and `FilterPill` (link)                | 2    |
| `apps/web/tests/components/filter-pill.test.tsx` (new)                                                                                                                            | aria, classes, focus ring, merge                           | 2    |
| `apps/web/src/components/cover-image.tsx` (new, client)                                                                                                                           | `<img>` that swaps to the Package fallback on error        | 3    |
| `apps/web/src/components/product-card.tsx` (new)                                                                                                                                  | shared tile (`full` and `compact`)                         | 3    |
| `apps/web/tests/components/product-card.test.tsx`, `cover-image.test.tsx` (new)                                                                                                   | content rules, edge cases, classes, failed load            | 3    |
| `apps/web/src/app/products/page.tsx`                                                                                                                                              | use `ProductCard` and `FilterPills`                        | 4    |
| `apps/web/src/app/brands/[slug]/page.tsx`, `brands/[slug]/products/page.tsx`                                                                                                      | use compact `ProductCard`                                  | 4    |
| `apps/web/tests/storefront/store-products-page.test.tsx`, `tests/filters/filters.test.tsx`                                                                                        | updated only where marked "updated by the swap"            | 4    |
| `apps/web/src/lib/product-badge.ts` (new), `apps/web/src/app/products/queries.ts`, `tests/lib/product-badge.test.ts`, `tests/storefront/products-badge-queries.test.ts` (new, DB) | badge rule and the extra columns on the existing aggregate | 5    |
| `.andy/r4-fixtures.sql`, `.andy/r4-fixtures-cleanup.sql` (gitignored), `scripts/ui-audit/exceptions.json`, `docs/design-system/README.md`, evidence file, PR body                 | browser fixtures, gates and docs                           | 6    |

---

### Task 1: Blush tile tokens

**Files:**

- Modify: `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`
- Create: `apps/web/tests/design-tokens/tint.test.ts`

**Interfaces:**

- Produces: CSS var `--tint` (HSL triplet), Tailwind `bg-tint`, `aspect-tile` (4 / 5), `tracking-eyebrow` (0.16em). Later tasks use these names exactly.

- [ ] **Step 1: Write the failing test** `tint.test.ts`, in the style of `soft-red.test.ts` (reuse its `tokens`, `ratio`, `over` helpers by copying the small helpers; do not export from the other test):

```ts
// Light: blush #EFDED7 = 18 43% 89%. Dark: warm tile, lighter than --card, darker than --secondary.
it("--tint is blush in light and a warm dark tile in dark", () => {
  expect(light["tint"]).toBe("18 43% 89%")
  expect(dark["tint"]).toBe("20 18% 14%") // starting value; Step 4 may adjust it, then update this line
})
it("tint is not the page ground (blush is tile only)", () => {
  expect(light["tint"]).not.toBe(light["background"])
})
it.each(["foreground", "muted-foreground", "primary-text"])(
  "%s on --tint is >= 4.5 in both themes",
  (name) => {
    expect(ratio(rgb(light[name]!), rgb(light["tint"]!))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(rgb(dark[name]!), rgb(dark["tint"]!))).toBeGreaterThanOrEqual(4.5)
  },
)
it("tailwind exposes tint, aspect-tile and tracking-eyebrow", () => {
  const cfg = readFileSync(resolve(__dirname, "../../tailwind.config.ts"), "utf8")
  expect(cfg).toContain('tint: "hsl(var(--tint))"')
  expect(cfg).toContain('tile: "4 / 5"')
  expect(cfg).toContain('eyebrow: "0.16em"')
})
```

- [ ] **Step 2: Run** `pnpm --filter @bomy/web exec vitest run tests/design-tokens/tint.test.ts` — expect FAIL (token missing).
- [ ] **Step 3: Implement.** `:root`: `--tint: 18 43% 89%; /* blush #EFDED7, storefront tile colour (R4); never the page ground */`. `.dark`: `--tint: 20 18% 14%;`. Tailwind: `colors.tint = "hsl(var(--tint))"`, `aspectRatio: { tile: "4 / 5" }`, `letterSpacing: { eyebrow: "0.16em" }`.
- [ ] **Step 4: Run again.** Expect PASS. If a dark pair is under 4.5, change the dark tint lightness and update both the CSS and the test line, then re-run. Light pairs are already computed: foreground 12.33, muted-foreground 5.20, primary-text 5.22.
- [ ] **Step 5: Commit** `globals.css`, `tailwind.config.ts`, `tint.test.ts` with explicit paths.

### Task 2: Filter pills (web-only)

**Files:**

- Create: `apps/web/src/components/filter-pill.tsx`, `apps/web/tests/components/filter-pill.test.tsx`

**Interfaces:**

- Produces: `FilterPills({ label, className, children })` renders `<nav aria-label={label}>` with a tray; `FilterPill({ active, asChild, className, ...anchorProps })` renders `<a>` with `aria-current="page"` only when active. Same contract as `@bomy/ui/filter-tabs`, so pages swap with no behaviour change.

- [ ] **Step 1: Write the failing tests** (mirror `filter-tabs.test.tsx`): labelled nav; no ARIA tab roles; `aria-current` only on the active pill; `asChild` keeps the child's `href`; works around `next/link`; focus ring classes `focus-visible:ring-2 focus-visible:ring-ring`; touch size `min-h-11`; a 60-character unbroken label stays inside its parent (class `max-w-full break-words`, tray has `min-w-0`; the real width check is in Task 6); `className` merges after the base; tray classes `flex flex-wrap gap-1 rounded-bento bg-muted p-1`... (use `rounded-3xl` if `rounded-bento` is too round for a one-line tray; decide in the browser at Task 6 and pin the final class string).
- [ ] **Step 2: Run** — expect FAIL (file missing).
- [ ] **Step 3: Implement** with `cva` and the existing `cn`:

```tsx
const pill = cva(
  "inline-flex min-h-11 max-w-full items-center break-words rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      active: {
        true: "bg-foreground text-background",
        false: "text-muted-foreground hover:bg-card hover:text-foreground",
      },
    },
    defaultVariants: { active: false },
  },
)
```

The active pill inverts with the theme (`bg-foreground`), so it is dark in light mode and light in dark mode, always at least 4.5:1.

- [ ] **Step 4: Run** the new test and `tests/components/filter-tabs.test.tsx` (must stay green: shared component untouched). Expect PASS.
- [ ] **Step 5: Commit** the two files.

### Task 3: CoverImage and ProductCard

**Files:**

- Create: `apps/web/src/components/cover-image.tsx` (client), `apps/web/src/components/product-card.tsx`, `apps/web/tests/components/cover-image.test.tsx`, `apps/web/tests/components/product-card.test.tsx`

**Interfaces:**

- Produces:

```ts
// cover-image.tsx ("use client")
export function CoverImage(props: { src: string | null; alt: string }): JSX.Element
// Renders the <img> (width/height 400, h-full w-full object-cover) when src is non-null and has not failed;
// otherwise a centred lucide Package (aria-hidden, size-10, text-muted-foreground).
// Failure paths: (1) the img `error` event sets failed; (2) a ref effect on mount checks
// `img.complete && img.naturalWidth === 0`, which catches an image that failed before React hydrated.

// product-card.tsx (server component; no "use client")
export interface ProductCardProps {
  href: string
  name: string
  coverImageUrl: string | null
  variant?: "full" | "compact" // default "full"
  categoryName?: string | null // full only
  storeName?: string | null // full only
  minPriceSen?: number | null // full only; formatted with formatMyrSen
  badge?: "New" | "Sold out" | null // real-data badge (Task 5); null/absent = none
}
export function ProductCard(props: ProductCardProps): JSX.Element // renders the <Link> tile; pages keep their own <li>
```

- [ ] **Step 1: Write the failing tests.**
  - `cover-image.test.tsx` (jsdom): null `src` renders the Package and no `<img>`; a non-null `src` renders `<img alt>`; dispatching an `error` event on the `<img>` swaps to the Package inside the same box; an image that is `complete` with `naturalWidth` 0 at mount (set both with `Object.defineProperty` on `HTMLImageElement.prototype` before rendering) swaps on mount; a loaded image (`naturalWidth` 400) stays. jsdom does not fetch images, so these tests prove the logic. The real failed load (a 404 URL) is proved in the browser in Task 6, and the evidence says which is which.
  - `product-card.test.tsx`: one `<a href>` wraps the whole tile; the name has `group-hover:text-primary` and sits inside `.group`; the art area has `bg-tint aspect-tile`; **border:** the first child of the link has both `border` and `shadow-sm`, so the existing test "the whole tile, border included, is inside the link" passes unchanged; `full` shows the eyebrow (`font-mono text-xs uppercase tracking-eyebrow mb-1`), the store name, and "from RM x" only when `minPriceSen != null`, in `text-primary-text`; **no category:** no eyebrow element, the name has no `mt-` class and is the first child of the body; null store and null price render nothing; `compact` shows image and name only; the name has `break-words line-clamp-2` and the card root `min-w-0`; badge text renders exactly once when set and not at all when null; the link has `focus-visible:ring-2 focus-visible:ring-ring rounded-bento`, and `overflow-hidden` is on the inner wrapper only.
- [ ] **Step 2: Run** `pnpm --filter @bomy/web exec vitest run tests/components/cover-image.test.tsx tests/components/product-card.test.tsx` — expect FAIL (files missing).
- [ ] **Step 3: Implement.** Link: `group block min-w-0 rounded-bento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. Inner wrapper (first child): `overflow-hidden rounded-bento border border-border bg-card shadow-sm`. Art: `relative aspect-tile bg-tint` holding `<CoverImage>`. Badge: `absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground`. Body `p-4`: eyebrow with `mb-1` (the gap lives on the eyebrow, never on the name), name `line-clamp-2 break-words text-base font-medium text-foreground group-hover:text-primary`, store `truncate text-sm text-muted-foreground`, price `mt-2 text-sm font-semibold text-primary-text`.
- [ ] **Step 4: Run** — expect PASS. Then `pnpm --filter @bomy/web exec vitest run tests/components` for side effects.
- [ ] **Step 5: Commit** the four files.

### Task 4: Wire the three pages and the pill tray

**Files:**

- Modify: `apps/web/src/app/products/page.tsx`, `apps/web/src/app/brands/[slug]/page.tsx`, `apps/web/src/app/brands/[slug]/products/page.tsx`
- Modify (only where marked): `apps/web/tests/storefront/store-products-page.test.tsx` (the "class tokens (updated by the swap)" `TOKENS.link` and `TOKENS.tile` values and the placeholder test; the "border included" test is **not** edited because the new inner wrapper keeps `border` and `shadow-sm`), `apps/web/tests/filters/filters.test.tsx`

**Interfaces:**

- Consumes: `ProductCard`, `FilterPills`, `FilterPill` from Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests.** (1) `/products`: pills nav is labelled "Filter by category"; "All" is `aria-current="page"` with no category; with `category=c1` the c1 pill is active; every pill link keeps `q` when set (`/products?q=tea&category=c1`); an unknown category id leaves no pill active and "All" not active (matches today's behaviour: `!category` is false, so All is not active). (2) The grid items render `ProductCard` (an `a` with the `bg-tint` art area). (3) Pagination tests in `filters.test.tsx` stay unchanged and green. (4) The brand pages render the compact card and keep the empty-state words.
- [ ] **Step 2: Run** — expect FAIL where the markup changed.
- [ ] **Step 3: Implement.** Pages keep their `<ul>`/`<li>` and data; each `<li>` holds `<ProductCard … />`. `/products`: replace the `<aside>` with `<FilterPills label="Filter by category">` above the grid (D3 a); the layout becomes single column. `brands/[slug]/page.tsx`: delete the local `ProductCard` function, import the shared one (compact). Unify the empty image on the `Package` icon (the 📦 emoji goes; update the one test that expects it and say so in the PR).
- [ ] **Step 4: Run** `pnpm --filter @bomy/web exec vitest run tests/storefront tests/filters tests/components`. Expect PASS.
- [ ] **Step 5: Commit** the three pages and the touched tests.

### Task 5: Real-data badges (D2a)

**Files:**

- Create: `apps/web/src/lib/product-badge.ts`, `apps/web/tests/lib/product-badge.test.ts`, `apps/web/tests/storefront/products-badge-queries.test.ts`
- Modify: `apps/web/src/app/products/queries.ts`, `apps/web/src/app/products/page.tsx`

**Interfaces:**

- Produces: `productBadge({ createdAt: Date, activeVariantCount: number, inStockVariantCount: number, now: Date }): "Sold out" | "New" | null`. Rule: `activeVariantCount === 0` gives `null` (no variants is not "Sold out"); `activeVariantCount > 0 && inStockVariantCount === 0` gives `"Sold out"`; otherwise created within 14 days gives `"New"`; else `null`. Sold out wins over new.

- [ ] **Step 1: Write the failing tests.**
  - `product-badge.test.ts` (pure): no variants; all at 0; one in stock; 13, 14 and 15 days old; sold out and new together.
  - `products-badge-queries.test.ts` (DB, `describe.skipIf(!shouldRun)`, same env gate and `withAdmin` seeding style as `brand-products-queries.test.ts`): seed one active store, one user and six active products, then assert through the real `getProducts` (which runs under `withPublicRead`):
    - A: one active variant, stock 5 gives `activeVariantCount` 1 and `inStockVariantCount` 1.
    - B: one active variant, stock 0 gives 1 and 0.
    - C: no variants gives 0 and 0 (the left join yields one null row, so `count(variants.id)` must be 0 and the `filter` count 0).
    - D: one inactive variant (stock 5) plus one active variant (stock 0) gives 1 and 0 (inactive stock never counts).
    - E: inactive variants only gives 0 and 0.
    - F: two active variants, stock 0 and 3, gives 2 and 1.
      Also assert `createdAt` is returned, A's `minPriceSen` still equals its active variant price, and `total` counts each product once (the aggregate must not duplicate rows). `afterAll` deletes variants, products, the store and the user by id.
  - Run the DB test for real: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web exec vitest run tests/storefront/products-badge-queries.test.ts`, and confirm the output shows tests that ran, not skipped. If it cannot run, the evidence says "not evaluated".
- [ ] **Step 2: Run** the pure test and the DB test — expect FAIL.
- [ ] **Step 3: Implement** by extending the existing aggregate select in `getProducts` (no second query, no new join): add `createdAt: schema.products.createdAt`, `activeVariantCount: sql<number>\`count(${schema.productVariants.id})::int\``, `inStockVariantCount: sql<number>\`(count(${schema.productVariants.id}) filter (where ${schema.productVariants.stockCount} > 0))::int\``, and add `schema.products.createdAt`to`groupBy`. The existing left join already limits to `isActive = true`variants. Read-only;`withPublicRead`unchanged; no RLS or migration change. In`page.tsx`pass`badge={productBadge({ createdAt: p.createdAt, activeVariantCount: p.activeVariantCount, inStockVariantCount: p.inStockVariantCount, now: new Date() })}`.
- [ ] **Step 4: Run** both tests and `tests/storefront`. Expect PASS.
- [ ] **Step 5: Commit.**

### Task 6: Gates, browser proof, docs, PR body

**Files:**

- Create (gitignored, local only): `.andy/r4-fixtures.sql`, `.andy/r4-fixtures-cleanup.sql`
- Modify: `scripts/ui-audit/exceptions.json` (if needed), `docs/design-system/README.md`
- Create: `docs/superpowers/plans/2026-10-20-soft-red-r4-evidence.md`, `.andy/soft-red-r4-pr-body.md`

- [ ] **Step 0: Browser fixtures and cleanup (local dev DB only).** The browser states below do not exist in seed data, so write one fixture script and one cleanup script, run with `docker exec -i bomy_postgres psql -U bomy -d bomy < <file>`. Everything uses the marker `r4fx` so cleanup is exact:
  - One fixture user (`r4fx-seller@test.bomy`, role `seller_owner`) and one active store `r4fx-store`.
  - **Categories:** 22 active categories with slugs `r4fx-cat-01` to `r4fx-cat-22` (names "R4 Cat 01" and so on), plus one with a 60-character unbroken name and slug `r4fx-cat-long`.
  - **Products** (all `status = 'active'` in `r4fx-store`, slugs prefixed `r4fx-`): (1) normal: category 01, one active in-stock variant, no cover; (2) **no price**: category 01, no variants; (3) **no category**: category null, one active in-stock variant; (4) **broken image**: cover URL `http://localhost:3000/r4fx-missing.jpg` (a real 404 from the app), category 01, in stock; (5) **long name**: 80-character unbroken name, category `r4fx-cat-long`, in stock; (6) **sold out**: one active variant at stock 0; (7) **new**: created now, in stock; (8) **Chinese name** of 50 characters. Products (1) to (5) and (8) get `created_at` 30 days back so only (6) and (7) show badges.
  - `.andy/r4-fixtures-cleanup.sql` deletes, in order, variants, products, categories, the store and the user matching `r4fx`. Run it after the browser pass, then run a `select count(*)` per table with the marker and record that all are 0. Run `bomy-check` and report the result honestly: the local DB changed during the session and was restored by cleanup.
  - The evidence file lists the fixtures, states that they were removed, and shows the final zero counts.
- [ ] **Step 1: Gates.** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run` (admin unchanged: same counts), `pnpm ui:audit --allow-deferred` (exit 0; ledger any new arbitrary value per line, one entry per match), `pnpm ui:audit:test`, then `pnpm build` (move `products/loading.tsx` aside, restore it, copy `.next/static` into `.next/standalone/apps/web/.next/static`). Start the standalone server from `apps/web/.next/standalone/apps/web` with `AUTH_TRUST_HOST=true PORT=3000 HOSTNAME=localhost node --env-file=/Users/charlie/Documents/Projects/BOMY/app/apps/web/.env.local server.js` (absolute path; never source `.env.local` in the shell).
- [ ] **Step 2: Browser, production build, light and dark, 320 / 390 / 768 / 1024 / 1440.** Pages: `/products`, `/products?category=<id>`, `/products?q=<term>&category=<id>`, `/brands/r4fx-store`, `/brands/r4fx-store/products`. Check each Review Focus line against the fixtures: (1) long and Chinese names stay inside the tile, no horizontal scroll; (2) the null-cover tile and the **real 404 image tile** both show the tint and the Package icon at the same height as a tile with a photo, also after a hard reload (covers the failed-before-hydration path); (3) the no-price and no-category tiles have no empty line and no gap above the name; (4) the 22-category tray wraps at 320 px and the 60-character pill stays inside the viewport (`getBoundingClientRect().right <= innerWidth`) with pills at least 44 px tall; (5) real Tab through pills and tiles shows the focus ring unclipped, light and dark; (6) search plus category links keep both params; (7) "Sold out" and "New" show on exactly the two fixture tiles and nowhere else.
- [ ] **Step 3: Contrast.** Alpha-composited audit of the five pages in both themes (0 nodes below 4.5:1) including text on `bg-tint`, badges, and active and inactive pill states. No horizontal scroll at any width.
- [ ] **Step 4: Docs.** Add the `--tint`, `aspect-tile`, `tracking-eyebrow`, `ProductCard`, `CoverImage` and `FilterPill` rows to `docs/design-system/README.md` (R4 section). Write the evidence file and the PR body with only verified claims, the not-evaluated list (real seller photos, Safari, Firefox, touch, the `DATABASE_URL` test files if not run, anything skipped above), and the PR footer.
- [ ] **Step 5: Commit** docs with explicit paths. **Stop. Do not push.** Bob reviews the evidence and PR body first.

---

## Self-review

- **Spec coverage:** blush tile token (Task 1), shared tile with tall art area, badge, category label, name, price (Task 3), filter pills in a rounded tray, active dark (Task 2 and 4), "rating only if real data exists" (none exists: no rating field in the schema, so none is shown), pages swapped (Task 4), real-data badges with a DB-backed count test (Task 5), failed-image fallback (Task 3), parent-plan constraints (`Badge` and `FilterTabs` untouched, `group-hover:text-primary` kept).
- **Placeholders:** none; Task 2 tray radius is decided in the browser and pinned then (named in the task).
- **Bob's seven points:** failed image (Task 3, Task 6 step 2); long pill (Task 2, Task 6 step 2); no category gap (Task 3); absolute `.env.local` path (Task 6 step 1); border assertion kept (Task 3, Task 4); fixtures and cleanup (Task 6 step 0); SQL counts under public read (Task 5).
- **Type consistency:** `ProductCardProps.badge` matches `productBadge` return type; Task 4 uses names from Tasks 2 and 3.
- **Out of scope (stays parked):** R3 home and its copy, marquee, hero bento, hover lift and reveal (R6), price on brand pages (D4 b), several pastel tints (D5 b), home "favourites" tabs.
