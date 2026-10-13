# PR 5d-6 — Nav icon controls onto `Button` and `Badge` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the web nav's icon controls (account/sign-in link, cart link, cart count pill) and the web and admin theme toggles from the shared `Button` and `Badge`, resolving ledger `man-b1`, `man-b2`, `man-b3`, `man-b7`, `man-b18`, while keeping each control's accessible name, destination or action, tab order, hydration behaviour and the nav's mobile layout.

**Architecture:** A small web-only wrapper `NavIconButton` (`apps/web/src/components/nav-icon-button.tsx`) is the shared `Button` (`variant="ghost" size="icon"`) with the nav's look as class overrides (round, `text-muted-foreground`, `hover:bg-muted hover:text-foreground`, 20 px icon). It replaces the duplicated `iconButtonClass` string in `nav-bar.tsx` and `theme-toggle.tsx`. `asChild` keeps `next/link` as the element for the two links. The cart count pill becomes a `Badge` with overrides. The admin toggle becomes a `Button` with its sidebar tokens. `next-themes`, the mounted placeholder, the `aria-label` strings and the icon animations are untouched. The hamburger, the mobile panel and the scrim are **not touched** (5d-7).

**Tech Stack:** React 19, Tailwind 3.4 tokens, `@bomy/ui` Button and Badge, `next-themes`, Vitest 2.1.9 (jsdom per file), Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-6).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d6` from `main` (`b8b75dd`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Do not change:** the hamburger button (`man-b4`), the mobile panel and its rows (`man-b5`), the backdrop scrim, the `mobile-menu` ids and `aria-*`, `NAV_LINKS`, the sign-in/account/seller gating, `SellerAccountMenu` (already `Button`), the nav bar height (`h-14`) and `sticky` position, the toast offset and `man-b9b`, the page and footer cleanups (5d-10), `useCart`, `next-themes` usage, any destination.
- Out of scope: 5d-7 (mobile menu), 5d-10, 5d-2 (Cards, D3), `man-5a3`, the three parked reminders.
- Contrast: text 4.5:1, focus indicators 3:1. Report env-limited tests as "not evaluated".

## Review Focus

- **Names and destinations do not change.** Cart link: name "Cart", `href="/cart"`. Account control: name "Account" with `href="/account"` when signed in, or "Sign in" with `href="/auth/sign-in"` when not. Theme toggle: a `button type="button"` named exactly "Switch to light mode" or "Switch to dark mode". Test each, signed out, buyer and seller, in both clusters (desktop row and mobile cluster).
- **Tab order does not change.** Desktop row: the five links, cart, account (or the seller group), theme toggle. Mobile cluster: theme toggle, cart, hamburger. Test the focusable elements in DOM order before and after; real Tab in the browser.
- **Hydration behaviour is unchanged.** Before mount (`mounted` false) the toggle is the "Switch to dark mode" placeholder with the sun showing; after mount it follows `resolvedTheme`; click calls `setTheme` with the opposite value; no hydration warning in the console. The cart pill appears only when `hydrated && itemCount > 0`, shows `99+` above 99, and re-runs its pop animation when the count changes (`key={itemCount}`).
- **Mobile layout holds.** At 320, 360, 390 and 767 px the bar stays 56 px high with no horizontal overflow; the hamburger keeps its 44 px box and right edge; the theme toggle stays 36 px. The cart's box grows from 24 to 36 px, so the theme toggle and cart each sit 12 px further left; measured before and after. At 768 px the desktop row still clears the logo (today 46 px free with the seller group, the widest case) and nothing overflows.
- **The count pill stays on the icon's top-right corner.** Its centre relative to the icon stays the same (the anchor box grows from 24 to 36 px, so the offsets change from `-right-2 -top-2` to `-right-0.5 -top-0.5`); measured with a cart of 3 and of 100.
- **Focus.** All five controls get the shared `Button` focus style (`focus-visible:ring-1 ring-ring`, outline removed) instead of the browser default outline; the admin toggle keeps its own `ring-2 ring-sidebar-ring`. The ring must be at least 3:1 against the nav background in both themes (test), and visible in the browser with real keys.
- **No new announcement.** The count pill stays unlabeled (it is not read today); no `aria-live` is added. Icons stay `aria-hidden`.

## File Structure

- Create `apps/web/src/components/nav-icon-button.tsx`.
- Modify `apps/web/src/components/nav-bar.tsx` (CartLink, count pill, desktop account link only), `apps/web/src/components/theme-toggle.tsx`, `apps/admin/src/components/theme-toggle.tsx`.
- Create tests: `apps/web/tests/components/nav-icon-controls.test.tsx`, `apps/web/tests/components/theme-toggle.test.tsx`, `apps/admin/tests/components/theme-toggle.test.tsx`; extend `apps/web/tests/design-tokens/status-pairs.test.ts` (ring pair).
- Modify `scripts/ui-audit/exceptions.json` (remove the two `R1-button` theme-toggle exceptions; update the cart-badge `R4-arbitrary` text) and `scripts/ui-audit/findings.json`.

## Edit

1. `NavIconButton` (web):

```tsx
const NavIconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  ),
)
```

`h-9 w-9` (36 px), `transition-colors` and the ring come from `Button`; `[&_svg]:size-5` overrides Button's 16 px icon rule so the 20 px icons stay 20 px.

2. Account link (`man-b1`): `<NavIconButton asChild><Link href={accountLink.href} aria-label={accountLink.label}><User aria-hidden="true" /></Link></NavIconButton>` (the explicit `className="size-5"` on the icon is dropped; the wrapper sets 20 px).

3. Cart link (`man-b2`): `<NavIconButton asChild className="relative [&_svg]:size-6"><Link href="/cart" aria-label="Cart"><ShoppingCart strokeWidth={1.5} aria-hidden="true" />{pill}</Link></NavIconButton>`. The hand-copied heroicons path is removed; the lucide `ShoppingCart` at 24 px with stroke 1.5 is the closest match (the glyph's shape differs slightly: disclosed). The hit area grows from 24 to 36 px and gains the same round hover as the account and theme buttons.

4. Count pill (`man-b3`): `<Badge key={itemCount} variant="default" className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-badge-pop justify-center border-0 p-0 text-[10px] font-bold motion-reduce:animate-none">{itemCount > 99 ? "99+" : itemCount}</Badge>`. `text-[10px]` stays arbitrary (there is no 10 px step), so the existing `R4-arbitrary` exception is updated to the new class string.

5. Web `ThemeToggle` (`man-b7`): the `<button>` becomes `<NavIconButton type="button" onClick=... aria-label=... className={cn("relative", className)}>` with the two icons unchanged (`absolute size-5 transition-[transform,opacity] ...`).

6. Admin `ThemeToggle` (`man-b18`): `<Button type="button" variant="ghost" size="icon" ... className={cn("relative h-8 w-8 shrink-0 rounded-full text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-strong focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-4", className)}>` (32 px, sidebar tokens and ring as today).

**D13 (open question for Bob and Charlie):** the ledger says "share one component" for the two theme toggles. The web and admin toggles differ in size (36 vs 32 px), colour tokens and focus ring, and a shared one would have to live in `@bomy/ui` and add a `next-themes` dependency to that package. **Recommended:** keep one toggle per app, each built on the shared `Button`, and resolve `man-b7`/`man-b18` on that basis (the duplicated class string is gone: web uses `NavIconButton`, admin uses its sidebar tokens). The alternative is a shared `ThemeToggle` in `@bomy/ui` taking tokens as props.

---

### Task 1: Baselines on today's controls (no source change)

**Files:** Create `apps/web/tests/components/nav-icon-controls.test.tsx`, `apps/web/tests/components/theme-toggle.test.tsx`, `apps/admin/tests/components/theme-toggle.test.tsx`; create (uncommitted) `.andy/pr5d6-nav-baseline.json`.

**Interfaces:** Consumes `NavBar`, web `ThemeToggle`, admin `ThemeToggle`; mocks `next-auth/react`, `@/lib/cart`, `next-themes`.

- [ ] **Step 1 (jsdom, `// @vitest-environment jsdom`, `NavBar`):** for signed out, buyer and seller: (a) each control by role and accessible name ("Cart", "Sign in" or "Account", the theme toggle both labels) with its tag (`a` or `button`) and `href`; (b) the focusable elements, in DOM order, of the desktop row and of the mobile cluster as lists of `(name, tag)`; (c) the cart pill with `itemCount` 0 (absent), 3 (text "3"), 100 ("99+"), and `hydrated: false` with 3 (absent); (d) the "Today" class tokens of the account link, the cart link, the pill and the toggle; (e) the hamburger is unchanged (`aria-label` flips with click, `aria-expanded`, `aria-controls`); (f) no element in the controls has `aria-live`, and the pill has no `aria-label`.
- [ ] **Step 2 (jsdom, each `ThemeToggle`):** mock `useTheme` to return `{ resolvedTheme, setTheme }`. Before the effect runs the label is "Switch to dark mode" and the sun has the visible tokens; after mount with `resolvedTheme: "dark"` the label is "Switch to light mode" and the moon is visible; click calls `setTheme("light")` from dark and `setTheme("dark")` from light; `type="button"`; the icons are `aria-hidden`; the class tokens "Today".
- [ ] **Step 3 (browser baseline, Playwright, uncommitted):** with the local web app, signed out and as the seeded seller, with a cart of 3 in `localStorage.bomy_cart`: at 320, 360, 390, 767, 768, 800 and 1280 px record the bounding boxes of the logo, the five links (desktop), the cart, the account control, the theme toggle, the hamburger and the cart pill; the nav height; `scrollWidth - innerWidth`; the pill's centre relative to the cart icon's top-right corner; each control's hover background and its focus style (box shadow and outline) after a real Tab. Save to `.andy/pr5d6-nav-baseline.json`.
- [ ] **Step 4:** run the jsdom tests on unchanged source: expect PASS. Mutation-check four: rename a toggle label, change the cart `href`, drop the `hydrated` guard, swap two focusable elements; each must fail; restore.
- [ ] **Step 5:** commit the three test files by explicit path: `test(ui): baseline of the nav icon controls and theme toggles (5d-6)`.

### Task 2: `NavIconButton` and the web swaps

**Files:** Create `apps/web/src/components/nav-icon-button.tsx`; modify `apps/web/src/components/nav-bar.tsx`, `apps/web/src/components/theme-toggle.tsx`.

- [ ] **Step 1:** Create the wrapper and apply Edit items 1 to 5. Only the account link, `CartLink` and its pill, and the web toggle change in `nav-bar.tsx`; `git diff` must show the hamburger, panel, scrim and `NAV_LINKS` untouched.
- [ ] **Step 2:** Add the focus-ring contrast test: `--ring` against `--card` is at least 3:1 in light and dark (non-text indicator). If it fails, record it and do not change the token here.
- [ ] **Step 3:** Run the Task 1 tests; update only the class-token expectations (the "Today" lists) and add the new ones (`Button` classes, `bg-primary text-primary-foreground` pill from `Badge variant="default"`). Names, hrefs, tab order, the pill rules and the hydration tests must pass unchanged.
- [ ] **Step 4:** Typecheck, lint, the existing `nav-bar.test.tsx` unchanged and passing. Commit explicit paths: `refactor(ui): web nav icon controls and theme toggle use Button and Badge (5d-6)`.

### Task 3: Admin theme toggle

**Files:** `apps/admin/src/components/theme-toggle.tsx`.

- [ ] **Step 1:** Apply Edit item 6. Update the admin toggle test (written in Task 1) only for the class tokens. Admin typecheck, lint and the admin `sidebar.test.tsx` unchanged and passing. Commit: `refactor(ui): admin theme toggle uses Button (5d-6)`.

### Task 4: Ledger and scanner exceptions

- [ ] **Step 1:** Remove the two `R1-button` theme-toggle exceptions and update the cart-badge `R4-arbitrary` exception text to the new class string, in `scripts/ui-audit/exceptions.json`. Resolve `man-b1`, `man-b2`, `man-b3`, `man-b7`, `man-b18` in `findings.json` with evidence that cites only what was done and what was not browser-evaluated; `man-b7`/`man-b18` evidence states the D13 outcome. Keep `ensure_ascii=True`, indent 2.
- [ ] **Step 2:** Expect **25 deferred, 72 resolved** (97 entries); scanner 0 deferred and 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit both files.

### Task 5: Browser proof and gates; stop before the push

- [ ] **Step 1 (M1, compare with the baseline):** repeat the Task 1 browser capture. Expected differences only: the cart box 24 to 36 px (so the theme toggle and cart sit 12 px further left in the mobile cluster, and the desktop cart and its right neighbours shift as the row grows 12 px), the cart gaining a round hover, and the new focus ring style. Everything else (logo, links, account 36 px, theme 36 px, hamburger box and right edge, nav height, pill centre relative to the icon, no overflow at 320, 360, 390, 767, 768, 800 and 1280, the free space beside the logo at 768 at least 24 px) must equal the baseline.
- [ ] **Step 2 (M2, real keys, desktop and mobile):** Tab through the nav in order; each control shows the 1 px ring (admin toggle 2 px); Enter on the cart and account links navigates; Enter and Space on the theme toggle switch the theme and the label flips; the hamburger still opens and closes (smoke only). Light and dark. Console: no hydration warning.
- [ ] **Step 3 (M3, admin):** the admin toggle on `/auth/sign-in` or the sidebar if an admin session is available (try once); otherwise cover it with the jsdom test and report the browser as not evaluated.
- [ ] **Step 4 (M4):** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites (not only the touched files), `@bomy/ui` typecheck, both builds (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and audit tests. Check `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 5:** Write `.andy/pr5d6-pr-body.md` (format of the 5d-11 body; ends with the 🤖 line; lists what was preserved, the measured deltas, the visible changes (cart glyph shape, bigger cart target and round hover, new focus ring style), D13 and the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d6-nav-icon-controls.md`, handoff, memory, delete branch.

## Visible changes to disclose

1. The cart glyph is lucide's `ShoppingCart` at stroke 1.5 instead of the hand-copied heroicons path (slightly different shape).
2. The cart's click target grows from 24 to 36 px and gets the same round hover as the account and theme buttons; in the mobile cluster the theme toggle and cart move 12 px left.
3. The five controls show the shared 1 px ring (admin toggle 2 px, as today) instead of the browser default outline when focused by keyboard.

## Self-review

- **Coverage:** `man-b1` (account link), `man-b2` (cart link), `man-b3` (pill), `man-b7` (web toggle), `man-b18` (admin toggle) each map to an Edit item and to tests in Tasks 1 and 2 or 3. `man-b4`, `man-b5` and `man-b9b` stay for 5d-7.
- **Risk, in order:** the cart pill drifting off the icon's corner; the desktop row crowding the logo at 768 px; a changed accessible name or tab order; a hydration warning from the toggle; the ring being invisible on the nav background.
