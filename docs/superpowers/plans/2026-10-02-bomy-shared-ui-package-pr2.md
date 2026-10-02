# @bomy/ui PR 2 — Badge, Card, Input, Label, Textarea Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `Badge`, `Card`, `Input`, `Label`, and `Textarea` out of both apps' local `components/ui/` folders into `@bomy/ui`, and point every importer at the shared copy.

**Architecture:** Same move-and-verify pattern as PR 1 (#149), minus all scaffolding/token work (already shipped there). Package shape, the `NodeNext` `.js`-specifier rule, and Tailwind content-glob coverage of `packages/ui/src` are already in place and are not touched here.

**Tech Stack:** React 19, Next.js 15, Tailwind, `class-variance-authority`, `@radix-ui/react-label`.

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (§ "PR 2 — Remaining low-risk primitives").

**Plan revision:** v2, after Bob's review — dropped the mirror unit tests, fixed staging to explicit paths, made the CSS check target selectors distinctive to the moved files.

## Global Constraints

- Copy each component **verbatim**; the only allowed edit is `import { cn } from "@/lib/utils"` → `import { cn } from "../lib/utils.js"` (the `.js` specifier is required by `NodeNext`, same as PR 1's `button.tsx`).
- `label.tsx` keeps its `"use client"` first line. Do not drop it.
- No compatibility re-export shims. Delete the local copies; update every importer.
- Importers must be found with a grep that includes **both** `src` and `tests` of each app (PR 1 lesson).
- Declare every package the moved files import in `packages/ui/package.json` `dependencies`. New this PR: `@radix-ui/react-label` (`^2.1.0`, matching both apps).
- **Never `git add` a directory.** Stage explicit file paths only, then inspect `git diff --cached --stat` before every commit. The untracked `apps/web/src/app/products/loading.tsx` must NOT enter this PR.
- No changes to Select, Dropdown, Popover, or any feature component (PRs 3–5).
- No new unit tests for these five (they would only assert that React renders tags and passed props, which proves nothing about the real risks). Verification is typecheck, lint, existing tests, a production build of both apps, and targeted browser checks.
- Report the two known DATABASE_URL-limited web test files (`tests/auth/magic-link-actions.test.ts`, `tests/auth/consent/actions.test.ts`) as **not evaluated**, never as passed.

## Review Focus

- **`Label` client boundary.** `label.tsx` is `"use client"` (Radix). In web, every file that imports `Label` is already a client file, so web cannot reveal a lost directive. In admin, server-rendered pages import `Label`/`Input` (e.g. `apps/admin/src/app/products/page.tsx`, `seller-inquiries/page.tsx`, `stores/page.tsx`, `goodie-box/page.tsx`, `memberships/page.tsx`, `vouchers/page.tsx`). A **production `next build` of both apps** is the check that would fail if the directive were lost or a server/client boundary broke. Pinned by Tasks 2 and 3.
- **Generated CSS.** PR 1 already added `packages/ui/src` to both Tailwind content globs. Each moved file's own classes must appear as real rules in the built stylesheet. Pinned by Task 4, using selectors distinctive to the moved files.
- **Orphaned dependency.** After `label.tsx` leaves each app, `@radix-ui/react-label` is unused there. Remove it from each app's `package.json` only after grep shows zero remaining users.
- **Multiple `Card` exports.** Every named export used by any importer must still resolve. Pinned by typecheck.
- **Stray file in the PR.** `products/loading.tsx` is untracked and unrelated. Pinned by the explicit-staging rule above.

---

### Task 1: Move the five components into `packages/ui`

**Files:**

- Create: `packages/ui/src/components/{badge,card,input,label,textarea}.tsx`
- Modify: `packages/ui/package.json` (exports + `@radix-ui/react-label` dependency)
- Add (already written, currently untracked): this plan file, `docs/superpowers/plans/2026-10-02-bomy-shared-ui-package-pr2.md`

- [ ] **Step 1: Copy each file and fix the one import**

```bash
for c in badge card input label textarea; do
  cp apps/web/src/components/ui/$c.tsx packages/ui/src/components/$c.tsx
  sed -i '' 's|from "@/lib/utils"|from "../lib/utils.js"|' packages/ui/src/components/$c.tsx
done
```

Confirm each differs from the web original by exactly that one line, and `label.tsx` still starts with `"use client"`:

```bash
for c in badge card input label textarea; do diff apps/web/src/components/ui/$c.tsx packages/ui/src/components/$c.tsx; done
head -1 packages/ui/src/components/label.tsx
```

Expected: one changed import line per file; `"use client"` printed.

- [ ] **Step 2: Update `packages/ui/package.json`**

Add to `exports` (keep existing entries):

```json
"./badge": "./src/components/badge.tsx",
"./card": "./src/components/card.tsx",
"./input": "./src/components/input.tsx",
"./label": "./src/components/label.tsx",
"./textarea": "./src/components/textarea.tsx"
```

Add to `dependencies`: `"@radix-ui/react-label": "^2.1.0"`.

- [ ] **Step 3: Install and check the package**

```bash
pnpm install
pnpm --filter @bomy/ui typecheck
pnpm --filter @bomy/ui lint
```

Expected: all clean.

- [ ] **Step 4: Commit (explicit paths)**

```bash
git add packages/ui/package.json pnpm-lock.yaml \
  packages/ui/src/components/badge.tsx packages/ui/src/components/card.tsx \
  packages/ui/src/components/input.tsx packages/ui/src/components/label.tsx \
  packages/ui/src/components/textarea.tsx \
  docs/superpowers/plans/2026-10-02-bomy-shared-ui-package-pr2.md
git diff --cached --stat
```

Inspect the stat: only the files named above. Then:

```bash
git commit -m "feat(ui): add Badge, Card, Input, Label, Textarea"
```

---

### Task 2: Point `apps/web` at the shared primitives

**Files:**

- Modify: every web file importing the five (src + tests)
- Delete: `apps/web/src/components/ui/{badge,card,input,label,textarea}.tsx`
- Modify: `apps/web/package.json` (remove `@radix-ui/react-label` only if unused)

- [ ] **Step 1: Find every importer, and save the list**

```bash
grep -rlE '"@/components/ui/(badge|card|input|label|textarea)"' apps/web/src apps/web/tests | sort > "$SCRATCH/web-importers.txt"
wc -l "$SCRATCH/web-importers.txt"
```

(`$SCRATCH` = the session scratchpad directory. The saved list is what Step 6 stages — no directory-level `git add`.)

- [ ] **Step 2: Rewrite the imports**

```bash
xargs sed -i '' -E 's#"@/components/ui/(badge|card|input|label|textarea)"#"@bomy/ui/\1"#g' < "$SCRATCH/web-importers.txt"
```

Re-run the Step 1 grep. Expected: no output.

- [ ] **Step 3: Delete the five local copies**

```bash
git rm apps/web/src/components/ui/{badge,card,input,label,textarea}.tsx
```

- [ ] **Step 4: Remove the orphaned dependency**

```bash
grep -rn "@radix-ui/react-label" apps/web/src
```

If no output, remove `"@radix-ui/react-label"` from `apps/web/package.json`, then `pnpm install`.

- [ ] **Step 5: Verify, including a production build**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
pnpm --filter @bomy/web test --run
pnpm --filter @bomy/web build
```

Expected: typecheck, lint, build clean; tests pass except the two DATABASE_URL-limited files (report as not evaluated). If the build needs env vars absent from this shell, say exactly which and treat the build as **not evaluated here** (CI builds it) — do not claim it passed.

- [ ] **Step 6: Commit (explicit paths from the saved list)**

```bash
xargs git add < "$SCRATCH/web-importers.txt"
git add apps/web/package.json pnpm-lock.yaml
git status --short | grep -v '^??'
git diff --cached --stat
```

Inspect: the staged set must be exactly the importers, the five deletions, `package.json` (if changed), and the lockfile. `apps/web/src/app/products/loading.tsx` must not appear. Then:

```bash
git commit -m "refactor(web): consume Badge/Card/Input/Label/Textarea from @bomy/ui"
```

---

### Task 3: Point `apps/admin` at the shared primitives

Identical to Task 2 with `apps/admin` substituted for `apps/web` everywhere (importer list saved to `$SCRATCH/admin-importers.txt`; grep both `src` and `tests`; delete admin's five local files; remove admin's `@radix-ui/react-label` if unused; typecheck, lint, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/admin build`; explicit-path staging with a `git diff --cached --stat` inspection). The admin production build is the key `Label` client-boundary check (Review Focus). Commit message: `refactor(admin): consume Badge/Card/Input/Label/Textarea from @bomy/ui`.

---

### Task 4: Targeted browser checks

- [ ] **Step 1: Start dev servers** (`pnpm --filter @bomy/web dev`, `pnpm --filter @bomy/admin dev`; kill stale processes on 3000/3002 first).
- [ ] **Step 2: Web pages.** `/seller/apply` (a client page: Input, Label, Textarea render and accept typing; Label click focuses its Input) and `/products` (Badge). For Card, sign in locally as a `seller_owner` (docker psql + Mailhog magic link) and load `/seller/dashboard/settings`.
- [ ] **Step 3: CSS proof via `document.styleSheets`.** Confirm real generated rules exist for selectors distinctive to the moved files, not classes shared with other components:
  - Input: `file:bg-transparent` (the `file:` variant)
  - Textarea: `min-h-[60px]`
  - Label: `peer-disabled:opacity-70`
  - Badge and Card: read the class strings in `badge.tsx` / `card.tsx` and pick one class unique to each (e.g. a Badge variant class).
    Print every selector checked and its result; a missing rule is a failure, not a skip.
- [ ] **Step 4: Admin.** Admin sign-in is Google-only and `/auth/sign-in` renders none of these five components. If no signed-in admin session is available, do **not** claim visual coverage: report admin's signed-in visual rendering as **unverified**, with the production build (Task 3) as its only evidence for the `Label` boundary. If a signed-in session is available, repeat Step 3 on `/products` and `/seller-inquiries`.
- [ ] **Step 5: Stop both dev servers** and confirm ports 3000/3002 are clear.

---

### Task 5: PR log entry — run AFTER the PR merges

Write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr2.md` (path relative to the `app/` repo root; `<N>` = actual merged PR number, checked against the highest existing `_PR<N>_` file at merge time). `log/` is gitignored: write the file, do **not** `git add` or commit it.
