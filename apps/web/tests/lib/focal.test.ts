import { describe, expect, it } from "vitest"

import { clampFocal, coverOverflow, dragFocal, focalStyle, isFocalInput } from "@/lib/focal"

describe("clampFocal", () => {
  it("rounds to a whole percentage and clamps to 0..100", () => {
    expect(clampFocal(33.4)).toBe(33)
    expect(clampFocal(66.6)).toBe(67)
    expect(clampFocal(-5)).toBe(0)
    expect(clampFocal(130)).toBe(100)
    expect(clampFocal(0)).toBe(0)
    expect(clampFocal(100)).toBe(100)
  })
  it("anything that is not a finite number becomes the centre", () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined, {}]) {
      expect(clampFocal(v)).toBe(50)
    }
  })
})

describe("isFocalInput", () => {
  it("accepts finite numbers only", () => {
    expect(isFocalInput(0)).toBe(true)
    expect(isFocalInput(250)).toBe(true)
    expect(isFocalInput(Number.NaN)).toBe(false)
    expect(isFocalInput(Number.NEGATIVE_INFINITY)).toBe(false)
    expect(isFocalInput("5")).toBe(false)
  })
})

describe("focalStyle", () => {
  it("is undefined at the centre or without a value, so the markup stays as it was", () => {
    expect(focalStyle(50, 50)).toBeUndefined()
    expect(focalStyle(null, undefined)).toBeUndefined()
  })
  it("is the CSS object-position otherwise", () => {
    expect(focalStyle(20, 80)).toEqual({ objectPosition: "20% 80%" })
    expect(focalStyle(50, 0)).toEqual({ objectPosition: "50% 0%" })
  })
  it("clamps a bad stored value instead of emitting it", () => {
    expect(focalStyle(180, -9)).toEqual({ objectPosition: "100% 0%" })
  })
})

describe("coverOverflow", () => {
  it("a wide picture overflows sideways only", () => {
    expect(coverOverflow(200, 800, 400)).toEqual({ x: 200, y: 0 })
  })
  it("a tall picture overflows downwards only", () => {
    expect(coverOverflow(200, 400, 800)).toEqual({ x: 0, y: 200 })
  })
  it("a square picture overflows nowhere", () => {
    expect(coverOverflow(200, 640, 640)).toEqual({ x: 0, y: 0 })
  })
  it("unknown sizes overflow nowhere", () => {
    expect(coverOverflow(0, 800, 400)).toEqual({ x: 0, y: 0 })
    expect(coverOverflow(200, 0, 400)).toEqual({ x: 0, y: 0 })
  })
})

describe("dragFocal", () => {
  it("dragging the picture right moves the point left, by the share of the overflow", () => {
    expect(dragFocal(50, 100, 200)).toBe(0)
    expect(dragFocal(50, -100, 200)).toBe(100)
    expect(dragFocal(50, 20, 200)).toBe(40)
  })
  it("never leaves 0..100", () => {
    expect(dragFocal(10, 500, 200)).toBe(0)
    expect(dragFocal(90, -500, 200)).toBe(100)
  })
  it("with no overflow the point does not move", () => {
    expect(dragFocal(37, 80, 0)).toBe(37)
  })
})
