# Soft-red R5a: Brand pages and long-token safety — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/brands`, `/brands/[slug]` and `/brands/[slug]/products` the soft-red look (bento radius, blush tiles, one page-heading scale, category pills) and make every seller-supplied text on those pages safe against long unbroken strings, with no logic or query change.

**Architecture:** Two new web-only components in `apps/web/src/components/`: `PageHeading` (the one h1 scale and wrap rule) and `BrandCard` (the `/brands` tile). Reuse R4's `FilterPills`, `ProductCard` and `Badge`. Pages change markup and classes only. `BodyRenderer`, `@bomy/ui`, `apps/admin`, queries and actions are not touched.

**Tech Stack:** Next 15.5, React 19, Tailwind 3.4, Vitest 2.1.9 (jsdom per file), Playwright MCP.

**Spec:** `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R5 section: "Type scale, spacing and `rounded-bento` only. No logic."), `docs/superpowers/plans/2026-10-17-kvist-parity-spec.md`, and R4's `2026-10-20-soft-red-r4-product-card-pills-tint.md` (components and fixture style reused). R4 evidence finding: long unbroken category name widened `/brands/[slug]` (fixed for the section heading in R4; the rest of the brand surfaces are audited here).

## Global Constraints

- **Real data only.** Brand cards show only stored fields: name, excerpt, categories, product count. No ratings, follower counts or "verified" marks.
- No change to queries, actions, routes, links, `aria-` names, search, pagination or sign-in gating. `getBrandSubscriberAvatars` stays gated on a session.
- `packages/ui`, `apps/admin`, `BodyRenderer` (shared with product detail, R5b) and the subscribe pages are not edited. The shared `Badge` variants do not change.
- Palette as shipped: soft red, near-white ground, blush `--tint` for tiles only. Every colour pair tested alpha-composited, text at least 4.5:1, light and dark.
- No motion beyond today's colour and shadow change on hover (R6 owns motion).
- Prettier, `--max-warnings 0` lint, `pnpm ui:audit --allow-deferred` exit 0 (ledger any new arbitrary value, one entry per match), `ui:audit:test` 17/17.
- Commits use explicit paths, carry the Claude Co-Authored-By trailer. `products/loading.tsx` (untracked) is moved aside for builds and restored. Standalone run: `AUTH_TRUST_HOST=true PORT=3000 HOSTNAME=localhost node --env-file=/Users/charlie/Documents/Projects/BOMY/app/apps/web/.env.local server.js` from `apps/web/.next/standalone/apps/web`.
- Report DB-env-limited tests as "not evaluated". Browser fixtures run as the table owner (no `withAdmin` audit rows) and are removed with zero-count proof for **every** fixture table: users, stores, products, `store_categories`, `store_category_assignments` and product `categories`.

## Review Focus

1. **Long unbroken store name** (80 characters, no spaces) in the h1 of all three pages, in the `/brands` card, and next to the "Back to storefront" link. Expect: wraps inside its box; page scroll width never exceeds the viewport at 320 px.
2. **Long unbroken excerpt** (160 characters, the longest the database accepts: `stores_excerpt_length_chk` is `length(excerpt) <= 160`) and an excerpt of normal length. Expect: the card clamps to 3 lines and stays inside the card.
3. **Many and long categories on a card** (13 assigned to one brand, one of them 60 characters unbroken). Expect: badges wrap inside the card; the long badge breaks inside its own box.
4. **Seller story HTML** (`bodyHtml`): a long unbroken token in a paragraph, a very wide table, a long link, a wide image. Expect: no page scroll; the table scrolls inside its own box; the paragraph breaks; the image never exceeds its column. The two-column top grid must not let one column push the other wider.
5. **Empty and odd brands:** no excerpt, no categories, 0 products, exactly 1 product ("1 product"), no `bodyHtml`, no video. Expect: no empty element, no gap, no "0 product" grammar error. **With no `bodyHtml` the empty story column is omitted** and the Subscribe, video and avatar content takes the full row, not half of it.
6. **Pill tray on `/brands`:** 20+ store categories, one 60 characters unbroken; search plus category; an unknown category id. Expect: pills wrap inside 320 px and are at least 44 px tall; links keep `q`; no pill current for an unknown id.
7. **Keyboard:** Tab order through search, Clear, pills, brand cards and pagination; the focus ring on a card is not clipped.

---

## Decisions (Charlie, 2026-10-20: all five recommended options)

- **D1a:** `/brands` category sidebar becomes the R4 pill tray.
- **D2a:** one `PageHeading` for the three brand pages and `/products`.
- **D3a:** "Our Story" sits in a white bento card (`bg-card`), not blush.
- **D4a:** brand card excerpt clamps to 3 lines.
- **D5a:** `/brands/[slug]/subscribe` and `/success` stay out (money path, R5c).

Bob's first review (2026-10-20) asked for seven changes; they are folded into the tasks below.

---

## File Structure

| File                                                                                                         | Responsibility                                | Task |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ---- |
| `apps/web/src/components/page-heading.tsx` (new), `tests/components/page-heading.test.tsx` (new)             | one h1 scale, optional description, wrap rule | 1    |
| `apps/web/src/components/brand-card.tsx` (new), `tests/components/brand-card.test.tsx` (new)                 | the `/brands` tile                            | 2    |
| `apps/web/src/app/brands/page.tsx`, `tests/storefront/brands-page.test.tsx` (new)                            | heading, pills, `BrandCard` grid              | 2    |
| `apps/web/src/app/products/page.tsx` (h1 line only, if D2 = a)                                               | use `PageHeading`                             | 1    |
| `apps/web/src/app/brands/[slug]/page.tsx`, `tests/storefront/brand-store-page.test.tsx` (extend)             | heading, top grid, story panel, empty state   | 3    |
| `apps/web/src/app/brands/[slug]/products/page.tsx`, `tests/storefront/store-products-page.test.tsx` (extend) | heading row, empty state                      | 4    |
| `.andy/r5fx-fixtures.sql`, `.andy/r5fx-fixtures-cleanup.sql`, `.andy/r5fx-fixtures-count.sql` (gitignored)   | long-token browser fixtures                   | 5    |
| `scripts/ui-audit/exceptions.json`, `docs/design-system/README.md`, evidence file, PR body                   | gates and docs                                | 6    |

---

### Task 1: PageHeading

**Files:**

- Create: `apps/web/src/components/page-heading.tsx`, `apps/web/tests/components/page-heading.test.tsx`
- Modify (D2 = a): `apps/web/src/app/products/page.tsx` (the h1 block only), `apps/web/tests/storefront/products-page.test.tsx`

**Interfaces:**

- Produces:

```ts
export interface PageHeadingProps {
  title: string
  description?: string | null // renders nothing when null, undefined or empty
  align?: "start" | "center" // default "start"
  className?: string
}
export function PageHeading(props: PageHeadingProps): JSX.Element // <header> holding one <h1> (+ optional <p>)
```

- [ ] **Step 1: Write the failing tests.** The h1 has `text-3xl font-bold tracking-tight sm:text-4xl text-foreground [overflow-wrap:anywhere]` and `min-w-0`; exactly one h1 renders; no description element when `description` is null, undefined or `""`; the description has `mt-2 text-base text-muted-foreground [overflow-wrap:anywhere]`; `align="center"` adds `text-center` on the header, default has none; `className` merges after the base (`mb-4` appears). D2a: the `/products` page test asserts its heading is the shared one (class `sm:text-4xl`), still reads "Products", and **keeps the existing 24 px bottom margin: the `<header>` carries `mb-6`**; the larger heading moves the search form as measured in Step 3. The `/brands` page test pins the same `mb-6` on its heading block (the old wrapper div had `mb-6`, with the description 4 px under the title).
- [ ] **Step 2: Run** `pnpm --filter @bomy/web exec vitest run tests/components/page-heading.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** (server component, `cn` from `@/lib/utils`; `/products` passes `className="mb-6"`, and `/brands` passes `className="mb-6"`; the larger heading is an intentional change and the search form below **does move down; the old position is not preserved**. Expected shift from the class values (line boxes: old h1 `text-2xl` 32 px, old description `mt-1 text-sm` 4 + 20 px; new h1 `text-3xl` 36 px below 640 px and `sm:text-4xl` 40 px from 640 px, new description `mt-2 text-base` 8 + 24 px; the `mb-6` is unchanged): **`/brands` +12 px below 640 px and +16 px from 640 px; `/products` (no description) +4 px below 640 px and +8 px from 640 px**, for titles that fit on one line. Task 5 measures the form's `getBoundingClientRect().top` on the old build (`main`, before the PR) and on the new build at 390 and 1440 px and reports the real numbers; they must match the expected shift within 1 px, and the evidence states the shift as intentional):

```tsx
export function PageHeading({ title, description, align = "start", className }: PageHeadingProps) {
  return (
    <header className={cn("min-w-0", align === "center" && "text-center", className)}>
      <h1 className="min-w-0 text-3xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-base text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
      ) : null}
    </header>
  )
}
```

- [ ] **Step 4: Run** the new test and `tests/storefront/products-page.test.tsx`. Expect PASS.
- [ ] **Step 5: Commit.**

### Task 2: BrandCard and the `/brands` page

**Files:**

- Create: `apps/web/src/components/brand-card.tsx`, `apps/web/tests/components/brand-card.test.tsx`, `apps/web/tests/storefront/brands-page.test.tsx`
- Modify: `apps/web/src/app/brands/page.tsx`

**Interfaces:**

- Consumes: `PageHeading`, `FilterPills`, `FilterPill` (R4), shared `Badge`.
- Produces:

```ts
export interface BrandCardProps {
  href: string
  name: string
  excerpt?: string | null
  categories?: string[] // names, any length
  productCount: number
}
export function BrandCard(props: BrandCardProps): JSX.Element // the <Link> tile; the page keeps its own <li>
```

- [ ] **Step 1: Write the failing tests.**
  - `brand-card.test.tsx`: one `<a href>` wraps the whole tile; link `group block h-full min-w-0 rounded-bento` plus the focus ring classes (`focus-visible:ring-2 focus-visible:ring-ring`); the first child holds `h-full overflow-hidden rounded-bento border border-border bg-card shadow-sm hover:shadow-md` (so the clip is inside the ring); the avatar is `aria-hidden`, `bg-tint text-primary-text`, `rounded-full`, shows the upper-cased first letter (a name starting with an emoji or a space-trimmed name still shows a character; an empty name shows nothing and does not throw); name has `font-semibold text-foreground group-hover:text-primary [overflow-wrap:anywhere]`; excerpt has `line-clamp-3 [overflow-wrap:anywhere]` and is absent for null, undefined and `""`; categories render one `Badge` each inside a wrapping container (`flex flex-wrap`), and each badge has `max-w-full whitespace-normal [overflow-wrap:anywhere]`; no category container when the list is empty; count text is "0 products", "1 product", "2 products".
  - `brands-page.test.tsx` (mock `@/app/brands/queries` like `filters.test.tsx`): heading text "Brands" with the description "Discover sellers on BOMY"; pills nav labelled "Filter by category" lists All then each category, no `aside`; All current without a category; the chosen category the only current pill; an unknown id leaves none current; links keep `q` and All drops the category; each brand renders a `BrandCard` link to `/brands/<slug>`; empty state keeps "No brands found."; pagination tests in `filters.test.tsx` stay green and unedited.
- [ ] **Step 2: Run** the two tests — expect FAIL.
- [ ] **Step 3: Implement.** Page: `PageHeading` (title "Brands", description "Discover sellers on BOMY"), search form unchanged, then (D1 = a) `FilterPills label="Filter by category"` only when `storeCategories.length > 0` (as the sidebar was), then the count line and a `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` of `<li className="min-w-0"><BrandCard … /></li>`. Card body `p-5`; header row `flex items-start justify-between gap-3` holding the avatar (`flex size-12 shrink-0 items-center justify-center rounded-full bg-tint text-lg font-bold text-primary-text`) and the badge container (`flex min-w-0 flex-wrap justify-end gap-1`); name `mt-3`; excerpt `mt-1`; count `mt-3 text-xs text-muted-foreground`.
- [ ] **Step 4: Run** `pnpm --filter @bomy/web exec vitest run tests/components tests/storefront tests/filters` — expect PASS.
- [ ] **Step 5: Commit.**

### Task 3: Store page `/brands/[slug]`

**Files:**

- Modify: `apps/web/src/app/brands/[slug]/page.tsx`, `apps/web/tests/storefront/brand-store-page.test.tsx` (extend, keep the R4 tests)

**Interfaces:**

- Consumes: `PageHeading` (`align="center"`).

- [ ] **Step 1: Write the failing tests** (same mocks as the existing file; add stores with and without `bodyHtml` and `videoId`): the h1 is the shared heading (class `sm:text-4xl`) and centred; when the story exists the top grid is `grid grid-cols-1 gap-8 md:grid-cols-2` and **both children have `min-w-0`**; with `bodyHtml` the story renders in a panel `rounded-bento border border-border bg-card p-6` (D3 = a) with an "Our Story" h2 and a wrapper that has `min-w-0 [overflow-wrap:anywhere]` and `[&_img]:h-auto [&_img]:max-w-full` (the shared `BodyRenderer` is not edited); with **no `bodyHtml` the story column is not rendered at all**: the top grid has exactly one child, it is not a two-column grid (no `md:grid-cols-2` on the wrapper) and the Subscribe, video and avatar column spans the full row (`col-span-full` or a single-column wrapper; pin the class that ships); with `bodyHtml` the grid is `grid grid-cols-1 gap-8 md:grid-cols-2` with both children `min-w-0`; the rendered widths are checked in the browser (Task 5), not only by class; the empty state "No products yet." uses `rounded-bento border border-dashed`; the Subscribe button, video embed and avatar row keep their conditions (avatars only for a signed-in visitor, so `getBrandSubscriberAvatars` is not called for an anonymous visitor); every `<h2>` section title keeps R4's wrap classes. Seen failing on the current markup.
- [ ] **Step 2: Run** `pnpm --filter @bomy/web exec vitest run tests/storefront/brand-store-page.test.tsx` — expect FAIL on the new assertions only.
- [ ] **Step 3: Implement** markup and classes only. Render the top grid as a two-column grid only when `store.bodyHtml` is present; otherwise render the right-hand content alone in a single full-width wrapper (no empty first column, no `gap-8` space).
- [ ] **Step 4: Run** the file and `tests/storefront` — expect PASS.
- [ ] **Step 5: Commit.**

### Task 4: Store products page `/brands/[slug]/products`

**Files:**

- Modify: `apps/web/src/app/brands/[slug]/products/page.tsx`, `apps/web/tests/storefront/store-products-page.test.tsx`

- [ ] **Step 1: Write the failing tests:** the header row is `flex flex-wrap items-center justify-between gap-x-4 gap-y-2` holding the shared `PageHeading` (the store name, wrap rule) and the "Back to storefront" link (`/brands/<slug>`); the empty state keeps its words "No products found in this category." and moves to `rounded-bento`; "updated by the swap" token lists change only where listed in the PR; the existing R4 tests (border inside the link, hover colour, placeholder) pass unedited.
- [ ] **Step 2: Run** — expect FAIL on the new assertions only.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `tests/storefront` — expect PASS.
- [ ] **Step 5: Commit.**

### Task 5: Browser proof with long-token fixtures

**Files:**

- Create (gitignored): `.andy/r5fx-fixtures.sql`, `.andy/r5fx-fixtures-cleanup.sql`, `.andy/r5fx-fixtures-count.sql`

- [ ] **Step 0: Fixtures (local dev DB, run as the table owner: `docker exec -i bomy_postgres psql -U bomy -d bomy < <file>`; marker `r5fx`).** One user `r5fx-seller@test.bomy`; store categories and assignments through the existing tables (check the exact table names with `\dt` and the columns with `\d` first; record them in the evidence); **21 ordinary active store categories** (`store_categories`, names "R5 SC 01" to "R5 SC 21") plus **one 60-character unbroken name**, so the `/brands` pill tray has 22 fixture pills plus All (plus any real ones); the long-name brand is assigned **13** of them (12 ordinary plus the long one) through `store_category_assignments`; **one separate product category** `r5fx-cat-view` in the `categories` table (a different table from `store_categories`) holds the 17 products and drives the "View all" route. Check the exact columns with `\d` first and record them in the evidence. Stores (all `active`, slugs `r5fx-…`), each owned by the one user (`stores_owner_idx` is not unique):
  1. **long-name**: 80-character unbroken name, 160-character unbroken excerpt (the DB check rejects more), 13 store categories assigned, `bodyHtml` containing: a paragraph with a 150-character unbroken token, a `<table>` of 12 columns with 20-character cell text (wider than any column), a `https://` link with a 120-character unbroken label, an `https://` `<img src="…404…" width="2000" height="600" alt="wide fixture">` (explicit dimensions, so the box has a size even though the file never loads), a normal paragraph; 17 products in the product category `r5fx-cat-view` (so the section exceeds the 8-item preview and "View all" shows, linking to `?category=r5fx-cat-view`) plus 3 uncategorised products.
  2. **bare**: normal name, no excerpt, no categories, no `bodyHtml`, no video, **0 products**.
  3. **single**: normal name, short excerpt, 1 category, **1 product**.
  4. **normal**: a normal brand with a normal excerpt (two lines) so the clamp and a card of normal height can be compared.
     Cleanup deletes in dependency order (products, `store_category_assignments`, stores, `store_categories`, product `categories`, user) by marker. The count script prints a row for **every** fixture table (users, stores, products, `store_categories`, `store_category_assignments`, product `categories`); record the counts before, after insert and after cleanup (all must be 0 after cleanup, and the pre-existing rows in those tables must be unchanged: count them first). `bomy-check` is run at the end and reported honestly (the six fixture tables return to baseline; the DB may still differ from the last export for other reasons).
- [ ] **Step 1: Browser, production build, light and dark, 320 / 390 / 768 / 1024 / 1440 px.** Pages (the **bare** store has no story, so it proves the full-row layout: at 1440 px the Subscribe column's right edge minus its left edge must equal the content width of `main` within 1 px, and at 768 px and up it must be wider than half of it; the **long-name** store proves the two-column layout with both columns the same width): `/brands`, `/brands?q=<term>`, `/brands?category=<id>`, `/brands/r5fx-long-name`, `/brands/r5fx-bare`, `/brands/r5fx-single`, `/brands/r5fx-long-name/products`, `/brands/r5fx-long-name/products?category=<slug>`, `/products` (heading only, D2). For each view record: `document.documentElement.scrollWidth <= innerWidth`; every `a` card and heading inside the viewport; the h1 text-range right edge; the card excerpt line count (3 at most); the story **table's own scroll container** (the `div.overflow-x-auto` around it): `scrollWidth > clientWidth` (it scrolls) while its `getBoundingClientRect().right` stays within the story column and the document does not scroll; the 2000 x 600 `<img>` is no wider than its column and keeps its 10:3 box (`height` follows the width).
- [ ] **Step 2: Review Focus 5, 6 and 7:** the bare, single and normal brands show correct grammar and no empty gaps ("0 products", "1 product"); the pill tray at 320 px with **23 fixture pills (All plus the 22 fixture store categories, one of them the 60-character name; the 13 assigned to the long-name brand are a property of that card, not extra pills)** plus any real store categories, and the 60-character pill (box right, text right and page scroll width all within the viewport; every pill at least 44 px tall); real Tab through search, Clear, pills, cards and pagination with a visible, unclipped ring in both themes; `q` kept on every pill link.
- [ ] **Step 3: Contrast.** Alpha-composited text audit of every view above in both themes (0 nodes below 4.5:1), including text on `bg-tint` (avatars), badges, pills and the story panel.
- [ ] **Step 4: Remove the fixtures** and record that every count is back to 0 and that the **six fixture tables** (users, stores, products, `store_categories`, `store_category_assignments`, product `categories`) match the baseline counts taken before the fixtures.

### Task 6: Gates, docs, PR body

**Files:**

- Modify: `scripts/ui-audit/exceptions.json` (if needed), `docs/design-system/README.md`
- Create: `docs/superpowers/plans/2026-10-20-soft-red-r5a-evidence.md`, `.andy/soft-red-r5a-pr-body.md`

- [ ] **Step 1: Gates.** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run` (unchanged counts), `pnpm ui:audit --allow-deferred`, `pnpm ui:audit:test`, `pnpm build`.
- [ ] **Step 2: Docs.** Add `PageHeading` and `BrandCard` rows to the R4/R5 section of `docs/design-system/README.md`. Write the evidence file and PR body with verified claims only, the fixtures and their zero-count proof, the not-evaluated list (real seller HTML beyond the fixtures, Safari, Firefox, touch, the two `DATABASE_URL` test files, anything skipped), and the PR footer.
- [ ] **Step 3: Commit** docs with explicit paths. **Stop. Do not push.** Bob reviews the evidence and PR body first.

---

## Self-review

- **Spec coverage:** R5a routes `/brands`, `/brands/[slug]`, `/brands/[slug]/products` (Tasks 2 to 4); type scale in one place (Task 1); `rounded-bento` and blush tiles (Tasks 2 to 4); the R4 long-token finding and the rest of the brand surfaces (Review Focus 1 to 4, Task 5); no logic or query change (Global Constraints).
- **Placeholders:** none; Task 5 names the one thing to look up first (the exact store-category table and column names) and where to record it.
- **Type consistency:** `BrandCardProps` fields match the `getBrands` row (`name`, `slug`, `excerpt`, `productCount`, `categories`); `PageHeading` props are used identically in Tasks 1 to 4.
- **Out of scope (parked):** `/brands/[slug]/subscribe` and `/success` (D5; R5c), product detail and `BodyRenderer` (R5b), cart, checkout, auth (R5c), membership, legal, info and error pages (R5d), motion (R6), the home page and its copy (R3, waiting for approved copy).
