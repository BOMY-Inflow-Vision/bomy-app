import { describe, expect, it } from "vitest"

import { parseStars, RATING_WINDOW_HOURS } from "../src/ratings.js"

describe("parseStars", () => {
  it.each([1, 2, 3, 4, 5])("accepts the integer %i", (n) => {
    expect(parseStars(n)).toEqual({ ok: true, value: n })
  })

  it.each([
    ["0", 0],
    ["6", 6],
    ["3.5", 3.5],
    ['the string "5"', "5"],
    ["NaN", Number.NaN],
    ["null", null],
    ["undefined", undefined],
    ["-1", -1],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_label, input) => {
    const result = parseStars(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(typeof result.errors.stars).toBe("string")
  })
})

describe("RATING_WINDOW_HOURS", () => {
  it("is 24", () => {
    expect(RATING_WINDOW_HOURS).toBe(24)
  })
})
