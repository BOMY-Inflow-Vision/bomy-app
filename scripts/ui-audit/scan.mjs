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
