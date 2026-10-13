# PR 5d-3 — `Alert` primitive and three callouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a visual-only `Alert` to `@bomy/ui` and move the five hand-built callout boxes (ledger `man-t18` x2 boxes, `man-t26` x2 boxes, `man-t27` x1 row) onto it, with no change to what a screen reader announces today.

**Architecture:** `Alert` is a `div` with a `variant` (success, warning, info, destructive) built with `cva` on the 5a status tokens, exactly like `Badge`. It has **no `role` and no `aria-live` by default** (decision D5): a call site that must be announced passes `role` itself. All five call sites keep their geometry through `className` overrides (`cn` merges them). No sub-components (YAGNI).

**Tech Stack:** React 19, Tailwind 3.4 tokens, `class-variance-authority`, Vitest 2.1.9 (jsdom per file).

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-3, decision D5).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d3` from `main` (`934b207`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Keep 5d-2 (Cards, decision D3) and `man-5a3` out of this PR. Do not touch `toaster.tsx` (that is 5d-11, after this slice).
- Contrast: text 4.5:1. Report env-limited tests as "not evaluated".

## Review Focus

- **Announcements must not change.** Today none of the five boxes has `role` or `aria-live` (checked in source). After the swap none may gain one, and `Alert` must not add one by default. Test: rendered markup of each call site has no `role` and no `aria-live`; `Alert` with `role="alert"` passes it through.
- **Geometry must not change.** The error box is `p-3`, the others `p-4`; the reconciliation row is `rounded-xl px-6 py-4` and a flex row. Test: class tokens per site (baseline vs after) and a measured size on a harness.
- **The reconciliation `<li>` stays a list item.** The `Alert` goes inside the `li`, so the `ul` keeps valid list children. Test: the queue markup is still `ul > li`, and the Review link and its `href` are unchanged.
- **Text colour stays readable on every variant, light and dark.** The four subtle pairs are already gated by `status-pairs.test.ts` (5a-2); Task 2 confirms the exact pairs exist before relying on them.
- **Unknown variant or extra props.** `Alert` forwards `className`, `children` and any `div` attribute (`id`, `data-*`, `aria-*`) and never drops them.

## File Structure

- Create `packages/ui/src/components/alert.tsx` (the component) and its export `./alert` in `packages/ui/package.json`.
- Create `apps/web/tests/components/alert.test.tsx` (component tests; the web app already hosts the `@bomy/ui` component tests).
- Create `apps/web/tests/checkout/callouts.test.tsx` (checkout form baseline then after).
- Create `apps/admin/tests/callouts/callouts.test.tsx` (inquiry page and reconciliation baseline then after).
- Modify `apps/web/src/app/checkout/_form.tsx` (2 boxes), `apps/admin/src/app/seller-inquiries/[id]/page.tsx` (2 boxes), `apps/admin/src/app/payouts/reconciliation/page.tsx` (1 row).
- Modify `scripts/ui-audit/findings.json` (`man-t18`, `man-t26`, `man-t27` to resolved).

## Call-site map (today to after)

| Site                                   | Today                                                                                                  | After                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `_form.tsx` ~203, invalid lines        | `div.rounded-lg border border-warning/30 bg-warning-subtle p-4`                                        | `<Alert variant="warning">` (children unchanged)                                                   |
| `_form.tsx` ~438, top error            | `div.rounded-lg border border-destructive/30 bg-destructive/10 p-3`                                    | `<Alert variant="destructive" className="p-3">`                                                    |
| inquiry `[id]/page.tsx` ~101, approved | `div.rounded-lg border border-success/30 bg-success-subtle p-4 text-sm text-success`                   | `<Alert variant="success" className="text-sm">`                                                    |
| inquiry ~115, rejected                 | `div.rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive`           | `<Alert variant="destructive" className="text-sm">`                                                |
| reconciliation ~119, review row        | `li.flex items-center justify-between rounded-xl border border-warning/30 bg-warning-subtle px-6 py-4` | `<li><Alert variant="warning" className="flex items-center justify-between rounded-xl px-6 py-4">` |

`Alert` base classes: `rounded-lg border p-4`. Variant classes: success `border-success/30 bg-success-subtle text-success`; warning `border-warning/30 bg-warning-subtle text-warning`; info `border-info/30 bg-info-subtle text-info`; destructive `border-destructive/30 bg-destructive/10 text-destructive`. No text-size class in the base, so no site changes size. `info` has no call site yet (kept for the toaster in 5d-11; it is tested).

**D8 decided (Bob and Charlie):** use `Alert` for `man-t27`. The row is a warning callout, and `li > Alert` keeps the list valid and its existing warning colours and radius. `Card` would add `bg-card` and depend on the open Card colour decision D3. Record this decision in the resolved ledger entry.

**Announcement state, not changed here:** the checkout top error banner is quiet (no `role`), but the same message is already sent to the toaster (`toast.error(...)` in `handleSubmit`), whose live region announces it; adding `role="alert"` to the banner would announce it twice, so no such follow-up is planned. Only the invalid-lines warning has no announcement today. The instruction is to preserve today's behavior, so this PR keeps both as they are.

---

### Task 1: Baseline tests on today's markup (no source change)

**Files:** Create `apps/web/tests/checkout/callouts.test.tsx`, `apps/admin/tests/callouts/callouts.test.tsx`.

**Interfaces:** Consumes the real `CheckoutForm` (props as in `_form.tsx`), `SellerInquiryPage`, and the reconciliation page, with mocks as in `apps/web/tests/seller-dashboard/status-pills.test.tsx` (`@/auth`/`requireAdmin`, `next/navigation`, `@bomy/db` through `importOriginal` with stubbed `makeDb`/`withTenant`/`withAdmin`, and the page's queries and actions). Produces: a helper `box(html, text)` returning the class tokens and attributes of the element that holds `text`.

- [ ] **Step 1:** Read each page's data calls and write the mocks. For the checkout form use `// @vitest-environment jsdom`, mock `./actions` (`priceCheckoutPreview` resolves `{ ok: true, ... invalidLines: [...] }`, `initiateCheckout` resolves a failure code so `topError` shows), `@/lib/cart` and `@/components/toaster`.
- [ ] **Step 2:** Assert today's markup: each box has the exact tokens in the "Today" column, and **no `role` and no `aria-live`** on the box or its parent chain up to the form/section. For the reconciliation row assert `ul > li` and the `Review` link `href="/checkout-sessions/<id>"`.
- [ ] **Step 3:** Run both files; expect PASS on unchanged source. Mutation-check one assertion (change one expected token) to prove it fails, then restore.
- [ ] **Step 4:** If a page cannot be rendered in a fixture without changing source, stop and report; do not edit source to make it testable.
- [ ] **Step 5:** Commit the two test files by explicit path: `test(ui): baseline of the five callout boxes (5d-3)`.

### Task 2: `Alert` component and tests

**Files:** Create `packages/ui/src/components/alert.tsx`, `apps/web/tests/components/alert.test.tsx`; Modify `packages/ui/package.json` (add `"./alert": "./src/components/alert.tsx"`).

**Interfaces:** Produces `Alert`, `alertVariants`, `AlertProps` (`React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>`). `variant` defaults to `"info"`.

- [ ] **Step 1:** Write the failing tests: (a) each of the four variants renders its three colour tokens; (b) default renders `info`; (c) no `role` and no `aria-live` attribute by default; (d) `role="alert"` and `aria-live="polite"` pass through when given; (e) `className` merges after the variant (`p-3` replaces `p-4`, `rounded-xl` replaces `rounded-lg`); (f) `id`, `data-x` and children are forwarded.
- [ ] **Step 2:** Run; expect FAIL (module missing).
- [ ] **Step 3:** Implement, mirroring `badge.tsx`:

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils.js"

const alertVariants = cva("rounded-lg border p-4", {
  variants: {
    variant: {
      success: "border-success/30 bg-success-subtle text-success",
      warning: "border-warning/30 bg-warning-subtle text-warning",
      info: "border-info/30 bg-info-subtle text-info",
      destructive: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { variant: "info" },
})

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

// Visual only. It has no role or aria-live: a call site that must be announced passes them.
function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />
}

export { Alert, alertVariants }
```

- [ ] **Step 4:** Confirm the contrast pairs exist: `rg -n "success-subtle|warning-subtle|info-subtle|destructive" apps/web/tests/design-tokens/status-pairs.test.ts` shows text-on-subtle for all four variants in light and dark. If the destructive `bg-destructive/10` pair on `background` is missing, add it to that file (plan the numbers in the commit message). Run the file; expect PASS.
- [ ] **Step 5:** Run `pnpm --filter @bomy/ui typecheck` and the new test; commit `packages/ui/src/components/alert.tsx`, `packages/ui/package.json`, `apps/web/tests/components/alert.test.tsx` (and `status-pairs.test.ts` if edited): `feat(ui): Alert primitive, visual only (5d-3)`.

### Task 3: Swap the five call sites

**Files:** Modify the three source files in the map.

- [ ] **Step 1:** Replace each box per the map. Add `import { Alert } from "@bomy/ui/alert"` next to the other `@bomy/ui` imports. Keep every child element, text, link and class as it is; only the outer box changes. In the reconciliation page, move the `key={s.id}` to the `li`.
- [ ] **Step 2:** Update the Task 1 tests to the "After" markup: `Alert` classes present, geometry overrides present, **still no `role` or `aria-live`**, `ul > li` kept, link `href` unchanged.
- [ ] **Step 3:** Search only the three changed source files with `rg -n "border-warning/30|border-success/30|border-destructive/30" apps/web/src/app/checkout/_form.tsx 'apps/admin/src/app/seller-inquiries/[id]/page.tsx' apps/admin/src/app/payouts/reconciliation/page.tsx`; expect no matches. The shared `alert.tsx` is under `packages/ui`, and unrelated app callouts retain these classes outside this slice.
- [ ] **Step 4:** Run `pnpm --filter @bomy/web typecheck`, `pnpm --filter @bomy/admin typecheck`, both new test files and the `git diff` check that no handler, query, `href`, text or `disabled` changed. Commit explicit paths: `refactor(ui): checkout, inquiry and reconciliation callouts use Alert (5d-3)`.

### Task 4: Ledger

**Files:** Modify `scripts/ui-audit/findings.json`.

- [ ] **Step 1:** Resolve `man-t18`, `man-t26`, `man-t27` with evidence text that cites only what was done (source swap, the two test files, the contrast gate) and says what was not browser-evaluated. For `man-t27`, record the D8 decision and why `Alert` satisfies the warning callout even though the old description proposed `Card`; update that description if it would otherwise contradict the resolution. Keep `ensure_ascii=True`, indent 2.
- [ ] **Step 2:** Expect ledger **34 deferred, 62 resolved**; scanner 102 hits, 0 deferred; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit the file.

### Task 5: Browser proof and gates; stop before the push

- [ ] **Step 1 (M1, harness):** one temporary page (uncommitted, deleted after) showing, old markup next to `Alert`, the five boxes. Record width and height of each pair (must be equal) and, in light and dark, the computed text contrast on each variant (all at least 4.5).
- [ ] **Step 2 (M2, real pages):** the local web app, signed in as a seeded buyer: open `/checkout` with a cart that makes the live invalid-line warning and the top error appear if the seed allows it; otherwise report them as not evaluated (the fixture test covers the markup). Check 390 px for horizontal overflow on `/checkout`.
- [ ] **Step 3 (M3, admin):** the inquiry and reconciliation pages need an admin session; try Charlie's Chrome once, else report as not evaluated (fixture tests and the harness cover them).
- [ ] **Step 4 (M4):** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, web and admin tests, `@bomy/ui` typecheck, both builds (`loading.tsx` moved aside, restored after), prettier on the diff, audit gate and audit tests. Check `git diff --name-only main HEAD` has no `loading.tsx` and no stray files.
- [ ] **Step 5:** Write `.andy/pr5d3-pr-body.md` (format of the 5d-1 body; ends with the 🤖 line; lists visible changes, the unchanged announcements, the invalid-lines warning's missing announcement, D8 and the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d3-alert.md`, handoff, memory, delete branch.

## Self-review

- **Coverage:** t18 (2 boxes), t26 (2 boxes), t27 (1 row) each have a row in the map and a test in Tasks 1 and 3.
- **Out of scope:** toaster (5d-11), Cards (5d-2, D3), `man-5a3`, the three parked reminders.
- **Risk, in order:** a default `role` slipping into `Alert`; the reconciliation row losing its `li`; the error box padding (`p-3`) changing to `p-4`.
