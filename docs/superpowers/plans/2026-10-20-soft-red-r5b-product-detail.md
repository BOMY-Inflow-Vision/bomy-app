# Soft-red R5b: Product detail page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/products/[storeSlug]/[productSlug]` the soft-red look (page-heading scale, bento radius, blush image tile, pill variant chips, white details panel) and make every seller-supplied string on it safe against long unbroken text, with no logic, query or cart change.

**Architecture:** Markup and class changes in the three existing files of the route (`page.tsx`, `variant-picker.tsx`, `product-image-gallery.tsx`). Reuse R5a's `PageHeading` and R4's tokens (`bg-tint`, `rounded-bento`, `tracking-eyebrow`). No new component. `BodyRenderer`, `@bomy/ui`, `apps/admin`, queries and actions are not touched.

**Tech Stack:** Next 15.5, React 19, Tailwind 3.4, Vitest 2.1.9 (jsdom per file), Playwright MCP.

**Spec:** `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R5b line: "spacing, type, tiles"; R5 rule: "Type scale, spacing and `rounded-bento` only. No logic."), R4 `2026-10-20-soft-red-r4-product-card-pills-tint.md` and R5a `2026-10-20-soft-red-r5a-brand-pages.md` (components, fixture and evidence style reused).

## What the page is today (read 2026-10-20)

- `page.tsx` (108 lines, server component): breadcrumb `<nav>` (no `aria-label`, no wrap), `max-w-5xl`, `article.grid.md:grid-cols-2` with **no `min-w-0` on either column**, `h1.text-2xl` with no wrap rule, description `<p text-sm>`, then `VariantPicker`; below, "Product Details" `h2` and `div.prose.max-w-3xl` around `BodyRenderer` (no break rule on the wrapper).
- `variant-picker.tsx` (client): variant buttons `rounded-lg border px-3 py-1.5` (about 32 px tall, below the 44 px target R4 set for pills), no wrap rule on the label, no `aria-pressed`; price `text-2xl text-primary`; stock text `text-success` / `text-destructive`; `Button size="lg"` for Add to cart.
- `product-image-gallery.tsx` (client): main image `aspect-square rounded-xl bg-muted`, no-image fallback is the **📦 emoji** on `bg-muted`; thumbnails 64 px with a ring.
- Existing tests touching the route: only `tests/products/product-metadata.test.ts` (`generateMetadata`). **No test renders the page, the picker or the gallery**, so Task 1 pins today's behaviour first.
- Suspected weaknesses (to be proved or disproved by the baseline in Task 1, not assumed): a long unbroken product name overflows the breadcrumb and the h1 at 320 px; a long variant name overflows its button; a long description or story token widens the column; variant buttons are shorter than 44 px.

## Global Constraints

- **Real data only.** Only stored fields: name, description, store, variants (name, price, stock, fulfilment mode), images, body. No ratings, reviews, "bestseller", "only N left" urgency or sold counts. "N in stock" stays because it is the stored stock count.
- No change to queries, actions, routes, links, metadata (`generateMetadata`), cart behaviour, toast text, `addItem` payload, add-to-cart enable rule (`stockCount > 0`), special-order labels, zoom behaviour or arrow/thumbnail behaviour. `checkout_enabled` stays false.
- `packages/ui`, `apps/admin`, `BodyRenderer` (shared; rich-text rules stay) and `PageHeading` are not edited. The shared `Button` and `Badge` do not change.
- Palette as shipped: soft red, near-white ground, blush `--tint` for the image tile only. Every colour pair tested alpha-composited, text at least 4.5:1, light and dark (disabled controls are exempt by WCAG but are reported).
- No new motion (R6 owns motion). No new queries, so no "more from this brand" row (needs a decision and a query; listed as a follow-up).
- Prettier, `--max-warnings 0` lint, `pnpm ui:audit --allow-deferred` exit 0 (ledger any new arbitrary value, one entry per match), `ui:audit:test` 17/17.
- Commits use explicit paths and carry the Claude Co-Authored-By trailer; check `git log` after each commit (a failing hook leaves HEAD unchanged). `products/loading.tsx` (untracked) is moved aside for builds and restored. Standalone run: `AUTH_TRUST_HOST=true PORT=3000 HOSTNAME=localhost node --env-file=/Users/charlie/Documents/Projects/BOMY/app/apps/web/.env.local server.js` from `apps/web/.next/standalone/apps/web`.
- Report DB-env-limited tests as "not evaluated". Browser fixtures run as the table owner (no `withAdmin` audit rows) and are removed with zero-count proof for **every** fixture table: users, stores, products, product_variants, product_images, and categories (if used). Whole-table baselines are recorded before the insert.

## Keyboard focus styles (specified here; Bob's review 2026-10-20)

Today the variant chips and the gallery thumbnails are raw `<button>` elements with no focus style of their own, so they rely on the browser default and do not show the planned ring. R5b adds, and tests pin, these exact classes:

- **Variant chip:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` (the same ring family as the R4 pills and the cards). The selected chip is `bg-foreground text-background`, so the offset gap keeps the ring visible against it.
- **Gallery thumbnail:** keeps `ring-2` as the selected marker (`ring-primary` when selected, `ring-transparent` otherwise) and adds `focus-visible:outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. A focused thumbnail therefore shows the focus colour with a 2 px gap; the selected state is also exposed as `aria-current="true"` so it is not carried by ring colour alone. The strip padding grows from `p-1` to `p-1.5` so the 4 px ring-plus-offset spread is not clipped by `overflow-x-auto`.
- **Gallery arrows:** use the shared `Button`, which already carries its own focus ring; the Tab check below confirms it, and the plan changes nothing there.
- **Tests (jsdom, class pins):** each of the above class sets is asserted on the rendered element, including a selected-and-focused thumbnail that still has `aria-current="true"`.
- **Real Tab check (Task 5, light and dark, 1440 and 390 px):** press Tab through the page and, at every chip, thumbnail and arrow, read the computed `box-shadow` of the focused element (non-empty ring colour), confirm `:focus-visible` matches, and confirm the ring box sits inside the viewport and inside every clipping ancestor (`overflow` ancestors checked). Report the contrast of the ring colour against the ground in both themes (at least 3:1).

## Review Focus

1. **Long unbroken product name** (80 characters, no spaces) in the breadcrumb, the h1 and the browser title. Expect: wraps inside its box; page scroll width never exceeds the viewport at 320 px.
2. **Long unbroken store name** (80 characters) in the eyebrow link and the breadcrumb. Expect the same.
3. **Long description** (about 400 characters with one 150-character token). Expect: wraps in the column; the image column is not pushed.
4. **Many and odd variants:** 12 variants, one name 60 characters unbroken, one out of stock (disabled), one back-order, two pre-orders (14 days and 1 day), exactly 1 variant (no chooser), 0 variants ("No variants available."). Expect: chips wrap inside 320 px and are at least 44 px tall; the selected chip is clear without colour alone (filled plus `aria-pressed`); disabled chip is readable; **every chip shows a visible focus ring on Tab**; price and status follow the selected variant.
5. **Gallery states:** 0 images (fallback), 1 image (no arrows, no thumbnails), 7 images (thumbnail strip scrolls inside its box, arrows wrap around), a broken image URL. Expect: no page scroll; fallback is the Package icon on blush at the same square size; keyboard reaches arrows and thumbnails, **each with a visible focus ring that the strip does not clip**.
6. **Story HTML** (`bodyHtml`): 150-character token, 12-column table, 120-character link, 2000x600 image. Expect: no page scroll; the table scrolls inside its own box (R5a showed it will, since the container is narrower than the table); the token breaks; the image stays inside its column. No `[overflow-wrap:anywhere]` on rich HTML (it breaks table headers one letter per line; R5a lesson, use `break-words`).
7. **Product with no description and no body:** no empty element or gap; no "Product Details" heading.
8. **Add to cart end to end** (signed out is enough; the cart is browser storage): adds the selected variant, toast appears, the button shows "Added to cart" for 2 s, nav cart count rises. Unchanged from today; proves no behaviour drift.

---

## Decisions for Charlie (recommended option first; answer like "D1a, D2a…")

- **D1 — Product title.** (a) Reuse `PageHeading` for the product `h1` (same 3xl/4xl scale and wrap rule as every other page); the description moves into it. (b) Keep a smaller own `h1` (`text-2xl`) because the title sits in a half-width column. **Pick a**: one scale across the site, and `PageHeading` already solves the wrap. Cost: the title is larger than today on desktop (4xl in a 480 px column wraps to 2–3 lines for long names).
- **D2 — Variant chips.** (a) Pill look from R4: `rounded-full`, at least 44 px tall, selected = filled ink (`bg-foreground text-background`) plus `aria-pressed`. (b) Keep today's `rounded-lg` outline look and only add wrap and height. **Pick a**: matches the `/products` and `/brands` pills.
- **D3 — "Product Details" body.** (a) White bento panel (`bg-card`, border, `rounded-bento`, `max-w-3xl`) like R5a's "Our Story". (b) Plain text on the ground as today. **Pick a**: same pattern as the brand page; the panel also gives the scrolling table a visible box.
- **D4 — Add to cart on phones.** (a) Full width below `sm`, auto width from `sm` (layout only). (b) Unchanged. **Pick a**: a thumb-sized target; no sticky bar (that is motion/behaviour, not R5b).
- **D5 — No-image fallback.** (a) Package icon on blush at the same square size (same fallback as `CoverImage`). (b) Keep the 📦 emoji. **Pick a**: the emoji ignores the dark theme and the new tile colour. A broken (non-empty) image URL stays as today (blank tile); a failed-image fallback is a behaviour change and is listed as a follow-up.

---

## File Structure

| File                                                                                                 | Responsibility                                                                                               | Task |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---- |
| `apps/web/tests/storefront/product-detail-page.test.tsx` (new)                                       | page structure, breadcrumb, heading, panel, empty states (mocks the two client parts and `getProductBySlug`) | 1, 2 |
| `apps/web/tests/storefront/variant-picker.test.tsx` (new)                                            | picker behaviour pinned on the old code, then chip look                                                      | 1, 3 |
| `apps/web/tests/storefront/product-image-gallery.test.tsx` (new)                                     | gallery behaviour pinned on the old code, then fallback and radii                                            | 1, 4 |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`                                       | breadcrumb, `PageHeading`, columns `min-w-0`, details panel                                                  | 2    |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/variant-picker.tsx`                             | chips, price, status, button width                                                                           | 3    |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/product-image-gallery.tsx`                      | tile radius and colour, Package fallback                                                                     | 4    |
| `.andy/r5bfx-fixtures.sql`, `.andy/r5bfx-fixtures-cleanup.sql`, `.andy/r5bfx-count.sql` (gitignored) | long-token browser fixtures                                                                                  | 1    |
| `docs/design-system/README.md` (only if a row changes), evidence file, PR body                       | docs                                                                                                         | 5    |

---

### Task 1: Fixtures, old-code baseline and behaviour pins

**Files:** create the three `.andy/r5bfx-*.sql` files and the three test files above; no `src` change.

- [ ] **Step 1: Record whole-table baselines** for users, stores, products, product_variants, product_images (counts via `docker exec -i bomy_postgres psql -U bomy -d bomy`). Write them into the evidence file draft.
- [ ] **Step 2: Write fixtures** (marker `r5bfx`, store `r5bfx-store` owned by a new user `r5bfx-seller@test.bomy`, a second store `r5bfx-long-store` with an 80-character name). Products, all `active`:
  - `r5bfx-long` — 80-character unbroken name; 400-character description with a 150-character token; 12 variants (one 60-character unbroken name, one stock 0, one `backorder`, one `preorder` with 14 lead days, one `preorder` with 1 lead day to show the singular wording; the database forbids a pre-order without positive lead days — `product_variants_preorder_days_chk` — so a fixture cannot hold one); 7 images; story HTML (150-character token, 12-column table, 120-character link, 2000x600 image) — store is `r5bfx-long-store`.
  - `r5bfx-plain` — normal name, 1 variant, 1 image, no description, no body.
  - `r5bfx-empty` — normal name, 0 variants, 0 images, description only.
  - `r5bfx-broken` — 2 variants, 1 image whose URL 404s.
    Image URLs: `data:image/svg+xml,…` coloured squares so they load offline (check once that the page's CSP allows them; if not, serve the same SVGs from the dev origin). `r5bfx-cleanup.sql` deletes by marker in child-first order; `r5bfx-count.sql` prints the whole-table counts and the fixture counts.
- [ ] **Step 3: Insert fixtures; build and run the OLD code** (production standalone). Measure at 1440 / 1024 / 768 / 390 / 320 px on `r5bfx-long`: page `scrollWidth` vs `innerWidth`, breadcrumb right edge, h1 right edge, each variant chip height and right edge, description right edge, story table scroll box (`scrollWidth` / `clientWidth`), image edge. Record which suspected weaknesses are real. These numbers go in the evidence file as "before".
- [ ] **Step 4: Write behaviour-pin tests against the old code and run them (they must pass on the old code):**
  - picker: first variant selected by default; a `preorder` variant with `preorderLeadDays` null renders "Pre-order" with no days (the database cannot store this, so it is covered here with props, not in the browser) and one with 1 day renders "ships in 1 days" exactly as today (wording unchanged, pinned as is); clicking a chip changes the price and status; out-of-stock normal variant is disabled; back-order and pre-order variants stay selectable and show their label; Add to cart is disabled at stock 0 and enabled above 0; clicking calls `addItem` with the exact item (variant id, product id, store fields, names, price, cover URL), calls `toast.success("<name> added to cart")` and shows "Added to cart"; 1 variant shows no chooser; 0 variants shows "No variants available.".
  - gallery: 0 images shows the fallback; 1 image shows no arrows or thumbnails; 3 images: next/previous wrap around, thumbnails select, `aria-label`s are "Previous image", "Next image", "View image N"; mouse move over the main image switches to the zoom layer, leave resets.
  - page (mocking `getProductBySlug`, the picker and the gallery): breadcrumb order and hrefs; h1 is the product name; description shown or absent; "Product Details" section only when `bodyHtml` is set; `notFound` for a missing product.
- [ ] **Step 5: Commit** tests only: `git add apps/web/tests/storefront/product-detail-page.test.tsx apps/web/tests/storefront/variant-picker.test.tsx apps/web/tests/storefront/product-image-gallery.test.tsx`.

**Expected:** all new tests pass on the old code (they pin behaviour, not looks). The baseline shows which weaknesses are real.

### Task 2: Page — breadcrumb, heading, columns, details panel (`page.tsx`)

**Interfaces:** consumes `PageHeading` (`title`, `description`, `className`). Produces nothing new.

- [ ] **Step 1: Write failing tests** in `product-detail-page.test.tsx`: breadcrumb is `<nav aria-label="Breadcrumb">` with an ordered list, wraps (`flex-wrap`, `min-w-0`), the current item has `aria-current="page"` and `[overflow-wrap:anywhere]`; the h1 is rendered by `PageHeading` (has `sm:text-4xl`) and the description appears as the heading's description paragraph; both grid columns have `min-w-0`; the eyebrow store link uses `font-mono uppercase tracking-eyebrow` and `[overflow-wrap:anywhere]`; with `bodyHtml` the section holds a panel (`rounded-bento border border-border bg-card`) of `max-w-3xl` containing the prose wrapper with `break-words` and **not** `[overflow-wrap:anywhere]`, `[&_img]:h-auto`, `[&_img]:max-w-full`; with no `bodyHtml` there is no section and no "Product Details" text.
- [ ] **Step 2: Run them; confirm they fail** for the stated reasons.
- [ ] **Step 3: Implement.** Breadcrumb becomes `<nav aria-label="Breadcrumb" className="mb-6"><ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">…` with `aria-hidden` separators; link texts and the current item break anywhere. Title block: eyebrow store link (same mono eyebrow classes as `ProductCard`), then `<PageHeading title={product.name} description={product.description} />` (D1a). `article` keeps `grid gap-8 md:grid-cols-2`; each column gets `min-w-0`. Details section: `max-w-3xl rounded-bento border border-border bg-card p-6` (D3a) around the existing `h2` and `div.prose prose-sm`→ keep `prose` size as today, add `min-w-0 max-w-none break-words dark:prose-invert [&_img]:h-auto [&_img]:max-w-full`.
- [ ] **Step 4: Run the page tests and `tests/products`; confirm pass.** Commit with explicit paths; check `git log`.

### Task 3: Variant picker (`variant-picker.tsx`)

- [ ] **Step 1: Write failing tests** in `variant-picker.test.tsx`: chooser is `role="group"` labelled "Choose variant"; each chip is `rounded-full min-h-11`, has the chip focus classes from "Keyboard focus styles" and `max-w-full whitespace-normal text-left [overflow-wrap:anywhere]`, and `aria-pressed` true only on the selected one; selected = `bg-foreground text-background`, others `border-input`; disabled out-of-stock chip keeps `line-through` and stays `disabled`; price and status paragraphs are `min-w-0` and the price breaks anywhere; Add to cart has `w-full sm:w-auto` (D4a). All Task 1 behaviour pins still pass.
- [ ] **Step 2: Run; confirm the new assertions fail, the pins pass.**
- [ ] **Step 3: Implement** the class changes only. Logic, handlers, texts and the enable rule are not touched.
- [ ] **Step 4: Run all picker tests; confirm pass.** Commit with explicit paths; check `git log`.

### Task 4: Gallery (`product-image-gallery.tsx`)

- [ ] **Step 1: Write failing tests** in `product-image-gallery.test.tsx`: fallback shows a Package icon (`aria-hidden`) on `bg-tint` with `rounded-bento`, same `aspect-square`, and no emoji text; main tile is `rounded-bento` on `bg-tint` (D5a); thumbnails stay 64 px with `rounded-lg`, carry the thumbnail focus classes and `aria-current` on the selected one (also when it is the focused one), and the strip is `overflow-x-auto p-1.5`; arrows keep their `aria-label`s and positions. Task 1 behaviour pins still pass.
- [ ] **Step 2: Run; confirm new assertions fail, pins pass.**
- [ ] **Step 3: Implement** the radius, background and fallback (import `Package` from `lucide-react`, as `CoverImage` does). Add the specified focus classes and `aria-current` to the thumbnails, and change the strip padding to `p-1.5`. Preserve thumbnail size and selection handlers, zoom, arrows and `img` sizes.
- [ ] **Step 4: Run all gallery tests; confirm pass.** Commit with explicit paths; check `git log`.

### Task 5: Browser proof, gates and docs

- [ ] **Step 1:** move `products/loading.tsx` aside, `pnpm build`, restore it, copy `.next/static` into the standalone folder, start the production server. Re-insert the fixtures if removed.
- [ ] **Step 2: Re-measure exactly what Task 1 measured** at 1440 / 1024 / 768 / 390 / 320 px (light) and compare with the baseline: no page scroll; breadcrumb, h1, description, chips and story inside their boxes; chips at least 44 px; thumbnail strip scrolls in its own box; story table scrolls in its box (report scrollW/clientW per width, no fit claims without a measurement); image ratio inside the column; the no-image, broken-image, 1-image, 0-variant and no-body products behave as in Review Focus 5, 4 and 7.
- [ ] **Step 3: Contrast** (alpha-composited, in-page JS) for `r5bfx-long`, `r5bfx-plain`, `r5bfx-empty` in light and in dark (set `localStorage.theme` before navigation in a fresh context and confirm `html.dark` per view): all text at least 4.5:1; report the disabled chip separately.
- [ ] **Step 4: Keyboard** (real Tab presses, light and dark, 1440 and 390 px): record the actual order (the gallery is first in the DOM, then the store link, chips, Add to cart); at each chip, thumbnail and arrow capture the computed `box-shadow`, `:focus-visible` match, and that the ring is not clipped by any `overflow` ancestor; report ring-to-ground contrast per theme as set out in "Keyboard focus styles". **Add to cart end to end** (Review Focus 8) with a screenshot of the toast.
- [ ] **Step 5: Remove the fixtures**, run `r5bfx-count.sql`, record zero fixture counts and the whole-table counts equal to the Step 1 baselines in Task 1; stop the server; run `bomy-check` and report honestly.
- [ ] **Step 6: Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run` (the two `DATABASE_URL` files are "not evaluated"), `pnpm --filter @bomy/admin test --run`, `pnpm ui:audit --allow-deferred` (exit 0), `pnpm ui:audit:test` (17/17). No DB-gated suite is run (no query changes): list as not evaluated.
- [ ] **Step 7: Docs.** Evidence file `docs/superpowers/plans/2026-10-20-soft-red-r5b-evidence.md` (verified claims only; before/after table; fixtures and zero-count proof) and `.andy/soft-red-r5b-pr-body.md` (ends with the Claude Code footer). Commit docs with explicit paths. **Stop before push** for Bob's review.

---

## Self-review

- **Spec coverage:** spacing, type scale and tiles for the product page (R5b line) are Tasks 2–4; no logic changes; `BodyRenderer` untouched; long-token safety is Review Focus 1–3 and 6.
- **Placeholders:** none; fixture values, class names and test assertions are listed.
- **Consistency:** `PageHeading` signature matches R5a (`title`, `description?: string | null | undefined`, `align`, `className`). The `exactOptionalPropertyTypes` rule is respected because `product.description` is `string | null`.
- **Risks:** (1) D1a makes the product title larger on desktop; Bob and Charlie should look at the 1440 px screenshot. (2) The new page test mocks the two client parts, so their behaviour is covered only by their own tests. (3) Data-URL SVG images may be blocked by a CSP; Task 1 Step 2 has the fallback. (4) Real seller HTML beyond the fixture, Safari, Firefox and touch zoom are not evaluated. (5) A failed-image fallback in the gallery and a "more from this brand" row are follow-ups, not part of R5b.
