# PR 5d-1 — Status pills onto Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the hand-made status pills and coloured status text with `Badge` variants, so one status look exists everywhere. Resolves `man-t04`, `man-t05`, `man-t06`, `man-t07`, `man-t08`, `man-t09`, `man-t29`, and resolves `man-b10` by ledger evidence only.

**Architecture:** One new `Badge` variant, `muted`. One pure helper per app that maps a status string to a `Badge` variant (`apps/web/src/lib/status-badge.ts`, `apps/admin/src/lib/status-badge.ts`) so the mapping is unit-testable and the pages stay thin. The page files swap their hand-made spans, class maps and coloured `<td>` text for `<Badge variant={...}>`. No logic, query or handler changes.

**Tech Stack:** `@bomy/ui` Badge (cva), Tailwind 3.4 tokens, Vitest, Playwright MCP.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-1, decisions D1 and D4) and the ledger entries named above.

**Baseline:** `main` `5538b72`. Branch `feat/bomy-ui-package-pr5d1`. Model: Sonnet (mechanical swaps); Opus only if a contrast check fails.

## Global Constraints

- Colour-only and markup-only: no change to queries, handlers, `type`, `disabled`, text content, routes, or which statuses exist.
- Token values from 5a stay unchanged; no new colour tokens. The only `@bomy/ui` change is the `muted` Badge variant (existing tokens).
- Text contrast 4.5:1 in both themes, both apps (same rule as 5a and 5a-2).
- **Size rule (revised after Bob's review).** Only the **two header pills** must keep identical dimensions: the seller dashboard store status and the order detail header. Badge adds a 1 px border, so they use `border-0` plus their original padding and weight, defined once as constants in `apps/web/src/lib/status-badge.ts`: `HEADER_PILL_CLASS = "border-0 px-3 py-1 font-medium"` and `ORDER_HEADER_PILL_CLASS = "border-0 px-3 py-1 text-sm font-medium capitalize"`. Their width and height are **measured** before and after (Task 7) and must be equal. Every other pill (list, table, inline label) takes the Badge default (`px-2.5 py-0.5 text-xs font-semibold`, 1 px transparent border) and **grows on purpose**: height +2 px always; width +2 px where the old span was already `px-2.5` (seller subscriptions chips) and +6 px where it was `px-2` (the product-edit pills, the seller orders list pill), plus a small change from `font-medium` to `font-semibold`. The increase is **recorded** (before and after widths and heights) and disclosed in the PR body; it is not gated.
- Mapping: active, dispatched = `success`; pending = `warning`; delivered = `info`; expired, payment_failed, suspended = `destructive-subtle`; draft, archived, cancelled, inactive and any unknown status = `muted`; the accent pills (seller orders) = `accent`.
- Stage explicit paths only. Charlie's untracked `apps/web/src/app/products/loading.tsx` stays untracked and unstaged; move it aside for builds and put it back. Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push until Charlie says go. Do not poll CI.
- Not evaluated stays "not evaluated".

## Decisions

- **D4 decided yes (Charlie, 2026-10-12): admin status cells become Badge pills** on `brand-subscriptions`, `memberships`, `goodie-box` and `stores`. Today three of them are plain coloured text and `stores` is an outline Badge with coloured text. This is the one visible change in the slice and is disclosed in the PR body.

## Review Focus

- **Admin row surfaces.** The four admin table rows have **no hover background**; the pills sit on `bg-card` (`brand-subscriptions`, `memberships`, `stores`, all inside `Card`) and on `bg-background` (`goodie-box`, a bordered `div`). Measure on those real surfaces, and use `bg-muted` as an extra stress case (a muted pill on a muted surface loses its edge; its text stays readable at 5.58 light and 8.46 dark).
- **Memberships cell.** The status `td` also holds a "(cancelled <date>)" span. Only the status word goes inside the Badge; the date span stays beside it.
- **Unknown status.** Today the maps fall back to muted or no colour; the helper must fall back to `muted` and never throw.
- **Header pills** (`dashboard/page.tsx`, `orders/[orderId]/page.tsx`): Badge adds a 1 px border, so `border-0` is required to keep the geometry; the before and after width and height are measured, and any difference stops the slice. Also check the Badge's `inline-flex` against the old `inline` or `inline-block` display in the header layouts.
- **Product-edit "Inactive" label** is a muted label, not a status of the product; it still becomes a `muted` Badge and keeps its place next to the fulfillment pill.
- **b10 evidence must be true when written:** re-run `git ls-files` and `git log --all` for `apps/web/src/app/products/loading.tsx` and the scanner with and without the file in the final gate.

## The sites

| Entry | File                                                                                | Site today                                                                                                             | After                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t04` | web `seller/dashboard/products/[id]/edit/product-edit-form.tsx`                     | `FulfillmentBadge`: back-order span (warning pair), pre-order span (info pair); "Inactive" muted span (about line 686) | `<Badge variant="warning">Back-order</Badge>`, `<Badge variant="info">Pre-order …</Badge>`, `<Badge variant="muted">Inactive</Badge>`                       |
| `t05` | web `seller/dashboard/subscriptions/page.tsx`                                       | three spans (success, warning, warning), `font-medium`                                                                 | `<Badge variant="success">`, `<Badge variant="warning">` ×2                                                                                                 |
| `t06` | web `seller/dashboard/products/page.tsx`                                            | span with `STATUS_COLORS[p.status] ?? ""` (draft and archived muted, active success)                                   | `<Badge variant={productStatusVariant(p.status)}>`; remove `STATUS_COLORS`                                                                                  |
| `t07` | web `seller/dashboard/page.tsx`                                                     | header span with `STATUS_COLORS[store.status]` (active, pending, suspended)                                            | `<Badge variant={storeStatusVariant(store.status)} className={HEADER_PILL_CLASS}>`; remove `STATUS_COLORS`                                                  |
| `t08` | web `seller/dashboard/orders/page.tsx`                                              | `rounded-full bg-accent` span, `mt-1 capitalize`                                                                       | `<Badge variant="accent" className="mt-1 capitalize">`                                                                                                      |
| `t09` | web `seller/dashboard/orders/[orderId]/page.tsx`                                    | header `rounded-full bg-accent` span, `px-3 py-1 text-sm font-medium capitalize`                                       | `<Badge variant="accent" className={ORDER_HEADER_PILL_CLASS}>`                                                                                              |
| `t29` | admin `brand-subscriptions/page.tsx`, `memberships/page.tsx`, `goodie-box/page.tsx` | `<td className={cn("px-4 py-3", STATUS_COLORS[row.status] ?? "text-muted-foreground")}>{row.status}</td>`              | `<td className="px-4 py-3"><Badge variant={statusVariant(row.status)}>{row.status}</Badge></td>`; memberships keeps its cancelled-date span after the Badge |
| `t29` | admin `stores/page.tsx`                                                             | `<Badge variant="outline" className={STATUS_COLORS[row.status]}>`                                                      | `<Badge variant={storeStatusVariant(row.status)}>`                                                                                                          |
| `b10` | ledger only                                                                         | see D1 in the inventory                                                                                                | resolve with evidence (Task 6)                                                                                                                              |

Admin variant map: pending `warning`; active `success`; cancelled `muted`; expired and payment_failed `destructive-subtle`; dispatched `success`; delivered `info`; suspended `destructive-subtle`; anything else `muted`. Web map: draft and archived `muted`; active `success`; pending `warning`; suspended `destructive-subtle`; anything else `muted`.

Visible effect on purpose: admin status text gains a tinted pill; seller pills gain `font-semibold` and (where they were `px-2`) `px-2.5`; `cancelled` and `draft` become a muted pill instead of bare muted text or a hand-made muted pill. Colours are the same status tokens as before, so contrast already passes; Task 2 re-proves it for the new `muted` pairing.

## Browser states: mandatory against optional

**Mandatory** (the PR is not ready without them, reported with numbers):

| #   | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Where                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| M1a | Real seller pages: dashboard (store status header pill), products list (active, and draft or archived if the seed has them), subscriptions (pending): text contrast 4.5 or higher in light and dark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | dev server, Playwright, seeded seller                                                      |
| M1b | **Deterministic fixture for the orders pages** (local data has **no orders**): (a) a Vitest render of the real orders list page and the real order detail page with their queries mocked, asserting the accent `Badge` markup and the exact header and list class strings; (b) a browser harness page that renders the same `Badge` with the exported constants beside the old hand-made span, light and dark, and records width and height before and after for **both header pills** (seller dashboard store status and order detail) and the list accent pill; header geometry must be identical; the list pills' before and after sizes are recorded as the intended increase, not gated | Vitest, then temporary harness page                                                        |
| M1c | Real order list and detail routes, and any other data-dependent state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **only when the local data exists** (otherwise reported as not evaluated; M1b is the gate) |
| M1d | **Pending subscription Badge.** If the seeded seller used for M1a has a pending plan, measure it on the real page. If the seed has none, render the real `subscriptions/page.tsx` in Vitest with `getSellerPlansData` mocked to a fixed fixture (one active, one pending, one pending-activation row) and assert the `Badge` success and warning markup; the live pending state is then reported as **not evaluated**                                                                                                                                                                                                                                                                        | real page if the data exists, otherwise Vitest fixture                                     |
| M2  | 390 px: no horizontal overflow on the real seller pages in M1a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | same                                                                                       |
| M3  | **All four admin page mappings** on their real row surfaces: `brand-subscriptions` (pending, active, cancelled, expired, payment_failed), `memberships` (the same five, plus the cancelled-date span beside the Badge), `goodie-box` (pending, dispatched, delivered) and `stores` (pending, active, suspended). Pills on `bg-card` for three pages and `bg-background` for goodie-box (the actual surfaces; no row hover exists), plus `bg-muted` as a stress case; light and dark; contrast 4.5 or higher                                                                                                                                                                                  | temporary harness page with the real `Badge` and compiled CSS (deleted after)              |
| M4  | All gates (typecheck, lint, tests, builds, prettier, audit gate, audit tests, `rg` for leftover hand-made pills in the touched files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | local                                                                                      |

**Optional, reported as "not evaluated" with the reason if skipped:** the real admin pages in Charlie's Chrome (needs Chrome to answer the connect request; it did not in 5a-2 or 5b, so ask once and do not retry); real order routes when no orders exist (M1c); data states the seed lacks (`expired` or `payment_failed` memberships); Firefox and Safari; the two web `DATABASE_URL` test files and the 13 admin files.

## File structure

- Modify: `packages/ui/src/components/badge.tsx` (one variant)
- Create: `apps/web/src/lib/status-badge.ts`, `apps/admin/src/lib/status-badge.ts`
- Create: `apps/web/tests/lib/status-badge.test.ts`, `apps/admin/tests/lib/status-badge.test.ts`
- Modify: `apps/web/tests/components/status-variants.test.tsx` (muted variant), `apps/web/tests/design-tokens/status-pairs.test.ts` (muted contrast)
- Modify: the 6 web and 4 admin page files in the table
- Modify: `scripts/ui-audit/findings.json` (8 entries resolved; no exceptions change expected)
- Create after merge: log, handoff, memory

---

### Task 1: `muted` Badge variant

**Files:** `packages/ui/src/components/badge.tsx`, `apps/web/tests/components/status-variants.test.tsx`

- [ ] **Step 1:** Add a failing case: `<Badge variant="muted">` renders `bg-muted` and `text-muted-foreground`, `border-transparent`, and not `text-foreground`.
- [ ] **Step 2:** `pnpm --filter @bomy/web test status-variants --run`; expect FAIL.
- [ ] **Step 3:** Add `muted: "border-transparent bg-muted text-muted-foreground"` to `badgeVariants`.
- [ ] **Step 4:** Rerun; expect PASS. `pnpm --filter @bomy/ui typecheck`.
- [ ] **Step 5:** Commit the two files.

### Task 2: Contrast gate for the muted pill (before any swap)

**Files:** `apps/web/tests/design-tokens/status-pairs.test.ts`

- [ ] **Step 1:** Add cases, both apps, light and dark: `muted-foreground` on `muted` is 4.5 or higher; the same text on a `muted` pill over `background` and `card` rows (the pill and the row are different surfaces). Measured while planning: 5.58 light and 8.46 dark on `muted`.
- [ ] **Step 2:** Run it. If any case fails, **stop and report** (a token change is a design call, not part of this slice).
- [ ] **Step 3:** Commit the test file.

### Task 3: Status helpers with tests first

**Files:** the two helpers and two test files.

- [ ] **Step 1 (web):** write `status-badge.test.ts` with literal expectations from the Web map above, including an unknown status and an empty string (both `muted`). Run: FAIL (module missing).
- [ ] **Step 2:** write `apps/web/src/lib/status-badge.ts` exporting `productStatusVariant(status: string)` and `storeStatusVariant(status: string)` (typed to `BadgeProps["variant"]`) and the two constants `HEADER_PILL_CLASS` and `ORDER_HEADER_PILL_CLASS` (exact strings in the Size rule; a test pins them, including `border-0`). Run: PASS.
- [ ] **Step 3 (admin):** the same for `apps/admin/src/lib/status-badge.ts` exporting `statusVariant(status: string)` (pending, active, cancelled, expired, payment_failed, dispatched, delivered, suspended, unknown) and `storeStatusVariant`, with the Admin map as literals. Run both test files.
- [ ] **Step 4:** Commit the four files.

### Task 4: Web pills (entries t04 to t09)

**Files:** the 6 web page files.

- [ ] **Step 0 (fixture tests first, M1b a):** write Vitest tests that render the real `seller/dashboard/orders/page.tsx` and `seller/dashboard/orders/[orderId]/page.tsx`. Both pages call `makeDb()` and `withTenant(...)` themselves (store lookup) and then the module's `queries`, so the tests must mock **`@bomy/db`** as well as `@/auth` and `./queries`: keep the real `schema` export (`vi.mock("@bomy/db", async (importOriginal) => ({ ...(await importOriginal()), makeDb: () => ({ db: {} }), withTenant: (_db, _ctx, fn) => fn(stubTx) }))`, where `stubTx` returns the fixture store row), stub `redirect` and `notFound` from `next/navigation`, and mock the action modules that the detail page's client components import (`_enter-tracking-form`, `_mark-delivered-button`). Use a fixed order fixture. Assert today's markup first (an accent span with `rounded-full bg-accent`, `capitalize`, the header classes) so the tests pass on `main`; then, after the swap, the same tests assert `Badge` accent markup with `mt-1 capitalize` on the list and `ORDER_HEADER_PILL_CLASS` on the detail header. Run before and after. Do not use `importOriginal` for anything that opens a connection; if the real module cannot be imported without `DATABASE_URL`, mock it fully and re-export a minimal `schema` stub.
- [ ] **Step 1:** Apply the table: import `Badge` from `@bomy/ui/badge` where missing; replace spans with `Badge`; use the helpers; keep header-pill sizes through `className`; delete the now-unused `STATUS_COLORS` maps.
- [ ] **Step 2:** `rg -n "rounded-full" ` over those six files returns only the filter-chip links (`t13` and the orders chips, left for 5d-4) and nothing that is a status pill.
- [ ] **Step 3:** `pnpm --filter @bomy/web typecheck` and `test --run` (expect the earlier count plus the new tests; the two `DATABASE_URL` files still fail to start: not evaluated).
- [ ] **Step 4:** `git diff` check: no changed line touches a query, handler, `type`, `disabled`, link target or text content.
- [ ] **Step 5:** Commit explicit paths.

### Task 5: Admin status cells (entry t29)

**Files:** the 4 admin page files (D4 decided yes).

- [ ] **Step 1:** Apply the table; memberships keeps the cancelled-date span after the Badge; remove the old `STATUS_COLORS` maps and any unused `cn` import.
- [ ] **Step 2:** `pnpm --filter @bomy/admin typecheck`, `test --run`, and `build`.
- [ ] **Step 3:** Commit explicit paths.

### Task 6: Ledger (including `man-b10`)

**Files:** `scripts/ui-audit/findings.json`

- [ ] **Step 1:** Resolve `man-t04`, `t05`, `t06`, `t07`, `t08`, `t09`, `t29` with evidence (commit ids, the helper tests, the contrast cases, the measured numbers).
- [ ] **Step 2:** Resolve `man-b10` with evidence, after re-running: `git ls-files apps/web/src/app/products/loading.tsx` (empty), `git log --all --oneline -- apps/web/src/app/products/loading.tsx` (empty), and `pnpm ui:audit --allow-deferred` with the file present and then moved aside (same total). Evidence text: "`apps/web/src/app/products/loading.tsx` is not tracked in git and has no history; it is Charlie's local untracked file, kept untracked by his decision (2026-10-12); the scanner reports the same totals with and without it. Re-audit if the file is ever added."
- [ ] **Step 3:** Expected ledger: **37 deferred** (36 for 5d plus `man-5a3`) and **59 resolved**. `pnpm ui:audit --allow-deferred` exits 0, 0 open, 0 stale; scanner totals unchanged (102 hits, 0 deferred); `pnpm ui:audit:test` 17 of 17; plain `pnpm ui:audit` still exits 1.
- [ ] **Step 4:** Commit `scripts/ui-audit/findings.json` (write with `ensure_ascii=True`, indent 2).

### Task 7: Browser proof and gates; stop before the push

- [ ] **Step 1 (M1a, M2, Playwright, seeded seller, light and dark):** sign in with the local magic link (a consented seeded seller), measure computed text against effective background for every Badge on the real pages in M1a, and run the 390 px overflow check. Compare the dashboard header pill's width and height with `main` on the real page (record both).
- [ ] **Step 2 (M1b b, M3):** one temporary harness page (uncommitted, deleted after) with (i) the old hand-made header span next to the new `Badge` with `HEADER_PILL_CLASS`, the order-detail pair with `ORDER_HEADER_PILL_CLASS`, and the list accent pair, recording width and height (identical, or stop); (ii) the four admin mappings on `bg-card` and `bg-background` rows (no hover) plus a `bg-muted` stress row, every status in each page's map, light and dark, with computed contrast. Try Charlie's Chrome for the real admin pages once; if it does not answer, list them as not evaluated and do not retry.
- [ ] **Step 3 (M4):** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, web and admin tests, `@bomy/ui` typecheck, both builds (loading.tsx moved aside, restored after), prettier on the diff, audit gate and audit tests. Check `git diff --name-only main HEAD` contains no `loading.tsx` and no stray files.
- [ ] **Step 4:** write `.andy/pr5d1-pr-body.md` (format of the 5b body; ends with the 🤖 line; includes the visible changes, the muted-row note, the b10 evidence, and the not-evaluated list). Report to Charlie. **Push and open the PR only after Charlie's go. Do not merge.**
- [ ] **After merge:** log `app/log/2026-10-…_PR<N>_ui-pr5d1-status-pills.md`, handoff, memory, delete branch.

## Self-review

- **Coverage:** t04 (3 sites), t05 (3), t06, t07, t08, t09, t29 (4 pages) each have a row in the sites table; b10 has Task 6.
- **Order:** the contrast gate (Task 2) and the helper tests (Task 3) come before any page changes.
- **Out of scope here:** the filter chips on the same pages (`t13`, 5d-4), Cards (`t15`, `t17`, 5d-2), `man-5a3`, the three parked reminders.
- **Risk, in order:** the hover-on-muted-row look; a header pill shrinking; an unknown status throwing (the helper must not throw).
