import { describe, expect, it } from "vitest"

import { formatHitPayStartDate } from "../../src/lib/hitpay-date"

describe("formatHitPayStartDate", () => {
  it("boundary: 16:30 UTC (00:30 SGT next day) → SGT date, not UTC date", () => {
    // 2026-06-17T16:30Z = 2026-06-18T00:30+08:00 → should return 2026-06-18, not 2026-06-17
    expect(formatHitPayStartDate(new Date("2026-06-17T16:30:00.000Z"))).toBe("2026-06-18")
  })

  it("midday UTC → same calendar date in SGT", () => {
    // 2026-06-18T10:00Z = 2026-06-18T18:00+08:00 → same date in both zones
    expect(formatHitPayStartDate(new Date("2026-06-18T10:00:00.000Z"))).toBe("2026-06-18")
  })

  it("just before midnight SGT (15:59 UTC) → same SGT day", () => {
    // 2026-06-18T15:59Z = 2026-06-18T23:59+08:00 → still June 18 in SGT
    expect(formatHitPayStartDate(new Date("2026-06-18T15:59:00.000Z"))).toBe("2026-06-18")
  })

  it("exactly midnight SGT (16:00 UTC) → rolls to next SGT day", () => {
    // 2026-06-18T16:00Z = 2026-06-19T00:00+08:00 → June 19 in SGT
    expect(formatHitPayStartDate(new Date("2026-06-18T16:00:00.000Z"))).toBe("2026-06-19")
  })
})
