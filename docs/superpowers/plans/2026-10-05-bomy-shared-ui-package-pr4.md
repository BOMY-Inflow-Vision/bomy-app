# @bomy/ui PR 4 — Rebuild Select on Radix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v6.** v1 was drafted on Opus 5.5 (the Radix form-semantics analysis below is the Opus part of this PR). v2 folded in Bob's two Medium findings on v1; v3 folded in Bob's two Medium findings and one Low on v2; v4 folded in Bob's three Medium and two Low findings on v3; v5 folded in Bob's one Medium on v4, the lockfile-aware branch parity check; v6 folds in Bob's one finding on v5, the lockfile inspection (see "Bob v1 review" through "Bob v5 review" below). **Do not start Task 0 until Charlie approves v6.**

> **Current state (2026-10-07).** PR 4 (#154) is **web-only**. The admin Select migration (Task 4) is on the local branch `feat/bomy-ui-package-pr4b-admin` and is pending PR 4b, behind Charlie's own Google-session check (Task 5 Step 6). `@radix-ui/react-select` is pinned to **exactly `2.3.3`** (no caret). The plan text below was written for `^2.3.7` and for both apps; where it still says so, read it as history. The `2.3.8` result and why it was dropped are in the Task 5 findings in §2.

**Goal:** Add shadcn's real `Select` (Radix-based) to `@bomy/ui`, move every `Select` call site in both apps onto it, and delete both hand-rolled `components/ui/select.tsx` files, **without changing what any form sends to its server action**.

**Architecture:** The primitive lives in `packages/ui` (shared). Every call site switches to shadcn's compositional API (`Select` / `SelectTrigger` / `SelectValue` / `SelectContent` / `SelectItem`) directly. There is no local options-based wrapper and no re-export shim (PR 1 convention; Open decision 1). The forms stay in their apps. Open/close animation reuses BOMY's `select-in`/`select-out` keyframes, as in PR 3.

**Tech Stack:** React 19.2.5, Next.js 15, Tailwind 3.4, `@radix-ui/react-select` (**current: exact pin `2.3.3`**, web-only PR 4; history: planned as `^2.3.7`, **analysed on 2.3.7, resolved 2.3.8, which failed the production typeahead check**, see the Version note and the Task 5 findings in §2), Vitest 2.1.9 with a per-file `jsdom` environment (new for these tests), Playwright 1.62.1 (browser tool only).

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (§ "PR 4 — Rebuild Select"; § "Motion" leaves the `select-*` keyframes decision to this PR). No spec correction needed.

---

## 1. Consumer inventory (verified at `89c0d38`)

13 `<Select>` elements in 8 files. Both current `select.tsx` files are the same code. The only difference is admin's panel colour (`bg-card` instead of `bg-popover`). Admin's comment there says admin has no `--popover` token, which is out of date: PR 1 added it (`apps/admin/src/app/globals.css:11-12,46-47`, `tailwind.config.ts:41-43`). Nothing else imports `SelectOption`/`SelectProps`.

| #   | File:line                                                                                       | In `<form>`? / submit path                                                                                                                                                                                                                                             | How the value reaches the server                                                                                                                                         | Props today                                                                                                                      | Label wiring                                                              |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| W1  | `apps/web/src/app/seller/dashboard/products/new/product-form.tsx:167-175` (Category)            | yes, `<form onSubmit>` (:112); `new FormData(e.currentTarget)` → `useActionState` dispatch → `createProduct`                                                                                                                                                           | hidden input `categoryId`; `""` when "No category" → `str(fd,"categoryId") \|\| null` (`products/actions.ts:227`)                                                        | uncontrolled, no default (→ `""`, which matches the `""` "No category" option); `className="w-full"`                             | `<Label htmlFor="categoryId">` (:161) → `id="categoryId"`                 |
| W2  | same file `:184-190` (Status)                                                                   | same                                                                                                                                                                                                                                                                   | hidden input `status`; missing/`""` → `"draft"` (`actions.ts:229`)                                                                                                       | uncontrolled `defaultValue="draft"`; `STATUS_OPTIONS` (:17)                                                                      | `htmlFor="status"`                                                        |
| W3  | `apps/web/src/app/seller/dashboard/products/[id]/edit/product-edit-form.tsx:331-343` (Category) | yes, `<form onSubmit={handleProductSubmit}>` (:304); FormData → `updateProduct`                                                                                                                                                                                        | hidden `categoryId`; `""` → `null` (`actions.ts:337`). The category list always includes the product's current category, even when it is inactive (`actions.ts:181-187`) | `defaultValue={product.categoryId ?? ""}`; labels get an `" (inactive)"` suffix                                                  | `htmlFor="categoryId"`                                                    |
| W4  | same file `:352-358` (Status)                                                                   | same                                                                                                                                                                                                                                                                   | hidden `status`; **missing → `"draft"`** (`actions.ts:339`), so a dropped field would silently un-publish a product                                                      | `defaultValue={product.status}` (draft/active/archived)                                                                          | `htmlFor="status"`                                                        |
| W5  | `apps/web/src/app/seller/dashboard/subscriptions/create-plan-form.tsx:51-60` (Term)             | yes, `<form onSubmit>` (:43); FormData → `createPlan`                                                                                                                                                                                                                  | hidden `termMonths`; `""` → `Number("")=0` → server error "Term must be 3, 6, or 12 months" (`subscriptions/actions.ts:126-129`)                                         | `required`, `placeholder="Select term"`, no default, no className (inline)                                                       | `htmlFor="termMonths"`                                                    |
| W6  | same file `:84-90` (Discount)                                                                   | same                                                                                                                                                                                                                                                                   | hidden `discountPct`; `""` → server error "Discount must be between 5% and 10%" (`actions.ts:135-138`)                                                                   | `required`, `placeholder="Select %"`, inline                                                                                     | `htmlFor="discountPct"`                                                   |
| W7  | `apps/web/src/app/seller/dashboard/subscriptions/edit-plan-form.tsx:70-75` (Discount)           | yes, `<form onSubmit>` (:47), one form per plan row; FormData → `updatePlan`                                                                                                                                                                                           | hidden `discountPct` (`actions.ts:195`)                                                                                                                                  | `defaultValue={String(defaultDiscountPct)}`, inline                                                                              | `htmlFor={\`discount\_${planId}\`}`                                       |
| W8  | `apps/web/src/app/checkout/_form.tsx:268-276` (Voucher)                                         | inside `<form onSubmit>` (:199), but **not** read from FormData. `initiateCheckout` gets `voucherId` from state                                                                                                                                                        | controlled state only (`voucherId`); no `name`                                                                                                                           | `value={voucherId ?? ""}`, `onValueChange={(v)=>setVoucherId(v \|\| null)}`, includes a `""` "No voucher" option                 | **none**: no label, no `aria-label` (the `<h2>Voucher</h2>` is not wired) |
| W9  | same file `:285-296` (Saved address)                                                            | same; value drives `useEffect` (:111-120) that loads the address into state                                                                                                                                                                                            | controlled state (`selectedId`); no `name`                                                                                                                               | `value={selectedId}`, `onValueChange={setSelectedId}`                                                                            | **none**                                                                  |
| W10 | same file `:400-407` (State)                                                                    | same; validated client-side by `validateShippingAddress(address)`                                                                                                                                                                                                      | controlled state (`address.state`); no `name`                                                                                                                            | `value={address.state}` (`""` initially), `placeholder="Select state…"`, `className={cn("w-full", err && "border-destructive")}` | `Field` → `<Label htmlFor="addr-state">` (:456)                           |
| W11 | `apps/web/src/app/account/addresses/address-manager.tsx:270-277` (State)                        | yes, `<form onSubmit>` (:179); **not** FormData: builds `input` from `form` state → `addAddress`/`updateAddress`                                                                                                                                                       | controlled state (`form.state`); `resetForm()` sets it back to `""` (:58-63)                                                                                             | `value={form.state}`, `placeholder="Select state…"`, `className="mt-1 w-full"`                                                   | `<Label htmlFor="addr-state">` (:269)                                     |
| A1  | `apps/admin/src/app/users/role-selector.tsx:37-43` (Role)                                       | yes, **`<form action={submit}>`** (:33), a React 19 function action; `formData.get("role")` → `updateUserRole` → `revalidatePath("/users")` (`users/actions.ts:30`)                                                                                                    | hidden `role`                                                                                                                                                            | `defaultValue={currentRole}`, `disabled={pending}`, inline                                                                       | `<Label htmlFor={\`role-${userId}\`} className="sr-only">` (:34)          |
| A2  | `apps/admin/src/app/vouchers/page.tsx:89-94` (Type)                                             | yes, **server component**, `<form id="voucher-config-form" action={updateVoucherConfig}>` (:84) (a real server action). The Save button sits outside the form and submits it with `form=` (:175). `revalidatePath("/vouchers")` on success (`vouchers/actions.ts:217`) | hidden `type`; missing/invalid → flash toast "Invalid voucher type." (`actions.ts:137-140`), nothing written                                                             | `defaultValue={currentType}`, inline                                                                                             | `<Label htmlFor="voucher-type">` (:86)                                    |

Not in scope: 3 raw native `<select>` elements elsewhere in the apps (`grep -rn "<select" apps/*/src` → 3). Those are PR 5 audit material.

### Today's contract (the hand-rolled `Select`, both apps)

- **Form value:** a hidden `<input type="hidden">` is rendered **only when `name` is set** (`select.tsx:219`). Its value is the selected string, or `""` when nothing is selected.
- **`required`:** put on the hidden input. Hidden inputs are excluded from constraint validation (HTML spec), so it **blocks nothing**. W5/W6 submit `""` today and get a server-side error toast. The trigger does get `aria-required`.
- **`disabled`:** disables the trigger only. The hidden input is **still submitted**.
- **Form `reset`:** the hidden input's value is its attribute, so a reset does not change it, and the component's state does not listen for reset. The selection **survives** a reset, including React 19's automatic reset after a function `action` (relevant to A1/A2).
- **Value not in `options`:** the trigger shows the placeholder, and the hidden input still posts the raw value.
- **SSR / before hydration:** the trigger label and the hidden input are server-rendered, so a pre-hydration submit includes the value.
- **Keyboard:** a document-level keydown handler (`:128-162`). Enter/Space on the focused trigger toggles the list. While open: ArrowUp/Down wrap, Home/End, Enter selects, Escape closes and refocuses the trigger. DOM focus **stays on the trigger** (the "focused" item is visual only, with no `aria-activedescendant`). **No typeahead.** Tab is not handled: focus moves on and the list stays open.
- **Pointer:** a mousedown outside closes the list, and the click **also reaches** whatever was under it. Nothing locks scroll; the list repositions on scroll/resize (`:107-115`).
- **Layout:** the root is a `relative inline-block` wrapper that takes `className`. `w-full` stretches it; no class leaves it sized to its content (W5/W6/W7/A1/A2 rely on this).
- **Motion:** `animate-select-in`/`-out` on the panel, plus a per-item `animate-select-item-in` stagger (`ITEM_STAGGER_MS = 20`).

---

## 2. Radix Select form semantics (analysed on 2.3.7; installed 2.3.8)

**Version.** The `^2.1.0` range the other Radix deps use would resolve to **2.3.7**, the current `latest` (published 2026-07-24). Its pinned dependencies (`react-popper 1.3.7`, `react-focus-scope 1.1.16`, …) match versions already in the lockfile from PR 3. Source read: `npm pack @radix-ui/react-select@2.3.7` into the scratchpad, `dist/index.mjs`. Line numbers below refer to that file.

**Version note (added after Task 1, 2026-10-06).** Everything in this section, including the source references and experiments E1–E5, was **analysed on 2.3.7**, the `latest` when the plan was drafted. Task 1 installed **2.3.8** (the range `^2.3.7` now resolves to it). Radix's `@radix-ui/react-select` changelog for 2.3.8 lists a disabled-item fix and dependency updates and **does not list a production typeahead fix**, so the #4097 risk is neither fixed nor ruled out: **the Task 5 Step 4b production-build check stays required.** Source line references (`:1140-1142` and the like) were read from 2.3.7 and may be offset in 2.3.8. Task 2's characterization tests run against the **installed 2.3.8**; if one fails, stop and report (do not adjust the assertion), because the analysis would then be wrong for the installed version. The PR body records both versions: "analysed on 2.3.7, shipped on 2.3.8".

**Task 5 findings (2026-10-06): the Radix pin, the Term reset, and recorded differences.**

- **Step 4b failed on 2.3.8, then passed on 2.3.3.** In BOMY's standalone production build on 2.3.8, from Draft, typing `a` then `r` ended on Active instead of Archived (5 of 5 runs; the open list failed too). The dev server on 2.3.8 gave Archived 3 of 3. Cause: [radix-ui/primitives#4097](https://github.com/radix-ui/primitives/issues/4097), a `/* @__PURE__ */` annotation on the `updateSearch` IIFE that SWC removes. Upstream fix [#4106](https://github.com/radix-ui/primitives/pull/4106) merged 2026-10-05 and was **not published** (latest `react-select` was 2.3.8). A grep of the published tarballs showed 2.3.1 to 2.3.3 clean and 2.3.4 to 2.3.8 affected. **Decision (Charlie and Bob): pin `@radix-ui/react-select` to exactly `2.3.3`, no caret** (2.3.1 added `value=""` items; 2.3.3 added form reset handling). Commit `4a1ad05`. The Task 2 and Task 3 tests pass on 2.3.3 (8 and 10). Step 4b on 2.3.3: Status `d`,`a`,`r` gives Draft, Active, Archived (open list and closed trigger, 4 runs); Category `b`,`o` gives Books & Stationery, `b`,`e` Beauty & Skincare, `a`,`p` Apparel, `a`,`c` Accessories. **Unpin when a release that includes #4106 is published.**
- **Term reset (finding from the Step 4 browser check).** After a successful create, the used term leaves the list. The Select kept the stale value, showed a blank trigger, and its hidden select posted the first remaining option (`6`). Fix: `key={availableTerms.join(",")}` on the Term `Select` (commit `30ef4cc`) plus a regression test. Real-browser check on the final code: after creating a 6-month plan the trigger shows "Select term", `FormData` has `termMonths=""`, and a second submit gets "Term must be 3, 6, or 12 months" with no new plan.
- **Differences to list in the PR.** (1) Label click: on a fresh page a click on the State label opens the list; after the trigger was used with a mouse, a label click only focuses it (the old Select opened on any click). (2) Inline trigger widths in the plan form are about 8 px narrower than the baseline (118.9 and 101.3 px against 126.9 and 109.3), because the old trigger had `gap-2` and the shadcn trigger has no gap. (3) "No voucher" and "No category" show in the placeholder colour (Radix treats `""` as no value). (4) On the admin voucher save error path the Select returns to the saved type (the old one kept the choice); the plain inputs already reset.
- **Mobile overflow predates PR 4.** At 390 px the new-product form is 637 px wide. With both Select cells hidden it is still 637 px, so the Selects are not the cause. Not compared against `main` directly.
- **Suspected production bug, separate from PR 4: `DropdownMenu`.** `@radix-ui/react-menu` 2.1.24 (installed on `main` since PR 3) carries the same annotated `updateSearch` per the issue, so multi-letter typeahead in the seller nav menu is likely broken in production. **Not browser-tested.** Track it separately.
- **Not evaluated:** W8 to W10 in a browser (checkout paused; source-reviewed only); admin production typeahead and the admin browser check (need Charlie's own Google session); layout shift while open (scrollbar gap is 0 on this Mac); the two web `DATABASE_URL` test files and 13 admin test files that skip.

| Behaviour                 | Radix 2.3.7, with source reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native control            | `SelectBubbleInput` (`:1083-1135`) renders a real `<select aria-hidden tabIndex=-1>`, visually hidden (`VISUALLY_HIDDEN_STYLES`: absolute, 1px, clipped). Props passed through: `name`, `required`, `disabled`, `form`, `autoComplete`. It is uncontrolled (`defaultValue: selectValue`); an effect sets `.value` and dispatches a bubbling `change` event whenever the Radix value changes (`:1097-1111`). It is re-keyed by the option list (`nativeSelectKey`, `:92`, `:1132`).                                                                                  |
| When it is rendered       | `isFormControl = trigger ? !!form \|\| !!trigger.closest("form") : true` (`:89`). It is rendered (`:146`) inside a `<form>`, when `form` is passed, **and on the first render before the trigger ref exists, which includes SSR**. Outside a form, after mount, it is gone (experiment E1: `#outside select` count 0).                                                                                                                                                                                                                                              |
| Options                   | Each `SelectItemText` registers an `<option value disabled>{textContent}</option>` from a layout effect (`:930-940`). While closed, items render into a detached `DocumentFragment` (`:277-291`), so **options exist after mount without ever opening**. When the value is empty and no item has value `""`, an extra empty `<option value="">` is added (`:1128`).                                                                                                                                                                                                 |
| Empty value / placeholder | `shouldShowPlaceholder(v) = v === "" \|\| v === undefined` (`:1140-1142`). **An item with `value=""` is allowed in 2.3.7.** 2.3.0 and 2.2.6 throw "A <Select.Item /> must have a value prop that is not an empty string"; 2.3.1 and later do not (checked 2.2.6, 2.3.0–2.3.7). Selecting a `""` item sets the value to `""`, so the **trigger shows the placeholder, not the item's label**. Consumers must therefore use the `""` item's label as the placeholder (W1/W3/W8).                                                                                      |
| Controlled / uncontrolled | `useControllableState` (`:73-78`): `value` + `onValueChange` controlled, or `defaultValue` uncontrolled. Changing `defaultValue` after mount does nothing.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Form `reset`              | **Added in 2.3.3** (absent in ≤2.3.2): listens for `reset` on `trigger.form` (or `#form`) and calls `setValue(initialValueRef.current)`, **the value at first render** (`:80-88`). Uncontrolled: it reverts. Controlled: it calls `onValueChange(initial)` (E1: `ctrlCalls 1`).                                                                                                                                                                                                                                                                                     |
| `required`                | It is on the native select, so it **does** take part in constraint validation. E1: `form.checkValidity()` is `false` with an empty required Select, the submit is blocked, and **the browser moves focus to the 1px `aria-hidden` native select**. The trigger gets `aria-required` (`:193`), and a consumer prop overrides it (props spread after, `:200`).                                                                                                                                                                                                        |
| `disabled`                | Applied to the native select, so a disabled Select is **left out of FormData** (E1: `dis` absent).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Value not among the items | The trigger is **blank** (neither label nor placeholder). The native select falls back to its **first option**, and FormData posts that (E3: `defaultValue="zzz"` → posted `""`, the first option there).                                                                                                                                                                                                                                                                                                                                                           |
| SSR                       | `renderToString` of a Select inside a form gives the trigger with an **empty value `<span>`** and `<select aria-hidden name=… required>` **with no `<option>`** (E2). So (a) an uncontrolled trigger is blank until hydration, and (b) a pre-hydration submit sends nothing for that field.                                                                                                                                                                                                                                                                         |
| Portal                    | The listbox is portaled, but the native select sits **in place** next to the trigger, so its form owner is the surrounding form. E1: FormData includes the field with the content closed and after selecting from the portaled list.                                                                                                                                                                                                                                                                                                                                |
| Keyboard                  | Trigger: Space/Enter/ArrowUp/ArrowDown open it (`OPEN_KEYS`, `:32`, `:224-227`) and the default is prevented, so **Enter on a closed trigger opens it and does not submit the form** (E1). Printable keys on a **closed** trigger do typeahead and change the value without opening (`:166-173`, `:222`; E1: `a` → "Active"). Open: DOM focus moves onto the options; Up/Down/Home/End (`:502-514`); typeahead; Enter/Space select (`:898`); **Tab is swallowed** (`:501`; E1: stays open); Escape closes; on close, focus returns to the trigger (`:466-469`; E1). |
| Pointer                   | Mouse opens on `pointerdown`; touch/pen opens on `click` (`:204-216`). Outside pointer events are disabled while open (`disableOutsidePointerEvents: true`, `:474`; E1: `body` gets `pointer-events: none`), so **an outside click only closes the list and does not activate what was under it**.                                                                                                                                                                                                                                                                  |
| Modality                  | Always modal: there is **no `modal` prop** (0 matches). `RemoveScroll` locks page scroll (`:458`). `hideOthers` sets `aria-hidden` on the rest of the page (`:331`). (PR 3's `modal={false}` fallback does not exist here.)                                                                                                                                                                                                                                                                                                                                         |
| Label                     | The trigger is a `<button role=combobox>`, which is labelable: `label.control` → the trigger (E1). So `<Label htmlFor>` works once `id` is on **`SelectTrigger`**.                                                                                                                                                                                                                                                                                                                                                                                                  |

**React 19 function-action reset × Radix reset (decisive for A1/A2).** E4 (browser), with a role form like A1: select `bomy_admin`, submit, and the "server" state updates. Results: **variant `<form action>`: badge = `bomy_admin`, trigger = `buyer`, native value = `buyer`.** React 19 resets the form after a function action, and Radix reverts to its mount value. A second Save would then **send the old role back to the server**. The variant using `onSubmit` + `preventDefault`, and the variant using `action` + `key={current}`, both keep `bomy_admin`. jsdom shows the same thing (E5), which is why the admin tests in Task 4 can pin it.

**Experiments** (scratchpad only, nothing in the repo; Chromium via the repo's Playwright 1.62.1, React 19.2.5, Radix 2.3.7, minimal Root/Trigger/Value/Content/Item composition):

- E1: FormData before and after interaction, required/disabled/no-name/outside-form/reset/typeahead/Escape/Tab/Enter-on-trigger/label.
- E2: SSR markup.
- E3: value not among the items, and the transform snap (below).
- E4: function-action reset.
- E5: the same in Vitest 2.1.9 + jsdom 28.1.0, run with the repo's own vitest binary. jsdom was found through vitest's auto-installed optional peer. Keyboard open/select also works in jsdom with three no-op polyfills (`scrollIntoView`, `hasPointerCapture`, `releasePointerCapture`); typeahead needs none.

**Behaviour changes, and how each consumer adapts**

| Change vs today                                                         | Who is affected                                                                                                                                                                                            | Adaptation in this plan                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Function-action reset reverts the Select                                | **A1**, **A2**                                                                                                                                                                                             | A1 → `onSubmit` + `preventDefault` (the pattern web forms already use; see the comments at product-form.tsx:105, create-plan-form.tsx:26). A2 is a server component and keeps its server action, so it gets `key={currentType}` (remount on revalidated data). Both are pinned by tests in Task 4. |
| `required` now blocks submit and focuses a hidden element               | W5, W6                                                                                                                                                                                                     | **Open decision 2.** Recommended: don't pass `required` to the Root; put `aria-required="true"` on the trigger. FormData then stays `""` as today and the server error toast stays the validation path.                                                                                            |
| `""` item shows the placeholder, not its label                          | W1, W3, W8                                                                                                                                                                                                 | Use `placeholder` = that item's label ("No category", "No voucher"). Pin `^2.3.7` (≤2.3.0 throws).                                                                                                                                                                                                 |
| Disabled → omitted from FormData                                        | A1 (`disabled={pending}`)                                                                                                                                                                                  | No effect: FormData is built at submit time, before `pending` is true. Documented.                                                                                                                                                                                                                 |
| Value not among the items → blank trigger, first option posted          | none in practice (W3 always includes the current category; W4/W7/A1 values are always in their lists; A2 posts `fixed_myr` instead of an invalid stored type, which the server would have rejected anyway) | Documented in the Behaviour contract. No code change.                                                                                                                                                                                                                                              |
| SSR: blank uncontrolled trigger and no options before hydration         | All SSR'd uncontrolled call sites; **A2 pre-hydration submit** posts no `type` → "Invalid voucher type." toast, nothing written                                                                            | Accepted and documented (cosmetic flash; admin-only, pre-hydration-only, fails safe). Web call sites are client forms whose `onSubmit` is not attached before hydration today either.                                                                                                              |
| Outside click no longer passes through; page scroll locked while open   | all                                                                                                                                                                                                        | Contract updated; browser check.                                                                                                                                                                                                                                                                   |
| Tab is inert while open; DOM focus moves into the list; typeahead added | all                                                                                                                                                                                                        | Contract updated; browser check.                                                                                                                                                                                                                                                                   |
| Trigger is `w-full` by default (no inline wrapper any more)             | W5, W6, W7, A1, A2 (inline today)                                                                                                                                                                          | `className="w-auto"` on their `SelectTrigger` (tailwind-merge: the later `w-*` wins).                                                                                                                                                                                                              |
| `className` now styles the trigger itself                               | W10 (`border-destructive` had no visible effect on the wrapper)                                                                                                                                            | The error border now actually shows. Called out in the PR as an intended side effect.                                                                                                                                                                                                              |
| No accessible name today                                                | W8, W9                                                                                                                                                                                                     | Add `aria-label="Voucher"` / `aria-label="Saved address"` on the trigger. Otherwise the combobox's name would be its current value text. Small and in scope, because these call sites are being rewritten anyway.                                                                                  |
| Native `select` sits outside the old `relative inline-block` wrapper    | all                                                                                                                                                                                                        | It is `position:absolute`, 1px, clipped, and takes no part in flex `gap`. Visual check only.                                                                                                                                                                                                       |
| Per-item `select-item-in` stagger                                       | all                                                                                                                                                                                                        | **Open decision 3** (recommend dropping it; the keyframe stays because `stepper.tsx:37` uses it).                                                                                                                                                                                                  |

---

## Global Constraints

- **The primitive is copied** from `https://ui.shadcn.com/r/styles/new-york/select.json` with exactly **five** edits, nothing else (dry-run in the scratchpad: the script below applies cleanly, the result passes strict `tsc` with the repo's `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`/`lib: ES2022`, and upstream needs **no** `exactOptionalPropertyTypes` fix this time):
  - (a) `import { cn } from "@/lib/utils"` → `import { cn } from "../lib/utils.js"`.
  - (b) The `SelectContent` animation group `data-[state=open]:animate-in … data-[side=top]:slide-in-from-bottom-2` → `data-[state=open]:animate-select-in data-[state=closed]:animate-select-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none`. Same regex and same reason as PR 3: no `tailwindcss-animate` plugin, and the `motion-reduce` classes must carry the `data-[state]` variant to win on specificity.
  - (c) The `"use client"` first line is kept.
  - (d) Remove the popper-only `data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1` argument, and offset the content with Radix's own `sideOffset` (default `4`, today's `DROPDOWN_OFFSET`). **Reason, verified (E3):** BOMY's `select-in` ends at `transform: none` with no fill mode. Once the 150 ms animation ends, the element snaps back to the class's `translateY(4px)`, which is a visible 4px jump on every open (and the reverse at the start of `select-out`, which has `forwards`). `tailwindcss-animate` does not have this problem because its `enter` keyframe has no `to`. `sideOffset` is only applied in popper mode (`:430-441`).
  - (e) `SelectTrigger`: `rounded-md` → `rounded-input`. The BOMY radius token: `--radius-input` is 10px vs `rounded-md` 8px. `Input` (`packages/ui/src/components/input.tsx`) and today's Select trigger both use `rounded-input`, and Select sits next to Inputs in W5–W7.

  Everything else stays upstream on purpose, including the trigger's `focus:ring-1` (today: `focus-visible:ring-1`; Radix refocuses the trigger after every close), `bg-popover` in both apps, `min-w-[8rem]`, and the scroll buttons.

- **No `tailwind.config.ts` change.** `select-in`/`select-out` exist in both configs (web :85-92/118-119, admin :85-92/106-107). `select-item-in` stays (still used by `apps/web/src/components/ui/stepper.tsx:37`). `animate` and `rounded` are already registered with tailwind-merge in `packages/ui/src/lib/utils.ts:13-27`. If a build is missing a class, stop and report.
- **New `@bomy/ui` dependency: `"@radix-ui/react-select": "^2.3.7"` (superseded: shipped as the exact pin `"2.3.3"`, see the Task 5 findings in §2).** It is not `^2.1.0` like its siblings, because ≤2.3.0 throws on the `""` items W1/W3/W8 need, and the form-reset listener the A2 `key` fix relies on arrives in 2.3.3. Apps do not add Radix directly. Record the resolved version and the new transitive packages from `pnpm-lock.yaml` in the PR.
- **Test-only devDependency: `"jsdom": "^28.1.0"` in `apps/web` and `apps/admin`.** jsdom 28.1.0 is already in the lockfile as vitest's auto-installed optional peer, and E5 ran against it. Declaring it makes the `// @vitest-environment jsdom` tests independent of `autoInstallPeers`. No other test tooling is added. (The default environment stays `node`; only the new files opt in.)
- **Every call site migrates to the shadcn API.** Keep each file's existing option constants (`STATUS_OPTIONS`, `DISCOUNT_OPTIONS`, `STATE_OPTIONS`, `ROLE_OPTIONS`, `VOUCHER_TYPE_OPTIONS`, `TERM_LABELS`) and map over them. `id` moves to `SelectTrigger`; `name`/`defaultValue`/`value`/`onValueChange`/`disabled` stay on `Select`; `placeholder` moves to `SelectValue`.
- **Forms stay local.** No shared form helpers and no local `Select` wrapper.
- **Stage explicit file paths only.** Never `git add` a directory. Inspect `git diff --cached --stat` before each commit. `apps/web/src/app/products/loading.tsx` and the other untracked `docs/` files must not enter the PR.
- No PR 5 work: the 3 raw `<select>` elements are out of scope. No unrelated refactors.
- **No session forging.** Never mint, encode or set an auth/session cookie from `AUTH_SECRET` or any other secret. The admin browser check is Charlie's own Google sign-in, or it is reported as not evaluated.
- Report the two DATABASE_URL-limited web test files (`tests/auth/magic-link-actions.test.ts`, `tests/auth/consent/actions.test.ts`) and the skipped admin integration files as **not evaluated**.

## Behaviour contract (what "works" means; verified in Tasks 2–5)

**Every Select (both apps)**

- **Opening:** Enter, Space, ArrowDown or ArrowUp on the focused trigger opens the list and moves focus to the selected option (or the first one). Enter on a closed trigger **does not submit** the form. A mouse press on the trigger opens it.
- **Inside the list:** ArrowUp/Down move between options (**no wrap**: Radix stops at the ends; today's version wrapped). Home/End go to the first/last option. Typing letters jumps to a matching option. Enter, Space or a click selects, closes the list and returns focus to the trigger.
- **Typeahead on a closed trigger:** typing a letter changes the value without opening the list (new).
- **Closing:** Escape closes the list and returns focus to the trigger. **Tab does nothing while the list is open.** A press outside closes the list **without** activating the element under it, and leaves no `pointer-events: none` or scroll lock on `body` afterwards.
- **Rendering:** the list is portaled, `z-50`, and sits 4px below the trigger with **no jump when the open animation ends**. The page does not scroll while the list is open (Radix always locks scroll).
- **Accessible name:** every trigger's combobox name is its visible label, or the `aria-label` for W8/W9. A `<Label htmlFor>` click focuses the trigger.
- **Reduced motion:** the open/close animation is off under `prefers-reduced-motion: reduce` (verified from the built CSS, as in PR 3).
- **FormData** (named Selects): the posted value equals the selected item's value, including `""` for "No category". With nothing selected it is `""`, the same as today. A disabled Select is left out.

**Per call site (server-visible contract unchanged)**

- **W1/W2:** with no interaction, the form posts `categoryId=""` and `status="draft"`. Choosing a category posts its id.
- **W3/W4:** without touching the Selects, the form posts the product's own `categoryId` (or `""`) and **its own `status`**. Choosing "No category" posts `""`.
- **W5/W6:**
  - Submitting with nothing selected is **not** blocked by the browser.
  - It posts `termMonths=""` / `discountPct=""`, and the existing server error toast appears (Open decision 2).
  - Choosing values posts `"3"|"6"|"12"` and `"5"…"10"`.
- **W7:** posts the plan's current discount until it is changed.
- **W8:** "No voucher" puts `voucherId` back to `null`. (Not evaluated locally; see Task 5 Step 4.)
- **W9:** switching saved address reloads the address fields; "Use a new address" clears them. (Not evaluated locally.)
- **W10:** an empty state gets the `border-destructive` trigger plus the field error after submit. (Not evaluated locally.)
- **W11:** the chosen state reaches `addAddress`/`updateAddress`. Cancel and reopen shows the placeholder again.
- **A1:** after a successful Save the trigger **still shows the new role** (no revert), and a second Save sends the new role.
- **A2:**
  - Save Config posts the chosen `type`.
  - After the server action and revalidation, the trigger shows the **saved** type.
  - On a failed save it falls back to the stored type, just as the other inputs fall back to their stored values (React's form reset).
  - A pre-hydration submit posts no `type` and gets "Invalid voucher type." (documented limitation).

## Review Focus

- **A1 revert-on-save (data-changing).** With `<form action>`, React 19's post-action reset plus Radix 2.3.3+'s reset listener put the trigger back to the old role, and a second Save would post it. Fixed by `onSubmit`. Pinned by Task 4's test, plus a mutation check that removes the fix and must see the test fail.
- **A2 after a server action** relies on `key={currentType}` remounting from revalidated RSC data. jsdom simulates this (Task 4), but the real Next ordering of RSC update and form reset is only seen in Charlie's admin browser check (§ Task 5 Step 6). That check is a merge gate for the admin migration (Task 5 Step 6); if it cannot run, the admin migration splits into PR 4b instead of merging unverified.
- **Empty-value items** need Radix ≥2.3.1 and the item's label as placeholder. Pinned by the primitive test (Task 2) and by W1/W3 tests.
- **FormData presence** after migration for every named Select, **with no interaction** (W2/W4 default status: a missing `status` silently becomes `draft`). Pinned in Task 3.
- **`required` semantics** (Open decision 2) and **label association** (`id` on `SelectTrigger`, never on `Select`).
- **Inline widths** (`w-auto` on W5/W6/W7/A1/A2) and the **4px animation jump** (edit (d)). Browser check against the Task 0 baseline.
- **Modal Select**: scroll lock, outside click no longer passing through, and the macOS overlay-scrollbar caveat for the layout-shift check (PR 3 lesson).
- **Tests asserting old DOM:** none exist (grep at `89c0d38`). Every Select test is new.

---

### Task 0: Branch and baseline (before any change)

- [ ] **Step 1:** `git switch main && git pull --ff-only && git switch -c feat/bomy-ui-package-pr4`. Confirm HEAD descends from `89c0d38`.
- [ ] **Step 2: Baseline screenshots (web).** Start web (`pnpm --filter @bomy/web dev`, per the CLAUDE.md shell gotchas). Sign in as the seeded `seller_owner` with the Mailhog magic-link technique (see Task 5 Step 4). Screenshot, and record the trigger `getBoundingClientRect()` widths/heights for:
  - `/seller/dashboard/products/new`
  - one product's `/seller/dashboard/products/<id>/edit`
  - `/seller/dashboard/subscriptions` (create + edit forms)
  - `/account/addresses` (Add address open)
  - `/checkout` with one item in the cart

  Save these in the scratchpad, not the repo. Stop the server.

  **Task 0 outcome (run 2026-10-06, on `main` `89c0d38`).** Baseline widths/heights are in `BASELINE.md` (scratchpad); screenshots are in `/Users/charlie/Documents/Projects/BOMY/.playwright-mcp/baseline/` (the Playwright tool only allows that folder; it is outside the `app` git repo). **Not capturable locally:** (1) `/checkout`: the page renders only "Checkout is paused. We'll let you know when it's back." because `checkout_enabled` is `false` in the local database, so none of W8–W10 render. Charlie decided **not** to flip the flag for screenshots, so there is **no checkout baseline** and none will be taken; (2) the subscriptions **edit** form (W7): no plan exists in the local data.

---

### Task 1: Add the `Select` primitive to `packages/ui`

**Files:** Create `packages/ui/src/components/select.tsx`; Modify `packages/ui/package.json`, `pnpm-lock.yaml`.

- [ ] **Step 1: Fetch upstream** (scratch dir, not the repo):

```bash
# SCRATCH = the executing session's scratchpad directory (from its system prompt); fails loudly if unset.
export SCRATCH="${SCRATCH:?export SCRATCH=<this session's scratchpad dir> first}"
mkdir -p "$SCRATCH"
set -e
curl --fail --silent --show-error https://ui.shadcn.com/r/styles/new-york/select.json -o "$SCRATCH/select.json"
python3 -c "import json,os; d=json.load(open(os.environ['SCRATCH']+'/select.json')); print(d['dependencies'])"
```

Expected: `['@radix-ui/react-select']`.

- [ ] **Step 2: Write the file with the five edits** (run from `app/`):

```bash
python3 - <<'EOF'
import json, os, re
c = json.load(open(os.environ["SCRATCH"] + "/select.json"))["files"][0]["content"]
c = c if c.endswith("\n") else c + "\n"
assert c.startswith('"use client"')                                   # (c)
assert c.count('from "@/lib/utils"') == 1
c = c.replace('from "@/lib/utils"', 'from "../lib/utils.js"')          # (a)
ANIM = re.compile(r'data-\[state=open\]:animate-in\s+data-\[state=closed\]:animate-out(?:\s+data-\[[^\]]+\]:[a-z0-9-]+)*')
NEW = 'data-[state=open]:animate-select-in data-[state=closed]:animate-select-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none'
c, k = ANIM.subn(NEW, c)                                              # (b)
assert k == 1, k
POP = '''        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
'''
assert c.count(POP) == 1
c = c.replace(POP, "")                                                # (d) part 1
SIG = '({ className, children, position = "popper", ...props }, ref)'
assert c.count(SIG) == 1
c = c.replace(SIG, '({ className, children, position = "popper", sideOffset = 4, ...props }, ref)')
P = '      position={position}\n'
assert c.count(P) == 1
c = c.replace(P, '      position={position}\n      sideOffset={sideOffset}\n')   # (d) part 2
T = '"flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input'
assert c.count(T) == 1
c = c.replace(T, '"flex h-9 w-full items-center justify-between whitespace-nowrap rounded-input border border-input')  # (e)
open("packages/ui/src/components/select.tsx", "w").write(c)
print("ok")
EOF
grep -c "animate-in\|zoom-in\|slide-in\|translate-y-1\|rounded-md border border-input" packages/ui/src/components/select.tsx || true
```

Expected: `ok`, then `0` (`grep -c` exits 1 on a 0 count, hence `|| true`). If an assertion fails, upstream changed since 2026-10-05: read the new file and report it; do not hand-edit around it.

- [ ] **Step 3: `packages/ui/package.json`.** Add `"./select": "./src/components/select.tsx"` to `exports` (after `./dropdown-menu`). Add `"@radix-ui/react-select": "^2.3.7"` to `dependencies` (alphabetical, after `@radix-ui/react-popover`).

- [ ] **Step 4: Install and check**

```bash
pnpm install
grep -n "'@radix-ui/react-select@" pnpm-lock.yaml
pnpm --filter @bomy/ui typecheck
pnpm --filter @bomy/ui lint
```

Expected: the lockfile shows `@radix-ui/react-select@2.3.7` or newer (2.3.8 was installed on 2026-10-06; see the Version note in §2), and typecheck and lint are clean. Record the version, plus any new transitive `@radix-ui/*` packages (e.g. `react-visually-hidden`, `react-use-previous`, `number`), for the PR.

- [ ] **Step 5: Commit (explicit paths)**

```bash
git add packages/ui/src/components/select.tsx packages/ui/package.json pnpm-lock.yaml docs/superpowers/plans/2026-10-05-bomy-shared-ui-package-pr4.md
git diff --cached --stat
git commit -m "feat(ui): add Select primitive on @radix-ui/react-select"
```

---

### Task 2: Test harness + primitive form-contract tests

**Files:** Modify `apps/web/package.json`, `pnpm-lock.yaml`; Create `apps/web/tests/components/ui/select.test.tsx`. (`apps/admin/package.json` is **not** touched here: admin's `jsdom` devDependency moves to Task 4 Step 0 so that web-only PR 4 carries no admin file.)

These are **characterization tests** of the Radix behaviour the migration relies on (§2). They should pass on the first run. If one fails, the analysis is wrong for the installed version: **stop and report**; do not adjust the assertion to match.

- [ ] **Step 1:** Add `"jsdom": "^28.1.0"` to `devDependencies` in `apps/web/package.json` **only**. Run `pnpm install`, then `grep -n "jsdom@" pnpm-lock.yaml | head -3`. Expected: still `28.1.0`, no new download.

- [ ] **Step 2: Write `apps/web/tests/components/ui/select.test.tsx`**

```tsx
// @vitest-environment jsdom
import React, { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"

// Form-submission contract of the shared Select (Radix 2.3.x). jsdom, not a browser: pointer
// interaction, layout and animation are covered by the live browser check instead.
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
// Radix calls these while opening/navigating the list; jsdom does not implement them.
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}

const CATEGORY_ITEMS = [
  { value: "", label: "No category" },
  { value: "c-1", label: "Apparel" },
  { value: "c-2", label: "Books" },
]

function CategorySelect(props: { name?: string; defaultValue?: string; disabled?: boolean }) {
  return (
    <Select {...props}>
      <SelectTrigger id="cat">
        <SelectValue placeholder="No category" />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_ITEMS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(ui: React.ReactNode) {
  await act(async () => {
    root.render(ui)
    await Promise.resolve()
  })
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el
}

async function press(el: HTMLElement, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

async function typeahead(el: HTMLElement, text: string) {
  el.focus()
  for (const key of text) await press(el, key)
}

function fields(formId: string): [string, string][] {
  const form = byId(formId)
  if (!(form instanceof HTMLFormElement)) throw new Error(`#${formId} is not a form`)
  return [...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name])
}

describe("@bomy/ui Select — form contract", () => {
  it("posts the default value without any interaction, and shows its label", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-2" />
      </form>,
    )
    expect(fields("f")).toEqual([["categoryId", "c-2"]])
    expect(byId("cat").textContent).toBe("Books")
  })

  it("posts an empty string when nothing is selected, and shows the placeholder", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" />
      </form>,
    )
    expect(fields("f")).toEqual([["categoryId", ""]])
    expect(byId("cat").hasAttribute("data-placeholder")).toBe(true)
  })

  it('allows an item with value "" and posts "" when it is chosen (Radix >= 2.3.1)', async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-2" />
      </form>,
    )
    await typeahead(byId("cat"), "N")
    expect(fields("f")).toEqual([["categoryId", ""]])
    // The trigger shows the placeholder for "", so call sites set placeholder = that item's label.
    expect(byId("cat").textContent).toBe("No category")
  })

  it("keyboard: Enter opens, ArrowUp + Enter selects, focus returns to the trigger", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-2" />
      </form>,
    )
    const trigger = byId("cat")
    trigger.focus()
    await press(trigger, "Enter")
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement?.getAttribute("role")).toBe("option")
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) throw new Error("no focused option")
    await press(active, "ArrowUp")
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const next = document.activeElement
    if (!(next instanceof HTMLElement)) throw new Error("no focused option")
    await press(next, "Enter")
    expect(fields("f")).toEqual([["categoryId", "c-1"]])
    expect(document.activeElement).toBe(trigger)
  })

  it("form.reset() restores the mount value", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-1" />
      </form>,
    )
    await typeahead(byId("cat"), "B")
    expect(fields("f")).toEqual([["categoryId", "c-2"]])
    await act(async () => {
      ;(byId("f") as HTMLFormElement).reset()
      await Promise.resolve()
    })
    expect(fields("f")).toEqual([["categoryId", "c-1"]])
    expect(byId("cat").textContent).toBe("Apparel")
  })

  it("a disabled Select is left out of FormData (today's hidden input was not)", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-1" disabled />
      </form>,
    )
    expect(fields("f")).toEqual([])
  })

  it("renders no native control outside a form", async () => {
    await render(
      <div id="d">
        <CategorySelect name="categoryId" defaultValue="c-1" />
      </div>,
    )
    expect(byId("d").querySelector("select")).toBeNull()
  })

  it("server render: a named native select with no options yet (pre-hydration submit posts nothing)", () => {
    const html = renderToStaticMarkup(
      <form>
        <CategorySelect name="categoryId" defaultValue="c-1" />
      </form>,
    )
    expect(html).toContain('name="categoryId"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("<option")
  })
})
```

- [ ] **Step 3: Run it.** `pnpm --filter @bomy/web test tests/components/ui/select.test.tsx --run`. Expected: 8 passed. Then `pnpm --filter @bomy/web typecheck` (tests are type-checked **and linted by the pre-commit hook** (`eslint --fix` on staged files): `@typescript-eslint/require-await` flags an `async` arrow with no `await`, so the `act(async () => …)` helpers end with `await Promise.resolve()`, and `no-base-to-string` flags `String(v)` on a `FormDataEntryValue`, so use `typeof v === "string" ? v : v.name`; run `pnpm --filter @bomy/web exec eslint tests/components/ui` before committing a test file).

- [ ] **Step 4: Commit** `apps/web/package.json pnpm-lock.yaml apps/web/tests/components/ui/select.test.tsx`. Message: `test(ui): pin Select form-submission contract (jsdom)`.

---

### Task 3: Web, tests first, then migrate the 6 files and delete the local Select

**Files:** Create `apps/web/tests/components/ui/select-forms.test.tsx`; Modify `product-form.tsx`, `product-edit-form.tsx`, `create-plan-form.tsx`, `edit-plan-form.tsx`, `checkout/_form.tsx`, `account/addresses/address-manager.tsx`; Delete `apps/web/src/components/ui/select.tsx`.

- [ ] **Step 1: Write the consumer tests** (`apps/web/tests/components/ui/select-forms.test.tsx`). They render the real forms with only their server actions and the toast hook mocked, drive the Select through the keyboard, submit, and read what the action received. **Checkout (W8–W10) has no test in this plan, and no browser check either:** a unit test would need the cart context and the preview server action, and locally the page only shows "Checkout is paused" (`checkout_enabled=false`, Charlie's decision to keep it). W8–W10 are therefore **not evaluated** beyond typecheck, lint, the production builds, the primitive-level contract tests in Task 2 (which prove the Select itself, not the checkout wiring), and the line-by-line Opus review in Task 5 Step 3b. **Do not describe them as covered by jsdom or by the browser.**

```tsx
// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const actions = vi.hoisted(() => ({
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  addVariant: vi.fn(),
  archiveProduct: vi.fn(),
  deactivateVariant: vi.fn(),
  reactivateVariant: vi.fn(),
  reorderVariants: vi.fn(),
  updateVariant: vi.fn(),
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  setDefault: vi.fn(),
}))

vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/app/seller/dashboard/subscriptions/actions", () => ({
  createPlan: actions.createPlan,
  updatePlan: actions.updatePlan,
}))
vi.mock("@/app/seller/dashboard/products/actions", () => ({
  createProduct: actions.createProduct,
  updateProduct: actions.updateProduct,
  addVariant: actions.addVariant,
  archiveProduct: actions.archiveProduct,
  deactivateVariant: actions.deactivateVariant,
  reactivateVariant: actions.reactivateVariant,
  reorderVariants: actions.reorderVariants,
  updateVariant: actions.updateVariant,
}))
vi.mock("@/app/account/addresses/actions", () => ({
  addAddress: actions.addAddress,
  updateAddress: actions.updateAddress,
  deleteAddress: actions.deleteAddress,
  setDefault: actions.setDefault,
}))

import { AddressManager } from "@/app/account/addresses/address-manager"
import { ProductEditForm } from "@/app/seller/dashboard/products/[id]/edit/product-edit-form"
import { ProductForm } from "@/app/seller/dashboard/products/new/product-form"
import { CreatePlanForm } from "@/app/seller/dashboard/subscriptions/create-plan-form"
import { EditPlanForm } from "@/app/seller/dashboard/subscriptions/edit-plan-form"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  actions.createPlan.mockResolvedValue({ ok: true })
  actions.updatePlan.mockResolvedValue({ ok: true })
  actions.createProduct.mockResolvedValue({ ok: false, error: "stub" })
  actions.updateProduct.mockResolvedValue({ ok: true })
  actions.addAddress.mockResolvedValue({ ok: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(ui: React.ReactNode) {
  await act(async () => {
    root.render(ui)
    await Promise.resolve()
  })
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el
}

// Typeahead on a closed trigger changes the value through Radix's own keyboard path.
async function typeahead(id: string, text: string) {
  const el = byId(id)
  el.focus()
  for (const key of text) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
  }
}

function form(): HTMLFormElement {
  const f = container.querySelector("form")
  if (!f) throw new Error("no form")
  return f
}

// Dispatches submit directly (skips constraint validation on unrelated required inputs);
// the W5/W6 test checks validation separately with checkValidity().
async function submit(f: HTMLFormElement = form()) {
  await act(async () => {
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function sentFormData(fn: Mock, argIndex = 0): FormData {
  const call = fn.mock.calls[0]
  if (!call) throw new Error("action not called")
  const fd: unknown = call[argIndex]
  if (!(fd instanceof FormData)) throw new Error("argument is not FormData")
  return fd
}

const CATEGORIES = [
  { id: "c-1", name: "Apparel" },
  { id: "c-2", name: "Books" },
]

describe("W1/W2 ProductForm", () => {
  it('posts categoryId="" and status="draft" without interaction', async () => {
    await render(<ProductForm categories={CATEGORIES} />)
    await submit()
    const fd = sentFormData(actions.createProduct)
    expect(fd.get("categoryId")).toBe("")
    expect(fd.get("status")).toBe("draft")
  })

  it("posts the chosen category and status", async () => {
    await render(<ProductForm categories={CATEGORIES} />)
    await typeahead("categoryId", "B")
    await typeahead("status", "A")
    await submit()
    const fd = sentFormData(actions.createProduct)
    expect(fd.get("categoryId")).toBe("c-2")
    expect(fd.get("status")).toBe("active")
  })
})

describe("W3/W4 ProductEditForm", () => {
  const product = {
    id: "p-1",
    name: "Mug",
    slug: "mug",
    description: null,
    categoryId: "c-2",
    status: "archived" as const,
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
  }
  const categories = [
    { id: "c-1", name: "Apparel", isActive: true },
    { id: "c-2", name: "Books", isActive: false },
  ]

  it("posts the product's own category and status without interaction", async () => {
    await render(<ProductEditForm product={product} variants={[]} categories={categories} />)
    expect(byId("categoryId").textContent).toBe("Books (inactive)")
    await submit()
    const fd = sentFormData(actions.updateProduct, 1)
    expect(fd.get("categoryId")).toBe("c-2")
    expect(fd.get("status")).toBe("archived")
  })

  it('choosing "No category" posts ""', async () => {
    await render(<ProductEditForm product={product} variants={[]} categories={categories} />)
    await typeahead("categoryId", "N")
    await submit()
    expect(sentFormData(actions.updateProduct, 1).get("categoryId")).toBe("")
  })
})

describe("W5/W6 CreatePlanForm", () => {
  it('does not block submit with nothing selected and posts "" (server validates, as today)', async () => {
    await render(<CreatePlanForm availableTerms={[3, 6, 12]} />)
    const price = byId("priceMyrSen")
    if (!(price instanceof HTMLInputElement)) throw new Error("price is not an input")
    price.value = "50.00"
    expect(form().checkValidity()).toBe(true)
    await submit()
    const fd = sentFormData(actions.createPlan)
    expect(fd.get("termMonths")).toBe("")
    expect(fd.get("discountPct")).toBe("")
    expect(byId("termMonths").getAttribute("aria-required")).toBe("true")
  })

  it("posts the chosen term and discount", async () => {
    await render(<CreatePlanForm availableTerms={[3, 6, 12]} />)
    await typeahead("termMonths", "6")
    await typeahead("discountPct", "7")
    await submit()
    const fd = sentFormData(actions.createPlan)
    expect(fd.get("termMonths")).toBe("6")
    expect(fd.get("discountPct")).toBe("7")
  })
})

describe("W7 EditPlanForm", () => {
  it("posts the current discount until it is changed", async () => {
    await render(
      <EditPlanForm
        planId="pl-1"
        defaultPriceMyr="50.00"
        defaultDiscountPct={8}
        defaultDescription=""
      />,
    )
    await submit()
    expect(sentFormData(actions.updatePlan, 1).get("discountPct")).toBe("8")
  })
})

describe("W11 AddressManager", () => {
  it("passes the chosen state to addAddress", async () => {
    await render(<AddressManager initial={[]} />)
    const add = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add address"),
    )
    if (!add) throw new Error("no Add address button")
    await act(async () => {
      add.click()
      await Promise.resolve()
    })
    expect(byId("addr-state").hasAttribute("data-placeholder")).toBe(true)
    await typeahead("addr-state", "Pah")
    await submit()
    const call = actions.addAddress.mock.calls[0]
    if (!call) throw new Error("addAddress not called")
    expect(call[0]).toMatchObject({ state: "Pahang" })
  })
})
```

If `ProductEditForm` fails to mount in jsdom for a reason that has nothing to do with Select (for example `@dnd-kit` needing `ResizeObserver`), add this stub at the top of the file and re-run:

```ts
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
```

If it still fails for a non-Select reason, remove only the W3/W4 `describe`, cover W3/W4 in the browser (Task 5), and say so in the PR.

- [ ] **Step 1b: Vitest JSX transform (found while running Step 2; approved by Charlie, to be shown in Bob's diff review).** The first run failed all 8 tests with `ReferenceError: React is not defined`, which has nothing to do with Select: `apps/web/tsconfig.json` has `"jsx": "preserve"` (Next compiles JSX), so source forms such as `product-form.tsx`, `create-plan-form.tsx` and `address-manager.tsx` do not import React, and `apps/web/vitest.config.ts` set no JSX option, so esbuild used the classic transform. Fix at the source: add `esbuild: { jsx: "automatic" }` to `apps/web/vitest.config.ts` (with the two-line comment saying why). It applies to every web test; files that do import React are unaffected. After it, run the full web suite and report only the 2 DATABASE_URL files as not evaluated. Admin needs the same line in `apps/admin/vitest.config.ts` (Task 4 Step 0, on the PR 4b branch). Do not use a `globalThis.React` shim in the test file. Verified 2026-10-06: full web suite 269 passed, with only the 4 intended reds below and the 2 DATABASE_URL files failing.

- [ ] **Step 2: Run them; they must FAIL against the old Select.** Run `pnpm --filter @bomy/web test tests/components/ui/select-forms.test.tsx --run`. Expected red: the typeahead cases fail (the old Select has no typeahead, so values do not change), and the `aria-required` / `data-placeholder` assertions may fail too. The "without interaction" cases may already pass, because the hidden input posts the same values; that is fine, since they pin parity. If a case fails for any other reason (e.g. a mock path is wrong), fix the test before migrating.

- [ ] **Step 3: Migrate the six files.** In each file, replace `import { Select } from "@/components/ui/select"` with:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"
```

**`product-form.tsx` :167-175 (W1)** →

```tsx
<Select name="categoryId">
  <SelectTrigger id="categoryId">
    <SelectValue placeholder="No category" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">No category</SelectItem>
    {categories.map((c) => (
      <SelectItem key={c.id} value={c.id}>
        {c.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`product-form.tsx` :184-190 (W2)** →

```tsx
<Select name="status" defaultValue="draft">
  <SelectTrigger id="status">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {STATUS_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`product-edit-form.tsx` :331-343 (W3)** →

```tsx
<Select name="categoryId" defaultValue={product.categoryId ?? ""}>
  <SelectTrigger id="categoryId">
    <SelectValue placeholder="No category" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">No category</SelectItem>
    {categories.map((c) => (
      <SelectItem key={c.id} value={c.id}>
        {`${c.name}${!c.isActive ? " (inactive)" : ""}`}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`product-edit-form.tsx` :352-358 (W4)** →

```tsx
<Select name="status" defaultValue={product.status}>
  <SelectTrigger id="status">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {STATUS_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`create-plan-form.tsx` :51-60 (W5)** → (no `required` on the Root, per Open decision 2's recommendation; if Charlie picks native validation instead, move `required` onto `<Select>`, drop `aria-required`, and change the W5 test's first case to expect `checkValidity() === false`)

```tsx
<Select name="termMonths">
  <SelectTrigger id="termMonths" aria-required="true" className="w-auto">
    <SelectValue placeholder="Select term" />
  </SelectTrigger>
  <SelectContent>
    {availableTerms.map((t) => (
      <SelectItem key={t} value={String(t)}>
        {TERM_LABELS[t] ?? String(t)}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`create-plan-form.tsx` :84-90 (W6)** →

```tsx
<Select name="discountPct">
  <SelectTrigger id="discountPct" aria-required="true" className="w-auto">
    <SelectValue placeholder="Select %" />
  </SelectTrigger>
  <SelectContent>
    {DISCOUNT_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`edit-plan-form.tsx` :70-75 (W7)** →

```tsx
<Select name="discountPct" defaultValue={String(defaultDiscountPct)}>
  <SelectTrigger id={`discount_${planId}`} className="w-auto">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {DISCOUNT_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`checkout/_form.tsx` :268-276 (W8)** →

```tsx
<Select value={voucherId ?? ""} onValueChange={(v) => setVoucherId(v || null)}>
  <SelectTrigger aria-label="Voucher">
    <SelectValue placeholder="No voucher" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">No voucher</SelectItem>
    {availableVouchers.map((v) => (
      <SelectItem key={v.id} value={v.id}>
        {v.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`checkout/_form.tsx` :285-296 (W9)** →

```tsx
<Select value={selectedId} onValueChange={setSelectedId}>
  <SelectTrigger aria-label="Saved address">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {savedAddresses.map((a) => (
      <SelectItem key={a.id} value={a.id}>
        {`${a.label ? `${a.label} — ` : ""}${a.line1}${a.isDefault ? " (default)" : ""}`}
      </SelectItem>
    ))}
    <SelectItem value="new">Use a new address</SelectItem>
  </SelectContent>
</Select>
```

**`checkout/_form.tsx` :400-407 (W10)** →

```tsx
<Select value={address.state} onValueChange={(v) => setAddress((prev) => ({ ...prev, state: v }))}>
  <SelectTrigger id="addr-state" className={cn(fieldErrors.state && "border-destructive")}>
    <SelectValue placeholder="Select state…" />
  </SelectTrigger>
  <SelectContent>
    {STATE_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**`address-manager.tsx` :270-277 (W11)** →

```tsx
<Select value={form.state} onValueChange={(v) => setForm((p) => ({ ...p, state: v }))}>
  <SelectTrigger id="addr-state" className="mt-1">
    <SelectValue placeholder="Select state…" />
  </SelectTrigger>
  <SelectContent>
    {STATE_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 4: Delete the local copy** with `git rm apps/web/src/components/ui/select.tsx`. Then confirm that `grep -rn "components/ui/select" apps/web/src apps/web/tests` prints nothing.

- [ ] **Step 5: Check**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
pnpm --filter @bomy/web test tests/components/ui --run
```

Expected: clean, and every case in both Select test files passes. Then run the full web suite (`pnpm --filter @bomy/web test --run`); the only allowed failures are the 2 DATABASE_URL files.

- [ ] **Step 6: Commit (explicit paths)**: the 6 modified files, the deleted `apps/web/src/components/ui/select.tsx`, and `apps/web/tests/components/ui/select-forms.test.tsx`. Inspect the staged stat. Message: `refactor(web): move every Select onto @bomy/ui Select`.

---

### Task 4: Admin, tests first, then migrate and delete the local Select

**Files (all admin; every one of them stays OUT of web-only PR 4, see "PR 4 / PR 4b split"):** Modify `apps/admin/package.json`, `pnpm-lock.yaml` (Step 0); Create `apps/admin/tests/components/ui/select-forms.test.tsx`; Modify `apps/admin/src/app/users/role-selector.tsx`, `apps/admin/src/app/vouchers/page.tsx`; Delete `apps/admin/src/components/ui/select.tsx`.

- [ ] **Step 0: Stacked branch and admin's jsdom devDependency.** Task 3 must be committed and green first.

```bash
git status --short | grep -v '^??'          # expected: nothing (tracked tree clean)
git branch --show-current                    # expected: feat/bomy-ui-package-pr4
git switch -c feat/bomy-ui-package-pr4b-admin
```

Add `"jsdom": "^28.1.0"` to `devDependencies` in `apps/admin/package.json`, run `pnpm install`, then `grep -n "jsdom@" pnpm-lock.yaml | head -3` (expected: still `28.1.0`, no new download). **Also add `esbuild: { jsx: "automatic" }` to `apps/admin/vitest.config.ts`** (same reason as Task 3 Step 1b; admin's tsconfig is also `"jsx": "preserve"`; confirm with `grep jsx apps/admin/tsconfig.json`), and run the full admin suite once to confirm nothing else changes. Commit explicit paths: `git add apps/admin/package.json apps/admin/vitest.config.ts pnpm-lock.yaml`, message `chore(admin): add jsdom devDependency and automatic JSX for Select form tests`. All of Task 4's remaining commits go on `feat/bomy-ui-package-pr4b-admin`; `feat/bomy-ui-package-pr4` stays at the Task 3 tip until Task 5 Step 6 decides what happens next.

- [ ] **Step 1: Write the tests**

```tsx
// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const mocks = vi.hoisted(() => ({
  updateUserRole: vi.fn(),
  updateVoucherConfig: vi.fn(),
  triggerVoucherIssuance: vi.fn(),
  requireAdmin: vi.fn(),
  withAdmin: vi.fn(),
}))

vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/app/users/actions", () => ({ updateUserRole: mocks.updateUserRole }))
vi.mock("@/app/vouchers/actions", () => ({
  updateVoucherConfig: mocks.updateVoucherConfig,
  triggerVoucherIssuance: mocks.triggerVoucherIssuance,
}))
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }))
// The page only touches schema.* inside the withAdmin callbacks, which this mock never runs.
vi.mock("@bomy/db", () => ({
  schema: { platformConfig: {}, vouchers: {}, users: {} },
  withAdmin: mocks.withAdmin,
}))

import { RoleSelector } from "@/app/users/role-selector"
import VouchersPage from "@/app/vouchers/page"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateUserRole.mockResolvedValue({ ok: true })
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(ui: React.ReactNode) {
  await act(async () => {
    root.render(ui)
    await Promise.resolve()
  })
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el
}

async function typeahead(id: string, text: string) {
  const el = byId(id)
  el.focus()
  for (const key of text) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
  }
}

async function submit(f: HTMLFormElement) {
  await act(async () => {
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe("A1 RoleSelector", () => {
  it("sends the chosen role and keeps showing it after a successful save", async () => {
    await render(<RoleSelector userId="u-1" currentRole="buyer" />)
    await typeahead("role-u-1", "bomy_a")
    expect(byId("role-u-1").textContent).toBe("bomy_admin")
    const f = container.querySelector("form")
    if (!f) throw new Error("no form")
    await submit(f)
    expect(mocks.updateUserRole).toHaveBeenCalledWith("u-1", "bomy_admin")
    // With <form action>, React 19's post-action reset made Radix revert to "buyer" here.
    expect(byId("role-u-1").textContent).toBe("bomy_admin")
    expect(new FormData(f).get("role")).toBe("bomy_admin")
  })
})

describe("A2 VouchersPage type", () => {
  function config(type: string) {
    mocks.withAdmin
      .mockResolvedValueOnce([{ key: "voucher_monthly_type", value: type }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ rows: [], total: 0 })
  }

  it("posts the stored type, then the chosen one, and shows the saved type after revalidation", async () => {
    config("fixed_myr")
    await render(await VouchersPage({ searchParams: Promise.resolve({}) }))
    const f = byId("voucher-config-form")
    if (!(f instanceof HTMLFormElement)) throw new Error("no voucher form")
    expect(byId("voucher-type").textContent).toBe("Fixed MYR")
    expect(new FormData(f).get("type")).toBe("fixed_myr")

    await typeahead("voucher-type", "Pe")
    await submit(f)
    const call = mocks.updateVoucherConfig.mock.calls[0]
    if (!call) throw new Error("updateVoucherConfig not called")
    const fd: unknown = call[0]
    if (!(fd instanceof FormData)) throw new Error("not FormData")
    expect(fd.get("type")).toBe("percentage")

    // Simulates revalidatePath: the server component renders again with the saved value.
    config("percentage")
    await render(await VouchersPage({ searchParams: Promise.resolve({}) }))
    expect(byId("voucher-type").textContent).toBe("Percentage")
    expect(new FormData(f).get("type")).toBe("percentage")
  })
})
```

**An A2 test that cannot run is different from one that runs and fails.**

- **Runs and fails (red for a Select reason, or red after the migration):** stop and diagnose (superpowers:systematic-debugging). A red A2 test means the `key={currentType}` fix does not hold, which is the exact bug this PR exists to prevent. **Never delete, skip, or loosen a failing test.** Fix the code, or report the finding to Charlie and Bob; the admin migration does not merge until it is green.
- **Cannot run (`VouchersPage` cannot render under these mocks for a reason that has nothing to do with Select, such as an import that needs a server-only module):** do not widen the mocks beyond these modules. Remove only the A2 `describe`, record the exact error and the reason in the commit message body and in the PR body, and keep the A2 static check in Step 5. A2 then has **no automated coverage**, so Charlie's real Google-session check (Task 5 Step 6) is mandatory before the admin migration merges, and the admin migration follows the PR 4b path ("PR 4 / PR 4b split") unless that check has already passed.

- [ ] **Step 2: Run against the old Select**: `pnpm --filter @bomy/admin test tests/components/ui/select-forms.test.tsx --run`. Expected red: the typeahead steps do not change the value.

- [ ] **Step 3: Migrate `role-selector.tsx` (A1)**. Replace the whole file with:

```tsx
"use client"

import { type FormEvent, useTransition } from "react"
import { Save } from "lucide-react"

import { USER_ROLES, type UserRole } from "@bomy/db/types"

import { useToast } from "@/components/toaster"
import { Button } from "@bomy/ui/button"
import { Label } from "@bomy/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"
import { updateUserRole } from "./actions"

const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: r }))

export function RoleSelector({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  // Submitted via onSubmit rather than <form action>: React 19 resets a form after a function
  // action completes, and Radix Select reverts to its mount value on that reset, so the selector
  // would show (and a second Save would send) the old role after a successful save.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const role = new FormData(event.currentTarget).get("role") as UserRole
    startTransition(async () => {
      const res = await updateUserRole(userId, role)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Role updated to ${role}.`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Label htmlFor={`role-${userId}`} className="sr-only">
        Role
      </Label>
      <Select name="role" defaultValue={currentRole} disabled={pending}>
        <SelectTrigger id={`role-${userId}`} className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        variant="link"
        size="sm"
        icon={<Save />}
        className="text-xs"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Migrate `vouchers/page.tsx` :89-94 (A2)**. Swap the import as in Task 3, then:

```tsx
{
  /* key: remount when the saved type changes. React resets this form after the
                  server action, and Radix Select resets to the value it mounted with, so without
                  the key the trigger would show the pre-save type after a successful save. */
}
;<Select key={currentType} name="type" defaultValue={currentType}>
  <SelectTrigger id="voucher-type" className="w-auto">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {VOUCHER_TYPE_OPTIONS.map((o) => (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 5: Delete and check**

```bash
git rm apps/admin/src/components/ui/select.tsx
grep -rn "components/ui/select" apps/admin/src apps/admin/tests || true
grep -n "action=" apps/admin/src/app/users/role-selector.tsx || true
grep -n "key={currentType}" apps/admin/src/app/vouchers/page.tsx
pnpm --filter @bomy/admin typecheck
pnpm --filter @bomy/admin lint
pnpm --filter @bomy/admin test --run
```

Expected: the first two greps print nothing, the third prints one line, and everything is green (admin integration files skip without DB env, so report them as not evaluated).

- [ ] **Step 6: Mutation check (proves the tests bite; nothing is committed).** First back up both files to the scratchpad:

```bash
cp apps/admin/src/app/users/role-selector.tsx "$SCRATCH/role-selector.tsx.bak"
cp apps/admin/src/app/vouchers/page.tsx "$SCRATCH/vouchers-page.tsx.bak"
```

1. In `role-selector.tsx`, change `<form onSubmit={handleSubmit}` to `<form action={(fd) => { const role = fd.get("role") as UserRole; startTransition(async () => { await updateUserRole(userId, role) }) }}`. This is the old submission shape. Run the A1 test: it **must fail**, with the trigger reading `"buyer"`.
2. Restore the file: `cp "$SCRATCH/role-selector.tsx.bak" apps/admin/src/app/users/role-selector.tsx`.
3. **Only if the A2 test still exists** (it was not removed under the "cannot run" rule above): delete `key={currentType} ` from `vouchers/page.tsx` and run the A2 test: it **must fail** on `"Fixed MYR"`. If the A2 test was removed, skip items 3–4, and record "A2 mutation check skipped: A2 test cannot run (reason)" in the PR body.
4. Restore it (skip if item 3 was skipped): `cp "$SCRATCH/vouchers-page.tsx.bak" apps/admin/src/app/vouchers/page.tsx`.
5. Run `git diff --stat` to confirm only the intended Step 3–5 changes remain, then re-run the admin tests (green).

If a mutation that was run still passes, the test is not protecting the fix: stop and report. (A failed A2 assertion at any point blocks the admin migration; a test that cannot run is a disclosed gap, not a failure.)

- [ ] **Step 7: Commit (explicit paths)**: `role-selector.tsx`, `vouchers/page.tsx`, the deleted `apps/admin/src/components/ui/select.tsx`, and the new test file. Message: `refactor(admin): move Select onto @bomy/ui Select; fix post-save revert`.

---

### Task 5: Verify (both apps), then PR

- [ ] **Step 1: Full static checks:** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/ui typecheck`, `pnpm --filter @bomy/ui lint`. Report the not-evaluated files.

- [ ] **Step 2: Production builds of both apps:** `pnpm --filter @bomy/web build`, `pnpm --filter @bomy/admin build`. A2 renders client Select parts from a server component, so a client/server boundary mistake would surface here.

- [ ] **Step 3: Generated CSS** (dev server, `document.styleSheets`, both apps; print every selector, and a missing rule counts as a failure):
  - (a) Real rules exist for `animate-select-in`, `animate-select-out`, `rounded-input`, `w-auto`, and the Select-only `max-h-[--radix-select-content-available-height]`, which proves Tailwind scans `packages/ui`.
  - (b) **Reduced motion:** inside `@media (prefers-reduced-motion: reduce)` there are `[data-state="open"]` and `[data-state="closed"]` rules setting `animation: none`, ordered **after** the select-in/out rules. They are already present from PR 3; confirm they still match the Select content's classes.

  Admin's stylesheet can be read on its `/auth/sign-in` page without a session.

- [ ] **Step 3b: Opus integration review (read-only), before browser time.** Dispatch a fresh agent with `model: "opus"` (not a fork) over `git diff main..HEAD`, with this brief:
  - Review form semantics against §2, the Behaviour contract and the Review Focus.
  - Check every named Select still posts the same field name and value as before, `id` is on `SelectTrigger`, no `""` item lacks a matching placeholder, A1/A2 cannot revert after save, and nothing else in either app uses a function `action` around a Select.
  - Check the five primitive edits only.
  - **W8–W10 have no test and no browser check.** Read each rewritten checkout Select line by line: `value`/`onValueChange`, the `""` item and its matching placeholder, `id` on `SelectTrigger`, the `aria-label`s, the `useEffect` at `checkout/_form.tsx:111-120` that loads the saved address, and `validateShippingAddress` plus the `border-destructive` class on W10. Report anything you cannot confirm from the source as unverified.
  - Report findings only, no edits.

  Sonnet fixes accepted findings; then re-run Steps 1–3.

- [ ] **Step 4: Web browser, signed in as the seeded `seller_owner`** (Mailhog technique):
  1. `docker ps` shows postgres/redis/minio/mailhog.
  2. `docker exec bomy_postgres psql -U bomy -d bomy -c "select id, email, role from users where role='seller_owner' limit 3;"`
  3. Submit that email on `/auth/sign-in`.
  4. Extract the magic link from Mailhog's API (`curl -s "http://localhost:8025/api/v2/messages?limit=1"` with quoted-printable decode), and navigate to it.

  Playwright notes from PR 3: use `" "` for Space, not `"Space"`. Never dump `document.activeElement.textContent` while focus is on `<body>`, because the RSC payload holds the session; slice it instead.

  **The full Behaviour contract with real keys, on `/seller/dashboard/products/new` (Category, Status):**
  - Opening and moving: Enter/Space/ArrowDown/ArrowUp open; Home/End; typeahead open and closed.
  - Escape → `document.activeElement` is the trigger. **Tab is inert** while open.
  - Outside click closes, and does **not** click what was underneath (click a Save/submit button while a list is open and confirm no request is sent).
  - Label click focuses the trigger. The accessibility snapshot names each combobox "Category"/"Status".
  - **No end-of-animation jump:** record the content's `getBoundingClientRect().top` at ~50 ms, ~160 ms and ~400 ms after opening. The 160 ms and 400 ms values must be equal (a 4px difference means edit (d) did not take).
  - After closing: `body` has no `pointer-events` or overflow lock style left, and `document.elementFromPoint` over the old panel area returns page content.
  - Scroll lock: the page cannot scroll while open. For layout shift, first record `window.innerWidth - document.documentElement.clientWidth`. If it is 0 (macOS overlay scrollbars), set System Settings → Appearance → "Show scroll bars: Always", or report the shift check as **not evaluated**.

  **Per page:**
  - **W1/W2:** create a product named `PR4 select check <timestamp>` with category "Books"-equivalent and status Active. On its edit page (**W3/W4**), the triggers show that category and Active. Change category to "No category" and status to Draft, Save, reload, and the values persist.
  - **W5–W7** (`/seller/dashboard/subscriptions`, if a term is still available):
    - Submit Create with no term: **no browser validation bubble**, and the toast reads "Term must be 3, 6, or 12 months".
    - Create with 3 months / 7%, then edit its discount to 9% and reload.
    - Inline trigger widths are within a few px of the Task 0 baseline.
    - If no term is available, mark Create as not evaluated.
  - **W11** (`/account/addresses`): Add with state Pahang, save; Edit shows Pahang; Cancel → Add shows the placeholder.
  - **W8–W10** (`/checkout`): `checkout_enabled=false` locally, so the page shows only "Checkout is paused" and none of the three Selects render. Open `/checkout`, confirm that message, and record **W8–W10: not evaluated in a browser** (no baseline exists either, Task 0). Do not flip the flag. These three checks stay on the list for the real PSP smoke test, **when `checkout_enabled` is flipped per its runbook**, and the PR body says so:
    - The saved-address Select switches addresses; "Use a new address" clears the fields.
    - Submitting with no state shows the field error **and** the red trigger border.
    - The Voucher Select returns to "No voucher" and the totals update (needs a voucher to exist).
  - **Mobile:** at 390 px wide, emulate touch with `hasTouch` and tap-open/select one Select. It opens on tap, the selected item is applied, and nothing is selected by the tap that opened it.
  - Compare every page with the Task 0 screenshots; list any visual differences in the PR.
  - **Dev data written:** the PR4 product, the plan, and the address. List them for the session-end `bomy-check`, or delete them through the UI.

- [ ] **Step 4b: Production-build typeahead check (Bob v1 finding 1 and v2 correction; required).** An open Radix report ([radix-ui/primitives#4097](https://github.com/radix-ui/primitives/issues/4097)) describes a Select 2.3.7 typeahead failure after SWC minification. A local probe says BOMY's toolchain drops the reported call pattern, but it is **not reproduced or ruled out in BOMY's built app**, and jsdom/dev-server typing cannot show it. So test the production build.

  **Both apps set `output: "standalone"`, so `next start` is the wrong command** (Next's `output` docs say to run the generated `server.js` instead; I did not try `next start` here). Run the generated standalone server. This was verified on this repo (Next 15.5.15) on 2026-10-06: build, copy the static files, then start with the env file passed to Node. Three facts the verification found: (1) the standalone `server.js` does **not** read `.env.local`, so without the flag the app fails with `MissingSecret` and `makeDb: a database URL is required`; (2) `. apps/web/.env.local` in the shell fails to parse (line 26), so use Node's `--env-file`, not `source`; (3) a production-mode Auth.js needs `AUTH_TRUST_HOST=true` locally, or `/api/auth/session` fails with `UntrustedHost`. Neither app has a `public/` directory today; if one appears, also `cp -R apps/<app>/public apps/<app>/.next/standalone/apps/<app>/public`.

  Web (stop any dev server on 3000 first; `APP` is the absolute path of the `app/` directory):

  ```bash
  APP=/Users/charlie/Documents/Projects/BOMY/app
  pnpm --filter @bomy/web build
  mkdir -p "$APP/apps/web/.next/standalone/apps/web/.next/static"
  cp -R "$APP/apps/web/.next/static/." "$APP/apps/web/.next/standalone/apps/web/.next/static/"
  cd "$APP/apps/web/.next/standalone/apps/web"
  AUTH_TRUST_HOST=true PORT=3000 HOSTNAME=localhost node --env-file="$APP/apps/web/.env.local" server.js
  ```

  Expected: `Ready in …ms`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/products` prints `200`; `curl … http://localhost:3000/api/auth/session` prints `200`; one `/_next/static/chunks/<file>.js` prints `200`. `.next/` is gitignored; commit nothing from it. Admin is the same with `admin` for `web`, port `3002`, and `/auth/sign-in` as the page to curl. The copy is `mkdir -p` plus `cp -R …/static/. …/static/` so it is repeatable and deletes nothing (the earlier `rm -rf` was dropped on Bob's v3 review).
  1. Start the web standalone server as above and sign in again (Mailhog technique) as the seeded `seller_owner`.
  2. Open the edit page of the product created in Step 4 (`/seller/dashboard/products/<id>/edit`). Its Status Select has **Draft, Active, Archived** (`product-edit-form.tsx:33-37`), so a typed prefix can tell the right match from a wrong one.
  3. **Typeahead, closed trigger (Bob v2 timing + Bob v3 starting-item rule).** Radix keeps a search buffer that it clears after 1000 ms without typing, and **pressing the same letter again cycles to the next item that starts with it**: from Active, a lone `a` moves to Archived by itself. So a test that starts on Active and types `a` then `r` can pass even if `r` is broken. Therefore every case starts from a **known item (Draft)**, asserts the **intermediate** value after `a` (must be **Active**), and only then the value after `r` (must be **Archived**), with both keys inside one second. Browser-tool round trips take longer than one second, so run the keys and the reads inside **one** `browser_run_code_unsafe` call, using real Playwright keyboard presses (trusted key events), where each press and read takes milliseconds:

     ```js
     ;async (page) => {
       const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
       const trigger = page.getByRole("combobox", { name: "Status" })
       const read = async () => (await trigger.innerText()).trim()
       const out = {}
       await trigger.focus()
       await page.keyboard.press("d")
       await sleep(1500)
       out.startDraft = await read() // expect Draft
       await page.keyboard.press("a")
       out.afterA = await read()
       await sleep(1500) // expect Active
       await page.keyboard.press("d")
       await sleep(1500)
       out.startDraft2 = await read() // expect Draft
       await page.keyboard.press("a")
       out.afterA2 = await read() // expect Active
       await page.keyboard.press("r")
       out.afterAR = await read()
       await sleep(1500) // expect Archived
       return out
     }
     ```

     Expected: `startDraft` and `startDraft2` are `Draft`, `afterA` and `afterA2` are `Active`, `afterAR` is `Archived`. A result of `afterA2 = Archived` or `afterAR` not `Archived` is a **fail**.

  4. **Typeahead, open list, same rule.** From a known starting item, assert the intermediate highlight, then the final one, again in one call:

     ```js
     ;async (page) => {
       const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
       const trigger = page.getByRole("combobox", { name: "Status" })
       const read = async () => (await trigger.innerText()).trim()
       const hl = async () =>
         (await page.locator('[role="option"][data-highlighted]').innerText()).trim()
       const out = {}
       await trigger.focus()
       await page.keyboard.press("d")
       await sleep(1500) // value Draft
       await page.keyboard.press("Enter")
       await sleep(400) // open; highlight starts on the selected item
       out.openStart = await hl() // expect Draft
       await page.keyboard.press("a")
       out.openAfterA = await hl() // expect Active
       await page.keyboard.press("r")
       out.openAfterAR = await hl() // expect Archived
       await page.keyboard.press("Enter")
       await sleep(600)
       out.finalValue = await read() // expect Archived
       return out
     }
     ```

     Expected: `Draft`, `Active`, `Archived`, `Archived`. Then repeat both patterns on the Category Select, starting from its first item, with two seeded categories that share a first letter, if any exist (otherwise state that only Status was exercised).

  5. **Pass:** every expected value above appears in the production build. **Fail (any value, from a clean 1.5 s gap): do not merge.** Reproduce with the exact keystrokes and gaps, then fix in this PR (candidates, in order: pin `@radix-ui/react-select` to the last good version; a scoped minimizer exclusion; a local typeahead shim). Re-run Step 4b after the fix. Record the resolved Radix version and the result in the PR body.
  6. **Admin:** repeat the typeahead on the role Select at `/users` using the admin standalone server, only as part of Charlie's own Google-session run (Step 6). If that run does not happen, report admin production typeahead as **not evaluated**.
  7. Stop the production server (`lsof -ti:3000 | xargs kill`) and confirm port 3000 is clear. Step 5 follows.

- [ ] **Step 5: Stop dev servers.** Confirm ports 3000/3002 are clear.

- [ ] **Step 6: Admin browser check: Charlie only, and a MERGE GATE for the admin Select migration (Bob v1 finding 2).** No cookie minting (Global Constraints). Give Charlie these steps in the PR description and in chat:
  1. With Docker up, run `pnpm --filter @bomy/admin dev` (port 3002) and open `http://localhost:3002`. Sign in with your own Google account. This works only if local Google OAuth is configured for `localhost:3002` and your user is an admin in the local DB; otherwise this check stays not evaluated.
  2. **`/users`:** on a `@test.bomy` user, open the role Select with the keyboard (Enter), pick another role, and Save. Expect a success toast, the **trigger still showing the new role**, and the Role badge updating. Reload: it persists. Press Save again without changing anything: the role must not change back. Restore the original role.
  3. **`/vouchers`:** note the current type. Pick another type, fill its amount field, and click "Save Config". Expect "Voucher config saved." and **the trigger showing the new type** after the refresh. Reload: it persists. Restore the original config.
  4. Both triggers sit inline (not full width), and the list opens 4px below without a jump at the end of the animation.

  Report what Charlie saw.

  **Merge gate.** The A1 revert fix and the A2 `key` fix change what the admin saves, and A2's real Next ordering (data refresh vs form reset) was only simulated. The saved type and the second Save are unverified unless a real browser run passes. Decision, made once, here:
  - **Gate passes** (Charlie's own Google sign-in ran items 2 and 3 above and both behaved as expected): one PR. `git switch feat/bomy-ui-package-pr4 && git merge --ff-only feat/bomy-ui-package-pr4b-admin`, push `feat/bomy-ui-package-pr4`, open the single PR 4 (web + admin). **This also holds if Task 4's A2 test could not run** (the "cannot run" case): Charlie's passing real-browser check is what covers A2, and the PR body discloses "A2 has no automated coverage; covered by Charlie's passing real-browser check". A2 that **ran and failed** is never a pass.
  - **Gate not passed yet** (Google sign-in cannot be set up locally, or Charlie has not run it): **PR 4 is web-only**. Follow "PR 4 / PR 4b split" exactly: push and open only `feat/bomy-ui-package-pr4` (the Task 3 tip), keep `feat/bomy-ui-package-pr4b-admin` local or pushed but **unopened**, and open PR 4b after the check passes. Do not open or merge the admin change on "not evaluated" alone.
  - **Gate failed** (Charlie saw the role or voucher type revert, or a second Save sent the old value): the admin migration is a bug. Diagnose with superpowers:systematic-debugging on `feat/bomy-ui-package-pr4b-admin`; PR 4 still goes ahead web-only.
  - **Where fixes go (Bob v3).** Steps 3–6 run on `feat/bomy-ui-package-pr4b-admin` (the combined tip). If a step exposes a bug in **shared or web code** (`packages/ui`, `apps/web`, the web tests), the fix is committed on **`feat/bomy-ui-package-pr4`**, never on the child, so a web-only PR 4 cannot omit it. Then update the child (`git switch feat/bomy-ui-package-pr4b-admin && git rebase feat/bomy-ui-package-pr4`), re-run Steps 1–2 on both tips, and **re-run the gate steps the fix could affect** (Step 4b for primitive or web fixes; Step 6 for anything admin renders). Only admin-only fixes go on the child. Before choosing the path above, **prove the shared and web side is identical between the tips** with two executable checks (Bob v4: the lockfile must not be excluded blindly):

```bash
BASE=feat/bomy-ui-package-pr4; CHILD=feat/bomy-ui-package-pr4b-admin
# 1. Everything except admin and the lockfile must be byte-identical (exit 0, no output).
git diff --exit-code "$BASE" "$CHILD" -- packages/ui apps/web && echo "packages/ui + apps/web identical"
git diff --exit-code "$BASE" "$CHILD" -- . ':!apps/admin' ':!pnpm-lock.yaml' && echo "rest of tree identical (except admin + lockfile)"
# 2. The lockfile is checked separately, by importer block (not by diff context lines).
python3 - "$BASE" "$CHILD" <<'EOF'
import re, subprocess, sys, difflib
base, child = sys.argv[1], sys.argv[2]
def lock(rev):
    return subprocess.run(["git", "show", f"{rev}:pnpm-lock.yaml"], capture_output=True, text=True, check=True).stdout
def block(text, importer="apps/admin"):
    imp = re.search(r"^importers:\n(.*?)^packages:\n", text, re.S | re.M).group(1)
    return re.search(rf"^  {re.escape(importer)}:\n(.*?)(?=^  \S|\Z)", imp, re.S | re.M).group(1)
def changed(x, y):
    return [l for l in difflib.unified_diff(x.splitlines(), y.splitlines(), lineterm="", n=0)
            if l[:1] in "+-" and l[:3] not in ("+++", "---")]
a, b = lock(base), lock(child)
whole, admin = changed(a, b), changed(block(a), block(b))
print("apps/admin importer block changes:")
print("\n".join(admin) or "(none)")
print("whole-lockfile changed lines:", len(whole), "| inside the apps/admin importer block:", len(admin))
assert len(whole) == len(admin), "STOP: the lockfile changed outside the apps/admin importer block"
assert all(l.startswith("+") for l in admin), "STOP: a line was removed or replaced"
EOF
```

The first two commands must each print their "identical" line (a non-zero exit is a stop: something outside admin changed on the child). The script must print **only added lines (`+`)** inside the `apps/admin` importer block, expected to be `jsdom:`, `specifier: ^28.1.0` and `version: 28.1.0…` (plus a `devDependencies:` header line if the block had none), and must report **the same number for the whole lockfile and for the block**. That second equality is the rule: **the full lockfile diff contains nothing but the expected admin additions**. Tested on 2026-10-06: the script **as copied out of this plan** ran against `HEAD` vs `HEAD` (exit 0, 0 and 0); the same logic was run against this repo's real lockfile (it finds the 103-line `apps/admin` block), against a synthetic admin-only jsdom addition (4 and 4, passes) and against a synthetic admin + web change (8 and 4, the assertion stops it). That copy test also caught a variable mix-up in an earlier draft of this snippet (`block(child)` instead of `block(b)`); it is fixed. The real `+` lines have not been seen yet; confirm them on first use.
**Anything else (a `-` line, a hunk under `packages/ui:`, `apps/web:`, `packages:` or `snapshots:`, or a different version) means the child changed a shared or web dependency: stop, move that change to `feat/bomy-ui-package-pr4`, rebase the child, and re-run.** I have not run this check yet; the exact `+` lines are an expectation to confirm on first use, and a surprise is a stop, not something to explain away.

- In every case: mint no session, forge no cookie, and do not run the check against the production database.

- [ ] **Step 7: Push and open the PR** (single PR 4, or web-only PR 4 per Step 6; **re-run Steps 1–2 at the exact tip you push**, since a web-only tip differs from the combined tip). The body lists:
  - the inventory table (short form) and the per-call-site contract;
  - the §2 behaviour changes and their adaptations;
  - the five primitive edits, with the transform-snap reason;
  - the resolved Radix version and the reason for the pin (shipped as exact `2.3.3`; the original `^2.3.7` range resolved 2.3.8, which failed Step 4b);
  - the jsdom devDependency (web only in a web-only PR 4; admin's arrives with PR 4b);
  - **if web-only:** the sentence "The admin Select migration (`role-selector.tsx`, `vouchers/page.tsx`, admin `select.tsx` deletion, admin jsdom devDependency) is deferred to PR 4b because Charlie's real Google-session check has not yet passed", and the PR 4b link or branch name;
  - the Step 4b production-build typeahead result with the resolved Radix version;
  - Open decision outcomes;
  - the A1 bug class (function action + Radix reset) and its tests, including the mutation check;
  - everything verified;
  - everything **not** verified:
    - admin browser, unless Charlie ran it;
    - A2 real Next ordering (RSC vs reset), unless Charlie ran it;
    - the A2 pre-hydration limitation;
    - **checkout W8 (voucher), W9 (saved address), W10 (state): not evaluated** (no test and no browser check; the page is paused locally; verified only by typecheck, lint, builds and the Opus line-by-line review), to be run at the PSP smoke test;
    - the layout-shift check, if overlay scrollbars;
    - the two DATABASE_URL web files and the skipped admin integration files.

  Mention the Opus review outcome. Keep `products/loading.tsx` and the untracked `docs/` files out.

---

### Task 6: PR log entry, AFTER the PR merges

Write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr4.md`, where `<N>` is the actual merged PR number (check it against the highest existing `_PR<N>_` file). `log/` is gitignored: write the file but do **not** commit it. Update `.andy/handoff.md` §0. **If PR 4 merged web-only:** the log says so, and §0 shows "PR 4 (#N) web ✔; PR 4b (admin Select) pending Charlie's Google-session check on `feat/bomy-ui-package-pr4b-admin`"; PR 4b gets its own log file (`_PR<M>_bomy-ui-package-pr4b-admin.md`) when it merges. **If PR 4 merged with admin:** §0 shows PR 4 done; PR 5 next.

---

## PR 4 / PR 4b split (Bob v2 finding 2)

Why a split exists: admin's migration changes what two admin forms save, and its real-Next behaviour can only be confirmed by Charlie's own Google sign-in. The plan never merges that part on "not evaluated" alone. So the work is built on two **stacked branches** from the start, and Task 5 Step 6 picks the path.

**Branches.**

- `feat/bomy-ui-package-pr4` (Tasks 0–3): the `Select` primitive, the web migration, the web jsdom devDependency. **Web-only PR 4 tip = the last Task 3 commit.**
- `feat/bomy-ui-package-pr4b-admin` (Task 4): created from the Task 3 tip (Task 4 Step 0), and holds every admin change.

**Stays OUT of web-only PR 4 (all on `feat/bomy-ui-package-pr4b-admin`):**

- `apps/admin/package.json` (the admin `jsdom` devDependency; the matching `pnpm-lock.yaml` hunk is its own commit in Step 0, and the lockfile hunk from Task 1/2 covers `packages/ui` and `apps/web` only);
- `apps/admin/tests/components/ui/select-forms.test.tsx` (the A1/A2 tests);
- `apps/admin/src/app/users/role-selector.tsx` (A1) and `apps/admin/src/app/vouchers/page.tsx` (A2);
- the deletion of `apps/admin/src/components/ui/select.tsx` (it stays in place, unchanged, until PR 4b; admin keeps its old Select, and both implementations coexist harmlessly because admin's Tailwind scans `packages/ui` but nothing in admin imports the new one yet).

**How PR 4b branches from PR 4.** It is already stacked on the Task 3 tip. After web-only PR 4 is squash-merged to `main`, move PR 4b onto the new `main`:

```bash
git fetch origin
git rebase --onto origin/main feat/bomy-ui-package-pr4 feat/bomy-ui-package-pr4b-admin
```

(`feat/bomy-ui-package-pr4` here is the old pre-squash tip, so only the Task 4 commits move.) **The command is correct only if both guards hold (Bob v3):** (1) the local `feat/bomy-ui-package-pr4` ref still exists at its pre-squash tip, so **do not delete, reset, or fast-forward it after the squash-merge until the rebase is done**; (2) the worktree is clean (`git status --short | grep -v '^??'` prints nothing). Afterwards `git log --oneline origin/main..feat/bomy-ui-package-pr4b-admin` must list only the Task 4 commits; if it lists more, stop. Then re-run Task 5 Steps 1–2 for the admin side, push, and open PR 4b only after Charlie's check passes (Step 6). Its body repeats the A1/A2 bug-class write-up, the mutation-check result, and the check's outcome.

**What changes in the other documents if the split happens:**

- **Spec** (`docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` §PR 4): add one sentence, committed on `feat/bomy-ui-package-pr4` before opening, in **pending** language: "Admin's Select migration is pending as PR 4b, subject to Charlie's Google-session verification; PR 4 covers the primitive and the web app." When PR 4b merges, replace it with "Admin's Select migration shipped as PR 4b (#M)."
- **PR body (PR 4):** the deferral sentence and branch name (Step 7); the verified/not-verified list says admin Select is unchanged in this PR, not "not evaluated".
- **Log:** one log for PR 4 (web-only) and a second log for PR 4b (Task 6).
- **Handoff §0:** roadmap reads "PR 4 (#N) web ✔, PR 4b (admin Select) pending Charlie's check"; record the branch name, the rebase command above, and the exact check steps.
- **PR 5 order:** PR 5 (page-level consistency audit) may start after web-only PR 4 merges. Its admin audit **excludes `/users` and `/vouchers`** (the two Select pages) until PR 4b merges, so the audit never measures against the old admin Select. **PR 5 cannot be marked complete (in the PR body, the log, or the handoff) until those two deferred admin pages are audited**, in PR 4b itself or in a follow-up commit after it merges.

## Bob v2 review (folded into v3)

| #   | Sev    | Finding                                                                                                                     | Disposition                                                                                                                                                                                                                             |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium | Step 4b typed `a` then `ar`, which sends the buffer `aar`; and `next start` is the wrong command for `output: "standalone"` | **Task 5 Step 4b** rewritten: `a` then `r` within 1 s, 1.5 s gaps between cases; verified standalone commands (build, copy `.next/static`, `AUTH_TRUST_HOST=true`, `node --env-file=… server.js`) for web and admin                     |
| 2   | Medium | The fallback conflicted with the mandatory A2 mutation test if that test is removed; PR 4b path not executable              | New section above; Task 2 no longer touches admin files; Task 4 Step 0 creates the stacked branch and takes the admin jsdom devDependency; A2 "cannot run" vs "runs and fails" rule in Task 4; Task 5 Step 6 decision tree; Task 6 logs |
| 3   | Low    | Line 3 repeated the approval instruction and ended with an unmatched `**`                                                   | Rewritten                                                                                                                                                                                                                               |

## Bob v3 review (folded into v4)

Bob confirmed the standalone startup instructions and line 3 are fixed, and that `git rebase --onto origin/main feat/bomy-ui-package-pr4 feat/bomy-ui-package-pr4b-admin` is correct if the old PR 4 base ref is retained and the worktree is clean.

| #   | Sev    | Finding                                                                                                      | Disposition                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium | Typeahead could pass while `r` is broken: the second `a` cycles Active → Archived by itself                  | Task 5 Step 4b items 3–4: start from Draft, assert **Active after `a`**, then **Archived after `r`**, in one `browser_run_code_unsafe` call (keys and reads inside the 1 s window); same from a known item in the open list                                                                                                                                 |
| 2   | Medium | The gate runs on the admin child branch; a shared/web fix could be omitted from a web-only PR 4              | Task 5 Step 6 "Where fixes go": shared/web fixes are committed on `feat/bomy-ui-package-pr4`, the child is rebased onto it, Steps 1–2 re-run on both tips, affected gate steps re-run; `git diff --exit-code` checks prove the shared and web side is identical before the path is chosen (superseded in v5 by the lockfile-aware check, see Bob v4 review) |
| 3   | Medium | The A2 mutation check was mandatory after A2 could be removed; Step 6 gave conflicting outcomes              | Mutation check items 3–4 are conditional on the A2 test existing; failed A2 blocks; "cannot run" is a disclosed gap that a passing browser check covers; gate bullets rewritten                                                                                                                                                                             |
| 4   | Low    | `rm -rf` in standalone setup                                                                                 | Replaced with `mkdir -p` + `cp -R src/. dest/` (repeatable, deletes nothing)                                                                                                                                                                                                                                                                                |
| 5   | Low    | Spec instruction should use pending language for PR 4b; PR 5 not complete until deferred admin pages audited | Spec sentence rewritten as pending; PR 5 completion rule added; rebase guards added                                                                                                                                                                                                                                                                         |

## Bob v4 review (folded into v5)

Bob closed all five v3 findings and confirmed the stacked rebase command with its guards. One Medium remained.

| #   | Sev    | Finding                                                                                                                 | Disposition                                                                                                                                                                                                                                                                                   |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium | The branch parity check excluded the whole lockfile, so a child-only shared or web dependency change could go unnoticed | Task 5 Step 6 "Where fixes go": `git diff --exit-code BASE CHILD -- packages/ui apps/web` and `-- . ':!apps/admin' ':!pnpm-lock.yaml'` (both must pass), plus a separate lockfile check that allows only the added `jsdom` entry inside the `apps/admin:` importer and stops on anything else |

## Bob v5 review (folded into v6)

Bob found the two `git diff --exit-code` checks sound, and one problem in the lockfile inspection.

| #   | Sev    | Finding                                                                                                                            | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium | `git diff -U8` cannot show which importer owns the added `jsdom` lines (the `apps/admin:` header is farther than eight lines away) | Replaced by an importer-block script: it extracts the `apps/admin` importer block from both revisions, prints that block's changes, and asserts (a) the whole-lockfile changed-line count equals the block's count, and (b) every block change is an addition. This keeps the rule that the full lockfile diff contains only the expected admin additions. The block now sits at column 0 so the heredoc and Python copy out cleanly. |

## Post-v6 correction (Task 0 findings, 2026-10-06)

Task 0 found that `/checkout` renders only "Checkout is paused" locally, so the plan's assumption that W8–W10 are browser-verifiable (and that the checkout form shows an "error banner after address validation") was wrong. Charlie kept `checkout_enabled=false`. The plan previously said W8–W10 were "covered in the browser", and Bob noted it must not claim jsdom coverage either. Changes: Task 0 records the missing checkout baseline; Task 3 Step 1 and Task 5 Step 4 now say W8–W10 are **not evaluated** (no test, no browser check); Task 5 Step 3b adds a line-by-line Opus review of them; Task 5 Step 7 lists them under "not verified"; the Behaviour contract lines and Review Focus row carry the same disclosure. Adding focused checkout tests (cart context plus the preview action) was considered and not planned: it is a larger task than this PR's scope, and the three Selects are controlled with no `name` (nothing posts through FormData).

## Bob v1 review (folded into v2)

Bob agreed with all four open-decision picks and requested two changes (both Medium), both now in Task 5:

| #   | Finding                                                                                                                                                                | Disposition                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Typeahead was only tested in jsdom and the dev server; radix-ui/primitives#4097 reports a Select 2.3.7 typeahead failure after SWC minification (unreproduced in BOMY) | **Task 5 Step 4b**: production-build browser check with a distinguishing sequence (`a` → Active vs `ar` → Archived on the product edit Status Select); a failure blocks merge and requires a fix |
| 2   | Dropping the A2 test and leaving admin untested would leave the saved voucher type and second-save behaviour unverified                                                | **Task 5 Step 6** is now a merge gate; fallback is splitting the admin migration into PR 4b rather than merging it unverified                                                                    |

## Open decisions (Charlie/Bob)

1. **Call-site API: migrate every consumer to shadcn's compositional API (recommended), or keep an options-based local `Select` wrapper per app.** The recommendation follows the spec ("replace … with the real shadcn Select") and PR 1's no-shim convention. The cost is about 13 verbose call sites. A wrapper would centralise the placeholder-equals-empty-label rule, but it would be a second Select API to maintain.
2. **W5/W6 `required`: keep today's behaviour (recommended) or turn on native validation.** Today, nothing blocks an empty submit and the server answers with an error toast. Radix's native `required` would block the submit, but it moves focus to a 1px `aria-hidden` select (E1), which is poor for keyboard and screen-reader users. Recommended: `aria-required` on the trigger only.
3. **Motion: drop the per-item `select-item-in` stagger (recommended), keep `select-in`/`select-out` on the panel.** The spec left this for this PR. Radix renders the items, so a stagger would need per-item inline delays. The panel animation matches PR 3's menus. The keyframe stays in config for `stepper.tsx`.
4. **Admin browser coverage: Charlie runs Task 5 Step 6 himself, and it is a merge gate** (Bob v1: required, not just recommended). If it cannot run, the admin migration splits into PR 4b (Task 5 Step 6 fallback); the admin Select change is never merged on "not evaluated" alone.

Decided here, not open: `^2.3.7` pin (superseded 2026-10-07 by the exact `2.3.3` pin); A1 → `onSubmit`, A2 → `key`; `aria-label`s on W8/W9; `w-auto` on inline triggers; the five primitive edits; the A2 pre-hydration limitation accepted and documented.

## Model split

- **Opus:** the Radix form-semantics analysis and experiments (done in this plan, v1); the read-only integration review of the full diff (Task 5 Step 3b, as a fresh `model: "opus"` agent).
- **Sonnet:** Task 1's scripted copy, the test files, the call-site edits, the static checks, and the browser run; it also fixes review findings.
- Haiku is not needed. Fable is not planned (it needs Charlie's explicit go).

## Self-review (against the spec and this plan)

- **Spec coverage:** "Add `@radix-ui/react-select` to `packages/ui`" is Task 1. "Replace both apps' hand-rolled `select.tsx` with the real shadcn Select" is Tasks 3–4 (both files deleted, no shim). "Form behaviour needs explicit testing in both apps, not just a visual check" is covered by Task 2 (primitive contract), Task 3 (web forms through their real submit handlers), Task 4 (admin forms, including the revert bug), plus the browser steps. Spec § Motion's open `select-*` keyframes call is Open decision 3. The spec's per-PR verification commands are in Task 5 Step 1.
- **Placeholders:** none in the code steps. `SCRATCH` must be exported by the executing session (Task 1 Step 1 aborts if it is unset), so the plan carries no session-specific path. Task 4 Step 6 reuses it.
- **Type consistency:**
  - `SelectTrigger` gets `id`/`aria-label`/`aria-required`/`className`; `Select` gets `name`/`value`/`defaultValue`/`onValueChange`/`disabled`. All are typed by `ComponentPropsWithoutRef` on the Radix parts.
  - `sideOffset = 4` is typed through Content props (dry-run `tsc` clean under the repo flags).
  - Test helpers narrow `HTMLElement`/`HTMLFormElement`/`FormData` explicitly for `noUncheckedIndexedAccess`.
  - `ProductEditForm` test props match its `Product`/`Variant[]`/`Category` types (`product-edit-form.tsx:50-71`).
- **Review Focus → tests:**

  | Review Focus item                    | Covered by                                                                               |
  | ------------------------------------ | ---------------------------------------------------------------------------------------- |
  | A1 revert                            | Task 4 A1 test + mutation check                                                          |
  | A2 key                               | Task 4 A2 test + mutation check (jsdom) + Charlie's check                                |
  | Empty-value items                    | Task 2 + W3 test                                                                         |
  | FormData without interaction         | W1/W2/W3/W4/W7 tests                                                                     |
  | `required`                           | W5 test (`checkValidity`, `aria-required`)                                               |
  | Labels                               | browser accessibility snapshot + trigger ids used by every test                          |
  | Widths / animation jump / modal      | browser only (stated)                                                                    |
  | Typeahead after minification (#4097) | Task 5 Step 4b (production build, real keys)                                             |
  | Checkout W8–W10 wiring               | **none** (paused locally; no test); Opus line-by-line review, disclosed as not evaluated |
  | Old-DOM tests                        | none exist                                                                               |

- **Could not verify while planning (stated in the plan where relevant):**
  - Real Next.js ordering of RSC refresh vs form reset for A2. **Inferred** from E4/E5 plus React's documented reset; Charlie's check covers it.
  - Whether local Google OAuth works on `localhost:3002`. **Inferred**: unknown.
  - `ProductEditForm` mounting in jsdom. A fallback is given.
  - iOS Safari behaviour. Radix custom listbox on touch is **inferred** from source (`:204-216`); only Chromium touch emulation is planned.
