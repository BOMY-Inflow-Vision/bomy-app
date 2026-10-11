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

describe.each(FILES)("%s", (file) => {
  const css = readFileSync(resolve(ROOT, file), "utf8")
  describe.each(THEMES)("$name", ({ selector }) => {
    const t = tokens(css, selector)
    const get = (n: string) => {
      const v = t[n]
      if (!v) throw new Error(`missing --${n} in ${selector}`)
      return rgb(v)
    }
    const surfaces = ["background", "card", "muted", ...(selector === ".dark" ? ["popover"] : [])]

    for (const s of ["success", "warning", "info"] as const) {
      it(`${s}: text on every surface and on its own tint is >= 4.5`, () => {
        for (const surf of surfaces) expect(ratio(get(s), get(surf))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get(s), get(`${s}-subtle`))).toBeGreaterThanOrEqual(4.5)
      })
      it(`${s}: solid fill with foreground, rest and hover (brightness-90) >= 4.5`, () => {
        expect(ratio(get(`${s}-foreground`), get(s))).toBeGreaterThanOrEqual(4.5)
        expect(
          ratio(bright(get(`${s}-foreground`), 0.9), bright(get(s), 0.9)),
        ).toBeGreaterThanOrEqual(4.5)
      })
      it(`${s}: icon on its tint is >= 3`, () => {
        expect(ratio(get(s), get(`${s}-subtle`))).toBeGreaterThanOrEqual(3)
      })
    }

    it("focus ring against every surface is >= 3", () => {
      for (const surf of surfaces) expect(ratio(get("ring"), get(surf))).toBeGreaterThanOrEqual(3)
    })
    it("destructive solid with foreground, rest and hover >= 4.5", () => {
      expect(ratio(get("destructive-foreground"), get("destructive"))).toBeGreaterThanOrEqual(4.5)
      expect(
        ratio(bright(get("destructive-foreground"), 0.9), bright(get("destructive"), 0.9)),
      ).toBeGreaterThanOrEqual(4.5)
    })
    it("text-destructive on bg-destructive/10 over the card is >= 4.5", () => {
      const tint = over(get("destructive"), get("card"), 0.1)
      expect(ratio(get("destructive"), tint)).toBeGreaterThanOrEqual(4.5)
    })
    it("membership price box: foreground text on bg-reward/10 over the card is >= 4.5", () => {
      const tint = over(get("reward"), get("card"), 0.1)
      expect(ratio(get("foreground"), tint)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(get("muted-foreground"), tint)).toBeGreaterThanOrEqual(4.5)
    })
    it("membership controls: reward button rest and hover >= 4.5, eyebrow on the card >= 4.5, check marks >= 3", () => {
      expect(ratio(get("reward-foreground"), get("reward"))).toBeGreaterThanOrEqual(4.5)
      expect(
        ratio(bright(get("reward-foreground"), 0.9), bright(get("reward"), 0.9)),
      ).toBeGreaterThanOrEqual(4.5)
      expect(ratio(get("muted-foreground"), get("card"))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(get("primary"), get("card"))).toBeGreaterThanOrEqual(3)
    })
    it("sidebar: text, hover and active pairs, indicator and ring", () => {
      for (const bg of ["sidebar", "sidebar-accent"]) {
        expect(ratio(get("sidebar-strong"), get(bg))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get("sidebar-foreground"), get(bg))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get("sidebar-muted"), get(bg))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get("sidebar-indicator"), get(bg))).toBeGreaterThanOrEqual(3)
        expect(ratio(get("sidebar-ring"), get(bg))).toBeGreaterThanOrEqual(3)
      }
    })
  })
})

describe("the two apps share one token set", () => {
  const names = [
    "success",
    "success-foreground",
    "success-subtle",
    "warning",
    "warning-foreground",
    "warning-subtle",
    "info",
    "info-foreground",
    "info-subtle",
    "destructive-foreground",
    "sidebar",
    "sidebar-foreground",
    "sidebar-strong",
    "sidebar-muted",
    "sidebar-accent",
    "sidebar-border",
    "sidebar-indicator",
    "sidebar-ring",
  ]
  it.each([":root", ".dark"])("%s values are identical in web and admin", (selector) => {
    const [web, admin] = FILES.map((f) => tokens(readFileSync(resolve(ROOT, f), "utf8"), selector))
    for (const n of names) expect(web![n], n).toBeDefined()
    for (const n of names) expect(admin![n], n).toBe(web![n])
  })
})
