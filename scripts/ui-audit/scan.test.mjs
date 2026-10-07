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
