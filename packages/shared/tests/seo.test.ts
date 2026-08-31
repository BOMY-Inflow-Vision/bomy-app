import { describe, expect, it } from "vitest"

import { validateSeoFields } from "../src/seo.js"

describe("validateSeoFields", () => {
  it("accepts all-empty input, normalizing to null", () => {
    const result = validateSeoFields({ metaTitle: "", metaDescription: "", ogImageUrl: "" })
    expect(result).toEqual({
      ok: true,
      value: { metaTitle: null, metaDescription: null, ogImageUrl: null },
    })
  })

  it("accepts valid non-empty values", () => {
    const result = validateSeoFields({
      metaTitle: "My Title",
      metaDescription: "A description",
      ogImageUrl: "https://cdn.example.com/og.png",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        metaTitle: "My Title",
        metaDescription: "A description",
        ogImageUrl: "https://cdn.example.com/og.png",
      },
    })
  })

  it("trims whitespace", () => {
    const result = validateSeoFields({ metaTitle: "  Hi  ", metaDescription: "", ogImageUrl: "" })
    expect(result).toEqual({
      ok: true,
      value: { metaTitle: "Hi", metaDescription: null, ogImageUrl: null },
    })
  })

  it("rejects metaTitle over 70 characters", () => {
    const result = validateSeoFields({
      metaTitle: "a".repeat(71),
      metaDescription: "",
      ogImageUrl: "",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.metaTitle).toMatch(/70/)
  })

  it("accepts metaTitle at exactly 70 characters", () => {
    const result = validateSeoFields({
      metaTitle: "a".repeat(70),
      metaDescription: "",
      ogImageUrl: "",
    })
    expect(result.ok).toBe(true)
  })

  it("rejects metaDescription over 160 characters", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "a".repeat(161),
      ogImageUrl: "",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.metaDescription).toMatch(/160/)
  })

  it("rejects a non-URL ogImageUrl", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "",
      ogImageUrl: "not a url",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ogImageUrl).toBeTruthy()
  })

  it("rejects a non-http(s) protocol", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "",
      ogImageUrl: "ftp://example.com/img.png",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ogImageUrl).toMatch(/http/)
  })

  it("rejects ogImageUrl over 2048 characters", () => {
    const longUrl = `https://example.com/${"a".repeat(2048)}`
    const result = validateSeoFields({ metaTitle: "", metaDescription: "", ogImageUrl: longUrl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ogImageUrl).toMatch(/2048/)
  })

  it("normalizes an uppercase or mixed-case protocol to lowercase", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "",
      ogImageUrl: "HTTPS://cdn.example.com/og.png",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        metaTitle: null,
        metaDescription: null,
        ogImageUrl: "https://cdn.example.com/og.png",
      },
    })
  })

  it("normalizes a URL missing the double slash after the scheme", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "",
      ogImageUrl: "https:cdn.example.com/og.png",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        metaTitle: null,
        metaDescription: null,
        ogImageUrl: "https://cdn.example.com/og.png",
      },
    })
  })

  it("ignores non-string field values instead of throwing", () => {
    const result = validateSeoFields({
      metaTitle: 123,
      metaDescription: null,
      ogImageUrl: undefined,
    })
    expect(result).toEqual({
      ok: true,
      value: { metaTitle: null, metaDescription: null, ogImageUrl: null },
    })
  })

  it("rejects non-object input", () => {
    const result = validateSeoFields(null)
    expect(result.ok).toBe(false)
  })
})
