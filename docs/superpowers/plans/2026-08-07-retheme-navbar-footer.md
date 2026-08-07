# Retheme NavBar + Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retheme `apps/web`'s site chrome — `NavBar` and `Footer` — per `docs/design-system/README.md` §3, so the shared frame around every page is correct before any screen-level retheme work starts.

**Architecture:** Same pattern as PR #124 (the primitives retheme): most of the visual correctness
is already automatic via PR #120's color tokens (link colors, cart badge, footer link colors all
already use semantic classes that inherited BOMY colors with zero changes needed). What's left is
two structural gaps the design system's `NavBar.jsx.txt`/`Footer.jsx.txt` reference exposes that
the current stock-shadcn token set doesn't cover: (a) the nav/footer should sit on a **white**
surface (`--surface-card`) with a **subtler** border (`--border-subtle`, lighter than the generic
`--border` PR #120 wired), not the page's own warm-sand background/border — a deliberate
separation the design system draws between "chrome" and "page," and (b) a couple of small
typography-scale corrections (eyebrow-label size, wordmark weight) to match the spec's type roles
exactly.

**Tech Stack:** Tailwind CSS 3.4, existing shadcn CSS-variable theming (no new component library).

## Global Constraints

- **Source of truth:** `docs/design-system/README.md` §3's component-mapping table (`NavBar, Footer
| nav-bar.tsx, footer.tsx | Recolor + restyle per components/navigation/NavBar.jsx.txt /
Footer.jsx.txt; logic (mobile menu, cart badge, auth links) in the current file is solid and can
stay — just retheme classNames.`), plus `docs/design-system/components/navigation/NavBar.jsx.txt`,
  `Footer.jsx.txt`, `NavBar.prompt.md`, `Footer.prompt.md`.
- **`apps/web` only.** `apps/admin` has no `NavBar`/`Footer` — it uses an entirely different
  `Sidebar` pattern (`apps/admin/src/components/sidebar.tsx`), out of scope and untouched.
- **Restyle classNames only — no new logic, no new DOM elements.** The brief above is explicit:
  "logic... is solid and can stay." Do NOT add:
  - Active-link highlighting (the design system's `NavLink` has an `active` prop driven by the
    current path; the live `NAV_LINKS` map has no path-awareness today). Implementing this is a
    new interactive feature, not a restyle — deferred, see Follow-ups.
  - The Wordmark's small gold dot (`docs/design-system/components/navigation/Wordmark.jsx.txt`
    renders `BOMY` followed by a decorative `border-radius: 50%` gold dot). This is new visual
    content, not a recolor of what's already there — deferred, see Follow-ups.
  - A swap of the cart icon's inline SVG for a design-system-style `Icon` component. The current
    SVG already uses `stroke="currentColor"` and inherits the parent link's text color, so it
    already renders correctly themed with zero changes — nothing to fix here.
- **No `docs/design-system/` edits in this plan.** Every prior retheme PR (#119–#124) has kept
  `docs/design-system/` changes in their own dedicated PR, even a one-line typo (PR #121). Follow
  that pattern — the README §3 status-text update for NavBar/Footer is a separate follow-up PR
  after this one, not a task here.
- **New token needed:** `--border-subtle` (sand-200, `#ede5d9`) does not exist in `apps/web`'s
  token set yet — only the generic `--border` (sand-300, mapped from PR #120) exists. HSL computed
  independently via Python `colorsys` against the source hex, not assumed: `36 36% 89%`.
- **No new token needed for the footer/nav background** — `bg-card` (white, `--card`) and `bg-muted`
  (sand-100, `--muted`) already exist from PR #120 and already match the design system's
  `--surface-card` and `--surface-sunken` exactly (verified: `docs/design-system/tokens/colors.css`
  defines `--surface-sunken: var(--sand-100)`, and PR #120's `globals.css` already sets
  `--muted: 37 45% 94%` = sand-100, the same value).

---

### Task 1: Add the `--border-subtle` token to `apps/web`

**Files:**

- Modify: `apps/web/src/app/globals.css` (the `:root` block)
- Modify: `apps/web/tailwind.config.ts` (the `colors` key inside `theme.extend`)

**Interfaces:**

- Consumes: nothing new.
- Produces: the CSS custom property `--border-subtle` and the Tailwind utility `border-subtle` —
  consumed by Tasks 2 and 3.

- [ ] **Step 1: Add the CSS custom property to `apps/web/src/app/globals.css`**

Read the current file first to confirm nothing has drifted:

```bash
cat apps/web/src/app/globals.css
```

Inside the existing `:root { ... }` block, immediately after the `--radius-card: 0.75rem;` line
(added by the prior retheme PR #124), add:

```css
--border-subtle: 36 36% 89%; /* sand-200 */
```

- [ ] **Step 2: Add the matching Tailwind config entry to `apps/web/tailwind.config.ts`**

Inside `theme.extend.colors`, add a `subtle` entry alongside the existing `border`/`input`/`ring`
keys (naming it `subtle` — not `border-subtle` — makes Tailwind generate the `border-subtle`
utility class directly, following the same pattern as the existing bare `border: "hsl(var(--border))"`
key):

```ts
        subtle: "hsl(var(--border-subtle))",
```

- [ ] **Step 3: Verify formatting and typecheck**

```bash
pnpm exec prettier --check apps/web/src/app/globals.css
pnpm --filter @bomy/web typecheck
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/tailwind.config.ts
git commit -m "feat(web): add --border-subtle token for nav/footer chrome"
```

---

### Task 2: Retheme `apps/web/src/components/nav-bar.tsx`

**Files:**

- Modify: `apps/web/src/components/nav-bar.tsx`

**Interfaces:**

- Consumes: `border-subtle` from Task 1; `bg-card` (existing, from PR #120).
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat apps/web/src/components/nav-bar.tsx
```

- [ ] **Step 2: Retheme the nav wrapper — background and border**

Find (the outermost `<nav>` element):

```tsx
    <nav className="sticky top-0 z-50 border-b border-border bg-background shadow-sm">
```

Change to (white surface per `--surface-card`, subtler border per `--border-subtle` — matches
`docs/design-system/components/navigation/NavBar.jsx.txt`'s
`background: var(--surface-card)` / `borderBottom: "1px solid var(--border-subtle)"`):

```tsx
    <nav className="sticky top-0 z-50 border-b border-subtle bg-card shadow-sm">
```

- [ ] **Step 3: Retheme the wordmark link's weight and tracking**

Find:

```tsx
        <Link href="/" className="text-lg font-bold tracking-tight text-primary">
```

Change to (matches the design system's `Wordmark.jsx.txt`: `fontWeight: var(--weight-extrabold)`,
`letterSpacing: var(--tracking-tighter)` — color (`text-primary`) is already correct, already
inherits the brand red from PR #120):

```tsx
        <Link href="/" className="text-lg font-extrabold tracking-tighter text-primary">
```

- [ ] **Step 4: Retheme the mobile dropdown panel to match the nav's own surface**

Find:

```tsx
          "absolute inset-x-0 top-full origin-top border-b border-border bg-background shadow-lg transition duration-200 ease-out md:hidden",
```

Change to (the dropdown is part of the same nav surface when open — should match the nav bar's own
background/border, not the page's):

```tsx
          "absolute inset-x-0 top-full origin-top border-b border-subtle bg-card shadow-lg transition duration-200 ease-out md:hidden",
```

- [ ] **Step 5: Typecheck and run the existing nav-bar test**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web test --run nav-bar.test.tsx
```

Expected: typecheck passes; all 6 existing tests still pass (they assert on hrefs/aria attributes
and structural classes like `md:flex`/`md:hidden`/`inert`, not on the `bg-*`/`border-*`/`font-*`
classes this task changes — confirm this by reading `apps/web/tests/components/nav-bar.test.tsx`
before assuming, don't just trust this plan's claim).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/nav-bar.tsx
git commit -m "feat(web): retheme NavBar — white surface, subtle border, wordmark weight"
```

---

### Task 3: Retheme `apps/web/src/components/footer.tsx`

**Files:**

- Modify: `apps/web/src/components/footer.tsx`

**Interfaces:**

- Consumes: `border-subtle` from Task 1.
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat apps/web/src/components/footer.tsx
```

- [ ] **Step 2: Retheme the footer wrapper's border**

Find:

```tsx
    <footer className="mt-16 border-t border-border bg-muted">
```

Change to (background is already correct — `bg-muted` already equals the design system's
`--surface-sunken` exactly, see Global Constraints — only the border needs the subtler token):

```tsx
    <footer className="mt-16 border-t border-subtle bg-muted">
```

- [ ] **Step 3: Retheme the two column-header labels ("Quick Links", "Policies")**

There are two identical occurrences of this className string (one for each `<p>` header). Find
both:

```tsx
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
```

Change both to `text-xs` (matches the design system's `--type-eyebrow` role, which specifies
`--text-xs`, not `--text-sm` — `font-semibold`/`uppercase`/`tracking-wide` already match):

```tsx
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
```

- [ ] **Step 4: Retheme the bottom separator border**

Find:

```tsx
        <div className="mt-10 border-t border-border pt-6">
```

Change to:

```tsx
        <div className="mt-10 border-t border-subtle pt-6">
```

- [ ] **Step 5: Typecheck and run the existing footer test**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web test --run footer.test.tsx
```

Expected: typecheck passes; all 3 existing tests still pass (they assert on hrefs and text
content, not on the classes this task changes — confirm by reading
`apps/web/tests/components/footer.test.tsx` before assuming).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/footer.tsx
git commit -m "feat(web): retheme Footer — subtle border, eyebrow-label size"
```

---

### Task 4: Full verification — typecheck, lint, tests, and a real browser check

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

Expected: same pass count as before this plan (462, per PR #124's log) — this plan changes only
CSS classes on two components that already had passing tests, no new tests are added, no test
count should change.

- [ ] **Step 3: `git diff --check`**

```bash
git diff --check origin/main..HEAD
```

Expected: clean.

- [ ] **Step 4: Real browser check**

Start Docker infra + the web dev server if not already running:

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
pnpm --filter @bomy/web dev
```

Open `http://localhost:3000` and scroll to the footer. Confirm:

- The nav bar is visibly a slightly cooler/whiter surface than the warm-sand page background below
  it — check computed `background-color` in devtools if it's too subtle to eye (`bg-card` should
  compute to `rgb(255, 255, 255)`, the page body to the sand-50 value from PR #120).
- The nav's bottom border and the footer's top/bottom borders are visibly present but subtle —
  not the more visible sand-300 border used elsewhere (e.g. around cards).
- Open the mobile menu (resize below `md` or use devtools device mode) and confirm the dropdown
  panel's background/border match the nav bar itself, not the page.
- Footer's "Quick Links"/"Policies" headers are a touch smaller (`text-xs`) than before.
- No layout breakage, no missing content, no console errors beyond the known pre-existing
  `favicon.ico` 404 / `DATABASE_APP_URL`-unset dev warning (both established as unrelated
  pre-existing noise in this project's retheme work so far — confirm nothing _new_ appears).

- [ ] **Step 5: Stop the dev server**

Per this project's convention — leave Docker containers running, stop only the dev server process.

```bash
lsof -ti:3000 | xargs kill
```

## Follow-ups (not in this plan's scope)

- **Separate tiny PR:** update `docs/design-system/README.md` §3's NavBar/Footer row to reflect
  this work is done — kept out of this plan per the established pattern of never mixing
  `docs/design-system/` edits into implementation PRs (PRs #119–#124).
- Active-link highlighting (`NavLink`'s `active` prop, path-aware styling) — a new interactive
  feature, not a restyle; needs `usePathname()` wiring, a genuine logic change.
- The Wordmark's decorative gold dot — new visual content, not a recolor.
- `--text-subtle` (sand-500) for the footer's copyright line, which the design system specifies as
  slightly lighter than the `--text-muted` (sand-600) used everywhere else in the footer — a very
  minor, barely-perceptible difference; not worth a new token for this pass. Revisit if/when
  `--text-subtle` is needed elsewhere too.
- New components (Select, Checkbox, RadioGroup, Switch, Field, Dialog, EmptyState, DataTable),
  `StatusPill`/`StockStatus`, and all screen-level retheme work — per Charlie, forms primitives
  (Field, Select, Checkbox, RadioGroup, Switch) are next after this, ahead of screen work, since
  screens will need them.
