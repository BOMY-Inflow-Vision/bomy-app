import { describe, expect, it } from "vitest"

import { BRAND_STORY_MIN_CHARS, extractPlainText } from "../../src/lib/brand-story-validation"

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
