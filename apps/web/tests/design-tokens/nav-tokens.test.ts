// Soft-red R2, Task 1: the floating nav's tokens (offset above the pill, scrim colour, bento radius).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type RGB = [number, number, number]
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  return css.slice(start, css.indexOf("\n  }", start))
}
function tokensOf(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block(css, selector).matchAll(/--([a-z-]+):\s*([0-9]+ [0-9]+% [0-9]+%)/g))
    out[m[1]!] = m[2]!
  return out
}
function rgb(triplet: string): RGB {
  const [h, s, l] = triplet.match(/[0-9.]+/g)!.map(Number) as [number, number, number]
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}
const lum = ([r, g, b]: RGB) => {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const bright = (c: RGB, k: number): RGB => c.map((v) => Math.min(1, v * k)) as RGB

const WEB = resolve(__dirname, "../..")
const css = readFileSync(resolve(WEB, "src/app/globals.css"), "utf8")
const tailwind = readFileSync(resolve(WEB, "tailwind.config.ts"), "utf8")
const nav = readFileSync(resolve(WEB, "src/components/nav-bar.tsx"), "utf8")

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
  it("the nav has no literal palette colour and uses the scrim token", () => {
    expect(nav).not.toMatch(
      /\b(?:bg|text|border|ring)-(?:gray|slate|zinc|neutral|stone|black|white)\b/,
    )
    expect(nav).toContain("bg-scrim/")
  })
})

describe.each([
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
])("filled cart on the pill, $name", ({ selector }) => {
  const t = tokensOf(css, selector)
  const get = (n: string) => {
    const v = t[n]
    if (!v) throw new Error(`missing --${n}`)
    return rgb(v)
  }
  it("white on --primary is >= 4.5 at rest and at hover (brightness-90)", () => {
    expect(ratio(get("primary-foreground"), get("primary"))).toBeGreaterThanOrEqual(4.5)
    expect(
      ratio(bright(get("primary-foreground"), 0.9), bright(get("primary"), 0.9)),
    ).toBeGreaterThanOrEqual(4.5)
  })
  it("the count badge text (--foreground on --card) is >= 4.5", () => {
    expect(ratio(get("foreground"), get("card"))).toBeGreaterThanOrEqual(4.5)
  })
  it("the filled cart and the badge ring (--primary) are >= 3 against the pill (--card)", () => {
    expect(ratio(get("primary"), get("card"))).toBeGreaterThanOrEqual(3)
  })
})
