# PR 5d-10 — Page and footer cleanups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear ledger entries `man-a1` to `man-a7` and `man-b8` by moving the hand-made boxes, the emoji, the inline svg and the plain `<a>` links on three web files onto the shared `Card`, lucide icons and `next/link`, with no change to content, destinations or layout beyond what is disclosed.

**Architecture:** Three independent edits, no new component. (1) `auth/verify-request/page.tsx`: `Card` + `CardContent`, lucide `Mail`, `next/link`. (2) `brands/[slug]/products/page.tsx`: product tile as `Card`, empty state as a dashed `Card`, lucide `Package`. (3) `components/footer.tsx`: the six internal `<a>` become `next/link` with a taller tap target. To keep this slice clear of the open Card colour decision (D3), the `Card` fill is **overridden back to today's `bg-background`** at both call sites, so no fill changes here.

**Tech Stack:** React 19, Next 15.5 `next/link`, `@bomy/ui` Card, lucide-react, Vitest 2.1.9, Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-10).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d10` from `main` (`d051955`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Out of scope:** 5d-7 (mobile menu, hamburger, `--nav-height`, `man-b9b`), 5d-2 and D3 (Card fill and radius for the other Card users), 5d-9 buttons, 5d-12, 5d-8, `man-5a3`. No change to `Card` itself or to any other page.
- Contrast: text 4.5:1, focus indicators 3:1. Report env-limited tests as "not evaluated". Evidence text may cite only what was actually verified.

## Review Focus

- **Same words, same destinations.** verify-request: heading "Check your email", both paragraphs, link text "try again" to `/auth/sign-in`. Products page: the store name, "Back to storefront" link, "No products found in this category.", each tile's `href` `/products/{store.slug}/{p.slug}`, name and image `alt`. Footer: six internal hrefs (`/about`, `/contact`, `/terms`, `/privacy`, `/refund`, `/shipping`) with the same labels, the `mailto:` link still a plain `<a>`, the business identity text and copyright unchanged (the existing `footer.test.tsx` must keep passing).
- **Footer links navigate on the client.** The six links become `next/link`, so a click does not reload the page (proved in the browser with a `window` marker that survives navigation) and Enter on a focused link navigates.
- **Footer layout holds.** Link pitch stays 28 px (20 px text line + 8 px gap today; 4 px + 20 + 4 px padding with no gap after), the tap target grows from 20 px to 28 px high (WCAG 2.2 minimum is 24 px), the first link stays at the same y, and the footer height at 320, 390, 768 and 1280 px is measured before and after (a change is compensated or disclosed).
- **The card look holds.** verify-request card: width `max-w-sm`, padding 32 px, text centred, light/dark fill unchanged (`bg-background` override), shadow unchanged; radius 16 px → 12 px (`rounded-card`) and the 1 px outline ring becomes a 1 px border of the same colour. Product tile: radius 12 px (already `rounded-xl` = the card radius), border, shadow, `hover:shadow-md`, `group-hover:text-primary`, image crop unchanged.
- **Empty state keeps its look.** Dashed border, transparent fill, no shadow, centred muted text, `py-16`; only the element changes (a `Card` div holding the `<p>`).
- **Icons are decorative.** Mail and Package are `aria-hidden`. The emoji was read aloud as "package" by screen readers inside a link already named by the product; hiding it removes that noise (disclosed). Mail icon: the hand-drawn svg and lucide's `Mail` differ slightly in path.
- **Focus.** The "try again" link and the footer links get a visible keyboard focus ring (today the link has no focus style beyond the browser's default outline); ring >= 3:1 on the card and footer surfaces in both themes (test).

## File Structure

- Modify `apps/web/src/app/auth/verify-request/page.tsx`, `apps/web/src/app/brands/[slug]/products/page.tsx`, `apps/web/src/components/footer.tsx`.
- Create tests: `apps/web/tests/auth/verify-request-page.test.tsx`, `apps/web/tests/storefront/store-products-page.test.tsx`; extend `apps/web/tests/components/footer.test.tsx`; extend `apps/web/tests/design-tokens/status-pairs.test.ts` (ring on card/muted).
- Modify `scripts/ui-audit/findings.json`, and `scripts/ui-audit/exceptions.json` only if a matched string disappears (stale entries fail the gate).

## Decisions for Bob and Charlie

- **D7 (open, needed for `man-a6`):** the empty state becomes a dashed `Card` with `bg-transparent shadow-none`, no new `EmptyState`. This is the recommendation already on record. Confirm.
- **D14 (new, `man-a4`):** the ledger says `Button asChild variant="link" size="sm"`. The link sits inside a sentence ("... or try again."). Button `sm` is `inline-flex h-8 px-3 text-xs`, which would add padding and a fixed height inside running text. **Recommended:** `next/link` with `underline underline-offset-4 hover:text-foreground` and the shared focus ring classes (`rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`), resolving the entry on the client-navigation and focus parts. The alternative is a `Button link` that visibly changes the sentence.
- **D15 (new, `man-a1`, `man-a5`):** keep today's fill with `bg-background` on the two Card call sites, so this slice does not pre-empt D3 (the other Card users all use the white `bg-card`). When D3 is decided, the 5d-2 slice removes or keeps these overrides along with the rest.
- **D16 (new, `man-b8`):** footer tap targets via `inline-block py-1` on the `next/link`, not `Button link`. Button `link` is `h-9`-class sizing with `text-xs`/`text-sm` rules that would shrink or shift the column; padding keeps the type and the 28 px pitch.

## Edit

1. verify-request:

```tsx
<main className="flex min-h-screen items-center justify-center bg-muted">
  <Card className="w-full max-w-sm bg-background text-center">
    <CardContent className="p-8">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Mail aria-hidden="true" className="size-6 text-muted-foreground" />
      </div>
      {/* h1 and both paragraphs unchanged */}
      ... <Link href="/auth/sign-in" className="underline underline-offset-4 hover:text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">try again</Link>.
```

The medallion stays a `div` (`man-a2`: a one-off circle, no shared piece). The `EnvelopeIcon` function is deleted (`man-a3`).

2. Products page:
   - Empty state (`man-a6`): `<Card className="border-dashed bg-transparent shadow-none"><p className="py-16 text-center text-sm text-muted-foreground">No products found in this category.</p></Card>`.
   - Tile (`man-a5`): `<Card asChild>` is not available, so the link keeps its place and the Card wraps it: `<li><Card className="group overflow-hidden bg-background hover:shadow-md"><Link href=... className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">...</Link></Card></li>`. Same inner markup; the Card supplies border, radius and shadow.
   - Placeholder (`man-a7`): `<Package aria-hidden="true" className="size-8 text-muted-foreground" />` in the same centred box (the old emoji was `text-3xl`, 30 px).
3. Footer (`man-b8`): `import Link from "next/link"`; each of the six internal links is `<Link href=... className="inline-block py-1 hover:text-foreground hover:underline">`; the `ul` loses `space-y-2` and gets `mt-2` so the first link keeps its y; the `mailto:` link stays `<a>`.

---

### Task 1: Baselines on today's markup (no source change)

**Files:** Create `apps/web/tests/auth/verify-request-page.test.tsx`, `apps/web/tests/storefront/store-products-page.test.tsx`; modify `apps/web/tests/components/footer.test.tsx`; create (uncommitted) `.andy/pr5d10-baseline.json`.

**Interfaces:** Consumes `VerifyRequestPage()`, `StoreProductsPage({ params, searchParams })` (an async server component; mock `./queries` `getStoreProducts`), `Footer()`. All rendered with `renderToStaticMarkup` after parsing with `DOMParser` under `// @vitest-environment jsdom`.

- [ ] **Step 1 (verify-request):** assert the h1 text, both paragraphs' text, the link's text and `href="/auth/sign-in"`, the `main` classes, the box classes "Today" (`rounded-2xl bg-background p-8 text-center shadow-sm ring-1 ring-border`), the medallion classes, an inline `svg` with `aria-hidden="true"` and the `<a>` tag of the link.
- [ ] **Step 2 (products page):** three cases with a mocked store: (a) products with and without `coverImageUrl`: tile `href`, name, `img alt`, placeholder present only for the no-image product with the emoji text; (b) zero products: the empty message text and its "Today" classes (`rounded-xl border border-dashed border-border py-16 text-center`); (c) `notFound` when the query returns null (mock `next/navigation`); the "Back to storefront" link `href`.
- [ ] **Step 3 (footer):** extend the existing test: the six internal links are `<a>` with the exact labels and `hover:text-foreground hover:underline`, the `mailto:` link, the list classes `mt-3 space-y-2`.
- [ ] **Step 4 (browser baseline, Playwright, uncommitted):** start web dev; at 320, 390, 768 and 1280 px, light and dark: `/auth/verify-request` card box, border/shadow/radius/background, h1 and link boxes; the footer height and each of the six links' boxes and the first link's y; `/brands/{slug}/products` for a seeded store (find one in the local DB) with products, one without a cover image if available, and `?category=zzz` for the empty state: tile box/radius/border/shadow/background, empty box/border style, placeholder box; real Tab: the "try again" link and a footer link focus style. Save to `.andy/pr5d10-baseline.json`.
- [ ] **Step 5:** run the tests on unchanged source: expect PASS. Mutation-check four: change a footer `href`, change the empty-state text, change a tile `href`, drop the `aria-hidden` of the svg; each must fail; restore.
- [ ] **Step 6:** commit the test files by explicit path: `test(ui): baseline of verify-request, store products page and footer (5d-10)`.

### Task 2: verify-request (`man-a1`, `a2`, `a3`, `a4`)

- [ ] **Step 1:** Apply Edit item 1. Update only the class-token expectations (`Card` classes, `Mail` svg, `Link` classes); text, hrefs and structure pass unchanged. The link is now rendered by `Link`; the source diff proves `<a>` → `Link` (a static render shows an `<a>` either way).
- [ ] **Step 2:** Typecheck, lint. Commit: `refactor(ui): verify-request page uses Card, lucide Mail and next/link (5d-10)`.

### Task 3: Store products page (`man-a5`, `a6`, `a7`)

- [ ] **Step 1:** Apply Edit item 2. Update only class-token expectations and the placeholder assertion (an `svg` with `aria-hidden` and no emoji text). Commit: `refactor(ui): store products page uses Card and lucide Package (5d-10)`.

### Task 4: Footer (`man-b8`)

- [ ] **Step 1:** Apply Edit item 3. Update the footer test: six `<a>` still present in static markup with the same hrefs and labels, `inline-block py-1` on each, the list without `space-y-2`, `mailto:` unchanged. The existing three tests pass unchanged.
- [ ] **Step 2:** Add the focus-ring contrast tests to `status-pairs.test.ts`: `--ring` against `--background` and `--card` and `--muted` is at least 3:1 in light and dark (the verify-request card sits on `--muted`, the footer is `bg-muted`). If a pair fails, record it; do not change tokens here.
- [ ] **Step 3:** Commit: `refactor(ui): footer links use next/link with taller tap targets (5d-10)`.

### Task 5: Ledger and exceptions

- [ ] **Step 1:** Run the scanner. Remove or update any exception whose matched text is gone (expect none for these three files; the scanner decides). Resolve `man-a1` to `man-a7` and `man-b8` in `findings.json` with evidence limited to what was verified (D14, D15, D16 outcomes stated; `a2` "kept as a div on purpose").
- [ ] **Step 2:** Expect **17 deferred, 80 resolved** (97 entries); scanner 0 deferred, 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit both files by path.

### Task 6: Browser proof and gates; stop before the push

- [ ] **Step 1 (compare with the baseline):** repeat the Task 1 capture. Expected differences only: verify-request radius 16 → 12 px and ring → border (box size unchanged or within 2 px: measure), the focus rings, the placeholder icon replacing the emoji, the footer link boxes 20 → 28 px high with the same pitch (and any footer height change, measured). Everything else must equal the baseline in light and dark.
- [ ] **Step 2 (real keys):** Tab to "try again" and to each footer link: visible ring; Enter navigates; with a `window.__marker` set before clicking a footer link, the marker survives (client navigation) on the six links; the mailto link is untouched.
- [ ] **Step 3:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites, `@bomy/ui` typecheck, `pnpm build` (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and audit tests. Check `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 4:** Write `.andy/pr5d10-pr-body.md` (format of the 5d-6 body; ends with the 🤖 line; lists what was preserved, the measured deltas, the visible changes, D7/D14/D15/D16 and the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d10-page-footer-cleanups.md`, handoff, memory, delete branch.

## Visible changes to disclose

1. verify-request card corners 16 → 12 px; the 1 px outline ring becomes a 1 px border of the same colour.
2. The envelope icon is lucide `Mail` (slightly different path); the package placeholder is lucide `Package` instead of an emoji, hidden from screen readers.
3. Keyboard focus on "try again", the product tiles and the footer links shows the shared 2 px ring.
4. Footer links are 28 px tall to tap (was 20 px) with the same visual spacing; they navigate without a page reload.

## Self-review

- **Coverage:** `man-a1`, `a2`, `a3`, `a4` → Task 2; `a5`, `a6`, `a7` → Task 3; `b8` → Task 4; each has a baseline test (Task 1) and a ledger line (Task 5).
- **Not pre-deciding D3:** the two Card call sites keep `bg-background`; no change to `Card`.
- **Risk, in order:** a footer height change from the tap-target padding; the tile `Card` wrapper changing the link's hit area or hover shadow; `Link` focus ring clipped by `overflow-hidden` on the tile; the empty-state `Card` picking up a fill or shadow; a stale scanner exception.
