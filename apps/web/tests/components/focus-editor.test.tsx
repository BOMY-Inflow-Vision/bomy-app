// @vitest-environment jsdom
// The focal-point picker: a square frame the seller drags the picture inside, plus two sliders.
// jsdom has no layout, so the picture's natural size and the frame width are stubbed.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FocusEditor } from "@/components/focus-editor"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
const stubs: string[] = []

// A 800 x 400 picture in a 200 px frame: it overflows 200 px sideways and 0 px downwards.
function stubGeometry(nw: number, nh: number, frame = 200) {
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get: () => nw,
  })
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
    configurable: true,
    get: () => nh,
  })
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => frame,
  })
  stubs.push("naturalWidth", "naturalHeight")
  Element.prototype.setPointerCapture = vi.fn()
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  for (const k of stubs.splice(0)) {
    delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)[k]
  }
  delete (HTMLElement.prototype as unknown as Record<string, unknown>)["clientWidth"]
})

const props = { src: "https://cdn.test/a.jpg", alt: "Chair", initialX: 50, initialY: 50 }
function mount(over: Partial<React.ComponentProps<typeof FocusEditor>> = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  act(() => {
    root.render(<FocusEditor {...props} onSave={onSave} onCancel={onCancel} {...over} />)
  })
  return { onSave, onCancel }
}
const frame = () => container.querySelector<HTMLElement>("[data-focus-frame]")!
const pic = () => container.querySelector("img")!
const sliders = () =>
  Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]'))
const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(name))!
const ptr = (type: string, x: number, y: number) =>
  act(() => {
    frame().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))
  })
function setSlider(el: HTMLInputElement, value: number) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      el,
      String(value),
    )
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("FocusEditor", () => {
  it("shows the picture in a square frame, at the saved point", () => {
    stubGeometry(800, 400)
    mount({ initialX: 20, initialY: 80 })
    expect(frame().classList.contains("aspect-square")).toBe(true)
    expect(pic().classList.contains("object-cover")).toBe(true)
    expect(pic().style.objectPosition).toBe("20% 80%")
    expect(pic().getAttribute("alt")).toBe("Chair")
  })

  it("has no inline position at the centre", () => {
    stubGeometry(800, 400)
    mount()
    expect(pic().getAttribute("style")).toBeNull()
  })

  it("has two named sliders; the axis with nothing to crop is disabled", () => {
    stubGeometry(800, 400)
    mount()
    const [h, v] = sliders()
    expect(h!.labels?.[0]?.textContent).toBe("Horizontal position")
    expect(v!.labels?.[0]?.textContent).toBe("Vertical position")
    expect(h!.disabled).toBe(false)
    expect(v!.disabled).toBe(true)
  })

  it("dragging the picture left moves the point right (and right moves it left)", () => {
    stubGeometry(800, 400)
    mount()
    ptr("pointerdown", 100, 100)
    ptr("pointermove", 0, 100) // 100 px left of the start: 100 / 200 of the overflow
    expect(pic().style.objectPosition).toBe("100% 50%")
    ptr("pointermove", 200, 100) // 100 px right of the start
    expect(pic().style.objectPosition).toBe("0% 50%")
    ptr("pointerup", 200, 100)
    ptr("pointermove", 0, 100) // no drag in progress: nothing moves
    expect(pic().style.objectPosition).toBe("0% 50%")
  })

  it("a drag along the axis with nothing to crop changes nothing", () => {
    stubGeometry(800, 400)
    mount()
    ptr("pointerdown", 100, 100)
    ptr("pointermove", 100, 0)
    expect(pic().getAttribute("style")).toBeNull()
  })

  it("the sliders move the point", () => {
    stubGeometry(800, 400)
    mount()
    setSlider(sliders()[0]!, 30)
    expect(pic().style.objectPosition).toBe("30% 50%")
  })

  it("Save is off until something changed, then sends the new point", () => {
    stubGeometry(800, 400)
    const { onSave } = mount()
    expect(button("Save focus").disabled).toBe(true)
    setSlider(sliders()[0]!, 30)
    expect(button("Save focus").disabled).toBe(false)
    act(() => button("Save focus").click())
    expect(onSave).toHaveBeenCalledWith(30, 50)
  })

  it("Centre puts the point back to 50 / 50, and is off when already there", () => {
    stubGeometry(800, 400)
    mount({ initialX: 20, initialY: 50 })
    expect(button("Centre").disabled).toBe(false)
    act(() => button("Centre").click())
    expect(pic().style.objectPosition).toBe("")
    expect(button("Centre").disabled).toBe(true)
  })

  it("Cancel calls onCancel and saves nothing", () => {
    stubGeometry(800, 400)
    const { onSave, onCancel } = mount()
    act(() => button("Cancel").click())
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("while saving, every button is off and Save says so", () => {
    stubGeometry(800, 400)
    mount({ saving: true, initialX: 20 })
    for (const b of container.querySelectorAll("button")) expect(b.disabled).toBe(true)
    expect(button("Saving").textContent).toContain("Saving")
  })

  it("a square picture says nothing is cropped and offers Close only", () => {
    stubGeometry(640, 640)
    const { onCancel } = mount()
    // The load handler measures once the picture is in.
    act(() => {
      pic().dispatchEvent(new Event("load"))
    })
    expect(container.textContent).toContain("nothing is cropped")
    expect(sliders()).toHaveLength(0)
    expect(container.textContent).not.toContain("Save focus")
    act(() => button("Close").click())
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
