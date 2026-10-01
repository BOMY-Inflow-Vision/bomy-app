# BOMY Shared UI Package — PR 1 (Scaffold + Tokens + Button) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `@bomy/ui` shared package, wire both `apps/web` and `apps/admin` to consume
it, align admin's missing design tokens, and move `Button` into the shared package as the first
migrated component — with web's version as the source of truth.

**Architecture:** New workspace package `packages/ui`, following the exact shape of the existing
`packages/shared` package (raw TS/TSX source, no build step, explicit named exports). Both Next.js
apps consume it via the already-proven `transpilePackages` + `extensionAlias` pattern used for
`@bomy/db` et al., plus a Tailwind `content`-glob addition that pattern doesn't cover.

**Tech Stack:** pnpm workspaces, Next.js 15 + React 19 (both apps), Tailwind CSS, `class-variance-authority`, `@radix-ui/react-slot`.

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md`

## Global Constraints

- `packages/ui` ships raw `.ts`/`.tsx` source only — no build step, matching every other BOMY
  package.
- Internal imports inside `packages/ui` use relative paths (`../lib/utils`), never a `@/*` alias —
  the package defines no alias of its own.
- Web's `button.tsx` is the source of truth when unifying with admin's (web has a `shrink-0`
  long-label fix admin's copy lacks) — do not silently drop that fix.
- No compatibility re-export shims: once `Button` moves, every importer updates to
  `@bomy/ui/button` directly; the old local `components/ui/button.tsx` files are deleted, not kept
  as re-exports.
- Every step that touches app code ends with that app's own `typecheck`, `lint`, and `test` passing
  before moving to the next step.

## Review Focus

- A class used only inside `packages/ui/src/components/button.tsx` (e.g. `ease-spring`,
  `rounded-control`) must actually appear in each app's _built_ CSS, not just compile without
  error — the Tailwind content-glob fix is the thing most likely to look fine in dev (cached) and
  silently fail in a fresh build.
- Admin's `Button` must render identically to web's post-migration, including the long-label
  `shrink-0` fix — a naive merge could keep admin's older, buggier layout instead of web's fixed
  one.
- `prefers-reduced-motion` must still suppress the slide/arrow animation in both apps after the
  move — this is exactly the kind of thing that silently breaks when a `motion-reduce:` class
  survives a copy-paste but the consuming app's Tailwind config doesn't generate it.
- The focus-visible ring must still render correctly on `Button` in both apps — easy to lose if the
  `ring` color token isn't actually the same in both apps' `tailwind.config.ts`.
- `pnpm install` at the repo root must succeed and correctly link the new workspace package before
  any app-level command is trusted — a stale lockfile is a common silent failure mode here.

---

### Task 1: Scaffold `packages/ui`

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/lib/utils.ts`

**Interfaces:**

- Produces: `cn(...)` — a `clsx` + `tailwind-merge` class-name combiner, exported from
  `@bomy/ui/lib/utils`. Same signature as every app's existing local `cn()`
  (`(...inputs: ClassValue[]) => string`).

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@bomy/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./lib/utils": "./src/lib/utils.ts"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/react": "^19.0.0",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1"
  },
  "scripts": {
    "lint": "eslint src --max-warnings 0",
    "typecheck": "tsc --noEmit"
  }
}
```

Check the exact `clsx`/`tailwind-merge` versions already used in `apps/web/package.json` /
`apps/admin/package.json` first (`grep -n '"clsx"\|"tailwind-merge"' apps/web/package.json`) and
match them here rather than the versions shown above if they differ — the goal is one consistent
version across the whole repo, not introducing a second one.

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "verbatimModuleSyntax": false,
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/ui/src/lib/utils.ts`**

Copy the exact contents of `apps/web/src/lib/utils.ts` (its `cn()` implementation) verbatim — do
not reimplement from memory, to guarantee identical merge behavior to what both apps already use.

- [ ] **Step 4: Install and verify the new package links**

Run: `pnpm install` from the repo root (`app/`).
Expected: completes with no errors; `packages/ui` appears as a workspace package (check
`node_modules/@bomy/ui` in either app resolves to a symlink into `packages/ui`).

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): scaffold @bomy/ui shared package"
```

---

### Task 2: Wire `apps/web` to consume `@bomy/ui`

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/tailwind.config.ts:7`

**Interfaces:**

- Consumes: `@bomy/ui` package created in Task 1.

- [ ] **Step 1: Add the workspace dependency**

In `apps/web/package.json`, add to `dependencies`: `"@bomy/ui": "workspace:*"` — place it
alphabetically alongside the existing `"@bomy/db"`, `"@bomy/mailer"` etc. entries.

- [ ] **Step 2: Add to `transpilePackages`**

In `apps/web/next.config.ts`, find the existing line:

```ts
transpilePackages: ["@bomy/db", "@bomy/mailer", "@bomy/hitpay", "@bomy/shared"],
```

Change it to:

```ts
transpilePackages: ["@bomy/db", "@bomy/mailer", "@bomy/hitpay", "@bomy/shared", "@bomy/ui"],
```

- [ ] **Step 3: Extend the Tailwind content glob**

In `apps/web/tailwind.config.ts`, change:

```ts
content: ["./src/**/*.{ts,tsx}"],
```

to:

```ts
content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
```

- [ ] **Step 4: Run `pnpm install` again, then verify web still builds clean**

Run: `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint`
Expected: both pass with no errors (nothing consumes `@bomy/ui` yet, so this just confirms the
wiring itself doesn't break anything).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/next.config.ts apps/web/tailwind.config.ts
git commit -m "feat(web): wire up @bomy/ui workspace package"
```

---

### Task 3: Wire `apps/admin` to consume `@bomy/ui`, and align its missing design tokens

**Files:**

- Modify: `apps/admin/package.json`
- Modify: `apps/admin/next.config.ts`
- Modify: `apps/admin/tailwind.config.ts`
- Modify: `apps/admin/src/app/globals.css`

**Interfaces:**

- Consumes: `@bomy/ui` package created in Task 1.

- [ ] **Step 1: Add the workspace dependency**

Same as Task 2 Step 1, in `apps/admin/package.json`.

- [ ] **Step 2: Add to `transpilePackages`**

Same as Task 2 Step 2, in `apps/admin/next.config.ts`.

- [ ] **Step 3: Extend the Tailwind content glob**

Same as Task 2 Step 3, in `apps/admin/tailwind.config.ts`.

- [ ] **Step 4: Add the missing `popover`, `subtle`, and `container` config**

Read `apps/web/tailwind.config.ts`'s `theme.container` block and the `popover` / `subtle` entries
inside `theme.extend.colors`. Add matching entries to `apps/admin/tailwind.config.ts`'s
`theme`/`theme.extend.colors` — copy the exact same shape (`popover: { DEFAULT:
"hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" }`, `subtle:
"hsl(var(--border-subtle))"`, and the `container: { center: true, padding: "2rem", screens: {
"2xl": "1400px" } }` block), since admin currently has none of the three.

- [ ] **Step 5: Add the missing CSS custom properties**

Read `apps/web/src/app/globals.css`'s `--popover`, `--popover-foreground`, and `--border-subtle`
values for both the light-mode block and the dark-mode block. Add matching declarations to
`apps/admin/src/app/globals.css` in both its light and dark blocks, using the same values as web
(one shared design system means one set of token values, not admin inventing its own).

- [ ] **Step 6: Run `pnpm install` again, then verify admin still builds clean**

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint`
Expected: both pass with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/package.json apps/admin/next.config.ts apps/admin/tailwind.config.ts apps/admin/src/app/globals.css
git commit -m "feat(admin): wire up @bomy/ui workspace package and align missing design tokens"
```

---

### Task 4: Move `Button` into `packages/ui`

**Files:**

- Create: `packages/ui/src/components/button.tsx`
- Modify: `packages/ui/package.json` (add the `./button` export)

**Interfaces:**

- Consumes: `cn` from `../lib/utils.js` (Task 1).
- Produces: `Button`, `buttonVariants`, `ButtonProps` — same public shape as the current
  `apps/web/src/components/ui/button.tsx` (the version being kept).

- [ ] **Step 1: Copy web's `button.tsx` into the package**

Copy `apps/web/src/components/ui/button.tsx` to `packages/ui/src/components/button.tsx` verbatim
first, then make exactly one change: the import line

```ts
import { cn } from "@/lib/utils"
```

becomes

```ts
import { cn } from "../lib/utils.js"
```

Note the `.js` extension, not `.ts` — `packages/ui/tsconfig.json` uses `NodeNext` module
resolution (Task 1 Step 2), and every other BOMY package already writes relative imports this way
(`.js` specifier pointing at the `.ts` source file) under that same setting. Dropping the extension
here would compile but fail to resolve at runtime.

No other changes — this step is a relocation, not a rewrite. Do not "clean up" or refactor
anything else in the same step; that would make it impossible to tell a real behavior change from
noise if something breaks later.

- [ ] **Step 2: Add the `./button` export**

In `packages/ui/package.json`, add to `exports`:

```json
"./button": "./src/components/button.tsx"
```

- [ ] **Step 3: Declare every package `button.tsx` actually imports**

`button.tsx` imports from `react`, `@radix-ui/react-slot`, `class-variance-authority`, and
`lucide-react` (the `ArrowRight` icon used by `SlideContent`). All four must be real dependencies
of `@bomy/ui`, not just assumed — check each one's exact version in `apps/web/package.json` and
match it in `packages/ui/package.json`'s `dependencies` (React stays a `peerDependency`, already
declared in Task 1; the other three are regular `dependencies`).

- [ ] **Step 4: Typecheck the package on its own**

Run: `pnpm --filter @bomy/ui typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Button component"
```

---

### Task 5: Point `apps/web` at the shared `Button`

**Files:**

- Delete: `apps/web/src/components/ui/button.tsx`
- Modify: every file in `apps/web/src` that imports from `@/components/ui/button`

**Interfaces:**

- Consumes: `Button`, `buttonVariants`, `ButtonProps` from `@bomy/ui/button`.

- [ ] **Step 1: Find every importer**

Run: `grep -rl '@/components/ui/button' apps/web/src apps/web/tests`
This must cover `tests/` as well as `src/` — `apps/web/tests/components/ui/button.test.tsx`
imports the local file too, and would otherwise break silently once it's deleted in Step 3. This
is the exact list of files Step 2 must update.

- [ ] **Step 2: Update every importer**

In each file found, change:

```ts
import { Button } from "@/components/ui/button"
```

(or whatever the exact named-import list is in that file — some may also import `buttonVariants`
or `ButtonProps`) to:

```ts
import { Button } from "@bomy/ui/button"
```

Keep the rest of each import line's named imports identical — only the module specifier changes.

- [ ] **Step 3: Delete the local copy**

```bash
rm apps/web/src/components/ui/button.tsx
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint && pnpm --filter @bomy/web test --run`
Expected: all three pass. A typecheck or test failure here almost always means Step 1's grep
missed an importer (e.g. one using a relative path instead of the `@/` alias) — re-grep more
broadly (`grep -rl "components/ui/button" apps/web`) if so.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/tests
git commit -m "refactor(web): consume Button from @bomy/ui"
```

---

### Task 6: Point `apps/admin` at the shared `Button`

**Files:**

- Delete: `apps/admin/src/components/ui/button.tsx`
- Modify: every file in `apps/admin/src` that imports from `@/components/ui/button`

**Interfaces:**

- Consumes: `Button`, `buttonVariants`, `ButtonProps` from `@bomy/ui/button`.

Identical process to Task 5, scoped to `apps/admin/src` instead of `apps/web/src`. This is where
admin gains web's `shrink-0` long-label fix — expected and intentional, not a regression to
second-guess.

- [ ] **Step 1: Find every importer**

Run: `grep -rl '@/components/ui/button' apps/admin/src apps/admin/tests`
Covers `apps/admin/tests/components/ui/button.test.tsx` as well as `src/` — same reason as Task 5
Step 1.

- [ ] **Step 2: Update every importer** (same pattern as Task 5 Step 2)

- [ ] **Step 3: Delete the local copy**

```bash
rm apps/admin/src/components/ui/button.tsx
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint && pnpm --filter @bomy/admin test --run`
Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src apps/admin/tests
git commit -m "refactor(admin): consume Button from @bomy/ui"
```

---

### Task 7: Live verification in both apps

**Files:** none (verification only).

- [ ] **Step 1: Start both dev servers**

Run: `pnpm dev` from the repo root (starts web on :3000, api on :3001, admin on :3002).

- [ ] **Step 2: Check every `Button` variant in web**

Visit a page using each variant (`default`, `outline`, `destructive`, `secondary`, `reward`,
`ghost`, `link`) — the products page, cart page, and checkout form between them cover most
variants. Confirm each renders with the correct color/border/shadow.

- [ ] **Step 3: Check the long-label fix survived in both apps**

Find a `Button` with a long label in web (e.g. the membership page's "Join now — RM75/yr" button)
and confirm the label doesn't clip. Find an equivalent long-label button in admin (or add a
throwaway one temporarily to check, then remove it) and confirm admin now matches web's fixed
behavior, not its own previous clipped one.

- [ ] **Step 4: Check the focus-visible ring in both apps**

Tab to a `Button` with the keyboard in each app; confirm the focus ring renders (not invisible or
mis-colored — this is the class most likely to silently break if the Tailwind content-glob fix in
Task 2/3 Step 3 is wrong).

- [ ] **Step 5: Check `prefers-reduced-motion` in both apps**

Using the browser automation tools, override `window.matchMedia` for
`(prefers-reduced-motion: reduce)` to return `matches: true` (same technique already used
elsewhere in this project — see the cart-badge reduced-motion check from earlier work), then
confirm a `Button` with an `icon` prop no longer slides on hover in either app. Restore normal
`matchMedia` behavior afterward.

- [ ] **Step 6: Stop the dev servers**

Per BOMY's own session-end convention — leave no background dev server running once verification is
done.

---

### Task 8: PR log entry — run this AFTER the PR merges, not before

BOMY's convention is one log entry per **merged** PR, written before the next PR starts — not a
pre-merge implementation task. Do not run this until Charlie has actually merged the PR opened
from Tasks 1–7.

**Files:**

- Create: `log/2026-09-30_PR<N>_bomy-ui-package-pr1.md` (path is relative to the repo root, i.e.
  `app/` when already inside it — not `app/log/...`; use the actual next PR number, checked
  against the highest existing `_PR<N>_` file under `log/` at merge time, not guessed now).

- [ ] **Step 1: Write the log entry**

Follow the existing log-entry convention (see any recent file under `log/` for the exact shape):
what shipped, what was verified, and any follow-ups carried forward (PRs 2–5 of the
shared-UI-package roadmap, per the spec).

- [ ] **Step 2: Do not commit**

`log/` is gitignored on purpose (`app/CLAUDE.md`: synced across machines via
`bomy-export`/`bomy-import`, never committed). Just write the file to disk and leave it untracked
— there is no `git add`/`git commit` step for this task.
