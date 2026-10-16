# Soft-red storefront redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the public storefront (`apps/web`) the soft-red, blush, premium look Charlie chose in the mockups, in 9 small PRs (R1, R2, R3, R4, R5a to R5d, R6), with no change to behaviour.

**Architecture:** Change colour and type through the existing token layer (`apps/web/src/app/globals.css` + `tailwind.config.ts`) so most pages change with no edit. Then build the new layout pieces (floating nav, bento home, shared product card, filter pills) as `@bomy/ui` or `apps/web` components, one PR each. Admin keeps its own tokens and is not touched.

**Tech Stack:** Next 15.5, Tailwind 3.4, `next/font/google`, `@bomy/ui`, Vitest, Playwright MCP.

**Spec:** The approved mockups: https://claude.ai/artifact/Hmrcx4D2Z4MeoM1E4vinKF (board A, "Soft red on blush"). Reference look: demo.codeandchill.store/kvist. We copy the design language only (floating pill nav, bento hero, big tight headings, pastel tiles, soft shadows, hover lift). No Kvist code, text, images or logo.

## Global Constraints

- Colour is tokens only. No new hex in components. The only allowed literal colours today are the Google logo fills in `apps/web/src/app/auth/sign-in/page.tsx` and the mobile-menu scrim `bg-gray-900/20` in `apps/web/src/components/nav-bar.tsx` (line 231). R2 replaces the scrim with a token.
- Text contrast 4.5:1 (3:1 for 24 px and above or UI parts). Every token pair stays pinned by `apps/web/tests/design-tokens/*`.
- `text-primary` maps to `--primary-text`. `bg-`, `border-`, `ring-primary` map to `--primary` (man-5a3 design). Do not rename either.
- Fonts must be open source (OFL): Bricolage Grotesque (display), Geist (body), Geist Mono (small labels).
- Motion respects `prefers-reduced-motion`.
- `checkout_enabled` stays false. No checkout logic changes.
- Do not touch `apps/web/src/app/products/loading.tsx` (untracked).
- No `git add <dir>`. Explicit paths. Plan committed, Bob reviews, then Charlie says go. Stop before every push.
- Admin (`apps/admin`) is out of scope.
- **The values below are the mockup values. Charlie asked to remeasure and update them at implementation time (Task 1).**

## Review Focus

- Empty form fields: border must stay at least 3:1 on every field surface (see Control borders). A blank checkout field must be visibly a field.
- Seller dashboard and account pages read the same `apps/web` tokens. They change colour too. Expect to review them (D2).
- `--destructive` equals `--primary` today. D1b splits them. Every `bg-destructive` and `text-destructive` user gets the new alarm red. Check each one in light and dark so Delete stays distinct from the primary action.
- Pastel tiles hold seller photos. Photos of any colour must keep chip text and price readable (use ink on a solid chip, never text on the photo).
- Dark mode must still work. The mockups only cover light mode.
- Radius and heading size changes can break long product names and BM or ZH text. Test long text.

## Proposed token values (to be remeasured in Task 1)

| Token                            | Light now          | Light proposed                                                                                         | Dark now    | Dark proposed                                                                                                                                   |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--background`                   | 40 60% 98%         | 20 50% 98% (nearly white, warm; Charlie 2026-10-16: the page ground must not read as coloured)         | 30 29% 7%   | keep                                                                                                                                            |
| `--card`, `--popover`            | 0 0% 100%          | 0 0% 100% (unchanged)                                                                                  | 35 26% 9%   | keep                                                                                                                                            |
| `--muted`, `--secondary`         | 37 45% 94%         | 18 40% 95% (pale tint; the seller and account ground)                                                  | 30 29% 5%   | keep                                                                                                                                            |
| `--accent`                       | 5 73% 97%          | 18 50% 92% (accent-foreground = primary)                                                               | 358 34% 15% | keep                                                                                                                                            |
| `--foreground`                   | 231 49% 15% (navy) | 8 22% 14% (`#2A1D1B`)                                                                                  | 40 60% 98%  | keep                                                                                                                                            |
| `--muted-foreground`             | 34 19% 36%         | 12 14% 37% (`#6B5651`)                                                                                 | 35 22% 65%  | keep                                                                                                                                            |
| `--border` (decorative dividers) | 35 30% 81%         | 19 34% 83% (`#E3CFC6`)                                                                                 | 34 22% 22%  | keep                                                                                                                                            |
| `--input` (control border)       | 35 30% 81%         | 12 18% 48% (`#906D64`): 4.39 on the page ground, 4.59 on card and white, 4.08 on muted, 3.79 on accent | 34 22% 22%  | 28 12% 46% (`#837467`): 3.61 to 4.32 on the five dark surfaces                                                                                  |
| `--primary` (fills)              | 4 71% 43%          | 0 45% 42% (`#9A3B3B`)                                                                                  | 4 64% 51%   | 2 50% 50% (`#BF4440`): white 5.1:1, at least 3:1 on every dark surface. The first draft (4 40% 42%) failed 3:1 on the dark card and was dropped |
| `--primary-text`                 | 4 71% 43%          | 0 45% 42% (same)                                                                                       | 4 70% 62%   | 4 55% 66% (`#D87F79`, 5.6 to 6.7:1 on the dark surfaces)                                                                                        |
| `--destructive` (D1b)            | 4 71% 43%          | 4 80% 37% (`#AA1313`-ish): 4.8:1 for text on its own 10% tint over the ground, 0.2 apart from primary  | 4 70% 62%   | unchanged                                                                                                                                       |

Light measured (mockup): white on primary 6.86, primary on ground 5.26, on weakest tile 4.75, muted on weakest tile 4.73, ink on ground 12.48. Dark numbers are from a script on the current dark surfaces and must be re-run by the token test.

Blush `#EFDED7` (18 43% 89%) is no longer the page ground. It becomes the storefront tile colour: R4 adds a `--tint` token set for tiles. R1 keeps `--muted` pale so seller and account pages stay near white.

## Control borders (Bob review, 2026-10-16)

`--input` was left unchanged in the first draft. Against the new ground it is **1.15:1** (1.37 on card), so a blank field would have no visible edge. WCAG 2.2 non-text contrast asks 3:1 when the border is what identifies a control. Dark mode is also weak today (old dark `--input` is 1.47 to 1.74:1), so R1 fixes both themes. `--input` is split from `--border`: `--border` stays for dividers (decorative, no ratio needed); `--input` drives `border-input` on Input, Textarea, Select, FileDropzone idle state and checkout fields. Tests pin `--input` at least 3:1 on background, card, popover and muted in both themes, and on white. R1 browser check: empty fields on `/auth/sign-in`, `/brands` and `/products` search, the seller product form and the account address form, in light and dark, with a screenshot of each empty field.

**Checkout fields (checkout stays off).** With `checkout_enabled=false`, `/checkout` (`apps/web/src/app/checkout/page.tsx`, line 42) shows the paused panel, not the form. Do not enable checkout to test. Two separate checks:

1. **Blank checkout fields, in a temporary fixture.** Add a temporary route under `apps/web/src/app/` (for example `zz-harness/checkout-fields/page.tsx`) that renders the real checkout field markup from `apps/web/src/app/checkout/_form.tsx` (about line 321) with empty values, using the same `Input`/`Label` components and no server actions. Screenshot the blank fields at 390 and 1440 px, light and dark, and measure the border against its surface. Delete the route and any generated `.next` types before committing, and say so in the PR body. Nothing in the committed diff may enable checkout or change checkout logic.
2. **The real paused panel.** Open `/checkout` as it ships (checkout off) and screenshot it in light and dark. Its dashed border uses `border-input`, so it changes with the new `--input`. Confirm it is still visible and not harsher than the card around it.

## Decisions (Charlie, 2026-10-16)

- **D1b Destructive gets its own alarm red.** Soft red becomes the primary action colour, so Delete must stay visually distinct. R1 adds a separate `--destructive` value (light and dark) with its own contrast tests. `--destructive` stops aliasing `--primary`. Every `bg-destructive` and `text-destructive` user inherits it. R1 must list those call sites (status badges, toasts, alerts, delete buttons) and check each one in light and dark. Pinned today by `status-variants.test.tsx` and `toaster-behavior.test.tsx`.
- **D2a** Shared colours reach seller and account pages. The font change reaches them too. R1 includes light and dark browser checks on seller and account pages.
- **D3b** 28 px corners on storefront cards only (`rounded-bento`). Dense seller and account cards keep `--radius-card`.
- **D4a** Bricolage Grotesque (headings), Geist (body), Geist Mono (labels).
- **Base:** R1 is based on `main` after PR #172 (man-5a3) merges, so the new palette keeps the `--primary` / `--primary-text` split.
- **Copy gate:** the new homepage does not ship with placeholder copy. R3 may be built and reviewed in a preview, but it does not merge until Charlie approves the BOMY copy (headline, subline, card text, delivery line).

## File structure

| File                                                                                          | Change                                                                   | PR  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --- |
| `apps/web/src/app/globals.css`                                                                | new token values, `.dark` too                                            | R1  |
| `apps/web/tailwind.config.ts`                                                                 | `fontFamily.display` (R1). `rounded-bento` is added in R4                | R1  |
| `apps/web/src/app/layout.tsx`                                                                 | swap fonts via `next/font/google`                                        | R1  |
| `apps/web/tests/design-tokens/*.test.ts`                                                      | new expected pairs, including `--input` 3:1 (new `input-border.test.ts`) | R1  |
| `docs/design-system/README.md`                                                                | document the new values                                                  | R1  |
| `apps/web/src/components/nav-bar.tsx`, `nav-icon-button.tsx`                                  | floating pill nav, scrim token                                           | R2  |
| `apps/web/src/components/footer.tsx`                                                          | blush footer                                                             | R2  |
| `apps/web/src/app/page.tsx`                                                                   | bento home (today a placeholder)                                         | R3  |
| `apps/web/src/components/product-card.tsx` (new)                                              | shared pastel product tile                                               | R4  |
| `apps/web/src/app/products/page.tsx`, `brands/[slug]/products/page.tsx`                       | use ProductCard, filter pills                                            | R4  |
| `apps/web/src/components/filter-pill.tsx` (new, web-only; no change to shared Badge variants) | pill style for category links                                            | R4  |
| `apps/web/src/app/brands/**`                                                                  | spacing, type, tiles                                                     | R5a |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/**`                                      | spacing, type, tiles                                                     | R5b |
| `apps/web/src/app/cart`, `checkout`, `auth`                                                   | type scale and cards only                                                | R5c |
| `membership`, legal and info pages, `error.tsx`                                               | type scale and cards only                                                | R5d |
| motion and dark-mode pass                                                                     | hover lift, reduced-motion guard                                         | R6  |

## PR sequence

Each PR: plan section reviewed by Bob, baseline tests on the old code first, swap, ledger/audit gates, browser proof at 390, 767 and 1440 px in light and dark, PR body in `.andy/`, stop before push.

### R1: Global colour and typography change (no layout rewrite)

Changing fonts can reflow text, line breaks and card heights on every page, seller and account included. Run the responsive checks (390, 767, 1440 px, light and dark, long names, BM and ZH text) in R1. Do not treat it as zero-layout-risk.

**Files:** `globals.css`, `tailwind.config.ts`, `layout.tsx`, `tests/design-tokens/*`, `docs/design-system/README.md`

- [ ] Step 1: Re-measure, including `--input` on every field surface in both themes (Control borders). Script every pair in the table above on the real surfaces in both themes. Record numbers in the PR body. If a pair fails, adjust the HSL and say why.
- [ ] Step 2: Write failing token tests first: update `contrast.test.ts`, `primary-text.test.ts`, `status-pairs.test.ts` expectations to the new values. Run, see them fail.
- [ ] Step 3: Change `globals.css` (`:root` and `.dark`).
- [ ] Step 4: Fonts in `layout.tsx`: Bricolage Grotesque (variable `--font-display`), Geist (`--font-sans`), Geist Mono (`--font-mono`). Add `fontFamily.display` in Tailwind. Headings use `font-display` through the base layer in `globals.css`.
- [ ] Step 5: Run `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm build`, `pnpm ui:audit --allow-deferred`. Check seller dashboard and account in the browser (D2).
- [ ] Step 6: Commit with explicit paths.

### R2: Floating nav and footer

Pill nav (logo, links, dark "Bag" pill). Keep all behaviour pinned by `nav-bar-mobile-menu.test.tsx` and `nav-icon-controls.test.tsx` (hamburger, Escape focus return, 768 px close). Replace `bg-gray-900/20` scrim with a token. Keep `--nav-height` and `spacing.nav` so the toaster offset stays right.

### R3: Home page bento

Replace the "Coming soon" placeholder with the bento hero (headline card, themed card, delivery card, tall featured product card) and the "Fresh from our sellers" grid. Data comes from existing public queries (`withPublicRead`). No new tables. **Gate: Charlie approves the BOMY copy before this PR merges.** Copy lives in one `home-copy.ts` file so Charlie can edit it. The one locked fact: shipping by Pos Laju.

### R4: ProductCard and filter pills

Extract the inline card from `products/page.tsx` into `ProductCard`. Keep `group-hover:text-primary` pinned by `store-products-page.test.tsx`. Category filters become pills. **Badge scope:** do not change the shared `@bomy/ui` `Badge` variants (admin and seller use them; `status-variants.test.tsx` pins them). Build the pill as a web-only component (`apps/web/src/components/filter-pill.tsx`) or add a new opt-in variant, and leave existing variants and admin output byte-identical. They keep today's `aria-` and link behaviour (tests: `filters.test.tsx`, `filter-tabs.test.tsx`).

### R5: Remaining public pages, in four reviewable groups

Each group is its own PR. Type scale, spacing and `rounded-bento` only. No logic.

- **R5a Brands:** `/brands`, `/brands/[slug]`, `/brands/[slug]/products`.
- **R5b Product detail:** `/products/[storeSlug]/[productSlug]` with gallery, variant picker and body renderer.
- **R5c Cart, checkout, auth:** `/cart`, `/checkout` (+ success, cancelled), `/auth/*`. Money and sign-in paths: re-run their tests; no logic edits.
- **R5d Membership, legal, info, errors:** `/membership/*`, `/about`, `/contact`, `/privacy`, `/terms`, `/refund`, `/shipping`, `error.tsx`.

### R6: Motion and dark mode

Hover lift, optional scroll reveal, `prefers-reduced-motion` guard, full dark-mode review.

## Self-review

- Spec coverage: floating nav (R2), bento hero (R3), product tiles (R4), buttons (R1 tokens + Button), filter pills (R4), type (R1), motion (R6), mobile (every PR at 390 px).
- Copy: home copy needs Charlie approval before R3 merges (gate above). Product names and prices come from real data.
- Risk: R1 touches every page at once, including seller and account, and now splits destructive from primary. It changes tokens and fonts only, with no markup rewrite, so it is easy to revert, but it can reflow text, so the responsive checks in R1 are required.

## Execution

Not chosen yet. Recommend subagent-driven for R2 to R5 (separate files, clear tests) and native for R1 (one place, high blast radius).
