import { describe, expect, it } from "vitest"

import { normalizeBodyHtml } from "../../src/app/seller/dashboard/products/body-sanitizer"

const R2 = "https://pub.r2.example.com"
const PID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

describe("normalizeBodyHtml", () => {
  it("strips <script> tags", () => {
    const r = normalizeBodyHtml("<p>Hello</p><script>alert(1)</script>", PID, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain("script")
  })

  it("strips on* event attributes", () => {
    const r = normalizeBodyHtml('<p onclick="evil()">text</p>', PID, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain("onclick")
  })

  it("strips javascript: hrefs", () => {
    const r = normalizeBodyHtml('<a href="javascript:alert(1)">click</a>', PID, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain(
      "javascript:",
    )
  })

  it("strips data: URIs from img src", () => {
    const r = normalizeBodyHtml('<img src="data:image/png;base64,abc" />', PID, R2)
    // data: is stripped by DOMPurify (not in allowed attrs) — canonicalHtml is null (no meaningful content)
    expect(r.ok).toBe(true)
    const html = (r as { ok: true; canonicalHtml: string | null }).canonicalHtml
    expect(html).toBeNull()
  })

  it("strips <iframe> elements", () => {
    const r = normalizeBodyHtml('<iframe src="https://evil.com"></iframe>', PID, R2)
    expect(r.ok).toBe(true)
    // canonicalHtml is null (no meaningful content) — iframe was stripped entirely
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).toBeNull()
  })

  it("strips style attributes", () => {
    const r = normalizeBodyHtml('<p style="color:red">text</p>', PID, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain("style=")
  })

  it("preserves allowlisted elements and attributes", () => {
    const src = `${R2}/body/${PID}/${UUID}.jpg`
    const raw = `<h3>Title</h3><p>Text <strong>bold</strong></p><img src="${src}" alt="test" />`
    const r = normalizeBodyHtml(raw, PID, R2)
    expect(r.ok).toBe(true)
    const html = (r as { ok: true; canonicalHtml: string }).canonicalHtml
    expect(html).toContain("<h3>")
    expect(html).toContain("<strong>")
    expect(html).toContain(`src="${src}"`)
  })

  it("normalises links with rel=noopener noreferrer nofollow ugc", () => {
    const r = normalizeBodyHtml('<a href="https://example.com">link</a>', PID, R2)
    expect(r.ok).toBe(true)
    const html = (r as { ok: true; canonicalHtml: string }).canonicalHtml
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"')
  })

  it("rejects sanitized output exceeding 200 KB", () => {
    const big = "<p>" + "a".repeat(210 * 1024) + "</p>"
    const r = normalizeBodyHtml(big, PID, R2)
    expect(r).toMatchObject({ ok: false, error: "too_large" })
  })

  it("<p></p> alone → canonicalHtml null", () => {
    const r = normalizeBodyHtml("<p></p>", PID, R2)
    expect(r).toMatchObject({ ok: true, canonicalHtml: null })
  })

  it("<p>   </p> whitespace-only → canonicalHtml null", () => {
    const r = normalizeBodyHtml("<p>   </p>", PID, R2)
    expect(r).toMatchObject({ ok: true, canonicalHtml: null })
  })

  it("multiple empty paragraphs → canonicalHtml null", () => {
    const r = normalizeBodyHtml("<p></p><p></p>", PID, R2)
    expect(r).toMatchObject({ ok: true, canonicalHtml: null })
  })

  it("<p></p> plus one img → canonicalHtml not null", () => {
    const src = `${R2}/body/${PID}/${UUID}.jpg`
    const r = normalizeBodyHtml(`<p></p><img src="${src}" alt="x" />`, PID, R2)
    expect(r).toMatchObject({ ok: true })
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toBeNull()
  })

  it("rejects body with > 10 img tags (all counted)", () => {
    const src = `${R2}/body/${PID}/${UUID}.jpg`
    const imgs = Array.from({ length: 11 }, () => `<img src="${src}" alt="x" />`).join("")
    const r = normalizeBodyHtml(`<p>text</p>${imgs}`, PID, R2)
    expect(r).toMatchObject({ ok: false, error: "too_many_images" })
  })

  it("rejects a cross-product R2 image (invalid classification)", () => {
    const src = `${R2}/body/11111111-2222-3333-4444-555555555555/${UUID}.jpg`
    const r = normalizeBodyHtml(`<p>x</p><img src="${src}" alt="a" />`, PID, R2)
    expect(r).toMatchObject({ ok: false, error: "invalid_image_url" })
  })

  it("rejects figure with invalid YouTube video ID", () => {
    const r = normalizeBodyHtml(
      '<figure data-video-provider="youtube" data-video-id="not valid!!"></figure>',
      PID,
      R2,
    )
    expect(r).toMatchObject({ ok: false, error: "invalid_video" })
  })

  it("accepts figure with valid YouTube video ID", () => {
    const r = normalizeBodyHtml(
      '<figure data-video-provider="youtube" data-video-id="dQw4w9WgXcQ"></figure>',
      PID,
      R2,
    )
    expect(r).toMatchObject({ ok: true })
  })

  it("rejects raw input exceeding 400 KB before sanitization", () => {
    const huge = "<p>" + "a".repeat(401 * 1024) + "</p>"
    const r = normalizeBodyHtml(huge, PID, R2)
    expect(r).toMatchObject({ ok: false, error: "too_large" })
  })

  it("strips href from <p> elements (not an allowed attr for p)", () => {
    const r = normalizeBodyHtml('<p href="https://example.com">text</p>', PID, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string }).canonicalHtml).not.toContain("href=")
  })

  it("strips src from <a> elements (not an allowed attr for a)", () => {
    const r = normalizeBodyHtml(
      '<a src="https://example.com/img.jpg" href="https://example.com">link</a>',
      PID,
      R2,
    )
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string }).canonicalHtml).not.toContain("src=")
  })
})
