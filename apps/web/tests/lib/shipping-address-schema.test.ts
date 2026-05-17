import { describe, expect, test } from "vitest"

import { MY_STATES, validateShippingAddress } from "@/lib/shipping-address-schema"

const valid = {
  name: "Aisha Tan",
  phone: "+60123456789",
  line1: "12, Jalan Manggis",
  city: "Petaling Jaya",
  postcode: "47301",
  state: "Selangor",
  country: "MY",
}

describe("validateShippingAddress", () => {
  test("accepts a valid MY address", () => {
    const r = validateShippingAddress(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.name).toBe("Aisha Tan")
  })

  test("accepts optional line2", () => {
    const r = validateShippingAddress({ ...valid, line2: "Unit 3-A" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.line2).toBe("Unit 3-A")
  })

  test("rejects missing name with field-level error", () => {
    const r = validateShippingAddress({ ...valid, name: "" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.name).toBeTruthy()
  })

  test("rejects non-MY phone format", () => {
    const r = validateShippingAddress({ ...valid, phone: "+1 555 1234" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.phone).toBeTruthy()
  })

  test("accepts +60 prefix with 9 digits", () => {
    const r = validateShippingAddress({ ...valid, phone: "+60123456789" })
    expect(r.ok).toBe(true)
  })

  test("accepts 60 prefix without +", () => {
    const r = validateShippingAddress({ ...valid, phone: "60123456789" })
    expect(r.ok).toBe(true)
  })

  test("rejects 4-digit postcode", () => {
    const r = validateShippingAddress({ ...valid, postcode: "4730" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.postcode).toBeTruthy()
  })

  test("rejects 6-digit postcode", () => {
    const r = validateShippingAddress({ ...valid, postcode: "473011" })
    expect(r.ok).toBe(false)
  })

  test("rejects unknown state", () => {
    const r = validateShippingAddress({ ...valid, state: "California" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.state).toBeTruthy()
  })

  test("rejects non-MY country", () => {
    const r = validateShippingAddress({ ...valid, country: "SG" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.country).toBeTruthy()
  })

  test("MY_STATES contains 16 entries (13 states + 3 federal territories)", () => {
    expect(MY_STATES).toHaveLength(16)
  })

  test("rejects oversized name", () => {
    const r = validateShippingAddress({ ...valid, name: "a".repeat(121) })
    expect(r.ok).toBe(false)
  })

  test("rejects non-object input", () => {
    expect(validateShippingAddress("nope").ok).toBe(false)
    expect(validateShippingAddress(null).ok).toBe(false)
  })

  test("collects multiple errors at once", () => {
    const r = validateShippingAddress({ ...valid, name: "", postcode: "x" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.name).toBeTruthy()
      expect(r.errors.postcode).toBeTruthy()
    }
  })
})
