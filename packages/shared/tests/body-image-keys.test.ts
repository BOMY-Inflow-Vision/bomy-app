import { describe, expect, it } from "vitest"

import { classifyImageUrl, extractManagedBodyImageKeys } from "../src/body-image-keys.js"

const ORIGIN = "https://cdn.brandsofmalaysia.com"
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111"
const STORE_ID = "22222222-2222-2222-2222-222222222222"
const IMG_UUID = "33333333-3333-3333-3333-333333333333"

describe("classifyImageUrl — scoped", () => {
  it("classifies a product-shaped key as managed under a matching product scope", () => {
    const url = `${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe("managed")
  })

  it("classifies a store-shaped key as managed under a matching store scope", () => {
    const url = `${ORIGIN}/body/stores/${STORE_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "store", id: STORE_ID }, ORIGIN)).toBe("managed")
  })

  it("classifies a .webp key as managed", () => {
    const url = `${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.webp`
    expect(classifyImageUrl(url, { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe("managed")
  })

  it("rejects a managed-origin URL with a nested subpath", () => {
    const url = `${ORIGIN}/body/${PRODUCT_ID}/sub/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe("invalid")
  })

  it("classifies a data: URI as invalid", () => {
    expect(
      classifyImageUrl("data:image/png;base64,abc", { kind: "product", id: PRODUCT_ID }, ORIGIN),
    ).toBe("invalid")
  })

  it("classifies a parseable non-https http: URL as invalid", () => {
    expect(
      classifyImageUrl("http://example.com/photo.jpg", { kind: "product", id: PRODUCT_ID }, ORIGIN),
    ).toBe("invalid")
  })

  it("rejects a product-shaped key when checked against a store scope with the same id (Bob R1)", () => {
    const url = `${ORIGIN}/body/${STORE_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "store", id: STORE_ID }, ORIGIN)).toBe("invalid")
  })

  it("rejects a store-shaped key when checked against a product scope with the same id (Bob R1)", () => {
    const url = `${ORIGIN}/body/stores/${PRODUCT_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe("invalid")
  })

  it("rejects a product-shaped key belonging to a different product id", () => {
    const url = `${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.jpg`
    const otherProductId = "44444444-4444-4444-4444-444444444444"
    expect(classifyImageUrl(url, { kind: "product", id: otherProductId }, ORIGIN)).toBe("invalid")
  })

  it("classifies a different-origin https URL as external", () => {
    expect(
      classifyImageUrl(
        "https://example.com/photo.jpg",
        { kind: "product", id: PRODUCT_ID },
        ORIGIN,
      ),
    ).toBe("external")
  })

  it("classifies an unparseable URL as invalid", () => {
    expect(classifyImageUrl("not a url", { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe(
      "invalid",
    )
  })
})

describe("extractManagedBodyImageKeys — scoped", () => {
  it("extracts only keys matching the given product scope", () => {
    const html = `<img src="${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "product", id: PRODUCT_ID }, ORIGIN)
    expect(keys.has(`body/${PRODUCT_ID}/${IMG_UUID}.jpg`)).toBe(true)
  })

  it("extracts only keys matching the given store scope", () => {
    const html = `<img src="${ORIGIN}/body/stores/${STORE_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "store", id: STORE_ID }, ORIGIN)
    expect(keys.has(`body/stores/${STORE_ID}/${IMG_UUID}.jpg`)).toBe(true)
  })

  it("does not extract a product-scoped key when scanning under a store scope (Bob R1)", () => {
    const html = `<img src="${ORIGIN}/body/${STORE_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "store", id: STORE_ID }, ORIGIN)
    expect(keys.size).toBe(0)
  })

  it("does not extract a store-scoped key when scanning under a product scope (Bob R1)", () => {
    const html = `<img src="${ORIGIN}/body/stores/${PRODUCT_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "product", id: PRODUCT_ID }, ORIGIN)
    expect(keys.size).toBe(0)
  })

  it("returns an empty set for empty html", () => {
    expect(extractManagedBodyImageKeys("", { kind: "product", id: PRODUCT_ID }, ORIGIN).size).toBe(
      0,
    )
  })

  it("does not throw on a malformed img src", () => {
    const html = `<img src="not a url">`
    expect(() =>
      extractManagedBodyImageKeys(html, { kind: "product", id: PRODUCT_ID }, ORIGIN),
    ).not.toThrow()
    expect(
      extractManagedBodyImageKeys(html, { kind: "product", id: PRODUCT_ID }, ORIGIN).size,
    ).toBe(0)
  })
})
