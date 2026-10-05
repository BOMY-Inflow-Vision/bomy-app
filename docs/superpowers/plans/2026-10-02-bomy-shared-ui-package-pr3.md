# @bomy/ui PR 3 — DropdownMenu + Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v3 — v2 revised after Bob's review (4 plan changes + 4 decisions), then corrected again after the read-only Opus review (10 findings, 2 of them verified blockers; see "Opus review outcome" below). Do not start Task 1 until Charlie approves v3.**

**Goal:** Add shadcn's real `DropdownMenu` and `Popover` primitives (Radix-based) to `@bomy/ui`, and rebuild the three hand-rolled floating panels in the two apps on top of them, so they get real keyboard handling, focus return, outside-click/Escape dismissal, and portal rendering.

**Architecture:** Primitives live in `packages/ui` (shared). The feature components that use them stay local to their app (spec boundary, per Bob). Open/close animation reuses BOMY's existing `select-in`/`select-out` keyframes instead of adding the `tailwindcss-animate` plugin.

**Tech Stack:** React 19, Next.js 15, Tailwind 3.4, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`.

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (§ "PR 3"). **Spec correction:** the spec names an admin "hint/preview popover" in `brand-story-field.tsx`. No such thing exists (the only "hint" in admin is a code comment). The real admin consumer is that file's own copy of `InsertTableButton`. This plan uses the real list below.

## What is being replaced (verified in the repo)

| #   | Where                                                                               | What it is today                                                                                                                                    | Becomes                         |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | `apps/web/src/components/nav-bar.tsx` — `SellerAccountMenu`                         | "..." button + hand-rolled panel holding one link ("Seller"); manual Escape + mousedown handlers; `aria-controls` disclosure from #151              | `DropdownMenu` (see Decision 1) |
| 2   | `apps/web/src/components/body-editor.tsx` — `InsertTableButton` (~line 638)         | Toolbar button + hand-rolled panel with Rows/Columns number inputs and an Insert button; mousedown outside-click only, no Escape, no focus handling | `Popover`                       |
| 3   | `apps/admin/src/components/brand-story-field.tsx` — `InsertTableButton` (~line 342) | Near-copy of #2 (small styling differences)                                                                                                         | `Popover`                       |

Everything else that closes on outside click (`ui/select.tsx` in both apps) is **PR 4**, not touched here.

## Decisions (answered in Bob's review of v1)

1. **Seller menu → shared `DropdownMenu`: YES.** Once it renders a real ARIA menu, `aria-haspopup="menu"` is truthful (this retires #151's disclosure attributes on purpose). Radix supplies the menu keyboard and focus behaviour.
2. **Primitives → full upstream shadcn files** with only the stated BOMY adaptations (Task 1). Record the fetched registry source and the resolved Radix versions in the PR.
3. **Admin browser check → YES, localhost-only test cookie**, under these conditions: (a) first confirm `apps/admin/.env.local` points at local Docker (`localhost:5432`) and pick a seeded `@test.bomy` admin; (b) use `http://127.0.0.1:3002` (not `localhost`) so the cookie cannot overwrite the web seller session, because cookies are shared across ports on one hostname; (c) clear the cookie afterward; (d) report it as _protected-UI verification_, **not** a test of Google sign-in; (e) never print the cookie or secret, and never commit/log them.
4. **Model split.** Sonnet for the mechanical source copy (Task 1) and the contained edits. **Opus for the focus/keyboard integration review**: (i) a read-only Opus review of this revised plan before approval (**done; outcome below**), and (ii) a read-only Opus review of the Task 2–4 diff before the PR is opened. Per `app/CLAUDE.md`, Opus runs as a fresh dispatched agent (`model: "opus"`), not a fork. Findings are fixed by Sonnet.

## Opus review outcome (read-only, on plan v2)

Opus read the Radix 1.1.23 / 2.1.24 dist, Tiptap 3.27.1, upstream shadcn, and the repo. Disposition of its 10 findings (the 2 marked ✔ were re-verified by me before acting):

| #   | Sev  | Finding                                                                                                   | Disposition                                                                                           |
| --- | ---- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | High | Upstream `DropdownMenuCheckboxItem` `checked={checked}` fails strict `tsc` (`exactOptionalPropertyTypes`) | ✔ verified; fourth edit added (Global Constraints (d), Task 1 Step 2)                                 |
| 2   | High | `motion-reduce:animate-none` loses to `data-[state=…]` on specificity, so reduced motion would not work   | Fixed with `motion-reduce:data-[state=…]:animate-none`; verified from CSS in Step 3                   |
| 3   | Med  | "Failed insert returns focus to trigger" false: Tiptap `focus()` runs first                               | Contract rewritten; `can()` pre-check (Opus read Tiptap 3.27.1 source; not independently re-verified) |
| 4   | Med  | "Tab closes the menu" false (Radix prevents Tab)                                                          | Contract corrected                                                                                    |
| 5   | Med  | Tab out of portaled popover leaves the page, panel stays open                                             | Tab `onKeyDown` added (a small deliberate addition; **Bob to confirm**)                               |
| 6   | Low  | Stale `insertedRef` on reopen during exit animation                                                       | `onOpenChange` reset                                                                                  |
| 7   | Low  | Admin `useEffect` import becomes unused                                                                   | ✔ verified (only `InsertTableButton` uses it); Task 4 note                                            |
| 8   | Low  | Cookie: `localhost` fallback would hand web an admin session; short `maxAge`                              | Fallback removed; `maxAge` added                                                                      |
| 9   | Low  | macOS overlay scrollbars make the layout-shift check meaningless                                          | Step 4 scrollbar precondition                                                                         |
| 10  | Low  | `select-in` `translateY(-4px)` is wrong if a panel flips above                                            | Known cosmetic limit; not fixed here (these menus open downward)                                      |

Confirmed correct by Opus: portal/form semantics (nothing reacts to bubbled events; a portaled input has no form owner, so Enter cannot submit `/stores/new`), the edit regex, `twMerge` keeping both animation classes, `SellerAccountMenu` composition and `ButtonGroup` selectors, the nav-test predictions, and the plan's line references.

## Global Constraints

- Primitives are copied from `https://ui.shadcn.com/r/styles/new-york/{popover,dropdown-menu}.json` with exactly **four** edits, nothing else: (a) `import { cn } from "@/lib/utils"` → `import { cn } from "../lib/utils.js"` (NodeNext, as in PRs 1–2); (b) every `data-[state=open]:animate-in … data-[side=top]:slide-in-from-bottom-2` animation group replaced by `data-[state=open]:animate-select-in data-[state=closed]:animate-select-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none` (BOMY's existing keyframes; **no** `tailwindcss-animate` plugin; the `motion-reduce` classes carry the `data-[state]` variants because a bare `motion-reduce:animate-none` has lower specificity than `.x[data-state=open]` and would NOT stop the animation); (c) `"use client"` first line kept; (d) in `DropdownMenuCheckboxItem`, stop destructuring `checked` and drop the `checked={checked}` line so it flows through `...props` (the repo's `exactOptionalPropertyTypes: true` rejects upstream's `checked={checked}`: TS2375; verified).
- No change to either app's `tailwind.config.ts` (the `select-in`/`select-out` keyframes already exist in both: web lines ~85/118, admin ~85/106). If a build shows the classes missing, stop and report; do not add keyframes silently.
- Both apps already set `* { @apply border-border }` and define `--popover`/`--popover-foreground` (PR 1), so shadcn's plain `border bg-popover text-popover-foreground` renders with BOMY tokens.
- New `@bomy/ui` dependencies: `@radix-ui/react-dropdown-menu` (`^2.1.0`) and `@radix-ui/react-popover` (`^1.1.0`); both support React 19. `lucide-react` is already a dependency (used by the dropdown's check/chevron/circle icons). **Apps do not add these dependencies directly.** Record the resolved versions in the PR.
- Feature components stay in their apps. Do not create a shared `InsertTableButton`.
- Stage explicit file paths only; never `git add` a directory; inspect `git diff --cached --stat` before each commit. `apps/web/src/app/products/loading.tsx` (untracked) must not enter the PR.
- No Select work (PR 4). No unrelated refactors.
- Report the two DATABASE_URL-limited web test files as **not evaluated**.

## Behaviour contract (what "works" means; verified in Task 5)

**Seller menu (`DropdownMenu`)**

- Trigger "..." (name "Seller menu"): Enter, Space, or ArrowDown opens and puts focus on the first item; mouse click opens.
- Arrow Up/Down, Home, End move between items; typing a letter jumps to a matching item.
- Escape closes and returns focus to the "..." trigger. **Tab does nothing while the menu is open** (Radix Menu calls `preventDefault()` on Tab); Escape, an outside press, or selecting an item closes it.
- Pointer press outside closes it. Selecting the "Seller" link navigates to `/seller/dashboard` and closes the menu.
- The adjacent account icon link still navigates straight to `/account` (unchanged).
- Rendered through a portal; opening it must not shift the page layout (Radix modal mode locks body scroll and can compensate for the scrollbar; see Task 3 Step 4).

**Insert-table popover (`Popover`, web and admin)**

- Click, Enter, or Space on the toolbar button toggles it; on open, focus moves to the first field (Rows).
- Escape closes and returns focus to the toolbar button.
- Pointer press outside closes it. Tab from the last control, or Shift+Tab from the first (Rows), **closes the popover and returns focus to the toolbar button** (the content is portaled to the end of `<body>`, so without this the browser would move focus out of the page and leave the panel open; see the `onKeyDown` in Task 2).
- **Insert** (button is **disabled while `editor` is `null`**): inserts the table **at the editor cursor** (between existing paragraphs, not appended at the end or start), closes the panel, and leaves keyboard focus **in the editor**. If the table cannot be inserted (`editor.can().insertTable(...)` is `false`), the panel closes **without touching the editor**, so focus returns to the toolbar button. (Tiptap's `focus()` command moves focus into the editor _before_ `insertTable` runs, so checking `can()` first is the only way to keep "failed insert → focus returns to trigger" true.)
- Rows clamps to 1–20 and Columns to 1–10 (unchanged). Button label stays `Insert {rows} × {cols} table`.
- Pressing Enter in Rows/Columns must **not** submit a surrounding form. Admin's `/stores/new` is the real case (see Review Focus).

## Review Focus

- **Radix portals vs. forms (corrected).** Web: `BodyEditor` is _not_ inside a surrounding form. `settings-form.tsx` closes its three forms (lines 132–344) before `<BodyEditor>` (line 355), and the editor's own save `<form>` (body-editor.tsx ~486–497) is below the toolbar and editor content, not around the Insert-table button. **Admin:** `new-store-form.tsx` wraps `<StoreProvisioningFields />` (which renders `<BrandStoryField>`) in a real `<form onSubmit={handleSubmit}>` (lines 30–85), so admin's `/stores/new` is the **primary** check: today Enter in "Rows"/"Columns" lives inside that form's DOM; after the portal move those inputs are outside it. Expected: Enter in Rows does nothing and the new-store form is **not** submitted. Also confirm no React `onSubmit`/`onKeyDown` on an ancestor reacts to events bubbling through the portal. Keep every popover button `type="button"` and add no `<form>` inside the popover. (`approve-form.tsx` has no `<form>` tag; check it as a secondary page.)
- **Focus after Insert, including failure.** After a **successful** insert focus must stay in the editor; if the insert is **not possible** (editor `null`, or `editor.can().insertTable()` is `false`) focus must return to the toolbar button. Tiptap's `chain().focus()` schedules `view.focus()` (rAF) before `insertTable` runs, so a `.run() === false` check alone cannot restore focus. The handler therefore (1) is disabled while `editor` is `null`, (2) checks `can()` first and closes without touching the editor if it fails, (3) only then sets `insertedRef`, runs the chain, and closes. (Bob's "set the flag only on success" intent is met: the flag can only be set once `can()` has said the command is valid.)
- **Stale `insertedRef`.** If the popover is reopened during the ~100 ms exit animation, Radix Presence keeps the same content mounted and `onCloseAutoFocus` never fires, so a stale `true` would suppress the next Escape's focus return. `onOpenChange` resets the flag whenever the popover opens.
- **Reduced motion actually works.** `motion-reduce:data-[state=…]:animate-none` is required (see Global Constraints (b)). Pinned by Task 5 Step 3: the generated stylesheet must contain, inside `@media (prefers-reduced-motion: reduce)`, rules with `[data-state="open"]` and `[data-state="closed"]` setting `animation: none`, **after** the `animate-select-in`/`-out` rules. (Browser tools here cannot emulate the CSS media feature, and the PR 1 `matchMedia` override only affects JS, so this is checked by reading the CSS, and said so in the PR.)
- **Insertion position, not just presence.** A table appearing somewhere is not enough. It must land **at the cursor**, which also exercises selection restoration after focus moved into the popover. Pinned by the cursor test in Task 5 (both editors).
- **Existing nav tests break by design.** With Radix, closed menu content is not rendered, so static-render tests that look for `href="/seller/dashboard"` inside the desktop row, and the `aria-controls="seller-menu-panel"` / "no aria-haspopup" assertions from #151, must be rewritten (Task 3 Step 5). The mobile panel still lists the seller link, so other tests keep passing. Rewriting them is not "mirror testing": they pin real structure (trigger order after the cart, `aria-haspopup="menu"` only for sellers).
- **Layout/scroll-lock.** DropdownMenu is modal by default. Check for a page shift when it opens; fallback is `modal={false}` on the root (Task 5).
- **Toolbar button sizing.** The web trigger currently sits in a `relative flex` wrapper with `h-full`; with `PopoverTrigger asChild` the button becomes the direct flex child like its siblings. Compare its rendered height with a sibling toolbar button.
- **Animation on close.** Radix keeps content mounted until the closing animation ends. `select-out` has `forwards`; verify the panel actually disappears (no stuck invisible overlay) and that `prefers-reduced-motion` removes the animation without breaking unmount.
- **Admin has no browser coverage unless Decision 3 is approved.** Say so in the PR.

---

### Task 1: Add the two primitives to `packages/ui`

**Files:** Create `packages/ui/src/components/popover.tsx`, `packages/ui/src/components/dropdown-menu.tsx`; Modify `packages/ui/package.json`.

- [ ] **Step 1: Fetch the upstream source** (scratch dir, not the repo). `SCRATCH` must be defined **and exported** first, and `curl --fail` makes a bad registry response stop the step:

```bash
export SCRATCH="/private/tmp/claude-501/-Users-charlie-Documents-Projects-BOMY/b15673d1-4f4d-4cb6-9cd0-75edcf6d327d/scratchpad"
mkdir -p "$SCRATCH"
set -e
curl --fail --silent --show-error https://ui.shadcn.com/r/styles/new-york/popover.json -o "$SCRATCH/popover.json"
curl --fail --silent --show-error https://ui.shadcn.com/r/styles/new-york/dropdown-menu.json -o "$SCRATCH/dropdown-menu.json"
python3 - <<'EOF'
import json,os
s=os.environ["SCRATCH"]
for n in ("popover","dropdown-menu"):
    c=json.load(open(f"{s}/{n}.json"))["files"][0]["content"]
    open(f"packages/ui/src/components/{n}.tsx","w").write(c if c.endswith("\n") else c+"\n")
EOF
```

- [ ] **Step 2: Apply the four edits**

```bash
python3 - <<'EOF'
import re
ANIM = re.compile(r'data-\[state=open\]:animate-in\s+data-\[state=closed\]:animate-out(?:\s+data-\[[^\]]+\]:[a-z0-9-]+)*')
NEW  = 'data-[state=open]:animate-select-in data-[state=closed]:animate-select-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none'
for n in ("popover","dropdown-menu"):
    p=f"packages/ui/src/components/{n}.tsx"
    c=open(p).read()
    c=c.replace('from "@/lib/utils"','from "../lib/utils.js"')
    c,k=ANIM.subn(NEW,c)
    if n=="dropdown-menu":
        assert c.count("({ className, children, checked, ...props }, ref)")==1 and c.count("checked={checked}")==1
        c=c.replace("({ className, children, checked, ...props }, ref)","({ className, children, ...props }, ref)")
        c=c.replace("\n    checked={checked}","",1)
        assert "checked={checked}" not in c
    print(n,"animation groups replaced:",k)
    open(p,"w").write(c)
EOF
grep -c "animate-in\|zoom-in\|slide-in" packages/ui/src/components/popover.tsx packages/ui/src/components/dropdown-menu.tsx || true
```

Expected: popover replaced 1, dropdown-menu replaced 2 (Content and SubContent); the grep prints `0` for both files. `grep -c` exits with status 1 when the count is 0, so `|| true` keeps the step from reading that correct result as a failure. If a count differs, read the file and fix the regex; do not hand-edit around it silently.

- [ ] **Step 3: `packages/ui/package.json`** — add to `exports`: `"./popover": "./src/components/popover.tsx"`, `"./dropdown-menu": "./src/components/dropdown-menu.tsx"`; add to `dependencies`: `"@radix-ui/react-dropdown-menu": "^2.1.0"`, `"@radix-ui/react-popover": "^1.1.0"`.

- [ ] **Step 4: Install and check**

```bash
pnpm install
pnpm --filter @bomy/ui typecheck
pnpm --filter @bomy/ui lint
```

Expected: clean (the `checked` edit above is what makes strict `tsc` pass; if it still fails, read the error and report it, do not suppress it). Record the resolved Radix versions from `pnpm-lock.yaml`.

- [ ] **Step 5: Correct the approved spec, then commit (explicit paths)**

In `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md`, § PR 3, replace the three "feature components stay local" bullets (seller menu; `body-editor.tsx` "toolbar dropdown"; `brand-story-field.tsx` "hint/preview popover") with the verified list: `nav-bar.tsx` seller account menu (→ `DropdownMenu`); `body-editor.tsx` `InsertTableButton` and `brand-story-field.tsx` `InsertTableButton` (→ `Popover`). Add one sentence: no admin hint popover exists; corrected 2026-10-02.

```bash
git add packages/ui/package.json pnpm-lock.yaml packages/ui/src/components/popover.tsx packages/ui/src/components/dropdown-menu.tsx docs/superpowers/plans/2026-10-02-bomy-shared-ui-package-pr3.md docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md
git diff --cached --stat
git commit -m "feat(ui): add Popover and DropdownMenu primitives"
```

---

### Task 2: Web — rebuild the Insert-table popover (`body-editor.tsx`)

**Files:** Modify `apps/web/src/components/body-editor.tsx` (`InsertTableButton`, ~lines 638–725; add import).

- [ ] **Step 1: Read the current `InsertTableButton` end to end** (it keeps its own `rows`/`cols` state and the `Label`/`Input` markup).

- [ ] **Step 2: Replace it with this** (imports `Popover`, `PopoverContent`, `PopoverTrigger` from `@bomy/ui/popover`; drop the now-unused `useRef`/`useEffect` imports only if nothing else in the file uses them):

```tsx
function InsertTableButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(3)
  // Radix returns focus to the trigger on close; after a SUCCESSFUL insert it must stay in the editor.
  const insertedRef = useRef(false)

  function handleInsert() {
    const opts = { rows, cols, withHeaderRow: true }
    // Tiptap's chain().focus() moves focus into the editor BEFORE insertTable runs, so a failed
    // insert cannot be undone afterwards: check first, and on failure close without touching the
    // editor so Radix returns focus to the toolbar button.
    if (!editor || !editor.can().insertTable(opts)) {
      setOpen(false)
      return
    }
    insertedRef.current = true // set synchronously, before React processes the close
    editor.chain().focus().insertTable(opts).run()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Reopening during the exit animation keeps the old content mounted, so
        // onCloseAutoFocus never fires; clear a stale flag whenever the popover opens.
        if (next) insertedRef.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Insert table"
          title="Insert table"
          className="inline-flex h-full min-h-[44px] min-w-[44px] items-center justify-center rounded bg-background px-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <Table className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-52 p-3"
        onCloseAutoFocus={(e) => {
          if (insertedRef.current) {
            e.preventDefault()
            insertedRef.current = false
          }
        }}
        onKeyDown={(e) => {
          // The panel is portaled to the end of <body>, so Tab off its last control (or
          // Shift+Tab off its first) would leave the page and strand the panel open.
          // Close it instead; Radix then returns focus to the toolbar button.
          if (e.key !== "Tab") return
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>("input, button:not([disabled])"),
          )
          const edge = e.shiftKey ? items[0] : items[items.length - 1]
          if (document.activeElement === edge) {
            e.preventDefault()
            setOpen(false)
          }
        }}
      >
        <p className="mb-2 text-xs font-semibold text-foreground">Insert table</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="table-rows" className="mb-0.5 block text-xs text-muted-foreground">
              Rows
            </Label>
            <Input
              id="table-rows"
              type="number"
              min={1}
              max={20}
              value={rows}
              onChange={(e) => setRows(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="w-full text-sm"
            />
          </div>
          <div>
            <Label htmlFor="table-cols" className="mb-0.5 block text-xs text-muted-foreground">
              Columns
            </Label>
            <Input
              id="table-cols"
              type="number"
              min={1}
              max={10}
              value={cols}
              onChange={(e) => setCols(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!editor}
          onClick={handleInsert}
          className="mt-2 w-full rounded bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Insert {rows} × {cols} table
        </button>
      </PopoverContent>
    </Popover>
  )
}
```

(The old `ref`, outside-click `useEffect`, `relative flex` wrapper, manual `aria-expanded`, and open-state class template are all gone: Radix supplies `aria-expanded`/`aria-controls`/`data-state`, outside-click, Escape, and focus handling.)

- [ ] **Step 3: Check**

```bash
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: clean (lint catches unused imports).

- [ ] **Step 4: Commit** `git add apps/web/src/components/body-editor.tsx` then inspect staged stat, then `git commit -m "refactor(web): build Insert-table popover on @bomy/ui Popover"`.

---

### Task 3: Web — rebuild the seller menu on `DropdownMenu` (`nav-bar.tsx`)

**Files:** Modify `apps/web/src/components/nav-bar.tsx` (`SellerAccountMenu`, ~lines 58–140); Modify `apps/web/tests/components/nav-bar.test.tsx`.

- [ ] **Step 1: Replace `SellerAccountMenu`** (imports: `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `@bomy/ui/dropdown-menu`; remove the now-unused `useRef`, container ref, trigger ref, and the manual Escape/mousedown `useEffect`; keep `useEffect`/`useState` imports only if `NavBar` still uses them, which it does for the mobile menu):

```tsx
function SellerAccountMenu({
  accountHref,
  accountLabel,
  sellerHref,
  sellerLabel,
}: {
  accountHref: string
  accountLabel: string
  sellerHref: string
  sellerLabel: string
}) {
  return (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label={accountLabel} asChild>
        <Link href={accountHref}>
          <User aria-hidden="true" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Seller menu">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-32">
          <DropdownMenuItem asChild>
            <Link href={sellerHref}>{sellerLabel}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
```

The `ButtonGroup`'s child-selector styling (`[&>*]:…`) still applies because `DropdownMenuTrigger asChild` renders the `Button` itself as the group's direct child (verify visually: joined border, no gap).

- [ ] **Step 2: Typecheck and lint** (`pnpm --filter @bomy/web typecheck`, `lint`).

- [ ] **Step 3: Rewrite the tests that pinned the old structure** in `nav-bar.test.tsx`:
  - "desktop row places Seller after the cart icon…": assert in the desktop-row slice that `aria-label="Seller menu"` appears **after** `href="/cart"` (the "Seller" link itself is no longer in the static HTML when the menu is closed).
  - "the seller-menu trigger is a disclosure…": replace with: seller HTML contains `aria-label="Seller menu"` and `aria-haspopup="menu"`; buyer HTML contains neither. Remove the `seller-menu-panel` and "no `aria-haspopup`" assertions (the #151 disclosure contract is intentionally retired by Decision 1).
  - Leave every other test unchanged; the mobile panel still renders `href="/seller/dashboard"`, so "seller_owner → seller dashboard link plus Account" keeps passing.
    Run `pnpm --filter @bomy/web test nav-bar.test.tsx --run` and fix only genuine assertion changes; if any test fails for another reason, stop and report.

- [ ] **Step 4: Commit** explicit paths (`nav-bar.tsx`, `nav-bar.test.tsx`), inspect stat; message `refactor(web): build seller menu on @bomy/ui DropdownMenu`.

---

### Task 4: Admin — rebuild the Insert-table popover (`brand-story-field.tsx`)

**Files:** Modify `apps/admin/src/components/brand-story-field.tsx` (`InsertTableButton`, ~lines 342–415).

- [ ] **Step 1: Apply the same replacement as Task 2**, keeping admin's own trigger styling (it has **no** `inline-flex h-full … items-center justify-center` and no `relative flex` wrapper today — do not add them): trigger `className="min-h-[44px] min-w-[44px] rounded bg-background px-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"`; every other line (labels, inputs, clamping, button label, `disabled={!editor}`, `handleInsert` with the `can()` pre-check, the `onOpenChange` stale-flag reset, `onCloseAutoFocus`, and the Tab `onKeyDown`) identical to Task 2. Import `Popover*` from `@bomy/ui/popover`. **Imports:** in `brand-story-field.tsx` only `InsertTableButton` uses `useEffect` (verified), so remove `useEffect` from the `react` import (it would fail lint with `--max-warnings 0`); keep `useRef` (now used for `insertedRef`) and `useState`. In web's `body-editor.tsx`, `useRef`/`useEffect` are still used elsewhere (lines ~120, ~183, ~606), so leave that import alone.
- [ ] **Step 2:** `pnpm --filter @bomy/admin typecheck`, `lint`, `test --run`.
- [ ] **Step 3: Commit** `apps/admin/src/components/brand-story-field.tsx`; message `refactor(admin): build Insert-table popover on @bomy/ui Popover`.

---

### Task 5: Verify (both apps), then PR

- [ ] **Step 1: Static checks, full:** `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`. Report the two DATABASE_URL-limited web files as not evaluated.
- [ ] **Step 2: Production builds of BOTH apps:** `pnpm --filter @bomy/web build`, `pnpm --filter @bomy/admin build`. A missing `select-in`/`select-out` class or a client/server boundary mistake in the new primitives would surface here or in Step 4.
- [ ] **Step 3: Generated CSS** (dev server, `document.styleSheets`, both apps). Print every selector and result; a missing rule is a failure. (a) Real rules exist for `animate-select-in`, `animate-select-out`, and a class unique to the dropdown file (e.g. `focus:bg-accent`'s selector). (b) **Reduced motion:** inside an `@media (prefers-reduced-motion: reduce)` rule there are selectors with `[data-state="open"]` and `[data-state="closed"]` setting `animation: none`, and they appear **after** the `animate-select-in`/`-out` rules in sheet order (same specificity, later wins). The browser tool cannot emulate the CSS media feature, so this is verified from the CSS and the PR must say so.
- [ ] **Step 3b: Opus integration review (read-only), before any browser time is spent on fixes.** Dispatch a fresh agent with `model: "opus"` over the Task 1–4 diff (`git diff main..HEAD`) with this brief: review focus management, keyboard behaviour, and portal/form event semantics against the Behaviour contract and Review Focus above; confirm `onCloseAutoFocus` logic is correct for success, failure, Escape, outside-click, and Tab-out; confirm no `Popover`/`DropdownMenu` prop misuse; report findings only, no edits. Sonnet fixes accepted findings; re-run Steps 1–3.
- [ ] **Step 4: Web browser, signed in as the seeded `seller_owner` test user** (docker psql + Mailhog technique; consent is already accepted locally). On `/` and `/seller/dashboard`:
  - Seller menu: run every line of the Behaviour contract with real keys (Enter/Space/ArrowDown open, arrows, Home/End, Escape → `document.activeElement` is the "..." button, **Tab is inert** while open, outside click closes, clicking "Seller" navigates). Account icon still goes to `/account`.
  - Layout: first record `window.innerWidth - document.documentElement.clientWidth` (scrollbar width). On macOS with overlay scrollbars this is `0`, and a shift check then proves nothing: set System Settings → Appearance → "Show scroll bars: Always" (or report this check as **not evaluated**). With a non-zero scrollbar, record `clientWidth` and the nav bar's bounding box before and after opening; any shift means set `modal={false}` on the root and re-check.
  - After closing: no invisible overlay remains (`document.elementFromPoint` over the old panel area returns page content); `body` has no leftover `pointer-events: none` or scroll-lock style.
  - Reduced motion: covered by the CSS check in Step 3 (not by a `matchMedia` override, which does not affect CSS media queries). Also confirm the menu still opens and closes normally.
  - Insert-table popover on `/seller/dashboard/settings` (BodyEditor). Run the Behaviour contract, and in particular:
    - **Cursor position:** put three paragraphs in the editor ("AAA", "BBB", "CCC"), click so the cursor sits at the end of "AAA", open the popover, Insert. Read the editor's HTML: the table must be between "AAA" and "BBB" (not at the document start or end). Repeat with the cursor at the end of "BBB".
    - Focus lands on Rows on open; Escape returns focus to the toolbar button; after a successful Insert `document.activeElement` is inside `.ProseMirror`, not the toolbar button.
    - **Tab handling:** Tab from the last control (Insert) and Shift+Tab from Rows each close the popover and put focus on the toolbar button. Do not rely on a dev-mode tab landing on the Next dev-tools button as evidence of anything.
    - **Reopen during exit:** open, Escape, and immediately reopen within ~100 ms, then Escape again; focus must still return to the toolbar button (stale-flag reset).
    - **Editor not ready:** reload and click the toolbar button immediately (or read the DOM before `editor` exists): the Insert button is `disabled`. The `can() === false` path cannot be forced from the UI; it is covered by code review (Opus Step 3b) and stated as such in the PR, not by stubbing `editor.chain`, which would only test the stub.
    - Enter in Rows does not trigger a network request or navigation.
    - Toolbar button height equals a sibling toolbar button's height.
- [ ] **Step 5: Admin browser (approved, localhost-only; Decision 3).**
  1. **Pre-checks, print and confirm before minting anything:** `apps/admin/.env.local`'s `DATABASE_URL` host is `localhost` (mask the password; never print `AUTH_SECRET`); pick one seeded admin: `select id,email,role::text from users where role='bomy_admin' and email like '%@test.bomy' limit 1;`.
  2. **Mint** a JWE with `encode` from `@auth/core/jwt` (resolvable from `apps/api`, e.g. `pnpm --filter @bomy/api exec node --input-type=module -e "…"`), reading the secret from `apps/admin/.env.local` inside the process. `salt` and cookie name are both `authjs.session-token`; token fields exactly as admin's `jwt()` callback sets them: `{ sub: id, id, role: "bomy_admin", roleCheckedAt: Date.now(), roleRefreshFailed: false }`. Pass a short `maxAge` (e.g. 3600 s; the default is 30 days). From `apps/api` the secret file is `../admin/.env.local`. Write the value to a scratchpad file, not the terminal. (Next 15 dev may print warnings about `127.0.0.1` dev-resource requests; note them, they are not failures.)
  3. **Use `http://127.0.0.1:3002`**, not `localhost`, so the cookie cannot replace the web seller session (cookies are shared across ports per hostname). Set it with `document.cookie = "authjs.session-token=<value>; path=/"` via the browser tool, and reload. **Do not fall back to `localhost`:** admin and web share one `AUTH_SECRET` and the same cookie name, so an admin-role cookie on `localhost` would be a valid session for the web app. If admin rejects the `127.0.0.1` host, stop and report admin's popover as unverified in the browser.
  4. **Primary check, `/stores/new`:** open the brand-story editor's Insert-table popover. Run the full Behaviour contract, the cursor-position test, and the failed-insert check as for web. **Enter in Rows/Columns must not submit the new-store form** (watch for a network request, a validation message, or navigation). Secondary: `/seller-inquiries/[id]` (`approve-form.tsx`, no `<form>` tag).
  5. **Clean up:** delete the cookie (`document.cookie = "authjs.session-token=; path=/; max-age=0"`), delete the scratchpad file, stop the dev server. Report this in the PR as **protected-UI verification with a locally minted session, not a Google sign-in test**.
- [ ] **Step 6: Stop dev servers**, confirm ports 3000/3002 are clear.
- [ ] **Step 7: Push and open the PR.** Body must list: what was replaced (table above), Decision outcomes, the `aria-haspopup` reversal from #151 and why, resolved Radix versions, everything verified, and everything **not** verified or not evaluated (DATABASE_URL files; admin browser if applicable). Mention the Opus read-only review outcome (findings and what changed). Keep `products/loading.tsx` out.

---

### Task 6: PR log entry — run AFTER the PR merges

Write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr3.md` (relative to `app/`; `<N>` = actual merged PR number, checked against the highest existing `_PR<N>_` file at merge time). `log/` is gitignored: write the file, do **not** commit it. Update `.andy/handoff.md` §0.
