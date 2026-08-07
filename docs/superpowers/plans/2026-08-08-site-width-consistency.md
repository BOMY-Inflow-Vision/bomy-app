# Site-Wide Content-Width Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix content-width inconsistencies across `apps/web` — same-page mismatches, cross-page
family drift (tabs/sidebars/funnels that visibly resize as a user navigates), and one real
design-system gap (checkout) — following a width policy grounded in the design system's own
`ui_kits/` screen mockups plus Charlie's explicit decisions for the gaps those mockups don't cover.

**Architecture:** Pure Tailwind className changes plus two structural moves: (a) the account tab
family gets a unified outer shell so `AccountTabs` renders at a stable width regardless of which
tab is active, and (b) the seller dashboard's width contract moves from ad-hoc per-page classes to
the shared layout, so every sidebar item inherits the same content width instead of each page
deciding independently.

**Tech Stack:** Tailwind CSS 3.4, Next.js App Router (Server Components).

## Global Constraints

- **This is a scoped, confirmed list — do not extend it to other pages found in the earlier audit
  that Charlie explicitly excluded:**
  - `about/page.tsx` — **do not touch.** The hero's `max-w-4xl` vs. the other text sections'
    `max-w-3xl` is an intentional hierarchy choice (headline vs. body/CTA), not drift. Confirmed by
    Charlie: "forcing the hero down to 3xl would be false uniformity."
  - `products/[storeSlug]/[productSlug]/page.tsx`'s nested `max-w-3xl` description inside its own
    `max-w-5xl` shell — **do not touch.** This matches
    `docs/design-system/ui_kits/buyer_site/ProductScreen.jsx.txt:48`
    (`maxWidth: "48rem"` nested inside `--container-content`) exactly. The original audit flagged
    this as an inconsistency; it is spec-correct, not a bug.
  - `(marketing)/membership/manage/page.tsx` — **do not touch.** Already `max-w-lg`, matching
    `(marketing)/membership/page.tsx` exactly (verified directly against source, not assumed).
  - Brand-subscribe funnel (`brands/[slug]/subscribe/page.tsx` and its `success/poller.tsx`) —
    **do not touch.** Different content shapes across the two steps (a 3-column plan-picker grid
    vs. a single confirmation card) — not the same class of drift as the account/seller-dashboard
    cases. Confirmed by Charlie: "keep it out unless you later do a dedicated subscription-flow
    retheme pass."
  - Legal pages (`terms`, `privacy`, `refund`, `shipping`, `contact`, via `legal-page-layout.tsx`)
    — **do not touch.** Already `max-w-3xl`, confirmed correct as a narrow reading column.
- **Width policy for what this plan DOES touch**, source cited per value:
  - Checkout: `--container-wide` / `max-w-6xl` — per
    `docs/design-system/ui_kits/buyer_site/CheckoutScreen.jsx.txt:78`. Real gap: current code is
    `max-w-3xl`. Fix even though `checkout_enabled` is currently `false` — this is a layout-only
    value fix, not new checkout functionality.
  - Membership success poller cards: `max-w-lg` — matching `(marketing)/membership/page.tsx` and
    `manage/page.tsx`, both already `max-w-lg`. The poller's 3 render branches are the only drift
    in that family (currently `max-w-md`).
  - Seller-apply cards: `max-w-lg` — Charlie's explicit auth-family policy ("lg for consent and
    seller apply"). `auth/consent/page.tsx` is already `max-w-lg` (no change needed there);
    `auth/sign-in/page.tsx` and `auth/verify-request/page.tsx` are already `max-w-sm` (no change
    needed — verified directly against source).
  - Account tab family: unified `max-w-5xl` **outer shell** (Charlie: "5xl shell, with narrower
    inner content where needed") — each page's own content keeps its previously-reasonable width
    nested inside that shell (Profile → `max-w-md`, Subscriptions → `max-w-2xl`, Addresses →
    `max-w-2xl`; Orders already reasonably fills the wider shell with no extra inner cap needed).
  - Seller dashboard: unified `max-w-6xl` **at the layout level**, not per-page (Charlie: "one
    layout-level 6xl content contract; don't patch each page independently").
- **Do not fix the seller-dashboard sidebar's hardcoded `bg-slate-800`/`bg-slate-700` colors** —
  real, but a separate retheme concern (matching `docs/design-system`'s navigation retheme, not a
  width issue), out of scope here. Noted in Follow-ups.
- **No `docs/design-system/` edits.** Every prior retheme PR has kept reference-bundle edits fully
  separate (down to a one-line typo fix getting its own PR, #121).

---

### Task 1: Checkout — fix the real design-system width gap

**Files:**

- Modify: `apps/web/src/app/checkout/page.tsx`

**Interfaces:**

- Consumes: nothing new (Tailwind's stock `max-w-6xl`, already used elsewhere).
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat apps/web/src/app/checkout/page.tsx
```

- [ ] **Step 2: Change both `max-w-3xl` occurrences to `max-w-6xl`**

There are two render branches (the `checkout_enabled=false` placeholder, and the real form) — both
currently:

```tsx
<main className="mx-auto max-w-3xl px-4 py-8">
```

Change both to:

```tsx
<main className="mx-auto max-w-6xl px-4 py-8">
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/checkout/page.tsx
git commit -m "fix(web): widen checkout to max-w-6xl, matching the design system

docs/design-system/ui_kits/buyer_site/CheckoutScreen.jsx.txt specifies
--container-wide (max-w-6xl) for checkout; the live page was max-w-3xl.
Layout-only fix — checkout_enabled stays false, no functional change."
```

---

### Task 2: Membership success poller — align to the family's max-w-lg

**Files:**

- Modify: `apps/web/src/app/(marketing)/membership/success/poller.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat "apps/web/src/app/(marketing)/membership/success/poller.tsx"
```

- [ ] **Step 2: Change all 3 occurrences of `max-w-md` to `max-w-lg`**

All three render branches currently have:

```tsx
<Card className="w-full max-w-md rounded-2xl text-center">
```

Change all three to:

```tsx
<Card className="w-full max-w-lg rounded-2xl text-center">
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(marketing)/membership/success/poller.tsx"
git commit -m "fix(web): match membership success card width to the rest of the funnel

membership/page.tsx and membership/manage/page.tsx both use max-w-lg;
the success poller's 3 states were max-w-md, visibly shrinking the
card mid-funnel for no content reason."
```

---

### Task 3: Seller apply — align to max-w-lg per the auth-family policy

**Files:**

- Modify: `apps/web/src/app/seller/apply/page.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat apps/web/src/app/seller/apply/page.tsx
```

- [ ] **Step 2: Change both `max-w-md` occurrences to `max-w-lg`**

Two branches — the "already applied" confirmation card and the main form card — both currently:

```tsx
<div className="w-full max-w-md rounded-2xl bg-background p-8 shadow-sm ring-1 ring-border ...">
```

(exact trailing classes differ slightly between the two — only change `max-w-md` to `max-w-lg` in
each, leave every other class as-is.)

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

- [ ] **Step 4: Real browser check (this page has a live Turnstile widget and a multi-field form —
      worth a visual confirm, not just a class-name diff)**

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
pnpm --filter @bomy/web dev
```

Open `http://localhost:3000/seller/apply`, confirm the form card is visibly wider than before but
still reads as a normal centered form (not stretched thin), and that all fields/labels/the submit
button still render correctly. Stop the dev server after (`lsof -ti:3000 | xargs kill`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/seller/apply/page.tsx
git commit -m "fix(web): widen seller-apply card to max-w-lg

Matches the auth-family policy (sm for sign-in/verify-request, which
are already correct; lg for consent, already correct, and seller-apply,
which was still max-w-md — a form with 6 fields needs more room than
a simple button-only card)."
```

---

### Task 4: Account tab family — unified max-w-5xl shell

**Files:**

- Modify: `apps/web/src/app/account/account-tabs.tsx`
- Modify: `apps/web/src/app/account/page.tsx`
- Modify: `apps/web/src/app/account/subscriptions/page.tsx`
- Modify: `apps/web/src/app/account/orders/page.tsx`
- Modify: `apps/web/src/app/account/addresses/page.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: a consistent `AccountTabs` embedding contract (rendered directly inside a
  `px-4`-padded `max-w-5xl` main on all 4 pages) — nothing later depends on this, but keep the
  contract identical across all 4 files so a future 5th tab doesn't reintroduce drift.

- [ ] **Step 1: Read all 5 current files to confirm nothing has drifted**

```bash
cat apps/web/src/app/account/account-tabs.tsx
cat apps/web/src/app/account/page.tsx
cat apps/web/src/app/account/subscriptions/page.tsx
cat apps/web/src/app/account/orders/page.tsx
cat apps/web/src/app/account/addresses/page.tsx
```

- [ ] **Step 2: Simplify `AccountTabs`' negative-margin hack**

`account-tabs.tsx` currently has:

```tsx
<nav aria-label="Account sections" className="flex border-b border-border mb-6 -mx-8 px-8">
```

The `-mx-8 px-8` was written assuming `AccountTabs` is always nested inside a `p-8`-padded `Card`
(true today only for `account/page.tsx` and `account/subscriptions/page.tsx` — `orders/page.tsx`
and `addresses/page.tsx` already render it directly inside a `px-4` main with no such padding to
counteract, so the hack has been silently wrong for those two already). After Step 3 below, all 4
pages render `AccountTabs` directly inside a plain `px-4`-padded `main` — so drop the hack
entirely:

```tsx
<nav aria-label="Account sections" className="flex border-b border-border mb-6">
```

- [ ] **Step 3: Restructure `account/page.tsx` to the shared shell**

Replace:

```tsx
  return (
    <main className="flex min-h-screen items-start justify-center bg-muted pt-16">
      <h1 className="sr-only">My Account</h1>
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="p-8">
          <AccountTabs active="profile" />
          <div className="flex items-center gap-4">
```

with:

```tsx
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="sr-only">My Account</h1>
      <AccountTabs active="profile" />
      <div className="mx-auto max-w-md">
        <Card className="shadow-sm">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
```

...and correspondingly close **two** extra levels (the new `<div className="mx-auto max-w-md">`
and the `<Card>`/`<CardContent>` that used to wrap everything but now wraps only the identity
block) at the bottom of the function, immediately before the existing `</main>`:

```tsx
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
```

Read the full file after editing to confirm every JSX tag still closes correctly — this is a
structural indentation change, not just a class swap; a mismatched closing tag will fail
typecheck/build, and you must fix it before moving on, not skip ahead.

- [ ] **Step 4: Restructure `account/subscriptions/page.tsx` identically, with `max-w-2xl` for the
      inner content instead of `max-w-md`**

Same restructuring pattern as Step 3: outer becomes `mx-auto max-w-5xl px-4 py-8`, `AccountTabs`
renders directly (not nested in the Card), and the existing `Card` (currently
`w-full max-w-2xl shadow-sm`) becomes `shadow-sm` only, wrapped in a new
`<div className="mx-auto max-w-2xl">` sibling to `AccountTabs`, preserving its original width.

- [ ] **Step 5: Widen `account/orders/page.tsx`'s shell — value-only change, no restructuring**

This page already uses the correct shell _pattern_ (`AccountTabs` directly inside a plain `mx-auto`
main) — just the wrong value. Find:

```tsx
    <main className="mx-auto max-w-4xl px-4 py-8">
```

Change to:

```tsx
    <main className="mx-auto max-w-5xl px-4 py-8">
```

No inner width cap needed — the order-group cards benefit from the full shell width, matching how
`docs/design-system/ui_kits/buyer_site/ProductScreen.jsx.txt` uses its full `--container-content`
width for substantive content (not just prose).

- [ ] **Step 6: Widen `account/addresses/page.tsx`'s shell and add an inner cap for the form/list**

Find:

```tsx
    <main className="mx-auto max-w-2xl px-4 py-8">
      <AccountTabs active="addresses" />
      <h1 className="mb-6 text-2xl font-bold text-foreground">Saved addresses</h1>
      <AddressManager
```

Change to (widen the shell to 5xl for tab-bar consistency, keep the actual address list/form at
its original, more form-appropriate width via a new inner wrapper):

```tsx
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AccountTabs active="addresses" />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Saved addresses</h1>
        <AddressManager
```

...and close the new `<div>` right before the existing `</main>`.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

- [ ] **Step 8: Real browser check — this task restructures JSX nesting in 2 files (Steps 3–4), a
      typecheck pass alone doesn't prove the visual result is right**

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
pnpm --filter @bomy/web dev
```

Sign in, then visit all 4 tabs (`/account`, `/account/subscriptions`, `/account/orders`,
`/account/addresses`). Confirm:

- The tab bar itself sits at the same horizontal position and width on all 4 pages (no
  shrink/reflow when switching tabs).
- Profile's identity card and Subscriptions' card still look like reasonably-narrow centered
  cards, not stretched to the full 5xl shell.
- Orders' list and Addresses' form/list still render correctly with no broken layout.

Stop the dev server after (`lsof -ti:3000 | xargs kill`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/account/account-tabs.tsx apps/web/src/app/account/page.tsx apps/web/src/app/account/subscriptions/page.tsx apps/web/src/app/account/orders/page.tsx apps/web/src/app/account/addresses/page.tsx
git commit -m "fix(web): unify the account tab family on a shared max-w-5xl shell

Profile (max-w-md card), Subscriptions (max-w-2xl card), Orders
(max-w-4xl plain), and Addresses (max-w-2xl plain) each picked their
own page width independently, so the shared AccountTabs bar visibly
resized/rejustified when switching tabs. All 4 now share one
mx-auto max-w-5xl px-4 py-8 shell with AccountTabs rendered directly
(not nested in a Card) at a consistent position; each page's own
content keeps a narrower inner wrapper where the content genuinely
doesn't need the full shell width (Profile, Subscriptions, Addresses).
Also dropped AccountTabs' -mx-8 px-8 negative-margin hack, written for
a p-8 Card parent that no longer exists anywhere it's used (and was
already silently wrong for Orders/Addresses, which never had one)."
```

---

### Task 5: Seller dashboard — layout-level max-w-6xl contract

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/layout.tsx`
- Modify: `apps/web/src/app/seller/dashboard/orders/page.tsx`
- Modify: `apps/web/src/app/seller/dashboard/orders/[orderId]/page.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: a layout-level width contract every current and future `seller/dashboard/*` page
  inherits automatically — later pages should NOT add their own `max-w-*`/`mx-auto` to their
  top-level wrapper; just use `p-8` (or whatever padding that page needs) and let the layout handle
  width.

- [ ] **Step 1: Read the current layout and both order pages to confirm nothing has drifted**

```bash
cat apps/web/src/app/seller/dashboard/layout.tsx
cat apps/web/src/app/seller/dashboard/orders/page.tsx
cat "apps/web/src/app/seller/dashboard/orders/[orderId]/page.tsx"
```

- [ ] **Step 2: Add the width contract to the layout**

Find:

```tsx
<main className="flex-1 bg-muted">{children}</main>
```

Change to:

```tsx
<main className="flex-1 bg-muted">
  <div className="mx-auto max-w-6xl">{children}</div>
</main>
```

- [ ] **Step 3: Remove the now-redundant per-page width constraint from the Orders list**

Find:

```tsx
    <div className="mx-auto max-w-5xl px-4 py-8">
```

Change to (padding only — width now comes from the layout):

```tsx
    <div className="p-8">
```

- [ ] **Step 4: Remove the now-redundant per-page width constraint from the Order detail page**

Find:

```tsx
    <div className="mx-auto max-w-3xl px-4 py-8">
```

Change to:

```tsx
    <div className="p-8">
```

- [ ] **Step 5: Verify no other `seller/dashboard/*` page needs a change**

The other 5 sub-pages (`page.tsx` [Overview], `products/page.tsx`, `products/new/page.tsx`,
`products/[id]/edit/page.tsx`, `settings/page.tsx`, `subscriptions/page.tsx`) already use bare
`<div className="p-8">` with no width class of their own — confirm this is still true (nothing
should have drifted since the audit that informed this plan), and leave them untouched:

```bash
grep -n "className=\"p-8\"" apps/web/src/app/seller/dashboard/page.tsx apps/web/src/app/seller/dashboard/products/page.tsx apps/web/src/app/seller/dashboard/products/new/page.tsx "apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx" apps/web/src/app/seller/dashboard/settings/page.tsx apps/web/src/app/seller/dashboard/subscriptions/page.tsx
```

Expected: one match per file. If any file doesn't match, stop and report — the plan's assumption
about that file has drifted and needs a human decision, not a guess.

Note: `settings/page.tsx` renders a form component
(`apps/web/src/app/seller/dashboard/settings/settings-form.tsx:64`) with its own
`max-w-xl` cap and no `mx-auto` — this was previously hugging the left edge of a full-bleed
viewport-width page; after this task it will hug the left edge of the new centered `max-w-6xl`
shell instead, which reads as an intentional "form starts at the content column's left edge"
layout. Leave `settings-form.tsx` untouched — this is a reasonable side effect, not a bug to chase.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

- [ ] **Step 7: Real browser check — this changes a shared layout, verify every sidebar item, not
      just the 2 files with actual diffs**

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
pnpm --filter @bomy/web dev
```

Sign in as a seller, click through all 5 sidebar items (Overview, Subscriptions, Products, Orders,
Settings — "Products" sub-pages if reachable). Confirm:

- Content is now centered and capped at a consistent width on every page, not stretched edge-to-edge
  on Overview/Products/Subscriptions/Settings like before.
- Orders and Order-detail still render correctly at their (now-inherited, not self-declared) width
  — no double-padding, no broken tables.
- The sidebar itself is unaffected (this task doesn't touch it).

Stop the dev server after (`lsof -ti:3000 | xargs kill`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/seller/dashboard/layout.tsx apps/web/src/app/seller/dashboard/orders/page.tsx "apps/web/src/app/seller/dashboard/orders/[orderId]/page.tsx"
git commit -m "fix(web): move seller dashboard's width contract to the layout

Overview/Products/Products-New/Products-Edit/Settings/Subscriptions
had no width constraint at all (full-bleed against the sidebar), while
Orders used max-w-5xl and Order-detail used max-w-3xl independently —
three different behaviors across one persistent sidebar shell. Layout
now applies mx-auto max-w-6xl once; Orders/Order-detail drop their own
now-redundant constraints. Every other page was already bare p-8, so
this is the only change they needed."
```

---

### Task 6: Full verification — typecheck, lint, tests, and a final cross-page browser pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck and lint**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

- [ ] **Step 2: Run the full web test suite**

```bash
pnpm --filter @bomy/web test --run
```

Expected: same pass count as before this plan (462, per PR #125's log) — this plan changes layout
classNames and JSX nesting, not component behavior or test-covered logic; no test count change is
expected. If any test fails, read it before assuming it's unrelated — a failure in
`nav-bar.test.tsx`/`footer.test.tsx` would be a real signal something in this plan's account/
seller-dashboard restructuring broke shared markup those tests don't even cover, so treat any
failure as worth understanding, not dismissing.

- [ ] **Step 3: `git diff --check`**

```bash
git diff --check origin/main..HEAD
```

Expected: clean.

- [ ] **Step 4: Final cross-page browser pass — confirm the fixes hold together, not just in
      isolation**

If the dev server isn't already running:

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
pnpm --filter @bomy/web dev
```

At a wide viewport (≥1400px, so `max-w-6xl`'s 1152px cap is clearly visible against the browser
edge), spot-check: `/checkout` (widened), all 4 `/account/*` tabs (stable width across tabs), all 5
`/seller/dashboard/*` sidebar items (stable width across pages), `/membership/success` (via the
poller — may need a real or mocked pending membership to reach the polling state; if that's not
easily reachable in dev, at minimum confirm the class change rendered correctly via devtools
computed width on whichever branch does render), `/seller/apply` (wider card).

Stop the dev server after (`lsof -ti:3000 | xargs kill`).

## Follow-ups (not in this plan's scope)

- **Seller dashboard sidebar still uses hardcoded `bg-slate-800`/`bg-slate-700`** instead of BOMY
  theme tokens — a real gap, but a navigation-component retheme concern, not a width issue. Same
  family of work as the NavBar/Footer retheme (PR #125), not started for this sidebar yet.
- `about/page.tsx`, the product-detail nested prose width, `membership/manage`, brand-subscribe,
  and legal pages were all investigated and explicitly excluded — see Global Constraints for why,
  don't re-open these without new information.
- New components, screens, and the `docs/design-system/README.md` §3 status-text cleanup — all
  still queued from before this plan, unrelated to it.
