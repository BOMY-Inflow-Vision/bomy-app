# PR 5d-4 and 5d-5 — `FilterTabs` and `Pagination` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `FilterTabs` and `Pagination` to `@bomy/ui` and move the hand-made filter chips (ledger `man-t13`, `man-t19`, `man-t20`) and the web page links (`man-t14`) onto them, with the same links, the same query strings, the same selection and the same look, plus `aria-current="page"`, a navigation label and a visible focus ring.

**Architecture:** Both are link-based and URL-driven, so there is no client state. `@bomy/ui` has no `next` dependency, so a tab is a `FilterTab` that takes `asChild` (Radix `Slot`, as `Button` does): the call site keeps its own `next/link` (or `<a>`), and `FilterTab` adds the classes and `aria-current`. `FilterTabs` is a labelled `nav` wrapper. `Pagination` renders a labelled `nav` of links from `page`, `totalPages` and a `buildHref(page)` callback, so each page keeps its own URL building byte for byte. It takes the link component as a prop (`linkAs`, default `"a"`) so the web pages pass `next/link`.

**Tech Stack:** React 19, Tailwind 3.4 tokens, `class-variance-authority`, `@radix-ui/react-slot` (already a dependency), Vitest 2.1.9 (jsdom per file). No `user-event` or Testing Library is installed; tests use `react-dom/client`, `act`, `focus()` and `dispatchEvent`.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slices 5d-4 and 5d-5).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d45` from `main` (`8adda46`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Out of scope: the toaster (5d-11, its own review), Cards (5d-2, D3), `man-5a3`, the admin `components/ui/pagination.tsx` (it has Previous/Next and a different look; it is not a ledger entry and stays as it is), the three parked reminders.
- Contrast: text 4.5:1. Report env-limited tests as "not evaluated".
- Query-string behaviour does not change: every `href` produced after the swap is byte-for-byte what the page produced before (including `/products?` for page 1 with no filters).

## Review Focus

- **Hrefs and active state must not change.** Every tab and page link keeps its `href` and today's active state. Missing `status` selects "All". An invalid nonempty `status` leaves every chip inactive on seller products, admin goodie-box, memberships and brand-subscriptions; it selects "All" on seller orders, admin payouts, inquiries and stores. Test each page's actual behavior before and after; add `aria-current="page"` only to a chip that is active.
- **Other query parameters survive.** Pagination keeps `q` and `category`; admin tabs keep `sort`, `q`, `storeId` and reset `page` as `buildHref` already does. Test: hrefs with those params present.
- **Page 1 and ranges.** Page 1 omits `page=`; the brands page collapses to `1 … 4 5 6 … 20`; the products page shows every page number. Test both with `totalPages` 1, 7, 8 and 20 and the current page at the ends and the middle.
- **No ARIA `tab` roles.** These are navigation links, not a tab widget, so no `role="tablist"`/`tab` and no arrow-key roving. Test: no `role="tab"`; every tab is a link in the tab order, in DOM order.
- **Keyboard.** Tab reaches every link in order; Shift+Tab goes back; Enter on a focused link follows its `href`; there is a visible focus ring. Jsdom tests check order, focusability and `aria-current`; the browser step checks Enter, the URL change and the ring with real keys.
- **`<a>` becomes `next/link`.** The admin payouts and seller orders filters were plain `<a>` (full page load). They become `Link` (client navigation). Test: same `href`; browser: the page content and URL update.

## File Structure

- Create `packages/ui/src/components/filter-tabs.tsx` (`FilterTabs`, `FilterTab`) and `packages/ui/src/components/pagination.tsx` (`Pagination`, `pageRange`); add `./filter-tabs` and `./pagination` exports in `packages/ui/package.json`.
- Create tests: `apps/web/tests/components/filter-tabs.test.tsx`, `apps/web/tests/components/pagination.test.tsx`, `apps/web/tests/filters/filters.test.tsx` (web pages), `apps/admin/tests/filters/filters.test.tsx` (admin pages).
- Modify web: `seller/dashboard/products/page.tsx`, `seller/dashboard/orders/page.tsx`, `app/products/page.tsx`, `app/brands/page.tsx`.
- Modify admin: `payouts/page.tsx`, `seller-inquiries/page.tsx`, `stores/page.tsx`, `goodie-box/page.tsx` (two groups), `memberships/page.tsx`, `brand-subscriptions/page.tsx`.
- Modify `scripts/ui-audit/findings.json` (`man-t13`, `man-t14`, `man-t19`, `man-t20`).

## Component design

**`FilterTab`** (`active?: boolean`, `variant`, `asChild?`, all `a` attributes). It sets `aria-current="page"` when `active` and nothing otherwise. Three variants, each exactly today's classes:

| Variant   | Used by                                                               | Base                                         | Active                               | Inactive                                           |
| --------- | --------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| `primary` | seller products                                                       | `rounded-full px-3 py-1 text-xs font-medium` | `bg-primary text-primary-foreground` | `bg-muted text-muted-foreground hover:bg-muted/80` |
| `inverse` | admin payouts, seller orders                                          | `rounded-full px-3 py-1 text-sm`             | `bg-foreground text-background`      | `bg-muted text-muted-foreground`                   |
| `flat`    | admin inquiries, stores, goodie-box, memberships, brand-subscriptions | `rounded px-3 py-1`                          | `bg-accent text-accent-foreground`   | `text-muted-foreground hover:bg-muted`             |

All add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` (a box-shadow, so no size change). `className` merges last (goodie-box quarter links pass `px-2`; the orders and payouts `capitalize` stays on the call site). **D9 decided (Bob and Charlie):** keep all three looks so this PR preserves the current appearance.

**`FilterTabs`**: `<nav aria-label={label} className={cn("flex flex-wrap", className)}>`; the gap and text size stay in `className` at each call site (`gap-2`, `gap-1 text-sm`). **D10 decided (Bob and Charlie):** each filter group becomes a labelled `nav` landmark ("Filter by status", "Filter by quarter") because these links change the page.

**`Pagination`** (`page`, `totalPages`, `buildHref(page)`, `label`, `size` `"md"` (`h-8 w-8`, products) or `"lg"` (`h-11 w-11`, brands), `collapse?: boolean`, `linkAs?`). Returns `null` when `totalPages <= 1`. Links keep `aria-label="Page N"` and `aria-current="page"` on the current one; the current page stays a link (as today). `collapse` uses `pageRange` (moved verbatim from the brands page: all pages up to 7, otherwise `1 … current±1 … last`); products passes `collapse={false}`. Ellipses stay `aria-hidden`. The nav keeps the page's own `aria-label` and `className` (`mt-8 flex justify-center gap-2` vs `gap-1`). Adds the same focus ring. **D11 decided (Bob and Charlie):** keep the current 32 px products links and 44 px brands links through `size`.

---

### Task 1: Baseline tests on today's markup (no source change)

**Files:** Create `apps/web/tests/filters/filters.test.tsx`, `apps/admin/tests/filters/filters.test.tsx`.

**Interfaces:** Produces a helper `links(doc, scope)` returning `[{ text, href, current, tag, classes }]` for the links inside the filter group or pagination `nav` of a page.

- [ ] **Step 1:** Render each real page with its data layer mocked, as in `apps/web/tests/seller-dashboard/status-pills.test.tsx` and `apps/admin/tests/callouts/callouts.test.tsx` (`@/auth` or `requireAdmin`, `next/navigation`, `@bomy/db` through `importOriginal`, the page's queries). Web: seller products and orders, `/products`, `/brands`. Admin: payouts, seller-inquiries, stores, goodie-box, memberships, brand-subscriptions.
- [ ] **Step 2:** Assert for each page, with missing, valid and invalid nonempty `status` and with other params present (`q`, `category`, `sort`, `storeId`, `quarter`): the exact ordered list of `(text, href)`, which chip is active (by class today, including no active chip on the four pages named in Review Focus), the tag (`a` vs link), and the exact class tokens of one active and one inactive tab where an active chip exists. For `/products` and `/brands`: `totalPages` 1 (no nav), 7, 8 and 20 with the current page at 1, middle and last; hrefs including the page-1 forms (`/products?` vs `/brands`); `aria-label`s; `aria-current` on the current page.
- [ ] **Step 3:** Run; expect PASS on unchanged source. Mutation-check one href and one active class, then restore.
- [ ] **Step 4:** If a page cannot be rendered in a fixture without changing source, stop and report; do not edit source to make it testable.
- [ ] **Step 5:** Commit the test files by explicit path: `test(ui): baseline of filter chips and pagination links (5d-4, 5d-5)`.

### Task 2: `FilterTabs` and `FilterTab`

**Files:** Create `packages/ui/src/components/filter-tabs.tsx`, `apps/web/tests/components/filter-tabs.test.tsx`; Modify `packages/ui/package.json`.

**Interfaces:** Produces `FilterTabs`, `FilterTab`, `filterTabVariants`, types `FilterTabProps`.

- [ ] **Step 1:** Write the failing tests: (a) each variant renders its base, active and inactive tokens exactly as in the table; (b) `active` sets `aria-current="page"`, inactive sets no `aria-current`; (c) `asChild` puts the classes and `aria-current` on the child element and keeps its `href`; (d) `FilterTabs` is a `nav` with the given `aria-label` and merges `className`; (e) no `role="tab"` or `tablist` anywhere; (f) jsdom keyboard: three tabs are focusable in DOM order (`focus()` each, `document.activeElement` matches), and the focus ring tokens are present; (g) `className` after the variant (`px-2` replaces `px-3`).
- [ ] **Step 2:** Run; expect FAIL (module missing).
- [ ] **Step 3:** Implement with `cva` and `Slot`, mirroring `button.tsx` and `badge.tsx`.
- [ ] **Step 4:** Run the tests, `pnpm --filter @bomy/ui typecheck`; check the contrast pairs exist in `apps/web/tests/design-tokens/status-pairs.test.ts` for `primary-foreground` on `primary`, `background` on `foreground`, `accent-foreground` on `accent`, and `muted-foreground` on `muted`, `background`, `card` in light and dark; add any missing pair (and the numbers in the commit message). The dark `primary` pair is the separate `man-5a3` decision; if `primary-foreground` on `primary` fails in dark, record it and do not change the token here.
- [ ] **Step 5:** Commit `packages/ui/src/components/filter-tabs.tsx`, `packages/ui/package.json`, the test (and `status-pairs.test.ts` if edited): `feat(ui): FilterTabs, link based and URL driven (5d-4)`.

### Task 3: `Pagination`

**Files:** Create `packages/ui/src/components/pagination.tsx`, `apps/web/tests/components/pagination.test.tsx`; Modify `packages/ui/package.json`.

**Interfaces:** Produces `Pagination`, `pageRange(current, total): (number | "...")[]` (verbatim from `brands/page.tsx`).

- [ ] **Step 1:** Write the failing tests: `pageRange` for totals 1, 7, 8, 20 and every current position (no gaps, always first and last, at most one ellipsis per side); `Pagination` returns nothing for `totalPages` 1; with `collapse={false}` every number renders; the current page has `aria-current="page"` and the others do not; link text, `aria-label="Page N"` and `href` come from `buildHref`; the `nav` has the given label; `size` sets `h-8 w-8` or `h-11 w-11`; the ellipsis has `aria-hidden`; `linkAs` renders that component; jsdom keyboard: links focusable in DOM order and skip the ellipsis.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement. **Step 4:** Run tests and the UI typecheck.
- [ ] **Step 5:** Commit: `feat(ui): Pagination with the shared page range (5d-5)`.

### Task 4: Swap the web pages

**Files:** the four web pages.

- [ ] **Step 1:** Seller products: `FilterTabs label="Filter by status"` with `FilterTab asChild variant="primary" active=...` around the existing `Link`s (same `href`s, same `key`). Seller orders: the same with `variant="inverse"`, and the two `<a>` become `Link` (same `href`). `/products` and `/brands`: replace the hand-made `nav` with `Pagination` (`linkAs={Link}`, the page's existing `buildHref`, its existing `aria-label` and wrapper classes, `size="md"`/`"lg"`, `collapse` false/true); delete the local `pageRange` from the brands page and import it.
- [ ] **Step 2:** Update the Task 1 web tests to the After markup: same `(text, href)` lists and per-page active state (invalid seller-products status still has no active chip), now with `aria-current` only on an active tab, `focus-visible:ring-2` present, and the nav labels. Expected hrefs do not change.
- [ ] **Step 3:** Search the seller-products and seller-orders pages for `rounded-full px-3 py-1`; expect no matches. Search only `apps/web/src/app/products/page.tsx` and `apps/web/src/app/brands/page.tsx` for `pageRange(`, the inline per-page `Page N` aria-label loop, and `rounded-control text-sm`; expect no matches. Other `h-8 w-8` elements elsewhere are unrelated. Run web typecheck and tests; `git diff` check that no query, `href`, text or handler changed. Commit: `refactor(ui): seller filters and web pagination use FilterTabs and Pagination (5d-4, 5d-5)`.

### Task 5: Swap the admin pages

**Files:** the six admin pages.

- [ ] **Step 1:** Payouts: `variant="inverse"`, `<a>` to `Link`. Seller inquiries, stores, goodie-box (status group and quarter group, the quarter links with `className="px-2"`), memberships, brand-subscriptions: `variant="flat"`. Keep each wrapper's existing layout classes. In goodie-box, the status group retains `gap-1 text-sm`; the quarter group retains `ml-auto flex flex-wrap items-center gap-2 text-sm` and the visible "Quarter:" label. Labels: "Filter by status", "Filter by quarter". Keep the page-level `Pagination` (the admin one) untouched.
- [ ] **Step 2:** Update the admin tests to the After markup; hrefs and per-page active states unchanged, including no active chip for an invalid nonempty status on goodie-box, memberships and brand-subscriptions.
- [ ] **Step 3:** `rg -n '"rounded px-3 py-1"|"rounded-full px-3 py-1' apps/admin/src/app` shows nothing left in these files. Admin typecheck and tests. Commit: `refactor(ui): admin status and quarter filters use FilterTabs (5d-4)`.

### Task 6: Ledger

- [ ] **Step 1:** Resolve `man-t13`, `man-t14`, `man-t19`, `man-t20` with evidence that cites only what was done (the swaps, the tests, the contrast gate) and what was not browser-evaluated. `man-t20` must name every page it covers. Keep `ensure_ascii=True`, indent 2.
- [ ] **Step 2:** Expect ledger **30 deferred, 66 resolved**; scanner 102 hits, 0 deferred; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit the file.

### Task 7: Browser proof and gates; stop before the push

- [ ] **Step 1 (M1, harness, uncommitted, deleted after):** old markup next to the new for each variant and both pagination sizes; record width and height (must be equal) and, light and dark, the computed text contrast of active and inactive tabs and page links (all at least 4.5; record any `bg-primary` dark failure as `man-5a3`, not a regression).
- [ ] **Step 2 (M2, real web pages, seeded seller):** `/seller/dashboard/products` and `/seller/dashboard/orders`: real keys Tab through the tabs, Enter on one, the URL gets `?status=...`, the active tab changes, `aria-current` moves, the focus ring is visible; Shift+Tab back. `/products` and `/brands` (seed has 521 products): Tab to a page link, Enter, the URL gets `page=`, `q` survives; 390 px no horizontal overflow with 20 pages.
- [ ] **Step 3 (M3, admin):** the six admin pages need an admin session; try Charlie's Chrome once, else report as not evaluated (the fixture tests and the harness cover them).
- [ ] **Step 4 (M4):** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, web and admin tests, `@bomy/ui` typecheck, both builds (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and audit tests. Check `git diff --name-only main HEAD` has no `loading.tsx` and no stray files.
- [ ] **Step 5:** Write `.andy/pr5d45-pr-body.md` (format of the 5d-3 body; ends with the 🤖 line; lists visible changes, unchanged hrefs, D9 to D11, the `<a>` to `Link` change and the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d45-filtertabs-pagination.md`, handoff, memory, delete branch.

## Visible changes to disclose

1. Each filter group and pagination block gains a navigation label and `aria-current="page"` on the active tab (invisible).
2. A visible 2 px focus ring on tabs and page links (new).
3. Admin payouts and seller orders filters become client navigation (`Link`) instead of a full reload.

## Self-review

- **Coverage:** `man-t13` (seller products), `man-t14` (products, brands), `man-t19` (payouts), `man-t20` (inquiries, stores, goodie-box x2, memberships, brand-subscriptions); the seller orders chips are included because they are the same pattern as payouts (not a ledger entry; say if you want them left out).
- **Risk, in order:** an `href` changing (page 1 forms, preserved params); the active tab changing for an invalid status; the pill sizes shifting; `Link` prefetch on the `<a>` pages.
