# Soft-red R2: floating nav and footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the full-width sticky top bar into a floating pill nav, restyle the footer to match, and replace the last literal colour in public code (the mobile-menu scrim), with no behaviour change.

**Architecture:** `NavBar` keeps its logic (menu state, Escape focus return, 768 px close, seller menu). Only the wrapper markup and classes change: a transparent sticky wrapper holds a rounded pill, and the mobile panel becomes a rounded card under the pill. Two new tokens (`--nav-offset`, `--scrim`) and one radius (`rounded-bento`, 28 px, first used by the footer card) go through the token layer so the toaster, scrim and footer follow.

**Tech Stack:** Next 15.5, Tailwind 3.4, `@bomy/ui` Button, Vitest (jsdom per file), Playwright MCP.

**Spec:** Approved mockups, board A (https://claude.ai/artifact/Hmrcx4D2Z4MeoM1E4vinKF), as changed by Charlie on 2026-10-16: near-white page ground, blush only for tiles. Parent plan: `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R2). Design language only; no Kvist code, text, images or logo.

## Global Constraints

- **Behaviour is pinned by existing tests and must not change:** open and close, `aria-expanded`, `aria-controls="mobile-menu"`, `inert` on the closed panel, Escape returns focus to the menu button only when focus was inside the panel, the `(min-width: 768px)` listener closes the menu, link order (Brands, Products, Membership, Sell with us, Become a provider, then Seller if `seller_owner`, then Account or Sign in), `aria-label`s "Cart", "Account", "Sign in", "Seller menu", "Open menu" / "Close menu", the desktop row class `hidden items-center gap-4 md:flex` is allowed to change but the `md` breakpoint contract stays at 768 px.
- Files that pin classes and are updated by this PR on purpose: `tests/components/nav-bar-mobile-menu.test.tsx` (TOKENS: bar, scrim), `tests/components/toaster-position-guard.test.ts`, `tests/components/toaster-behavior.test.tsx` (toast offset). Behaviour tests in those files do not change.
- The scrim must keep `pointer-events-auto` (the nav wrapper is `pointer-events-none`), pinned by a test and by a real click in the browser.
- No literal colours. `bg-gray-900/20` goes away; the scrim uses a token.
- Contrast: link text, icon controls and the cart badge stay at least 4.5:1 (3:1 for icons) on the pill surface in both themes. Pinned by token tests.
- Business identity in the footer is locked (Inflo Vision, SSM 202503276795, `contact@brandsofmalaysia.com`, the Penang address, "© 2026 BOMY"). Wording and values do not change; only layout and type.
- Motion respects `prefers-reduced-motion` (existing `motion-reduce:` classes stay).
- `checkout_enabled` untouched. Admin untouched. No `git add <dir>`; explicit paths. Do not touch `apps/web/src/app/products/loading.tsx`. Stop before the push.

## Review Focus

- **768 to 1023 px.** The five text links, the cart, the account control and the theme toggle must fit inside a pill that is narrower than today's full-width bar. If they do not fit, the plan has a fallback (D6). Measure before deciding.
- **Toast and scrim offsets.** Today they are `top-[calc(var(--nav-height)+1rem)]` and `top-nav`. A floating pill is lower by `--nav-offset`, so both must move, or the first toast hides under the pill.
- **Sticky pill over scrolling content.** The wrapper must not block clicks in the empty side gaps, and content scrolling under the gap must not look broken.
- **Seller, account and checkout pages share the nav.** Their sticky or full-height layouts must not get a double gap or an overlap.
- **Dark mode.** Scrim must darken, not lighten, in dark. Pill border and shadow must still read.
- **Scrim clicks (Bob).** The `pointer-events-none` wrapper is inherited by its children. The scrim is inside it, so without `pointer-events-auto` an outside click would do nothing and the menu could not be closed by tapping outside.
- **Cart hover (Bob).** `NavIconButton` already carries `hover:bg-muted hover:text-foreground`. Adding only `bg-primary text-primary-foreground` would leave those hover classes in force, so the filled cart would flip to a pale hover state. The hover classes must be replaced explicitly.
- **Cart badge on a filled button.** The count `Badge` is `bg-primary text-primary-foreground`. On a primary-filled button it would be invisible. It needs its own surface.
- **Keyboard.** Tab order unchanged; focus rings visible on the pill surface; Escape still works from inside the panel.

## Decisions (Charlie, 2026-10-17)

- **D5(a):** keep the Cart icon and count badge, restyled as the filled primary round button. Copy stays "Cart".
- **D6(a):** keep the 768 px breakpoint if the measured links fit after spacing adjustments. The (b) fallback only comes back if the measurement fails, and then only with Charlie's go.

## Options that were offered (kept for the record)

- **D5 Cart control.** (a) Keep the cart as an icon with the count badge, restyled as the filled primary round button inside the pill. Copy stays "Cart". (b) Replace it with a "Bag (n)" text pill as in the mockup. That renames the control, breaks "label in name" unless the accessible name also becomes "Bag", and the site says "cart" everywhere else (`/cart`, "Your cart is empty"). **Recommend (a).** Choose (b) only if you also want the words "cart" changed to "bag" site-wide, which is a content decision.
- **D6 Desktop breakpoint.** If the links do not fit at 768 to 1023 px after tightening spacing, (a) keep `md` (768 px) and let the pill carry a smaller link gap and `text-sm`; (b) move the switch to the hamburger up to `lg` (1024 px), which changes the `matchMedia` query and the pinned tests from 768 to 1024. **Recommend (a); use (b) only if the measurement fails.** The plan measures first.

## File structure

| File                                                                                                                    | Change                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/app/globals.css`                                                                                          | add `--nav-offset: 0.75rem` (`:root`) and `--scrim` (light `8 22% 14%`, dark `0 0% 0%`)                                  |
| `apps/web/tailwind.config.ts`                                                                                           | `spacing["nav-clear"]` = `calc(var(--nav-height) + var(--nav-offset))`, `colors.scrim`, `borderRadius.bento` = `1.75rem` |
| `apps/web/src/components/nav-bar.tsx`                                                                                   | floating pill wrapper, rounded mobile panel, token scrim, display-font logo                                              |
| `apps/web/src/components/nav-icon-button.tsx`                                                                           | no change expected: the cart overrides through `className` (D5a)                                                         |
| `apps/web/src/components/footer.tsx`                                                                                    | rounded card on the page ground, mono eyebrow labels, display-font wordmark; text and links unchanged                    |
| `apps/web/src/components/toaster.tsx`                                                                                   | toast `top` uses `nav-clear`                                                                                             |
| `apps/web/tests/components/nav-bar-mobile-menu.test.tsx`, `toaster-position-guard.test.ts`, `toaster-behavior.test.tsx` | updated class expectations only                                                                                          |
| `apps/web/tests/design-tokens/nav-tokens.test.ts` (new)                                                                 | tokens, no literal colour, contrast on the pill                                                                          |
| `apps/web/tests/components/footer.test.tsx`                                                                             | add pinned business identity strings                                                                                     |
| `docs/design-system/README.md`, parent plan                                                                             | note `--nav-offset`, `--scrim`, `rounded-bento` now introduced in R2                                                     |

`rounded-bento` moves from R4 to R2 in the parent plan, because the footer is its first user. R4 reuses it and adds the blush tile tokens.

## Task 1: Tokens (nav offset, scrim, bento radius)

**Files:** `globals.css`, `tailwind.config.ts`, `tests/design-tokens/nav-tokens.test.ts` (new), `tests/components/toaster-position-guard.test.ts`

**Interfaces:** Produces `--nav-offset`, `--scrim`, Tailwind `top-nav-clear` / `bg-scrim` / `rounded-bento`, used by Tasks 2 to 4.

- [ ] **Step 1: Write the failing test** `apps/web/tests/design-tokens/nav-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const WEB = resolve(__dirname, "../..")
const css = readFileSync(resolve(WEB, "src/app/globals.css"), "utf8")
const tailwind = readFileSync(resolve(WEB, "tailwind.config.ts"), "utf8")
const nav = readFileSync(resolve(WEB, "src/components/nav-bar.tsx"), "utf8")

describe("nav tokens", () => {
  it("defines --nav-offset once, as 0.75rem", () => {
    expect(css.match(/--nav-offset:\s*0\.75rem/g)).toHaveLength(1)
  })
  it("defines --scrim in both themes, dark being the darker or equal", () => {
    expect(css).toMatch(/:root \{[\s\S]*--scrim:\s*8 22% 14%/)
    expect(css).toMatch(/\.dark \{[\s\S]*--scrim:\s*0 0% 0%/)
  })
  it("maps nav-clear, scrim and bento in Tailwind", () => {
    expect(tailwind).toContain('"nav-clear": "calc(var(--nav-height) + var(--nav-offset))"')
    expect(tailwind).toContain('scrim: "hsl(var(--scrim))"')
    expect(tailwind).toContain('bento: "1.75rem"')
  })
  it("the nav has no literal palette colour", () => {
    expect(nav).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|black|white)\b/)
    expect(nav).toContain("bg-scrim/")
  })
})
```

- [ ] **Step 2:** `pnpm --filter @bomy/web exec vitest run tests/design-tokens/nav-tokens.test.ts` and see it fail.
- [ ] **Step 3:** Add to `globals.css` `:root`: `--nav-offset: 0.75rem; /* gap above the floating pill; toast and scrim clear it */` and `--scrim: 8 22% 14%;`. Add to `.dark`: `--scrim: 0 0% 0%;`. Add to `tailwind.config.ts`: `spacing: { nav: "var(--nav-height)", "nav-clear": "calc(var(--nav-height) + var(--nav-offset))" }`, `colors.scrim: "hsl(var(--scrim))"`, `borderRadius.bento: "1.75rem"`.
- [ ] **Step 4:** Update `toaster-position-guard.test.ts` to also assert `--nav-offset` is defined once. Run the token and guard tests. The two assertions that read `nav-bar.tsx` (no literal colour, uses `bg-scrim/`) are added in Task 2, so Task 1 commits a green test file.
- [ ] **Step 5:** Commit with explicit paths.

## Task 2: Floating pill NavBar

**Files:** `nav-bar.tsx`, `tests/components/nav-bar-mobile-menu.test.tsx`, `tests/components/nav-bar.test.tsx`, `tests/components/nav-icon-controls.test.tsx`

**Interfaces:** Consumes Task 1 tokens. Produces the same exports (`NavBar`) and the same DOM hooks the tests use (`#mobile-menu`, `button[aria-hidden="true"]` scrim, `aria-label`s).

- [ ] **Step 1: Baseline first.** Run the three nav test files on `main` code and record counts. They must pass before any edit (they are the behaviour contract).
- [ ] **Step 2: Update only the TOKENS in `nav-bar-mobile-menu.test.tsx`** and see them fail:

```ts
const TOKENS = {
  bar: ["h-nav", "rounded-full"],
  scrim: ["top-nav-clear", "md:hidden", "-z-10", "bg-scrim/30", "pointer-events-auto"],
  // hamburger, row, panel tokens: unchanged except panel gains "rounded-bento" and "mt-2"
}
```

Add one new behaviour test: the outer wrapper has `pointer-events-none` and the pill has `pointer-events-auto` (side gaps do not block clicks).

- [ ] **Step 3: Implement.** Replace the `<nav className="sticky top-0 ...">` shell with:

```tsx
<nav className="pointer-events-none sticky top-[var(--nav-offset)] z-50 px-4" aria-label="Main">
  <div className="pointer-events-auto relative mx-auto max-w-5xl">
    <div className="flex h-nav items-center justify-between rounded-full border border-subtle bg-card pl-6 pr-2 shadow-md">
      {/* logo, desktop row, mobile cluster: markup and handlers unchanged */}
    </div>
    {/* mobile panel: className gains "mt-2 rounded-bento"; position stays absolute inset-x-0 top-full */}
  </div>
  {/* scrim: className "pointer-events-auto fixed inset-x-0 bottom-0 top-nav-clear -z-10 cursor-default bg-scrim/30 md:hidden" */}
</nav>
```

The logo becomes `font-display`. Link text moves to `font-medium`. Desktop gap and padding are set after the 768 px measurement (Task 5, D6).

- [ ] **Step 3b (D5a): the filled cart button, explicit rest, hover and badge classes.** Tailwind-merge only drops a class when another class of the same variant and property follows it, so the hover pair must be named:

```tsx
<NavIconButton
  asChild
  className="relative bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-90 [&_svg]:size-6"
>
```

`hover:bg-primary hover:text-primary-foreground` replace the base `hover:bg-muted hover:text-foreground`; `bg-primary text-primary-foreground` replace the base `text-muted-foreground`. The count badge gets its own surface so it stays visible on the fill: `Badge` `className` becomes `... border-0 bg-card text-foreground ring-1 ring-primary` (still `variant="default"`; the classes override its fill).

Update `nav-icon-controls.test.tsx` deliberately (names, destinations and tab order do not change) and add these pins:

```ts
it("the filled cart replaces the muted hover classes", () => {
  const cart = byLabel(row, "Cart")!
  for (const t of [
    "bg-primary",
    "text-primary-foreground",
    "hover:bg-primary",
    "hover:text-primary-foreground",
    "hover:brightness-90",
  ])
    expect(cart.classList.contains(t), t).toBe(true)
  for (const t of ["hover:bg-muted", "hover:text-foreground", "text-muted-foreground"])
    expect(cart.classList.contains(t), t).toBe(false)
})
it("the count badge has its own surface on the filled cart", () => {
  const badge = byLabel(row, "Cart")!.querySelector("span")!
  for (const t of ["bg-card", "text-foreground", "ring-1", "ring-primary"])
    expect(badge.classList.contains(t), t).toBe(true)
  expect(badge.classList.contains("bg-primary")).toBe(false)
})
```

Add to `nav-tokens.test.ts`: white on `--primary` at `brightness(0.9)` is at least 4.5:1 in both themes (same helper as the existing destructive hover test); `--foreground` on `--card` at least 4.5:1 (badge text); `--primary` against `--card` at least 3:1 (badge ring and cart against the pill).

- [ ] **Step 3c: scrim pointer events.** The scrim test in Step 2 pins `pointer-events-auto`. Add a behaviour assertion that the wrapper `<nav>` has `pointer-events-none` and the scrim has `pointer-events-auto`. jsdom does no hit-testing, so Task 5 Step 3b proves it with a real click.
- [ ] **Step 4:** Run the three nav files plus `nav-tokens.test.ts`; all pass.
- [ ] **Step 5:** `pnpm typecheck`, `pnpm lint`, commit.

## Task 3: Toaster offset

**Files:** `toaster.tsx`, `tests/components/toaster-behavior.test.tsx` (line about `top-[calc(var(--nav-height)+1rem)]`), `toaster-position-guard.test.ts`

- [ ] **Step 1:** Change the expected class to `top-[calc(var(--nav-height)+var(--nav-offset)+1rem)]` in both tests; see them fail.
- [ ] **Step 2:** Change `toaster.tsx` to that class. Run both files; pass.
- [ ] **Step 3:** Commit.

## Task 4: Footer

**Files:** `footer.tsx`, `tests/components/footer.test.tsx`

- [ ] **Step 1: Failing test.** Add to `footer.test.tsx` (renders to static markup like the existing tests):

```ts
it("keeps the locked business identity text", () => {
  const html = render()
  for (const s of [
    "BOMY by Inflo Vision (202503276795)",
    "contact@brandsofmalaysia.com",
    "19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang.",
    "© 2026 BOMY. All rights reserved.",
  ])
    expect(html).toContain(s)
})
it("is a rounded card, with mono eyebrow labels", () => {
  const html = render()
  expect(html).toContain("rounded-bento")
  expect(html).toContain("font-mono")
})
```

The first test passes on the old code (it pins the values); the second fails.

- [ ] **Step 2: Implement.** `<footer className="mt-16 px-4 pb-4">` holding `<div className="mx-auto max-w-6xl rounded-bento border border-subtle bg-muted px-6 py-10 md:px-10">`. Wordmark `font-display`. The two uppercase labels get `font-mono text-xs uppercase tracking-[0.1em]`. All links, text and `mailto:` stay as they are.
- [ ] **Step 3:** Run footer tests, then commit.

## Task 5: Evidence gates, docs, PR body

- [ ] **Step 1: 768 px fit (D6 decision gate).** In the browser at 767, 768, 900, 1023, 1024 and 1440 px, light and dark, signed out and as the seeded seller: record whether any element overflows or wraps, and the pill's inner width. If anything wraps at 768 to 1023 px, tighten (`gap-3`, `px-5`), re-measure, and only then ask Charlie about D6(b).
- [ ] **Step 2: Real pages.** Load `/`, `/products`, `/brands`, `/cart`, `/auth/sign-in`, `/seller/dashboard`, `/account` at 390, 767, 1440 px in light and dark. Check: pill and panel visible, no overlap with page headings, seller sidebar sits below the pill with no double gap, text contrast alpha-composited with zero nodes below 4.5:1.
- [ ] **Step 3: Interaction.** Real keys: Tab order across the pill, focus ring visible on the pill, open the menu, Escape from the menu button and from inside the panel (focus returns only in the second case), scrim click closes, resize 390 to 800 closes the menu. A real toast appears below the pill, not under it (screenshot).
- [ ] **Step 3b: Scrim and hover in a real browser.** At 390 px open the menu and click a point on the page below the panel with a real mouse click (not a script `click()`); the menu must close. Click an empty side gap beside the pill while the menu is closed and confirm the click reaches the content under it. Hover the cart button and the badge: measure the rendered text against the fill, including the `brightness-90` filter, in light and dark (at least 4.5:1 for text, at least 3:1 for the badge ring). Confirm the badge is visible at counts 1 and 99+ (seed the `bomy_cart` local storage item, then delete it).
- [ ] **Step 4: Scroll.** Scroll a long page (`/products`) and capture the pill over content in light and dark; confirm clicks in the side gaps reach the content.
- [ ] **Step 5: Gates.** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm build` (move `products/loading.tsx` aside and restore it), `pnpm ui:audit --allow-deferred`, `pnpm ui:audit:test`. Report the two `DATABASE_URL` test files as "not evaluated".
- [ ] **Step 6: Docs and PR body.** Note the new tokens in `docs/design-system/README.md`; fix the parent plan (`rounded-bento` from R4 to R2); write `.andy/soft-red-r2-pr-body.md` with only verified claims; evidence file `docs/superpowers/plans/2026-10-17-soft-red-r2-evidence.md`. Stop before the push.

## Self-review

- Spec coverage: floating pill nav (Task 2), mobile panel and scrim (Tasks 1 and 2), footer (Task 4), toast offset (Task 3), 768 px fit and D6 (Task 5), dark mode and keyboard (Task 5).
- Placeholders: none. Footer and nav copy are unchanged, so no copy gate applies to R2.
- Type consistency: `nav-clear`, `--nav-offset`, `--scrim`, `bg-scrim`, `rounded-bento` are named the same in every task.
- Bob's two blockers are Task 2 Steps 3b and 3c and Task 5 Step 3b.
- Risk: the sticky wrapper changes stacking. `z-50` stays; the scrim keeps `-z-10` inside the wrapper's stacking context, as today.

## Execution

Not chosen yet. Recommend native for R2: three tightly linked files (nav, toaster, tests) share class contracts, so one agent keeping them in step is safer than splitting.
