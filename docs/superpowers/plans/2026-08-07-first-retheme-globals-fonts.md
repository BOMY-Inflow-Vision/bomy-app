# First BOMY Retheme (globals.css + fonts + token cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retheme `apps/web` and `apps/admin` from the stock shadcn indigo theme to BOMY's brand
tokens (red/navy/sand, Plus Jakarta Sans + IBM Plex Mono), using `docs/design-system/` as the
source spec, with zero page-level changes.

**Architecture:** Both apps already consume color via shadcn's `hsl(var(--x))` CSS-variable
indirection (`tailwind.config.ts` → `globals.css` `:root` → components). Retheming means replacing
the `:root` variable _values_ only — no component, no page, and no Tailwind class name changes.
Fonts follow the existing `next/font/google` → CSS variable → `fontFamily.sans` pattern already
used for Inter in `apps/web`; `apps/admin` currently has no font loaded at all, so it gets the
pattern added fresh, not swapped.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS 3.4, shadcn/ui CSS-variable theming,
`next/font/google`.

## Global Constraints

- **Source of truth for values:** `docs/design-system/README.md` §1–§2 and `docs/design-system/tokens/*.css`. Do not invent values; every HSL triplet below is either copied from the README or independently recomputed from `tokens/colors.css`'s hex source where the README's own value was wrong (see the `--accent` note in Task 1).
- **Do not modify anything under `docs/design-system/`** in this plan — it is committed reference material (PR #119). If a bundle error needs fixing, that's a separate follow-up.
- **No page rebuilds.** Only `globals.css`, `layout.tsx` (font wiring only), and `tailwind.config.ts` (token cleanup only) change. Existing pages inherit the new theme automatically through the CSS-variable indirection — that inheritance is the thing being verified, not rebuilt.
- **No dark mode work.** Both apps declare `darkMode: ["class"]` in Tailwind config but nothing anywhere toggles a `dark` class (verified: no `next-themes` dependency, no `"dark"` class-toggle code in either app's `src/`). `apps/web`'s current `.dark` block is dead CSS. Do not port `docs/design-system/tokens/colors.css`'s `.dark` section in this plan — leave a pointer comment instead.
- **`apps/admin` gets font loading added, not swapped** — it currently has zero `next/font` usage (confirmed: no import in `apps/admin/src/app/layout.tsx`). Its `tailwind.config.ts` also has no `fontFamily` key at all (confirmed).
- Money/RLS/auth are untouched by this plan — pure CSS/font/config surface.

---

### Task 1: Retheme `apps/web/src/app/globals.css`

**Files:**

- Modify: `apps/web/src/app/globals.css:1-56`

**Interfaces:**

- Consumes: nothing (leaf CSS file).
- Produces: the CSS custom properties `--background`, `--foreground`, `--card`,
  `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`,
  `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
  `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`,
  `--ring`, `--radius` — consumed by `apps/web/tailwind.config.ts`'s `theme.extend.colors`/
  `borderRadius` (Task 2 leaves that mapping untouched, it already reads these var names) and by
  every component using `bg-primary`, `text-foreground`, etc.

- [ ] **Step 1: Replace the `:root` block**

Read the current file first to confirm nothing has drifted since this plan was written:

```bash
cat apps/web/src/app/globals.css
```

Replace the `:root { ... }` block (currently lines 6–26) with:

```css
:root {
  --background: 40 60% 98%; /* sand-50 */
  --foreground: 231 49% 15%; /* navy-900 */
  --card: 0 0% 100%;
  --card-foreground: 231 49% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 231 49% 15%;
  --primary: 4 71% 43%; /* red-600 */
  --primary-foreground: 0 0% 100%;
  --secondary: 37 45% 94%; /* sand-100 */
  --secondary-foreground: 231 49% 15%;
  --muted: 37 45% 94%; /* sand-100 */
  --muted-foreground: 34 19% 36%; /* sand-600 */
  --accent: 5 73% 97%; /* red-50 — docs/design-system/README.md's own code block says
      "5 5% 97%"; recomputed from the source hex (#fdf3f2, tokens/colors.css) and confirmed
      that's a typo (5% saturation would render near-grey, not a warm red tint). Using the
      correct value here; flag the doc typo separately, don't fix it in this PR. */
  --accent-foreground: 4 71% 43%; /* red-600 */
  --destructive: 4 71% 43%; /* red-600 — brand red doubles as danger color in the source
      system; see docs/design-system/README.md's flagged open item if this needs revisiting */
  --destructive-foreground: 0 0% 100%;
  --border: 35 30% 81%; /* sand-300 */
  --input: 35 30% 81%; /* sand-300 */
  --ring: 4 64% 51%; /* red-500 */
  --radius: 0.625rem; /* was 0.5rem */
}
```

- [ ] **Step 2: Replace the `.dark` block with a pointer comment**

Replace the `.dark { ... }` block (the stock-shadcn indigo dark theme, currently unreachable —
nothing toggles a `dark` class anywhere in this app) with:

```css
/* Dark mode is not wired up in this app (no next-themes / class toggle exists yet).
     When it ships, port the `.dark` block from docs/design-system/tokens/colors.css,
     converting hex to the same H S% L% HSL-triplet format used above. */
```

- [ ] **Step 3: Verify the file is well-formed CSS**

```bash
cd apps/web && pnpm exec prettier --check src/app/globals.css
```

Expected: `All matched files use Prettier code style!` (if not, run `pnpm exec prettier --write
src/app/globals.css` — Tailwind's `@layer` blocks are sensitive to indentation but Prettier will
fix it deterministically).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): retheme globals.css to BOMY brand tokens"
```

---

### Task 2: Remove the unused `bomy` orange scale from `apps/web/tailwind.config.ts`

**Files:**

- Modify: `apps/web/tailwind.config.ts:49-60`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing new — this is a deletion. Confirmed zero references anywhere in the app before
  deleting (`rg -n "bomy-(50|100|200|300|400|500|600|700|800|900|950)" apps/web/src` returns
  nothing — stock shadcn boilerplate color scale, never wired to the real BOMY brand).

- [ ] **Step 1: Re-confirm zero references (things may have changed since this plan was written)**

```bash
rg -n "\bbomy-(50|100|200|300|400|500|600|700|800|900|950)\b" apps/web/src
```

Expected: no output. If it finds a hit, stop and ask before deleting — don't silently break a
class some component actually uses.

- [ ] **Step 2: Delete the `bomy` color scale**

In `apps/web/tailwind.config.ts`, remove this entire block from inside `theme.extend.colors`:

```ts
        bomy: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

Expected: passes (this is a pure object-literal deletion, nothing types against it).

- [ ] **Step 4: Commit**

```bash
git add apps/web/tailwind.config.ts
git commit -m "chore(web): remove unused stock-shadcn bomy orange color scale"
```

---

### Task 3: Swap fonts in `apps/web/src/app/layout.tsx`

**Files:**

- Modify: `apps/web/src/app/layout.tsx:1-27`

**Interfaces:**

- Consumes: nothing new.
- Produces: CSS custom properties `--font-sans` and `--font-mono` on the `<html>` element —
  already consumed by `apps/web/tailwind.config.ts`'s existing `fontFamily: { sans: ["var(--font-sans)", ...fontFamily.sans], mono: ["var(--font-mono)", ...fontFamily.mono] }`
  (unchanged by this task — it already reads these exact variable names, confirmed by reading the
  file; no config edit needed here).
- **Verified against `next/font/google`'s actual type declarations** (not guessed): exported
  function names are `Plus_Jakarta_Sans` and `IBM_Plex_Mono`; `Plus_Jakarta_Sans`'s `weight` option
  accepts `'400'|'500'|'600'|'700'|'800'` (matches the design system's requested weights exactly);
  `IBM_Plex_Mono`'s `weight` is a **required** option (unlike most Google fonts in this API) and
  accepts `'400'` among others.

- [ ] **Step 1: Replace the font import and font object**

Replace:

```ts
import { Inter } from "next/font/google"
```

with:

```ts
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"
```

Replace:

```ts
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
```

with:

```ts
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-sans",
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
})
```

- [ ] **Step 2: Update the `<html>`/`<body>` className wiring**

Replace:

```tsx
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
```

with:

```tsx
    <html lang="en" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}>
      <body className={plusJakartaSans.className}>
```

(`plusJakartaSans.className` sets the base body font; `ibmPlexMono.variable` only needs to exist
as a CSS var for `font-mono` utility classes to pick up on the rare element that uses them — it
doesn't need to be applied as a body-wide className the way the sans font does.)

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/web typecheck
```

Expected: passes. If it errors on the `weight`/`style` array types, re-check the exact union types
in `node_modules/.pnpm/next@*/node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts`
before changing anything — those types are the ground truth, not this plan.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): swap Inter for Plus Jakarta Sans + add IBM Plex Mono"
```

---

### Task 4: Retheme `apps/admin/src/app/globals.css`

**Files:**

- Modify: `apps/admin/src/app/globals.css:1-24`

**Interfaces:**

- Consumes: nothing.
- Produces: same variable set as Task 1, **minus `--popover`/`--popover-foreground`** — admin's
  current `:root` block doesn't declare them (confirmed by reading the file; no popover-consuming
  component exists in `apps/admin/src/components/ui/`), so this task doesn't introduce new unused
  tokens.

- [ ] **Step 1: Replace the `:root` block**

Replace the `:root { ... }` block (currently lines 6–20) with:

```css
:root {
  --background: 40 60% 98%; /* sand-50 */
  --foreground: 231 49% 15%; /* navy-900 */
  --card: 0 0% 100%;
  --card-foreground: 231 49% 15%;
  --primary: 4 71% 43%; /* red-600 */
  --primary-foreground: 0 0% 100%;
  --secondary: 37 45% 94%; /* sand-100 */
  --secondary-foreground: 231 49% 15%;
  --muted: 37 45% 94%; /* sand-100 */
  --muted-foreground: 34 19% 36%; /* sand-600 */
  --accent: 5 73% 97%; /* red-50 — see Task 1's note on the source doc's typo */
  --accent-foreground: 4 71% 43%; /* red-600 */
  --destructive: 4 71% 43%; /* red-600 */
  --destructive-foreground: 0 0% 100%;
  --border: 35 30% 81%; /* sand-300 */
  --input: 35 30% 81%; /* sand-300 */
  --ring: 4 64% 51%; /* red-500 */
  --radius: 0.625rem; /* was 0.5rem */
}
```

- [ ] **Step 2: Verify formatting**

```bash
cd apps/admin && pnpm exec prettier --check src/app/globals.css
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/globals.css
git commit -m "feat(admin): retheme globals.css to BOMY brand tokens"
```

---

### Task 5: Add font loading to `apps/admin` (layout.tsx + tailwind.config.ts)

**Files:**

- Modify: `apps/admin/src/app/layout.tsx:1-20`
- Modify: `apps/admin/tailwind.config.ts:1-43`

**Interfaces:**

- Consumes: `next/font/google`'s `Plus_Jakarta_Sans`/`IBM_Plex_Mono` (same as Task 3).
- Produces: `--font-sans`/`--font-mono` CSS vars on `<html>`, and Tailwind's `font-sans`/`font-mono`
  utilities now resolving to them via the new `fontFamily` config key.
- **These two files must ship together** — the CSS vars from `layout.tsx` are inert without
  `tailwind.config.ts` teaching Tailwind's `font-sans`/`font-mono` utilities to read them (Tailwind
  defaults to its own hardcoded system-font stack otherwise), and the config addition is pointless
  without the vars existing.

- [ ] **Step 1: Add font loading to `apps/admin/src/app/layout.tsx`**

Add the import (alongside the existing `Metadata` import):

```ts
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"
```

Add the font objects (before the `metadata` export):

```ts
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-sans",
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
})
```

Replace:

```tsx
    <html lang="en">
      <body className="flex min-h-screen">
```

with:

```tsx
    <html lang="en" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}>
      <body className={`flex min-h-screen ${plusJakartaSans.className}`}>
```

- [ ] **Step 2: Add `fontFamily` mapping to `apps/admin/tailwind.config.ts`**

Add the import at the top:

```ts
import { fontFamily } from "tailwindcss/defaultTheme"
```

Inside `theme.extend`, add (alongside the existing `colors`/`borderRadius` keys):

```ts
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
        mono: ["var(--font-mono)", ...fontFamily.mono],
      },
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @bomy/admin typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/layout.tsx apps/admin/tailwind.config.ts
git commit -m "feat(admin): add Plus Jakarta Sans + IBM Plex Mono font wiring (was unset)"
```

---

### Task 6: Full verification — typecheck, lint, tests, and a real browser check

This is a pure visual/config retheme — there's no new logic to unit-test, so the meaningful "test"
here is (a) nothing broke, and (b) it actually looks right in a running browser. Per this project's
convention (`CLAUDE.md`: "For UI or frontend changes... test the golden path... in a browser before
reporting the task as complete"), don't skip Step 5.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck both apps**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/admin typecheck
```

Expected: both pass.

- [ ] **Step 2: Lint both apps**

```bash
pnpm --filter @bomy/web lint
pnpm --filter @bomy/admin lint
```

Expected: both pass (`--max-warnings 0` is enforced repo-wide).

- [ ] **Step 3: Run existing test suites**

```bash
pnpm --filter @bomy/web test --run
pnpm --filter @bomy/admin test --run
```

Expected: same pass counts as before this plan (this retheme changes no component markup or class
names, only CSS-variable values and font loading, so no test should be sensitive to it — a
regression here means something unexpected got touched).

- [ ] **Step 4: `git diff --check`**

```bash
git diff --check origin/main..HEAD
```

Expected: clean.

- [ ] **Step 5: Real browser check (the actual gate for a visual PR)**

Start local infra + dev servers if not already running:

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
pnpm dev
```

Open `http://localhost:3000` (web) and `http://localhost:3002` (admin, sign in first). Confirm:

- Background reads as warm sand, not white/grey; body text reads as dark navy, not near-black.
- Any visible button/badge/card uses the new red primary + rounded (`0.625rem`) corners, not the
  old indigo.
- Body font is visibly Plus Jakarta Sans (rounder, warmer than Inter) — check browser devtools
  computed `font-family` on `<body>` if it's hard to tell by eye.
- No layout breakage, no invisible text (a wrong foreground/background pairing would show as
  unreadable contrast — check at least one card and one button).

Take a screenshot of both apps' current pages for the PR description.

- [ ] **Step 6: Stop the dev server**

Per this project's session-end convention — leave Docker containers running, stop only the dev
server processes.

---

## Follow-ups (not in this plan's scope)

- Fix `docs/design-system/README.md`'s `--accent` HSL typo (`5 5% 97%` → `5 73% 97%`) in a small
  separate docs PR, citing this plan's Task 1 verification as the source.
- Dark mode is not wired up; when it is, port `docs/design-system/tokens/colors.css`'s `.dark`
  section using the same HSL-conversion method used here.
- No new components (Select, Checkbox, RadioGroup, Switch, Field, Dialog, Toast, EmptyState,
  DataTable) and no screen rebuilds — those are `docs/design-system/README.md` §3–§4, explicitly
  out of scope for "no page rebuilds yet." Ask Charlie before starting that work.
