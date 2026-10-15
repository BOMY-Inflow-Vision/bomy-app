# man-5a3 — `text-primary` contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear ledger entry `man-5a3`: make red `text-primary` text reach 4.5:1 on every dark surface, and fix the light "Coming soon" label (`text-primary/70`, 3.46:1), without touching any button, pill or other `bg-primary` fill.

**Architecture:** The dark failures exist because one token, `--primary` (red-500), is used for two jobs: a fill behind white text (white on red-500 is 4.71:1, passes) and red text on dark surfaces (3.44 to 4.11:1, fails). The fix is a second token for the text job. `--primary-text` is added to both apps' `globals.css`: in light it equals `--primary` (no change); in dark it is the palette's red-400. In both `tailwind.config.ts` files, `theme.extend.textColor.primary` points at `--primary-text`, so every existing `text-primary`, `hover:text-primary` and `text-primary/NN` follows with no call-site edits, while `bg-`, `border-`, `ring-` and `text-primary-foreground` keep using `--primary`. The one light failure is a call-site fix.

**Tech Stack:** CSS custom properties (H S% L%), Tailwind 3.4, Vitest 2.1.9 (node, the existing contrast tests), Playwright.

**Spec:** ledger entry `man-5a3` in `scripts/ui-audit/findings.json`; the contrast tests in `apps/web/tests/design-tokens/`.

## The numbers (calculated from the tokens; WCAG relative luminance)

Dark surfaces: `--background`, `--card`, `--popover`/`--secondary`, `--muted`, `--accent`.

| Text colour on the surface                               | background | card | popover | muted | accent |
| -------------------------------------------------------- | ---------- | ---- | ------- | ----- | ------ |
| **Now** `--primary` red-500 `4 64% 51%` = rgb(210,61,50) | 3.95       | 3.74 | 3.46    | 4.11  | 3.44   |
| **Proposed** red-400 `4 70% 62%` = rgb(226,99,90)        | 5.46       | 5.18 | 4.79    | 5.69  | 4.76   |
| Option B `4 70% 66%` = rgb(229,116,108)                  | 6.24       | 5.92 | 5.47    | 6.50  | 5.44   |

White (`--primary-foreground`) on the dark button fill: red-500 **4.71** (passes, kept); red-400 would be **3.41** (fails). That is why dark `--primary` cannot simply be raised.

Light: red-600 text is 5.36 to 6.02 on `muted`, `background`, `card` and `popover`, so light `text-primary` already passes and does not change. The only failure is `text-primary/70` ("Coming soon" on `bg-background`): 3.46:1. `text-muted-foreground` there is 6.06:1; full `text-primary` is 5.82:1.

## Global Constraints

- Branch `feat/bomy-ui-package-man5a3` from `main` (`626bca4`). Do not push before Charlie's go. Never merge without his go. **Charlie reviews the proposed colour (D35) before any code.**
- Explicit commit paths only. Never stage `apps/web/src/app/products/loading.tsx`.
- Trailer on commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Out of scope:** D3 and the Cards slice; the parked reminders; changing `--primary`, `--ring`, `--destructive` or any fill; light `--primary`; any component redesign. Contrast: text 4.5:1. Report env-limited tests as "not evaluated". Evidence text may cite only what was actually verified.

## Review Focus

- **Dark red text passes 4.5:1 on every surface it can sit on**, in both apps: `background`, `card`, `popover`, `muted`, `accent`, also under `/70`-style opacity (none remains) and on hover. The token tests assert this for web and admin.
- **Nothing that is a fill changes.** `bg-primary` buttons, active chips, pagination and Badge `default` keep red-500 with white text (4.71:1, asserted by a test that stays green). Borders and rings keep their colours. `text-primary-foreground` is untouched.
- **Light mode does not change**, except the one "Coming soon" label. Light `--primary-text` equals `--primary`, asserted by a test; computed colours of every `text-primary` element are identical before and after in light.
- **Every dark `text-primary` utility resolves to the new colour.** Task 1 inventories every source occurrence, including hover and drag states, and maps it to its rendered surface. Token tests cover each distinct surface; the browser check measures all locally reachable examples and uses a temporary fixture for missing distinct surfaces or states. The PR body separates browser measurements from source-to-surface and token-test evidence, and lists any unrendered state as not evaluated. An unmapped or untested surface stops ledger resolution.
- **No `text-primary/NN` is left** (a scan test), because an opacity step makes any token fail again.
- **The admin "class-less links" in the ledger text** (3.4 to 4.11:1) are located: Task 1 finds which element they are. If they are `text-primary`, they are covered; if they use another colour, the plan stops and reports before widening.

## File Structure

- Modify `apps/web/src/app/globals.css` and `apps/admin/src/app/globals.css` (`--primary-text` in `:root` and `.dark`), `apps/web/tailwind.config.ts` and `apps/admin/tailwind.config.ts` (`textColor.primary`), `apps/web/src/app/seller/dashboard/page.tsx` (one class), `docs/design-system/README.md` (one token line, a note, and its stale dark-mode sentence).
- Modify `apps/web/tests/design-tokens/contrast.test.ts` or `status-pairs.test.ts` (new `primary-text` pairs; covers both apps because they read both CSS files) and add `apps/web/tests/design-tokens/primary-text-wiring.test.ts` (the Tailwind mapping in both configs and the no-`text-primary/NN` scan).
- Modify `scripts/ui-audit/findings.json`.

## Decisions for Bob and Charlie

- **D34 (a second token, not a lighter `--primary`):** add `--primary-text`; do not raise dark `--primary`. Raising it to red-400 would drop white-on-button text to 3.41:1 on every primary button. This answers the ledger's "raise dark `--primary` or add a primary-text token".
- **D35 (the dark colour; for Charlie to review):** `--primary-text` in dark = red-400 `4 70% 62%`, rgb(226,99,90). It is an existing palette value (already `--ring`, `--destructive`, `--sidebar-indicator`), so no new colour enters the system. The visible change: red text, links and the BOMY logo in dark mode become a little lighter and pinker than rgb(210,61,50). Worst case 4.76:1 (on `accent`). Option B (`4 70% 66%`) gives more margin but is a new colour. Recommended: red-400.
- **D36 (the light label):** "Coming soon" on the seller dashboard becomes `text-muted-foreground` (6.06:1), like the "Orders" label above it and the home page's "Coming soon". Alternative: full `text-primary` (5.82:1), which keeps it red. Recommended: muted, because it is secondary information and red already means "interactive or brand accent".
- **D37 (wiring):** override Tailwind's `textColor.primary` (with `foreground` kept) rather than adding a new class name and editing ~61 call sites. One place to maintain; the cost is that `text-primary` no longer means `--primary`, so the config carries a comment and a test pins it. Recommended.

## Edit

1. `globals.css` (both apps): in `:root` after `--primary-foreground`: `--primary-text: 4 71% 43%; /* = --primary (red-600): 5.4 to 6.0:1 on the light surfaces */`. In `.dark` after `--primary-foreground`: `--primary-text: 4 70% 62%; /* red-400: text-primary on dark surfaces; --primary (red-500) stays for fills, white on it is 4.71:1 */`.
2. `tailwind.config.ts` (both apps), inside `extend`:

```ts
// text-primary reads --primary-text (readable on dark surfaces); fills, borders and rings keep --primary.
textColor: {
  primary: {
    DEFAULT: "hsl(var(--primary-text))",
    foreground: "hsl(var(--primary-foreground))",
  },
},
```

3. `seller/dashboard/page.tsx` line 79: `text-xs text-primary/70` becomes `text-xs text-muted-foreground`.
4. `docs/design-system/README.md`: add `--primary-text` to the `:root` listing and one sentence saying it is the text colour for brand red. Correct the stale sentence below that listing which says dark mode is not wired; both apps already use their `.dark` tokens.

---

### Task 1: Tests first and the baseline (no source change)

**Files:** modify the design-token test; create `primary-text-wiring.test.ts`; create (uncommitted) `.andy/man5a3-baseline.json` and `.andy/man5a3-call-sites.md`.

- [ ] **Step 1 (token pairs):** for web and admin, light and dark, assert `--primary-text` exists; light `--primary-text` equals `--primary`; text on `background`, `card`, `popover`, `muted`, `accent` is >= 4.5 (dark and light); white `--primary-foreground` on `--primary` stays >= 4.5 in both themes (guards D34); `--primary-text` is not required to equal `--primary` in dark. Run: FAIL (token missing).
- [ ] **Step 2 (wiring):** assert both `tailwind.config.ts` files map `textColor.primary.DEFAULT` to `hsl(var(--primary-text))` and keep `foreground` on `--primary-foreground`, and `colors.primary.DEFAULT` still on `--primary`; assert no `text-primary/` followed by digits in any `apps/*/src` or `packages/ui/src` `.tsx` (fails on the "Coming soon" line). Run: FAIL.
- [ ] **Step 3 (complete source inventory, read-only):** search `apps/web/src`, `apps/admin/src` and `packages/ui/src` for every `text-primary` utility, including `hover:`, `group-hover:`, opacity forms and classes assembled in maps. In `.andy/man5a3-call-sites.md`, record each file/line, rendered route or component, state that applies the class, and effective surface (including translucent and hover backgrounds). Group entries by distinct surface/state for the contrast tests; extend the tests written in Step 1 for any new or composited surface before the token change. Mark whether each group can be rendered with local data, needs a temporary fixture, or is supported by source-to-surface mapping plus token tests. If any surface cannot be mapped or tested, stop before resolving `man-5a3` and report it.
- [ ] **Step 4 (browser baseline, Playwright, uncommitted):** signed in as the seeded seller, dark and light, measure the reachable inventory entries, including `/`, `/products`, `/brands`, a product page, `/cart`, `/account`, `/seller/dashboard`, membership and brand-subscription pages, and a product edit page. Exercise hover and the FileDropzone drag state where they apply. For each rendered instance, record its colour, effective opaque background (walk ancestors, blend alphas) and contrast. Use a temporary fixture for distinct surfaces or states that local data cannot show; keep source-to-surface and token-test evidence separate for any unrendered call site. Admin has no Playwright session: use a temporary page under `apps/admin/src/app/auth/sign-in/zz-harness/page.tsx` that renders the admin `text-primary` patterns on every distinct mapped surface, and locate the ledger's "class-less admin links" by reading the admin code for links without a colour class. If they use another colour source, stop and report before widening the work. Delete harness pages afterwards. Save to `.andy/man5a3-baseline.json` and record the measured versus unrendered groups in the call-site inventory.
- [ ] **Step 5:** commit the tests by explicit path: `test(ui): primary-text contrast and wiring tests (man-5a3)`. (They fail until Task 2; the commit message says so, and Task 2 follows immediately, as in earlier slices where the plan asked for failing-first commits.)

### Task 2: Token, Tailwind mapping, label

- [ ] **Step 1:** apply Edit 1 to 4. Run the token and wiring tests: PASS. Run the full web suite: PASS (a source-text test may name the old class; fix only expectations). Commit: `fix(ui): readable brand-red text in dark mode via --primary-text (man-5a3)`.

### Task 3: Ledger

- [ ] **Step 1:** Run the scanner (expect no exception changes). Resolve `man-5a3` with evidence limited to what was verified: the token and the numbers, the Tailwind mapping, the label, the browser results, and what was not evaluated. Expect **7 deferred (the Cards entries), 90 resolved**; scanner 0 deferred, 0 stale; `pnpm ui:audit --allow-deferred` exit 0; `ui:audit:test` 17 of 17; plain `pnpm ui:audit` still exit 1 (Cards only). Commit.

### Task 4: Browser proof and gates; stop before the push

- [ ] **Step 1 (compare with the baseline):** repeat the Task 1 capture and reconcile every call-site inventory row. Dark: every rendered `text-primary` instance is >= 4.5:1 against its real background and uses rgb(226,99,90); each unrendered instance has a documented source-to-surface mapping and a passing token test for that surface/state. A new or unmapped surface stops ledger resolution. Light: every rendered `text-primary` colour is identical; the "Coming soon" label is `text-muted-foreground` (6.06:1). Buttons, chips, pagination and Badge `default`: identical fill and text colours in both themes. Hover and focus rings unchanged. The PR body states exactly which entries were browser-measured and which were covered only by source review and token tests.
- [ ] **Step 2:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, the **full** web and admin test suites, `@bomy/ui` typecheck, `pnpm build` (`loading.tsx` moved aside and restored after), prettier on the diff, `git diff --check`, audit gate and tests; delete temporary harness pages and stop the dev servers; `git diff --name-only main HEAD` has only the files in File Structure plus the plan.
- [ ] **Step 3:** Write `.andy/man5a3-pr-body.md` (format of the 5d-7 body; ends with the 🤖 line; D34 to D37, the numbers, the one visible change in dark and the one label change in light, the not-evaluated list). Report to Charlie. **Push and open the PR only after his go. Do not merge.**
- [ ] **After merge:** log `log/2026-10-…_PR<N>_man5a3-primary-text-contrast.md`, handoff, memory, delete branch. Then plain `pnpm ui:audit` fails only on the Cards entries.

## Visible and non-visual changes to disclose

1. **Dark mode:** red text (logo, links, prices, avatar letters, hover states) is lighter: rgb(210,61,50) to rgb(226,99,90). Fills are unchanged.
2. **Light mode:** the seller dashboard "Coming soon" label is grey (muted) instead of 70% red.
3. New token `--primary-text` in both apps; `text-primary` now reads it (D37). Everything else is unchanged and measured.

## Self-review

- **Coverage:** dark failures and the light 3.46:1 → Tasks 2; tests → Task 1; ledger → Task 3.
- **Risks, in order:** a `text-primary` use on a surface not in the token list (e.g. a tinted `bg-*/10` fill) still failing (the browser pass checks real backgrounds); the Tailwind override also catching a utility that should stay `--primary` (`decoration-`, `caret-`, `accent-` use their own namespaces; verified by the wiring test and the build); `hover:text-primary` on a dark hover surface; the ledger's admin "class-less links" turning out to be a different colour source; a future `text-primary/NN` (the scan test).
