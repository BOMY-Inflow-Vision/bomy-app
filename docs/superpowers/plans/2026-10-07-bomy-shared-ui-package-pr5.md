# @bomy/ui PR 5 — Page-level consistency audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v1, DRAFT, not reviewed.** Written 2026-10-07 while PR 4b (#155) is under review. **Do not start Task 0 until Bob and Charlie approve this plan AND #155 has merged.** The two admin routes `/users` and `/vouchers` are deliberately pending until #155 merges (see Task 0).

**Goal:** Define and run a repeatable audit of both apps' UI code for raw controls that should be a shared component, colours and sizes that bypass the shared tokens, and other visual inconsistencies the earlier PRs did not touch. Fix what is mechanical and behaviour-neutral. Document every remaining exception with a reason. "Done" is machine-checkable: `pnpm ui:audit` exits 0.

**Architecture:** A dependency-free Node scanner (`scripts/ui-audit/scan.mjs`) walks every `.ts`/`.tsx` under `apps/web/src` and `apps/admin/src`, applies nine rules, and compares the hits with `scripts/ui-audit/exceptions.json` (each exception names a rule and file, optionally a line, plus a reason of at least 10 characters). A manual triage step (read-only agents) classifies every hit as FIX, EXCEPTION or FOLLOW-UP. Fixes are limited to swaps that keep behaviour and data identical. The spec allows a split into follow-up PRs if the list is large; Task 2 decides that from real numbers.

**Tech Stack:** Node 24 (built-in `node:test`, no new dependencies), Tailwind 3.4 token classes, `@bomy/ui` primitives (Badge, Button, Card, DropdownMenu, Input, Label, Popover, Select, Textarea), Playwright 1.62.1 (browser tool only, for the mobile overflow sweep and visual checks).

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (§ "PR 5 — Page-level consistency pass": "every route in both apps either uses a `@bomy/ui` primitive where one exists, or has a documented, deliberate reason it doesn't"). Rules come from `../FRONTEND_STANDARDS.md` §4 (rules 5 and 6 in particular). No spec correction is needed, but the spec's file counts (105 + 47) differ from today's scan (see Baseline); the plan scans every `.ts`/`.tsx` under both `src` trees instead of counting files.

---

## Baseline (scanner run on `origin/main` `0367271`, 2026-10-07)

These are **raw hits before triage**. Many are legitimate (status colours, icon-only buttons, checkboxes). `/users` and `/vouchers` were still pre-migration in this run, so Task 0 re-runs the scan after #155 merges.

| Rule                        | What it flags                                                  | web | admin |   files |
| --------------------------- | -------------------------------------------------------------- | --: | ----: | ------: |
| R1-button                   | raw `<button>` outside `components/ui`                         |  19 |     9 |      13 |
| R1-input                    | raw `<input>`                                                  |  26 |     5 |      14 |
| R1-label                    | raw `<label>`                                                  |   9 |     4 |      12 |
| R1-select                   | raw `<select>`                                                 |   1 |     0 |       1 |
| R1-textarea                 | raw `<textarea>`                                               |   0 |     0 |       0 |
| R2-hex                      | hex colour in `.ts`/`.tsx`                                     |   9 |     2 |       6 |
| R3a-palette-class           | palette class (e.g. `text-red-600`)                            |  85 |    66 |      48 |
| R3b-bg-without-literal-text | `bg-<palette>-NN` with no literal text colour on the same line |  18 |     9 |      12 |
| R4-arbitrary                | arbitrary size like `[12px]`                                   |  15 |    13 |       6 |
| R5-inline-style             | `style={{`                                                     |   2 |     0 |       2 |
| R6-table                    | raw `<table>` (no `@bomy/ui` Table exists)                     |   4 |    17 |      18 |
| **Total**                   |                                                                |     |       | **313** |

Routes: web has 42 `page`/`route` entries (68 `.tsx` under `src/app`, 16 under `src/components`); admin has 26 entries (47 `.tsx` under `src/app`, 9 under `src/components`). Raw `<a>` (30 web, 13 admin) is **not** a rule: an anchor is not a control, and internal links should already be `next/link`. Triage looks at anchors only when their classes make them look like buttons.

Already known, not yet in any list: the new-product form is **637 px wide at a 390 px viewport** (found in PR 4 Task 5; not caused by the Selects). The mobile overflow sweep in Task 2 will find the others.

## Global Constraints

- **No behaviour or data change.** Every fix is a visual-neutral swap. Server actions, `name` attributes, `id`s, and posted `FormData` stay identical. If a swap cannot be shown identical, it is an EXCEPTION or FOLLOW-UP, not a fix.
- **Motion is preserved** (spec § Motion): `Button`'s `SlideContent` icon→arrow slide, `button-copy.tsx`'s copy-pop, link hover states. Swapping a raw `<button>` for `Button` must not add an icon slide where none exists, and must not remove an existing animation.
- **Standards rules 5 and 6** (`../FRONTEND_STANDARDS.md` §4): use semantic tokens; a fixed literal background must carry a fixed literal text colour. A palette status colour (`bg-amber-50 text-amber-900`) is a legitimate narrow exception, not a defect.
- **No new `@bomy/ui` primitives in PR 5** (Open decision 3). Raw `<table>`, checkbox, radio and file inputs have no primitive; they are recorded, not built.
- **Dark and light themes** must both be checked on every changed route (the theme toggle exists).
- **Stage explicit paths only; never `git add` a directory.** Keep the untracked `apps/web/src/app/products/loading.tsx` and other untracked `docs/` files out of the PR.
- **No session forging.** Never mint, encode or set a session cookie from `AUTH_SECRET`. Admin routes are checked only in Charlie's own Google session (he signs in; Andy drives the connected Chrome with clicks and key presses, as in PR 4b), or reported as not evaluated. Never read or copy cookies.
- **Checkout is paused locally** (`checkout_enabled=false`, never flipped). Any change to `apps/web/src/app/checkout/**` keeps the "not evaluated in a browser" disclosure and gets a fresh Opus read-only review.
- Report env-limited tests (`DATABASE_URL`) as **not evaluated**, never folded into a pass count.

## Review Focus

1. **A raw control that is correct.** Icon-only toggles, gallery thumbnails, the variant picker and tab-like buttons look like R1 hits, but swapping them to `Button` changes size, focus ring and motion. Each needs a documented EXCEPTION, not a swap.
2. **Status colour pairs flagged as defects.** The scanner splits R3a (palette class) from R3b (bare literal background), but only triage decides. Multi-line `className` values can put a `bg-` and its `text-` on different lines and produce a false R3b.
3. **Exceptions that silently stop matching.** `exceptions.json` is keyed by rule, file and (optionally) line. A line that shifts after an edit stops being covered, and the scanner then exits 1. That fails loud, which is intended. Use no `line` for whole-file exceptions.
4. **Contrast in both themes.** Replacing a palette colour with a token must keep text readable in light and dark.
5. **A swap that changes what a form posts.** Replacing `<input>` or `<label>` can drop an attribute (`name`, `required`, `inputMode`). Each changed form needs a before/after `FormData` check.

## Open decisions (recommendation first; answer before Task 3)

1. **What PR 5 itself fixes.** **A (recommended):** PR 5 = scanner + findings + exceptions + mechanical fixes up to 12 files; anything larger becomes PR 5a, 5b, … ordered by risk. **B:** PR 5 = audit only; every fix goes to follow-ups. A finishes the spec's "done" in one PR when the list is small; B keeps this PR tiny but delays the swaps.
2. **CI gate.** **A (recommended):** `pnpm ui:audit` is a manual command, not in CI. **B:** add it to CI now. B blocks unrelated PRs on a list that is still settling; revisit after a few PRs.
3. **Raw `<table>` (21 hits, 18 files).** **A (recommended):** record as EXCEPTION ("no `@bomy/ui` Table primitive") and decide a Table primitive separately. **B:** add shadcn `Table` and migrate all 21 in PR 5. B is a large visual change across admin.
4. **The mobile overflow findings.** **A (recommended):** list them as findings; fix in PR 5 only if the fix is one or two lines in two files or fewer; otherwise FOLLOW-UP. **B:** out of scope for PR 5.

## Model routing

Sonnet for the scanner, the triage agents and the swaps. Opus read-only review only if a fix touches `checkout/**`, auth or any payment/RLS-adjacent file (none expected). Fable only with Charlie's explicit confirmation.

---

### Task 0: Gate and baseline (no code)

- [ ] **Step 1: Confirm #155 merged.** `gh pr view 155 --json state,mergeCommit` → `MERGED`. If not, stop: the admin `/users` and `/vouchers` routes are still pending and must not be audited yet.
- [ ] **Step 2: Branch.** `git fetch origin && git switch -c feat/bomy-ui-package-pr5 origin/main`. (A local draft branch of this name may already exist with the plan commit only; if so, `git rebase origin/main` it instead.)
- [ ] **Step 3: Confirm the admin Select migration is on `main`.** `git grep -n "components/ui/select" origin/main -- apps/admin` prints nothing, and `apps/admin/src/components/ui/select.tsx` does not exist.
- [ ] **Step 4: Record the route inventory.**

```bash
for app in web admin; do echo "== $app"; git ls-tree -r --name-only origin/main -- apps/$app/src/app | grep -E '/(page|route)\.tsx?$' | sed "s|apps/$app/src/app||"; done > /tmp/pr5-routes.txt; wc -l /tmp/pr5-routes.txt
```

Expected: about 70 lines (42 web + 26 admin + 2 headers). Keep the list; Task 2 and Task 4 use it.

### Task 1: Scanner and its tests

**Files:**

- Create: `scripts/ui-audit/scan.mjs`
- Create: `scripts/ui-audit/scan.test.mjs`
- Create: `scripts/ui-audit/exceptions.json` (content: `[]`)
- Modify: `package.json` (root `scripts`)

**Interfaces:**

- Produces: `node scripts/ui-audit/scan.mjs [--json] [--root <dir>]`. Prints a per-rule table (or JSON with every hit and a `covered` flag). Exit code 0 only when every hit is covered by `exceptions.json`. Exception shape: `{ "rule": "R1-input", "file": "apps/web/src/app/x.tsx", "line": 12, "reason": "checkbox: no shared Checkbox primitive exists" }`; `line` is optional; a reason shorter than 10 characters does not count.

- [ ] **Step 1: Write `scripts/ui-audit/scan.mjs`.** This code was written and run against `origin/main` `0367271` on 2026-10-07 (313 hits), and formatted with the repo's Prettier:

```js
#!/usr/bin/env node
// UI consistency scanner (PR 5). No dependencies. Usage: node scripts/ui-audit/scan.mjs [--json] [--root <dir>]
// Exit code: 0 when every hit is covered by exceptions.json, 1 otherwise.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const args = process.argv.slice(2)
const asJson = args.includes("--json")
const rootArg = args.indexOf("--root")
const ROOT = rootArg >= 0 ? args[rootArg + 1] : join(here, "..", "..")
const APPS = ["apps/web/src", "apps/admin/src"]
const SKIP_DIR = new Set(["node_modules", ".next", "dist"])
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const UTIL = "bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow"
const PAL_CLASS = new RegExp(`(?<![A-Za-z-])(${UTIL})-(${PALETTE})-[0-9]{2,3}(?![A-Za-z0-9-])`, "g")

// rule id -> { re, why }. Every regex is run on the whole file, so tags that break across lines still match.
const RULES = {
  "R1-button": {
    re: /<button(?=[\s>/])/g,
    why: "raw <button>; use @bomy/ui Button or document why",
  },
  "R1-input": {
    re: /<input(?=[\s>/])/g,
    why: "raw <input>; use @bomy/ui Input or document why (checkbox/radio/file/hidden)",
  },
  "R1-textarea": { re: /<textarea(?=[\s>/])/g, why: "raw <textarea>; use @bomy/ui Textarea" },
  "R1-select": { re: /<select(?=[\s>/])/g, why: "raw <select>; use @bomy/ui Select" },
  "R1-label": { re: /<label(?=[\s>/])/g, why: "raw <label>; use @bomy/ui Label" },
  "R2-hex": { re: /#[0-9a-fA-F]{3,8}(?![0-9A-Za-z])/g, why: "hex colour in TS/TSX; use a token" },
  "R4-arbitrary": {
    re: /\[[0-9.]+(?:px|rem|em)\]/g,
    why: "arbitrary size value; use a token or scale step",
  },
  "R5-inline-style": { re: /style=\{\{/g, why: "inline style object" },
  "R6-table": {
    re: /<table(?=[\s>/])/g,
    why: "raw <table>; no @bomy/ui Table exists (record as exception or follow-up)",
  },
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const lineOf = (text, idx) => text.slice(0, idx).split("\n").length

function scanFile(abs) {
  const rel = relative(ROOT, abs).split(sep).join("/")
  // Local copies of primitives live under components/ui; they are the thing being audited, not consumers.
  if (/\/components\/ui\//.test(rel)) return []
  const text = readFileSync(abs, "utf8")
  const hits = []
  for (const [rule, { re, why }] of Object.entries(RULES)) {
    if (rule === "R2-hex" && /\.(css)$/.test(rel)) continue
    for (const m of text.matchAll(re))
      hits.push({ rule, file: rel, line: lineOf(text, m.index), match: m[0], why })
  }
  // R3: palette classes. A literal bg-<palette> with no literal text colour on the same line is R3b
  // (standards rule 6 violation candidate); anything else with a palette class is R3a (review).
  text.split("\n").forEach((ln, i) => {
    const pal = [...ln.matchAll(PAL_CLASS)].map((m) => m[0])
    if (pal.length === 0) return
    const hasBg = pal.some((c) => c.startsWith("bg-"))
    const hasLiteralText =
      pal.some((c) => c.startsWith("text-")) || /text-(white|black)(?![A-Za-z-])/.test(ln)
    const rule = hasBg && !hasLiteralText ? "R3b-bg-without-literal-text" : "R3a-palette-class"
    hits.push({
      rule,
      file: rel,
      line: i + 1,
      match: pal.join(" "),
      why: rule.startsWith("R3b")
        ? "literal bg without a literal text colour on the same line (rule 6)"
        : "palette class; allowed only as a status colour (rule 6)",
    })
  })
  return hits
}

const exceptionsPath = join(here, "exceptions.json")
const exceptions = existsSync(exceptionsPath)
  ? JSON.parse(readFileSync(exceptionsPath, "utf8"))
  : []
const isCovered = (h) =>
  exceptions.some(
    (e) =>
      e.rule === h.rule &&
      e.file === h.file &&
      (e.line === undefined || e.line === h.line) &&
      typeof e.reason === "string" &&
      e.reason.length >= 10,
  )

const all = APPS.flatMap((a) => (existsSync(join(ROOT, a)) ? walk(join(ROOT, a)) : [])).flatMap(
  scanFile,
)
const open = all.filter((h) => !isCovered(h))

if (asJson) {
  console.log(
    JSON.stringify(
      {
        total: all.length,
        open: open.length,
        hits: all.map((h) => ({ ...h, covered: isCovered(h) })),
      },
      null,
      2,
    ),
  )
} else {
  const byRule = {}
  for (const h of all) {
    const app = h.file.split("/")[1]
    ;(byRule[h.rule] ??= { web: 0, admin: 0, files: new Set() })[app]++
    byRule[h.rule].files.add(h.file)
  }
  console.log("rule".padEnd(30), "web".padStart(5), "admin".padStart(6), "files".padStart(6))
  for (const [r, v] of Object.entries(byRule).sort())
    console.log(
      r.padEnd(30),
      String(v.web).padStart(5),
      String(v.admin).padStart(6),
      String(v.files.size).padStart(6),
    )
  console.log(
    `\ntotal hits: ${all.length}  covered by exceptions.json: ${all.length - open.length}  OPEN: ${open.length}`,
  )
}
process.exitCode = open.length === 0 ? 0 : 1
```

- [ ] **Step 2: Write `scripts/ui-audit/scan.test.mjs`** (node's built-in runner, no dependency):

```js
// Run: node --test scripts/ui-audit/scan.test.mjs   (node's built-in runner, no dependencies)
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))

// Builds a throwaway repo root with its own copy of the scanner, so exceptions.json can be varied per test.
function fixture(files, exceptions) {
  const root = mkdtempSync(join(tmpdir(), "ui-audit-"))
  mkdirSync(join(root, "scripts/ui-audit"), { recursive: true })
  copyFileSync(join(here, "scan.mjs"), join(root, "scripts/ui-audit/scan.mjs"))
  if (exceptions)
    writeFileSync(join(root, "scripts/ui-audit/exceptions.json"), JSON.stringify(exceptions))
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}
function run(root) {
  const r = spawnSync("node", [join(root, "scripts/ui-audit/scan.mjs"), "--json"], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  })
  return { code: r.status, out: JSON.parse(r.stdout) }
}
const rules = (out) => out.hits.map((h) => h.rule).sort()

test("finds a raw <button> even when the tag breaks across lines", () => {
  const root = fixture({
    "apps/web/src/app/a.tsx":
      'export const A = () => (\n  <button\n    type="button">x</button>\n)\n',
  })
  try {
    const { code, out } = run(root)
    assert.deepEqual(rules(out), ["R1-button"])
    assert.equal(out.hits[0].line, 2)
    assert.equal(code, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a status colour with a literal text colour is R3a, a bare literal background is R3b", () => {
  const root = fixture({
    "apps/admin/src/app/b.tsx":
      'const a = "bg-amber-50 text-amber-900"\nconst b = "bg-red-100 p-2"\n',
  })
  try {
    assert.deepEqual(rules(run(root).out), ["R3a-palette-class", "R3b-bg-without-literal-text"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("local primitives under components/ui and test files are not scanned", () => {
  const root = fixture({
    "apps/web/src/components/ui/x.tsx": "<button>raw</button>",
    "apps/web/src/app/c.test.tsx": "<button>raw</button>",
    "apps/web/src/app/d.tsx": "<main>ok</main>",
  })
  try {
    const { code, out } = run(root)
    assert.equal(out.total, 0)
    assert.equal(code, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("an exception covers a hit only with a real reason", () => {
  const files = { "apps/web/src/app/e.tsx": '<input type="checkbox" />\n' }
  const hit = { rule: "R1-input", file: "apps/web/src/app/e.tsx", line: 1 }
  const good = fixture(files, [{ ...hit, reason: "checkbox: no shared Checkbox primitive exists" }])
  const bad = fixture(files, [{ ...hit, reason: "todo" }])
  try {
    assert.equal(run(good).code, 0)
    assert.equal(run(bad).code, 1)
  } finally {
    rmSync(good, { recursive: true, force: true })
    rmSync(bad, { recursive: true, force: true })
  }
})

test("large output is not truncated when piped", () => {
  const body = Array.from({ length: 4000 }, (_, i) => `<button key={${i}}>x</button>`).join("\n")
  const root = fixture({ "apps/web/src/app/big.tsx": body })
  try {
    const { out } = run(root)
    assert.equal(out.total, 4000)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Write `scripts/ui-audit/exceptions.json`** with exactly `[]` and a newline.
- [ ] **Step 4: Add two root scripts** to `package.json`: `"ui:audit": "node scripts/ui-audit/scan.mjs"` and `"ui:audit:test": "node --test scripts/ui-audit/scan.test.mjs"`. They are not part of `pnpm test` (turbo) on purpose.
- [ ] **Step 5: Run the tests.** `pnpm ui:audit:test`. Expected: 5 tests pass.
- [ ] **Step 6: Mutation-check the truncation test.** In `scan.mjs` replace the last line `process.exitCode = open.length === 0 ? 0 : 1` with `process.exit(open.length === 0 ? 0 : 1)`; `pnpm ui:audit:test` must now **fail** "large output is not truncated when piped". Restore the line; 5 pass again. (Why: `process.exit()` right after a large `console.log` truncated piped output at 64 KB in the draft run.)
- [ ] **Step 6b: Format.** `pnpm exec prettier --check scripts/ui-audit package.json`. ESLint's root config ignores `scripts/`, so ESLint has nothing to check there (`scripts/check-integration-env.mjs` is the precedent).
- [ ] **Step 7: Run the scanner.** `pnpm ui:audit`. Expected: the table above (the admin `/users` and `/vouchers` rows will differ from the baseline now that #155 is merged), `OPEN: ~313`, exit code 1.
- [ ] **Step 8: Commit** `scripts/ui-audit/scan.mjs scripts/ui-audit/scan.test.mjs scripts/ui-audit/exceptions.json package.json`. Message: `feat(ui): add the UI consistency scanner (PR 5)`.

### Task 2: Run the audit and triage (read-only)

**Files:** Create `docs/superpowers/audits/2026-10-XX-pr5-ui-consistency-findings.md` (replace `XX` with the day).

- [ ] **Step 1: Export every hit.** `node scripts/ui-audit/scan.mjs --json > /tmp/pr5-hits.json`.
- [ ] **Step 2: Triage with read-only agents, one per app** (Sonnet; no edits, no commits). Each reads every file that has hits and returns one row per hit group (file, rule, lines, class, reason, proposed action, size S/M/L) using exactly these classification rules:
  - **R1-button:** icon-only, toggle, tab, gallery or radio-like buttons → EXCEPTION, unless a `Button` variant already looks identical (then FIX). Text buttons with ad-hoc classes → FIX to `Button`.
  - **R1-input:** `type` checkbox, radio, file, hidden or range → EXCEPTION (no shared primitive). Text-like types → FIX to `Input`.
  - **R1-label:** wraps a checkbox or radio → EXCEPTION. Otherwise FIX to `Label`.
  - **R1-select:** FIX to `Select`, using the PR 4 contract (`id` on `SelectTrigger`, placeholder on `SelectValue`).
  - **R2-hex:** FIX to a token. EXCEPTION only for brand artwork, OG/email content or SVG data.
  - **R3b:** FIX (add a literal text colour per rule 6, or move to a token). **R3a:** acceptable only as a status colour (the rule 6 pattern); otherwise FIX to a token.
  - **R4-arbitrary:** EXCEPTION when the value is intentional and no scale step matches (for example `max-h-[--radix-…]`); otherwise FIX.
  - **R5-inline-style:** EXCEPTION when the value is dynamic (a percentage width, a CSS variable); otherwise FIX.
  - **R6-table:** per Open decision 3 (recommended: EXCEPTION, "no `@bomy/ui` Table primitive").
  - A "FIX" that cannot keep posted data and motion identical becomes FOLLOW-UP.
- [ ] **Step 3: Mobile overflow sweep.** For every route in `/tmp/pr5-routes.txt` that renders without a session or with the seeded `seller_owner` (web), load it at 390 px with `hasTouch` and record `document.documentElement.scrollWidth > innerWidth`. Admin routes: only inside Charlie's signed-in Chrome, or not evaluated. Snippet (Playwright, run per route; never print cookies):

```js
;async (page) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url)
  await page.waitForTimeout(1200)
  return page.evaluate(() => ({
    path: location.pathname,
    scrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
  }))
}
```

Each route with `scrollW > innerW` becomes a finding. For each, find the widest leaf element (the elements with `getBoundingClientRect().right > innerWidth`, deepest first) and name it. The known case is the new-product form (637 px).

- [ ] **Step 4: Write the findings doc.** One table per app: id, file, rule, class (FIX / EXCEPTION / FOLLOW-UP), reason, size. At the top: baseline vs triaged counts per class, the proposed split (Open decision 1), and the list of FOLLOW-UP items.
- [ ] **Step 5: Draft `exceptions.json`** from the EXCEPTION rows (rule, file, optional line, reason).
- [ ] **Step 6: GATE.** Send the findings doc and the proposed split to Bob and Charlie. **No fix is written before they approve the list and the split.** Commit the findings doc and `exceptions.json` only after approval. Message: `docs(ui): PR 5 findings and documented exceptions`.

### Task 3: Fixes (size-gated)

- [ ] **Step 1: Apply the size rule.** If the FIX list touches **12 files or fewer**, do it in this PR. If more, this PR keeps only the scanner, findings and exceptions, and each fix group becomes its own small PR ordered by risk: colours (R2, R3b), then `Label` and `Select`, then `Input`, then `Button`. Record the order in the findings doc.
- [ ] **Step 2: Baseline screenshots** for every route a fix will touch: 1440 px and 390 px, light and dark, saved under the scratchpad (never committed).
- [ ] **Step 3: For each fix, write the swap and prove nothing else changed.** Template (a label swap that exists today in `create-plan-form.tsx`): replace `<label htmlFor="termMonths" className="…">` with `<Label htmlFor="termMonths" className="…">`, importing `Label` from `@bomy/ui/label`, with the same classes. For a form, before and after the swap read `FormData` and compare it field by field; they must be identical.
- [ ] **Step 4: After each file,** run `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint` (or the admin equivalent), then the file's tests.
- [ ] **Step 5: Commit per rule group** (explicit paths; inspect `git diff --cached --stat` first). Message: `refactor(web|admin): <rule group> onto @bomy/ui / tokens (PR 5)`.

### Task 4: Verification

- [ ] **Step 1:** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/ui typecheck`, `pnpm --filter @bomy/ui lint`, `pnpm ui:audit:test`. Capture each exit code. Report the two web `DATABASE_URL` files and the 13 admin files as **not evaluated**.
- [ ] **Step 2:** `pnpm --filter @bomy/web build` and `pnpm --filter @bomy/admin build`. Capture the exit codes (do not infer them from the build output).
- [ ] **Step 3: Audit is clean.** `pnpm ui:audit` exits **0** (every remaining hit is in `exceptions.json` with a reason). Paste the final per-rule table into the PR.
- [ ] **Step 4: Built CSS.** For each app, confirm every class a fix introduced exists in `.next/static/css/*.css` (Tailwind content globs include `@bomy/ui`, so a class used only in a shared file would otherwise be missing).
- [ ] **Step 5: Browser, every changed route** (web as the seeded `seller_owner` via the Mailhog technique; admin only in Charlie's signed-in Chrome). Light and dark, 1440 px and 390 px. Compare with the Task 3 baseline screenshots and list every visual difference. Re-run the Task 2 overflow check on the changed routes. Admin routes that Charlie did not check: **not evaluated**.
- [ ] **Step 6: Stop servers.** Confirm ports 3000 to 3002 are clear.

### Task 5: PR, docs and handoff

- [ ] **Step 1: Update the spec's PR 5 status** (one sentence) and this plan's status line.
- [ ] **Step 2: Push and open the PR.** The body lists: the method and the nine rules; baseline vs final counts; the findings summary (FIX / EXCEPTION / FOLLOW-UP counts) and the exception reasons grouped; what was fixed; the Open decision outcomes; the follow-up PRs and their order; verified; **not verified** (admin routes Charlie did not check, `DATABASE_URL`-limited tests, checkout in a browser, layout shift, mobile touch where not tried).
- [ ] **Step 3: Update `.andy/handoff.md`** (§0) to show PR 5 open.

### Task 6: After merge

- [ ] **Step 1:** Write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr5.md` (gitignored). Update `.andy/handoff.md` §0: the `@bomy/ui` styling roadmap (PR 1 to PR 5) is complete, plus any follow-up PRs.
- [ ] **Step 2: REMIND CHARLIE (parked request, 2026-10-07).** Once the styling PRs are done, raise the **Cloudflare origin lock** first thing. Findings are in memory `project_cloudflare_origin_lock_reminder.md` and the handoff. Also remind him to demote his local admin user (`update users set role='buyer' where email='charliekong.work@gmail.com';`) and mention the suspected `DropdownMenu` typeahead bug (react-menu 2.1.24, untested).

---

## Self-review (writing-plans checklist)

- **Spec coverage:** raw controls (R1), colours bypassing tokens (R2, R3), other inconsistencies (R4, R5, R6, mobile overflow sweep), findings list and split (Task 2, Task 3 Step 1), "done" definition (`pnpm ui:audit` exit 0, Task 4 Step 3).
- **Placeholders:** none intended. `2026-10-XX` in the findings filename is the day the audit runs.
- **Consistency:** rule ids, the exception shape, and the script names match between the scanner code, the tests and the tasks.
- **Open:** Open decisions 1 to 4 need answers before Task 3; the cap of 12 files is a proposal.
