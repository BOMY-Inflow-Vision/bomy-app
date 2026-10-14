# PR 5d-9 — Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear ledger entries `man-t01`, `man-t30`, `man-t31` and `man-t32` by moving four hand-made or fighting button styles onto the shared `Button`: the disabled "Memberships will reopen soon" div (web), the two Reject buttons (admin), the payout action buttons (admin, money path) and the five editor toolbar buttons (admin). No new `@bomy/ui` piece; no change to any handler, argument, disabled rule or destination.

**Architecture:** Four small, independent edits. (1) `membership/page.tsx`: the `div` becomes a disabled `Button` inside the same `role="status"` wrapper. (2) The two Reject buttons share one class constant in a new `seller-inquiries/reject-style.ts`; the list row stays a `link` variant and the detail form stays `outline`. (3) `_payout-actions.tsx`: only the first "Fail" button changes (to `variant="destructive"`); `onClick`, `disabled` and every action call are untouched. (4) `brand-story-field.tsx`: the five raw toolbar `<button>` elements become one local `ToolbarIconButton` built on `Button` (ghost, with the 44 px target and the outline focus the toolbar uses today, like the existing `TableControlButton`).

**Tech Stack:** React 19, `@bomy/ui` Button, Vitest 2.1.9 (jsdom per file), Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-9).

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d9` from `main` (`1459811`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Out of scope:** D3 and 5d-2 (Cards), D6 and 5d-7 (mobile menu), 5d-12, 5d-8, `man-5a3`, any new `@bomy/ui` variant, the reject/approve/payout server actions, and the `Confirm`/`Cancel` payout buttons.
- **Money path (payouts):** `className` and `variant` only on the "Fail" button. `onClick`, `disabled`, `size`, the `loading` state and the calls `markPayoutProcessing`, `markPayoutCompleted`, `markPayoutFailed` and their arguments must not change; the diff for `_payout-actions.tsx` is reviewed line by line.
- Contrast: text 4.5:1, focus indicators 3:1. Report env-limited tests as "not evaluated". Evidence text may cite only what was actually verified.

## Review Focus

- **Payout actions behave the same.** Each button still calls the same action with the same arguments: Processing → `markPayoutProcessing(id)`; the Complete form requires a non-empty manual reference and calls `markPayoutCompleted(id, ref)`; the Fail form requires non-empty notes and calls `markPayoutFailed(id, notes)`. All buttons stay disabled while `loading`. The first "Fail" and "Complete" buttons still hide when either form is open. Tested with mocked actions before and after.
- **The disabled membership notice stays a notice.** It keeps its words, its `role="status"` wrapper, full-width layout, and stays readable: Button's disabled style fades to 50 % opacity, which would break text contrast, so the notice overrides it (`disabled:opacity-100`) and its colour pair (`text-muted-foreground` on `bg-muted`) is already pinned >= 4.5:1. It is not focusable and not clickable (a `div` before, a disabled button after).
- **Reject stays the same action in both places.** Same label ("Reject"), same `rejectInquiry(inquiryId)` call, same pending text ("Rejecting…" in the row), same toast, same warning colour; the row stays a link-style small button and the form stays an outline button.
- **Toolbar semantics hold.** Each of the five keeps its `aria-label`, `title`, `type="button"`, `aria-pressed` (bold-style and link buttons), 44 px minimum target, focus outline, hover and active colours, and the table trigger still receives its `ref` (focus returns to it) and `data-state="open"` style from Radix `PopoverTrigger asChild`.
- **Focus.** Toolbar buttons keep the 2 px outline focus they have today (not the Button ring); the new "Fail" and membership buttons use the Button ring. Rings >= 3:1 on their surfaces (existing token tests).
- **No layout shift.** The membership notice keeps its height (about 44 px); toolbar buttons keep 44 px boxes; payout row buttons keep `size="sm"` boxes.

## File Structure

- Modify `apps/web/src/app/(marketing)/membership/page.tsx`; `apps/admin/src/app/seller-inquiries/reject-button.tsx`, `apps/admin/src/app/seller-inquiries/[id]/approve-form.tsx`; `apps/admin/src/app/payouts/_payout-actions.tsx`; `apps/admin/src/components/brand-story-field.tsx`.
- Create `apps/admin/src/app/seller-inquiries/reject-style.ts`.
- Create tests: `apps/web/tests/membership/membership-closed-notice.test.tsx`, `apps/admin/tests/seller-inquiries/reject-buttons.test.tsx`, `apps/admin/tests/payouts/payout-actions.test.tsx`, `apps/admin/tests/components/brand-story-toolbar.test.tsx` (names adjusted to the existing folders).
- Modify `scripts/ui-audit/exceptions.json` (the five toolbar `R1-button` exceptions go) and `scripts/ui-audit/findings.json`.

## Decisions for Bob and Charlie

- **D17 (`man-t31`, visible change):** the ledger says Fail "becomes the destructive variant". Today the first "Fail" button is `outline` with a destructive tint, "Complete" is `outline` with a success tint, and "Processing" is `secondary` with an info fill; only Processing truly fights its variant. **Recommended (the inventory's plan):** change only the first "Fail" button to `variant="destructive"` (a solid red button replaces the tinted outline; it is hidden while the Fail form, which has its own destructive Confirm, is open, so two solid red buttons never sit side by side). Processing and Complete keep their tints, and the ledger evidence says so plainly: no soft info/success variant exists and adding one is a separate shared-package decision. **Alternative:** also move Processing from `secondary` to `outline` with an info border (a filled tint becomes a bordered one), so all three read as one family.
- **D18 (`man-t01`):** keep a `role="status"` wrapper around the disabled Button and override the disabled opacity so the notice stays readable (above). The alternative, a bare `Button disabled`, fades the text below 4.5:1 and drops the status role.
- **D19 (`man-t30`):** share the colour as a constant, not a component: `REJECT_TONE = "text-warning hover:text-warning"` used by both; the form adds `border-warning/40 hover:bg-warning-subtle`. The two handlers stay separate.
- **D20 (`man-t32`):** `ToolbarIconButton` is local to `brand-story-field.tsx`, built on `Button` (ghost, `h-auto`, `min-h-11 min-w-11`, `rounded`, `px-2`, `bg-background`, `hover:bg-muted`, `focus-visible:ring-0` plus the 2 px outline). It replaces the five raw buttons and their five `R1-button` exceptions. Not exported to `@bomy/ui`.

## Edit

1. Membership notice (`man-t01`):

```tsx
{!enabled ? (
  <div role="status">
    <Button
      type="button"
      variant="secondary"
      disabled
      className="h-auto w-full rounded-xl bg-muted px-6 py-3 text-center text-sm font-semibold text-muted-foreground shadow-none hover:bg-muted disabled:opacity-100"
    >
      Memberships will reopen soon
    </Button>
  </div>
) : session ? ( ...
```

2. Reject (`man-t30`): `reject-style.ts` exports `REJECT_TONE`; `reject-button.tsx` uses `className={cn("text-sm", REJECT_TONE)}`; `approve-form.tsx` uses `className={cn(REJECT_TONE, "border-warning/40 hover:bg-warning-subtle")}`.
3. Payouts (`man-t31`): the first Fail button: `variant="outline"` + `className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"` becomes `variant="destructive"` with no `className`.
4. Toolbar (`man-t32`):

```tsx
const ToolbarIconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      className={cn(
        "h-auto min-h-11 min-w-11 rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  ),
)
```

Each of the five call sites keeps its own state classes (active / not active / `data-[state=open]`) and its handlers.

---

### Task 1: Baselines on today's markup (no source change)

**Files:** the four test files above; (uncommitted) `.andy/pr5d9-baseline.json`.

- [ ] **Step 1 (membership, web, jsdom):** render the page's closed state (mock `@/auth`, `@/lib/db`, `@/lib/payments-enabled` → false, `./actions`); assert the text, `role="status"`, a non-focusable non-button element, "Today" classes; and, with payments enabled, that the notice is absent.
- [ ] **Step 2 (reject, admin, jsdom):** mock `./actions` (`rejectInquiry`, `approveInquiry`) and `useToast`; `RejectButton`: name "Reject", click calls `rejectInquiry(id)`, pending label "Rejecting…", success toast, error shows toast and text; `ApproveForm`: "Reject" calls `rejectInquiry(id)` with the same toast; both "Today" tokens (text and border/hover).
- [ ] **Step 3 (payouts, admin, jsdom):** mock the three actions and `useToast`; for `pending`: Processing click calls `markPayoutProcessing(id)` and the Processing button then disappears; for `processing`: Complete opens the form, Confirm disabled until a reference is typed, then `markPayoutCompleted(id, "REF")`; Fail opens the form, Confirm disabled until notes are typed, then `markPayoutFailed(id, "why")`; while an action is pending every button is disabled; the first Complete and Fail buttons hide while a form is open; "Today" tokens of the first Fail button and Complete and Processing.
- [ ] **Step 4 (toolbar, admin, jsdom):** render `BrandStoryField` (tiptap runs in jsdom; if it cannot, render the toolbar through a small test harness that mounts the real `ToolbarButton`, `LinkButton`, `InsertImageUrlButton`, `InsertTableButton`, `EmbedYouTubeButton` with a stub editor, exporting them for test if needed and noting it); assert the five buttons by `aria-label`, `title`, `type="button"`, `aria-pressed` on the toggles, the 44 px classes, the focus outline classes and the open-state class on the table trigger; clicking the table trigger opens its popover.
- [ ] **Step 5 (browser baseline, Playwright, uncommitted):** web `/membership` with payments disabled if the local flag allows it (otherwise report as not evaluated in the browser); the admin components have no signed-in session in Playwright, so render them on a temporary harness page under `/auth/sign-in/zz-harness` (deleted afterwards; the same method as 5d-6) in light and dark at 390 and 1280 px: record the box, fill, border, text colour, radius and opacity of every button, and the focus style after a real Tab. Save to `.andy/pr5d9-baseline.json`.
- [ ] **Step 6:** run the tests on unchanged source: expect PASS. Mutation-check four: change a payout action argument, remove the `disabled` of the pay buttons while loading, change the Reject action id, drop the toolbar `aria-pressed`; each must fail; restore.
- [ ] **Step 7:** commit the four test files by explicit path: `test(ui): baseline of the buttons in 5d-9 (membership notice, reject, payouts, toolbar)`.

### Task 2: Membership notice (`man-t01`)

- [ ] **Step 1:** Apply Edit item 1. Update only class-token expectations and the "is a button" assertions (disabled, not focusable). Commit: `refactor(ui): membership closed notice uses a disabled Button (5d-9)`.

### Task 3: Reject buttons (`man-t30`)

- [ ] **Step 1:** Create `reject-style.ts`; apply Edit item 2; update only the token expectations. Commit: `refactor(ui): the two Reject buttons share one tone constant (5d-9)`.

### Task 4: Payout actions (`man-t31`)

- [ ] **Step 1:** Apply Edit item 3 (D17 recommended). Run `git diff -U0 apps/admin/src/app/payouts/_payout-actions.tsx` and confirm only the one `variant`/`className` hunk changed; paste it into the PR body. Update only the Fail token expectations. Commit: `refactor(ui): payout Fail action uses the destructive variant (5d-9)`.

### Task 5: Toolbar buttons (`man-t32`)

- [ ] **Step 1:** Apply Edit item 4. Remove the five `R1-button` exceptions in the same commit only after the scanner confirms they are stale. Update only token expectations. Commit: `refactor(ui): editor toolbar buttons use one local ToolbarIconButton (5d-9)`.

### Task 6: Ledger

- [ ] **Step 1:** Run the scanner, remove any stale exception, resolve `man-t01`, `man-t30`, `man-t31` (evidence states D17 plainly), `man-t32` in `findings.json` with evidence limited to what was verified. Expect **13 deferred, 84 resolved** (97 entries); scanner 0 deferred, 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit.

### Task 7: Browser proof and gates; stop before the push

- [ ] **Step 1 (compare with the baseline):** repeat the Task 1 capture; expected differences only: the first Fail button's fill and text colour, the membership notice's element (same box), the toolbar buttons' boxes unchanged. Real keys: Tab to a toolbar button (2 px outline), Enter/Space toggles bold on the harness editor, the table trigger opens its popover and focus returns to it on close; Tab to the Reject buttons and the Fail button (ring).
- [ ] **Step 2:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites, `@bomy/ui` typecheck, `pnpm build` (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and tests; `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 3:** Write `.andy/pr5d9-pr-body.md` (format of the 5d-10 body; ends with the 🤖 line; includes the payout diff hunk, D17 to D20, measured deltas, visible changes and the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d9-buttons.md`, handoff, memory, delete branch.

## Visible changes to disclose

1. The first payout "Fail" button is a solid red button instead of a tinted outline (D17).
2. The membership notice is a disabled button element, not a div; same text, box and colours; no longer announced as plain text by a screen reader browsing mode (it is still inside a `role="status"` wrapper).
3. Reject buttons: no visible change expected (shared tone constant); measured.
4. Toolbar buttons: no visible change expected; focus outline kept.

## Self-review

- **Coverage:** `man-t01` → Task 2; `man-t30` → Task 3; `man-t31` → Task 4; `man-t32` → Task 5; each has a baseline test (Task 1) and a ledger line (Task 6).
- **Money path:** only a `variant`/`className` hunk in `_payout-actions.tsx`; action-call tests before and after, mutation-checked.
- **Risk, in order:** the payout hunk growing beyond a class change; the disabled notice failing contrast through opacity; the table trigger losing its ref or `data-state` style through `Button`; toolbar focus ring doubling (outline plus ring); a stale scanner exception.
