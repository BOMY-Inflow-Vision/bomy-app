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
- Report DB-env-limited tests as "not evaluated". Browser fixtures run as the table owner (no `withAdmin` audit rows) and are removed with zero-count proof.

## Review Focus

1. **Long unbroken store name** (80 characters, no spaces) in the h1 of all three pages, in the `/brands` card, and next to the "Back to storefront" link. Expect: wraps inside its box; page scroll width never exceeds the viewport at 320 px.
2. **Long unbroken excerpt** (200 characters) and an excerpt of normal length. Expect: the card clamps to 3 lines and stays inside the card.
3. **Many and long categories on a card** (12 categories, one 60 characters unbroken). Expect: badges wrap inside the card; the long badge breaks inside its own box.
4. **Seller story HTML** (`bodyHtml`): a long unbroken token in a paragraph, a very wide table, a long link, a wide image. Expect: no page scroll; the table scrolls inside its own box; the paragraph breaks; the image never exceeds its column. The two-column top grid must not let one column push the other wider.
5. **Empty and odd brands:** no excerpt, no categories, 0 products, exactly 1 product ("1 product"), no `bodyHtml`, no video. Expect: no empty element, no gap, no "0 product" grammar error.
6. **Pill tray on `/brands`:** 20+ store categories, one 60 characters unbroken; search plus category; an unknown category id. Expect: pills wrap inside 320 px and are at least 44 px tall; links keep `q`; no pill current for an unknown id.
7. **Keyboard:** Tab order through search, Clear, pills, brand cards and pagination; the focus ring on a card is not clipped.

---

## Decisions for Charlie (answers change the tasks)

- **D1 `/brands` category filter.** (a, recommend) Replace the sidebar with the same pill tray as `/products` (R4), so the two index pages match. (b) Keep the sidebar and only restyle it.
- **D2 Page headings.** (a, recommend) One `PageHeading` for the three brand pages **and** `/products` (a one-line change there) so the index pages share one scale. (b) Brand pages only; `/products` keeps its current h1 until a later slice.
- **D3 "Our Story" panel on the store page.** (a, recommend) A white bento card (`bg-card`, border), because seller HTML brings its own text colours and was never checked on blush. (b) A blush `--tint` panel; this needs a contrast test on real seller HTML, which we do not have.
- **D4 Brand card excerpt.** (a, recommend) Clamp to 3 lines (today it is unlimited, so one long excerpt makes one tall card in a grid). (b) Show it in full.
- **D5 Scope.** (a, recommend) Leave `/brands/[slug]/subscribe` and `/success` out; they sit on the brand-subscription money path and belong with the cart, checkout and auth slice (R5c). (b) Include them.

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

- [ ] **Step 1: Write the failing tests.** The h1 has `text-3xl font-bold tracking-tight sm:text-4xl text-foreground [overflow-wrap:anywhere]` and `min-w-0`; exactly one h1 renders; no description element when `description` is null, undefined or `""`; the description has `mt-2 text-base text-muted-foreground [overflow-wrap:anywhere]`; `align="center"` adds `text-center` on the header, default has none; `className` merges after the base (`mb-4` appears). If D2 = a: the `/products` page test asserts its h1 is the shared heading (class `sm:text-4xl`) and still reads "Products".
- [ ] **Step 2: Run** `pnpm --filter @bomy/web exec vitest run tests/components/page-heading.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** (server component, `cn` from `@/lib/utils`):

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

- [ ] **Step 1: Write the failing tests** (same mocks as the existing file; add stores with and without `bodyHtml` and `videoId`): the h1 is the shared heading (class `sm:text-4xl`) and centred; the top grid keeps `grid grid-cols-1 gap-8 md:grid-cols-2` and **both children have `min-w-0`**; with `bodyHtml` the story renders in a panel `rounded-bento border border-border bg-card p-6` (D3 = a) with an "Our Story" h2 and a wrapper that has `min-w-0 [overflow-wrap:anywhere]` and `[&_img]:h-auto [&_img]:max-w-full` (the shared `BodyRenderer` is not edited); with no `bodyHtml` no story panel and no empty column gap (the right column still renders Subscribe); the empty state "No products yet." uses `rounded-bento border border-dashed`; the Subscribe button, video embed and avatar row keep their conditions (avatars only for a signed-in visitor, so `getBrandSubscriberAvatars` is not called for an anonymous visitor); every `<h2>` section title keeps R4's wrap classes. Seen failing on the current markup.
- [ ] **Step 2: Run** `pnpm --filter @bomy/web exec vitest run tests/storefront/brand-store-page.test.tsx` — expect FAIL on the new assertions only.
- [ ] **Step 3: Implement** markup and classes only.
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

- [ ] **Step 0: Fixtures (local dev DB, run as the table owner: `docker exec -i bomy_postgres psql -U bomy -d bomy < <file>`; marker `r5fx`).** One user `r5fx-seller@test.bomy`; store categories and assignments through the existing tables (check the exact table names with `\dt` and the columns with `\d` first; record them in the evidence); **12 store categories** (names "R5 SC 01" and so on) plus one 60-character unbroken name. Stores (all `active`, slugs `r5fx-…`), each owned by the one user (`stores_owner_idx` is not unique):
  1. **long-name**: 80-character unbroken name, 200-character unbroken excerpt, all 13 categories assigned, `bodyHtml` containing: a paragraph with a 150-character unbroken token, a `<table>` of 12 columns, a `https://` link with a 120-character unbroken label, an `https://` `<img>` (a 404 URL), a normal paragraph; 17 products in the long category (so "View all" shows) plus 3 uncategorised.
  2. **bare**: normal name, no excerpt, no categories, no `bodyHtml`, no video, **0 products**.
  3. **single**: normal name, short excerpt, 1 category, **1 product**.
  4. **normal**: a normal brand with a normal excerpt (two lines) so the clamp and a card of normal height can be compared.
     Cleanup deletes in dependency order (products, assignments, store categories, stores, user) by marker. Count script prints a row per fixture table; record before, after-insert and after-cleanup counts. `bomy-check` is run at the end and reported honestly (the five fixture tables return to baseline).
- [ ] **Step 1: Browser, production build, light and dark, 320 / 390 / 768 / 1024 / 1440 px.** Pages: `/brands`, `/brands?q=<term>`, `/brands?category=<id>`, `/brands/r5fx-long-name`, `/brands/r5fx-bare`, `/brands/r5fx-single`, `/brands/r5fx-long-name/products`, `/brands/r5fx-long-name/products?category=<slug>`, `/products` (heading only, D2). For each view record: `document.documentElement.scrollWidth <= innerWidth`; every `a` card and heading inside the viewport; the h1 text-range right edge; the card excerpt line count (3 at most); the story table sits in a scroll box and the page does not scroll; the broken `<img>` stays within its column.
- [ ] **Step 2: Review Focus 5, 6 and 7:** the bare, single and normal brands show correct grammar and no empty gaps ("0 products", "1 product"); the pill tray at 320 px with 13 pills and the 60-character pill (box right, text right and page scroll width all within the viewport; every pill at least 44 px tall); real Tab through search, Clear, pills, cards and pagination with a visible, unclipped ring in both themes; `q` kept on every pill link.
- [ ] **Step 3: Contrast.** Alpha-composited text audit of every view above in both themes (0 nodes below 4.5:1), including text on `bg-tint` (avatars), badges, pills and the story panel.
- [ ] **Step 4: Remove the fixtures** and record that every count is back to 0 and the five-table baseline matches.

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
