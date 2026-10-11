# PR 5b — Provider application Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the one remaining native `<select>` (`apps/web/src/app/provider/apply/provider-apply-form.tsx:151`) with the `@bomy/ui` `Select`, with identical state, validation and posted `FormData`. Closes the last scanner deferral (R1-select).

**Architecture:** The control is already controlled by React (`categoryChoice` state). The migration swaps the element and the interaction helper only: `<Select value onValueChange name required>` + `SelectTrigger id` carrying `aria-invalid` and `aria-describedby`. The submit handler, `isOther` logic, validator and server action are not touched.

**Tech Stack:** `@radix-ui/react-select` pinned `2.3.3`, `@bomy/ui/select`, Vitest + jsdom, Playwright MCP.

**Spec:** `docs/superpowers/plans/2026-10-07-bomy-shared-ui-package-pr5.md` Step 3b (the four proofs a to d, quoted below) and `scripts/ui-audit/deferred.json` (the one R1-select entry).

**Baseline:** `main` `37836d3`. Branch `feat/bomy-ui-package-pr5b`. Model: Sonnet for the swap; Opus if a proof fails and needs a decision.

## Global Constraints

- Migrate **only if all four proofs hold**; otherwise leave it native and keep the `deferred.json` entry with a reason (PR 5 Step 3b).
- `@radix-ui/react-select` stays exactly `2.3.3` (never caret-bump; typeahead bug #4097 on 2.3.4 to 2.3.8). Do not touch `packages/ui/package.json`.
- No change to `actions.ts`, `service-provider-application-schema.ts`, `queries.ts`, `page.tsx`, or the DB. The server contract is `serviceCategoryId` (id or `""`), validated as UUID or Other-with-description.
- Explicit commit paths only (never a directory). Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push until Charlie says go. Do not poll CI.
- Not evaluated stays "not evaluated". Keep 5d (44 ledger entries) and `man-5a3` out of this PR. The three reminders stay parked until plain `pnpm ui:audit` exits 0.

## The native control today (baseline, already measured)

Source facts (`provider-apply-form.tsx`): native `<select id="serviceCategoryChoice" name="serviceCategoryChoice" required>`, controlled by `categoryChoice` (initial `categories[0]?.id ?? "__other__"`); options = active categories (sorted by `sortOrder`) plus a last `Other` option (`__other__`); `onSubmit` builds `new FormData(form)` then does `formData.set("serviceCategoryId", isOther ? "" : categoryChoice)` and calls the action. `isOther` flips the description label (`*` against `(optional)`) and `required={isOther}` on the description. The form has no `noValidate`, so the browser validates first.

**State changes**
| State | Control shows | Description |
|---|---|---|
| S1 mount, categories seeded | first category | optional, label `(optional)` |
| S2 pick another category | that category | optional |
| S3 pick Other | `Other` | required, label `*`; leaving Other reverses it |
| S4 no categories seeded | `Other` only, selected | required |

**Validation** (other required fields filled first, as PR 5 requires): S1, S2 and Other-with-description are valid. Other with an empty description is invalid and the failing control is **`businessDescription`**, never the category control. With the text fields empty the failing controls are `name`, `contactEmail`, `contactNumber`, `companyName`, in that order. The category control is never the one that blocks submit.

**Posted FormData** (full entry list, in order; `name`, `contactEmail`, `contactNumber`, `companyName` first):
| State | `serviceCategoryChoice` | `businessDescription` | `serviceCategoryId` |
|---|---|---|---|
| S1 first category | its id | `""` | same id |
| S2 second category | its id | `""` | same id |
| S3 Other + text | `__other__` | the text | `""` |
| S4 none seeded + text | `__other__` | the text | `""` |
| category + text | its id | the text | same id |

**Empty selection.** There is no placeholder and no empty option, so an empty selection cannot be made in the UI. "No category" is expressed only as Other, which posts `serviceCategoryId = ""` and makes the description required (server mirror: validator + DB check 0032). A forced empty value cannot stick: React snaps a controlled select back to its first option (jsdom probe), so it stays valid. One latent quirk, recorded and **not a requirement**: if state were `""`, `serviceCategoryId` would post `""` next to `serviceCategoryChoice` = first id.

**Server error wiring.** When the action returns `errors.serviceCategoryId` (inactive category), the control gets `aria-invalid="true"` and `aria-describedby="serviceCategoryId-error"`; the error renders as `role="alert"`; the user's choice stays selected. Without an error neither attribute is present. The label is `Service Category *` with `for="serviceCategoryChoice"`.

**Proof it was measured, not assumed:** 20 jsdom tests in `apps/web/tests/provider-apply/provider-apply-select-baseline.test.tsx` all pass on the native select (two mutations caught: dropping `required={isOther}` fails 4; dropping the `isOther ? "" :` fails 2). The same states ran in a real browser (Playwright, seeded consented buyer, 5 real categories plus Other; the server-action request was blocked so nothing was written) and matched: S1 valid, `serviceCategoryChoice` = id, description `(optional)`; S3a Other with empty description blocked the submit and the invalid control was `businessDescription`; S3b posted `__other__` + text + `serviceCategoryId ""`. Real posted keys carry Next's `1_` prefix; same fields, same order.

Visual baseline (screenshots `pr5b-native-{1440,390}-{light,dark}.png`, local only): native select is 38 px high next to 36 px inputs (same width at 1440 and 390; no overflow), radius 10 px, border `rgb(221,209,192)` light and `rgb(68,58,44)` dark.

## Target

```tsx
<Select
  value={categoryChoice}
  onValueChange={setCategoryChoice}
  name="serviceCategoryChoice"
  required
>
  <SelectTrigger
    id="serviceCategoryChoice"
    aria-invalid={errors?.serviceCategoryId ? true : undefined}
    aria-describedby={errors?.serviceCategoryId ? "serviceCategoryId-error" : undefined}
  >
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {categories.map((c) => (
      <SelectItem key={c.id} value={c.id}>
        {c.name}
      </SelectItem>
    ))}
    <SelectItem value={OTHER_VALUE}>Other</SelectItem>
  </SelectContent>
</Select>
```

Imports `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@bomy/ui/select` (same as nine other files). `value` is always a non-empty string, so no placeholder and no `key` remount are needed (unlike `create-plan-form`, which starts empty).

## How each proof maps onto Radix

| Proof          | Native today                 | After migration                                                                                                                                        | What changes in the test                                                                                                                               |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (a) state      | `change` event on `<select>` | typeahead keys on the trigger                                                                                                                          | `choose()` only                                                                                                                                        |
| (b) validation | `<select required>`          | Root `required` gives the hidden native select `required` and the trigger `aria-required="true"`; value is always set, so it is valid                  | V5 asserts `aria-required="true"` on the trigger and `required` on the hidden select instead of `required` on the element; V1 to V4 literals unchanged |
| (c) FormData   | native select entry          | Radix hidden select posts `serviceCategoryChoice` once the trigger is inside the form; it sits next to the trigger, so entry order should be unchanged | none: same full-list literals F1 to F6                                                                                                                 |
| aria           | on `<select>`                | on the trigger button                                                                                                                                  | element id stays `serviceCategoryChoice`, E3/E4 unchanged                                                                                              |
| label          | `for` -> select              | `for` -> trigger (a button, labelable)                                                                                                                 | E5 unchanged                                                                                                                                           |

**Test changes allowed:** the `choose()` helper, V5's assertion, and the option-list assertions in S1/S4 (the native `options` list becomes the trigger text plus, if needed, opening the listbox once to read items). **E1/E2** (no empty option; forced empty) have no Radix equivalent because the value cannot be empty; replace them by one test: the trigger always shows a category or Other, never a placeholder. Every other literal in the baseline file must pass unchanged. If any other literal needs editing, stop: that is a proof failure.

## Review Focus

- Radix renders its hidden select only after mount and only inside a form; check FormData after mount, not on the server markup (the existing static-markup test `provider-apply-form.test.tsx` renders on the server and checks `>Other<`, which will need the closed-state trigger text instead).
- Entry order and duplicates: the full entry list, not just two keys, must match (a stray duplicate `serviceCategoryChoice` would be a failure).
- Production typeahead on `2.3.3` (jsdom hid #4097 once): check in a production build with real keys and 1.5 s gaps; categories are `Graphic Design`, `Videography`, `Photography`, `Copywriting & Content`, `Web & App Development`, `Other`.
- A `required` Radix Select must not block submit or steal focus into the hidden select (PR 4 contract); the failing control for Other + empty description must stay the description.
- The visible change: 38 px native control becomes a 36 px trigger that matches the 36 px inputs, with the shared chevron and popover list; check 390 px (no overflow; the list stays inside the viewport) and both themes.

## File structure

- Modify: `apps/web/src/app/provider/apply/provider-apply-form.tsx` (the control and its imports only)
- Modify: `apps/web/tests/provider-apply/provider-apply-select-baseline.test.tsx` (helper and the three allowed assertions)
- Modify: `apps/web/tests/provider-apply/provider-apply-form.test.tsx` (closed-state markup assertions)
- Modify: `scripts/ui-audit/deferred.json` (remove the entry), `scripts/ui-audit/findings.json` only if an entry references it (none found; re-check)
- Create after merge: log, handoff, memory

---

### Task 1: Baseline on the native control (done; commit it first)

- [x] 20-test baseline written and passing on the native select; two mutations caught; real-browser baseline matched.
- [ ] **Step 1:** Commit `apps/web/tests/provider-apply/provider-apply-select-baseline.test.tsx` and this plan (explicit paths). No production file changes in this commit.

### Task 2: Swap the control

**Files:** `provider-apply-form.tsx`, the two test files above.

- [ ] **Step 1:** Edit the three allowed test spots (`choose()` via typeahead; V5; S1/S4 option assertions; replace E1/E2 as described) and run: expect them to FAIL against the native select (they now look for a Radix trigger). This proves the tests now exercise the new control.
- [ ] **Step 2:** Replace lines 151 to 167 of the form with the target above; add the import; delete nothing else.
- [ ] **Step 3:** Run `pnpm --filter @bomy/web test provider-apply --run`: expect all pass with every other literal unchanged. If one fails, **stop and report** (do not edit the literal).
- [ ] **Step 4:** `pnpm --filter @bomy/web typecheck` and `lint`. Mutation check again on the new control: dropping `required={isOther}` and dropping `isOther ? "" :` must still fail tests.
- [ ] **Step 5:** `git diff --cached --stat` then commit the three explicit paths.

### Task 3: Browser proof (public page; sign in as a seeded consented buyer without an application)

- [ ] **Step 1 (dev server, Playwright):** repeat the baseline run with the same literals: S1, S2, S3a (blocked, invalid control is the description), S3b, category plus description. Block the server-action request so nothing is written. Compare entries field by field and in order with the native baseline above.
- [ ] **Step 2 (keyboard, real keys):** Tab to the trigger, Space opens, arrow keys and Enter choose, Escape closes and returns focus to the trigger; label click focuses the trigger; typeahead `p` then `h`.
- [ ] **Step 3 (production build, `.next/standalone`):** typeahead with 1.5 s gaps over the six names (pin check). Record the result; dev server alone is not enough.
- [ ] **Step 4 (visual):** 1440 and 390 px, light and dark: trigger height 36 equals the inputs, no horizontal overflow, open list inside the viewport, focus ring visible; contrast of trigger text and chevron against the page (text 4.5, chevron 3). Compare with the saved native screenshots.
- [ ] **Step 5:** error state: render the inactive-category error (mock the action in jsdom, already in E3) and confirm `aria-invalid` and `aria-describedby` sit on the trigger; the live case needs an inactive category, so it is **not evaluated** in the browser unless seeded data allows it without writing.
- [ ] A proof that fails or a state that cannot be reached means DEFERRED: restore the native control and record why in `deferred.json`.

### Task 4: Audit lists and gates

- [ ] **Step 1:** Remove the R1-select entry from `deferred.json`. Expect scanner deferred 1 to **0**.
- [ ] **Step 2:** `pnpm ui:audit --allow-deferred` exit 0 (0 open, 0 stale, 0 invalid); `pnpm ui:audit:test` 17 of 17; plain `pnpm ui:audit` still exits 1 (ledger: 45 deferred, which is **44 for 5d plus `man-5a3`**; earlier PR bodies said "43 for 5d"; the real count includes `man-t30`, re-targeted to 5d in PR 5a).
- [ ] **Step 3:** Full gates: `pnpm install --frozen-lockfile`, `typecheck`, `lint`, web and admin tests, both builds, prettier on the diff. Report the two web `DATABASE_URL` files and the 13 admin files as **not evaluated**. Move any untracked local files (for example `apps/web/src/app/products/loading.tsx`) aside for the build so they are not part of it, and do not stage them.
- [ ] **Step 4:** Write `.andy/pr5b-pr-body.md` (format of the 5a-2 body, ends with the 🤖 line). Report to Charlie. **Push and open the PR only after Charlie's go. Do not merge.**
- [ ] **After merge:** log `app/log/2026-10-…_PR<N>_ui-pr5b-provider-select.md`, handoff, memory, delete branch.

## Self-review

- Coverage: state (S1 to S4), validation (V1 to V5), FormData (F1 to F6), empty selection (E1, E2 and their Radix replacement), server error wiring (E3, E4), label (E5). Each has a literal in the baseline file and a browser counterpart.
- Risks, in order: hidden select entry order/duplication; the production typeahead pin; focus not landing in the hidden select; 36 px height change (intended, matches inputs).
- Decision for Bob and Charlie: none open. The one policy call (E1/E2 have no Radix equivalent and are replaced, not preserved) is stated above; the other quirk (state `""`) is recorded as not a requirement.
- Out of scope: 5d (44 entries), `man-5a3`, the three parked reminders.
