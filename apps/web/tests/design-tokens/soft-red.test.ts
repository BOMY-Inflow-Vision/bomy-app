// Soft-red storefront redesign, R1. Web only (admin keeps its own tokens): the blush ground Charlie
// chose (#EFDED7), the soft-red primary, a control border that stays visible on blank fields, and a
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

const light = tokens(CSS, ":root")
const dark = tokens(CSS, ".dark")

describe("soft red palette values (light)", () => {
  it.each([
    ["background", "18 43% 89%"], // #EFDED7, Charlie's blush
    ["foreground", "8 22% 14%"],
    ["card", "22 52% 96%"],
    ["popover", "22 52% 96%"],
    ["primary", "0 45% 42%"],
    ["primary-text", "0 45% 42%"],
    ["muted", "18 40% 91%"],
    ["secondary", "18 40% 91%"],
    ["muted-foreground", "12 14% 37%"],
    ["accent", "18 50% 94%"],
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
})
