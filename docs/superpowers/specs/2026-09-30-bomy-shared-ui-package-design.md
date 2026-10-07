# BOMY Shared UI Package (`@bomy/ui`) — Design

**Status:** Approved by Charlie, with corrections from Bob (2026-09-30). Ready for implementation
planning.

## Goal

`apps/web` (buyer/seller storefront) and `apps/admin` (internal ops console) each keep a fully
independent copy of their shadcn-style UI primitives today. The copies have already drifted —
admin is missing color tokens web has, and web has a text-clipping fix on `Button` that admin
lacks. Charlie wants one shared design system across both apps, built on real shadcn/ui, while
explicitly preserving BOMY's existing button/link hover-motion animations. Bob (reviewing
strategist-developer) recommended fixing the root cause — the lack of a shared package — rather
than re-aligning the two copies by hand.

This is staged as a sequence of small PRs, each independently reviewable and shippable, per BOMY's
normal PR workflow. No PR beyond PR 1 starts until the previous one has merged.

## Current state (confirmed by direct inspection, 2026-09-30)

- `web`: 105 `.tsx` files under `src/app`, already through a full shadcn/brand-token/WCAG pass
  (PR #86). `select.tsx` is fully hand-rolled (not Radix). 3 hand-rolled dropdown/popover-style
  surfaces: the nav-bar seller menu (built today, click-toggle, no Radix), the mobile nav panel,
  and a toolbar dropdown inside the rich-text editor (`body-editor.tsx`).
- `admin`: 47 `.tsx` files under `src/app` — a much smaller surface. Never initialized with the
  shadcn CLI (no `components.json`). Its `select.tsx` is the same hand-rolled pattern as web's. One
  hand-rolled popover (`brand-story-field.tsx`, a form-field hint box).
- Neither app shares UI code today — `packages/` only has `config`, `db`, `hitpay`, `mailer`,
  `shared`. `packages/ui` does not exist.
- Both apps only have `@radix-ui/react-label` and `@radix-ui/react-slot` installed. Nothing for
  dropdown-menu, select, or popover.
- Both apps already use the identical, proven pattern for consuming a raw-TypeScript workspace
  package: `transpilePackages` in `next.config.ts` plus a `.js → .ts` `webpack.resolve.extensionAlias`
  fix (documented gotcha: Turbopack doesn't support the latter, so dev scripts use plain `next dev`).
  This same pattern already works for `@bomy/db`, `@bomy/mailer`, `@bomy/hitpay`, `@bomy/shared` in
  both apps — reused as-is for `@bomy/ui`.
- **Tailwind content globs are a separate problem from `transpilePackages`.** Both
  `apps/web/tailwind.config.ts:7` and `apps/admin/tailwind.config.ts:7` currently read
  `content: ["./src/**/*.{ts,tsx}"]` — scoped to each app's own `src/`. `transpilePackages` only
  makes Next.js able to _compile_ `@bomy/ui`'s source; it does nothing for Tailwind's JIT scanner.
  Without adding the shared package's source to `content`, any class used only inside a shared
  component is silently missing from the built CSS. Caught by Bob's review — must be fixed in PR 1.
- Admin's `tailwind.config.ts` and `globals.css` are missing 3 things web's has: the `popover`
  color mapping (+ `--popover`/`--popover-foreground` CSS vars), the `subtle` border-color mapping
  (+ `--border-subtle` CSS var), and the `container` centering block.
- Web's `button.tsx` has a `shrink-0` guard on its label row (prevents text clipping on long
  labels) that admin's copy is missing. When unifying, **web's version is the source of truth** —
  not an arbitrary pick between the two.

## Package shape

`packages/ui` → published internally as `@bomy/ui`. Follows BOMY's existing package convention
exactly (see `packages/shared/package.json`, `packages/db/package.json`): raw `.ts`/`.tsx` source,
no build step, explicit named exports per file (not shadcn's own wildcard `"./components/*"`
export style — BOMY's existing packages all use one named export per module, so `@bomy/ui` matches
that instead of introducing a second convention).

```
packages/ui/
├── src/
│   ├── components/       # button.tsx, button-group.tsx, ... (grows PR by PR)
│   └── lib/
│       └── utils.ts       # cn() — the shared package's own copy, no @/ alias
├── package.json
└── tsconfig.json
```

`package.json` (shape matches `packages/shared`). This is PR 1's actual shipped shape — it exports
only `button` (and the `lib/utils` entry components import internally); `button-group` is not part
of PR 1 and stays out of this file's `exports` until whichever future PR actually moves it into
`@bomy/ui`:

```json
{
  "name": "@bomy/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./lib/utils": "./src/lib/utils.ts",
    "./button": "./src/components/button.tsx"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.511.0",
    "tailwind-merge": "^3.3.0"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/react": "^19.1.0",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1"
  }
}
```

(exact dependency versions confirmed against each app's own `package.json` at implementation time,
not guessed here. `lucide-react` is a real `dependency`, not a `peerDependency` or
`devDependency` — `Button` renders its `ArrowRight` icon at runtime, so the package that ships
`Button` must declare it as code it actually runs.)

`tsconfig.json` (shape matches `packages/shared`, plus JSX since components live here now):

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

Inside `packages/ui`, components import `cn` via a **relative path with a `.js` specifier**
(`../lib/utils.js`, resolving to the `.ts` source — required under this package's `NodeNext`
module resolution), not an `@/*` alias — the package has no alias configuration of its own,
keeping it simple and avoiding a second alias convention to maintain.

## Required changes in both consuming apps (PR 1)

1. `apps/web/package.json` and `apps/admin/package.json`: add `"@bomy/ui": "workspace:*"`.
2. `apps/web/next.config.ts` and `apps/admin/next.config.ts`: add `"@bomy/ui"` to the existing
   `transpilePackages` array — the exact same fix already applied for `@bomy/db` et al.
3. `apps/web/tailwind.config.ts:7` and `apps/admin/tailwind.config.ts:7`: extend `content` to also
   scan the shared package, e.g.
   `content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"]`.
4. `apps/admin/tailwind.config.ts`: add the `popover` color mapping, `subtle` border-color mapping,
   and `container` block, copied from `apps/web/tailwind.config.ts`.
5. `apps/admin/src/app/globals.css`: add the missing `--popover` / `--popover-foreground` /
   `--border-subtle` CSS custom properties (both the light-mode and dark-mode values), copied from
   `apps/web/src/app/globals.css`.

## Staged PRs

### PR 1 — Scaffold + token alignment + Button

- Create `packages/ui` (package.json, tsconfig.json, `src/lib/utils.ts` with `cn()`).
- Wire both apps to consume it (the 5 steps above).
- Move `Button` into `packages/ui/src/components/button.tsx`, using **web's** version as the
  starting point (has the long-label `shrink-0` fix admin's copy lacks). Its `cn` import changes
  from `@/lib/utils` to the package's own relative `../lib/utils`.
- Delete the two local `components/ui/button.tsx` copies; update every importer in both apps to
  import from `@bomy/ui/button` — no compatibility re-export shim, matching BOMY's own convention
  of not leaving backwards-compatibility scaffolding around.
- **Verify, in both apps:** every `Button` variant renders correctly, the focus-visible ring shows,
  a long label doesn't clip, and `motion-reduce:` still suppresses the slide/arrow animation
  correctly. This is Bob's explicit checklist for this PR — treat it as the acceptance bar, not
  merely "it compiles."

### PR 2 — Remaining low-risk primitives

Badge, Card, Input, Label, Textarea — the components already closest to unmodified shadcn in both
apps (confirmed by direct inspection: no custom motion, minimal drift). Same move-and-verify
pattern as PR 1, without the token-alignment or scaffolding work (already done in PR 1).

### PR 3 — Shared DropdownMenu + Popover primitives

- Add `@radix-ui/react-dropdown-menu` and `@radix-ui/react-popover` to `packages/ui`'s
  dependencies.
- Build the real shadcn `DropdownMenu`/`Popover` primitives (proper keyboard nav, focus trap,
  portal rendering) into `packages/ui` — replacing the hand-rolled CSS-state approach used for
  today's seller menu.
- Per Bob's correction: **only the primitives move to `@bomy/ui`.** The feature components that
  use them stay local to their own app, rebuilt to consume the shared primitive instead of
  hand-rolled state:
  - `apps/web/src/components/nav-bar.tsx` — the seller account menu (→ `DropdownMenu`)
  - `apps/web/src/components/body-editor.tsx` — `InsertTableButton` (→ `Popover`)
  - `apps/admin/src/components/brand-story-field.tsx` — `InsertTableButton` (→ `Popover`)
    This matches the same "navigation and feature composition stay local" boundary as the mobile nav
    panel, which was never in scope to move.
- No admin hint popover exists; the earlier "hint/preview popover" claim was wrong. Corrected
  2026-10-02.

### PR 4 — Rebuild Select

- Add `@radix-ui/react-select` to `packages/ui`.
- Replace both apps' hand-rolled `select.tsx` with the real shadcn `Select`, built on the shared
  primitive.
- Highest-risk PR in the sequence — tackled last, on purpose. Both apps' current custom `Select`
  relies on a hidden `<input>` for form-submission semantics; the replacement's form behavior needs
  explicit testing in both apps, not just a visual check.
- **Status (2026-10-07):** PR 4 ships **web-only** (#154). The admin Select migration is pending **PR 4b**,
  behind Charlie's own Google-session check on the admin forms (the role selector and the voucher
  type). `@radix-ui/react-select` is pinned to exactly `2.3.3`, because 2.3.4 to 2.3.8 break
  multi-letter typeahead in a minified production build (radix-ui/primitives#4097); see the PR 4 plan.

### PR 5 — Page-level consistency pass

Sharing the primitives doesn't guarantee every screen actually uses them. This PR defines and runs
an audit across both apps' full route surface (105 + 47 files) for: raw HTML controls that should
be a shared component, inline one-off colors/spacing bypassing the shared tokens, and any other
visual inconsistency the earlier PRs didn't touch. Produces a findings list; if the list is large,
it splits into further small follow-up PRs rather than one large sweep — decided once the audit
actually runs, not estimated here. "Done" for this pass means: every route in both apps either uses
a `@bomy/ui` primitive where one exists, or has a documented, deliberate reason it doesn't.

## What stays local, never moves into `@bomy/ui`

Navigation components (nav bars, sidebars), page layouts, and any one-off feature composition
(forms, dashboards, the seller menu, the editor toolbar dropdown, the admin hint box). Only
genuinely reusable, presentation-only primitives move into the shared package.

## Motion — what's explicitly preserved, and what's still open

Preserved everywhere, no exceptions:

- `Button`'s `SlideContent` icon→arrow hover/focus slide (the `ease-spring` motion).
- `button-copy.tsx`'s copy-pop animation (it's a button).
- Link hover states generally.

Left open, decided component-by-component when that PR is reached (not blocking PR 1):
`select.tsx`'s `select-in`/`select-out`/`select-item-in` keyframes, `stepper.tsx`'s `step-pulse`,
`avatar-group.tsx`'s `avatar-pop-in`, `toaster.tsx`'s `toast-in`/`toast-out`, and the cart page's
`wheel-roll-in`/badge-pop animations — none of these sit on a button or link, so whether they carry
over unchanged or fall back to whatever the adopted shadcn/Radix primitive provides by default is a
call to make when that specific component's PR comes up, not a blanket rule set now.

## Verification, every PR

- `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint && pnpm --filter @bomy/web test`
- The same three, filtered to `@bomy/admin`.
- Once `packages/ui` has its own `package.json` scripts (PR 1 onward): the same three, filtered to
  `@bomy/ui`.
- A live browser check in both apps for anything touching interaction or motion — non-negotiable
  for PR 1 given Bob's explicit Button checklist above.

## Model note

BOMY's own model-routing convention (`CLAUDE.md`) defaults to Opus for architecture decisions and
multi-file refactors needing holistic reasoning, used directly with no confirmation needed. This
spec was written on Sonnet 5 (this session's default). Flagging this again before PR 1's actual
code changes start, since that's the point where the convention most directly applies.
