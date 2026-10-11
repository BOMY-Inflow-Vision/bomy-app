# PR 5a-2 — Migrate the 35 fixed status and role colour pairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the 35 fixed palette colour pairs (green/amber/yellow/orange/red/blue/emerald/purple) onto the `success`/`warning`/`info`/`destructive` tokens and `Badge` variants, so they follow the theme. Leave the nav scrim as the one palette exception.

**Architecture:** Colour-only swaps. Where a site is already a `<Badge>`, use the variant and drop the colour `className`. Where a site is a class map, a hand-made `<span>`/`<div>`, or a `Button` override, swap only the colour classes. No element, shape, spacing, handler, or logic changes. One new Badge variant (`destructive-subtle`) because no soft red exists yet.

**Tech Stack:** Tailwind 3.4 tokens (`hsl(var(--x))`), cva Badge in `packages/ui`, Vitest, `scripts/ui-audit`, Playwright, claude-in-chrome.

**Spec:** `docs/superpowers/plans/2026-10-10-bomy-ui-package-pr5a-status-tokens-proposal.md` (token set and contrast rules) and ledger entry `man-5a2` in `scripts/ui-audit/findings.json`.

**Baseline:** `main` `9d84d0e`. Branch `feat/bomy-ui-package-pr5a2`. Model: Sonnet for Tasks 1 to 5 (mechanical); Opus only if a contrast check forces a token change.

## Global Constraints

- Text contrast 4.5:1; icons/graphics 3:1; focus ring against surface 3:1 (same rules as 5a).
- Token values from 5a stay unchanged. No new colour tokens (see Decision D1 for the one open point).
- Colour-only: no change to `type`, `disabled`, handlers, text, structure, or sizes. Class maps keep their keys.
- Mapping rule: green and emerald mean `success`; amber, yellow and orange mean `warning`; blue means `info`; red means `destructive`. Same rule 5a used for the variant-picker pills.
- Explicit commit paths only. Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push until Charlie says go. Do not poll CI.
- Report anything not run in a browser or without `DATABASE_URL` as "not evaluated".

## Decision for Charlie

**D1 — role badges** (`admin/src/app/users/page.tsx`, 4 pairs). Roles are not statuses, and two of the four hues have no token (emerald, purple).

- **Option A (chosen by Charlie 2026-10-11):** `seller_owner` → success, `bomy_ops` → info, `seller_staff` → `bg-secondary text-secondary-foreground`, `bomy_finance` → `border border-border bg-card text-foreground`. No new tokens. Role name is already the badge text, so colour is not the only clue. `buyer` (muted) and `bomy_admin` (accent) stay as they are.
- **Option B:** add a four-colour "role" token set. More tokens, more tests, and the roles still would not be statuses.

## Review Focus

- Admin tables render a badge over `bg-muted` hover rows; `destructive/10` is translucent, so measure it over card, page, and muted row in both themes (the 5a toast failure was a translucent tint over a dark bar).
- Dark mode now shows dark tints where it showed pastel boxes; check text on every tinted box in dark, not only light.
- `account/subscriptions` has `hover:bg-green-100` on a `Badge`; Badge has no hover style, so the override is a no-op. Removing it must not change hover.
- `payouts/_payout-actions.tsx` "Processing" is a `Button` with a blue hover; rest and hover pair must both pass, and `disabled` must keep working.
- Seller status maps are indexed by status key; an unknown status falls through today. The key set must not change.

## The 35 pairs and their target

Counts: web 20 pairs in 9 files, admin 15 pairs in 8 files (17 files in all). Row numbers match the exception list order.

| #     | File                                              | Site                                         | Today                             | Target                                                                                                   |
| ----- | ------------------------------------------------- | -------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1     | web `(marketing)/membership/manage/page.tsx`      | `<Badge>` pending                            | amber-100/700                     | `variant="warning"`, drop className                                                                      |
| 2     | same                                              | `<Badge>` Active                             | green-100/700                     | `variant="success"`, drop className                                                                      |
| 3     | same                                              | notice `<div>`                               | amber-50/800                      | `bg-warning-subtle text-warning`                                                                         |
| 4     | web `account/subscriptions/page.tsx`              | Badge active                                 | green-100/700 + hover             | `variant="success"`, drop className                                                                      |
| 5     | same                                              | Badge pending                                | amber-100/700 + hover             | `variant="warning"`, drop className                                                                      |
| 6     | web `auth/sign-in/page.tsx`                       | notice `<div>`                               | amber-50/800 + ring-amber-200     | `bg-warning-subtle text-warning ring-1 ring-warning/30`                                                  |
| 7     | web `seller/apply/page.tsx`                       | notice `<div>`                               | yellow-50/800                     | `bg-warning-subtle text-warning`                                                                         |
| 8-10  | web `seller/dashboard/page.tsx`                   | `STATUS_COLORS` map active/pending/suspended | green/amber/red 100/700           | `bg-success-subtle text-success`, `bg-warning-subtle text-warning`, `bg-destructive/10 text-destructive` |
| 11    | web `…/products/[id]/edit/product-edit-form.tsx`  | back-order span                              | orange-100/700                    | `bg-warning-subtle text-warning`                                                                         |
| 12    | same                                              | pre-order span                               | blue-100/700                      | `bg-info-subtle text-info`                                                                               |
| 13    | web `seller/dashboard/products/page.tsx`          | status map active                            | green-100/700                     | `bg-success-subtle text-success`                                                                         |
| 14-17 | web `seller/dashboard/settings/settings-form.tsx` | 4 success boxes                              | green-50/700                      | `bg-success-subtle text-success`                                                                         |
| 18    | web `seller/dashboard/subscriptions/page.tsx`     | span active                                  | green-100/700                     | `bg-success-subtle text-success`                                                                         |
| 19-20 | same                                              | 2 spans pending                              | amber-100/700                     | `bg-warning-subtle text-warning`                                                                         |
| 21    | web `nav-bar.tsx`                                 | backdrop scrim                               | gray-900/20                       | **stays an exception** (reason already says why)                                                         |
| 22    | admin `categories/category-row.tsx`               | Badge active                                 | secondary + green-100/700         | `variant="success"`; inactive branch unchanged                                                           |
| 23    | admin `payouts/_payout-actions.tsx`               | Processing Button                            | blue-100/700, hover blue-200      | `bg-info-subtle text-info hover:bg-info-subtle hover:brightness-95`                                      |
| 24    | admin `products/[id]/product-seo-form.tsx`        | success box                                  | green-50/700                      | `bg-success-subtle text-success`                                                                         |
| 25-27 | admin `seller-inquiries/[id]/page.tsx`            | Badge class map pending/approved/rejected    | amber/green/red 100/700           | warning, success, destructive-subtle (see Task 1); keep `border-transparent` only if still used          |
| 28-30 | admin `seller-inquiries/page.tsx`                 | same map                                     | same                              | same                                                                                                     |
| 31    | admin `store-categories/category-row.tsx`         | Badge active                                 | secondary + green-100/700         | `variant="success"`; inactive unchanged                                                                  |
| 32    | admin `stores/[id]/store-seo-form.tsx`            | success box                                  | green-50/700                      | `bg-success-subtle text-success`                                                                         |
| 33-36 | admin `users/page.tsx`                            | `ROLE_COLORS` owner/staff/ops/finance        | green/emerald/blue/purple 100/700 | per D1, Option A                                                                                         |

Visible effect on purpose: in dark mode these now show dark tints with light text instead of pastel boxes with dark text. In light mode, hues shift slightly to the token values (for example yellow and orange now share the warning amber, red-100/700 becomes a 10% red tint).

## File structure

- Modify: `packages/ui/src/components/badge.tsx` (one variant)
- Modify: the 17 source files in the table (9 web, 8 admin; the nav scrim file is not touched)
- Create: `apps/web/tests/design-tokens/status-pairs.test.ts` (contrast of every new pairing, both apps and themes)
- Modify: `apps/web/tests/components/status-variants.test.tsx` (pin the new variant)
- Modify: `scripts/ui-audit/exceptions.json`, `findings.json`
- Create after merge: log file, handoff, memory

---

### Task 1: `destructive-subtle` Badge variant

**Files:** Modify `packages/ui/src/components/badge.tsx`, `apps/web/tests/components/status-variants.test.tsx`

**Interfaces:** Produces `Badge variant="destructive-subtle"` = `border-transparent bg-destructive/10 text-destructive`.

- [ ] **Step 1:** Add a failing case in `status-variants.test.tsx`: render `<Badge variant="destructive-subtle">` and expect classes `bg-destructive/10` and `text-destructive`.
- [ ] **Step 2:** Run `pnpm --filter @bomy/web test status-variants --run`; expect FAIL.
- [ ] **Step 3:** Add `"destructive-subtle": "border-transparent bg-destructive/10 text-destructive"` to `badgeVariants`.
- [ ] **Step 4:** Rerun; expect PASS. Run `pnpm typecheck`.
- [ ] **Step 5:** Commit `packages/ui/src/components/badge.tsx apps/web/tests/components/status-variants.test.tsx`.

### Task 2: Contrast tests first (Review Focus items 1 and 2)

**Files:** Create `apps/web/tests/design-tokens/status-pairs.test.ts` (reuse the colour helpers in `contrast.test.ts`).

- [ ] **Step 1:** Write tests, both apps' `globals.css`, light and dark:
  - `text-success|warning|info` on `*-subtle`, and on the tint over card, page, and muted row: each ≥ 4.5.
  - `text-destructive` on `bg-destructive/10` composited over card, page (`background`), and `muted` row: each ≥ 4.5.
  - Processing button: `text-info` on `info-subtle` at rest and with `brightness-95` hover: ≥ 4.5.
  - Sign-in notice: gate the text only (`text-warning` on `warning-subtle`). The `ring-warning/30` ring is decorative (about 1.55:1 light, 1.82:1 dark against the page, measured by Bob); the notice is conveyed by its text, so no 3:1 gate on the ring.
  - Role badges per D1 Option A: `secondary-foreground` on `secondary`, `foreground` on `card`: ≥ 4.5.
- [ ] **Step 2:** Run it. Known-good values from 5a: success/warning/info on own tint 6.81/5.43/8.89 light, 6.90/7.18/6.71 dark. The `destructive/10` cases over muted are the real unknowns. If any fails, **stop and report**; do not change a token in this PR without Charlie.
- [ ] **Step 3:** Commit the test file.

### Task 3: Web pairs (rows 1-20)

**Files:** the 9 web files in the table.

- [ ] **Step 1 (per file):** make the swap in the table. Badge sites: set `variant`, delete the colour `className` (keep any other classes). Maps and spans: swap colour classes only, keep every other class.
- [ ] **Step 2:** `rg -n "bg-(green|amber|yellow|orange|red|blue|emerald|purple)-(50|100)" apps/web/src` returns **no matches**. Check the intentional scrim separately: `rg -n "bg-gray-900/20" apps/web/src/components/nav-bar.tsx` returns exactly one line.
- [ ] **Step 3:** `pnpm --filter @bomy/web typecheck` and `pnpm --filter @bomy/web test --run` (expect 356 + new tests passed; the two `DATABASE_URL` files still fail to start: not evaluated).
- [ ] **Step 4:** `git diff` check: no changed line touches `type=`, `disabled`, `onClick`, or text.
- [ ] **Step 5:** Commit explicit paths.

### Task 4: Admin pairs and roles (rows 22-36)

**Files:** the 8 admin files in the table (roles per D1 Option A).

- [ ] **Step 1:** Swaps as in the table. Payouts Processing keeps its `Button`, `onClick`, and `disabled={loading}`.
- [ ] **Step 2:** `rg` as above on `apps/admin/src` returns nothing.
- [ ] **Step 3:** `pnpm --filter @bomy/admin typecheck`, `test --run`, and `pnpm --filter @bomy/admin build`.
- [ ] **Step 4:** Commit explicit paths.

### Task 5: Audit lists and ledger

**Files:** `scripts/ui-audit/exceptions.json`, `findings.json`

- [ ] **Step 1:** Remove the 35 migrated entries from `exceptions.json` with a per-key counter (identical keys repeat, e.g. settings-form box, subscriptions span; a key-set removal would delete still-matching ones). Write with `ensure_ascii=True`, `indent=2`. Keep the nav scrim entry.
- [ ] **Step 2:** Resolve `man-5a2` with evidence (commit ids, test names, contrast numbers). Expected ledger: **45 deferred, 51 resolved**.
- [ ] **Step 3:** Run `pnpm ui:audit --allow-deferred` (expect exit 0; 0 open, 0 stale, 0 invalid; exceptions 137 → 102; palette 36 → 1) and `pnpm ui:audit:test` (17/17). Plain `pnpm ui:audit` still exits 1 (5b, 43× 5d, `man-5a3`).
- [ ] **Step 4:** Commit both JSON files.

### Task 6: Browser checks, full gates, PR (stop for Charlie's go before pushing)

- [ ] **Step 1 (web, Playwright, seeded seller + buyer, light and dark):** for each reachable site, measure text against effective background; require ≥ 4.5. Reachable: membership manage, account subscriptions, sign-in notice, seller apply, seller dashboard status chip, products list, settings saved box, seller subscriptions. Compare with the 5a method and save numbers.
- [ ] **Step 2 (admin, Charlie's Chrome, same-origin iframes, confirm Chrome not Wavebox first):** seller-inquiries list and detail, users, categories, store-categories; payouts Processing at rest and hover; product and store SEO saved boxes if reachable.
- [ ] **Step 3:** Layout non-regression: web 390 px and admin 390/768 px widths unchanged (colour-only, so expect identical).
- [ ] **Step 4:** Full gates: install `--frozen-lockfile`, `typecheck`, `lint`, web and admin tests, both builds, prettier on diff files.
- [ ] **Step 5:** Write `.andy/pr5a2-pr-body.md` (format of `pr5a-pr-body.md`, ends with the 🤖 line, "Not evaluated" section listing data-dependent states, `DATABASE_URL` test files, Chromium only). **Report to Charlie; push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `app/log/2026-10-…_PR<N>_ui-pr5a2-status-pairs.md`, handoff, memory, delete branch. Reminders (hold-to-confirm, magnetic drop zone, Cloudflare lock) stay parked until plain `pnpm ui:audit` exits 0.

## Self-review

- Spec coverage: 35 pairs mapped (rows 1-20 web, 22-36 admin; row 21 scrim kept). Contrast tested in Task 2 before any swap. No behaviour change enforced by the colour-only rule and the Step 4 diff check.
- Not in this PR: `man-5a3` (dark `text-primary`), 5b, 5d, hand-made pills becoming `Badge` (5d), hold-to-confirm and drop zone.
- Risk: the `destructive/10` tint over muted rows (Task 2). If it fails, fall back to an opaque `destructive-subtle` token only with Charlie's approval.
