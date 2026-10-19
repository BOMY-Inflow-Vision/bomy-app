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
2. **No cover image** (null) and a **broken image URL** (seed images on `cdn.bomy.com` do not load locally). Expect: the tint and a Package icon fill the art area, same height as a tile with an image.
3. **No price** (`minPriceSen` null: product has no active variant) and **no category** (null). Expect: no "from RM" line and no empty label or empty gap.
4. **Pill tray with many categories** (20+) at 320 px, and a category name that is very long. Expect: the tray wraps, pills stay at least 44 px tall to tap, no horizontal scroll.
5. **Keyboard focus on the tile.** The tile clips its corners (`overflow-hidden`); the focus ring must still show fully. Expect: ring on the link, not clipped, in light and dark.
6. **Search plus category together** (`?q=tea&category=<id>`) and an **invalid category id**. Expect: pills keep `q` in their links; an unknown id leaves no pill active, as today (Task 4 test).
7. **A sold-out product** (all active variants at stock 0) and a **product with no variants**. Expect: "Sold out" only for the first; nothing for the second.

---

## Decisions for Charlie (answers change the tasks)

- **D1 Photo fit in the tall art area.** (a, recommend) `object-cover`: the seller photo fills the 4:5 area; the blush tint shows only behind a missing or loading image. (b) `object-contain`: the whole photo sits on blush with margins, closer to a studio shot but seller photos with their own backgrounds look like framed pictures. Pick (a) unless you want (b).
- **D2 Badges from real data.** (a, recommend) Show "Sold out" (every active variant at stock 0) and "New" (created in the last 14 days) on `/products` only. Both come from fields we already store, and they need one extra read in the `/products` query. (b) No badges in R4 (zero query change). "Bestseller", ratings and review counts are not possible: we hold no such data.
- **D3 Category filter layout on `/products`.** (a, recommend) Replace the left sidebar with a rounded tray of pills above the grid (wraps on small screens, grid becomes full width). (b) Keep the sidebar and only restyle the links as pills.
- **D4 Brand pages.** (a, recommend) `/brands/[slug]` and `/brands/[slug]/products` use the same tile in a compact form (image + name, as today; no price because those queries do not select it). (b) Also add price there: one more column in two queries (still read-only), but it widens R4.
- **D5 Tint count.** (a, recommend) One blush token `--tint` (plus a dark-theme value). (b) Several pastel tints rotating per card as in the demo. That needs more colours than the approved palette, so it waits for your word.

---

## File Structure

| File                                                                                                                  | Responsibility                                             | Task |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| `apps/web/src/app/globals.css`                                                                                        | `--tint` in `:root` and `.dark`                            | 1    |
| `apps/web/tailwind.config.ts`                                                                                         | `tint` colour, `aspectRatio.tile`, `letterSpacing.eyebrow` | 1    |
| `apps/web/tests/design-tokens/tint.test.ts` (new)                                                                     | token values, contrast on the tint                         | 1    |
| `apps/web/src/components/filter-pill.tsx` (new)                                                                       | `FilterPills` (nav) and `FilterPill` (link)                | 2    |
| `apps/web/tests/components/filter-pill.test.tsx` (new)                                                                | aria, classes, focus ring, merge                           | 2    |
| `apps/web/src/components/product-card.tsx` (new)                                                                      | shared tile (`full` and `compact`)                         | 3    |
| `apps/web/tests/components/product-card.test.tsx` (new)                                                               | content rules, edge cases, classes                         | 3    |
| `apps/web/src/app/products/page.tsx`                                                                                  | use `ProductCard` and `FilterPills`                        | 4    |
| `apps/web/src/app/brands/[slug]/page.tsx`, `brands/[slug]/products/page.tsx`                                          | use compact `ProductCard`                                  | 4    |
| `apps/web/tests/storefront/store-products-page.test.tsx`, `tests/filters/filters.test.tsx`                            | updated only where marked "updated by the swap"            | 4    |
| `apps/web/src/lib/product-badge.ts` (new), `apps/web/src/app/products/queries.ts`, `tests/storefront/queries.test.ts` | badge rule and the extra read (only if D2 = a)             | 5    |
| `scripts/ui-audit/exceptions.json`, `docs/design-system/README.md`, evidence file, PR body                            | gates and docs                                             | 6    |

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

- [ ] **Step 1: Write the failing tests** (mirror `filter-tabs.test.tsx`): labelled nav; no ARIA tab roles; `aria-current` only on the active pill; `asChild` keeps the child's `href`; works around `next/link`; focus ring classes `focus-visible:ring-2 focus-visible:ring-ring`; touch size `min-h-11`; `className` merges after the base; tray classes `flex flex-wrap gap-1 rounded-bento bg-muted p-1`... (use `rounded-3xl` if `rounded-bento` is too round for a one-line tray; decide in the browser at Task 6 and pin the final class string).
- [ ] **Step 2: Run** — expect FAIL (file missing).
- [ ] **Step 3: Implement** with `cva` and the existing `cn`:

```tsx
const pill = cva(
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

### Task 3: ProductCard

**Files:**

- Create: `apps/web/src/components/product-card.tsx`, `apps/web/tests/components/product-card.test.tsx`

**Interfaces:**

- Produces:

```ts
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

- [ ] **Step 1: Write the failing tests** (jsdom or `renderToStaticMarkup`, as `store-products-page.test.tsx` does):
  - renders one `<a href>` wrapping the whole tile; name has `group-hover:text-primary`; image has `alt={name}`, width/height 400 and `object-cover`; art area has `bg-tint aspect-tile`.
  - no image → `Package` icon (`aria-hidden`), no emoji, same art-area classes.
  - `full`: category label uses `font-mono text-xs uppercase tracking-eyebrow`; store name; "from RM x" only when `minPriceSen != null`; price text uses `text-primary-text` (not `text-primary` on tint).
  - missing category / store / price render nothing (no empty element: assert no element with empty text).
  - `compact`: image + name only.
  - name has `break-words line-clamp-2` and the card root `min-w-0`; an 80-character unbroken name does not add a width class.
  - `badge="Sold out"` and `"New"` render a pill with that exact text; absent renders none.
  - focus: link has `focus-visible:ring-2 focus-visible:ring-ring` and `rounded-bento`; the clipping `overflow-hidden` sits on the inner wrapper, not on the link.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** Link: `group block rounded-bento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. Inner: `overflow-hidden rounded-bento bg-card shadow-sm`. Art: `relative aspect-tile bg-tint` with `<img className="h-full w-full object-cover" …>` or centred `Package` (`size-10 text-muted-foreground`). Badge: `absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground`. Body `p-4`: eyebrow, name `mt-1 line-clamp-2 break-words text-base font-medium text-foreground group-hover:text-primary`, store `truncate text-sm text-muted-foreground`, price `mt-2 text-sm font-semibold text-primary-text`.
- [ ] **Step 4: Run** — expect PASS. Run `pnpm --filter @bomy/web exec vitest run tests/components` for side effects.
- [ ] **Step 5: Commit.**

### Task 4: Wire the three pages and the pill tray

**Files:**

- Modify: `apps/web/src/app/products/page.tsx`, `apps/web/src/app/brands/[slug]/page.tsx`, `apps/web/src/app/brands/[slug]/products/page.tsx`
- Modify (only where marked): `apps/web/tests/storefront/store-products-page.test.tsx` ("class tokens (updated by the swap)" and the placeholder test), `apps/web/tests/filters/filters.test.tsx`

**Interfaces:**

- Consumes: `ProductCard`, `FilterPills`, `FilterPill` from Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests.** (1) `/products`: pills nav is labelled "Filter by category"; "All" is `aria-current="page"` with no category; with `category=c1` the c1 pill is active; every pill link keeps `q` when set (`/products?q=tea&category=c1`); an unknown category id leaves no pill active and "All" not active (matches today's behaviour: `!category` is false, so All is not active). (2) The grid items render `ProductCard` (an `a` with the `bg-tint` art area). (3) Pagination tests in `filters.test.tsx` stay unchanged and green. (4) The brand pages render the compact card and keep the empty-state words.
- [ ] **Step 2: Run** — expect FAIL where the markup changed.
- [ ] **Step 3: Implement.** Pages keep their `<ul>`/`<li>` and data; each `<li>` holds `<ProductCard … />`. `/products`: replace the `<aside>` with `<FilterPills label="Filter by category">` above the grid (D3 a); the layout becomes single column. `brands/[slug]/page.tsx`: delete the local `ProductCard` function, import the shared one (compact). Unify the empty image on the `Package` icon (the 📦 emoji goes; update the one test that expects it and say so in the PR).
- [ ] **Step 4: Run** `pnpm --filter @bomy/web exec vitest run tests/storefront tests/filters tests/components`. Expect PASS.
- [ ] **Step 5: Commit** the three pages and the touched tests.

### Task 5: Real-data badges (only if D2 = a)

**Files:**

- Create: `apps/web/src/lib/product-badge.ts`, `apps/web/tests/lib/product-badge.test.ts`
- Modify: `apps/web/src/app/products/queries.ts`, `apps/web/src/app/products/page.tsx`, `apps/web/tests/storefront/queries.test.ts`

**Interfaces:**

- Produces: `productBadge({ createdAt, activeVariantCount, inStockVariantCount, now }): "Sold out" | "New" | null`. Rule: no active variants → `null`; active variants but none in stock → `"Sold out"`; created within 14 days → `"New"`; sold out wins over new.

- [ ] **Step 1: Write the failing tests** for the pure rule (no variants; all at 0; one in stock; 13, 14 and 15 days old; sold out and new together) and a query test that `getProducts` rows now carry `createdAt`, `activeVariantCount`, `inStockVariantCount` (follow the style of `tests/storefront/queries.test.ts`).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** In the existing select add `createdAt: schema.products.createdAt`, `activeVariantCount: sql<number>\`count(${schema.productVariants.id})::int\``, `inStockVariantCount: sql<number>\`count(\*) filter (where ${schema.productVariants.stockCount} > 0)::int\``(the join already limits to active variants; add`createdAt`to`groupBy`— it is a column of`products`, already grouped by `products.id`). Read-only; no new table, no RLS change (`withPublicRead`unchanged). Page passes`badge={productBadge({ …, now: new Date() })}`.
- [ ] **Step 4: Run** the new tests and `tests/storefront`. Expect PASS. Integration tests that need `DATABASE_URL` are "not evaluated"; say so.
- [ ] **Step 5: Commit.**

### Task 6: Gates, browser proof, docs, PR body

**Files:**

- Modify: `scripts/ui-audit/exceptions.json` (if needed), `docs/design-system/README.md`
- Create: `docs/superpowers/plans/2026-10-20-soft-red-r4-evidence.md`, `.andy/soft-red-r4-pr-body.md`

- [ ] **Step 1: Gates.** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run` (admin unchanged: same counts), `pnpm ui:audit --allow-deferred` (exit 0; ledger any new arbitrary value per line, one entry per match), `pnpm ui:audit:test`, then `pnpm build` (move `products/loading.tsx` aside, restore it, copy `.next/static`, run `server.js` with `AUTH_TRUST_HOST=true node --env-file=apps/web/.env.local server.js` from `.next/standalone/apps/web`).
- [ ] **Step 2: Browser, production build, light and dark, 320 / 390 / 768 / 1024 / 1440.** Pages: `/products`, `/products?category=<id>`, `/products?q=<term>&category=<id>`, `/brands/<slug>`, `/brands/<slug>/products`. Check each Review Focus line: (1) 80-character and Chinese names via the existing stress approach (a throwaway local product name, removed afterwards; local dev data change is reported), (2) a tile with no image and a tile whose image URL fails, (3) null price and null category, (4) the pill tray at 320 px with a long category, (5) real Tab through pills and tiles with the focus ring visible and unclipped, (6) search plus category links, (7) a sold-out tile only if one can be shown without editing shared data: otherwise state "not evaluated in the browser, unit tested".
- [ ] **Step 3: Contrast.** Alpha-composited audit of the five pages in both themes (0 nodes below 4.5:1) including text on `bg-tint`, and the active/inactive pill states. No horizontal scroll at any width.
- [ ] **Step 4: Docs.** Add the `--tint`, `aspect-tile`, `tracking-eyebrow`, `ProductCard` and `FilterPill` rows to `docs/design-system/README.md` (R4 section). Write the evidence file and the PR body with only verified claims, the not-evaluated list (real product photos, Safari, Firefox, touch, `DATABASE_URL` test files, anything skipped above), and the PR footer.
- [ ] **Step 5: Commit** docs with explicit paths. **Stop. Do not push.** Bob reviews the evidence and PR body first.

---

## Self-review

- **Spec coverage:** blush tile token (Task 1), shared tile with tall art area, badge, category label, name, price (Task 3), filter pills in a rounded tray, active dark (Task 2 and 4), "rating only if real data exists" (none exists: no rating field in the schema, so none is shown), pages swapped (Task 4), real-data badges (Task 5), parent-plan constraints (`Badge` and `FilterTabs` untouched, `group-hover:text-primary` kept).
- **Placeholders:** none; Task 2 tray radius is decided in the browser and pinned then (named in the task).
- **Type consistency:** `ProductCardProps.badge` matches `productBadge` return type; Task 4 uses names from Tasks 2 and 3.
- **Out of scope (stays parked):** R3 home and its copy, marquee, hero bento, hover lift and reveal (R6), price on brand pages (D4 b), several pastel tints (D5 b), home "favourites" tabs.
