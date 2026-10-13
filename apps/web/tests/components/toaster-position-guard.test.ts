// Pins the coupling that ledger entry man-b9b tracks until PR 5d-7 shares one --nav-height
// variable: the web toast sits 1 rem below the NavBar (h-14), and the mobile scrim starts at the
// NavBar's bottom edge (top-14).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, it } from "vitest"

const SRC = resolve(__dirname, "../../src/components")
const rem = (n: number) => n * 0.25 // Tailwind spacing scale: 4 units = 1 rem

it("the toast container is the NavBar height plus 1 rem", () => {
  const nav = readFileSync(resolve(SRC, "nav-bar.tsx"), "utf8")
  const toaster = readFileSync(resolve(SRC, "toaster.tsx"), "utf8")
  const bar = nav.match(/mx-auto flex h-(\d+) max-w-6xl/)
  const scrim = nav.match(/fixed inset-x-0 bottom-0 top-(\d+) /)
  const toast = toaster.match(/fixed inset-x-4 top-\[([\d.]+)rem\]/)
  expect(bar, "NavBar bar height class").not.toBeNull()
  expect(scrim, "mobile scrim top class").not.toBeNull()
  expect(toast, "toast container top class").not.toBeNull()
  expect(rem(Number(scrim![1]))).toBe(rem(Number(bar![1])))
  expect(Number(toast![1])).toBe(rem(Number(bar![1])) + 1)
})
