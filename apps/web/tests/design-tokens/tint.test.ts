// Soft-red R4: the blush tile colour (#EFDED7) as a real token, for storefront tiles only. The page
// ground stays nearly white. Text on the tint must stay readable in both themes.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type RGB = [number, number, number]
const CSS = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf8")

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  return css.slice(start, css.indexOf("\n  }", start))
}
function tokens(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block(css, selector).matchAll(/--([a-z-]+):\s*([0-9]+ [0-9]+% [0-9]+%)/g)) {
    out[m[1]!] = m[2]!
  }
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

const light = tokens(CSS, ":root")
const dark = tokens(CSS, ".dark")

describe("--tint (blush tile colour)", () => {
  it("is blush #EFDED7 in light and a warm dark tile in dark", () => {
    expect(light["tint"]).toBe("18 43% 89%")
    expect(dark["tint"]).toBe("20 18% 14%")
  })
  it("is not the page ground in either theme", () => {
    expect(light["tint"]).not.toBe(light["background"])
    expect(dark["tint"]).not.toBe(dark["background"])
  })
  it.each(["foreground", "muted-foreground", "primary-text"])(
    "%s on --tint is at least 4.5:1 in both themes",
    (name) => {
      expect(ratio(rgb(light[name]!), rgb(light["tint"]!))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(rgb(dark[name]!), rgb(dark["tint"]!))).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe("Tailwind exposes the R4 steps", () => {
  const cfg = readFileSync(resolve(__dirname, "../../tailwind.config.ts"), "utf8")
  it("tint colour, tile aspect ratio and eyebrow tracking", () => {
    expect(cfg).toContain('tint: "hsl(var(--tint))"')
    expect(cfg).toContain('tile: "4 / 5"')
    expect(cfg).toContain('eyebrow: "0.16em"')
  })
})
