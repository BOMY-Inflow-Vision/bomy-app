# Seller dashboard nav: restore the Orders link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v2, DRAFT** (v1 was reviewed by Bob and Charlie, who agreed on the scope and found three plan errors; see "Changes from v1"). Do not start Task 1 until Bob and Charlie approve this plan.

**Goal:** Sellers can open their Orders page from the dashboard sidebar. Today the link is dead.

**Architecture:** `apps/web/src/app/seller/dashboard/layout.tsx` builds the sidebar from a `NAV` array and marks every item except four as "coming soon" (`href="#"`, `preventDefault`, a "soon" pill). `/seller/dashboard/orders` was built in Stage 5 and the list in the layout was never updated, so Orders is the only item wrongly marked. After the fix **no item is coming soon**, so the whole coming-soon mechanism (`isComingSoon`, the `#` href, the click handler, the pill, the muted style) is removed instead of being patched for one more exception. A regression test pins the behaviour. Nothing else in the layout changes.

**Tech Stack:** Next 15.5 (client layout, `usePathname`), React 19, Vitest 2.1.9 with a per-file jsdom environment (`react-dom/client` + `act`, the house style; no Testing Library).

**Spec:** none (bug fix). Found by the PR 5 audit, in `scripts/ui-audit/findings.json` (merged in #156): `man-b14` (the bug), `man-b12` (fake-link pattern for "soon" items), `man-b13` and `man-t10` (the "soon" pill). These four are fully resolved by this fix. `man-t11` (custom active and disabled styling on the nav links, a PR 5d concern) is **not** resolved here and stays deferred. Verified in the code on 2026-10-08.

## Changes from v1 (review by Bob and Charlie, 2026-10-09)

1. **Mutation check** now restores both the `"#"` href and the click blocker (variant a: tests 1 and 2 fail) and shows the href-only variant (b: only test 1 fails). v1 restored only the href, so the click test would have passed.
2. **Audit cleanup** resolves only the four findings this fix fully addresses (`man-b12`, `man-b13`, `man-b14`, `man-t10`). `man-t11` (custom active styling) stays deferred to PR 5d.
3. **Browser baseline** moves to Task 1 Step 4, before the fix exists. v1 captured it after the fix commits, where `git stash` cannot restore committed code.

## Facts checked (2026-10-09, on `main` `fd0da7c`)

- `apps/web/src/app/seller/dashboard/orders/page.tsx` exists and renders (h1 "Orders") for the seeded seller. Order detail `seller/dashboard/orders/[orderId]/page.tsx` exists too.
- **Nothing else links to the Orders page**: `git grep "seller/dashboard/orders" apps/web/src` outside the orders folder finds only the layout's `NAV` entry. The overview page has no Orders card. A seller can reach their orders only by typing the URL.
- `layout.tsx` was last changed for width tiers (#126); the Orders page predates that. No test covers the layout.
- After the fix the `NAV` list has 5 items and all 5 are real routes.

## Global Constraints

- **Scope is the coming-soon mechanism only.** No colour, spacing, sidebar width or responsive change (that is PR 5c; the slate palette classes are PR 5a). Do not touch the active-state classes.
- **No behaviour change for the four working links.** Same hrefs, same active-state rule (`startsWith`, `exact` for Overview).
- **Stage explicit paths only**; keep the untracked `apps/web/src/app/products/loading.tsx` and other untracked docs out of the PR.
- **Audit lists must stay valid.** Deleted lines make their `deferred.json` entries stale, and a stale entry fails `pnpm ui:audit`. Prune exactly those, no others (Task 3).
- No data is written; browser checks are read-only (the seeded seller signs in through Mailhog; no cookie is minted).

## Review Focus

1. **Active state on a nested path.** On `/seller/dashboard/orders/<id>` the Orders item must be active and Overview must not be (Overview is `exact`). Test 3 pins it.
2. **A click on Orders must not be swallowed.** Before the fix the layout passes `onClick={preventDefault}` for Orders. Test 2 pins `defaultPrevented === false`.
3. **No leftover dead links.** No sidebar `href` may be `"#"` and no "soon" text may remain. Test 1 pins it.
4. **`next/link` in jsdom.** `Link` intercepts clicks itself, which would hide the layout's own handler. The test mocks `next/link` as a plain anchor so only the layout's code is under test.
5. **Stale audit entries.** Removing the "soon" pill and the muted style deletes lines that carry deferred palette hits; Task 3 prunes exactly those, resolves the four findings this fix fully addresses, and leaves `man-t11` deferred (the custom active styling remains).

## Model routing

Sonnet: a 30-line client component, one test file, two JSON edits. No RLS, auth, payment or schema code, so no Opus review. Fable not needed.

---

### Task 1: Failing regression test

**Files:**

- Create: `apps/web/tests/seller-dashboard/layout.test.tsx`

**Interfaces:** consumes the default export of `@/app/seller/dashboard/layout` (a client component taking `{ children }`). Produces nothing for later tasks except a test that must fail before Task 2 and pass after.

- [ ] **Step 1: Branch.** `git switch -c fix/seller-nav-orders-link origin/main` (already created while planning; confirm with `git branch --show-current`).
- [ ] **Step 2: Write the test file** with exactly this content:

```tsx
// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ pathname: "/seller/dashboard" }))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
// A plain anchor, so a click reaches only the layout's own handlers (next/link intercepts clicks).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import SellerDashboardLayout from "@/app/seller/dashboard/layout"

const ITEMS = [
  ["Overview", "/seller/dashboard"],
  ["Subscriptions", "/seller/dashboard/subscriptions"],
  ["Products", "/seller/dashboard/products"],
  ["Orders", "/seller/dashboard/orders"],
  ["Settings", "/seller/dashboard/settings"],
] as const

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(pathname: string) {
  nav.pathname = pathname
  act(() =>
    root.render(
      <SellerDashboardLayout>
        <p>page</p>
      </SellerDashboardLayout>,
    ),
  )
}
const links = () => [...container.querySelectorAll<HTMLAnchorElement>("aside nav a")]
const link = (label: string) => links().find((a) => a.textContent?.trim().startsWith(label))!

describe("seller dashboard sidebar", () => {
  it("renders every item as a real link, with no coming-soon items", () => {
    render("/seller/dashboard")
    expect(links().map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual(
      ITEMS.map(([label, href]) => [label, href]),
    )
    expect(container.textContent).not.toMatch(/soon/i)
  })

  it("does not swallow a click on Orders", () => {
    render("/seller/dashboard")
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    link("Orders").dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it("marks Orders active on an order page and Overview only on the overview", () => {
    render("/seller/dashboard/orders/abc")
    expect(link("Orders").className).toContain("border-primary")
    expect(link("Overview").className).not.toContain("border-primary")
    render("/seller/dashboard")
    expect(link("Overview").className).toContain("border-primary")
    expect(link("Orders").className).not.toContain("border-primary")
  })
})
```

- [ ] **Step 3: Run it and confirm it fails for the right reason.** `pnpm --filter @bomy/web exec vitest run tests/seller-dashboard/layout.test.tsx`. Expected: tests 1 and 2 **fail** (Orders `href` is `"#"`, a "soon" pill is present, and `defaultPrevented` is `true`); test 3 passes (the active rule is unchanged). If the layout cannot render in jsdom, fix the test setup (for example a missing mock), not the layout, and record what was needed. Capture the failing output.
- [ ] **Step 4: Browser baseline, BEFORE the fix** (this branch still has the unchanged layout: it holds only the plan and the new test, no app change). Start the web dev server, sign in as the seeded seller `4a18dc0e-…@test.bomy` through Mailhog (read-only, no cookie minted), open `/seller/dashboard` at 1440 px and record for the Orders item: its `href` (expected `#`), whether a "soon" pill shows (expected yes), and the URL after clicking it (expected unchanged); also click the other four items and record that they navigate. Do this in light and dark. Save the notes (and screenshots) in the scratchpad; stop the server. This replaces v1's "git stash" idea, which cannot restore committed code. If Task 2 has already been committed, use a separate worktree of `origin/main` instead.

### Task 2: The fix

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/layout.tsx`

- [ ] **Step 1: Replace the nav item rendering** so every item is a plain link. In the `NAV.map` callback delete the `isComingSoon` constant, the `href={isComingSoon ? "#" : item.href}` ternary (use `href={item.href}`), the `isComingSoon` branch of the class `cn(...)`, the spread `onClick` handler, and the `{isComingSoon && (<span ...>soon</span>)}` pill. Resulting item:

```tsx
return (
  <Link
    key={item.href}
    href={item.href}
    className={cn(
      "px-5 py-2",
      active
        ? "border-l-2 border-primary bg-slate-700 text-slate-100"
        : "hover:bg-slate-700 hover:text-slate-100",
    )}
  >
    {item.label}
  </Link>
)
```

Keep every other line as is (`NAV`, `active`, the aside, the main).

- [ ] **Step 2: Run the new test.** All 3 pass.
- [ ] **Step 3: Format and check.** `pnpm exec prettier --check apps/web/src/app/seller/dashboard/layout.tsx apps/web/tests/seller-dashboard/layout.test.tsx`, then `pnpm --filter @bomy/web typecheck` and `pnpm --filter @bomy/web lint`, capturing exit codes (run each directly; do not loop).
- [ ] **Step 4: Mutation checks (restore after each).** **(a)** Re-add the whole dead mechanism for Orders only: an `isComingSoon` constant that is true for `/seller/dashboard/orders`, the `href={isComingSoon ? "#" : item.href}` ternary, the `onClick` that calls `preventDefault`, and the pill. Tests 1 **and** 2 must fail. **(b)** Re-add only the `"#"` href for Orders (no click blocker, no pill). Only test 1 must fail; test 2 must still pass, which shows each test guards its own part.
- [ ] **Step 5: Commit** the layout and the test (explicit paths). Message: `fix(web): seller sidebar links to Orders; drop the coming-soon mechanism`.

### Task 3: Audit lists

**Files:**

- Modify: `scripts/ui-audit/deferred.json`, `scripts/ui-audit/exceptions.json` (only if an entry there is stale), `scripts/ui-audit/findings.json`

- [ ] **Step 1: Find the stale entries.** `node scripts/ui-audit/scan.mjs --allow-deferred`. Expected: a few `stale entry` lines, all for `apps/web/src/app/seller/dashboard/layout.tsx` (the removed muted-style line and the "soon" pill span). Remove exactly those entries and nothing else. Hits on lines that still exist stay.
- [ ] **Step 2: Resolve exactly four ledger entries**: `man-b12`, `man-b13`, `man-b14` and `man-t10`. For each set `status: "resolved"`, delete `followUp`, and set `evidence` to what was verified (for example: "Fixed 2026-10-09 in <commit>: layout.tsx no longer has isComingSoon, a # href or a soon pill; tests/seller-dashboard/layout.test.tsx pins it; browser: clicking Orders navigates"). **Keep `man-t11` deferred (PR 5d)**: the custom active styling it tracks remains. Only trim its `description` so it no longer mentions the removed `href="#"`, `preventDefault` and coming-soon parts. Do not touch other entries (the sidebar's fixed `w-52` width is `man-b11`, PR 5c; its slate colours are PR 5a).
- [ ] **Step 3: Gates.** `pnpm ui:audit --allow-deferred` exits 0 with stale 0, invalid 0, open 0, and the deferred hit count lower than 121; `pnpm ui:audit:test` 17/17; plain `pnpm ui:audit` still exits 1 (5a to 5d remain). Record the new counts.
- [ ] **Step 4: Commit** the lists. Message: `docs(ui): resolve the seller-nav Orders findings and prune stale entries`.

### Task 4: Verification

- [ ] **Step 1:** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run` (expect 278 passed: 275 plus the 3 new; the two `DATABASE_URL` files and 281 skipped tests are **not evaluated**, reported separately), `pnpm --filter @bomy/web build`. Capture each exit code by running it directly.
- [ ] **Step 2: Browser, after the fix** (Playwright, seeded seller `4a18dc0e-…@test.bomy` signed in through Mailhog; read-only). Compare with the **before** baseline captured in Task 1 Step 4. The Orders item has `href="/seller/dashboard/orders"`, no pill, clicking navigates to the Orders page (h1 "Orders"), the item shows the active style, and Overview does not; the other four links still navigate; light and dark; 1440 px. Save no cookies; screenshots stay in the scratchpad.
- [ ] **Step 3: Stop servers**, confirm ports 3000 to 3002 are clear.

### Task 5: PR and wrap-up

- [ ] **Step 1: Push and open the PR** only after Charlie says go. Body: what and why (dead link, no other path to Orders, found by the PR 5 audit), the mechanism removed, tests and mutation check, audit counts before and after, browser before/after, **not evaluated** (the 2 `DATABASE_URL` files and skipped tests; mobile layout, which is PR 5c; a real seller with orders, since the local database has 0 orders, so the Orders page was checked with its empty state only).
- [ ] **Step 2: After merge:** log `log/YYYY-MM-DD_PR<N>_seller-nav-orders-link.md` (gitignored), update `.andy/handoff.md` §0, delete the local branch (and the remote one, Charlie approved this pattern).
- [ ] **Step 3: Next:** PR 5c plan (responsive admin and seller shells). Its plan must start from the layout as changed here.

---

## Self-review

- **Spec coverage:** the bug (Task 2), its regression test (Task 1), the dead mechanism removed (Task 2), the audit lists consistent (Task 3), verified in a browser (Task 4).
- **Placeholders:** none; the test and the replacement markup are given in full.
- **Consistency:** the test's labels and hrefs match `NAV` in the layout; entry ids match `findings.json`.
- **Open:** whether `next/link` mocked as a plain anchor is enough in jsdom (Task 1 Step 3 confirms); the exact stale entries are found by the scanner in Task 3, not guessed here.
