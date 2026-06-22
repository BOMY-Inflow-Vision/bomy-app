import { describe, expect, it } from "vitest"

import { validateDisplayName } from "../../src/app/account/profile-schema"

describe("validateDisplayName", () => {
  it("trims and keeps a non-empty name", () => {
    expect(validateDisplayName("  Aisyah  ")).toEqual({ ok: true, value: "Aisyah" })
  })

  it("maps an empty / whitespace name to null", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: true, value: null })
  })

  it("rejects a name longer than 80 characters", () => {
    const r = validateDisplayName("x".repeat(81))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/80/)
  })
})
