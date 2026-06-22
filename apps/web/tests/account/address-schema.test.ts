import { describe, expect, it } from "vitest"

import { validateAddressBookEntry } from "../../src/app/account/addresses/address-schema"

const base = {
  name: "Aisyah",
  phone: "+60123456789",
  line1: "1 Jalan",
  line2: "",
  city: "George Town",
  postcode: "10000",
  state: "Pulau Pinang" as const,
  country: "MY" as const,
}

describe("validateAddressBookEntry", () => {
  it("accepts a valid entry and trims an empty label to null", () => {
    const r = validateAddressBookEntry({ ...base, label: "  " })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.label).toBeNull()
  })

  it("keeps a trimmed label", () => {
    const r = validateAddressBookEntry({ ...base, label: "  Home " })
    expect(r.ok && r.value.label).toBe("Home")
  })

  it("rejects a too-long label", () => {
    const r = validateAddressBookEntry({ ...base, label: "x".repeat(41) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.label).toBeTruthy()
  })

  it("propagates address validation errors", () => {
    const r = validateAddressBookEntry({ ...base, label: null, postcode: "abc" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.postcode).toBeTruthy()
  })
})
