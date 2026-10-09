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
})
