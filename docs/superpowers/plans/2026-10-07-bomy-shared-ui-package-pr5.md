# @bomy/ui PR 5 — Page-level consistency audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. **Plan v3, APPROVED 2026-10-08; Tasks 0 to 3 done (Task 4 verification run, PR not yet opened).** v1 was reviewed by Bob, who requested changes (5 points); v2 folded those in. Bob then requested 3 more changes to v2 and kept option A on all four decisions; v3 folds those in (see "Bob v1 review" and "Bob v2 review"). The branch stays unpushed; Bob reads the plan by file path. **Do not start Task 0 until Bob and Charlie approve v3 AND #155 has merged.** The two admin routes `/users` and `/vouchers` are deliberately pending until #155 merges (Task 0).

**Goal:** Define and run a repeatable audit of both apps' UI code for raw controls that should be a shared component, colours and sizes that bypass the shared tokens, and other visual inconsistencies the earlier PRs did not touch. Fix what is mechanical and behaviour-neutral. Document every deliberate exception with a reason, and track every deferred fix separately. **The `@bomy/ui` styling roadmap is complete only when plain `pnpm ui:audit` exits 0. That needs zero open and zero deferred scanner hits AND zero open and zero deferred entries in the findings ledger (browser overflow and manual-review findings).**

**Architecture:** A dependency-free Node scanner (`scripts/ui-audit/scan.mjs`) walks every `.ts`/`.tsx` under `apps/web/src` and `apps/admin/src` and applies ten rules. Each hit ends in one of three states (a second ledger, `findings.json`, holds what no regex can see: overflow and manual-review findings, each open, deferred or resolved with evidence): **covered** (one entry in `exceptions.json`: a deliberate, permanent decision), **deferred** (one entry in `deferred.json`: known debt with a follow-up PR named), or **open**. An entry covers exactly one hit, matched on rule, file and the hit's trimmed source line, so a new hit of the same rule in the same file stays open. A `--routes` mode maps every page to a URL template, to the files it imports, and to the files its layouts and other shell files import (NavBar, Sidebar), and lists any file with hits that no page or shell reaches, so every route can be accounted for. Manual triage (read-only agents) classifies hits and reviews the routes the regexes cannot judge. Fixes are limited to swaps that keep behaviour and data identical.

**Tech Stack:** Node 24 (built-in `node:test`, no new dependencies), Tailwind 3.4 token classes, `@bomy/ui` primitives (Badge, Button, Card, DropdownMenu, Input, Label, Popover, Select, Textarea), Playwright 1.62.1 (browser tool only, for the overflow sweep and visual checks).

**Spec:** `docs/superpowers/specs/2026-09-30-bomy-shared-ui-package-design.md` (§ "PR 5 — Page-level consistency pass": "every route in both apps either uses a `@bomy/ui` primitive where one exists, or has a documented, deliberate reason it doesn't"). Rules come from `../FRONTEND_STANDARDS.md` §4 (rules 5 and 6 in particular). The spec's file counts (105 + 47) differ from today's scan (see Baseline); the plan scans every `.ts`/`.tsx` under both `src` trees and accounts for every page instead of counting files.

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
| R7-role-button              | `role="button"`                                                |   0 |     0 |       0 |
| **Total**                   |                                                                |     |       | **313** |

**Routes (`--routes`, same run):** 64 pages (38 web, 26 admin) and 4 API handlers (`route.ts`, excluded: they render no UI). **13 pages are dynamic** (8 web, 5 admin; listed in Task 2). **10 pages have zero scanner hits in their imported UI** and need the manual review in Task 2: web `/`, `/about`, `/auth/verify-request`, `/brands/[slug]/products`, `/contact`, `/privacy`, `/refund`, `/shipping`, `/terms`, and admin `/`. Raw `<a>` (30 web, 13 admin) is **not** a rule: an anchor is not a control. Triage and the zero-hit review look at anchors and `next/link` only when their classes make them look like buttons.

Already known, not yet in any list: the new-product form is **637 px wide at a 390 px viewport** (found in PR 4 Task 5; not caused by the Selects). The overflow sweep in Task 2 finds the others.

## Bob v1 review (2026-10-07) and where each point is handled

1. **Deferred fixes vs the exit-0 claim.** Deferred hits are neither fixed nor deliberate, so they go in `deferred.json`, never `exceptions.json`. `pnpm ui:audit` exits 0 only with zero open **and** zero deferred hits. The PR gate is `pnpm ui:audit --allow-deferred` (zero open, zero stale). The styling roadmap stays **pending** while `deferred.json` is non-empty. (Task 1, Task 4, Task 6.)
2. **Filenames, not visitable URLs.** `--routes` drops route groups, excludes API handlers, and marks dynamic segments. Task 2 Step 3 maps every page to a concrete URL (resolving dynamic segments from seeded rows) or records it as **not evaluated** with a reason, together with its auth requirement.
3. **File-wide exceptions could hide new hits.** Entries are per occurrence (rule + file + line text, consumed once). Tested, including mutation checks. (Task 1.)
4. **Zero-hit routes and their imported UI.** `--routes` lists the files each page imports; Task 2 Step 4 manually reviews the 10 zero-hit pages and their imports, and the findings doc must contain a row for **every** page, so "every route" is supported by a table, not by regex silence.
5. **Provider application native Select.** It is a conditional fix: state, validation and `FormData` equivalence must be proven first. If they cannot be, it goes to `deferred.json`. (Task 3 Step 3b.)

## Bob v2 review (2026-10-07) and where each point is handled

1. **Overflow and manual findings need a checked ledger.** `scripts/ui-audit/findings.json`. Each entry is open, deferred (with a `followUp`) or resolved (with evidence). Plain `pnpm ui:audit` fails while any entry is open or deferred, and `--allow-deferred` still fails on open entries, even when all scanner hits are clear. Invalid entries (no evidence, no follow-up, duplicate id, bad kind) fail too. Four new mutation-checked tests cover it. (Task 1, Task 2 Steps 4 to 6, Task 3 Step 3c, Task 4.)
2. **Shell imports.** `--routes` now reports each page's `shellClosure` (everything its layouts, errors and loading files import) and a `shells` list (each shell file once, with its imports and hit count; on `main`, 6 shell files, and the web layout alone imports 11 files with 17 hits). It also lists `unreached` files with hits. Task 2 Step 5 reviews all of it.
3. **Provider Select proof.** Fill every other required field first (`name`, `contactEmail`, `contactNumber`, `companyName`, and `businessDescription` for Other), then test the Select's validity behaviour, including the failing side. (Task 3 Step 3b.)

## Decisions (resolved: option A on all four, per Bob; Charlie confirms when approving this plan)

1. **Fixes in PR 5 are bounded.** PR 5 = scanner + findings + exceptions + deferred list + mechanical fixes up to **12 files**. Larger groups become PR 5a, 5b, …, ordered by risk, each tracked in `deferred.json` until merged.
2. **`pnpm ui:audit` is a manual command at first.** No CI gate now. Revisit after the lists settle (a later CI step would use `--allow-deferred` while follow-ups remain).
3. **Raw `<table>` (21 hits, 18 files):** per-occurrence EXCEPTIONS with the reason "no `@bomy/ui` Table primitive exists". A Table primitive is a separate decision.
4. **Mobile overflow:** list every finding; fix in PR 5 only when the fix is one or two lines in two files or fewer; otherwise DEFERRED with a follow-up.

## Global Constraints

- **No behaviour or data change.** Every fix is a visual-neutral swap. Server actions, `name` attributes, `id`s, and posted `FormData` stay identical. A swap that cannot be shown identical is an EXCEPTION or DEFERRED item, not a fix.
- **Motion is preserved** (spec § Motion): `Button`'s `SlideContent` icon→arrow slide, `button-copy.tsx`'s copy-pop, link hover states. Swapping a raw `<button>` for `Button` must not add an icon slide where none exists, and must not remove an existing animation.
- **Standards rules 5 and 6** (`../FRONTEND_STANDARDS.md` §4): use semantic tokens; a fixed literal background must carry a fixed literal text colour. A palette status colour (`bg-amber-50 text-amber-900`) is a legitimate narrow exception, not a defect.
- **No new `@bomy/ui` primitives in PR 5.** Tables, checkboxes, radios and file inputs have no primitive; they are recorded, not built.
- **Dark and light themes** must both be checked on every changed route.
- **Stage explicit paths only; never `git add` a directory.** Keep the untracked `apps/web/src/app/products/loading.tsx` and other untracked `docs/` files out of the PR.
- **No session forging.** Never mint, encode or set a session cookie from `AUTH_SECRET`. Admin routes are checked only in Charlie's own Google session (he signs in; Andy drives the connected Chrome with clicks and key presses, as in PR 4b; never read or copy cookies), or reported as not evaluated.
- **Checkout is paused locally** (`checkout_enabled=false`, never flipped). Any change to `apps/web/src/app/checkout/**` keeps the "not evaluated in a browser" disclosure and gets a fresh Opus read-only review.
- Report env-limited tests (`DATABASE_URL`) as **not evaluated**, never folded into a pass count.

## Review Focus

1. **A raw control that is correct.** Icon-only toggles, gallery thumbnails, the variant picker and tab-like buttons look like R1 hits, but swapping them to `Button` changes size, focus ring and motion. Each needs a documented EXCEPTION, not a swap.
2. **Status colour pairs flagged as defects.** The scanner splits R3a from R3b, but only triage decides. A `className` that spans lines can put a `bg-` and its `text-` on different lines and produce a false R3b.
3. **Entries that stop matching.** Entries match on the hit's trimmed line text, not its line number, so edits above a hit do not uncover it. An entry whose text no longer exists is **stale** and fails the run, so the lists are pruned as code changes. Two identical lines need two entries.
4. **Contrast in both themes.** Replacing a palette colour with a token must keep text readable in light and dark.
5. **A swap that changes what a form posts.** Replacing `<input>`, `<label>` or `<select>` can drop an attribute (`name`, `required`, `inputMode`) or change what `FormData` contains. Each changed form gets a before/after `FormData` check.
6. **What the regexes cannot see.** A `next/link` or `<a>` styled as a button, a `div` with `onClick`, a hand-made toggle, a styled `span` that is really a `Badge`. Only the manual route review catches these (Task 2 Step 4).

## Model routing

Sonnet for the scanner, the triage agents and the swaps. Opus read-only review only if a fix touches `checkout/**`, auth or any payment/RLS-adjacent file (none expected). Fable only with Charlie's explicit confirmation.

---

### Task 0: Gate and baseline (no code)

- [ ] **Step 1: Confirm #155 merged.** `gh pr view 155 --json state,mergeCommit` → `MERGED`. If not, stop: `/users` and `/vouchers` must not be audited before it merges.
- [ ] **Step 2: Branch.** `git fetch origin && git switch -c feat/bomy-ui-package-pr5 origin/main`. (A local draft branch of this name may already exist with only the plan commits; if so, `git rebase origin/main` it instead.)
- [ ] **Step 3: Confirm the admin Select migration is on `main`.** `git grep -n "components/ui/select" origin/main -- apps/admin` prints nothing, and `apps/admin/src/components/ui/select.tsx` does not exist.

### Task 1: Scanner and its tests

**Files:**

- Create: `scripts/ui-audit/scan.mjs`
- Create: `scripts/ui-audit/scan.test.mjs`
- Create: `scripts/ui-audit/exceptions.json` (content: `[]`)
- Create: `scripts/ui-audit/deferred.json` (content: `[]`)
- Create: `scripts/ui-audit/findings.json` (content: `[]`)
- Modify: `package.json` (root `scripts`)

**Interfaces:**

- Produces: `node scripts/ui-audit/scan.mjs [--json] [--allow-deferred] [--routes] [--root <dir>]`. Default output: a per-rule table and a totals line (`total … covered … deferred … OPEN … stale … invalid …`). `--json`: every hit with `rule`, `file`, `line`, `text`, `status`. `--routes`: every page with `app`, `url`, `dynamic`, `page`, `shell`, `shellClosure` (everything the shell files import), `files`, `covered`, `deferred`, `open`, `zeroHit`, plus `excluded` (API handlers), `shells` (each shell file once, with its imports and hit count) and `unreached` (files with hits that no page or shell imports).
- Entry shape (both files): `{ "rule": "R1-input", "file": "apps/web/src/app/x.tsx", "text": "<input type=\"checkbox\" />", "reason": "checkbox: no shared Checkbox primitive exists" }`. `deferred.json` entries also need `"followUp": "PR 5a: Checkbox primitive"`. `text` is the trimmed source line of the hit (copy it from `--json`). A `reason` under 10 characters is invalid. Each entry covers **one** hit.
- Ledger entry shape (`findings.json`): `{ "id": "ov-1", "kind": "overflow" | "manual", "route": "/seller/dashboard/products/new", "description": "form is 637 px wide at a 390 px viewport", "status": "open" | "deferred" | "resolved", "evidence": "...", "followUp": "..." }`. `id` is unique. `resolved` needs `evidence` (at least 10 characters: what was re-measured or re-read, and where). `deferred` needs `followUp`. Anything else is invalid.
- Exit code 0 only when: zero open hits, zero stale entries, zero invalid entries (hit entries and ledger entries), **zero open ledger findings**, and (zero deferred hits and zero deferred ledger findings **or** `--allow-deferred`). An open ledger finding fails the run even with `--allow-deferred`, and even when every scanner hit is clear.

- [ ] **Step 1: Write `scripts/ui-audit/scan.mjs`.** This code was written and run against `origin/main` `0367271` on 2026-10-07 (313 hits, 64 pages), extended with the ledger and the shell closure (v3), and formatted with the repo's Prettier:

```js
#!/usr/bin/env node
// UI consistency scanner (PR 5). No dependencies.
// Usage: node scripts/ui-audit/scan.mjs [--json] [--allow-deferred] [--routes] [--root <dir>]
//
// Every hit ends up in one of three states:
//   covered  - matched by one entry in exceptions.json (a deliberate, permanent decision)
//   deferred - matched by one entry in deferred.json (known debt, tracked for a follow-up PR)
//   open     - matched by nothing
// An entry covers exactly ONE hit: same rule, same file, same trimmed source line text. There are no
// file-wide or line-number entries, so a new hit of the same rule in the same file stays open.
// findings.json is a second ledger for what no regex can see: browser overflow and manual-review
// findings. Each entry is open, deferred or resolved (resolved needs evidence; deferred needs a followUp).
// Exit code 0 needs: no open hits, no stale or invalid entries, no open ledger findings, and no deferred
// hits or deferred ledger findings (unless --allow-deferred, which the PR gate uses while follow-ups are
// still pending). Open ledger findings fail even with --allow-deferred.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, dirname, sep } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const args = process.argv.slice(2)
const asJson = args.includes("--json")
const allowDeferred = args.includes("--allow-deferred")
const wantRoutes = args.includes("--routes")
const rootArg = args.indexOf("--root")
const ROOT = rootArg >= 0 ? args[rootArg + 1] : join(here, "..", "..")
const APPS = ["web", "admin"]
const SKIP_DIR = new Set(["node_modules", ".next", "dist"])
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const UTIL = "bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow"
const PAL_CLASS = new RegExp(`(?<![A-Za-z-])(${UTIL})-(${PALETTE})-[0-9]{2,3}(?![A-Za-z0-9-])`, "g")

// rule id -> { re, why }. Tag rules run on the whole file, so tags that break across lines still match.
const RULES = {
  "R1-button": {
    re: /<button(?=[\s>/])/g,
    why: "raw <button>; use @bomy/ui Button or document why",
  },
  "R1-input": { re: /<input(?=[\s>/])/g, why: "raw <input>; use @bomy/ui Input or document why" },
  "R1-textarea": { re: /<textarea(?=[\s>/])/g, why: "raw <textarea>; use @bomy/ui Textarea" },
  "R1-select": { re: /<select(?=[\s>/])/g, why: "raw <select>; use @bomy/ui Select" },
  "R1-label": { re: /<label(?=[\s>/])/g, why: "raw <label>; use @bomy/ui Label" },
  "R2-hex": { re: /#[0-9a-fA-F]{3,8}(?![0-9A-Za-z])/g, why: "hex colour in TS/TSX; use a token" },
  "R4-arbitrary": {
    re: /\[[0-9.]+(?:px|rem|em)\]/g,
    why: "arbitrary size value; use a token or scale step",
  },
  "R5-inline-style": { re: /style=\{\{/g, why: "inline style object" },
  "R6-table": { re: /<table(?=[\s>/])/g, why: "raw <table>; no @bomy/ui Table exists" },
  "R7-role-button": {
    re: /role=["']button["']/g,
    why: 'role="button" on a non-button; use Button or a real <button>',
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

const rel = (abs) => relative(ROOT, abs).split(sep).join("/")
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length

function scanFile(abs) {
  const file = rel(abs)
  // Local copies of primitives live under components/ui; they are audited targets, not consumers.
  if (/\/components\/ui\//.test(file)) return []
  const text = readFileSync(abs, "utf8")
  const lines = text.split("\n")
  const hits = []
  const add = (rule, line, match, why) =>
    hits.push({ rule, file, line, text: (lines[line - 1] ?? "").trim(), match, why })
  for (const [rule, { re, why }] of Object.entries(RULES)) {
    for (const m of text.matchAll(re)) add(rule, lineOf(text, m.index), m[0], why)
  }
  // R3: palette classes. A literal bg-<palette> with no literal text colour on the same line is R3b
  // (standards rule 6 candidate); any other palette class is R3a (allowed only as a status colour).
  lines.forEach((ln, i) => {
    const pal = [...ln.matchAll(PAL_CLASS)].map((m) => m[0])
    if (pal.length === 0) return
    const hasBg = pal.some((c) => c.startsWith("bg-"))
    const hasLiteralText =
      pal.some((c) => c.startsWith("text-")) || /text-(white|black)(?![A-Za-z-])/.test(ln)
    const bad = hasBg && !hasLiteralText
    add(
      bad ? "R3b-bg-without-literal-text" : "R3a-palette-class",
      i + 1,
      pal.join(" "),
      bad
        ? "literal bg without a literal text colour on the same line (rule 6)"
        : "palette class; allowed only as a status colour (rule 6)",
    )
  })
  return hits
}

function readEntries(name) {
  const p = join(here, name)
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : []
}
const isStr = (v, min = 1) => typeof v === "string" && v.trim().length >= min
const validException = (e) =>
  isStr(e?.rule) && isStr(e?.file) && isStr(e?.text) && isStr(e?.reason, 10)
const validDeferred = (e) => validException(e) && isStr(e?.followUp)

const LEDGER_KINDS = ["overflow", "manual"]
const LEDGER_STATUS = ["open", "deferred", "resolved"]
function validFinding(e, i, all) {
  return (
    isStr(e?.id) &&
    all.findIndex((x) => x?.id === e.id) === i &&
    LEDGER_KINDS.includes(e.kind) &&
    isStr(e.route) &&
    isStr(e.description, 10) &&
    LEDGER_STATUS.includes(e.status) &&
    (e.status !== "resolved" || isStr(e.evidence, 10)) &&
    (e.status !== "deferred" || isStr(e.followUp))
  )
}

// Each valid entry consumes at most one still-unclassified hit.
function classify(hits, entries, valid, status) {
  const used = new Set()
  for (const h of hits) {
    if (h.status) continue
    const i = entries.findIndex(
      (e, k) =>
        !used.has(k) && valid(e) && e.rule === h.rule && e.file === h.file && e.text === h.text,
    )
    if (i >= 0) {
      used.add(i)
      h.status = status
    }
  }
  return {
    stale: entries.filter((e, k) => valid(e) && !used.has(k)),
    invalid: entries.filter((e) => !valid(e)),
  }
}

// ---- route map -------------------------------------------------------------------------------
const FILE_EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
function resolveImport(app, fromAbs, spec) {
  const base = spec.startsWith("@/")
    ? join(ROOT, "apps", app, "src", spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(fromAbs), spec)
      : null
  if (!base) return null
  for (const ext of FILE_EXT) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}
function importsOf(abs) {
  const text = readFileSync(abs, "utf8")
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1])
}
function closure(app, startAbs) {
  const seen = new Set()
  const queue = [startAbs]
  while (queue.length) {
    const f = queue.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const spec of importsOf(f)) {
      const r = resolveImport(app, f, spec)
      if (r && !/\.(test|spec)\.tsx?$/.test(r)) queue.push(r)
    }
  }
  return [...seen]
}

function routeMap(hits) {
  const byFile = new Map()
  for (const h of hits) (byFile.get(h.file) ?? byFile.set(h.file, []).get(h.file)).push(h)
  const routes = []
  const excluded = []
  for (const app of APPS) {
    const appDir = join(ROOT, "apps", app, "src", "app")
    if (!existsSync(appDir)) continue
    for (const abs of walk(appDir)) {
      const relToApp = relative(appDir, abs).split(sep)
      const name = relToApp[relToApp.length - 1]
      if (/^route\.tsx?$/.test(name)) {
        excluded.push({ app, file: rel(abs), why: "API route handler, not a page" })
        continue
      }
      if (!/^page\.tsx?$/.test(name)) continue
      const segs = relToApp.slice(0, -1).filter((s) => !/^\(.*\)$/.test(s))
      const url = "/" + segs.join("/")
      // Shared shell: layouts and friends in every ancestor directory. Reviewed once, listed separately.
      const shell = []
      let dir = appDir
      for (const part of ["", ...relToApp.slice(0, -1)]) {
        dir = part ? join(dir, part) : dir
        for (const n of ["layout", "template", "loading", "error", "not-found"])
          for (const ext of [".tsx", ".ts"]) {
            const p = join(dir, n + ext)
            if (existsSync(p)) shell.push(rel(p))
          }
      }
      const files = closure(app, abs).map(rel).sort()
      // What the shell files import (NavBar, Sidebar, ...) is part of every page they wrap.
      const shellClosure = [
        ...new Set(shell.flatMap((f) => closure(app, join(ROOT, f))).map(rel)),
      ].sort()
      const count = (list, status) =>
        list.reduce(
          (n, f) => n + (byFile.get(f) ?? []).filter((h) => h.status === status).length,
          0,
        )
      routes.push({
        app,
        url,
        dynamic: segs.filter((s) => /^\[.*\]$/.test(s)),
        page: rel(abs),
        shell,
        shellClosure,
        files,
        covered: count(files, "covered"),
        deferred: count(files, "deferred"),
        open: count(files, "open"),
        zeroHit: files.every((f) => (byFile.get(f) ?? []).length === 0),
      })
    }
  }
  routes.sort((a, b) => (a.app + a.url).localeCompare(b.app + b.url))
  // Shell review list: each shell file once, with everything it imports, so it is reviewed once.
  const shellFiles = [...new Set(routes.flatMap((r) => r.shell))].sort()
  const shells = shellFiles.map((file) => {
    const app = file.split("/")[1]
    const files = closure(app, join(ROOT, file)).map(rel).sort()
    return { app, file, files, hits: files.reduce((n, f) => n + (byFile.get(f) ?? []).length, 0) }
  })
  // Files with hits that no page and no shell reaches (dynamic imports, orphans): never silently skipped.
  const reached = new Set([...routes.flatMap((r) => [...r.files, ...r.shellClosure])])
  const unreached = [...byFile.keys()].filter((f) => !reached.has(f)).sort()
  return { routes, excluded, shells, unreached }
}

// ---- main ------------------------------------------------------------------------------------
const hits = APPS.flatMap((a) => {
  const d = join(ROOT, "apps", a, "src")
  return existsSync(d) ? walk(d) : []
}).flatMap(scanFile)
const exceptions = readEntries("exceptions.json")
const deferred = readEntries("deferred.json")
const ex = classify(hits, exceptions, validException, "covered")
const df = classify(hits, deferred, validDeferred, "deferred")
for (const h of hits) h.status ??= "open"
const findings = readEntries("findings.json")
const ledger = {
  open: findings.filter((e, i) => validFinding(e, i, findings) && e.status === "open").length,
  deferred: findings.filter((e, i) => validFinding(e, i, findings) && e.status === "deferred")
    .length,
  resolved: findings.filter((e, i) => validFinding(e, i, findings) && e.status === "resolved")
    .length,
  invalid: findings.filter((e, i) => !validFinding(e, i, findings)),
}

const n = (s) => hits.filter((h) => h.status === s).length
const summary = {
  total: hits.length,
  covered: n("covered"),
  deferred: n("deferred"),
  open: n("open"),
  stale: ex.stale.length + df.stale.length,
  invalid: ex.invalid.length + df.invalid.length,
}

if (wantRoutes) {
  const { routes, excluded, shells, unreached } = routeMap(hits)
  if (asJson) console.log(JSON.stringify({ routes, excluded, shells, unreached }, null, 2))
  else {
    for (const r of routes)
      console.log(
        `${r.app.padEnd(5)} ${r.url.padEnd(48)} files ${String(r.files.length).padStart(3)}  covered ${r.covered}  deferred ${r.deferred}  open ${r.open}${r.zeroHit ? "  ZERO-HIT: manual review" : ""}`,
      )
    console.log(
      `\n${routes.length} pages, ${routes.filter((r) => r.zeroHit).length} zero-hit, ${excluded.length} API handlers excluded`,
    )
    for (const sh of shells)
      console.log(`shell ${sh.file}  imports ${sh.files.length - 1} files  hits ${sh.hits}`)
    for (const f of unreached)
      console.log(`unreached (has hits, no page or shell imports it): ${f}`)
  }
} else if (asJson) {
  console.log(
    JSON.stringify(
      {
        ...summary,
        stale: [...ex.stale, ...df.stale],
        invalid: [...ex.invalid, ...df.invalid],
        ledger,
        hits,
      },
      null,
      2,
    ),
  )
} else {
  const byRule = {}
  for (const h of hits) {
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
    `\ntotal ${summary.total}  covered ${summary.covered}  deferred ${summary.deferred}  OPEN ${summary.open}  stale ${summary.stale}  invalid ${summary.invalid}`,
  )
  for (const e of [...ex.stale, ...df.stale])
    console.log(`stale entry (matches nothing): ${e.rule} ${e.file} :: ${e.text}`)
  for (const e of [...ex.invalid, ...df.invalid]) console.log(`invalid entry: ${JSON.stringify(e)}`)
  console.log(
    `ledger (findings.json)  open ${ledger.open}  deferred ${ledger.deferred}  resolved ${ledger.resolved}  invalid ${ledger.invalid.length}`,
  )
  for (const e of findings.filter((x) => x?.status === "open"))
    console.log(`open finding: ${e.id} [${e.kind}] ${e.route} :: ${e.description}`)
  for (const e of ledger.invalid) console.log(`invalid finding: ${JSON.stringify(e)}`)
}
const clean =
  summary.open === 0 &&
  summary.stale === 0 &&
  summary.invalid === 0 &&
  ledger.open === 0 &&
  ledger.invalid.length === 0 &&
  (allowDeferred || (summary.deferred === 0 && ledger.deferred === 0))
process.exitCode = clean ? 0 : 1
```

- [ ] **Step 2: Write `scripts/ui-audit/scan.test.mjs`** (node's built-in runner, no dependency; 14 tests):

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

// Builds a throwaway repo root with its own copy of the scanner, so the entry files can vary per test.
function fixture(files, { exceptions, deferred, findings } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ui-audit-"))
  mkdirSync(join(root, "scripts/ui-audit"), { recursive: true })
  copyFileSync(join(here, "scan.mjs"), join(root, "scripts/ui-audit/scan.mjs"))
  if (exceptions)
    writeFileSync(join(root, "scripts/ui-audit/exceptions.json"), JSON.stringify(exceptions))
  if (deferred)
    writeFileSync(join(root, "scripts/ui-audit/deferred.json"), JSON.stringify(deferred))
  if (findings)
    writeFileSync(join(root, "scripts/ui-audit/findings.json"), JSON.stringify(findings))
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}
function run(root, flags = []) {
  const r = spawnSync("node", [join(root, "scripts/ui-audit/scan.mjs"), "--json", ...flags], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  })
  return { code: r.status, out: JSON.parse(r.stdout) }
}
const rules = (out) => out.hits.map((h) => h.rule).sort()
const cleanup = (...roots) => roots.forEach((r) => rmSync(r, { recursive: true, force: true }))
const CB = '<input type="checkbox" />'
const entry = (file, text, rule = "R1-input") => ({
  rule,
  file,
  text,
  reason: "checkbox: no shared Checkbox primitive exists",
})

test("finds a raw <button> even when the tag breaks across lines", () => {
  const root = fixture({
    "apps/web/src/app/a.tsx":
      'export const A = () => (\n  <button\n    type="button">x</button>\n)\n',
  })
  try {
    const { code, out } = run(root)
    assert.deepEqual(rules(out), ["R1-button"])
    assert.equal(out.hits[0].line, 2)
    assert.equal(out.hits[0].text, "<button")
    assert.equal(code, 1)
  } finally {
    cleanup(root)
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
    cleanup(root)
  }
})

test('role="button" is flagged (R7)', () => {
  const root = fixture({ "apps/web/src/app/r.tsx": '<div role="button" tabIndex={0}>x</div>\n' })
  try {
    assert.deepEqual(rules(run(root).out), ["R7-role-button"])
  } finally {
    cleanup(root)
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
    cleanup(root)
  }
})

test("an exception covers one hit, and only with a real reason", () => {
  const f = "apps/web/src/app/e.tsx"
  const good = fixture({ [f]: CB + "\n" }, { exceptions: [entry(f, CB)] })
  const bad = fixture({ [f]: CB + "\n" }, { exceptions: [{ ...entry(f, CB), reason: "todo" }] })
  try {
    assert.equal(run(good).code, 0)
    const r = run(bad)
    assert.equal(r.code, 1)
    assert.equal(r.out.open, 1)
    assert.equal(r.out.invalid.length, 1)
  } finally {
    cleanup(good, bad)
  }
})

test("a second hit of the same rule in the same file stays open", () => {
  const f = "apps/web/src/app/two.tsx"
  const different = fixture(
    { [f]: CB + '\n<input type="radio" />\n' },
    { exceptions: [entry(f, CB)] },
  )
  const identical = fixture({ [f]: CB + "\n" + CB + "\n" }, { exceptions: [entry(f, CB)] })
  try {
    const a = run(different)
    assert.equal(a.out.covered, 1)
    assert.equal(a.out.open, 1)
    assert.equal(a.code, 1)
    const b = run(identical)
    assert.equal(b.out.covered, 1)
    assert.equal(b.out.open, 1)
    assert.equal(b.code, 1)
  } finally {
    cleanup(different, identical)
  }
})

test("an exception keeps covering its hit when lines shift", () => {
  const f = "apps/web/src/app/shift.tsx"
  const root = fixture({ [f]: "// added above\n\n" + CB + "\n" }, { exceptions: [entry(f, CB)] })
  try {
    assert.equal(run(root).code, 0)
  } finally {
    cleanup(root)
  }
})

test("a stale exception (matches nothing) fails the run", () => {
  const f = "apps/web/src/app/gone.tsx"
  const root = fixture({ [f]: "<main>fixed</main>\n" }, { exceptions: [entry(f, CB)] })
  try {
    const { code, out } = run(root)
    assert.equal(out.open, 0)
    assert.equal(out.stale.length, 1)
    assert.equal(code, 1)
  } finally {
    cleanup(root)
  }
})

test("deferred hits keep the plain run failing; --allow-deferred accepts them", () => {
  const f = "apps/web/src/app/later.tsx"
  const d = { ...entry(f, CB), followUp: "PR 5a: Checkbox primitive" }
  const root = fixture({ [f]: CB + "\n" }, { deferred: [d] })
  const noFollowUp = fixture({ [f]: CB + "\n" }, { deferred: [entry(f, CB)] })
  try {
    const plain = run(root)
    assert.equal(plain.out.deferred, 1)
    assert.equal(plain.code, 1)
    assert.equal(run(root, ["--allow-deferred"]).code, 0)
    assert.equal(run(noFollowUp, ["--allow-deferred"]).code, 1)
  } finally {
    cleanup(root, noFollowUp)
  }
})

const finding = (over = {}) => ({
  id: "ov-1",
  kind: "overflow",
  route: "/seller/dashboard/products/new",
  description: "form is 637 px wide at a 390 px viewport",
  status: "open",
  ...over,
})

test("an open ledger finding fails the run even when every scanner hit is clear, with or without --allow-deferred", () => {
  const root = fixture(
    { "apps/web/src/app/ok.tsx": "<main>ok</main>\n" },
    { findings: [finding()] },
  )
  try {
    const plain = run(root)
    assert.equal(plain.out.open, 0)
    assert.equal(plain.out.ledger.open, 1)
    assert.equal(plain.code, 1)
    assert.equal(run(root, ["--allow-deferred"]).code, 1)
  } finally {
    cleanup(root)
  }
})

test("ledger: resolved needs evidence, deferred needs a followUp and fails only the plain run", () => {
  const files = { "apps/web/src/app/ok.tsx": "<main>ok</main>\n" }
  const resolved = fixture(files, {
    findings: [finding({ status: "resolved", evidence: "re-measured 390 px: scrollWidth 390" })],
  })
  const noEvidence = fixture(files, { findings: [finding({ status: "resolved" })] })
  const deferred = fixture(files, {
    findings: [finding({ status: "deferred", followUp: "PR 5b: split the form grid" })],
  })
  const noFollowUp = fixture(files, { findings: [finding({ status: "deferred" })] })
  const dup = fixture(files, {
    findings: [
      finding({ status: "resolved", evidence: "re-measured 390 px: scrollWidth 390" }),
      finding({ status: "resolved", evidence: "re-measured 390 px: scrollWidth 390" }),
    ],
  })
  try {
    assert.equal(run(resolved).code, 0)
    assert.equal(run(noEvidence).code, 1)
    assert.equal(run(noEvidence).out.ledger.invalid.length, 1)
    assert.equal(run(deferred).code, 1)
    assert.equal(run(deferred, ["--allow-deferred"]).code, 0)
    assert.equal(run(noFollowUp, ["--allow-deferred"]).code, 1)
    assert.equal(run(dup).out.ledger.invalid.length, 1)
  } finally {
    cleanup(resolved, noEvidence, deferred, noFollowUp, dup)
  }
})

test("route review includes what layouts import (NavBar) and reports unreached files with hits", () => {
  const root = fixture({
    "apps/web/src/app/layout.tsx":
      'import { NavBar } from "@/components/nav-bar"\nexport default ({ children }) => <body><NavBar />{children}</body>\n',
    "apps/web/src/components/nav-bar.tsx": "export const NavBar = () => <button>menu</button>\n",
    "apps/web/src/app/page.tsx": "export default () => <main>ok</main>\n",
    "apps/web/src/lib/orphan.tsx": "export const O = () => <button>x</button>\n",
  })
  try {
    const { out } = run(root, ["--routes"])
    const home = out.routes.find((r) => r.url === "/")
    assert.equal(home.zeroHit, true)
    assert.ok(home.shellClosure.includes("apps/web/src/components/nav-bar.tsx"))
    const sh = out.shells.find((s) => s.file === "apps/web/src/app/layout.tsx")
    assert.equal(sh.hits, 1)
    assert.deepEqual(out.unreached, ["apps/web/src/lib/orphan.tsx"])
  } finally {
    cleanup(root)
  }
})

test("large output is not truncated when piped", () => {
  const body = Array.from({ length: 4000 }, (_, i) => `<button key={${i}}>x</button>`).join("\n")
  const root = fixture({ "apps/web/src/app/big.tsx": body })
  try {
    assert.equal(run(root).out.total, 4000)
  } finally {
    cleanup(root)
  }
})

test("route map: groups dropped, dynamic segments kept, API handlers excluded, closure followed", () => {
  const root = fixture({
    "apps/web/src/app/(shop)/items/[id]/page.tsx":
      'import { Card } from "@/components/card-x"\nimport { Local } from "./local"\nexport default () => <Card />\n',
    "apps/web/src/app/(shop)/items/[id]/local.tsx": "export const Local = () => <b>ok</b>\n",
    "apps/web/src/components/card-x.tsx": "export const Card = () => <button>raw</button>\n",
    "apps/web/src/app/clean/page.tsx": "export default () => <main>ok</main>\n",
    "apps/web/src/app/layout.tsx": "export default ({ children }) => <body>{children}</body>\n",
    "apps/web/src/app/api/x/route.ts": "export const GET = () => new Response()\n",
  })
  try {
    const { out } = run(root, ["--routes"])
    const item = out.routes.find((r) => r.url === "/items/[id]")
    assert.deepEqual(item.dynamic, ["[id]"])
    assert.ok(item.files.includes("apps/web/src/components/card-x.tsx"))
    assert.ok(item.files.includes("apps/web/src/app/(shop)/items/[id]/local.tsx"))
    assert.equal(item.open, 1)
    assert.equal(item.zeroHit, false)
    assert.ok(item.shell.includes("apps/web/src/app/layout.tsx"))
    const clean = out.routes.find((r) => r.url === "/clean")
    assert.equal(clean.zeroHit, true)
    assert.equal(out.routes.length, 2)
    assert.equal(out.excluded.length, 1)
  } finally {
    cleanup(root)
  }
})
```

- [ ] **Step 3: Write `scripts/ui-audit/exceptions.json`, `scripts/ui-audit/deferred.json` and `scripts/ui-audit/findings.json`** with exactly `[]` and a newline each.
- [ ] **Step 4: Add two root scripts** to `package.json`: `"ui:audit": "node scripts/ui-audit/scan.mjs"` and `"ui:audit:test": "node --test scripts/ui-audit/scan.test.mjs"`. They are not part of `pnpm test` (turbo) on purpose.
- [ ] **Step 5: Run the tests.** `pnpm ui:audit:test`. Expected: 14 tests pass.
- [ ] **Step 6: Mutation checks (each must make exactly the named test fail; restore after each).** Work on a copy or `git restore` the file between runs.

| Mutation in `scan.mjs`                                                                                                              | Test that must fail                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| In `classify`, drop `&& e.text === h.text` and the `!used.has(k)` guard (file-wide, reusable entries)                               | "a second hit of the same rule in the same file stays open"                                 |
| In `classify`, drop only the `!used.has(k)` guard (one entry covers many)                                                           | "a second hit of the same rule in the same file stays open"                                 |
| In the last lines, remove `summary.stale === 0 &&`                                                                                  | "a stale exception (matches nothing) fails the run"                                         |
| In the last lines, replace `(allowDeferred \|\| (summary.deferred === 0 && ledger.deferred === 0))` with `true`                     | "deferred hits keep the plain run failing; --allow-deferred accepts them"                   |
| Replace `process.exitCode = …` with `process.exit(clean ? 0 : 1)`                                                                   | "large output is not truncated when piped" (piped output was cut at 64 KB in the draft run) |
| Remove `ledger.open === 0 &&`                                                                                                       | "an open ledger finding fails the run even when every scanner hit is clear…"                |
| Remove `ledger.invalid.length === 0 &&`                                                                                             | "ledger: resolved needs evidence, deferred needs a followUp…"                               |
| Replace `(allowDeferred \|\| (summary.deferred === 0 && ledger.deferred === 0))` with `(allowDeferred \|\| summary.deferred === 0)` | "ledger: resolved needs evidence, deferred needs a followUp…"                               |
| Replace the `shellClosure` expression `shell.flatMap((f) => closure(app, join(ROOT, f))).map(rel)` with `[]`                        | "route review includes what layouts import (NavBar)…"                                       |

- [ ] **Step 7: Format.** `pnpm exec prettier --check scripts/ui-audit package.json`. ESLint's root config ignores `scripts/`, so ESLint has nothing to check there (`scripts/check-integration-env.mjs` is the precedent).
- [ ] **Step 8: Run the scanner.** `pnpm ui:audit`. Expected: the baseline table (the admin `/users` and `/vouchers` rows differ now that #155 is merged), `OPEN` about 313, exit code 1. `pnpm ui:audit --routes` lists 64 pages, the shell files (6 on `main`: admin `error`, admin `layout`, web `error`, web `layout`, web `products/loading`, web `seller/dashboard/layout`) with the files they import, and any unreached files with hits (none on `main`). The ledger line reads `open 0 deferred 0 resolved 0`.
- [ ] **Step 9: Commit** `scripts/ui-audit/scan.mjs scripts/ui-audit/scan.test.mjs scripts/ui-audit/exceptions.json scripts/ui-audit/deferred.json scripts/ui-audit/findings.json package.json`. Message: `feat(ui): add the UI consistency scanner (PR 5)`.

### Task 2: Run the audit and triage (read-only)

**Files:** Create `docs/superpowers/audits/2026-10-XX-pr5-ui-consistency-findings.md` (replace `XX` with the day).

- [ ] **Step 1: Export the data.** `node scripts/ui-audit/scan.mjs --json > /tmp/pr5-hits.json` and `node scripts/ui-audit/scan.mjs --routes --json > /tmp/pr5-routes.json`.
- [ ] **Step 2: Triage hits with read-only agents, one per app** (Sonnet; no edits, no commits). Each reads every file that has hits and returns one row per hit (file, rule, line text, class, reason, proposed action, size S/M/L) using these rules:
  - **R1-button:** icon-only, toggle, tab, gallery or radio-like buttons → EXCEPTION, unless a `Button` variant already looks identical (then FIX). Text buttons with ad-hoc classes → FIX to `Button`.
  - **R1-input:** `type` checkbox, radio, file, hidden or range → EXCEPTION (no shared primitive). Text-like types → FIX to `Input`.
  - **R1-label:** wraps a checkbox or radio → EXCEPTION. Otherwise FIX to `Label`.
  - **R1-select:** conditional FIX (Task 3 Step 3b). Until proven, treat as DEFERRED.
  - **R2-hex:** FIX to a token. EXCEPTION only for brand artwork, OG/email content or SVG data.
  - **R3b:** FIX (add a literal text colour per rule 6, or move to a token). **R3a:** acceptable only as a status colour (the rule 6 pattern); otherwise FIX to a token.
  - **R4-arbitrary:** EXCEPTION when the value is intentional and no scale step matches (for example `max-h-[--radix-…]`); otherwise FIX.
  - **R5-inline-style:** EXCEPTION when the value is dynamic (a percentage width, a CSS variable); otherwise FIX.
  - **R6-table:** EXCEPTION per Decision 3 ("no `@bomy/ui` Table primitive exists"), one entry per occurrence.
  - **R7-role-button:** FIX to a real `<button>`/`Button`, or EXCEPTION with a reason.
  - A FIX that cannot keep posted data and motion identical becomes DEFERRED with a named follow-up.
- [ ] **Step 3: Map every page to a visitable URL (Bob point 2).** From `/tmp/pr5-routes.json`: route groups are already dropped and the 4 API handlers are already excluded. For each of the 64 pages record `{app, url, concreteUrl, access, status}`:
  - **access:** `public` (web marketing and legal pages, `/brands/**`, `/products/**`, `/auth/**`, `/seller/apply`, `/provider/apply`), `buyer` (web `/account/**`, `/membership/manage`, `/membership/success`, `/cart`, `/checkout/**`: checkout shows only "Checkout is paused" locally), `seller_owner` (web `/seller/dashboard/**`), `admin` (every admin page except `/auth/sign-in` and `/unauthorized`). Verify each assignment against `src/auth.config.ts` / middleware instead of trusting this list.
  - **concreteUrl:** static pages: the url itself. **The 13 dynamic pages** (web: `/account/orders/[orderId]`, `/brands/[slug]`, `/brands/[slug]/products`, `/brands/[slug]/subscribe`, `/brands/[slug]/subscribe/success`, `/products/[storeSlug]/[productSlug]`, `/seller/dashboard/orders/[orderId]`, `/seller/dashboard/products/[id]/edit`; admin: `/checkout-sessions/[sessionId]`, `/orders/[orderId]`, `/products/[id]`, `/seller-inquiries/[id]`, `/stores/[id]`): resolve each segment from one existing seeded row with a read-only `SELECT` (inspect the table with `\d` first; never write). If no row exists, or the row belongs to another user, set `status: not evaluated` with the reason.
  - **status:** `visitable` or `not evaluated: <reason>` (no seeded row, needs a session Andy does not have, paused checkout state). Admin pages are `visitable` only if Charlie signs in; otherwise `not evaluated`.
    Save as `/tmp/pr5-urls.json` and copy the table into the findings doc.
- [ ] **Step 4: Mobile overflow sweep (visitable URLs only).** For every `visitable` row, load `concreteUrl` at 390 px with `hasTouch` and record `scrollWidth > innerWidth`. Snippet (Playwright, per URL; never print cookies):

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

Each page with `scrollW > innerW` becomes an **entry in `findings.json`** (`kind: "overflow"`, `status: "open"`, the widest leaf element named in the description: the deepest elements with `getBoundingClientRect().right > innerWidth`). The known case is the new-product form (637 px). Apply Decision 4 later by changing the status: `resolved` with re-measured evidence after a fix, or `deferred` with a `followUp`. A `not evaluated` page is not a pass: it stays in the route table with its reason, and the PR body lists it.

- [ ] **Step 5: Manual review of the zero-hit pages, their imports, and the shell imports (Bob points 4 and v2-2).** For each of the 10 zero-hit pages in `/tmp/pr5-routes.json` (web `/`, `/about`, `/auth/verify-request`, `/brands/[slug]/products`, `/contact`, `/privacy`, `/refund`, `/shipping`, `/terms`; admin `/`), read the page file and **every file in its `files` list**, and check what the regexes cannot see (Review Focus 6): `next/link` or `<a>` styled as a button, `div`/`span` with `onClick`, hand-made toggles, styled `span` pills that should be `Badge`, one-off rounded boxes that should be `Card`, hard-coded colours in `style` props of third-party components. Record `reviewed: clean` or findings per page. Then review the **shared shell once**: for each entry in `shells` from `--routes` (6 on `main`), read the shell file **and every file it imports** (`files`), which is where NavBar, Sidebar, Footer and similar components live. Each shell file gets its own row, and the closure's files are named in it. A page's `shellClosure` is part of that page's review too, so a page is `reviewed: clean` only when its own closure **and** its shell closure are clean. Also read every file in `unreached` (none on `main`; any that appear get a row and an explanation). Every manual finding, from this step and from the Step 2 triage that no regex can express (a link styled as a button, a hand-made toggle, a pill that should be `Badge`), becomes an entry in `findings.json` (`kind: "manual"`, `status: "open"`) unless it is also a scanner hit.
- [ ] **Step 6: Write the findings doc.** Sections: (a) baseline vs triaged counts per class (FIX / EXCEPTION / DEFERRED); (b) **a route table with one row for every page** (64 rows, plus one row per shell file with its imports): url, concreteUrl or not-evaluated reason, access, scanner result (clean / covered / deferred / open), manual review result, overflow result; the doc is not complete until its page rows equal the `--routes` page count; (c) per-app hit tables; (d) the proposed split and order (Decision 1); (e) the DEFERRED list with follow-ups; (f) the ledger (every `findings.json` entry with its status).
- [ ] **Step 7: Draft `exceptions.json`, `deferred.json` and `findings.json`** from the EXCEPTION and DEFERRED rows (copy `rule`, `file`, `text` from `/tmp/pr5-hits.json`; write a real `reason`, and a `followUp` for deferred). Run `pnpm ui:audit --allow-deferred`; the only failures left must be the FIX rows and the open ledger findings.
- [ ] **Step 8: GATE.** Send the findings doc and the proposed split to Bob and Charlie. **No fix is written before they approve the lists and the split.** Commit the findings doc and the three JSON files only after approval. Message: `docs(ui): PR 5 findings, documented exceptions and deferred list`.

### Task 3: Fixes (size-gated)

- [ ] **Step 1: Apply the size rule.** If the FIX list touches **12 files or fewer**, do it in this PR. If more, this PR keeps the scanner, findings, exceptions and deferred list, and each fix group becomes its own small PR ordered by risk: colours (R2, R3b), then `Label`, then `Input`, then `Button`, then the provider Select. Record the order in the findings doc and in each affected `deferred.json` entry (`followUp`).
- [ ] **Step 2: Baseline screenshots** for every route a fix will touch: 1440 px and 390 px, light and dark, saved under the scratchpad (never committed).
- [ ] **Step 3: For each fix, write the swap and prove nothing else changed.** Template (a label swap that exists today in `create-plan-form.tsx`): replace `<label htmlFor="termMonths" className="…">` with `<Label htmlFor="termMonths" className="…">`, importing `Label` from `@bomy/ui/label`, with the same classes. For a form, read `FormData` before and after the swap and compare it field by field; they must be identical.
- [ ] **Step 3b: Provider application Select (conditional fix; Bob point 5).** The only R1-select hit is `apps/web/src/app/provider/apply/provider-apply-form.tsx:151`. Facts read from the file: a native `<select id="serviceCategoryChoice" name="serviceCategoryChoice" required>` that is **controlled** (`value={categoryChoice}`, `onChange` → `setCategoryChoice`), with `aria-invalid` and `aria-describedby` tied to `errors.serviceCategoryId`; options are the categories plus `Other` (`__other__`); the initial value is `categories[0]?.id ?? "__other__"`; the form submits through `onSubmit`, builds `FormData`, then sets `serviceCategoryId` to `""` when Other is chosen; `isOther` also switches the description label's `*` and `required={isOther}` on the description. **Migrate it only if all four proofs hold; otherwise record it in `deferred.json` with a follow-up and leave it native.**
  - **(a) State:** the trigger shows the first category on mount (or "Other" when there are no categories); choosing a value updates `categoryChoice`; choosing Other turns the description's `*` and `required` on, and leaving Other turns them off.
  - **(b) Validation:** first fill **every other required field** with valid values so the Select is the only thing under test: `name`, `contactEmail`, `contactNumber`, `companyName`, and, for the Other state, **`businessDescription`** (required only when Other is chosen; the form has no `noValidate`). Then, in each state (first category, another category, Other with the description filled, no categories), `checkValidity()` must be true and the `submit` handler must run once. Then check the failure side: in Other with the description **empty**, validity must be false and the failing control must be the description, not the Select; in every state the Select is never the control that fails. A `required` Radix Select must not block submit or focus its hidden native select (PR 4 contract). `aria-invalid` and `aria-describedby` appear on the **trigger** when `errors.serviceCategoryId` is set, and the error text renders. Run these checks on the native select first (the baseline) and on the Radix Select after, with the same literals.
  - **(c) FormData:** the entries are identical before and after, field by field, in all four states: `serviceCategoryChoice` equals the chosen value, and `serviceCategoryId` is the chosen id or `""` for Other. Compare the full entry list, not only these two.
  - **(d) How it is proven:** write the equivalence test **first, against the current native select**, with the other required fields filled first and the expected entries and validity per state as literals; it must pass. Migrate; change only the interaction helper (typeahead keys on the trigger instead of a `change` event); the same literals must pass. Then check `/provider/apply` in a browser (public page; sign in as the seeded buyer only if the route requires it): all three states, submit once, read the posted values. A failed proof, or a state that cannot be reached, means DEFERRED.
- [ ] **Step 3c: Close ledger findings as fixes land.** Each overflow or manual finding fixed in this PR changes to `resolved` with evidence (the new measurement, or the file and line re-read). Each one not fixed changes to `deferred` with a `followUp`. None may stay `open`.
- [ ] **Step 4: After each file,** run `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint` (or the admin equivalent), then the file's tests.
- [ ] **Step 5: Commit per rule group** (explicit paths; inspect `git diff --cached --stat` first). Message: `refactor(web|admin): <rule group> onto @bomy/ui / tokens (PR 5)`.

### Task 4: Verification

- [ ] **Step 1:** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/ui typecheck`, `pnpm --filter @bomy/ui lint`, `pnpm ui:audit:test`. Capture each exit code. Report the two web `DATABASE_URL` files and the 13 admin files as **not evaluated**.
- [ ] **Step 2:** `pnpm --filter @bomy/web build` and `pnpm --filter @bomy/admin build`. Capture the exit codes (do not infer them from the build output).
- [ ] **Step 3: Audit gates.** `pnpm ui:audit --allow-deferred` must exit **0** (zero open, zero stale, zero invalid). It also needs **zero open ledger findings**. Then run plain `pnpm ui:audit` and **report its result honestly**: it exits 0 only if `deferred.json` is empty and `findings.json` has no `open` or `deferred` entry. If it exits 1 because of deferred hits or ledger findings, the PR body says "styling roadmap pending: N deferred items" and lists them, scanner hits and ledger findings both. Paste the final per-rule table and the totals line into the PR.
- [ ] **Step 4: Built CSS.** For each app, confirm every class a fix introduced exists in `.next/static/css/*.css`.
- [ ] **Step 5: Browser, every changed route** (web as the seeded `seller_owner` via the Mailhog technique; admin only in Charlie's signed-in Chrome). Light and dark, 1440 px and 390 px. Compare with the Task 3 baseline screenshots and list every visual difference. Re-run the Step 4 overflow check from Task 2 on the changed routes and update the matching ledger entries. Admin routes Charlie did not check: **not evaluated**.
- [ ] **Step 6: Stop servers.** Confirm ports 3000 to 3002 are clear.

### Task 5: PR, docs and handoff

- [ ] **Step 1: Update the spec's PR 5 status** (one sentence) and this plan's status line.
- [ ] **Step 2: Push and open the PR.** The body lists: the method and the ten rules; baseline vs final counts; the FIX / EXCEPTION / DEFERRED counts; exception reasons grouped; what was fixed; the Decision outcomes; **the DEFERRED list (scanner hits and ledger findings) with its follow-up PRs and order, stating the roadmap is pending while it is non-empty**; the route table summary (64 pages, how many visitable, how many not evaluated and why); verified; **not verified** (admin routes Charlie did not check, `DATABASE_URL`-limited tests, checkout in a browser, layout shift, mobile touch where not tried).
- [ ] **Step 3: Update `.andy/handoff.md`** (§0): PR 5 open; the deferred list; the roadmap status ("complete" only when plain `pnpm ui:audit` exits 0).

### Task 6: After merge

- [ ] **Step 1:** Write `log/YYYY-MM-DD_PR<N>_bomy-ui-package-pr5.md` (gitignored). Update `.andy/handoff.md` §0: if plain `pnpm ui:audit` exits 0 (so `deferred.json` is empty and the ledger has no open or deferred entry), the `@bomy/ui` styling roadmap is complete; otherwise it stays **pending** with the follow-up PRs listed.
- [ ] **Step 2: REMIND CHARLIE (parked request, 2026-10-07).** Charlie asked to be reminded of the **Cloudflare origin lock** once the styling PRs are completed. Findings are in memory `project_cloudflare_origin_lock_reminder.md` and the handoff. If the roadmap is complete, raise it first. If deferred follow-ups remain, tell Charlie the roadmap is still pending on N items and ask whether to start the Cloudflare work now or after them (default: after, as he asked). Also remind him to demote his local admin user (`update users set role='buyer' where email='charliekong.work@gmail.com';`) and mention the suspected `DropdownMenu` typeahead bug (react-menu 2.1.24, untested).

---

## Self-review (writing-plans checklist)

- **Spec coverage:** raw controls (R1, R7), colours bypassing tokens (R2, R3), other inconsistencies (R4, R5, R6, overflow sweep, manual zero-hit review), findings list and split (Task 2 Step 6, Task 3 Step 1), "every route" (the 64-row route table), "done" (plain `pnpm ui:audit` exit 0).
- **Bob v2 points 1 to 3:** ledger (Task 1 interfaces, tests, mutation rows; Task 2 Steps 4 to 6; Task 3 Step 3c; Task 4 Step 3), shell imports (`shellClosure`, `shells`, `unreached`; Task 2 Step 5), provider proof order (Task 3 Step 3b (b), (d)).
- **Bob v1 points 1 to 5:** mapped in "Bob v1 review"; each has a task step and, for points 1 and 3, a mutation-checked test.
- **Placeholders:** none intended. `2026-10-XX` in the findings filename is the day the audit runs.
- **Consistency:** rule ids, entry shape, flags and script names match between the scanner code, the tests and the tasks.
- **Open:** the cap of 12 files is a proposal; the access classification in Task 2 Step 3 must be verified against the auth config when run.
