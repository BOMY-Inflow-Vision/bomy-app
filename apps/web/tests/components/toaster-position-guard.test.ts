// Pins the shared --nav-height variable (ledger entry man-b9b, fixed in PR 5d-7): the NavBar bar,
// the mobile scrim's top edge and the web toast offset all derive from one variable, so they
// cannot drift. The toast sits 1 rem below the bar.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, it } from "vitest"

const SRC = resolve(__dirname, "../../src")
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8")

it("--nav-height is defined once, as 3.5rem (the 56 px bar)", () => {
  const css = read("app/globals.css")
  const defs = css.match(/--nav-height:\s*([\d.]+)rem/g) ?? []
  expect(defs).toHaveLength(1)
  expect(defs[0]).toContain("3.5rem")
})

it("Tailwind exposes it as the nav spacing step", () => {
  const cfg = readFileSync(resolve(__dirname, "../../tailwind.config.ts"), "utf8")
  expect(cfg).toContain('nav: "var(--nav-height)"')
})

it("the bar, the scrim and the toast container all use the variable", () => {
  const nav = read("components/nav-bar.tsx")
  const toaster = read("components/toaster.tsx")
  expect(nav).toMatch(/mx-auto flex h-nav max-w-6xl/)
  expect(nav).toMatch(/fixed inset-x-0 bottom-0 top-nav /)
  expect(toaster).toMatch(/fixed inset-x-4 top-\[calc\(var\(--nav-height\)\+1rem\)\]/)
  // no leftover hard-coded copies of the height
  expect(nav).not.toMatch(/\bh-14\b|\btop-14\b/)
  expect(toaster).not.toContain("top-[4.5rem]")
})
