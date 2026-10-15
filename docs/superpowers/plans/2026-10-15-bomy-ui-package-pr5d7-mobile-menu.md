# PR 5d-7 — Mobile menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear ledger entries `man-b4` (hand-made hamburger), `man-b5` (hand-built mobile panel and its link rows) and `man-b9b` (toast offset hard-coded to the NavBar height) in `apps/web/src/components/nav-bar.tsx` and `toaster.tsx`, keep the three-bar morph (D6, decided by Charlie), and close the two keyboard/resize gaps found by reading the code (D29, D30).

**Architecture:** (1) The hamburger becomes the nav's `NavIconButton` (the shared `Button`, ghost, icon) with the three bar `span`s kept as its children, so the transform/opacity transitions and their `motion-reduce:transition-none` rules do not change. (2) The panel stays inside the NavBar as a disclosure (button with `aria-expanded` and `aria-controls`, a list of links); it is not moved to a Popover or Sheet (D28). Its link rows become `Button asChild variant="ghost"` with `next/link`. (3) One `--nav-height` CSS variable (3.5rem) feeds the bar height, the scrim top and the toast offset, so the three values can no longer drift (D32). (4) Small behaviour fixes with tests first: Escape returns focus to the hamburger (D29); reaching the `md` breakpoint closes the menu so it cannot reappear open at 767 px (D30).

**Tech Stack:** React 19, `@bomy/ui/button`, Tailwind 3.4 (`theme.extend.spacing`), Vitest 2.1.9 (jsdom per file), Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-7).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d7` from `main` (`534764e`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Out of scope:** the desktop nav row, the seller account menu (`DropdownMenu`), the cart link and badge, the theme toggle, the admin app; 5d-2 and D3; `man-5a3`; the parked magnetic drop zone and hold-to-confirm; any change to which links appear (`NAV_LINKS`, sign-in/account/seller rows and their order).
- Keep: the 56 px bar, the 44 px hamburger target, the bar morph (spring ease, 300 ms; opacity 150 ms), `motion-reduce:transition-none`, the panel slide/fade (`duration-200`), the `inert` closed panel, `aria-label` "Open menu"/"Close menu", `aria-expanded`, `aria-controls="mobile-menu"`, the scrim colour and `md:hidden` on every mobile-only block. Contrast: text 4.5:1, focus indicators 3:1. Report env-limited tests as "not evaluated". Evidence text may cite only what was actually verified.

## Review Focus

- **The menu works with real keys at 390 and 767 px.** Tab reaches the hamburger; Enter and Space open it; `aria-expanded` and the label flip; Tab then moves through every row in order; Enter on a row navigates (client navigation) and closes the menu; Escape closes it and focus ends on the hamburger, whether focus was on the hamburger or on a row (D29); a click on the scrim closes it; a click on the hamburger again closes it.
- **The desktop transition at 768 px is clean.** At 768 px the hamburger, the panel and the scrim are gone and the desktop row shows. A menu left open at 767 px is closed after crossing to 768 px and stays closed when going back to 767 px (D30).
- **Nothing looks different.** Measured in light and dark at 390, 767 and 768 px: the hamburger (box, radius, colours, hover), the three bars in the closed and open states, the panel (box, border, shadow, row boxes, text size/weight/colour, hover), the scrim box, and the toast container's top edge. The only expected differences are the focus indicators (see below).
- **The bars still morph and respect reduced motion.** Closed: top bar `-translate-y-1.5`, middle `opacity-100`, bottom `translate-y-1.5`. Open: both outer bars rotate +/-45 degrees to the centre, the middle fades. With `prefers-reduced-motion: reduce` there is no transition (computed `transition-duration` 0s).
- **One nav height.** `--nav-height` is the only place that says 3.5rem. The bar is `h-nav` (56 px), the scrim starts at `top-nav`, the toast container's top edge is 72 px. The guard test reads the variable instead of two class strings.
- **Focus indicators are visible.** The hamburger and the rows show the Button's 1 px ring (`ring-ring`) on keyboard focus. Before, they used the browser default. Ring colour against the panel/page background is checked at 3:1 or better.

## File Structure

- Modify `apps/web/src/components/nav-bar.tsx`, `apps/web/src/components/toaster.tsx`, `apps/web/src/app/globals.css` (add `--nav-height`), `apps/web/tailwind.config.ts` (add `spacing.nav`).
- Create `apps/web/tests/components/nav-bar-mobile-menu.test.tsx` (jsdom interaction tests; the existing `nav-bar.test.tsx` string tests stay).
- Modify `apps/web/tests/components/toaster-position-guard.test.ts` (reads the variable).
- Modify `scripts/ui-audit/findings.json` and `scripts/ui-audit/exceptions.json` (the hamburger `<button` exception goes stale; the scrim and toaster exception texts change with their class strings).

## Decisions for Bob and Charlie

- **D6 (decided by Charlie):** keep the three-bar morph inside the shared `Button`; no lucide `Menu`/`X`.
- **D28 (panel stays a disclosure):** the panel is not rebuilt on Radix `Popover` or a new `Sheet`. It is the standard "disclosure navigation" pattern (a button that shows and hides a list of links), it is part of the sticky bar, and the `Popover` would portal it away from the bar, need an anchor plus a full-width override, and move focus into the content on open (a behaviour change). The ledger text allows "Popover or a Sheet"; I resolve `man-b5` by putting the rows on `Button` and fixing the real gaps, and say so in the evidence. The alternative is a `Popover`/`Sheet` rebuild; it is a larger behaviour change with no user-visible gain today. Recommended: keep the disclosure.
- **D29 (Escape returns focus):** when the menu closes with Escape, focus goes to the hamburger. Today, Escape closes the panel and sets it `inert`; if focus was on a row, it is dropped to the page. Recommended: yes. (Confirmed in Task 1 with a real key before the fix.)
- **D30 (crossing `md` closes the menu):** a `matchMedia("(min-width: 768px)")` listener sets `open` to false. Today `open` stays true while the panel is hidden by `md:hidden`, so going back to 767 px shows it open again. Recommended: yes. (Confirmed in Task 1 before the fix.)
- **D31 (hamburger look):** `NavIconButton` with `size-11 rounded-md`: 44 px box, `rounded-md`, the same muted colour and `hover:bg-muted hover:text-foreground` as today. The nav's other icons are 36 px round; the hamburger keeps its 44 px target and square-ish shape. The browser-default focus outline becomes the Button's 1 px ring.
- **D32 (one nav height):** `--nav-height: 3.5rem` in `globals.css`; Tailwind `spacing.nav = var(--nav-height)` gives `h-nav` and `top-nav`; the toast container uses `top-[calc(var(--nav-height)+1rem)]` (arbitrary value, kept as a scanner exception with an updated reason). Rendered values unchanged: 56 px bar, 72 px toast.
- **D33 (rows):** `Button asChild variant="ghost"` with `h-auto justify-start rounded-md px-3 py-3 text-base font-normal text-foreground hover:bg-muted`. Button's `whitespace-nowrap` is accepted (the longest label, "Become a provider", is far narrower than the panel at 320 px; checked in Task 7).

## Edit

1. `globals.css`: add `--nav-height: 3.5rem;` to the base `:root` block. `tailwind.config.ts`: `extend.spacing: { nav: "var(--nav-height)" }`.
2. `nav-bar.tsx`: `mx-auto flex h-nav max-w-6xl ...`; scrim `fixed inset-x-0 bottom-0 top-nav -z-10 ...`; hamburger:

```tsx
<NavIconButton
  ref={triggerRef}
  type="button"
  onClick={() => setOpen((value) => !value)}
  aria-label={open ? "Close menu" : "Open menu"}
  aria-expanded={open}
  aria-controls="mobile-menu"
  className="size-11 rounded-md"
>
  {/* the same three bar spans, unchanged */}
</NavIconButton>
```

rows:

```tsx
<Button
  key={link.href}
  asChild
  variant="ghost"
  className="h-auto justify-start rounded-md px-3 py-3 text-base font-normal text-foreground hover:bg-muted"
>
  <Link href={link.href} onClick={() => setOpen(false)}>
    {link.label}
  </Link>
</Button>
```

Escape handler (D29): on Escape, `setOpen(false)` and `triggerRef.current?.focus()`. Resize (D30): `useEffect` with `window.matchMedia("(min-width: 768px)")`, `change` listener closing the menu. 3. `toaster.tsx`: `top-[calc(var(--nav-height)+1rem)]` in place of `top-[4.5rem]`.

---

### Task 1: Baselines on today's markup (no source change)

**Files:** create `apps/web/tests/components/nav-bar-mobile-menu.test.tsx`; create (uncommitted) `.andy/pr5d7-baseline.json`.

- [ ] **Step 1 (jsdom, mock `next-auth/react`, `@/lib/cart`, `@/components/theme-toggle`):** hamburger: `type=button`, label "Open menu", `aria-expanded=false`, `aria-controls=mobile-menu`, class tokens (`rounded-md`, `p-2.5`, `text-muted-foreground`, `hover:bg-muted`, `hover:text-foreground`); the three bars: closed and open class tokens (translate/rotate/opacity, `ease-spring`, `motion-reduce:transition-none`); click opens: label "Close menu", `aria-expanded=true`, panel no longer `inert`, scrim present; second click closes; Escape closes (and the listener exists only while open); a row click closes; a scrim click closes; the rows: items and order for signed out, buyer and seller_owner, and the row class tokens (`rounded-md px-3 py-3 text-base text-foreground hover:bg-muted`); the scrim `top-14`, the bar `h-14`.
- [ ] **Step 2 (browser baseline, Playwright, uncommitted):** signed in as the seeded seller (Mailhog magic link). Digests (box, radius, colours, hover, bars' transforms, panel box/border/shadow/row boxes/text, scrim box, toast container top) in light and dark at 390, 767 and 768 px, closed and open. Toast: drop a text file on the product edit page upload box to raise the "Only image files are allowed" toast, then measure the container's top. **Real keys:** Tab to the hamburger; Enter and Space; Tab through the rows; Enter on a row; Escape from the hamburger; Escape with focus on a row (record where focus lands); scrim click; open at 767 px then resize to 768 and back to 767 (record whether it is open again). Reduced motion: `prefers-reduced-motion: reduce` and the computed bar `transition-duration`. Save to `.andy/pr5d7-baseline.json`.
- [ ] **Step 3:** run the new tests on unchanged source: PASS. Mutation-check four (drop `aria-expanded`; remove the Escape listener; remove the row `onClick` close; change the bar `-translate-y-1.5`); each must fail; restore.
- [ ] **Step 4:** commit the test by explicit path: `test(ui): baseline of the web mobile menu (5d-7)`.

### Task 2: One `--nav-height` (`man-b9b`)

- [ ] **Step 1:** update `toaster-position-guard.test.ts` first to read `--nav-height` from `globals.css`, the bar `h-nav`, the scrim `top-nav` and the toast `top-[calc(var(--nav-height)+1rem)]` (fails). Also update the jsdom baseline tokens `h-14`/`top-14` to `h-nav`/`top-nav`.
- [ ] **Step 2:** apply Edit 1, the `h-nav`/`top-nav` part of Edit 2 and Edit 3. Run the guard and nav tests: PASS. Check computed heights in Task 7. Commit: `refactor(ui): share one --nav-height between the nav bar, scrim and toasts (5d-7)`.

### Task 3: Hamburger on `NavIconButton` (`man-b4`)

- [ ] **Step 1:** apply the hamburger part of Edit 2 with `triggerRef` (unused until Task 5; add it in Task 5 instead so Task 3 stays small). Update only the hamburger token expectations (`size-11 rounded-md`, `text-muted-foreground`, `hover:bg-muted`); the bars tests pass unchanged. Commit: `refactor(ui): hamburger button uses NavIconButton (5d-7)`.

### Task 4: Rows on `Button` (`man-b5`)

- [ ] **Step 1:** apply the rows part of Edit 2. Update only the row token expectations; items, order, close-on-click tests pass unchanged. Commit: `refactor(ui): mobile menu rows use Button (5d-7)`.

### Task 5: Escape focus return and closing at `md` (D29, D30)

- [ ] **Step 1 (tests first):** with the menu open and focus on a row, Escape closes it and `document.activeElement` is the hamburger; with focus on the hamburger it stays there; with a `matchMedia` mock, a `change` to matches closes an open menu and it stays closed when it changes back. Run: FAIL.
- [ ] **Step 2:** implement `triggerRef`, the Escape focus call and the `matchMedia` effect. Run: PASS. Commit: `fix(ui): Escape returns focus to the menu button and crossing md closes the menu (5d-7)`.

### Task 6: Ledger

- [ ] **Step 1:** Run the scanner. Remove the stale hamburger `R1-button` exception; update the scrim `R3b-bg-without-literal-text` text (`top-nav`) and the toaster `R4-arbitrary` text and reason. Resolve `man-b4`, `man-b5` and `man-b9b` with evidence limited to what was verified (including D28 and that the panel stays a disclosure). Expect **8 deferred (7 Cards + `man-5a3`), 89 resolved** (97 entries); scanner 0 deferred, 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit.

### Task 7: Browser proof and gates; stop before the push

- [ ] **Step 1 (compare with the baseline):** repeat the Task 1 capture; expected differences: focus indicators only, plus the two fixed behaviours (D29, D30). Report any other difference.
- [ ] **Step 2 (real keys, 390 and 767 px; transition at 768 px):** the Review Focus list: Tab, Enter, Space, rows, Enter on a row, Escape from the hamburger and from a row (focus on the hamburger), scrim click, hamburger toggle; open at 767 px, resize to 768 (menu, scrim and hamburger gone, desktop row present), back to 767 (menu closed). Also 320 px for the row `nowrap` check, and reduced motion.
- [ ] **Step 3:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites, `@bomy/ui` typecheck, `pnpm build` (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and tests; `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 4:** Write `.andy/pr5d7-pr-body.md` (format of the 5d-12 body; ends with the 🤖 line; D6, D28 to D33, measured deltas, visible and non-visual changes, observations, not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d7-mobile-menu.md`, handoff, memory, delete branch.

## Visible and non-visual changes to disclose

1. Escape now returns focus to the hamburger (D29). New behaviour.
2. The menu closes when the viewport reaches 768 px (D30). New behaviour.
3. Keyboard focus on the hamburger and on the rows shows the Button's 1 px ring instead of the browser default (D31, D33).
4. `--nav-height` and `spacing.nav` added; rendered sizes unchanged (D32).
5. One scanner exception removed, two updated.
6. No other visual change expected; measured.

## Self-review

- **Coverage:** `man-b4` → Task 3; `man-b5` → Tasks 4 and 5 and D28; `man-b9b` → Task 2; the 390/767/768 real-key checks → Tasks 1 and 7.
- **Risks, in order:** a stuck or lost open state (Escape, resize, link tap); `tailwind-merge` dropping a class when the Button's defaults meet the overrides (`rounded-control` vs `rounded-md`, `font-medium` vs `font-normal`, `text-sm` vs `text-base`; check computed styles, not class strings); `whitespace-nowrap` on long labels at 320 px; the `matchMedia` effect in SSR (guard for `window`) and in jsdom (mock); `h-nav`/`top-nav` not generated by Tailwind (the build and the browser measurement catch it); the toast offset drifting if `--nav-height` changes (the guard test).
