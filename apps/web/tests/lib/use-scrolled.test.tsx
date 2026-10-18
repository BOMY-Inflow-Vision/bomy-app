// @vitest-environment jsdom
//
// useScrolled: true once the page has scrolled more than a small threshold. The floating nav
// reads it to go from a 70% to a 95% solid background.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useScrolled } from "@/lib/use-scrolled"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ threshold }: { threshold?: number }) {
  const scrolled = useScrolled(threshold)
  return <span data-testid="probe">{String(scrolled)}</span>
}

let container: HTMLDivElement
let root: Root
const setY = (y: number) =>
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true })
    window.dispatchEvent(new Event("scroll"))
  })
const text = () => container.querySelector("[data-testid=probe]")!.textContent

beforeEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("useScrolled", () => {
  it("is false at the top, true past the default 8 px, and false again", () => {
    act(() => root.render(<Probe />))
    expect(text()).toBe("false")
    setY(8)
    expect(text()).toBe("false")
    setY(9)
    expect(text()).toBe("true")
    setY(0)
    expect(text()).toBe("false")
  })

  it("starts true when the page loads already scrolled (reload, Back)", () => {
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true })
    act(() => root.render(<Probe />))
    expect(text()).toBe("true")
  })

  it("honours a custom threshold", () => {
    act(() => root.render(<Probe threshold={100} />))
    setY(50)
    expect(text()).toBe("false")
    setY(101)
    expect(text()).toBe("true")
  })

  it("listens passively and removes the listener on unmount", () => {
    const add = vi.spyOn(window, "addEventListener")
    const remove = vi.spyOn(window, "removeEventListener")
    act(() => root.render(<Probe />))
    const call = add.mock.calls.find(([type]) => type === "scroll")!
    expect(call[2]).toEqual({ passive: true })
    act(() => root.unmount())
    expect(remove.mock.calls.some(([type, fn]) => type === "scroll" && fn === call[1])).toBe(true)
    root = createRoot(container)
  })
})
