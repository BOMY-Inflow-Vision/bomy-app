# PR 5c: Responsive Admin and Seller Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v1, DRAFT.** Local only; do not start Task 1 until Bob and Charlie approve this plan.

**Goal:** At a 390 px viewport, no admin or seller-dashboard page scrolls sideways, and the shared `Button` no longer adds 2 px of scroll width. Desktop (768 px and up) looks exactly as it does today.

**Architecture:** Four causes, four fixes. (1) The seller sidebar (`w-52`) and the admin sidebar (`w-44`) are fixed-width columns with no small-screen layout, and both `main` elements lack `min-w-0`, so content pushes the page wider. Below the `md` breakpoint the seller sidebar becomes a one-row scrolling strip and the admin sidebar becomes a sticky top bar with a menu panel; from `md` up the markup renders as today. (2) Wide tables sit inside `overflow-hidden` cards; once the shell stops overflowing they would be **clipped silently**, so those containers become `overflow-x-auto`. (3) `/brand-subscriptions` lists a link for every subscribed store, so its store filter becomes a `Select`. (4) The shared `Button` parks its hover arrow outside its right edge; one `overflow-x-clip` in `packages/ui` fixes it for every page. A "before" baseline is captured before any code changes, and each fix is measured at 390 px.

**Tech Stack:** Next 15.5 (client layouts), React 19, Tailwind 3.4.17, `@bomy/ui` (Button, Select, Label), Vitest 2.1.9 (per-file jsdom, `react-dom/client` + `act`, no Testing Library), Playwright MCP and claude-in-chrome for measurement.

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (rollout) and `docs/superpowers/audits/2026-10-07-pr5-ui-consistency-findings.md` (section C and the shell review). Ledger source: `scripts/ui-audit/findings.json`, 34 entries tagged PR 5c: 31 `ov-*` overflow entries plus `man-b11`, `man-b15`, `man-b19`. Facts verified on `main` `e62f511` on 2026-10-09.

## Global Constraints

- **Desktop does not change.** At 768 px and wider both shells keep today's widths, classes and look. The only edits that reach desktop are invisible ones (`min-w-0`, `md:shrink-0`). Screenshots before and after prove it (Task 1 and Task 8).
- **Breakpoint is `md` (768 px)**, the same as the site nav bar (`apps/web/src/components/nav-bar.tsx`).
- **Scope is layout only.** No colour or token change (the slate palette is PR 5a). No pill, box or tab restyle (PR 5d). No new primitive in `packages/ui` other than the one-class `Button` fix.
- **No raw `<button>`, `<input>`, `<select>` or `<label>`**: the audit scanner flags them (R1). New controls use `Button`, `Select` and `Label` from `@bomy/ui`.
- **`@radix-ui/react-select` stays pinned at exactly `2.3.3`** (typeahead bug #4097). Do not touch `packages/ui/package.json`.
- **Audit entries are keyed on the trimmed line text.** Editing a line that carries a deferred or exception entry makes that entry stale (a stale entry fails the run). Re-key the entry (change only `text`); never delete a deferral unless its hit is gone (Task 7).
- **Stage explicit paths only.** Keep the untracked `apps/web/src/app/products/loading.tsx`, `.claude/` and older `docs/` files out of the PR.
- **Browser checks are read-only.** No cookie is minted, encoded or copied. The admin pages are checked only in Charlie's own signed-in Chrome ("Charlie | Work"); if that is not available a page is marked "not evaluated" with the reason. Use `switch_browser` so Charlie picks Chrome (never Wavebox).
- **Push and open the PR only after Charlie says go.** Charlie approves the merge.

## Decisions for review

1. **Admin small-screen pattern.** Recommended: a sticky top bar (title, theme toggle, menu button) with a menu panel holding the 15 links and the account footer, the same pattern as the site nav bar. Alternative: a horizontally scrolling strip like the seller one; with 15 links it needs a lot of sideways scrolling. The seller sidebar has 5 links, so it uses the strip.
2. **`/brand-subscriptions` store filter.** Recommended: a `Select` (the list of stores is unbounded: it measured 90,856 px wide). Alternative: a paged list of store links, which needs new query and paging code. The Select is a small client component that navigates with `router.push`.

## Review Focus

1. **Silent table clipping.** Cards with `overflow-hidden` around wide tables would hide columns with no way to reach them. The measurement script counts clipped tables; the pass rule is zero (Task 5).
2. **Desktop unchanged at the boundary.** Check 767 px (mobile layout) and 768 px (desktop layout) and compare 1440 px screenshots with the baseline.
3. **Admin menu accessibility.** `aria-expanded` and `aria-controls` on the button, Escape closes, choosing a link closes, the panel scrolls on a short phone. Pinned by tests.
4. **Button fix side effects.** The hover arrow must still slide in; the label descenders ("y" in "RM75/yr") must not be cut (the file's own comment warns about this); focus ring unchanged. Only the x axis is clipped.
5. **Re-keyed audit entries.** Every edited line that carried a deferral keeps its deferral under the new text (Task 3, Task 4, Task 7).
6. **Store filter.** The "All" choice needs a non-empty sentinel value (Radix `Select.Item` cannot have `value=""`); a `storeId` in the URL that is not in the list must not crash.

## Model routing

Sonnet: layout classes, two small client components, tests, JSON edits. No RLS, auth, payment or schema code, so no Opus review. Fable not needed.

## Verification method (used in Tasks 1, 2, 3, 4, 5, 6 and 8)

Pass rule per route at a 390 px viewport: `documentElement.scrollWidth === 390` and `clippedTables === 0`. Measuring function (the same text is used before and after):

```js
;() => {
  const de = document.documentElement
  const clippedTables = [...document.querySelectorAll("table")].filter((t) => {
    let p = t.parentElement
    while (p && p !== document.body && getComputedStyle(p).overflowX === "visible")
      p = p.parentElement
    return (
      p &&
      p !== document.body &&
      getComputedStyle(p).overflowX === "hidden" &&
      p.scrollWidth > p.clientWidth + 1
    )
  }).length
  return {
    path: location.pathname,
    innerWidth: window.innerWidth,
    scrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    clippedTables,
  }
}
```

- **Seller and public pages:** Playwright MCP, `browser_resize` to 390 × 844, seeded seller `4a18dc0e-30f1-446d-bc60-5592b4d37044@test.bomy` signed in through Mailhog (see memory `feedback_local_seller_login_via_mailhog.md`; no cookie minted), `browser_evaluate` with the function above on each route.
- **Admin pages:** Charlie's signed-in Chrome. An iframe at 390 px of a same-origin admin page runs the same function (the iframe technique worked in PR 5). Dynamic routes use real ids from the local database (`select id from stores limit 1;` and the same for `products` and `seller_inquiries`; `/orders/[orderId]` has no data locally and is not in the ledger). Needs the local admin role: `update users set role='bomy_admin' where email='charliekong.work@gmail.com';` at the start of Task 1, and `... set role='buyer' ...` again at the end of Task 8.
- **Routes (31):** admin `/auth/sign-in`, `/brand-plans`, `/brand-subscriptions`, `/categories`, `/config`, `/goodie-box`, `/memberships`, `/orders`, `/payouts`, `/payouts/reconciliation`, `/products`, `/products/[id]`, `/seller-inquiries`, `/seller-inquiries/[id]`, `/store-categories`, `/stores`, `/stores/[id]`, `/stores/new`, `/unauthorized`, `/users`, `/vouchers`, `/vouchers/new` (22); seller `/seller/dashboard`, `/orders`, `/products`, `/products/[id]/edit`, `/products/new`, `/settings`, `/subscriptions` (7); public `/brands`, `/products` (2).
- Save every result as JSON in the scratchpad folder `pr5c/` (`before.json`, `after.json`) with the commit it was taken on.

---

### Task 1: Baseline, before any code changes

**Files:** none (scratchpad only).

- [ ] **Step 1: Branch and plan check.** `git branch --show-current` prints `feat/bomy-ui-package-pr5c`; `git log --oneline -1` shows this plan's commit on top of `e62f511`. `git status` shows no tracked changes.
- [ ] **Step 2: Start servers** (`pnpm --filter @bomy/web dev`; for admin `pnpm --filter @bomy/admin dev`). Promote the local admin user (SQL above). Ask Charlie to pick Chrome with `switch_browser` and to be signed in to the admin app.
- [ ] **Step 3: Measure all 31 routes at 390 px** with the function above. Expect the ledger's numbers (for example `/seller/dashboard` 490, `/brand-subscriptions` 90,856, `/brands` and `/products` 392). Save `before.json`. A route that cannot be reached is recorded as "not evaluated" with the reason.
- [ ] **Step 4: Desktop screenshots at 1440 × 900** (light and dark): seller `/seller/dashboard` and `/seller/dashboard/products`; admin `/stores`, `/vouchers` and `/brand-subscriptions`. Also 768 × 900 for `/seller/dashboard` and admin `/stores`. Save as `before-*.png`.
- [ ] **Step 5: Button baseline.** On `/brands` at 390 px, record the 392 scroll width and take hover and keyboard-focus screenshots of the Search button (default size). On `/membership` (the "Join now — RM75/yr" button, `apps/web/src/app/(marketing)/membership/page.tsx:124`) take rest and hover screenshots at 1440 px. These show the arrow slide and the descenders before the change. Save as `before-button-*.png`.
- [ ] **Step 6: Stop the servers** and confirm ports 3000 to 3002 are clear. No commit.

### Task 2: Shared `Button` parked-arrow fix

**Files:**

- Modify: `packages/ui/src/components/button.tsx` (the `slide` wrapper, about lines 124-130)
- Create: `apps/web/tests/components/button-slide.test.tsx`

**Interfaces:** `Button` props are unchanged. Produces nothing for later tasks except the 2 px fix on `/brands` and `/products`.

- [ ] **Step 1: Write the failing test** (node environment, no jsdom needed):

```tsx
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "@bomy/ui/button"

describe("Button slide wrapper", () => {
  it("clips the parked arrow on the x axis only", () => {
    const html = renderToStaticMarkup(<Button icon={<span>i</span>}>Go</Button>)
    expect(html).toContain("overflow-x-clip")
    // y must stay visible: clipping it cut text descenders (see the comment in button.tsx)
    expect(html).not.toMatch(/\boverflow-(hidden|clip)\b/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails:** `pnpm --filter @bomy/web exec vitest run tests/components/button-slide.test.tsx`. Expected: FAIL (`overflow-x-clip` missing). If `@bomy/ui/button` cannot be resolved in the web vitest config, fix the test setup, not the Button, and record what was needed.
- [ ] **Step 3: Apply the fix.** In the `slide` helper change the wrapper class and replace the comment above it:

```tsx
    // Padding lives on this inner wrapper (not the root) so the sliding icon/arrow line up
    // inside the pill without affecting the root's focus-visible ring. It clips the x axis only:
    // the parked arrow sits outside the right edge (opacity-0) and would otherwise add its width
    // to the page's scroll width. The y axis stays visible because clipping it against the fixed
    // h-full cut off text descenders (e.g. the tail of "y" in "RM75/yr") whenever a custom
    // font's line-box metrics run tighter than its actual glyph height.
    const slide = (label: React.ReactNode) => (
      <span className={cn("flex h-full shrink-0 items-center overflow-x-clip", slideSize.root)}>
```

- [ ] **Step 4: Test passes; mutation check.** Run the test (PASS). Remove `overflow-x-clip` again: the test must fail. Restore. Then `pnpm exec prettier --check` on both files, `pnpm --filter @bomy/ui typecheck`, `pnpm --filter @bomy/web lint` (run each directly, capture exit codes).
- [ ] **Step 5: Browser check.** Start the web dev server. At 390 px `/brands` and `/products` now measure `scrollWidth === 390`. Repeat the Task 1 Step 5 screenshots: the arrow still slides in on hover and on keyboard focus, the "y" descender in "RM75/yr" is intact, the focus ring is unchanged. If the arrow or the descender is cut, move `overflow-x-clip` from the wrapper to the button root (`rootClassName`) and re-run this step. Save `after-button-*.png`. Stop the server.
- [ ] **Step 6: Commit** the three paths. Message: `fix(ui): clip the Button's parked hover arrow on the x axis`.

### Task 3: Seller dashboard shell

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/layout.tsx`
- Modify: `apps/web/tests/seller-dashboard/layout.test.tsx` (add one test)
- Modify: `scripts/ui-audit/deferred.json` (re-key only)

**Interfaces:** consumes the layout as merged in #157 (five plain links, no coming-soon code). The existing three tests must keep passing unchanged.

- [ ] **Step 1: Add the failing test** inside the existing `describe` in `layout.test.tsx`:

```tsx
it("collapses into a scrolling strip on small screens and never forces the page wider", () => {
  render("/seller/dashboard")
  const aside = container.querySelector("aside")!
  expect(aside.className).toContain("w-full")
  expect(aside.className).toContain("md:w-52")
  expect(container.querySelector("aside nav")!.className).toContain("overflow-x-auto")
  expect(link("Orders").className).toContain("whitespace-nowrap")
  expect(container.querySelector("main")!.className).toContain("min-w-0")
})
```

Run the file: the new test fails, the other three pass.

- [ ] **Step 2: Change the layout.** Replace the returned markup with:

```tsx
return (
  <div className="flex min-h-screen flex-col md:flex-row">
    <aside className="flex w-full flex-col bg-slate-800 text-sm text-slate-400 md:w-52 md:shrink-0">
      <div className="border-b border-slate-700 px-5 py-4 text-sm font-bold text-slate-100">
        My Store
      </div>
      <nav className="flex overflow-x-auto py-2 md:flex-1 md:flex-col md:overflow-visible">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap px-5 py-2",
                active
                  ? "border-b-2 border-primary bg-slate-700 text-slate-100 md:border-b-0 md:border-l-2"
                  : "hover:bg-slate-700 hover:text-slate-100",
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
    <main className="min-w-0 flex-1 bg-muted">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  </div>
)
```

On small screens the sidebar is a full-width block above the page and the five links scroll sideways inside it; the active item has a bottom bar. From `md` up the classes resolve to today's look (`w-52`, column, left bar).

- [ ] **Step 3: Tests, format, types, lint.** All four layout tests pass; `prettier --check`, `pnpm --filter @bomy/web typecheck`, `pnpm --filter @bomy/web lint` (each run directly, exit codes captured).
- [ ] **Step 4: Mutation checks (restore after each).** (a) Remove `min-w-0` from `main`: the new test fails. (b) Remove `overflow-x-auto` from `nav`: the new test fails. (c) Remove `border-b-2` / `md:border-l-2` from the active link: test 3 still passes (it checks `border-primary`), which is expected; note it.
- [ ] **Step 5: Audit.** `node scripts/ui-audit/scan.mjs --allow-deferred`. The edited `aside`, active-link and link lines now show as stale entries plus new open hits. For each stale entry add the same entry under the new line text (copy the entry, change only `text`), delete the old one. Result: stale 0, open 0, deferred count unchanged. Do not touch other entries.
- [ ] **Step 6: Browser check** (Playwright, 390 × 844, seeded seller). The seven seller routes are measured: pass is `scrollWidth === 390` and `clippedTables === 0`. The products and subscriptions pages have tables; record their numbers here and carry any failure to Task 5. The strip scrolls sideways inside the page and the active item shows. At 768 × 900 and 1440 × 900 the sidebar looks like `before-*.png`. At 767 px the strip layout shows; at 768 px the sidebar. Light and dark.
- [ ] **Step 7: Commit** the layout, the test and `deferred.json`. Message: `feat(web): seller dashboard sidebar collapses into a strip on small screens`.

### Task 4: Admin shell

**Files:**

- Modify: `apps/admin/src/app/layout.tsx` (body and main classes only)
- Modify: `apps/admin/src/components/sidebar.tsx`
- Create: `apps/admin/tests/components/sidebar.test.tsx`
- Modify: `scripts/ui-audit/deferred.json` (re-key only)

**Interfaces:** `Sidebar({ email }: { email: string })` keeps its name and props. It now renders a desktop `aside` and a mobile `header`. `NAV` is unchanged.

- [ ] **Step 1: Write the failing test** `apps/admin/tests/components/sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ pathname: "/stores" }))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@/app/auth/actions", () => ({ signOutAction: async () => {} }))
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <span data-testid="theme" /> }))

import { Sidebar } from "@/components/sidebar"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Sidebar email="admin@example.com" />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const toggle = () => container.querySelector<HTMLButtonElement>("header button[aria-controls]")!
const panel = () => container.querySelector<HTMLElement>("#admin-mobile-menu")!

describe("admin sidebar", () => {
  it("keeps the desktop sidebar for md and up and hides it below", () => {
    const aside = container.querySelector("aside")!
    expect(aside.className).toContain("hidden")
    expect(aside.className).toContain("md:flex")
    expect(aside.className).toContain("w-44")
    expect(aside.querySelectorAll("nav a")).toHaveLength(15)
  })

  it("shows a top bar below md whose menu starts closed", () => {
    const header = container.querySelector("header")!
    expect(header.className).toContain("md:hidden")
    expect(toggle().getAttribute("aria-expanded")).toBe("false")
    expect(panel().hidden).toBe(true)
  })

  it("opens and closes the menu from the button", () => {
    act(() => toggle().click())
    expect(toggle().getAttribute("aria-expanded")).toBe("true")
    expect(panel().hidden).toBe(false)
    expect(panel().querySelectorAll("a")).toHaveLength(15)
    act(() => toggle().click())
    expect(panel().hidden).toBe(true)
  })

  it("closes the menu on Escape", () => {
    act(() => toggle().click())
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(panel().hidden).toBe(true)
  })

  it("closes the menu after a link is chosen", () => {
    act(() => toggle().click())
    const first = panel().querySelector<HTMLAnchorElement>("a")!
    first.addEventListener("click", (e) => e.preventDefault())
    act(() => first.click())
    expect(panel().hidden).toBe(true)
  })

  it("marks the current page in both menus", () => {
    const active = [...container.querySelectorAll("a")].filter((a) =>
      a.className.includes("border-primary"),
    )
    expect(active).toHaveLength(2)
  })
})
```

Run `pnpm --filter @bomy/admin exec vitest run tests/components/sidebar.test.tsx`. Expected: fails (no `header`, `aside` is not hidden). If the admin vitest setup needs more (for example the `lucide-react` import), fix the test setup, not the component.

- [ ] **Step 2: Replace `sidebar.tsx`** with:

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Menu, X } from "lucide-react"

import { signOutAction } from "@/app/auth/actions"
import { Button } from "@bomy/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/stores", label: "Stores" },
  { href: "/products", label: "Products" },
  { href: "/users", label: "Users" },
  { href: "/seller-inquiries", label: "Seller Inquiries" },
  { href: "/categories", label: "Product Cats" },
  { href: "/store-categories", label: "Store Cats" },
  { href: "/memberships", label: "Memberships" },
  { href: "/brand-subscriptions", label: "Brand Subs" },
  { href: "/brand-plans", label: "Brand Plans" },
  { href: "/goodie-box", label: "Goodie Box" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/checkout-sessions", label: "Sessions" },
  { href: "/orders", label: "Orders" },
  { href: "/payouts", label: "Payouts" },
  { href: "/config", label: "Config" },
]

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "px-4 py-2",
              active
                ? "border-l-2 border-primary bg-slate-700 text-slate-100"
                : "hover:bg-slate-700 hover:text-slate-100",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

function AccountFooter({ email }: { email: string }) {
  return (
    <div className="border-t border-slate-700 px-4 py-3 text-xs text-slate-500">
      <div className="truncate">{email}</div>
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          icon={<LogOut />}
          arrowOnHover={false}
          className="mt-2 w-full justify-start text-slate-300 hover:bg-transparent hover:text-slate-100"
        >
          Sign out
        </Button>
      </form>
    </div>
  )
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      {/* md and up: the sidebar as before */}
      <aside className="hidden w-44 flex-col bg-slate-800 text-sm text-slate-400 md:flex">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4 text-sm font-bold text-slate-100">
          BOMY Admin
          <ThemeToggle />
        </div>
        <nav className="flex flex-1 flex-col py-2">
          <NavLinks pathname={pathname} />
        </nav>
        <AccountFooter email={email} />
      </aside>

      {/* Below md: a sticky top bar with a menu panel */}
      <header className="sticky top-0 z-40 bg-slate-800 text-sm text-slate-400 md:hidden">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2 text-sm font-bold text-slate-100">
          BOMY Admin
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="admin-mobile-menu"
              className="size-8 rounded-full text-slate-400 hover:bg-slate-700 hover:text-slate-100"
            >
              {open ? (
                <X aria-hidden="true" className="size-4" />
              ) : (
                <Menu aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
        </div>
        <div
          id="admin-mobile-menu"
          hidden={!open}
          className="max-h-[calc(100dvh-3.25rem)] overflow-y-auto border-b border-slate-700"
        >
          <nav className="flex flex-col py-2">
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
          <AccountFooter email={email} />
        </div>
      </header>
    </>
  )
}
```

- [ ] **Step 3: Change `apps/admin/src/app/layout.tsx`.** Two class strings only: body `` `flex min-h-screen flex-col md:flex-row ${plusJakartaSans.className}` `` and main `className="min-w-0 flex-1 bg-muted"`. Nothing else in the file changes.
- [ ] **Step 4: Tests, format, types, lint.** The six sidebar tests pass; run `pnpm exec prettier --check` on the four files, then `pnpm --filter @bomy/admin typecheck`, `pnpm --filter @bomy/admin lint` and the whole `pnpm --filter @bomy/admin test --run` (record the count; the 13 `DATABASE_URL` files are not evaluated).
- [ ] **Step 5: Mutation checks (restore after each).** (a) Remove `hidden` from the mobile panel: the "starts closed" test fails. (b) Remove the Escape listener: the Escape test fails. (c) Remove `onNavigate` from the mobile `NavLinks`: the "link is chosen" test fails. (d) Remove `md:hidden` from the header: the "top bar" test fails.
- [ ] **Step 6: Audit.** `node scripts/ui-audit/scan.mjs --allow-deferred`. Edited lines give stale entries plus new open hits (the `aside`, header, active link and footer lines). Re-key each stale entry to its new line text, same rule, same reason, same follow-up. The new `Button` and icon lines must not add hits (no raw `<button>`). Result: stale 0, open 0.
- [ ] **Step 7: Browser check** (Charlie's Chrome, local admin role promoted, admin dev server). At 390 px: the top bar shows, the menu opens and closes (button, Escape, choosing a link), 15 links reachable on a short viewport (390 × 600 scrolls inside the panel), the sticky bar stays at the top while the page scrolls. The 22 admin routes: record `scrollWidth` and `clippedTables`; pages that still exceed 390 px because of their own content go to Task 5. At 767 and 768 px the layout switches; 1440 px matches `before-*.png`. Light and dark.
- [ ] **Step 8: Commit** the four paths. Message: `feat(admin): sticky top bar and menu below md; sidebar unchanged from md up`.

### Task 5: Table containers that would clip or overflow

**Files:** the admin and seller pages listed by the measurement (candidates, from `<table` containers on `main`):

- Admin: `products`, `stores`, `brand-plans`, `memberships`, `users`, `goodie-box`, `config`, `vouchers`, `store-categories`, `categories`, `brand-subscriptions`, `orders/[orderId]` (all `page.tsx`).
- Seller: `apps/web/src/app/seller/dashboard/products/page.tsx`, `subscriptions/page.tsx`.
- `orders`, `payouts` and `payouts/reconciliation` already use `overflow-x-auto` and are expected to pass untouched.

**Interfaces:** none. Produces: every table can be scrolled sideways inside its card.

- [ ] **Step 1: Measure first.** With Tasks 2 to 4 applied, run the measuring function on each candidate at 390 px and list the pages where `clippedTables > 0` or `scrollWidth > 390`. Change only those. (If a table fits at 390 px it is left alone.)
- [ ] **Step 2: Change the container** of each listed table from `overflow-hidden` to `overflow-x-auto` (keep every other class). A table with no card gets its parent `div` wrapped in `className="overflow-x-auto"`. Example (`brand-plans`): `<Card className="overflow-hidden">` becomes `<Card className="overflow-x-auto">`. Keep rounded corners: `overflow-x-auto` still clips the corners of the background.
- [ ] **Step 3: Re-measure** the listed pages: `scrollWidth === 390` and `clippedTables === 0`, and a screenshot of one page shows the table scrolling sideways inside its card with the header row intact.
- [ ] **Step 4: Format, types, lint, and the touched apps' tests** (`pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/web test --run`; the `DATABASE_URL` files stay "not evaluated"). No new unit test: this is a class change that jsdom cannot judge; the browser measurement is the evidence.
- [ ] **Step 5: Audit.** Edited lines may carry R6 exception entries (the raw `<table>` rule) keyed on the container line. Re-key any stale entry as in Task 3. Stale 0, open 0.
- [ ] **Step 6: Commit** the changed pages and `deferred.json` or `exceptions.json`, explicit paths. Message: `fix(web,admin): let wide tables scroll inside their card instead of clipping`.

### Task 6: `/brand-subscriptions` store filter

**Files:**

- Create: `apps/admin/src/app/brand-subscriptions/store-filter.tsx`
- Create: `apps/admin/tests/brand-subscriptions/store-filter.test.ts`
- Modify: `apps/admin/src/app/brand-subscriptions/page.tsx` (the header row, about lines 130-170)
- Modify: `scripts/ui-audit/deferred.json` / `exceptions.json` (re-key only, if flagged)

**Interfaces:**

- Produces `StoreOption = { id: string; name: string; href: string }`, `hrefForStore(value: string, allHref: string, options: StoreOption[]): string` and `StoreFilter({ value, allHref, options })`. The page passes precomputed hrefs because a server page cannot pass functions to a client component.

- [ ] **Step 1: Write the failing test** (pure helper, node environment):

```ts
import { describe, expect, it } from "vitest"

import { hrefForStore, type StoreOption } from "@/app/brand-subscriptions/store-filter"

const options: StoreOption[] = [
  { id: "s1", name: "Alpha", href: "/brand-subscriptions?storeId=s1" },
  { id: "s2", name: "Beta", href: "/brand-subscriptions?storeId=s2" },
]

describe("hrefForStore", () => {
  it("returns the clear-filter link for the All choice", () => {
    expect(hrefForStore("all", "/brand-subscriptions", options)).toBe("/brand-subscriptions")
  })
  it("returns the link of the chosen store", () => {
    expect(hrefForStore("s2", "/brand-subscriptions", options)).toBe(
      "/brand-subscriptions?storeId=s2",
    )
  })
  it("falls back to the clear-filter link for an unknown store", () => {
    expect(hrefForStore("nope", "/brand-subscriptions", options)).toBe("/brand-subscriptions")
  })
})
```

Run it: fails (module missing).

- [ ] **Step 2: Create `store-filter.tsx`:**

```tsx
"use client"

import { useRouter } from "next/navigation"

import { Label } from "@bomy/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"

const ALL = "all"

export type StoreOption = { id: string; name: string; href: string }

export function hrefForStore(value: string, allHref: string, options: StoreOption[]): string {
  if (value === ALL) return allHref
  return options.find((option) => option.id === value)?.href ?? allHref
}

export function StoreFilter({
  value,
  allHref,
  options,
}: {
  value: string
  allHref: string
  options: StoreOption[]
}) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 text-sm">
      <Label htmlFor="store-filter" className="text-muted-foreground">
        Store
      </Label>
      <Select
        value={value || ALL}
        onValueChange={(next) => router.push(hrefForStore(next, allHref, options))}
      >
        <SelectTrigger id="store-filter" className="w-56 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All stores</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 3: Use it in `page.tsx`.** Add `import { StoreFilter } from "./store-filter"`. Replace the header `div className="mb-4 flex items-center gap-4"` with `className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"`, give the status chips wrapper `flex flex-wrap gap-1 text-sm`, and replace the whole `{stores.length > 0 && (...)}` block (the "Store:" label with its row of links) with:

```tsx
{
  stores.length > 0 && (
    <div className="sm:ml-auto">
      <StoreFilter
        value={storeId ?? ""}
        allHref={buildHref({ storeId: "" })}
        options={stores.map((s) => ({
          id: s.id,
          name: s.name,
          href: buildHref({ storeId: s.id }),
        }))}
      />
    </div>
  )
}
```

The status chips stay as links (six fixed items, they wrap). `buildHref` and the query stay as they are.

- [ ] **Step 4: Tests, format, types, lint.** The three helper tests pass (mutation: return `options[0].href` for every store, the "chosen store" test fails). `prettier --check`, `pnpm --filter @bomy/admin typecheck`, `pnpm --filter @bomy/admin lint`, each run directly.
- [ ] **Step 5: Audit.** The removed link rows and the edited header line may leave stale entries (R3a/R3b palette hits on the old `STATUS_COLORS` are untouched; only entries whose line text changed are re-keyed or, if the line is gone, removed). The `<table` entry for this page is re-keyed if Task 5 touched it. Stale 0, open 0.
- [ ] **Step 6: Browser check** (Charlie's Chrome, admin). `/brand-subscriptions` at 390 px: `scrollWidth === 390`, `clippedTables === 0`. The Select opens, lists "All stores" and the stores, choosing one reloads with `?storeId=<id>`, choosing "All stores" clears it, pagination links keep the filter. Type-ahead inside the open Select is **not evaluated** (production typeahead for `@radix-ui/react-select@2.3.3` is untested here). At 1440 px the header looks sensible (title, chips, filter on the right).
- [ ] **Step 7: Commit** the four paths plus any list file. Message: `fix(admin): brand-subscriptions store filter becomes a Select; header wraps`.

### Task 7: Ledger and audit lists

**Files:** Modify `scripts/ui-audit/findings.json`, `scripts/ui-audit/deferred.json`, `scripts/ui-audit/exceptions.json` (only where needed).

- [ ] **Step 1: Resolve the ledger entries that Task 8's measurement proves.** For each of the 31 `ov-*` entries and `man-b11`, `man-b15`, `man-b19`: `status: "resolved"`, delete `followUp`, set `evidence` to the measured fact (for example: "Fixed 2026-10-09 in <commit>: scrollWidth 390 at 390 px, clippedTables 0 (before: 879); tests/... pins the classes"). Do this **after** Task 8 Step 2 so no entry is resolved on a guess. An entry whose route still overflows stays deferred with its `followUp` updated to say what remains; do not resolve it.
- [ ] **Step 2: Gates.** `pnpm ui:audit --allow-deferred` exits 0 (stale 0, invalid 0, open 0); `pnpm ui:audit:test` 17/17; plain `pnpm ui:audit` exits 1 (5a, 5b and 5d remain). Record the counts: ledger deferred before 83.
- [ ] **Step 3: Commit** the list files. Message: `docs(ui): resolve the PR 5c overflow findings`.

### Task 8: Full verification and final browser sweep

- [ ] **Step 1:** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/web build`, `pnpm --filter @bomy/admin build`. Capture each exit code by running it directly. Expected new tests: web +2 (1 Button, 1 seller layout; web was 278 passed), admin +9 (6 sidebar, 3 store filter); report the passed totals as printed, and the `DATABASE_URL` files and skipped tests as **not evaluated** with the reason. If a command exits 1 while the passed count is as expected, say both.
- [ ] **Step 2: Measure all 31 routes at 390 px** (the same function and sessions as Task 1). Save `after.json`. Pass rule: `scrollWidth === 390` and `clippedTables === 0` for every route; list any route that fails or cannot be reached ("not evaluated" with the reason).
- [ ] **Step 3: Desktop regression.** Repeat the Task 1 Step 4 screenshots at 1440 and 768 and compare with `before-*.png` (sidebar widths, active bar, header). Any visible difference is a failure to fix, not to explain away.
- [ ] **Step 4: Mobile walkthrough, light and dark.** Seller: strip scrolls, links navigate, active bar shows. Admin: menu opens, Escape closes, a link navigates and closes the menu, sign-out button visible in the panel. Button: hover and focus frames match the baseline apart from the removed overflow.
- [ ] **Step 5: Stop servers** (ports 3000 to 3002 clear). Demote the local admin user: `update users set role='buyer' where email='charliekong.work@gmail.com';`. Close the Chrome tab.

### Task 9: PR and wrap-up

- [ ] **Step 1: Push and open the PR** only after Charlie says go. Body: what and why (34 ledger entries), the four causes and fixes, tests and mutation checks, audit counts before and after (279 hits, 119 deferred, ledger 83 deferred / 11 resolved before), the before/after table of the 31 `scrollWidth` values, desktop comparison result, and **not evaluated** (the `DATABASE_URL` files and skipped tests; admin pages not reached; `/orders/[orderId]` has no local data; Select type-ahead; touch behaviour; Safari and Firefox, because `overflow-x: clip` needs Safari 16+ and the checks ran in Chromium only; checkout; keyboard focus-ring on the admin menu if not run).
- [ ] **Step 2: After merge:** write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr5c.md` (gitignored), update `.andy/handoff.md`, update the rollout memory, delete the local and remote branch (Charlie approved this pattern).
- [ ] **Step 3: Next:** PR 5a (colour tokens, needs the design call), 5b (provider Select proof), 5d. Fold the scanner nit (`--routes --json` omits `listErrors`) into the next scanner touch; it is **not** part of this PR.

---

## Self-review

- **Spec coverage:** shell overflow admin (Task 4), seller (Task 3), Button 2 px (Task 2), table clipping hazard (Task 5), store filter (Task 6), ledger (Task 7), verification at 390 px per fix and overall (each task's browser step, Task 8).
- **Placeholders:** none. Task 5 lists candidate files and chooses by measurement, which is intended: the right set depends on what Tasks 3 and 4 leave behind.
- **Consistency:** `StoreOption`, `hrefForStore` and `StoreFilter` match in test, component and page. The sidebar test ids (`header button[aria-controls]`, `#admin-mobile-menu`) match the markup. The seller test classes match the layout.
- **Known risks:** `overflow-x-clip` in Safari below 16; the Select type-ahead; the admin checks depend on Charlie's Chrome session; tests pin classes but cannot judge layout, so the browser measurements carry the proof.
