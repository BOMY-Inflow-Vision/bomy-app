import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type RGB = [number, number, number]
const ROOT = resolve(__dirname, "../../../..")
const FILES = ["apps/web/src/app/globals.css", "apps/admin/src/app/globals.css"]

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
const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
  fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as RGB
const bright = (c: RGB, k: number): RGB => c.map((v) => Math.min(1, v * k)) as RGB

const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
] as const

describe.each(FILES)("5a-2 status pairs: %s", (file) => {
  const css = readFileSync(resolve(ROOT, file), "utf8")
  describe.each(THEMES)("$name", ({ selector }) => {
    const t = tokens(css, selector)
    const get = (n: string) => {
      const v = t[n]
      if (!v) throw new Error(`missing --${n} in ${selector}`)
      return rgb(v)
    }
    const surfaces = ["background", "card", "muted"]

    it.each(surfaces)("text-destructive on bg-destructive/10 over %s is >= 4.5", (s) => {
      const tint = over(get("destructive"), get(s), 0.1)
      expect(ratio(get("destructive"), tint)).toBeGreaterThanOrEqual(4.5)
    })

    it("Processing button: text-info on bg-info-subtle, rest and hover:brightness-95 >= 4.5", () => {
      expect(ratio(get("info"), get("info-subtle"))).toBeGreaterThanOrEqual(4.5)
      expect(
        ratio(bright(get("info"), 0.95), bright(get("info-subtle"), 0.95)),
      ).toBeGreaterThanOrEqual(4.5)
    })

    it.each(["success", "warning", "info"] as const)(
      "text-%s on its subtle tint is >= 4.5 (sign-in notice, boxes, pills)",
      (s) => {
        expect(ratio(get(s), get(`${s}-subtle`))).toBeGreaterThanOrEqual(4.5)
      },
    )

    it("role badges: secondary text on secondary, foreground on card are >= 4.5", () => {
      expect(ratio(get("secondary-foreground"), get("secondary"))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(get("foreground"), get("card"))).toBeGreaterThanOrEqual(4.5)
    })
  })
})
