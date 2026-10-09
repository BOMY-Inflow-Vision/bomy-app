# PR 5c: Responsive Admin and Seller Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v5, DRAFT** (v1 was reviewed by Bob and Charlie, who approved the design choices and asked for four plan changes; v2 and v3 were each held for execution corrections; v4 was approved and Task 1 ran; v5 adds the 768 px admin gate; see "Changes from v1" to "Changes from v4"). Local only; do not start Task 1 until Bob and Charlie approve this plan.

**Goal:** At a 390 px viewport (and, for the admin app, also at 768 px), no admin or seller-dashboard page scrolls sideways, and the shared `Button` no longer adds 2 px of scroll width at rest. The desktop sidebars (768 px and up) look exactly as they do today; table scrollers and the `/brand-subscriptions` header change on purpose.

**Architecture:** Four causes, four fixes. (1) The seller sidebar (`w-52`) and the admin sidebar (`w-44`) are fixed-width columns with no small-screen layout, and both `main` elements lack `min-w-0`, so content pushes the page wider. Below the `md` breakpoint the seller sidebar becomes a one-row scrolling strip and the admin sidebar becomes a sticky top bar with a menu panel; from `md` up the markup renders as today. (2) Wide tables sit in plain cards (which push the page wider) or in `overflow-hidden` cards (which would **clip them silently** once the shell stops overflowing), and forms and headers can overflow too; Task 5 diagnoses every remaining overflow and fixes it at its cause. (3) `/brand-subscriptions` lists a link for every subscribed store, so its store filter becomes a `Select`. (4) The shared `Button` parks its hover arrow outside its right edge; one `overflow-x-clip` in `packages/ui` fixes it for every page. A "before" baseline is captured before any code changes, and each fix is measured at 390 px.

**Tech Stack:** Next 15.5 (client layouts), React 19, Tailwind 3.4.17, `@bomy/ui` (Button, Select, Label), Vitest 2.1.9 (per-file jsdom, `react-dom/client` + `act`, no Testing Library), Playwright MCP and claude-in-chrome for measurement.

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (rollout) and `docs/superpowers/audits/2026-10-07-pr5-ui-consistency-findings.md` (section C and the shell review). Ledger source: `scripts/ui-audit/findings.json`, 34 entries tagged PR 5c: 31 `ov-*` overflow entries plus `man-b11`, `man-b15`, `man-b19`. Facts verified on `main` `e62f511` on 2026-10-09.

## Changes from v1 (review by Bob and Charlie, 2026-10-09)

Both design choices were approved: the admin top bar with a menu, and the `Select` for the store filter (the latter provided the large-list check passes). Four plan changes:

1. **Task 5 is a diagnosis, not a list of table fixes.** It covers tables in plain `Card`s and bare tables as well as `overflow-hidden` ones, and finds overflow caused by forms, headers and long text. **31 of 31 route measurements are a gate**; a route that cannot pass needs explicit re-scope approval (Task 5 Step 5, Task 7 Step 2).
2. **Task 4: Escape returns focus to the admin menu button**, with keyboard tests and mutation checks. A real-keyboard walkthrough is added to Task 4 and Task 7.
3. **Admin role safety.** Task 1 records Charlie's original local role, and every admin browser session restores it afterwards, including after an interrupted check (new section "Admin role safety").
4. **Task 6 gets a large-list check and input normalisation.** Real-key navigation to a late store, an opening and scrolling timing check on 100 and 1,000 generated stores (dev server, then the required production build), and an unknown or malformed `storeId` is ignored so the trigger is never blank.

Also: ledger resolution moved **after** the final measurements. Task 7 is now the full verification and Task 8 resolves the ledger, so the task order matches the dependency.

## Changes from v2 (review by Bob and Charlie, 2026-10-09; Task 1 held for these)

1. **Admin menu focus.** `headerRef` also contained the theme toggle. Focus now returns to the menu button **only when it was inside the menu panel** (`panelRef`); a new test covers Escape while the theme toggle is focused.
2. **Production Select check.** The admin app builds with `output: "standalone"`, so `next start` was wrong. Step 8c now uses the working PR 4 `server.js` recipe, with the static files and the auth environment settings. **A production pass is required** for the Select choice; if it cannot run or fails, Task 6 stops and asks for re-scope approval.
3. **Large-list measurement.** The Event Timing observer could report nothing and still look like a pass. A probe now records one timing per key or pointer press, and **a missing record is a failure**. Long tasks are measured separately. The whole real-key sequence, including type-ahead, runs inside one `browser_run_code_unsafe` call.
4. **Mutation check (f)** replaces the whole focus guard with unconditional focus, which is what actually breaks the stated behaviour.

## Changes from v3 (review by Bob and Charlie, 2026-10-09; Task 1 held for this)

The Task 6 probe was read after the store was chosen, and that navigation could remount the probe and erase the records. Step 8a and 8b now: wait for the probe to report `ready`; read and check the whole interaction sequence **before** the final Enter; keep the probe object across a client navigation (created once, reused); time the final Enter and the navigation separately (`selectToUpdatedMs`, and `finalEnterMs` when the probe survived); and count long tasks only from a mark set at the start of the sequence, so page-load work does not skew the gate.

## Changes from v4 (Task 1 baseline findings, approved by Bob and Charlie, 2026-10-09)

Task 1 found that **13 of the 22 admin routes already overflow at 768 px today** (for example `/stores` 997 px, `/vouchers` 1,003 px), because admin `main` has no `min-w-0` at any width. Bob and Charlie approved a 768 px admin gate. Changes:

1. **Admin routes are measured at both 390 and 768 px**, before and after. The pass rule uses the **measured viewport width** (`scrollWidth === innerWidth`), not the number 390. Gate: all 31 routes pass at 390 px **and** all 22 admin routes pass at 768 px (53 measurements). Baseline: `before-admin-768.json` (9 pass, 13 fail).
2. **Clarified what "desktop unchanged" means.** The desktop **sidebar** stays exactly the same (176 px wide, same links, same active style; geometry baseline `before-admin-geometry.txt`). What changes **on purpose**: table containers become scrollers, and the `/brand-subscriptions` header (it is 90,856 px wide even at 1440 px today). At 768 px the admin pages that overflow today now fit and their tables scroll inside their cards.
3. **Malformed `storeId` baseline recorded:** on `main`, `/brand-subscriptions?storeId=not-a-uuid` returns **HTTP 500**; a valid but unknown UUID returns 200 with an empty table. After Task 6 both must return 200 with all subscriptions listed.
4. **Button overflow is measured at rest** (fresh load, pointer away, nothing focused). Baseline: 392 at rest, 390 while hovered or focused, so a hover or focus reading can never prove the fix.

## Global Constraints

- **The desktop sidebars do not change.** At 768 px and wider both shells keep today's widths, classes and look (admin sidebar 176 px, seller sidebar `w-52`). The only shell edits that reach desktop are invisible ones (`min-w-0`, `md:shrink-0`). Geometry and screenshots before and after prove it (Task 1 and Task 7). **Intended changes on desktop:** table containers become scrollers (Task 5), the `/brand-subscriptions` header and store filter (Task 6), and admin pages that overflow at 768 px today now fit. Every such page is listed in the PR body; any other visible difference is a failure.
- **Breakpoint is `md` (768 px)**, the same as the site nav bar (`apps/web/src/components/nav-bar.tsx`).
- **Scope is layout only.** No colour or token change (the slate palette is PR 5a). No pill, box or tab restyle (PR 5d). No new primitive in `packages/ui` other than the one-class `Button` fix.
- **No raw `<button>`, `<input>`, `<select>` or `<label>`**: the audit scanner flags them (R1). New controls use `Button`, `Select` and `Label` from `@bomy/ui`.
- **`@radix-ui/react-select` stays pinned at exactly `2.3.3`** (typeahead bug #4097). Do not touch `packages/ui/package.json`.
- **Audit entries are keyed on the trimmed line text.** Editing a line that carries a deferred or exception entry makes that entry stale (a stale entry fails the run). Re-key the entry (change only `text`); never delete a deferral unless its hit is gone (Task 8).
- **Stage explicit paths only.** Keep the untracked `apps/web/src/app/products/loading.tsx`, `.claude/` and older `docs/` files out of the PR.
- **Browser checks are read-only.** No cookie is minted, encoded or copied. The admin pages are checked only in Charlie's own signed-in Chrome ("Charlie | Work"); if that is not available a page is marked "not evaluated" with the reason. Use `switch_browser` so Charlie picks Chrome (never Wavebox).
- **Admin role safety.** The local admin user's role is changed only for a browser session and always restored (see "Admin role safety").
- **A route that cannot pass is never reported as passing.** Re-scoping a route needs Charlie's and Bob's explicit approval.
- **Push and open the PR only after Charlie says go.** Charlie approves the merge.

## Decisions (approved by Bob and Charlie, 2026-10-09)

1. **Admin small-screen pattern.** Recommended: a sticky top bar (title, theme toggle, menu button) with a menu panel holding the 15 links and the account footer, the same pattern as the site nav bar. Alternative: a horizontally scrolling strip like the seller one; with 15 links it needs a lot of sideways scrolling. The seller sidebar has 5 links, so it uses the strip.
2. **`/brand-subscriptions` store filter.** Recommended: a `Select` (the list of stores is unbounded: it measured 90,856 px wide). Alternative: a paged list of store links, which needs new query and paging code. The Select is a small client component that navigates with `router.push`. **Approved on the condition that the large-list check in Task 6 Step 8 passes, including the production-build pass**; if it fails or the production pass cannot run, the paged list needs explicit re-scope approval.

## Review Focus

1. **Overflow from any cause.** Wide tables in plain or `overflow-hidden` cards, but also forms, headers, button rows and long text. The pass rule covers all 31 routes (Task 5, Task 7).
2. **Desktop sidebar unchanged, intended changes limited to a list.** Check 767 px (mobile layout) and 768 px (desktop layout), compare sidebar and header geometry at 1440 and 768 px with `before-admin-geometry.txt`, and list every page whose table or header changes on purpose.
3. **Admin menu accessibility.** `aria-expanded` and `aria-controls` on the button, Escape closes **and returns focus to the button only if focus was inside the menu panel** (the theme toggle keeps its focus), choosing a link closes, the panel scrolls on a short phone. Pinned by tests and by a real-keyboard walkthrough.
4. **Button fix side effects.** The hover arrow must still slide in; the label descenders ("y" in "RM75/yr") must not be cut (the file's own comment warns about this); focus ring unchanged. Only the x axis is clipped.
5. **Re-keyed audit entries.** Every edited line that carried a deferral keeps its deferral under the new text (Task 3, Task 4, Task 5, Task 6, Task 8).
6. **Store filter.** The "All" choice needs a non-empty sentinel value (Radix `Select.Item` cannot have `value=""`); a `storeId` in the URL that is not in the list is ignored, so the trigger is never blank. The Select must stay fast with 1,000 stores, proved on a production build with one timing record per action (Task 6 Step 8).
7. **Admin role restored.** The local role of the admin user is back to its original value after every admin session, including an interrupted one.

## Model routing

Sonnet: layout classes, two small client components, tests, JSON edits. No RLS, auth, payment or schema code, so no Opus review. Fable not needed.

## Verification method (used in Tasks 1 to 7)

Pass rule per route at a measured viewport width W (390 for all 31 routes, and also 768 for the 22 admin routes): `documentElement.scrollWidth === innerWidth` (the measured W), `clippedTables === 0`, and no entry in `tables` that is wider than W with `scroller: "visible"`. **All 31 routes must pass at 390 and all 22 admin routes at 768 (53 measurements).** Measuring function (the same text is used before and after):

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
  const tables = [...document.querySelectorAll("table")].map((t) => {
    let p = t.parentElement
    while (p && p !== document.body && getComputedStyle(p).overflowX === "visible")
      p = p.parentElement
    return {
      width: Math.round(t.getBoundingClientRect().width),
      scroller: p && p !== document.body ? getComputedStyle(p).overflowX : "visible",
    }
  })
  return {
    path: location.pathname,
    innerWidth: window.innerWidth,
    scrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    clippedTables,
    tables,
  }
}
```

- **Seller and public pages:** Playwright MCP, `browser_resize` to 390 × 844, seeded seller `4a18dc0e-30f1-446d-bc60-5592b4d37044@test.bomy` signed in through Mailhog (see memory `feedback_local_seller_login_via_mailhog.md`; no cookie minted), `browser_evaluate` with the function above on each route.
- **Admin pages:** Charlie's signed-in Chrome. An iframe at 390 px, and again at 768 px, of a same-origin admin page runs the same function (the iframe technique worked in PR 5). Dynamic routes use real ids from the local database (`select id from stores limit 1;` and the same for `products` and `seller_inquiries`; `/orders/[orderId]` has no data locally and is not in the ledger). Needs the local admin role; follow "Admin role safety" below for every session.
- **Routes (31):** admin `/auth/sign-in`, `/brand-plans`, `/brand-subscriptions`, `/categories`, `/config`, `/goodie-box`, `/memberships`, `/orders`, `/payouts`, `/payouts/reconciliation`, `/products`, `/products/[id]`, `/seller-inquiries`, `/seller-inquiries/[id]`, `/store-categories`, `/stores`, `/stores/[id]`, `/stores/new`, `/unauthorized`, `/users`, `/vouchers`, `/vouchers/new` (22); seller `/seller/dashboard`, `/orders`, `/products`, `/products/[id]/edit`, `/products/new`, `/settings`, `/subscriptions` (7); public `/brands`, `/products` (2).
- Save every result as JSON in the scratchpad folder `pr5c/` (`before.json`, `after.json`) with the commit it was taken on.

## Admin role safety

The admin app needs the local user `charliekong.work@gmail.com` to hold the `bomy_admin` role. That is a change to local data, so it is recorded and always undone.

- **Record the original once, before any change** (Task 1 Step 2): `docker exec bomy_postgres psql -U bomy -d bomy -Atc "select role from users where email='charliekong.work@gmail.com';"`, saved to the scratchpad file `pr5c/original-admin-role.txt` and repeated in the log. Do not assume it is `buyer`. If that file is missing, do not guess: ask Charlie.
- **Promote only at the start of an admin session:** `update users set role='bomy_admin' where email='charliekong.work@gmail.com';`
- **Restore at the end of every admin session** (Task 1, Task 4 Step 7, Task 5, Task 6, Task 7): `update users set role='<contents of original-admin-role.txt>' where email='charliekong.work@gmail.com';` then run the select again and confirm it prints the original role.
- **Interrupted session:** an admin step can be cut off (the browser closes, the context ends). So every admin step starts with the **role check**: run the select; if it prints `bomy_admin` and no admin session is in progress, restore the original role first, then promote again only if this step needs it.
- **Final check:** Task 7 Step 5 ends with the select printing the original role; record that in the log.

---

### Task 1: Baseline, before any code changes

**Files:** none (scratchpad only).

- [ ] **Step 1: Branch and plan check.** `git branch --show-current` prints `feat/bomy-ui-package-pr5c`; `git log --oneline -1` shows this plan's commit on top of `e62f511`. `git status` shows no tracked changes.
- [ ] **Step 2: Start servers** (`pnpm --filter @bomy/web dev`; for admin `pnpm --filter @bomy/admin dev`). **Record the original role** of the admin user in `pr5c/original-admin-role.txt` (see "Admin role safety"), then promote the user for this session. Ask Charlie to pick Chrome with `switch_browser` and to be signed in to the admin app.
- [ ] **Step 3: Measure all 31 routes at 390 px** with the function above. Expect the ledger's numbers (for example `/seller/dashboard` 490, `/brand-subscriptions` 90,856, `/brands` and `/products` 392). Measure the 22 admin routes again at 768 px. Save `before-web.json`, `before-admin.json` and `before-admin-768.json`. A route that cannot be reached is recorded as "not evaluated" with the reason. Also record what `main` does with `/brand-subscriptions?storeId=not-a-uuid` and with a valid unknown UUID. **Done 2026-10-09:** 390 px matches the ledger; 768 px 9 pass and 13 fail; malformed `storeId` HTTP 500, unknown UUID HTTP 200 with an empty table.
- [ ] **Step 4: Desktop screenshots at 1440 × 900** (light and dark): seller `/seller/dashboard` and `/seller/dashboard/products`; admin `/stores`, `/vouchers` and `/brand-subscriptions`. Also 768 × 900 for `/seller/dashboard` and admin `/stores`. Save as `before-*.png`.
- [ ] **Step 5: Button baseline.** On `/brands` and `/products` at 390 px, record the scroll width **at rest** (fresh load, pointer away, nothing focused: 392) and with the button hovered or focused (390), and take hover and keyboard-focus screenshots of the Search button (default size). On `/membership` (the "Join now — RM75/yr" button, `apps/web/src/app/(marketing)/membership/page.tsx:124`) take rest and hover screenshots at 1440 px. These show the arrow slide and the descenders before the change. Save as `before-button-*.png`.
- [ ] **Step 6: Stop the servers**, confirm ports 3000 to 3002 are clear, **restore the original role** and confirm it with the select. No commit.

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
- [ ] **Step 5: Browser check.** Start the web dev server. At 390 px, **measured at rest** (fresh load, pointer away, nothing focused; a hover or focus reading is 390 even before the fix and proves nothing), `/brands` and `/products` now measure `scrollWidth === 390` and nothing scrolls sideways (the parked arrow keeps a geometric right edge of 392 but the wrapper clips it, so scroll width is the criterion, not element rectangles); hovered and focused they still read 390. Repeat the Task 1 Step 5 screenshots: the arrow still slides in on hover and on keyboard focus, the "y" descender in "RM75/yr" is intact, the focus ring is unchanged. If the arrow or the descender is cut, move `overflow-x-clip` from the wrapper to the button root (`rootClassName`) and re-run this step. Save `after-button-*.png`. Stop the server.
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
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button" data-testid="theme" />,
}))

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

  it("returns focus to the menu button when Escape closes the menu from inside it", () => {
    act(() => toggle().click())
    const first = panel().querySelector<HTMLAnchorElement>("a")!
    act(() => first.focus())
    expect(document.activeElement).toBe(first)
    act(() => {
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).toBe(toggle())
  })

  it("leaves focus on the theme toggle when Escape closes the menu", () => {
    const theme = container.querySelector<HTMLButtonElement>('header [data-testid="theme"]')!
    act(() => toggle().click())
    act(() => theme.focus())
    expect(document.activeElement).toBe(theme)
    act(() => {
      theme.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).toBe(theme)
  })

  it("does not take focus when Escape closes the menu while focus is elsewhere", () => {
    const outside = document.createElement("input")
    document.body.appendChild(outside)
    act(() => toggle().click())
    act(() => outside.focus())
    act(() => {
      outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).toBe(outside)
    outside.remove()
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

import { useEffect, useRef, useState } from "react"
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
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      // Escape hides the panel, so focus that was inside it would be lost: return it to the menu
      // button. Focus anywhere else (the theme toggle, the page) is left where it is.
      const active = document.activeElement
      if (active && panelRef.current?.contains(active)) triggerRef.current?.focus()
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
              ref={triggerRef}
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
          ref={panelRef}
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
- [ ] **Step 4: Tests, format, types, lint.** The nine sidebar tests pass; run `pnpm exec prettier --check` on the four files, then `pnpm --filter @bomy/admin typecheck`, `pnpm --filter @bomy/admin lint` and the whole `pnpm --filter @bomy/admin test --run` (record the count; the 13 `DATABASE_URL` files are not evaluated).
- [ ] **Step 5: Mutation checks (restore after each).** (a) Remove `hidden` from the mobile panel: the "starts closed" test fails. (b) Remove the Escape listener: the Escape test fails. (c) Remove `onNavigate` from the mobile `NavLinks`: the "link is chosen" test fails. (d) Remove `md:hidden` from the header: the "top bar" test fails. (e) Remove `triggerRef.current?.focus()`: the focus-return test fails. (f) Replace the whole focus guard (`if (active && panelRef.current?.contains(active)) triggerRef.current?.focus()`) with an unconditional `triggerRef.current?.focus()`: the "theme toggle" test and the "focus is elsewhere" test both fail, while the focus-return test still passes, which shows the guard is what they test.
- [ ] **Step 6: Audit.** `node scripts/ui-audit/scan.mjs --allow-deferred`. Edited lines give stale entries plus new open hits (the `aside`, header, active link and footer lines). Re-key each stale entry to its new line text, same rule, same reason, same follow-up. The new `Button` and icon lines must not add hits (no raw `<button>`). Result: stale 0, open 0.
- [ ] **Step 7: Browser check** (Charlie's Chrome, local admin role promoted, admin dev server). **Run the role check first and restore the role afterwards.** At 390 px: the top bar shows, the menu opens and closes (button, Escape, choosing a link); with the real keyboard, Tab to the menu button, Enter opens, Tab into the panel, Escape closes and `document.activeElement` is the "Open menu" button; and with focus on the theme toggle, Escape closes the menu and focus stays on the theme toggle; 15 links reachable on a short viewport (390 × 600 scrolls inside the panel), the sticky bar stays at the top while the page scrolls. The 22 admin routes: record `scrollWidth` and `clippedTables` at 390 and at 768 px; pages that still fail either width go to Task 5. At 767 and 768 px the layout switches; 1440 px matches `before-*.png`. Light and dark.
- [ ] **Step 8: Commit** the four paths. Message: `feat(admin): sticky top bar and menu below md; sidebar unchanged from md up`.

### Task 5: Every remaining overflow, found by diagnosis (31/31 gate)

**Files:** none are known in advance. They are the admin and seller pages that the diagnosis below names. Known starting points: the 15 admin pages (`products`, `config`, `stores`, `brand-plans`, `memberships`, `users`, `goodie-box`, `orders`, `orders/[orderId]`, `vouchers`, `store-categories`, `payouts`, `payouts/reconciliation`, `brand-subscriptions`, `categories`) and 2 seller pages (`products`, `subscriptions`) that contain a `<table`, but overflow can also come from forms, headers, button rows, grids and long unbroken text.

**Interfaces:** none. Produces: every one of the 31 routes passes the pass rule.

- [ ] **Step 0: Role check.** Run the role check from "Admin role safety" before any admin session.
- [ ] **Step 1: Measure all 31 routes** at 390 px, and the 22 admin routes also at 768 px, with Tasks 2 to 4 applied (the measuring function above). Write a table of every route and width that fails: `scrollWidth > innerWidth`, or `clippedTables > 0`, or any table whose `scroller` is `visible` and wider than the viewport.
- [ ] **Step 2: Diagnose each failing route.** Run this on the page and read the list innermost-first (the outer elements are ancestors of the cause):

```js
;() => {
  const vw = document.documentElement.clientWidth
  const out = []
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.right <= vw + 1) continue
    let p = el.parentElement
    let clipped = false
    while (p && p !== document.body) {
      if (getComputedStyle(p).overflowX !== "visible") {
        clipped = true
        break
      }
      p = p.parentElement
    }
    if (clipped) continue
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className).slice(0, 80),
      right: Math.round(r.right),
      width: Math.round(r.width),
      text: (el.textContent || "").trim().slice(0, 30),
    })
  }
  return out.sort((a, b) => b.right - a.right).slice(0, 8)
}
```

Record, per route, the cause class and the file and line to change. Do not guess from the ledger text: the ledger's "plus page content" is exactly what this step names.

- [ ] **Step 3: Fix at the cause, not with a blanket clip.** Allowed fixes, by cause:
  - **Table in any container** (a plain `Card`, which has no overflow rule so the table pushes the whole page wider; a `Card className="overflow-hidden"` or `rounded-xl overflow-hidden` div, which clips columns with no way to reach them; or a bare table): give the table's container `overflow-x-auto`. For `overflow-hidden` containers replace the class (`<Card className="overflow-hidden">` becomes `<Card className="overflow-x-auto">`); for a bare table wrap it in `<div className="overflow-x-auto">`. The rounded corners keep clipping the background.
  - **Form rows and button rows** (fixed widths, no wrap): `flex-wrap`, `w-full sm:w-auto`, `min-w-0`, `grid-cols-1 sm:grid-cols-N`.
  - **Headers with a title and actions**: `flex-wrap gap-y-2`.
  - **Long unbroken text** (ids, emails, URLs): `min-w-0` with `break-words` or `truncate`.
  - **`<pre>` and code blocks**: `overflow-x-auto`.

  Every class added must have no visible effect at `md` and up: use wrap-only classes or `sm:`/`md:` variants. Never add `overflow-x-hidden` to `main`, `body` or `html`: that hides the symptom and strands content.

- [ ] **Step 4: Re-measure.** Gate: **31 of 31 routes at 390 px and 22 of 22 admin routes at 768 px** pass (`scrollWidth === innerWidth`, `clippedTables === 0`, no table wider than the viewport with a `visible` scroller). On a page with a table, a screenshot shows the table scrolling sideways inside its card with the header row intact. At 1440 px every touched page is compared with its baseline screenshot; take one in Task 1 for each page the diagnosis names (Task 1 captured five; capture the others now on `main` through a second worktree of `origin/main` if the touched page was not in the baseline set).
- [ ] **Step 5: A route that cannot pass is not moved silently.** If a route still fails after reasonable fixes, or cannot be reached, **stop** and ask Charlie and Bob for explicit approval to re-scope it. Its ledger entry then stays deferred with an updated `followUp`, and the PR body lists it by name. Without that approval the gate stays at 31/31 and Task 9 does not start.
- [ ] **Step 6: Format, types, lint and tests** for the touched apps (`pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/web test --run`; the `DATABASE_URL` files stay "not evaluated"). No new unit test: these are class changes that jsdom cannot judge; the browser measurements are the evidence.
- [ ] **Step 7: Audit.** Edited lines may carry R6 exception entries (the raw `<table>` rule) or palette deferrals keyed on the edited line. Re-key stale entries as in Task 3. Stale 0, open 0.
- [ ] **Step 8: Restore the role** (see "Admin role safety") and record the check. Commit the changed pages and list files, explicit paths. Message: `fix(web,admin): stop remaining 390 px overflow (scrolling tables, wrapping rows)`.

### Task 6: `/brand-subscriptions` store filter

**Files:**

- Create: `apps/admin/src/app/brand-subscriptions/store-filter-helpers.ts` (plain module: a function exported from a `"use client"` file cannot be called by the server page, so the helpers live here)
- Create: `apps/admin/src/app/brand-subscriptions/store-filter.tsx`
- Create: `apps/admin/tests/brand-subscriptions/store-filter-helpers.test.ts`
- Modify: `apps/admin/src/app/brand-subscriptions/page.tsx`
- Modify: `scripts/ui-audit/deferred.json` / `exceptions.json` (re-key only, if flagged)
- Temporary, **never committed**: `apps/admin/src/app/pr5c-perf/page.tsx` and `probe.tsx` (large-list harness, Step 8)

**Interfaces:**

- Produces `StoreOption = { id: string; name: string; href: string }`, `ALL`, `hrefForStore(value, allHref, options)`, `normalizeStoreId(storeId, stores)` and `StoreFilter({ value, allHref, options })`. The page passes precomputed hrefs because a server page cannot pass functions to a client component.
- **Behaviour change, stated on purpose:** a `storeId` that is not a store with subscriptions (unknown or malformed) is ignored. The page shows all subscriptions and the trigger reads "All stores". Before, on `main` (recorded in Task 1): a malformed value such as `not-a-uuid` returned **HTTP 500**, and a valid but unknown UUID returned 200 with an empty table and nothing selected.

- [ ] **Step 0: Role check** (see "Admin role safety").
- [ ] **Step 1: Write the failing test** `apps/admin/tests/brand-subscriptions/store-filter-helpers.test.ts` (node environment):

```ts
import { describe, expect, it } from "vitest"

import {
  hrefForStore,
  normalizeStoreId,
  type StoreOption,
} from "@/app/brand-subscriptions/store-filter-helpers"

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

describe("normalizeStoreId", () => {
  it("keeps an id that is in the list", () => {
    expect(normalizeStoreId("s1", options)).toBe("s1")
  })
  it("drops an id that is not in the list", () => {
    expect(normalizeStoreId("zzz", options)).toBe("")
  })
  it("treats a missing or empty id as no filter", () => {
    expect(normalizeStoreId(undefined, options)).toBe("")
    expect(normalizeStoreId("", options)).toBe("")
  })
  it("drops a malformed value instead of passing it to the query", () => {
    expect(normalizeStoreId("not-a-uuid'; --", options)).toBe("")
  })
})
```

Run `pnpm --filter @bomy/admin exec vitest run tests/brand-subscriptions/store-filter-helpers.test.ts`: fails (module missing).

- [ ] **Step 2: Create `store-filter-helpers.ts`:**

```ts
export const ALL = "all"

export type StoreOption = { id: string; name: string; href: string }

export function hrefForStore(value: string, allHref: string, options: StoreOption[]): string {
  if (value === ALL) return allHref
  return options.find((option) => option.id === value)?.href ?? allHref
}

// Only ids that appear in the store list count as a filter, so the trigger is never blank and a
// malformed value never reaches the query.
export function normalizeStoreId(storeId: string | undefined, stores: { id: string }[]): string {
  return storeId && stores.some((store) => store.id === storeId) ? storeId : ""
}
```

- [ ] **Step 3: Create `store-filter.tsx`:**

```tsx
"use client"

import { useRouter } from "next/navigation"

import { Label } from "@bomy/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"

import { ALL, hrefForStore, type StoreOption } from "./store-filter-helpers"

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

- [ ] **Step 4: Change `page.tsx`.** Four edits (shown as text because they are fragments):

```text
1. Imports: add
   import { StoreFilter } from "./store-filter"
   import { normalizeStoreId } from "./store-filter-helpers"

2. Rename the search parameter and move the `stores` query ABOVE the main `rows/total` query
   (the query block that starts "const stores = await withAdmin(" and ends with
   ".orderBy(schema.stores.name),\n  )"). Keep its reason string. Then:
   const { status, storeId: storeIdParam, page: pageParam } = await searchParams
   ...
   const activeStoreId = normalizeStoreId(storeIdParam, stores)

3. Use activeStoreId everywhere storeId was used:
   - in the conditions: if (activeStoreId) { conditions.push(eq(schema.brandSubscriptions.storeId, activeStoreId)) }
   - in buildHref: const sid = next.storeId ?? activeStoreId ?? ""

4. Header: className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"; the status chips wrapper
   becomes "flex flex-wrap gap-1 text-sm"; replace the whole {stores.length > 0 && (...)} block
   (the "Store:" label and its row of links) with:

   {stores.length > 0 && (
     <div className="sm:ml-auto">
       <StoreFilter
         value={activeStoreId}
         allHref={buildHref({ storeId: "" })}
         options={stores.map((s) => ({
           id: s.id,
           name: s.name,
           href: buildHref({ storeId: s.id }),
         }))}
       />
     </div>
   )}
```

The status chips stay as links (six fixed items, they wrap).

- [ ] **Step 5: Tests, format, types, lint.** The seven helper tests pass. Mutation checks: (a) make `normalizeStoreId` return `storeId ?? ""`: the "drops an id" and "malformed" tests fail; (b) make `hrefForStore` return `options[0].href` for every store: the "chosen store" test fails. `prettier --check`, `pnpm --filter @bomy/admin typecheck`, `pnpm --filter @bomy/admin lint`, each run directly. If a jsdom render test of `StoreFilter` is practical (Radix Select needs `hasPointerCapture` and `scrollIntoView` stubs), add one that checks the trigger text for a known and an unknown value; if it is not practical, say so in the PR and rely on Steps 7 and 8.
- [ ] **Step 6: Audit.** The removed link rows, the renamed parameter and the edited header lines may leave stale entries (only entries whose line text changed are re-keyed; if the line is gone the entry is removed). The `<table` entry for this page is re-keyed if Task 5 touched it. Stale 0, open 0.
- [ ] **Step 7: Browser check on the real page** (Charlie's Chrome, admin). At 390 px and at 768 px `/brand-subscriptions` passes the pass rule. With the real keyboard: Tab to the Store trigger, Enter opens, ArrowDown moves, Enter selects: the URL gets `?storeId=<id>`, the trigger shows that store's name, pagination links keep the filter; reopen, choose "All stores": the filter clears. `?storeId=<random uuid>` and `?storeId=not-a-uuid`: both return **HTTP 200** (the malformed one was 500 on `main`) and the page lists all subscriptions, the trigger reads "All stores" (not blank), and the links drop the bad id. Repeat the `fetch` probe from Task 1 and record the status and row count for both. At 1440 px the header looks sensible (title, chips, filter on the right).
- [ ] **Step 8: Large-list check** (the condition Bob and Charlie set for choosing a Select). **A production-build pass is required.** The dev server alone never approves the Select, because the pinned Radix bug (#4097) shows only in production builds. If the production pass cannot be run, or fails, stop and request explicit re-scope approval from Charlie and Bob (the paged list, Option 2, adds query and paging code).

  **8a. Create the temporary harness** (never committed). It renders the real `StoreFilter` with generated options, touches no database, and includes a probe that gives **one timing record per action**:

  `apps/admin/src/app/pr5c-perf/probe.tsx`. The probe object is created once and reused, so a remount after client navigation cannot erase the records, and it sets `ready` when it is listening:

```tsx
"use client"

import { useEffect } from "react"

type Probe = {
  ready: boolean
  mark: number
  actions: { type: string; key: string; ms: number }[]
  longtasks: { start: number; ms: number }[]
}

export function Probe() {
  useEffect(() => {
    const w = window as unknown as { __probe?: Probe }
    if (w.__probe) {
      w.__probe.ready = true
      return
    }
    const probe: Probe = { ready: false, mark: 0, actions: [], longtasks: [] }
    w.__probe = probe
    // One record per key press or pointer press: input time to the second animation frame after it.
    const onEvent = (e: Event) => {
      const start = e.timeStamp
      const key = e instanceof KeyboardEvent ? e.key : ""
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          probe.actions.push({ type: e.type, key, ms: Math.round(performance.now() - start) }),
        ),
      )
    }
    // Never removed: this is a temporary page and the probe lives as long as the page session.
    window.addEventListener("keydown", onEvent, true)
    window.addEventListener("pointerdown", onEvent, true)
    // Long tasks are kept separately, with their start time, so page-load work can be told apart.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longtasks.push({ start: Math.round(entry.startTime), ms: Math.round(entry.duration) })
      }
    }).observe({ type: "longtask", buffered: true })
    probe.ready = true
  }, [])
  return null
}
```

`apps/admin/src/app/pr5c-perf/page.tsx`:

```tsx
import { StoreFilter } from "@/app/brand-subscriptions/store-filter"

import { Probe } from "./probe"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; storeId?: string }>
}) {
  const { n, storeId } = await searchParams
  const count = Math.min(Number(n) || 1000, 5000)
  const options = Array.from({ length: count }, (_, i) => {
    const num = String(i + 1).padStart(4, "0")
    const name = i === count - 1 ? "Zulu Traders" : `Store${num}`
    return { id: `id-${num}`, name, href: `/pr5c-perf?n=${count}&storeId=id-${num}` }
  })
  const value = options.some((o) => o.id === storeId) ? (storeId ?? "") : ""
  return (
    <div className="p-6">
      <Probe />
      <StoreFilter value={value} allHref={`/pr5c-perf?n=${count}`} options={options} />
      <p id="picked">{value}</p>
    </div>
  )
}
```

Record the real local count of stores with subscriptions for the log. The matrix to run is **n = 100** (plausible) and **n = 1000** (10 times the expected size) at **390 and 1440 px wide**: four runs, `/pr5c-perf?n=100` and `/pr5c-perf?n=1000`.

**8b. The measuring run: one browser call per run.** Real Playwright key presses (trusted events), the whole sequence inside **one** `browser_run_code_unsafe` call, so the type-ahead keys land inside Radix's one-second search window (browser-tool round trips take longer than that). The run has three parts that are measured separately: (1) wait for the probe; (2) the interaction sequence **before** the store is chosen, whose records are read and checked before the last key; (3) the final Enter and the navigation, timed on their own. Each press in part 2 is counted, and the probe must return exactly one record for each:

```js
;async (page) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const trigger = page.getByRole("combobox", { name: "Store" })
  const highlighted = () =>
    page.evaluate(
      () => document.querySelector('[role="option"][data-highlighted]')?.textContent ?? null,
    )
  const out = {}

  // (1) Wait for the probe to be listening; a probe that never starts is a failed run.
  await page.waitForFunction(() => window.__probe && window.__probe.ready === true, null, {
    timeout: 10000,
  })
  await sleep(500) // let page-load work settle, then mark the start of the sequence
  await page.evaluate(() => {
    window.__probe.mark = performance.now()
  })
  const startRecords = await page.evaluate(() => window.__probe.actions.length)

  // (2) The interaction sequence. Nothing here navigates.
  let presses = 0
  const press = async (key) => {
    presses += 1
    await page.keyboard.press(key)
  }
  await trigger.click() // pointer open: one pointerdown record
  await sleep(400)
  await press("Escape")
  await sleep(300)
  await trigger.focus()
  await press("Enter") // keyboard open
  await sleep(400)
  await press("End")
  await sleep(400)
  out.afterEnd = await highlighted() // expect "Zulu Traders"
  await press("Home")
  await sleep(400)
  for (const k of ["z", "u", "l", "u"]) await press(k) // type-ahead, all inside one second
  await sleep(200)
  out.afterZulu = await highlighted() // expect "Zulu Traders"
  await sleep(1500) // let the search buffer clear
  await press("Home")
  await sleep(300)
  for (const k of ["s", "t", "o", "r", "e", "0", "5"]) await press(k)
  await sleep(200)
  out.afterStore05 = await highlighted() // expect text starting "Store05"
  for (let i = 0; i < 20; i += 1) await press("ArrowDown") // scroll
  await press("PageDown")
  await press("PageDown")
  await sleep(400)
  await press("End") // the late store is highlighted again, ready to be chosen
  await sleep(500) // let every animation-frame record land before reading

  // Read and keep the sequence results BEFORE the selection can navigate or remount the probe.
  const pre = await page.evaluate(() => JSON.parse(JSON.stringify(window.__probe)))
  const seq = pre.actions.slice(startRecords)
  const seqTasks = pre.longtasks.filter((t) => t.start >= pre.mark)
  out.expectedRecords = presses + 1 // every key press plus the one pointer press
  out.records = seq.length
  out.slowestMs = Math.max(0, ...seq.map((a) => a.ms))
  out.actions = seq
  out.longTasksDuringSequenceMs = seqTasks.map((t) => t.ms) // gated
  out.longTasksBeforeMarkMs = pre.longtasks.filter((t) => t.start < pre.mark).map((t) => t.ms) // page load, reported only

  // (3) Choose the late store and time the selection and the navigation on their own.
  const navMark = await page.evaluate(() => performance.now())
  const t0 = Date.now()
  presses += 1
  await page.keyboard.press("Enter")
  await page.waitForURL(/storeId=id-/)
  await page.waitForFunction(
    () => document.getElementById("store-filter")?.textContent?.trim() === "Zulu Traders",
  )
  out.selectToUpdatedMs = Date.now() - t0
  out.url = page.url()
  out.trigger = (await trigger.innerText()).trim() // expect "Zulu Traders"
  out.picked = await page.locator("#picked").innerText()
  // The probe object is reused across the client navigation. If it is gone (a full reload), the
  // final Enter has no paint record and that is stated, not hidden.
  await sleep(500)
  const post = await page.evaluate(() =>
    window.__probe ? JSON.parse(JSON.stringify(window.__probe)) : null,
  )
  const persisted = Boolean(post) && post.actions.length >= pre.actions.length
  out.probePersistedAcrossNavigation = persisted
  const last = persisted ? post.actions.slice(pre.actions.length).at(-1) : null
  out.finalEnterMs = last && last.key === "Enter" ? last.ms : null
  out.longTasksDuringNavigationMs = persisted
    ? post.longtasks.filter((t) => t.start >= navMark).map((t) => t.ms)
    : null // reported only
  return out
}
```

**Pass rules, all required for each of the four runs:**

1. The probe started: the `waitForFunction` did not time out.
2. `records === expectedRecords`, counted **before** the selection. A missing record is a **failure**, never a pass: an empty or short list means the probe did not record, and the run is repeated or reported as failed.
3. `slowestMs <= 200` (every action in the sequence reaches the next paint within 200 ms).
4. Long tasks: only `longTasksDuringSequenceMs` is gated, and none may exceed 250 ms. These are the tasks that started after the mark, so page-load work (`longTasksBeforeMarkMs`) does not count against the sequence. Report the count and the largest value of both lists even when they pass.
5. `afterEnd` and `afterZulu` both equal "Zulu Traders" (the late store is reached by `End` and by type-ahead); `afterStore05` starts with "Store05".
6. Selection and navigation, measured separately: `selectToUpdatedMs <= 1000`; `trigger` equals "Zulu Traders"; `picked` equals the last generated id (`id-0100` or `id-1000`). If `finalEnterMs` is present it must be `<= 200`; if it is `null` the probe did not survive the navigation, which is reported as such (the earlier records were already read and checked before the final Enter, and the selection time above covers the last key).

**8c. Dev server first (a dry run), then the production build (the authoritative run).** The admin app sets `output: "standalone"`, so `next start` is the wrong command: run the generated `server.js`, as in the working PR 4 recipe (`docs/superpowers/plans/2026-10-05-bomy-shared-ui-package-pr4.md`, Task 5 Step 4b). The harness files must be present for the build. Stop any dev server on 3002 first, and do **not** start a dev server after the build (a dev server wipes `.next/standalone`).

```bash
APP=/Users/charlie/Documents/Projects/BOMY/app
pnpm --filter @bomy/admin build
mkdir -p "$APP/apps/admin/.next/standalone/apps/admin/.next/static"
cp -R "$APP/apps/admin/.next/static/." "$APP/apps/admin/.next/standalone/apps/admin/.next/static/"
# apps/admin/public exists; copy it too only if it has files in it
if [ -n "$(ls -A "$APP/apps/admin/public" 2>/dev/null)" ]; then
  mkdir -p "$APP/apps/admin/.next/standalone/apps/admin/public"
  cp -R "$APP/apps/admin/public/." "$APP/apps/admin/.next/standalone/apps/admin/public/"
fi
cd "$APP/apps/admin/.next/standalone/apps/admin"
AUTH_TRUST_HOST=true PORT=3002 HOSTNAME=localhost node --env-file="$APP/apps/admin/.env.local" server.js
```

Facts from the PR 4 verification that apply here: (1) the standalone `server.js` does **not** read `.env.local`, so the `--env-file` flag is what supplies `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` and the Google keys (without it the app fails with `MissingSecret` and `makeDb: a database URL is required`); (2) do not `source` the env file, line parsing fails, use Node's `--env-file`; (3) a production-mode Auth.js needs `AUTH_TRUST_HOST=true` locally or `/api/auth/session` fails with `UntrustedHost`; (4) `.next/` is gitignored, commit nothing from it. Check that `AUTH_URL` in `apps/admin/.env.local` is `http://localhost:3002` (print only that one key).

Expected before any browser step: `Ready in …ms`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/auth/sign-in` prints `200`; the same for `/api/auth/session`; and one `/_next/static/chunks/<file>.js` named in the sign-in HTML prints `200` (this proves the static files were copied). Auth: this is the same origin as the dev server, so Charlie's own Google session is normally still valid; if it is not, Charlie signs in again himself. **No cookie is minted, encoded or copied.** If the session does not carry over, the production pass is "not evaluated" and the rule above (stop and request re-scope approval) applies.

Run the 8b script for all four matrix runs on the production server; the dev dry run is optional and its numbers are labelled "dev" in the log. Also record the one-line result `afterZulu` from the production runs: this is the production type-ahead proof for admin.

**8d. Clean up.** Stop the server (ports 3000 to 3002 clear). Delete `apps/admin/src/app/pr5c-perf/` (both files), confirm `git status` no longer lists it, and rely on Task 7 Step 1, which builds the clean tree.

- [ ] **Step 9: Restore the role** (see "Admin role safety") and record the check. Commit only the four tracked paths (`store-filter-helpers.ts`, `store-filter.tsx`, the helper test and `page.tsx`) plus any list file, explicit paths; the harness is gone. Message: `fix(admin): brand-subscriptions store filter becomes a Select; header wraps`.

### Task 7: Full verification and final browser sweep

- [ ] **Step 0: Role check** (see "Admin role safety").
- [ ] **Step 1:** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/web build`, `pnpm --filter @bomy/admin build`. Capture each exit code by running it directly. Expected new tests: web +2 (1 Button, 1 seller layout; web was 278 passed), admin +16 (9 sidebar, 7 helpers; plus any `StoreFilter` render test). Report the passed totals as printed, and the `DATABASE_URL` files and skipped tests as **not evaluated** with the reason. If a command exits 1 while the passed count is as expected, say both.
- [ ] **Step 2: Measure all 31 routes at 390 px and the 22 admin routes at 768 px** (the same function and sessions as Task 1). Save `after.json` (390) and `after-admin-768.json`. **Gate: 31 of 31 at 390 and 22 of 22 at 768 pass** (`scrollWidth === innerWidth`, `clippedTables === 0`, no table wider than the viewport with a `visible` scroller). Also measure `/brands` and `/products` **at rest** (fresh load, pointer away, nothing focused): both must read 390. A route that fails or cannot be reached stops the PR until Charlie and Bob approve a re-scope (see Task 5 Step 5); it is never reported as passing.
- [ ] **Step 3: Desktop regression.** Repeat the Task 1 Step 4 screenshots at 1440 and 768 and re-run the geometry capture for the five admin pages, comparing with `before-*.png` and `before-admin-geometry.txt`. The **sidebar** (176 px admin, `w-52` seller), link positions, active style and header must be identical. Differences are allowed **only** on the intended-change list: table scrollers (Task 5), the `/brand-subscriptions` header and filter (Task 6), and the admin pages that overflow at 768 px today (their `main` and table widths now fit the viewport). Take 1440 px screenshots of every page Task 5 touched against its baseline. Any other visible difference is a failure to fix, not to explain away.
- [ ] **Step 4: Mobile walkthrough, light and dark.** Seller: strip scrolls, links navigate, active bar shows. Admin, with the real keyboard: Tab to the menu button, Enter opens, Tab into the panel, Escape closes **and focus is on the "Open menu" button**; a link navigates and closes the menu; the sign-out button is visible in the panel. Button: hover and focus frames match the baseline apart from the removed overflow, and the at-rest scroll width is 390.
- [ ] **Step 5: Stop servers** (ports 3000 to 3002 clear), close the Chrome tab, **restore the role** (see "Admin role safety") and record the final check in the log.

### Task 8: Ledger and audit lists (after the final measurements)

**Files:** Modify `scripts/ui-audit/findings.json`, `scripts/ui-audit/deferred.json`, `scripts/ui-audit/exceptions.json` (only where needed).

- [ ] **Step 1: Resolve the ledger entries that `after.json` proves.** For each of the 31 `ov-*` entries and `man-b11`, `man-b15`, `man-b19`: `status: "resolved"`, delete `followUp`, set `evidence` to the measured fact and the commit (for example: "Fixed 2026-10-09 in <commit>: scrollWidth 390 at 390 px and, for admin, 768 at 768 px, clippedTables 0 (before: 879 and 879); after.json route 12; tests/... pins the classes"). Resolve nothing that Task 7 Step 2 did not pass. A route re-scoped with approval stays deferred, with its `followUp` rewritten to say what remains.
- [ ] **Step 2: Gates.** `pnpm ui:audit --allow-deferred` exits 0 (stale 0, invalid 0, open 0); `pnpm ui:audit:test` 17/17; plain `pnpm ui:audit` exits 1 (5a, 5b and 5d remain). Record the counts; ledger deferred before: 83.
- [ ] **Step 3: Commit** the list files. Message: `docs(ui): resolve the PR 5c overflow findings`.

### Task 9: PR and wrap-up

- [ ] **Step 1: Push and open the PR** only after Charlie says go. Body: what and why (34 ledger entries), the four causes and fixes, tests and mutation checks, audit counts before and after (279 hits, 119 deferred, ledger 83 deferred / 11 resolved before), the before/after table of the 31 `scrollWidth` values at 390 px and the 22 admin values at 768 px (31 of 31 passing, or the approved re-scopes by name), the Select large-list numbers from the production build (dev numbers labelled as dev), the `storeId` behaviour change (HTTP 500 to 200), the list of pages whose tables or headers changed on purpose, the Button overflow measured at rest, the admin role restored, desktop comparison result, and **not evaluated** (the `DATABASE_URL` files and skipped tests; admin pages not reached; `/orders/[orderId]` has no local data; touch behaviour; Safari and Firefox, because `overflow-x: clip` needs Safari 16+ and the checks ran in Chromium only; checkout; keyboard focus-ring on the admin menu if not run).
- [ ] **Step 2: After merge:** write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr5c.md` (gitignored), update `.andy/handoff.md`, update the rollout memory, delete the local and remote branch (Charlie approved this pattern).
- [ ] **Step 3: Next:** PR 5a (colour tokens, needs the design call), 5b (provider Select proof), 5d. Fold the scanner nit (`--routes --json` omits `listErrors`) into the next scanner touch; it is **not** part of this PR.

---

## Self-review

- **Spec coverage:** shell overflow admin (Task 4), seller (Task 3), Button 2 px (Task 2), every remaining overflow by diagnosis with a 31/31 gate (Task 5, Task 7), store filter with its large-list check (Task 6), ledger after the final measurements (Task 8), verification at 390 px per fix and overall.
- **Placeholders:** none. Task 5 names no fix file in advance and chooses by diagnosis, which is intended: the right set depends on what Tasks 3 and 4 leave behind.
- **Consistency:** `StoreOption`, `ALL`, `hrefForStore` and `normalizeStoreId` live in `store-filter-helpers.ts` and match in test, component and page. The sidebar test ids (`header button[aria-controls]`, `#admin-mobile-menu`) match the markup. The seller test classes match the layout.
- **Known risks:** `overflow-x-clip` in Safari below 16; the Select's speed with 1,000 stores and its production type-ahead, both required on a production build (Task 6 Step 8); the admin checks depend on Charlie's Chrome session; tests pin classes but cannot judge layout, so the browser measurements carry the proof.
