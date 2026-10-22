// R3: the two display font sizes the home hero uses, defined once in the Tailwind config.
import { describe, expect, it } from "vitest"

import config from "../../tailwind.config"

type Size = [string, { lineHeight?: string; letterSpacing?: string; fontWeight?: string }]
const sizes = (config.theme?.extend as { fontSize?: Record<string, Size> }).fontSize ?? {}

describe("display type tokens", () => {
  it.each(["display", "display-sm"])("%s exists with tight line height and tracking", (name) => {
    const entry = sizes[name]
    expect(entry, name).toBeDefined()
    const [size, opts] = entry!
    expect(size).toMatch(/^clamp\(/)
    expect(opts.lineHeight).toBe("0.95")
    expect(opts.letterSpacing).toMatch(/^-0\.0\d+em$/)
  })

  it("display-sm is never larger than display at either end", () => {
    const px = (v: string) => v.match(/([\d.]+)rem/g)!.map((x) => parseFloat(x))
    const [d1, , d3] = px(sizes["display"]![0])
    const [s1, , s3] = px(sizes["display-sm"]![0])
    expect(s1!).toBeLessThanOrEqual(d1!)
    expect(s3!).toBeLessThanOrEqual(d3!)
  })
})
