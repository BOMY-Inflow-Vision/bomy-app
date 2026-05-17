import { describe, expect, test } from "vitest"

import { senToMyr } from "@/lib/money"

describe("senToMyr", () => {
  test("0n → '0.00'", () => expect(senToMyr(0n)).toBe("0.00"))
  test("1n → '0.01'", () => expect(senToMyr(1n)).toBe("0.01"))
  test("99n → '0.99'", () => expect(senToMyr(99n)).toBe("0.99"))
  test("100n → '1.00'", () => expect(senToMyr(100n)).toBe("1.00"))
  test("2999n → '29.99'", () => expect(senToMyr(2999n)).toBe("29.99"))
  test("100000n → '1000.00'", () => expect(senToMyr(100000n)).toBe("1000.00"))
  test("1234567n → '12345.67'", () => expect(senToMyr(1234567n)).toBe("12345.67"))
  test("negative throws", () => expect(() => senToMyr(-1n)).toThrow(/negative/))
})
