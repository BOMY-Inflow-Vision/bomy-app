// man-5a3: red text (text-primary) must stay readable on every surface it sits on, in both apps and
// both themes, without touching the red fill (--primary, white text on it). Surfaces come from the
// call-site inventory: background, card, popover (link buttons), muted, accent, an admin table row
// hover (muted/50 over background) and the dropzone drag state (primary/5 over card).
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

const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
] as const

describe.each(FILES)("man-5a3 primary text: %s", (file) => {
  const css = readFileSync(resolve(ROOT, file), "utf8")
  describe.each(THEMES)("$name", ({ name, selector }) => {
    const t = tokens(css, selector)
    const get = (n: string) => {
      const v = t[n]
      if (!v) throw new Error(`missing --${n} in ${selector}`)
      return rgb(v)
    }
    const text = () => get("primary-text")
    const flat = ["background", "card", "popover", "muted", "accent"]

    it("defines --primary-text", () => {
      expect(t["primary-text"]).toBeDefined()
    })

    it.each(flat)("text-primary on %s is >= 4.5", (s) => {
      expect(ratio(text(), get(s))).toBeGreaterThanOrEqual(4.5)
    })

    it("text-primary on an admin row hover (muted/50 over background and over card) is >= 4.5", () => {
      for (const base of ["background", "card"]) {
        expect(ratio(text(), over(get("muted"), get(base), 0.5))).toBeGreaterThanOrEqual(4.5)
      }
    })

    it("text-primary on the dropzone drag state (primary/5 over card and over background) is >= 4.5", () => {
      for (const base of ["card", "background"]) {
        expect(ratio(text(), over(get("primary"), get(base), 0.05))).toBeGreaterThanOrEqual(4.5)
      }
    })

    it("the red fill keeps white text >= 4.5 (button, chip, badge default)", () => {
      expect(ratio(get("primary-foreground"), get("primary"))).toBeGreaterThanOrEqual(4.5)
    })

    it("the muted 'Coming soon' label (text-muted-foreground) is >= 4.5 on the dashboard tile (background)", () => {
      expect(ratio(get("muted-foreground"), get("background"))).toBeGreaterThanOrEqual(4.5)
    })

    if (name === "light") {
      it("is the same red as --primary in light mode, so light text does not change", () => {
        expect(t["primary-text"]).toBe(t["primary"])
      })
    }
  })
})
