# PR 5d-8 — Sidebar links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear ledger entry `man-t11` by moving the hand-made sidebar link styling in the seller dashboard layout (web) and the admin sidebar onto one shared `SidebarLink`, and give the active admin sidebar link `aria-current="page"`, which it lacks today.

**Architecture:** One new `@bomy/ui` piece, `SidebarLink` (`packages/ui/src/components/sidebar-link.tsx`, export `@bomy/ui/sidebar-link`), written like `FilterTab`: an `a` or, with `asChild`, any child element (`next/link`), carrying `aria-current="page"` only when `active`, the sidebar focus ring, and the active and inactive looks. An `orientation` variant covers the two existing shapes: `list` (admin sidebar, seller sidebar from `md` up) and `strip` (the seller dashboard's scrolling tab strip on small screens, which turns into the `list` look at `md`). The active-matching rules stay where they are in each caller. The seller layout's scroll-into-view effect keeps finding the active link through `[aria-current="page"]`.

**Tech Stack:** React 19, `@radix-ui/react-slot`, class-variance-authority, Tailwind 3.4 sidebar tokens, Vitest 2.1.9 (jsdom per file), Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-8).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d8` from `main` (`26259f6`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Out of scope:** 5d-7 (the web NavBar hamburger, mobile panel and `man-b9b`) and D6; 5d-2 and D3; 5d-12; `man-5a3`; the admin mobile menu's open/close behaviour, the admin `ThemeToggle`, the sign-out button; the way each caller decides which link is active; the nav items and their order.
- Keep the 5a navy sidebar tokens, the 2 px inset focus ring, the `whitespace-nowrap` strip, the scroll-active-into-view effect and every existing layout/sidebar test.
- Contrast: text 4.5:1, focus indicators 3:1. Report env-limited tests as "not evaluated". Evidence text may cite only what was actually verified.

## Review Focus

- **The active link says so to assistive technology, in both apps.** On a route represented in a list, exactly one link carries `aria-current="page"`: the seller strip/sidebar, the admin desktop sidebar, and the admin mobile panel. An unmatched admin route has no current link, preserving today's matching rule. Inactive links have no `aria-current` attribute at all (not `"false"`). The admin gap (no `aria-current` today, found by Bob) is closed and asserted in the admin sidebar test.
- **Nothing looks different.** Every link keeps its padding (`px-5 py-2` seller, `px-4 py-2` admin), text, hover (`hover:bg-sidebar-accent hover:text-sidebar-strong`), active fill, indicator border (left on the list, bottom on the seller strip below `md`, left again from `md`), and focus ring. Measured: each link's box, fill, text colour and border in light and dark, at 390, 768 and 1280 px, before and after.
- **The seller strip still scrolls the active tab into view.** The effect finds the active link by `[aria-current="page"]`; the existing strip-scroll tests (Orders scrolls to 155, Overview stays at 0) must pass unchanged, and the browser at 390 px shows the Orders tab fully inside the strip on load.
- **Links stay real links.** `next/link` remains the element (via `asChild`): same `href`, client navigation, no swallowed click (the existing "does not swallow a click on Orders" test). The admin links still close the mobile menu on click.
- **Active matching is unchanged.** Seller: Overview matches exactly, the others by prefix. Admin: every item by prefix (as today). Both stay in their callers; the shared piece only receives `active`.
- **Keyboard.** Tab order unchanged (every link, in order); the ring is visible on each link in both themes; focus rings use `--sidebar-ring` on `--sidebar` and are >= 3:1 in both themes in both apps (existing token test or a new pair).

## File Structure

- Create `packages/ui/src/components/sidebar-link.tsx`; modify `packages/ui/package.json` (add `"./sidebar-link": "./src/components/sidebar-link.tsx"`).
- Modify `apps/web/src/app/seller/dashboard/layout.tsx` and `apps/admin/src/components/sidebar.tsx`.
- Create `apps/web/tests/components/sidebar-link.test.tsx` (the shared piece, tested from the web app like `filter-tabs.test.tsx`).
- Modify `apps/web/tests/seller-dashboard/layout.test.tsx` (class-token expectations only, plus an `aria-current` count) and `apps/admin/tests/components/sidebar.test.tsx` (baseline of the missing `aria-current`, then the assertion).
- Modify `scripts/ui-audit/findings.json` (and `exceptions.json` only if a matched string disappears).

## Decisions for Bob and Charlie

- **D21 (shared piece):** `SidebarLink` lives in `@bomy/ui` (as the approved inventory says: "one `SidebarLink` used by the seller layout and the admin sidebar"), with `asChild` like `FilterTab`. The alternative, two local copies of the class string, is what exists today.
- **D22 (`aria-current` on both admin lists):** the desktop sidebar and the mobile panel each get an active link with `aria-current="page"`. The mobile panel is `hidden` while closed, so a screen reader sees one. The test asserts both lists.
- **D23 (active matching stays local):** admin keeps `pathname.startsWith(item.href)` and seller keeps exact-for-Overview. A prefix rule can mark a sibling route active (for example a future `/products-archive` under `/products`); that is a separate fix and is listed in the PR body as an observation, not changed here.

## Edit

1. `sidebar-link.tsx`:

```tsx
const sidebarLinkVariants = cva(
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
  {
    variants: {
      orientation: {
        list: "",
        strip: "whitespace-nowrap",
      },
      active: { true: "", false: "hover:bg-sidebar-accent hover:text-sidebar-strong" },
    },
    compoundVariants: [
      {
        orientation: "list",
        active: true,
        className: "border-l-2 border-sidebar-indicator bg-sidebar-accent text-sidebar-strong",
      },
      {
        orientation: "strip",
        active: true,
        className:
          "border-b-2 border-sidebar-indicator bg-sidebar-accent text-sidebar-strong md:border-b-0 md:border-l-2",
      },
    ],
    defaultVariants: { orientation: "list", active: false },
  },
)
```

`SidebarLink` forwards a ref, takes `active?: boolean`, `asChild?: boolean`, `orientation`, sets `aria-current={active ? "page" : undefined}`, and merges `className` last.

2. Seller layout: each item becomes `<SidebarLink asChild orientation="strip" active={active} className="px-5 py-2"><Link href={item.href}>{item.label}</Link></SidebarLink>`; the `aria-current` spread and the hand-written class list go; the scroll effect stays as is.
3. Admin `NavLinks`: `<SidebarLink asChild active={active} className="px-4 py-2"><Link href={item.href} {...(onNavigate ? { onClick: onNavigate } : {})}>{item.label}</Link></SidebarLink>`.

---

### Task 1: Baselines on today's markup (no source change)

**Files:** modify `apps/web/tests/seller-dashboard/layout.test.tsx` and `apps/admin/tests/components/sidebar.test.tsx`; create (uncommitted) `.andy/pr5d8-baseline.json`.

- [ ] **Step 1 (seller, jsdom):** extend the layout test: for each of the five paths the active link has exactly the classes `border-b-2 border-sidebar-indicator bg-sidebar-accent text-sidebar-strong md:border-b-0 md:border-l-2` and every link has `whitespace-nowrap px-5 py-2` and the focus ring tokens; inactive links have `hover:bg-sidebar-accent hover:text-sidebar-strong` and no `aria-current` attribute; exactly one `aria-current="page"`.
- [ ] **Step 2 (admin, jsdom):** extend the sidebar test: the active link's classes (`border-l-2 border-sidebar-indicator bg-sidebar-accent text-sidebar-strong`), the padding `px-4 py-2`, the focus tokens, the inactive hover tokens; **and** a test named `has no aria-current today` asserting zero `aria-current` attributes in both lists (the baseline of the gap; Task 4 flips it). Mock `usePathname` to `/stores` and to `/store-categories` to check the prefix rule gives one active link per list, and to an unmatched route to check it gives none.
- [ ] **Step 3 (browser baseline, Playwright, uncommitted):** seller sidebar signed in as the seeded seller (Mailhog magic link) at 390, 768 and 1280 px, light and dark, on `/seller/dashboard`, `/seller/dashboard/orders` and `/seller/dashboard/products`: every link's box, fill, text colour, border widths/colour and padding; the strip's `scrollLeft` and the Orders link inside the strip at 390 px; real Tab ring on each link. Admin (no admin session in Playwright): a temporary harness page under `/auth/sign-in/zz-harness` that renders the real `Sidebar` and calls `history.pushState(null, "", "/stores")` so `usePathname` reports an active route (if the pathname does not update, report the admin active state as not evaluated in the browser); record the same measurements at 390 and 1280 px. Save to `.andy/pr5d8-baseline.json`.
- [ ] **Step 4:** run the tests on unchanged source: expect PASS. Mutation-check four: drop the seller `aria-current`, change the seller Overview exact match, change an admin nav `href`, remove the admin `onNavigate` click handler; each must fail; restore.
- [ ] **Step 5:** commit the test files by explicit path: `test(ui): baseline of the seller and admin sidebar links (5d-8)`.

### Task 2: `SidebarLink` in `@bomy/ui`

**Files:** `packages/ui/src/components/sidebar-link.tsx`, `packages/ui/package.json`, `apps/web/tests/components/sidebar-link.test.tsx`.

- [ ] **Step 1:** write `sidebar-link.test.tsx` first (fails: module missing): renders an `a` by default and the child element with `asChild`; `aria-current="page"` only when `active` and the attribute absent otherwise; `list` and `strip` looks (the exact class sets in Edit 1, active and inactive); the focus-ring tokens; `className` appended and able to override padding; props such as `onClick` and `href` reach the element through `asChild` with a `next/link`-like anchor; ref forwarded.
- [ ] **Step 2:** implement `sidebar-link.tsx` and the package export. Run the new test, `@bomy/ui` typecheck and lint. Commit: `feat(ui): SidebarLink piece for the seller and admin sidebars (5d-8)`.

### Task 3: Seller layout

- [ ] **Step 1:** Apply Edit 2. Update only the token expectations in `layout.test.tsx` (the active/inactive class sets are produced by `SidebarLink` now; the strings stay the same). The strip-scroll tests pass unchanged. Commit: `refactor(ui): seller dashboard sidebar uses SidebarLink (5d-8)`.

### Task 4: Admin sidebar and `aria-current`

- [ ] **Step 1:** Apply Edit 3. Flip the baseline test: for a represented route, exactly one `aria-current="page"` in the desktop list and one in the mobile panel, on the active item; none on the others. For an unmatched route, neither list has a current link. Commit: `refactor(ui): admin sidebar uses SidebarLink and marks the current page (5d-8)`.

### Task 5: Ledger

- [ ] **Step 1:** Run the scanner (expect no exception changes). Resolve `man-t11` with evidence limited to what was verified, including the admin `aria-current` addition and the shared piece. Expect **12 deferred, 85 resolved** (97 entries); scanner 0 deferred, 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit.

### Task 6: Browser proof and gates; stop before the push

- [ ] **Step 1 (compare with the baseline):** repeat the Task 1 capture; expected differences: none visual. The seller strip at 390 px still shows the active tab inside the strip; on represented routes, the accessibility tree (or `getAttribute`) shows one `aria-current="page"` per list in both apps, including the admin desktop and mobile lists on the harness.
- [ ] **Step 2 (real keys):** Tab through each sidebar: the 2 px inset ring on every link in both themes; Enter on a seller link navigates without a full reload (a `window` marker survives); on the admin harness, a link click closes the mobile panel.
- [ ] **Step 3:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites, `@bomy/ui` typecheck, `pnpm build` (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and tests; `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 4:** Write `.andy/pr5d8-pr-body.md` (format of the 5d-9 body; ends with the 🤖 line; D21 to D23, measured deltas, the visible and non-visual changes, the prefix-matching observation, the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d8-sidebar-links.md`, handoff, memory, delete branch.

## Visible and non-visual changes to disclose

1. Admin sidebar active link gains `aria-current="page"` (no visual change).
2. A new shared piece, `@bomy/ui/sidebar-link`, replaces two copies of the same class string.
3. No visual change is expected; measured.

## Self-review

- **Coverage:** `man-t11` and the admin `aria-current` gap → Tasks 2 to 4; baselines in Task 1; ledger in Task 5.
- **Risks, in order:** the seller strip's scroll effect losing its anchor (it depends on `aria-current`); `tailwind-merge` dropping or reordering a class when `className` is merged (check computed styles, not class strings, as in 5d-9); the `strip` active border switching at `md`; `asChild` swallowing `onClick` on the admin links (the mobile menu close); the admin active prefix rule marking two links.
