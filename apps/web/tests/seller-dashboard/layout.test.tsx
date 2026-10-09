// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ pathname: "/seller/dashboard" }))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
// A plain anchor, so a click reaches only the layout's own handlers (next/link intercepts clicks).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import SellerDashboardLayout from "@/app/seller/dashboard/layout"

const ITEMS = [
  ["Overview", "/seller/dashboard"],
  ["Subscriptions", "/seller/dashboard/subscriptions"],
  ["Products", "/seller/dashboard/products"],
  ["Orders", "/seller/dashboard/orders"],
  ["Settings", "/seller/dashboard/settings"],
] as const

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(pathname: string) {
  nav.pathname = pathname
  act(() =>
    root.render(
      <SellerDashboardLayout>
        <p>page</p>
      </SellerDashboardLayout>,
    ),
  )
}
const links = () => [...container.querySelectorAll<HTMLAnchorElement>("aside nav a")]
const link = (label: string) => links().find((a) => a.textContent?.trim().startsWith(label))!

describe("seller dashboard sidebar", () => {
  it("renders every item as a real link, with no coming-soon items", () => {
    render("/seller/dashboard")
    expect(links().map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual(
      ITEMS.map(([label, href]) => [label, href]),
    )
    expect(container.textContent).not.toMatch(/soon/i)
  })

  it("does not swallow a click on Orders", () => {
    render("/seller/dashboard")
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    link("Orders").dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it("marks Orders active on an order page and Overview only on the overview", () => {
    render("/seller/dashboard/orders/abc")
    expect(link("Orders").className).toContain("border-primary")
    expect(link("Overview").className).not.toContain("border-primary")
    render("/seller/dashboard")
    expect(link("Overview").className).toContain("border-primary")
    expect(link("Orders").className).not.toContain("border-primary")
  })

  it("collapses into a scrolling strip on small screens and never forces the page wider", () => {
    render("/seller/dashboard")
    const aside = container.querySelector("aside")!
    expect(aside.className).toContain("w-full")
    expect(aside.className).toContain("md:w-52")
    expect(container.querySelector("aside nav")!.className).toContain("overflow-x-auto")
    expect(link("Orders").className).toContain("whitespace-nowrap")
    expect(container.querySelector("main")!.className).toContain("min-w-0")
  })
})

describe("seller dashboard strip scroll", () => {
  // jsdom has no layout: give each tab 100px at 100px steps inside a 390px strip, and make
  // scrollLeft a plain stored number.
  const LEFT: Record<string, number> = {
    Overview: 0,
    Subscriptions: 100,
    Products: 200,
    Orders: 300,
    Settings: 400,
  }
  const scrolls = new WeakMap<Element, number>()
  const protoDescriptors: [object, string, PropertyDescriptor | undefined][] = []
  const stub = (proto: object, key: string, desc: PropertyDescriptor) => {
    protoDescriptors.push([proto, key, Object.getOwnPropertyDescriptor(proto, key)])
    Object.defineProperty(proto, key, { configurable: true, ...desc })
  }

  beforeEach(() => {
    stub(HTMLElement.prototype, "offsetLeft", {
      get(this: HTMLElement) {
        return LEFT[this.textContent?.trim() ?? ""] ?? 0
      },
    })
    stub(HTMLElement.prototype, "offsetWidth", {
      get(this: HTMLElement) {
        return this.tagName === "A" ? 100 : 0
      },
    })
    stub(HTMLElement.prototype, "clientWidth", {
      get(this: HTMLElement) {
        return this.tagName === "NAV" ? 390 : 0
      },
    })
    stub(Element.prototype, "scrollLeft", {
      get(this: Element) {
        return scrolls.get(this) ?? 0
      },
      set(this: Element, value: number) {
        scrolls.set(this, value)
      },
    })
  })
  afterEach(() => {
    for (const [proto, key, original] of protoDescriptors.reverse()) {
      if (original) Object.defineProperty(proto, key, original)
      else delete (proto as Record<string, unknown>)[key]
    }
    protoDescriptors.length = 0
  })

  const strip = () => container.querySelector("aside nav")!

  it("marks only the active link with aria-current", () => {
    render("/seller/dashboard/orders")
    expect(link("Orders").getAttribute("aria-current")).toBe("page")
    expect(link("Overview").hasAttribute("aria-current")).toBe(false)
  })

  it("scrolls a link that sticks out of the strip into view (Orders)", () => {
    render("/seller/dashboard/orders")
    // link spans 300..400 in a 390px strip: centred => 300 + 50 - 195
    expect(strip().scrollLeft).toBe(155)
  })

  it("leaves the strip alone when the active link already fits", () => {
    render("/seller/dashboard")
    expect(strip().scrollLeft).toBe(0)
    render("/seller/dashboard/products")
    expect(strip().scrollLeft).toBe(0)
  })

  it("never scrolls below zero for a link near the start", () => {
    render("/seller/dashboard/orders")
    render("/seller/dashboard")
    expect(strip().scrollLeft).toBe(0)
  })
})
