import { describe, expect, it } from "vitest"

import { PspRequestError, isPspRequestError, pspErrorCode } from "../src/errors.js"
import { assertSafeMinor, senToMajorString } from "../src/money.js"

describe("senToMajorString", () => {
  it.each([
    [0n, "0.00"],
    [1n, "0.01"],
    [10n, "0.10"],
    [100n, "1.00"],
    [2999n, "29.99"],
    [7500n, "75.00"],
    [123456789012345678n, "1234567890123456.78"],
  ])("%s sen → %s", (sen, expected) => {
    expect(senToMajorString(sen)).toBe(expected)
  })

  it("throws on a negative amount", () => {
    expect(() => senToMajorString(-1n)).toThrow(/negative/)
  })
})

describe("assertSafeMinor", () => {
  it("accepts safe non-negative integers", () => {
    expect(assertSafeMinor(0)).toBe(0n)
    expect(assertSafeMinor(200)).toBe(200n)
    expect(assertSafeMinor(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991n)
  })

  it.each([[-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [Number.NaN], [Infinity], ["200"], [null]])(
    "rejects %s",
    (n) => {
      expect(() => assertSafeMinor(n)).toThrow(/assertSafeMinor/)
    },
  )
})

describe("PspRequestError helpers", () => {
  const e = new PspRequestError({
    provider: "hitpay",
    code: "validation",
    statusCode: 422,
    body: {},
    message: "HitPay validation error (422)",
  })

  it("isPspRequestError matches instances and look-alikes (cross-chunk identity)", () => {
    expect(isPspRequestError(e)).toBe(true)
    const lookAlike = Object.assign(new Error("x"), {
      name: "PspRequestError",
      code: "auth",
      statusCode: 401,
    })
    expect(isPspRequestError(lookAlike)).toBe(true)
    expect(isPspRequestError(new Error("x"))).toBe(false)
    expect(isPspRequestError("x")).toBe(false)
  })

  it("pspErrorCode returns the code, or 'unknown' for anything else", () => {
    expect(pspErrorCode(e)).toBe("validation")
    expect(pspErrorCode(new TypeError("fetch failed"))).toBe("unknown")
    expect(pspErrorCode(undefined)).toBe("unknown")
  })
})
