// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ pathname: "/stores" }))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@/app/auth/actions", () => ({ signOutAction: async () => {} }))
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button" data-testid="theme" />,
}))

import { Sidebar } from "@/components/sidebar"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Sidebar email="admin@example.com" />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const toggle = () => container.querySelector<HTMLButtonElement>("header button[aria-controls]")!
const panel = () => container.querySelector<HTMLElement>("#admin-mobile-menu")!

describe("admin sidebar", () => {
  it("keeps the desktop sidebar for md and up and hides it below", () => {
    const aside = container.querySelector("aside")!
    expect(aside.className).toContain("hidden")
    expect(aside.className).toContain("md:flex")
    expect(aside.className).toContain("w-44")
    expect(aside.querySelectorAll("nav a")).toHaveLength(15)
  })

  it("shows a top bar below md whose menu starts closed", () => {
    const header = container.querySelector("header")!
    expect(header.className).toContain("md:hidden")
    expect(toggle().getAttribute("aria-expanded")).toBe("false")
    expect(panel().hidden).toBe(true)
  })

  it("opens and closes the menu from the button", () => {
    act(() => toggle().click())
    expect(toggle().getAttribute("aria-expanded")).toBe("true")
    expect(panel().hidden).toBe(false)
    expect(panel().querySelectorAll("a")).toHaveLength(15)
    act(() => toggle().click())
    expect(panel().hidden).toBe(true)
  })

  it("closes the menu on Escape", () => {
    act(() => toggle().click())
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(panel().hidden).toBe(true)
  })

  it("returns focus to the menu button when Escape closes the menu from inside it", () => {
    act(() => toggle().click())
    const first = panel().querySelector<HTMLAnchorElement>("a")!
    act(() => first.focus())
    expect(document.activeElement).toBe(first)
    act(() => {
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).toBe(toggle())
  })

  it("leaves focus on the theme toggle when Escape closes the menu", () => {
    const theme = container.querySelector<HTMLButtonElement>('header [data-testid="theme"]')!
    act(() => toggle().click())
    act(() => theme.focus())
    expect(document.activeElement).toBe(theme)
    act(() => {
      theme.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).toBe(theme)
  })

  it("does not take focus when Escape closes the menu while focus is elsewhere", () => {
    const outside = document.createElement("input")
    document.body.appendChild(outside)
    act(() => toggle().click())
    act(() => outside.focus())
    act(() => {
      outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it("closes the menu after a link is chosen", () => {
    act(() => toggle().click())
    const first = panel().querySelector<HTMLAnchorElement>("a")!
    first.addEventListener("click", (e) => e.preventDefault())
    act(() => first.click())
    expect(panel().hidden).toBe(true)
  })

  it("uses the sidebar tokens and no slate palette classes", () => {
    expect(container.innerHTML).not.toMatch(/(?<![a-z])slate-/)
    expect(container.querySelector("aside")!.className).toContain("bg-sidebar")
    expect(container.querySelector("header")!.className).toContain("bg-sidebar")
    for (const el of container.querySelectorAll(
      "nav a, header button:not([data-testid]), aside button:not([data-testid])",
    ))
      expect(el.className).toContain("focus-visible:ring-sidebar-ring")
  })

  it("marks the current page in both menus", () => {
    const active = [...container.querySelectorAll("a")].filter((a) =>
      a.className.includes("border-sidebar-indicator"),
    )
    expect(active).toHaveLength(2)
  })
})

// Link classes and aria-current (PR 5d-8). Written first against the hand-made links (baseline);
// after the SidebarLink swap the class strings must stay the same and aria-current is added.
const ADMIN_COMMON = [
  "px-4",
  "py-2",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-sidebar-ring",
  "focus-visible:ring-inset",
]
const ADMIN_ACTIVE = [
  "border-l-2",
  "border-sidebar-indicator",
  "bg-sidebar-accent",
  "text-sidebar-strong",
]
const ADMIN_INACTIVE = ["hover:bg-sidebar-accent", "hover:text-sidebar-strong"]
const hasAll = (el: Element, tokens: string[]) => tokens.every((t) => el.classList.contains(t))
function renderAt(pathname: string) {
  nav.pathname = pathname
  act(() => root.render(<Sidebar email="admin@example.com" />))
}
const lists = () => [
  [...container.querySelectorAll<HTMLAnchorElement>("aside nav a")],
  [...container.querySelectorAll<HTMLAnchorElement>("#admin-mobile-menu nav a")],
]
// TODO-5d-8: the baseline asserts today's gap (no aria-current); the swap flips it.
const CURRENT_COUNT = { represented: 0, unmatched: 0 }

const NAV_ITEMS = [
  ["Stores", "/stores"],
  ["Products", "/products"],
  ["Users", "/users"],
  ["Seller Inquiries", "/seller-inquiries"],
  ["Product Cats", "/categories"],
  ["Store Cats", "/store-categories"],
  ["Memberships", "/memberships"],
  ["Brand Subs", "/brand-subscriptions"],
  ["Brand Plans", "/brand-plans"],
  ["Goodie Box", "/goodie-box"],
  ["Vouchers", "/vouchers"],
  ["Sessions", "/checkout-sessions"],
  ["Orders", "/orders"],
  ["Payouts", "/payouts"],
  ["Config", "/config"],
]

describe("admin sidebar links", () => {
  it("keeps the fifteen items, their labels, destinations and order in both lists", () => {
    renderAt("/stores")
    for (const list of lists())
      expect(list.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(NAV_ITEMS)
  })

  it.each([
    ["/stores", "Stores"],
    ["/stores/abc", "Stores"],
    ["/store-categories", "Store Cats"],
    ["/seller-inquiries/xyz", "Seller Inquiries"],
  ])("%s: one active link (%s) per list, the others hover-styled", (path, label) => {
    renderAt(path)
    for (const list of lists()) {
      expect(list).toHaveLength(15)
      const active = list.filter((a) => hasAll(a, ADMIN_ACTIVE))
      expect(active.map((a) => a.textContent)).toEqual([label])
      for (const a of list) {
        expect(hasAll(a, ADMIN_COMMON)).toBe(true)
        if (a !== active[0]) expect(hasAll(a, ADMIN_INACTIVE)).toBe(true)
      }
    }
  })

  it("an unmatched route has no active link in either list", () => {
    renderAt("/not-a-page")
    for (const list of lists()) expect(list.filter((a) => hasAll(a, ADMIN_ACTIVE))).toHaveLength(0)
  })

  it("has no aria-current today (the gap this slice closes)", () => {
    renderAt("/stores")
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(CURRENT_COUNT.represented)
    renderAt("/not-a-page")
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(CURRENT_COUNT.unmatched)
  })
})
