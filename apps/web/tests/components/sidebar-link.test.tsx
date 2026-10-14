// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarLink } from "@bomy/ui/sidebar-link"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function parse(html: string): Element {
  return new DOMParser().parseFromString(html, "text/html").body.firstElementChild!
}
const has = (el: Element, tokens: string[]) => tokens.every((t) => el.classList.contains(t))

const FOCUS = [
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-sidebar-ring",
  "focus-visible:ring-inset",
]
const HOVER = ["hover:bg-sidebar-accent", "hover:text-sidebar-strong"]
const LIST_ACTIVE = [
  "border-l-2",
  "border-sidebar-indicator",
  "bg-sidebar-accent",
  "text-sidebar-strong",
]
const STRIP_ACTIVE = [
  "border-b-2",
  "border-sidebar-indicator",
  "bg-sidebar-accent",
  "text-sidebar-strong",
  "md:border-b-0",
  "md:border-l-2",
]

describe("SidebarLink", () => {
  it("renders an anchor by default", () => {
    const el = parse(renderToStaticMarkup(<SidebarLink href="/x">X</SidebarLink>))
    expect(el.tagName).toBe("A")
    expect(el.getAttribute("href")).toBe("/x")
    expect(el.textContent).toBe("X")
  })

  it("marks only the active link with aria-current=page, never aria-current=false", () => {
    const on = parse(renderToStaticMarkup(<SidebarLink active>X</SidebarLink>))
    const off = parse(renderToStaticMarkup(<SidebarLink>X</SidebarLink>))
    const offExplicit = parse(renderToStaticMarkup(<SidebarLink active={false}>X</SidebarLink>))
    expect(on.getAttribute("aria-current")).toBe("page")
    expect(off.hasAttribute("aria-current")).toBe(false)
    expect(offExplicit.hasAttribute("aria-current")).toBe(false)
  })

  it("list look: active border-left, inactive hover", () => {
    const on = parse(renderToStaticMarkup(<SidebarLink active>X</SidebarLink>))
    const off = parse(renderToStaticMarkup(<SidebarLink>X</SidebarLink>))
    expect(has(on, [...FOCUS, ...LIST_ACTIVE])).toBe(true)
    expect(HOVER.some((t) => on.classList.contains(t))).toBe(false)
    expect(has(off, [...FOCUS, ...HOVER])).toBe(true)
    expect(LIST_ACTIVE.some((t) => off.classList.contains(t))).toBe(false)
    expect(on.classList.contains("whitespace-nowrap")).toBe(false)
  })

  it("strip look: no-wrap, bottom border on small screens and left border from md", () => {
    const on = parse(
      renderToStaticMarkup(
        <SidebarLink orientation="strip" active>
          X
        </SidebarLink>,
      ),
    )
    const off = parse(renderToStaticMarkup(<SidebarLink orientation="strip">X</SidebarLink>))
    expect(has(on, ["whitespace-nowrap", ...FOCUS, ...STRIP_ACTIVE])).toBe(true)
    expect(has(off, ["whitespace-nowrap", ...FOCUS, ...HOVER])).toBe(true)
    expect(STRIP_ACTIVE.some((t) => off.classList.contains(t))).toBe(false)
  })

  it("appends className and lets it override padding", () => {
    const el = parse(
      renderToStaticMarkup(
        <SidebarLink className="px-5 py-2 custom" active>
          X
        </SidebarLink>,
      ),
    )
    expect(has(el, ["px-5", "py-2", "custom", ...LIST_ACTIVE])).toBe(true)
  })

  describe("asChild", () => {
    let container: HTMLDivElement
    let root: Root
    beforeEach(() => {
      container = document.createElement("div")
      document.body.append(container)
      root = createRoot(container)
    })
    afterEach(() => {
      act(() => root.unmount())
      container.remove()
    })

    it("puts its props on the child element and keeps the child's own props and handlers", () => {
      const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault())
      act(() =>
        root.render(
          <SidebarLink asChild active className="px-4">
            <a href="/orders" onClick={onClick} data-x="1">
              Orders
            </a>
          </SidebarLink>,
        ),
      )
      const a = container.querySelector("a")!
      expect(container.querySelectorAll("a")).toHaveLength(1)
      expect(a.getAttribute("href")).toBe("/orders")
      expect(a.getAttribute("data-x")).toBe("1")
      expect(a.getAttribute("aria-current")).toBe("page")
      expect(has(a, ["px-4", ...LIST_ACTIVE])).toBe(true)
      act(() => a.click())
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it("forwards a ref to the element", () => {
      const ref = React.createRef<HTMLAnchorElement>()
      act(() =>
        root.render(
          <SidebarLink ref={ref} asChild>
            <a href="/x">X</a>
          </SidebarLink>,
        ),
      )
      expect(ref.current).toBe(container.querySelector("a"))
    })
  })
})
