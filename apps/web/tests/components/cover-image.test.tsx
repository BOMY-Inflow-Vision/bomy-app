// @vitest-environment jsdom
// jsdom does not fetch images, so these tests prove the swap logic with synthetic events and
// properties. A real 404 image is proved in the browser (R4 evidence).
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CoverImage } from "@/components/cover-image"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)["complete"]
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)["naturalWidth"]
})

const mount = (src: string | null) => act(() => root.render(<CoverImage src={src} alt="Tea" />))
const img = () => container.querySelector("img")
const fallback = () => container.querySelector("svg")

describe("CoverImage", () => {
  it("null src shows the Package icon and no image", () => {
    mount(null)
    expect(img()).toBeNull()
    expect(fallback()?.getAttribute("aria-hidden")).toBe("true")
  })

  it("a src renders the image with alt, size and cover fit", () => {
    mount("https://x.test/t.jpg")
    const el = img()!
    expect(el.getAttribute("alt")).toBe("Tea")
    expect(el.getAttribute("width")).toBe("400")
    expect(el.getAttribute("height")).toBe("400")
    expect(el.classList.contains("object-cover")).toBe(true)
    expect(fallback()).toBeNull()
  })

  it("an error event swaps to the Package icon", () => {
    mount("https://x.test/t.jpg")
    act(() => {
      img()!.dispatchEvent(new Event("error"))
    })
    expect(img()).toBeNull()
    expect(fallback()).not.toBeNull()
  })

  it("an image that already failed before hydration swaps on mount", () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    })
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 0,
    })
    mount("https://x.test/t.jpg")
    expect(img()).toBeNull()
    expect(fallback()).not.toBeNull()
  })

  it("a loaded image stays", () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    })
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 400,
    })
    mount("https://x.test/t.jpg")
    expect(img()).not.toBeNull()
    expect(fallback()).toBeNull()
  })

  it("a new src after a failure tries the image again, and a second failure swaps again", () => {
    mount("https://x.test/a.jpg")
    act(() => {
      img()!.dispatchEvent(new Event("error"))
    })
    expect(img()).toBeNull()
    mount("https://x.test/b.jpg")
    expect(img()?.getAttribute("src")).toBe("https://x.test/b.jpg")
    act(() => {
      img()!.dispatchEvent(new Event("error"))
    })
    expect(img()).toBeNull()
    expect(fallback()).not.toBeNull()
  })
})
