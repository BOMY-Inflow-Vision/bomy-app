import { beforeEach, describe, expect, it } from "vitest"

import {
  BRAND_STORY_MIN_CHARS,
  extractPlainText,
  validateStoreProvisioning,
} from "../../src/lib/brand-story-validation"

describe("extractPlainText", () => {
  it("returns plain text unchanged (minus surrounding whitespace)", () => {
    const text = extractPlainText("<p>Founded in Penang in 2019, hand-poured every batch.</p>")
    expect(text).toBe("Founded in Penang in 2019, hand-poured every batch.")
  })

  it("strips tags across multiple elements and collapses inter-tag whitespace", () => {
    const text = extractPlainText("<h3>Our Story</h3><p>We started small.</p>")
    expect(text).toBe("Our Story We started small.")
  })

  it("decodes HTML entities via node-html-parser (regex tag-stripping would not)", () => {
    const text = extractPlainText("<p>Salt &amp; pepper, est. 2019</p>")
    expect(text).toBe("Salt & pepper, est. 2019")
  })

  it("entity-only body (&nbsp; padding) collapses to empty", () => {
    const text = extractPlainText("<p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>")
    expect(text).toBe("")
  })

  it("zero-width-space-only body collapses to empty", () => {
    const padding = String.fromCodePoint(0x200b).repeat(30)
    const text = extractPlainText(`<p>${padding}</p>`)
    expect(text).toBe("")
  })

  it("byte-order-mark-only body collapses to empty", () => {
    const padding = String.fromCodePoint(0xfeff).repeat(30)
    const text = extractPlainText(`<p>${padding}</p>`)
    expect(text).toBe("")
  })

  it("image-only body (no readable text) collapses to empty", () => {
    const text = extractPlainText('<img src="https://example.com/a.jpg" alt="a brand photo" />')
    expect(text).toBe("")
  })

  it("real text mixed with zero-width padding keeps only the real text", () => {
    const padding = String.fromCodePoint(0x200b).repeat(10)
    const text = extractPlainText(`<p>${padding}Real story text here.${padding}</p>`)
    expect(text).toBe("Real story text here.")
  })
})

describe("BRAND_STORY_MIN_CHARS gate (as used by callers)", () => {
  it("is 20", () => {
    expect(BRAND_STORY_MIN_CHARS).toBe(20)
  })

  it("a real sentence clears the bar", () => {
    const text = extractPlainText("<p>We started making candles in a small kitchen.</p>")
    expect(text.length).toBeGreaterThanOrEqual(BRAND_STORY_MIN_CHARS)
  })

  it("a short greeting does not clear the bar", () => {
    const text = extractPlainText("<p>Hi there!</p>")
    expect(text.length).toBeLessThan(BRAND_STORY_MIN_CHARS)
  })
})

describe("validateStoreProvisioning", () => {
  const STORE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  const VALID_BODY_HTML =
    "<p>We started making handcrafted candles in a small Penang kitchen in 2019.</p>"
  const VALID_VIDEO_URL = "https://youtu.be/dQw4w9WgXcQ"

  beforeEach(() => {
    process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"
  })

  it("happy path: returns sanitized bodyHtml and videoId", async () => {
    const result = await validateStoreProvisioning(VALID_BODY_HTML, VALID_VIDEO_URL, STORE_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.videoId).toBe("dQw4w9WgXcQ")
      expect(result.bodyHtml).toContain("handcrafted candles")
    }
  })

  it("non-string videoUrl (e.g. null from a missing FormData field) is rejected, not thrown", async () => {
    const result = await validateStoreProvisioning(VALID_BODY_HTML, null, STORE_ID)
    expect(result).toEqual({ ok: false, error: "A valid YouTube video URL is required." })
  })

  it("undefined videoUrl is rejected, not thrown", async () => {
    const result = await validateStoreProvisioning(VALID_BODY_HTML, undefined, STORE_ID)
    expect(result).toEqual({ ok: false, error: "A valid YouTube video URL is required." })
  })

  it("non-string bodyHtml (e.g. null from a missing FormData field) is rejected, not thrown", async () => {
    const result = await validateStoreProvisioning(null, VALID_VIDEO_URL, STORE_ID)
    expect(result).toEqual({ ok: false, error: "Brand Story is required." })
  })

  it("Brand Story under the 20-char text floor is rejected", async () => {
    const result = await validateStoreProvisioning("<p>Hi!</p>", VALID_VIDEO_URL, STORE_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/at least 20 characters/)
  })

  it("misconfigured S3_PUBLIC_URL is rejected", async () => {
    process.env["S3_PUBLIC_URL"] = ""
    const result = await validateStoreProvisioning(VALID_BODY_HTML, VALID_VIDEO_URL, STORE_ID)
    expect(result).toEqual({ ok: false, error: "Server misconfigured: S3_PUBLIC_URL." })
  })
})
