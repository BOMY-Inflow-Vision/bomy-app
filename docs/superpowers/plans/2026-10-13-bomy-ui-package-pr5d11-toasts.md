# PR 5d-11 — Toast banners onto `Alert` and `Button` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the toast banner from the shared `Alert` and the dismiss control from the shared `Button`, in both the web and the admin toaster, with **no change** to the single outer live region, what is announced, the queue, the timers, the dismiss action, or where the banner sits.

**Architecture:** Only markup and classes inside `ToastRow` change. `ToastProvider`, `toastReducer`, `FlashToastListener`, the timers, the pause handlers and the outer `role="region" aria-live="polite"` container stay as they are. The banner `div` becomes `<Alert variant=... className=...>` (it spreads the same mouse and focus handlers); the raw `<button>` becomes `<Button variant="ghost" size="icon">` with class overrides that keep today's 24 px round look. `Alert` adds no `role` or `aria-live` (decision D5), so the one live region stays the only announcer.

**Tech Stack:** React 19, Tailwind 3.4 tokens, Vitest 2.1.9 (jsdom per file, fake timers), Playwright.

**Spec:** `docs/superpowers/plans/2026-10-12-bomy-ui-package-pr5d-inventory-and-slices.md` (slice 5d-11), ledger `man-b9`.

## Global Constraints

- Branch `feat/bomy-ui-package-pr5d11` from `main` (`03de34e`). Do not push before Charlie's go. Never merge without his go.
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Do not change:** the live region element and its attributes (`role="region"`, `aria-label="Notifications"`, `aria-live="polite"`, `aria-relevant="additions text"`), `MAX_TOASTS` (3), `DURATION_MS` (3000), `EXIT_MS` (300), the reducer, the flash-cookie listener, the pause handlers, the animation classes, the row collapse wrapper, the fixed container position (`top-[4.5rem]` on web, `top-4` on admin, `z-[60]`, `inset-x-4`, `sm:w-80`), `NavBar`, and any other file. `toastReducer`, `useToast` and `ToastProvider` keep their exports.
- Out of scope: 5d-6 nav icon controls, 5d-7 mobile menu, 5d-2 Cards (D3), `man-5a3`, the three parked reminders.
- Contrast: text 4.5:1. Report env-limited tests as "not evaluated".

## Review Focus

- **One live region, nothing else announces.** Exactly one element with `aria-live` exists with a toast on screen; no toast row, banner, icon wrapper or button gains `role`, `aria-live`, `aria-atomic` or `aria-relevant`. `Alert` must stay quiet (the 5d-3 test already pins that). Test, before and after, with a toast of each type showing.
- **Error banner stays opaque.** Today the error banner is `bg-card`, not the translucent `bg-destructive/10` (a floating toast over the navy admin bar would drop to 2.7:1). `Alert variant="destructive"` is translucent, so the error toast must pass `className="bg-card"` and the test must prove the rendered error banner has `bg-card` and not `bg-destructive/10`.
- **Screen-reader text is unchanged.** Warning and error keep their `sr-only` "Warning: " and "Error: " prefix inside the message paragraph; success and info have none; the icon stays `aria-hidden`; the message text is identical.
- **Queue and timers.** Auto-dismiss after 3000 ms then removal 300 ms later; hover and focus pause the timer and leaving restarts it; a duplicate refreshes the timer instead of stacking; a fourth active toast starts dismissing the oldest. Test with fake timers before and after.
- **Dismiss.** The control is still a `type="button"` with `aria-label="Dismiss notification"`; click starts the exit and removes the row after 300 ms; keyboard Enter and Space on it work; it keeps a visible focus ring; its size stays 24 px, round, no background at rest, `foreground/10` on hover, text colour inherited from the banner.
- **Pause on focus still works** through the dismiss `Button`: focusing it bubbles `focus` to the banner handler.
- **Banner geometry and colours.** Same border, background, text colour, radius, padding, shadow and size, for all four types, in light and dark (measured in the browser before and after).
- **Both toasters.** Web and admin files stay identical apart from the one position class.

## File Structure

- Modify `apps/web/src/components/toaster.tsx` and `apps/admin/src/components/toaster.tsx` (same edit in both).
- Modify `apps/web/tests/components/toaster.test.tsx` and `apps/admin/tests/components/toaster.test.tsx` (add the behaviour tests; reducer tests stay).
- Modify `scripts/ui-audit/findings.json` (`man-b9` resolved; one new deferred entry, see D12).
- No change to `@bomy/ui`, `nav-bar.tsx` or any layout.

## Edit (what changes in each toaster)

1. `TOAST_STYLES[type].className` becomes `variant` (and, for error only, `className: "bg-card"`):

| Type    | Today                                              | After                                          |
| ------- | -------------------------------------------------- | ---------------------------------------------- |
| success | `border-success/30 bg-success-subtle text-success` | `variant: "success"`                           |
| info    | `border-info/30 bg-info-subtle text-info`          | `variant: "info"`                              |
| warning | `border-warning/30 bg-warning-subtle text-warning` | `variant: "warning"`                           |
| error   | `border-destructive/30 bg-card text-destructive`   | `variant: "destructive", className: "bg-card"` |

The comment about the opaque error banner stays and moves next to the `bg-card` override.

2. The banner `div` (`pointer-events-auto flex animate-toast-in items-center gap-3 rounded-lg border p-4 shadow-lg ...`) becomes:

```tsx
<Alert
  variant={style.variant}
  onMouseEnter={() => setPaused(true)}
  onMouseLeave={() => setPaused(false)}
  onFocus={() => setPaused(true)}
  onBlur={() => setPaused(false)}
  className={cn(
    "pointer-events-auto flex animate-toast-in items-center gap-3 shadow-lg motion-reduce:animate-none",
    style.className,
    leaving && "animate-toast-out",
  )}
>
```

`rounded-lg border p-4` now come from `Alert`; every other class is kept. `cn` merges them, so the rendered class set is the same as today.

3. The dismiss `<button>` becomes:

```tsx
<Button
  type="button"
  variant="ghost"
  size="icon"
  aria-label="Dismiss notification"
  onClick={() => dispatch({ type: "dismiss", id })}
  className="h-6 w-6 shrink-0 cursor-pointer rounded-full p-0 hover:bg-foreground/10 hover:text-current focus-visible:ring-2 focus-visible:ring-current"
>
  <X className="size-4" aria-hidden="true" />
</Button>
```

`Button` (ghost, icon) brings the shared focus and disabled handling; the overrides keep today's 24 px round control, hover tint, inherited text colour and 2 px current-colour ring. (`h-6 w-6 p-0` is 24 px, the same as today's `p-1` around a 16 px icon.)

**D12 (open question for Bob and Charlie):** the ledger entry also lists "position `top-[4.5rem]` is coupled to the NavBar `h-14`". Leaving the position as is (as asked) means that part is not fixed here. **Option A (recommended):** resolve `man-b9` for the Alert and dismiss parts, add a **new deferred entry `man-b9b`** for the offset coupling, assigned to 5d-7 (mobile menu), where `nav-bar.tsx` changes anyway (its `h-14` and the scrim `top-14` can then share one `--nav-height` variable with the toast offset), and add a small guard test now that pins the relationship (web toaster `top-[4.5rem]` equals NavBar `h-14` plus 1 rem) so the coupling is no longer silent. **Option B:** do it now with a `--nav-height` variable, which edits two lines in `nav-bar.tsx` (the file 5d-6 and 5d-7 change) and moves the web toaster offset to a `calc(...)`. Option A keeps this PR to the toaster files and the banner position byte for byte.

---

### Task 1: Baselines on today's toaster (no source change)

**Files:** Modify `apps/web/tests/components/toaster.test.tsx`, `apps/admin/tests/components/toaster.test.tsx`; create (uncommitted) `.andy/pr5d11-toast-baseline.json`.

**Interfaces:** Consumes `ToastProvider`, `useToast`, `toastReducer`; for the cookie test, mock `next/navigation` `usePathname`.

- [ ] **Step 1 (jsdom behaviour tests, `// @vitest-environment jsdom`, `vi.useFakeTimers()`):** render `ToastProvider` with a small child that exposes `useToast()`. Assert, with one toast of each type on screen: (a) exactly one element matches `[aria-live]`, it is the `region` named "Notifications" with `aria-live="polite"` and `aria-relevant="additions text"`, and every banner is inside it; (b) no element inside the region has `role`, `aria-live`, `aria-atomic` or `aria-relevant`; (c) the warning and error messages start with an `sr-only` "Warning: " or "Error: " span, success and info have none; (d) each icon is `aria-hidden`; (e) the banner class set per type (the "Today" column, including `bg-card` and not `bg-destructive/10` for error, `shadow-lg`, `rounded-lg`, `border`, `p-4`, `flex`, `gap-3`, `animate-toast-in`); (f) the dismiss control is a `button` with `type="button"`, `aria-label="Dismiss notification"` and its exact class tokens.
- [ ] **Step 2 (timers and queue):** auto-dismiss: after 3000 ms the banner leaves (`animate-toast-out`), after 300 ms more it is removed; `mouseenter` at 2000 ms stops the timer and `mouseleave` restarts a full 3000 ms; `focus` on the dismiss control pauses and `blur` resumes; the same message twice shows one banner and restarts its timer; four distinct messages leave three active and the oldest leaving; click on Dismiss starts the exit and removes the row 300 ms later; Enter and Space on the focused Dismiss control dismiss it (dispatch keyboard events as for a native button via `.click()` after `.focus()`).
- [ ] **Step 3 (flash cookie):** set `document.cookie = "bomy_flash=" + encodeURIComponent(JSON.stringify({type:"warning",message:"Flash me"}))`, mount the provider with `usePathname` mocked, expect one warning banner "Flash me" and the cookie cleared; an invalid cookie shows nothing.
- [ ] **Step 4 (position guard, web only):** read the container class: it contains `fixed`, `inset-x-4`, `top-[4.5rem]`, `z-[60]`, `sm:left-auto`, `sm:w-80`; admin: `top-4` instead. (This pins the position the PR must not move.)
- [ ] **Step 5 (browser baseline, Playwright, uncommitted):** with the local web app, set the `bomy_flash` cookie for each of the four types and load a page; record for each banner: bounding box, `getComputedStyle` of border width and colour, background colour, text colour, radius, padding, shadow, and the dismiss button's box, colours, and `boxShadow` on keyboard focus; light and dark. Also record the container's `top`. Save to `.andy/pr5d11-toast-baseline.json`. Try the admin sign-in page the same way (no login needed); if it does not render the toaster without a session, list admin as not evaluated.
- [ ] **Step 6:** run the tests on unchanged source: expect PASS. Mutation-check three: add `role="status"` to a banner, change `bg-card` to `bg-destructive/10`, change `DURATION_MS` to 2000; each must fail; restore.
- [ ] **Step 7:** commit the two test files by explicit path: `test(ui): baseline of toast announcement, queue, timers and dismiss (5d-11)`.

### Task 2: Swap the banner and the dismiss control in both toasters

**Files:** `apps/web/src/components/toaster.tsx`, `apps/admin/src/components/toaster.tsx`.

- [ ] **Step 1:** Apply the Edit above to the web file, then the identical edit to the admin file. Add `import { Alert } from "@bomy/ui/alert"` and `import { Button } from "@bomy/ui/button"`. Keep `TOAST_STYLES` types: `{ icon; variant: AlertProps["variant"]; className?: string; srLabel?: string }`.
- [ ] **Step 2:** `diff apps/web/src/components/toaster.tsx apps/admin/src/components/toaster.tsx` must show only the one position class. Run both typechecks and the Task 1 tests unchanged: every behaviour and announcement assertion passes. Update only the class-token assertions that the move to `Alert` renders in a different order or from a different source (the sets stay equal).
- [ ] **Step 3:** `rg -n "<button" apps/web/src/components/toaster.tsx apps/admin/src/components/toaster.tsx` shows none; `git diff` shows no change to the reducer, constants, listener, handlers, animation classes, container or live-region attributes.
- [ ] **Step 4:** Commit explicit paths: `refactor(ui): toast banner uses Alert and Button (5d-11)`.

### Task 3: Ledger (and the D12 decision)

- [ ] **Step 1:** Per the D12 outcome. Option A: resolve `man-b9` with evidence that cites the swap, the baseline and after tests, and what was not browser-evaluated; add `man-b9b` (`kind` `manual`, `status` `deferred`, `followUp` "PR 5d-7: the toast offset top-[4.5rem] is coupled to the NavBar h-14 and the scrim top-14; share one --nav-height variable when nav-bar.tsx is touched") and the guard test from D12. Option B: skip `man-b9b`. Keep `ensure_ascii=True`, indent 2.
- [ ] **Step 2:** Option A expects **30 deferred, 67 resolved** (97 entries) and Option B **29 deferred, 67 resolved**; scanner 102 hits, 0 deferred; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1. Commit the file.

### Task 4: Browser proof and gates; stop before the push

- [ ] **Step 1 (M1, compare with the baseline):** repeat the Task 1 browser capture on the swapped code; the container `top`, every banner's bounding box, border, background, text colour, radius, padding and shadow, and the dismiss control's box, colours and focus ring must equal the baseline for all four types in light and dark (list any difference with its reason; none is expected).
- [ ] **Step 2 (M2, real keys):** show a toast, press Tab until the dismiss control is focused (the banner stops its timer), confirm the ring, press Enter (the banner leaves and is removed), and confirm the timer resumes when focus leaves without dismissing. Hover pause and resume with the mouse. Check that with a toast on screen there is exactly one `[aria-live]` element and no `[role=alert]` or `[role=status]` in the page.
- [ ] **Step 3 (M3, accessibility tree):** a Playwright snapshot with a warning toast shows the region "Notifications" containing the list item with "Warning: <message>" and the "Dismiss notification" button.
- [ ] **Step 4 (M4):** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, web and admin tests, `@bomy/ui` typecheck, both builds (`loading.tsx` moved aside, restored after), prettier on the diff, `git diff --check`, audit gate and audit tests. Check `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 5:** Write `.andy/pr5d11-pr-body.md` (format of the 5d-4 body; ends with the 🤖 line; lists what was preserved, the measured equality, D12, and the not-evaluated list including the real admin toasts if the admin capture is not possible). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_ui-pr5d11-toasts.md`, handoff, memory, delete branch.

## Self-review

- **Coverage:** `man-b9` parts: no shared Alert (Task 2), raw dismiss button (Task 2), position coupling (D12).
- **Out of scope:** `NavBar`, 5d-6, 5d-7 (except the `man-b9b` follow-up), Cards, `man-5a3`.
- **Risk, in order:** an announcement attribute added to the banner or button; the error banner turning translucent; the dismiss control changing size or losing its ring; a timer or pause regression from the focus handler path.
