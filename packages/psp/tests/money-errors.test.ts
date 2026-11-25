import { describe, expect, it } from "vitest"

import {
  PspRequestError,
  isPspRejection,
  isPspRequestError,
  outcomeForHttpStatus,
  pspErrorCode,
} from "../src/errors.js"
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

describe("failure outcome (definite rejection vs unknown)", () => {
  it.each([
    [400, "rejected"],
    [401, "rejected"],
    [403, "rejected"],
    [404, "rejected"],
    [422, "rejected"],
    [429, "rejected"],
    [408, "unknown"],
    [409, "unknown"],
    [425, "unknown"],
    [500, "unknown"],
    [502, "unknown"],
    [503, "unknown"],
    [504, "unknown"],
    [200, "unknown"],
    [302, "unknown"],
  ])("HTTP %i → %s", (status, outcome) => {
    expect(outcomeForHttpStatus(status)).toBe(outcome)
  })

  it("the constructor classifies by status unless an outcome is given", () => {
    const base = { provider: "hitpay" as const, code: "error", body: {}, message: "m" }
    expect(new PspRequestError({ ...base, statusCode: 422 }).outcome).toBe("rejected")
    expect(new PspRequestError({ ...base, statusCode: 500 }).outcome).toBe("unknown")
    expect(new PspRequestError({ ...base, statusCode: 200, outcome: "unknown" }).outcome).toBe(
      "unknown",
    )
  })

  it("isPspRejection is true only for a proven rejection; look-alikes without outcome fail safe", () => {
    const base = { provider: "hitpay" as const, code: "error", body: {}, message: "m" }
    expect(isPspRejection(new PspRequestError({ ...base, statusCode: 422 }))).toBe(true)
    expect(isPspRejection(new PspRequestError({ ...base, statusCode: 503 }))).toBe(false)
    const noOutcome = Object.assign(new Error("x"), {
      name: "PspRequestError",
      code: "validation",
      statusCode: 422,
    })
    expect(isPspRejection(noOutcome)).toBe(false)
    expect(isPspRejection(new TypeError("fetch failed"))).toBe(false)
  })
})
