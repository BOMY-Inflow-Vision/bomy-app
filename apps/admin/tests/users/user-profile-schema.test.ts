import { describe, expect, it } from "vitest"

import { validateUserProfile } from "../../src/app/users/user-profile-schema"

describe("validateUserProfile", () => {
  it("trims + lowercases email and nulls an empty name", () => {
    const r = validateUserProfile({ name: "   ", email: "  USER@Example.COM " })
    expect(r).toEqual({ ok: true, value: { name: null, email: "user@example.com" } })
  })

  it("keeps a trimmed name", () => {
    const r = validateUserProfile({ name: "  Aisyah ", email: "a@b.com" })
    expect(r.ok && r.value.name).toBe("Aisyah")
  })

  it("rejects an empty email", () => {
    expect(validateUserProfile({ name: "x", email: "   " })).toEqual({
      ok: false,
      errors: { email: "Email is required" },
    })
  })

  it("rejects a malformed email", () => {
    const r = validateUserProfile({ name: "x", email: "not-an-email" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.email).toMatch(/valid email/)
  })
})
