# Retheme Shared UI Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish retheming the 6 existing shared shadcn UI primitives (Button, Card, Badge, Input,
Label, Textarea) in `apps/web` and `apps/admin` per `docs/design-system/README.md` §3 — the parts
that don't already inherit correctly from PR #120's color tokens.

**Architecture:** PR #120 already retheme'd colors via the shadcn `hsl(var(--x))` indirection, so
any component using semantic classes (`bg-primary`, `text-foreground`, etc.) already renders in
BOMY colors with zero changes. What's left is (a) a border-radius mismatch — the design system
wants per-component-type radii (`--radius-control`/`--radius-input` = the existing 0.625rem,
`--radius-card` = a bigger 0.75rem) but the current Tailwind config only exposes one generic
`lg`/`md`/`sm` scale derived by subtracting pixels from the base `--radius`, which doesn't hit
those exact values — and (b) Button's brand-new `reward` variant (gold), which needs entirely new
color tokens since nothing gold-colored is wired into either app yet.

**Tech Stack:** Tailwind CSS 3.4, shadcn/ui CSS-variable theming, class-variance-authority (`cva`).

## Global Constraints

- **Source of truth:** `docs/design-system/README.md` §3's component-mapping table, plus
  `docs/design-system/components/core/*.jsx.txt` and `*.prompt.md` for the exact intended
  behavior of each component.
- **Both apps' 6 components are byte-identical today** (verified: `diff apps/web/.../ui/*.tsx
apps/admin/.../ui/*.tsx` — zero output for all 6). Every task below changes both copies together,
  identically, so they stay in sync.
- **Follow the README's component-mapping table literally — no more, no less:**
  - Button: "Add `reward` variant (gold, for membership CTAs); `outline`/`ghost`/`link` keep shape,
    recolor via retheme."
  - Card: "Recolors via retheme only; radius becomes `--radius-card` (0.75rem)."
  - Input, Label, Textarea: "Recolor + radius only."
  - Badge is not in this task list (see the audit finding below).
- **Audited, need ZERO changes — do not touch:**
  - `badge.tsx` — already uses semantic tokens (`bg-primary`, `bg-secondary`, `bg-destructive`,
    `bg-accent`) that PR #120 already retheme'd, and already uses `rounded-full` (9999px), which is
    visually identical to the design system's `--radius-badge: 999px` for any realistic badge size.
    Zero diff needed.
  - `label.tsx` — already uses `text-sm font-medium leading-none` with no explicit color (inherits
    from parent, already navy via PR #120) and no radius. Matches the design system's `Label`
    (`font: var(--type-label)`, inherited heading color) with no code change needed.
- **Do not add new interaction patterns.** The design system's `Card.jsx.txt` has an `interactive`
  hover-lift prop; `Input.jsx.txt`/`Textarea.jsx.txt` swap `box-shadow` on focus instead of using a
  separate focus ring. Neither is in the README's "recolor + radius only" instruction for these
  components — implementing them would be new functionality, not a retheme. Out of scope here.
- **No page rebuilds, no new call sites.** Only the 6 shared primitive files + the shared token
  additions they depend on. Don't wire `reward` into any actual button usage anywhere — that's a
  page-level decision (e.g., which membership CTA becomes `reward`) for a later slice.
- **HSL values below were computed independently** (Python `colorsys` against the source hex in
  `docs/design-system/tokens/colors.css`), not assumed from any single doc — the design bundle has
  had at least one real HSL typo before (PR #120/#121's `--accent` saga).

---

### Task 1: Add the reward color pair + semantic radius aliases to both apps

**Files:**

- Modify: `apps/web/src/app/globals.css:6-30` (the `:root` block Task 1 of the retheme plan left
  in place)
- Modify: `apps/web/tailwind.config.ts` (the `colors`/`borderRadius` keys inside `theme.extend`)
- Modify: `apps/admin/src/app/globals.css:6-25`
- Modify: `apps/admin/tailwind.config.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: CSS custom properties `--reward`, `--reward-foreground`, `--radius-control`,
  `--radius-input`, `--radius-card`; Tailwind utilities `bg-reward`/`text-reward-foreground` and
  `rounded-control`/`rounded-input`/`rounded-card` — consumed by Tasks 2–4.

- [ ] **Step 1: Add the new CSS custom properties to `apps/web/src/app/globals.css`**

Read the current file first to confirm nothing has drifted:

```bash
cat apps/web/src/app/globals.css
```

Inside the existing `:root { ... }` block, immediately after the `--radius: 0.625rem;` line, add:

```css
--reward: 45 100% 55%; /* gold-400 */
--reward-foreground: 45 100% 15%; /* gold-900 */

/* Semantic radius aliases — --radius-control/--radius-input equal the base --radius above
       (the design system's --radius-md); --radius-card is deliberately bigger. See
       docs/design-system/tokens/radius.css. */
--radius-control: var(--radius);
--radius-input: var(--radius);
--radius-card: 0.75rem;
```

- [ ] **Step 2: Add matching Tailwind config entries to `apps/web/tailwind.config.ts`**

Inside `theme.extend.colors`, add a `reward` entry alongside the existing `secondary`/`accent`/etc.
pairs:

```ts
        reward: {
          DEFAULT: "hsl(var(--reward))",
          foreground: "hsl(var(--reward-foreground))",
        },
```

Inside `theme.extend.borderRadius`, add the three new keys alongside the existing `lg`/`md`/`sm`:

```ts
        control: "var(--radius-control)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
```

- [ ] **Step 3: Repeat Steps 1–2 identically for `apps/admin`**

Same additions, same values, in `apps/admin/src/app/globals.css` (after admin's own
`--radius: 0.625rem;` line) and `apps/admin/tailwind.config.ts`.

- [ ] **Step 4: Verify formatting and typecheck both apps**

```bash
pnpm exec prettier --check apps/web/src/app/globals.css apps/admin/src/app/globals.css
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/admin typecheck
```

Expected: all four pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/tailwind.config.ts apps/admin/src/app/globals.css apps/admin/tailwind.config.ts
git commit -m "feat: add reward color tokens + semantic radius aliases"
```

---

### Task 2: Retheme Button — add `reward` variant, fix control radius

**Files:**

- Modify: `apps/web/src/components/ui/button.tsx`
- Modify: `apps/admin/src/components/ui/button.tsx`
- Test: `apps/web/tests/components/ui/button.test.tsx` (new file — no dedicated Button test exists
  today, confirmed by search)

**Interfaces:**

- Consumes: `bg-reward`/`text-reward-foreground`/`rounded-control` from Task 1.
- Produces: `buttonVariants({ variant: "reward" })` — a new valid `variant` value, for later slices
  to wire into actual CTAs (not done here).

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat apps/web/src/components/ui/button.tsx
```

- [ ] **Step 2: Add the `reward` variant and fix the radius in `apps/web/src/components/ui/button.tsx`**

Replace the `cva` call's first argument (the base class string) — change `rounded-md` to
`rounded-control`:

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

In the `variants.variant` object, add `reward` after `secondary` (matching the design system's
variant ordering — primary/secondary/reward/outline/ghost/destructive/link):

```ts
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        reward: "bg-reward text-reward-foreground shadow-sm hover:bg-reward/90",
```

In `variants.size`, change both `sm` and `lg`'s redundant `rounded-md` to `rounded-control` (the
base string already sets it, but these size variants re-specify it — keep them consistent with the
base rather than leaving a mismatched leftover):

```ts
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-control px-3 text-xs",
        lg: "h-10 rounded-control px-8",
        icon: "h-9 w-9",
      },
```

- [ ] **Step 3: Repeat Step 2 identically in `apps/admin/src/components/ui/button.tsx`**

Same three edits, same result — confirm the two files are byte-identical again afterward:

```bash
diff apps/web/src/components/ui/button.tsx apps/admin/src/components/ui/button.tsx
```

Expected: no output.

- [ ] **Step 4: Write a test for the new `reward` variant**

Create `apps/web/tests/components/ui/button.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"

describe("Button reward variant", () => {
  it("renders with the reward background/foreground classes", () => {
    const html = renderToStaticMarkup(<Button variant="reward">Join now</Button>)
    expect(html).toContain("bg-reward")
    expect(html).toContain("text-reward-foreground")
  })

  it("still renders the default variant unchanged", () => {
    const html = renderToStaticMarkup(<Button>Continue</Button>)
    expect(html).toContain("bg-primary")
    expect(html).toContain("text-primary-foreground")
  })
})
```

- [ ] **Step 5: Run the test, confirm it passes**

```bash
pnpm --filter @bomy/web test --run button.test.tsx
```

Expected: 2 passed.

- [ ] **Step 6: Typecheck both apps**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/admin typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui/button.tsx apps/admin/src/components/ui/button.tsx apps/web/tests/components/ui/button.test.tsx
git commit -m "feat: add Button reward variant, fix control-radius mismatch"
```

---

### Task 3: Retheme Card — fix card radius

**Files:**

- Modify: `apps/web/src/components/ui/card.tsx`
- Modify: `apps/admin/src/components/ui/card.tsx`

**Interfaces:**

- Consumes: `rounded-card` from Task 1.
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

```bash
cat apps/web/src/components/ui/card.tsx
```

- [ ] **Step 2: Change the `Card` component's radius class**

In `apps/web/src/components/ui/card.tsx`, the `Card` component (the first one in the file) has:

```tsx
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
```

Change `rounded-lg` to `rounded-card`:

```tsx
        "rounded-card border border-border bg-card text-card-foreground shadow-sm",
```

Nothing else in this file changes — `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/
`CardFooter` have no radius or color classes of their own.

- [ ] **Step 3: Repeat Step 2 identically in `apps/admin/src/components/ui/card.tsx`**

```bash
diff apps/web/src/components/ui/card.tsx apps/admin/src/components/ui/card.tsx
```

Expected: no output.

- [ ] **Step 4: Typecheck both apps**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/admin typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/card.tsx apps/admin/src/components/ui/card.tsx
git commit -m "feat: fix Card radius to the design system's larger --radius-card"
```

---

### Task 4: Retheme Input + Textarea — fix control radius

**Files:**

- Modify: `apps/web/src/components/ui/input.tsx`
- Modify: `apps/web/src/components/ui/textarea.tsx`
- Modify: `apps/admin/src/components/ui/input.tsx`
- Modify: `apps/admin/src/components/ui/textarea.tsx`

**Interfaces:**

- Consumes: `rounded-input` from Task 1.
- Produces: nothing new for later tasks — leaf change.

- [ ] **Step 1: Read both current files to confirm nothing has drifted**

```bash
cat apps/web/src/components/ui/input.tsx apps/web/src/components/ui/textarea.tsx
```

- [ ] **Step 2: Change `rounded-md` to `rounded-input` in both files**

In `apps/web/src/components/ui/input.tsx`:

```tsx
          "flex h-9 w-full rounded-input border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
```

In `apps/web/src/components/ui/textarea.tsx`:

```tsx
        "flex min-h-[60px] w-full rounded-input border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
```

- [ ] **Step 3: Repeat Step 2 identically for both `apps/admin` files**

```bash
diff apps/web/src/components/ui/input.tsx apps/admin/src/components/ui/input.tsx
diff apps/web/src/components/ui/textarea.tsx apps/admin/src/components/ui/textarea.tsx
```

Expected: no output from either.

- [ ] **Step 4: Typecheck both apps**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/admin typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/input.tsx apps/web/src/components/ui/textarea.tsx apps/admin/src/components/ui/input.tsx apps/admin/src/components/ui/textarea.tsx
git commit -m "feat: fix Input/Textarea radius to match the design system's control radius"
```

---

### Task 5: Full verification — typecheck, lint, tests, and a real browser check

**Files:** none (verification only).

- [ ] **Step 1: Typecheck and lint both apps**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/admin typecheck
pnpm --filter @bomy/web lint
pnpm --filter @bomy/admin lint
```

- [ ] **Step 2: Run the full web test suite**

```bash
pnpm --filter @bomy/web test --run
```

Expected: same pass count as before this plan plus the 2 new Button tests (458 + 2 = 460), no
failures — a failure here means something unexpected got touched, since this plan changes only
CSS classes and adds one new variant.

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

Open `http://localhost:3000/auth/sign-in` — this page already renders a `Card` (outer container)
and an `outline`-variant `Button` ("Continue with Google"), so it exercises both radius fixes
without any new page work. Confirm:

- The card's corners are visibly a touch rounder than the button's/input's corners (0.75rem vs
  0.625rem) — subtle, but check via devtools computed `border-radius` on each if it's hard to eye.
- The outline button still renders correctly (border, hover state).

Open `http://localhost:3000/seller/apply` (public, no auth needed) — renders `Input` and
`Textarea`. Confirm both have the corrected (very slightly larger, since `rounded-input` drops the
old `-2px` calc offset) rounded corners and no visual regression (borders, placeholder text,
padding all still look right).

- [ ] **Step 5: Stop the dev server**

Per this project's convention — leave Docker containers running, stop only the dev server process.

```bash
lsof -ti:3000 | xargs kill
```

## Follow-ups (not in this plan's scope)

- New components (Select, Checkbox, RadioGroup, Switch, Field, Dialog, EmptyState, DataTable) — none
  exist yet, `docs/design-system/README.md` §3.
- `StatusPill`/`StockStatus` — commerce-specific badge variants layered on the (unchanged) base
  Badge.
- `NavBar`/`Footer` recolor pass — logic stays, just restyle classNames per
  `docs/design-system/components/navigation/NavBar.jsx.txt`/`Footer.jsx.txt`.
- Wiring the new `reward` Button variant into an actual CTA (e.g., a membership "Join now" button)
  — a page-level decision for whoever picks up screen work next.
- Card's `interactive` hover-lift and Input/Textarea's focus-shadow-swap — deliberately excluded,
  see Global Constraints.
