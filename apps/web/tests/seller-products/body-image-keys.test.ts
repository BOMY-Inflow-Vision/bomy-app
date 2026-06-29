import { describe, expect, it } from "vitest"

import { classifyImageUrl, extractManagedBodyImageKeys } from "@bomy/shared"

const R2 = "https://pub.r2.example.com"
const PID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const OTHER_PID = "11111111-2222-3333-4444-555555555555"
const UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

describe("classifyImageUrl", () => {
  it('returns "managed" for exact body key at R2 origin', () => {
    expect(classifyImageUrl(`${R2}/body/${PID}/${UUID}.jpg`, PID, R2)).toBe("managed")
  })

  it('returns "managed" for .webp extension', () => {
    expect(classifyImageUrl(`${R2}/body/${PID}/${UUID}.webp`, PID, R2)).toBe("managed")
  })

  it('returns "invalid" for cross-product R2 URL (different productId in path)', () => {
    expect(classifyImageUrl(`${R2}/body/${OTHER_PID}/${UUID}.jpg`, PID, R2)).toBe("invalid")
  })

  it('returns "invalid" for R2 URL with nested subpath', () => {
    expect(classifyImageUrl(`${R2}/body/${PID}/sub/${UUID}.jpg`, PID, R2)).toBe("invalid")
  })

  it('returns "invalid" for data: URI', () => {
    expect(classifyImageUrl("data:image/png;base64,abc", PID, R2)).toBe("invalid")
  })

  it('returns "external" for valid https: at a different origin', () => {
    expect(classifyImageUrl("https://example.com/img.jpg", PID, R2)).toBe("external")
  })

  it('returns "invalid" for http: URL', () => {
    expect(classifyImageUrl("http://example.com/img.jpg", PID, R2)).toBe("invalid")
  })

  it('returns "invalid" for relative URL', () => {
    expect(classifyImageUrl("/images/foo.jpg", PID, R2)).toBe("invalid")
  })

  it('returns "invalid" for unparseable string', () => {
    expect(classifyImageUrl("not a url ://!!", PID, R2)).toBe("invalid")
  })
})

describe("extractManagedBodyImageKeys", () => {
  it("returns R2 keys matching productId, skips external and other-product R2 URLs", () => {
    const html = `
      <p>
        <img src="${R2}/body/${PID}/${UUID}.jpg" />
        <img src="${R2}/body/${OTHER_PID}/${UUID}.png" />
        <img src="https://external.com/img.jpg" />
      </p>
    `
    const keys = extractManagedBodyImageKeys(html, PID, R2)
    expect(keys).toEqual(new Set([`body/${PID}/${UUID}.jpg`]))
  })

  it("returns empty set for empty html", () => {
    expect(extractManagedBodyImageKeys("", PID, R2).size).toBe(0)
  })

  it("skips unparseable img src without throwing", () => {
    const html = `<img src="not a url" />`
    expect(() => extractManagedBodyImageKeys(html, PID, R2)).not.toThrow()
    expect(extractManagedBodyImageKeys(html, PID, R2).size).toBe(0)
  })
})
