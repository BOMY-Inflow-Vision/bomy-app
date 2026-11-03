import { describe, expect, it } from "vitest"

import { RATING_WINDOW_HOURS, formatRatingAvg, parseStars, windowHoursLeft } from "@/lib/ratings"

describe("formatRatingAvg", () => {
  it("prints the stored value with one decimal", () => {
    expect(formatRatingAvg("4.60")).toBe("4.6")
    expect(formatRatingAvg("0.00")).toBe("0.0")
    expect(formatRatingAvg(5)).toBe("5.0")
    expect(formatRatingAvg("4.50")).toBe("4.5")
  })
})

describe("re-exports from @bomy/db", () => {
  it("exposes parseStars and the window", () => {
    expect(RATING_WINDOW_HOURS).toBe(24)
    expect(parseStars(5)).toEqual({ ok: true, value: 5 })
    expect(parseStars("5").ok).toBe(false)
  })
})

describe("windowHoursLeft", () => {
  const now = new Date("2026-11-03T12:00:00Z")
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const H = 3_600_000
  it("rounds up whole hours while open", () => {
    expect(windowHoursLeft(ago(H), now)).toBe(23)
    expect(windowHoursLeft(ago(23 * H + 59 * 60_000), now)).toBe(1)
  })
  it("is 0 once closed", () => {
    expect(windowHoursLeft(ago(24 * H), now)).toBe(0)
    expect(windowHoursLeft(ago(25 * H), now)).toBe(0)
  })
})
