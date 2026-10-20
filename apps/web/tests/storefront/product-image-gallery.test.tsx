// @vitest-environment jsdom
// R5b: behaviour of the gallery, pinned on the old markup first. Looks (tile colour, fallback icon,
// focus rings) are asserted in the "R5b look" block added with the restyle.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ProductImageGallery } from "@/app/products/[storeSlug]/[productSlug]/product-image-gallery"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const imgs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, url: `https://img/${i}.jpg`, altText: null }))

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
})

const mount = (n: number) => {
  act(() => {
    root.render(<ProductImageGallery images={imgs(n)} productName="Tea" />)
  })
}
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}
const mainImg = () => container.querySelector("img")!
const label = (l: string) => container.querySelector(`button[aria-label="${l}"]`)

describe("ProductImageGallery behaviour", () => {
  it("0 images shows a fallback and no controls", () => {
    mount(0)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })

  it("1 image shows no arrows and no thumbnails", () => {
    mount(1)
    expect(mainImg().getAttribute("src")).toBe("https://img/0.jpg")
    expect(container.querySelectorAll("button")).toHaveLength(0)
  })

  it("3 images: next and previous wrap around; thumbnails select; labels are unchanged", () => {
    mount(3)
    expect(label("Previous image")).not.toBeNull()
    expect(label("Next image")).not.toBeNull()
    click(label("Next image")!)
    expect(mainImg().getAttribute("src")).toBe("https://img/1.jpg")
    click(label("Previous image")!)
    click(label("Previous image")!)
    expect(mainImg().getAttribute("src")).toBe("https://img/2.jpg")
    click(label("Next image")!)
    expect(mainImg().getAttribute("src")).toBe("https://img/0.jpg")
    click(label("View image 3")!)
    expect(mainImg().getAttribute("src")).toBe("https://img/2.jpg")
  })

  it("moving the mouse over the main image shows the zoom layer; leaving resets it", () => {
    mount(2)
    const frame = mainImg().parentElement!
    const zoomLayer = () => frame.children[1] as HTMLElement
    expect(zoomLayer().classList.contains("opacity-0")).toBe(true)
    act(() => {
      frame.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }))
    })
    expect(zoomLayer().classList.contains("opacity-100")).toBe(true)
    act(() => {
      frame.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
      frame.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }))
    })
  })
})
