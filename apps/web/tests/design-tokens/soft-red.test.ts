// Soft-red storefront redesign, R1. Web only (admin keeps its own tokens): the blush ground Charlie
// chose (#EFDED7) as the tint colour on a nearly white page, the soft-red primary, a control border that stays visible on blank fields, and a
// destructive red that stays distinct from the primary action.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type RGB = [number, number, number]
const ROOT = resolve(__dirname, "../../../..")
const CSS = readFileSync(resolve(ROOT, "apps/web/src/app/globals.css"), "utf8")

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
const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const WHITE: RGB = [1, 1, 1]

const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
  fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as RGB

const light = tokens(CSS, ":root")
const dark = tokens(CSS, ".dark")

describe("soft red palette values (light)", () => {
  it.each([
    ["background", "20 50% 98%"], // nearly white (Charlie: the page ground must not read as coloured)
    ["foreground", "8 22% 14%"],
    ["card", "0 0% 100%"],
    ["popover", "0 0% 100%"],
    ["primary", "0 45% 42%"],
    ["primary-text", "0 45% 42%"],
    ["muted", "18 40% 95%"], // pale tint: the seller and account page ground must not read as coloured
    ["secondary", "18 40% 95%"],
    ["muted-foreground", "12 14% 37%"],
    ["accent", "18 50% 92%"],
    ["accent-foreground", "0 45% 42%"],
    ["border", "19 34% 83%"],
    ["input", "12 18% 48%"],
    ["ring", "0 45% 42%"],
  ])("--%s is %s", (name, value) => {
    expect(light[name]).toBe(value)
  })
})

describe("soft red palette values (dark)", () => {
  it.each([
    ["primary", "2 50% 50%"],
    ["primary-text", "4 55% 66%"],
    ["input", "28 12% 46%"],
  ])("--%s is %s", (name, value) => {
    expect(dark[name]).toBe(value)
  })
})

describe.each([
  { name: "light", t: light, surfaces: ["background", "card", "popover", "muted", "accent"] },
  { name: "dark", t: dark, surfaces: ["background", "card", "popover", "muted", "accent"] },
])("$name theme contrast", ({ name, t, surfaces }) => {
  const get = (n: string) => {
    const v = t[n]
    if (!v) throw new Error(`missing --${n}`)
    return rgb(v)
  }

  it.each(surfaces)("text on %s: foreground and muted-foreground are >= 4.5", (s) => {
    expect(ratio(get("foreground"), get(s))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(get("muted-foreground"), get(s))).toBeGreaterThanOrEqual(4.5)
  })

  it("accent-foreground on accent is >= 4.5", () => {
    expect(ratio(get("accent-foreground"), get("accent"))).toBeGreaterThanOrEqual(4.5)
  })

  it("the control border (--input) is >= 3 on every field surface, so a blank field has a visible edge", () => {
    for (const s of surfaces) expect(ratio(get("input"), get(s)), s).toBeGreaterThanOrEqual(3)
    if (name === "light") expect(ratio(get("input"), WHITE)).toBeGreaterThanOrEqual(3)
  })

  it("--input is its own value, not the decorative --border", () => {
    expect(t["input"]).not.toBe(t["border"])
  })

  it("the primary fill keeps white text >= 4.5 and is >= 3 against every surface it sits on", () => {
    expect(ratio(get("primary-foreground"), get("primary"))).toBeGreaterThanOrEqual(4.5)
    for (const s of surfaces) expect(ratio(get("primary"), get(s)), s).toBeGreaterThanOrEqual(3)
  })

  it("destructive is its own colour: not the primary, and far enough from it to tell apart", () => {
    expect(t["destructive"]).not.toBe(t["primary"])
    expect(distance(get("destructive"), get("primary"))).toBeGreaterThanOrEqual(0.15)
  })

  it("destructive uses by state: field-error border >= 3 and text on its hover tint (/10) >= 4.5 on every surface", () => {
    for (const s of surfaces) {
      expect(ratio(get("destructive"), get(s)), `border on ${s}`).toBeGreaterThanOrEqual(3)
      const tint = over(get("destructive"), get(s), 0.1)
      expect(ratio(get("destructive"), tint), `text on ${s} tint 0.1`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it("destructive active state (active:bg-destructive/20, only the membership manage button, which sits on bg-background) keeps its text >= 4.5", () => {
    const tint = over(get("destructive"), get("background"), 0.2)
    expect(ratio(get("destructive"), tint)).toBeGreaterThanOrEqual(4.5)
  })
  it("destructive solid (Button, Badge) keeps its foreground >= 4.5 at rest", () => {
    expect(ratio(get("destructive-foreground"), get("destructive"))).toBeGreaterThanOrEqual(4.5)
  })
})
