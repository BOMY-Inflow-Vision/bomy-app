// Soft-red R2, Task 1: the floating nav's tokens (offset above the pill, scrim colour, bento radius).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const WEB = resolve(__dirname, "../..")
const css = readFileSync(resolve(WEB, "src/app/globals.css"), "utf8")
const tailwind = readFileSync(resolve(WEB, "tailwind.config.ts"), "utf8")

describe("nav tokens", () => {
  it("defines --nav-offset once, as 0.75rem", () => {
    expect(css.match(/--nav-offset:\s*0\.75rem/g)).toHaveLength(1)
  })
  it("defines --scrim in both themes (warm ink in light, black in dark)", () => {
    expect(css).toMatch(/:root \{[\s\S]*?--scrim:\s*8 22% 14%/)
    expect(css).toMatch(/\.dark \{[\s\S]*?--scrim:\s*0 0% 0%/)
  })
  it("maps nav-clear, scrim and bento in Tailwind", () => {
    expect(tailwind).toContain('"nav-clear": "calc(var(--nav-height) + var(--nav-offset))"')
    expect(tailwind).toContain('scrim: "hsl(var(--scrim))"')
    expect(tailwind).toContain('bento: "1.75rem"')
  })
})
