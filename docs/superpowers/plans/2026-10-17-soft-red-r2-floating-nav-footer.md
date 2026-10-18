# Soft-red R2: floating nav and footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the full-width sticky top bar into a floating, full-width, blurred pill nav with the cart and its counter side by side (no overlap), add Lenis smooth scroll, restyle the footer as a dark rounded card with a giant cropped wordmark, and replace the last literal colour in public code (the mobile-menu scrim), with no behaviour change.

**Architecture:** `NavBar` keeps its logic (menu state, Escape focus return, 768 px close, seller menu). Only the wrapper markup and classes change: a transparent sticky wrapper holds a rounded pill that turns more solid on scroll, and the mobile panel becomes a rounded card under the pill. New tokens (`--nav-offset`, `--scrim`, `--ink*`) and one radius (`rounded-bento`, 28 px) go through the token layer so the toaster, scrim and footer follow. A small client component starts Lenis (smooth scroll) and a small hook reports "scrolled" to the nav.

**Tech Stack:** Next 15.5, Tailwind 3.4, `@bomy/ui` Button, `lenis` (new, MIT, exact pin), Vitest (jsdom per file), Playwright MCP.

**Spec:** Kvist parity spec `docs/superpowers/plans/2026-10-17-kvist-parity-spec.md` (Charlie, 2026-10-17: near-identical layout and motion, own text, images and logo). Palette decisions stay as shipped in R1: soft red, near-white ground, blush for tiles. The older mockup board A (https://claude.ai/artifact/Hmrcx4D2Z4MeoM1E4vinKF) is superseded where it differs. Parent plan: `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R2). Design language and measured geometry only; no Kvist code, text, images or logo.

**Status (2026-10-17):** Tasks 1 to 3 are built on the local branch `feat/soft-red-r2-nav-footer` (commits up to `1003a93`, not pushed). They gave a centred `max-w-5xl` pill with a round cart icon. Parity changes that. Tasks A1 to A3 below amend that code. Tasks 4 and 5 are rewritten.

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

- **D5(a), amended by the parity request:** the cart keeps the word "Cart" and the `aria-label` "Cart", and becomes a pill (icon, label, then a round counter inside the pill, beside the label, never overlapping it). Fill stays the BOMY primary (soft red), not Kvist's black. Below `lg` the label hides and only icon and counter show (as the demo does on mobile).
- **D6(a):** keep the 768 px breakpoint if the measured links fit. Order of fallbacks if they do not: (1) hide the cart label below `lg`, (2) tighten gaps, (3) only then (b) move the hamburger switch to 1024 px, and only with Charlie's go.
- **D7 (DECIDED yes, Charlie 2026-10-18):** show the counter at 0, as the demo does ("Bag 0"). Today the badge shows only when the count is above 0. Recommend yes: it keeps the pill the same width as the count changes (no jump). Tests that pin "no badge at 0" change on purpose.
- **D8 (DECIDED yes, Charlie 2026-10-18, with the browser and reduced-motion checks in Task A2):** add the open-source `lenis` package (MIT), pinned to an exact version chosen at install time (`pnpm view lenis version`), no caret, as we did for Radix Select. First Load JS change is measured and reported in Task 5.
- **D10 (Bob, plan default):** keep today's Tab order (Cart, Account, Seller menu, Theme) instead of the demo's account-before-cart order. A changed order would need its own approval and tests. Charlie may override; the pill then needs the cart moved in the DOM and the order tests rewritten on purpose.
- **D9 (new):** the pill is `max-w-[1400px]` and centred, with 12 px (mobile) and 20 px (from 640 px) side gutters, the demo's frame. Pages that use a narrower content column (`max-w-5xl`, `max-w-6xl`) will sit inside a wider pill. That is the demo's own look on its wide sections; R3 to R5 widen page columns where the layout needs it.

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
<nav
  className="pointer-events-none sticky top-0 z-50 px-4 pt-[var(--nav-offset)]"
  aria-label="Main"
>
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

## Task A1: Parity tokens and pill geometry (amends Tasks 1 and 2)

**Files:** `globals.css`, `tailwind.config.ts`, `nav-bar.tsx`, `src/lib/use-scrolled.ts` (new), `tests/lib/use-scrolled.test.tsx` (new), `tests/design-tokens/nav-tokens.test.ts`, `tests/components/nav-bar-mobile-menu.test.tsx`, `tests/components/nav-icon-controls.test.tsx`, `tests/components/nav-bar.test.tsx`

**Interfaces:** Produces `useScrolled(threshold?: number): boolean` and the tokens `--nav-height: 4rem`, `--nav-offset` (0.75rem, 1rem from 640 px), `--ink`, `--ink-foreground`, `--ink-muted` (fixed dark surface in both themes, used by the footer).

- [ ] **Step 1: Find every user of the old height.** `grep -rn "nav-height\|h-nav\|top-nav\|nav-clear" apps/web/src apps/web/tests`. List them in the commit message. Each sticky or full-height layout that uses them (seller sidebar, account layout) is checked in Task 5.
- [ ] **Step 2: Failing tests.**
  - `nav-tokens.test.ts`: `--nav-height` is `4rem`; `--nav-offset` is `0.75rem` in `:root` and `1rem` inside `@media (min-width: 640px)`; `--ink`, `--ink-foreground`, `--ink-muted` defined once; `--ink-foreground` on `--ink` at least 4.5:1 and `--ink-muted` on `--ink` at least 4.5:1; nav text (`--muted-foreground`, `--foreground`) on `--card` at 70% alpha composited over every page surface that exists today (`--background`, `--card`, `--muted`, `--accent`), at least 4.5:1 in both themes. The future blush tile colour is NOT tested here; R4 adds that test when the token exists. Real images behind the pill are covered by a browser sample in Task 5 Step 4, not by a token test.
  - `use-scrolled.test.tsx`: false at `scrollY` 0; true after `scrollY` 9 and a `scroll` event; back to false; listener removed on unmount; listener registered `passive`.
  - `nav-bar-mobile-menu.test.tsx` TOKENS: wrapper `px-3 sm:px-5`, frame `max-w-[1400px]`, bar `h-nav rounded-full backdrop-blur-md bg-card/70 data-[scrolled=true]:bg-card/95 motion-reduce:transition-none`. A behaviour test: bar has `data-scrolled="false"` at rest and `"true"` after a scroll event.
  - `nav-icon-controls.test.tsx` holds the full Tab-order assertion as it is today: desktop `Cart`, `Account` (or `Account`, `Seller menu`), `Theme`; mobile `Theme`, `Cart`, `Open menu`; it fails if the order changes. The assertions exist; they are only extended, never loosened.
  - `nav-icon-controls.test.tsx`: the cart contains a visible text node "Cart" (class `hidden lg:inline`) and a counter `span` with `rounded-full bg-card text-foreground tabular-nums`; the counter has none of `absolute`, `-top-`, `-right-`, `ring-1` (no overlap by construction); the counter renders at count 0 (D7); `aria-label` stays "Cart"; the earlier hover pins (explicit `hover:bg-primary` and `hover:text-primary-foreground`, muted hover gone) stay.
- [ ] **Step 2b: Mobile pill contents (Bob 3) and a panel that scrolls (Bob 2).**
  - **Mobile pill shows, left to right:** logo, theme toggle, cart pill (icon and counter only, label hidden below `lg`), hamburger. **The account control is not in the mobile pill.** It stays in the menu panel as today (Account or Sign in, plus Seller for `seller_owner`), so the same three account states (signed out, signed in, seller owner) have an identical mobile pill and cannot change its width. Tests pin the order and that no account link is in the mobile cluster.
  - **Fit test at 390 px (and 360 and 320 px), all three account states, counter 0, 9 and 99+:** pill content does not overflow or wrap, hamburger and cart stay at least 44 px (WCAG 2.2 target size), and the logo is not clipped.
  - **Panel scroll:** the panel becomes `max-h-[calc(100dvh-var(--nav-height)-var(--nav-offset)-1.25rem)] overflow-y-auto overflow-x-hidden overscroll-contain` plus `data-lenis-prevent`, and keeps `rounded-bento`. Tests pin those tokens. Browser proof in Task 5: at 390x420 and at a 667x375 landscape phone the open panel's bottom stays inside the viewport, its `scrollHeight` is greater than its `clientHeight`, a real wheel over the panel scrolls the panel while `window.scrollY` does not change, and the last link can be reached and clicked.
- [ ] **Step 3: Implement.**

```tsx
<nav aria-label="Main" className="pointer-events-none sticky top-0 z-50 px-3 pt-[var(--nav-offset)] sm:px-5">
  <div className="pointer-events-auto relative mx-auto max-w-[1400px]">
    <div
      data-scrolled={scrolled}
      className="flex h-nav items-center justify-between rounded-full border border-subtle bg-card/70 pl-5 pr-2 shadow-sm backdrop-blur-md transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] data-[scrolled=true]:bg-card/95 data-[scrolled=true]:shadow-md motion-reduce:transition-none"
    >
```

Desktop links sit in a `hidden flex-1 items-center justify-center gap-1 md:flex` group; each link `rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground`. **DOM and Tab order stay exactly as today (Bob):** desktop is links, then Cart, then Account (or Account plus Seller menu when present), then Theme; mobile is Theme, Cart, then the menu button. No CSS `order` or `flex-row-reverse` trick, so the visual and Tab order match. This differs from the demo, which puts the account icon left of the cart; we keep the existing, tested order (decision D10, below). The right cluster is `ml-auto flex items-center gap-2` with the cart pill first:

```tsx
<NavIconButton
  asChild
  className="h-12 w-auto gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-90 [&_svg]:size-5"
>
  <Link href="/cart" aria-label="Cart">
    <ShoppingBag aria-hidden />
    <span className="hidden lg:inline">Cart</span>
    <span className="grid size-6 place-items-center rounded-full bg-card text-xs font-medium tabular-nums text-foreground">
      {count}
    </span>
  </Link>
</NavIconButton>
```

`useScrolled` is a client hook (passive `scroll` listener, `window.scrollY > threshold`, default 8). The `<Badge>` is replaced by the inline counter only for the cart; any other `Badge` use is untouched. Existing 99+ cap logic is kept.

- [ ] **Step 4:** run the five nav test files, `nav-tokens.test.ts`, `use-scrolled.test.tsx`; all pass. `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5:** commit with explicit paths.

## Task A2: Lenis smooth scroll

**Files:** `apps/web/package.json` + lockfile (`lenis`, exact pin), `src/components/smooth-scroll.tsx` (new), `src/app/layout.tsx`, `tests/components/smooth-scroll.test.tsx` (new)

**Interfaces:** Produces `<SmoothScroll />` (client, renders null) and the exported pure helper `shouldPrevent(node: HTMLElement): boolean`.

- [ ] **Step 1: Failing tests.**
  - **Nested scrollers (Bob 2).** BOMY's scrollable regions today: Radix `Select` and `DropdownMenu` content (`overflow-y-auto`, `packages/ui`), the mobile menu panel (new, vertical), and horizontal-only strips and tables (`overflow-x-auto`: seller sidebar tabs, seller product and subscription tables, account tabs, product image thumbnails, body-renderer tables and `pre`). `shouldPrevent(node)` returns true when the node or an ancestor (stopping at `body`) matches `[data-lenis-prevent]`, `[role="dialog"]`, `[role="listbox"]`, `[role="menu"]`, `[data-radix-popper-content-wrapper]`, or is a `textarea`, or has computed `overflow-y` of `auto` or `scroll` with `scrollHeight > clientHeight`. It returns false for a plain `div` in `main`, and false for a horizontal-only strip (`overflow-x: auto`, `overflow-y: visible`) so a vertical wheel over a table still scrolls the page. Unit tests stub `scrollHeight`, `clientHeight` and `getComputedStyle` because jsdom has no layout.
  - Under `matchMedia("(prefers-reduced-motion: reduce)")` matching, `<SmoothScroll />` does not construct Lenis; when the query later stops matching it does; when it matches again, `destroy()` is called. On unmount `destroy()` is called and the `requestAnimationFrame` loop stops. (Lenis is mocked.)
  - **No route-change code (Bob 1).** `<SmoothScroll />` does not read `usePathname` and never calls `scrollTo(0)`. Next's own navigation scroll (top on a new page, restore on Back and Forward, none with `scroll={false}`) stays in charge. A test asserts the component source has no `usePathname`, `scrollTo(0` or `popstate`. (`stopInertiaOnNavigate` only cancels an in-flight glide; it does not move the page.)
- [ ] **Step 2: Install.** `pnpm --filter @bomy/web add lenis@<exact version from pnpm view lenis version>` and then remove the caret from `package.json`. Record the version in the commit message.
- [ ] **Step 3: Implement.** Options: `lerp: 0.1`, `wheelMultiplier: 1` (the plan first said 2; the measured gate showed 2 moves a 400 px notch 1600 px, and 1 gives the demo's 800 px), `stopInertiaOnNavigate: true` (a glide in flight stops when the page changes, so Next's own scroll wins), `prevent: shouldPrevent`, native touch scroll (`syncTouch: false`). Leave `anchors` off: the app has no in-page `#` links today. **Pick the exact version only after checking that its types and README include `stopInertiaOnNavigate`;** if the newest release lacks it, pick the newest one that has it and say so in the commit. **Lenis recommended CSS:** add it once, using the `lenis/dist/lenis.css` file that ships with the pinned package (imported in `layout.tsx`), and read the rules in that exact version's CSS file and README. Do not assume any particular rule (for example a `scroll-behavior` rule); take what the pinned package ships. If the file is missing in that version, copy the README's CSS into `globals.css` verbatim. Tests: the constructor receives `stopInertiaOnNavigate: true`; `globals.css` or the layout imports the Lenis CSS (a source test); the shipped CSS file contains `.lenis` rules (the test reads the installed file and asserts only that, not specific property values). Mount once in `layout.tsx` inside `<body>`. Add `data-lenis-prevent` to the mobile menu panel (it can scroll on short phones).
- [ ] \*\*Step 4: Browser proof (real wheel, real keys), on a production build run with the project's standalone recipe (`apps/web/next.config.ts` sets `output: "standalone"`, so `next start` is wrong; recipe verified on this repo in `docs/superpowers/plans/2026-10-05-bomy-shared-ui-package-pr4.md`, Task 5 Step 4b). Stop any dev server on 3000 first, move `apps/web/src/app/products/loading.tsx` aside for the build and restore it after, and do not start a dev server after the build (it wipes `.next/standalone`):

  ```bash
  APP=/Users/charlie/Documents/Projects/BOMY/app
  pnpm --filter @bomy/web build
  mkdir -p "$APP/apps/web/.next/standalone/apps/web/.next/static"
  cp -R "$APP/apps/web/.next/static/." "$APP/apps/web/.next/standalone/apps/web/.next/static/"
  cd "$APP/apps/web/.next/standalone/apps/web"
  AUTH_TRUST_HOST=true PORT=3000 HOSTNAME=localhost node --env-file="$APP/apps/web/.env.local" server.js
  ```

  Expected: `Ready in …ms`; `/products` and `/api/auth/session` both return 200; one `/_next/static/chunks/*.js` returns 200. Real timing is measured only here, never on `next dev`.\*\*
  - **Numeric scroll gate (Bob 5).** One real `mouse.wheel(0, 400)` on a page at least 3000 px tall, then sample `scrollY` every animation frame until it stops. Gate on the outcome, not on matching frames: (a) final distance 800 px, accepted 720 to 880; (b) settles (within 2 px of the final value for 10 frames) no later than 1.6 s after the wheel; (c) never decreases and never passes the final value (no bounce); (d) already past 40% of the final distance at 125 ms. The demo's own samples (47 at 0 ms, 469 at 124, 655 at 249, 733 at 373, 771 at 498, 800 at about 1.1 s) are printed next to ours as information only, not a gate. Run it three times and report all three.
  - **Navigation (Bob 1), real clicks and keys:** click a header link while a glide is still running (within 300 ms of a wheel) and confirm the new page opens at the top; scroll a long page about 1500 px, open a product, press Back and confirm the earlier position is restored, then Forward; a link with `scroll={false}` (a temporary harness route, not in the diff, because the app has none today) keeps the current position. If any of these fails, the narrow fix is allowed only with the failing evidence recorded: cancel an in-flight glide on navigation (`lenis.scrollTo(window.scrollY, { immediate: true, force: true })`), never a jump to the top.
  - **Nested scrollers (Bob 2):** a vertical wheel over a seller table, the account tabs strip and the image thumbnails scrolls the page; a horizontal gesture scrolls the strip; a vertical wheel inside an open `Select` list scrolls the list and not the page; the same inside the open mobile panel (Task A1 Step 2b). Space, PageDown and End keys scroll. A Tab to an off-screen link scrolls it into view. A wheel inside a Radix `Select` list scrolls the list, not the page. A textarea scrolls on its own. `/checkout` paused panel and a Radix `Dialog` page lock correctly. With `prefers-reduced-motion: reduce` emulated, scroll is native (no glide). Report the First Load JS change from `pnpm build`.

- [ ] **Step 4b: Mandatory gate for A2 (Bob).** These checks must all run and pass before A2 is committed as done or the PR is opened: (1) the numeric scroll gate, three runs; (2) the navigation checks (link mid-glide, Back, Forward, `scroll={false}`); (3) the nested-scroll checks (seller table, account tabs, thumbnails, open `Select`, open mobile panel); (4) the reduced-motion check: with `prefers-reduced-motion: reduce` emulated before load, `html` has no `lenis` class, no Lenis instance is created, one wheel notch scrolls natively (a 400 px notch moves 400 px, in one or two frames, not 800 over 1.2 s), and the nav background changes at once with no transition (`transition-property` computes to `none`; `motion-reduce:transition-none` clears the property, it does not zero the duration); then switching the emulation off and reloading gives the smooth scroll back. **An unrun, skipped, blocked or failed check holds A2.** "Not evaluated" is not a pass for any of these four. If one cannot run, stop and ask Charlie; do not merge the evidence around it. (Only the two `DATABASE_URL` test files stay "not evaluated", as before, because they are not part of this gate.)
- [ ] **Step 5:** gates for the web app; commit with explicit paths.

## Task A3: Dark ink tokens only (no new file)

Covered by Task A1 Step 2 (token tests) and used by Task 4. No separate commit.

## Task 4: Footer (parity)

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

- [ ] **Step 1b: More failing tests.** The footer uses `bg-ink text-ink-foreground` (a dark card in both themes, per the demo); link text uses `text-ink-muted`; there is one decorative giant wordmark `BOMY` with `aria-hidden="true"` (so screen readers do not read it twice); a divider and the copyright row sit below it. No literal colours.
- [ ] **Step 2: Implement (layout from the spec).** `<footer className="mt-16 px-3 pb-3 sm:px-5 sm:pb-5">` holding `<div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[2.5rem] bg-ink px-6 pt-10 text-ink-foreground md:px-12 md:pt-14">`. Top row: identity block left (existing business text, unchanged), existing link groups right in columns, each group label `font-mono text-xs uppercase tracking-[0.16em] text-ink-muted`. Below: a giant `BOMY` wordmark in `font-display`, sized with `clamp()` against the viewport width, cropped by the card's bottom edge (negative bottom margin plus `overflow-hidden`), then a 1 px divider and the copyright row. Every link, string and `mailto:` stays as it is; only layout and type change. Where a group has no matching content today, do not invent links.
- [ ] **Step 3:** Run footer tests, then commit.

## Task 5: Evidence gates, docs, PR body

- [ ] **Step 0: Geometry against the spec (1440 and 390 px).** Pill x 20 to 1420, height 64, top 16 at 1440; x 12, top 12 at 390. Cart pill and counter: counter rect is inside the cart rect and does not intersect the label rect (assert in the browser, not only by class). Scrolled alpha: computed background alpha about 0.7 at the top and 0.95 after 9 px of scroll; transition 300 ms.
- [ ] **Step 0b: Mobile fit across account states (Bob 3).** At 390, 360 and 320 px, signed out, signed in as a buyer, and signed in as the seeded seller, with the cart at 0, 9 and 99+ items (seed `bomy_cart`, then delete it): no overflow or wrap, hamburger and cart at least 44 px, logo not clipped, same pill content in all three states.
- [ ] **Step 1: 768 px fit (D6 decision gate).** Honest risk: with the full cart pill the row may not fit at 768 px (five links, including "Sell with us" and "Become a provider", are wider than the demo's). In the browser at 767, 768, 900, 1023, 1024 and 1440 px, light and dark, signed out and as the seeded seller: record whether any element overflows or wraps, and the pill's inner width. Apply the D6 fallback order (hide the label below `lg`, then tighten gaps) and re-measure; only then ask Charlie about D6(b).
- [ ] **Step 2: Real pages.** Load `/`, `/products`, `/brands`, `/cart`, `/auth/sign-in`, `/seller/dashboard`, `/account` at 390, 767, 1440 px in light and dark. Check: pill and panel visible, no overlap with page headings, seller sidebar sits below the pill with no double gap, text contrast alpha-composited with zero nodes below 4.5:1.
- [ ] **Step 3: Interaction.** Real keys: Tab order across the pill, focus ring visible on the pill, open the menu, Escape from the menu button and from inside the panel (focus returns only in the second case), scrim click closes, resize 390 to 800 closes the menu. A real toast appears below the pill, not under it (screenshot).
- [ ] **Step 3b: Scrim and hover in a real browser.** At 390 px open the menu and click a point on the page below the panel with a real mouse click (not a script `click()`); the menu must close. Click an empty side gap beside the pill while the menu is closed and confirm the click reaches the content under it. Hover the cart button and the badge: measure the rendered text against the fill, including the `brightness-90` filter, in light and dark (at least 4.5:1 for text, at least 3:1 for the badge ring). Confirm the badge is visible at counts 1 and 99+ (seed the `bomy_cart` local storage item, then delete it).
- [ ] **Step 4: Scroll.** Scroll a long page (`/products`) and capture the pill over content in light and dark; confirm clicks in the side gaps reach the content. On a product page with photos, scroll so a photo sits behind the pill's link text, sample the rendered pixels behind three links, and compute contrast; report the numbers. If any sample is under 4.5:1, raise the resting alpha from 0.7 (not below 0.85) and re-measure. This is a sample, not a guarantee for arbitrary images, and the PR says so.
- [ ] **Step 5: Gates.** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm build` (move `products/loading.tsx` aside and restore it), `pnpm ui:audit --allow-deferred`, `pnpm ui:audit:test`. Report the two `DATABASE_URL` test files as "not evaluated".
- [ ] **Step 6: Docs and PR body.** Note the new tokens in `docs/design-system/README.md`; fix the parent plan (`rounded-bento` from R4 to R2); write `.andy/soft-red-r2-pr-body.md` with only verified claims; evidence file `docs/superpowers/plans/2026-10-17-soft-red-r2-evidence.md`. Stop before the push.

## Self-review

- Spec coverage: floating pill nav (Tasks 2 and A1), blur and scroll alpha (A1), cart pill with inline counter (A1), smooth scroll (A2), mobile panel and scrim (Tasks 1 and 2), footer (Task 4), toast offset (Task 3, follows the new tokens), 768 px fit and D6 (Task 5), dark mode and keyboard (Task 5).
- Not in R2 (stay in R3 to R6, listed in the parity spec): hero bento, marquee, browse bento, filter pills, reveal and hover motion, rotating badge, word reveal, counters. Measure those motions in the slice that builds them.
- Parity changes only the nav, footer and scroll feel. No behaviour of the menu changes; no copy changes; checkout stays off.
- New review risks (A1, A2): contrast on a 70% translucent pill over the busiest content; Lenis fighting Radix scroll locks and nested scrollers; reduced-motion users must get native scroll and no transition; dependency added (D8).
- Placeholders: none. Footer and nav copy are unchanged, so no copy gate applies to R2.
- Type consistency: `nav-clear`, `--nav-offset`, `--scrim`, `bg-scrim`, `rounded-bento` are named the same in every task.
- Bob's two blockers are Task 2 Steps 3b and 3c and Task 5 Step 3b.
- Risk: the sticky wrapper changes stacking. `z-50` stays; the scrim keeps `-z-10` inside the wrapper's stacking context, as today.

## Execution

Not chosen yet. Recommend native for R2: three tightly linked files (nav, toaster, tests) share class contracts, so one agent keeping them in step is safer than splitting.
