import { describe, expect, test } from "vitest"

import { validateServiceProviderApplication } from "@/lib/service-provider-application-schema"

const valid = {
  name: "Aisha Tan",
  contactEmail: "aisha@example.com",
  contactNumber: "+60123456789",
  companyName: "Aisha Studio",
  serviceCategoryId: "11111111-1111-1111-1111-111111111111",
  businessDescription: null,
}

describe("validateServiceProviderApplication", () => {
  test("accepts a valid application with a real category and no description", () => {
    const r = validateServiceProviderApplication(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.serviceCategoryId).toBe(valid.serviceCategoryId)
  })

  test("rejects 'Other' (null category) with an empty description", () => {
    const r = validateServiceProviderApplication({
      ...valid,
      serviceCategoryId: null,
      businessDescription: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.businessDescription).toBeTruthy()
  })

  test("accepts 'Other' (null category) WITH a non-empty description", () => {
    const r = validateServiceProviderApplication({
      ...valid,
      serviceCategoryId: null,
      businessDescription: "I design brand identities for local cafes.",
    })
    expect(r.ok).toBe(true)
  })

  test("rejects missing name", () => {
    const r = validateServiceProviderApplication({ ...valid, name: "" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.name).toBeTruthy()
  })

  test("rejects an invalid contact email", () => {
    const r = validateServiceProviderApplication({ ...valid, contactEmail: "not-an-email" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.contactEmail).toBeTruthy()
  })

  test("rejects a malformed serviceCategoryId (not a UUID)", () => {
    const r = validateServiceProviderApplication({ ...valid, serviceCategoryId: "not-a-uuid" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.serviceCategoryId).toBeTruthy()
  })
})
