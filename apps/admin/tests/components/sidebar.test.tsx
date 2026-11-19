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

function renderAt(pathname: string) {
  nav.pathname = pathname
  act(() => root.render(<Sidebar email="admin@example.com" />))
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  renderAt("/stores")
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const toggle = () => container.querySelector<HTMLButtonElement>("header button[aria-controls]")!
const panel = () => container.querySelector<HTMLElement>("#admin-mobile-menu")!
const isOpen = () => panel().getAttribute("data-open") === "true"
const lists = () => [
  [...container.querySelectorAll<HTMLAnchorElement>("aside nav a")],
  [...container.querySelectorAll<HTMLAnchorElement>("#admin-mobile-menu nav a")],
]
const pills = () => [
  container.querySelector<HTMLElement>("aside [data-pill]")!,
  container.querySelector<HTMLElement>("#admin-mobile-menu [data-pill]")!,
]

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

describe("admin sidebar shell", () => {
  it("is a floating tile from lg up and hidden below", () => {
    const aside = container.querySelector("aside")!
    for (const c of ["hidden", "lg:flex", "fixed", "rounded-3xl", "bg-card", "shadow-tile"])
      expect(aside.classList.contains(c), c).toBe(true)
    expect(aside.querySelectorAll("nav a")).toHaveLength(15)
  })

  it("shows a top bar below lg whose menu starts closed", () => {
    const header = container.querySelector("header")!
    expect(header.classList.contains("lg:hidden")).toBe(true)
    expect(toggle().getAttribute("aria-expanded")).toBe("false")
    expect(isOpen()).toBe(false)
  })

  it("keeps the closed drawer out of the tab order and away from screen readers", () => {
    expect(panel().getAttribute("aria-hidden")).toBe("true")
    expect(panel().hasAttribute("inert")).toBe(true)
    expect(panel().classList.contains("invisible")).toBe(true)
    act(() => toggle().click())
    expect(panel().getAttribute("aria-hidden")).toBe("false")
    expect(panel().hasAttribute("inert")).toBe(false)
    expect(panel().classList.contains("invisible")).toBe(false)
  })

  it("makes the open drawer a modal dialog, and not the closed one", () => {
    const dialog = panel().querySelector("[role='dialog']")!
    expect(dialog.getAttribute("aria-modal")).toBe("false")
    act(() => toggle().click())
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("aria-label")).toBe("Menu")
  })
})

describe("admin sidebar menu", () => {
  it("opens from the button and closes from the in-menu Close button", () => {
    act(() => toggle().click())
    expect(toggle().getAttribute("aria-expanded")).toBe("true")
    expect(isOpen()).toBe(true)
    expect(panel().querySelectorAll("nav a")).toHaveLength(15)
    act(() => panel().querySelector<HTMLButtonElement>("button[aria-label='Close menu']")!.click())
    expect(isOpen()).toBe(false)
  })

  it("moves focus into the drawer when it opens", () => {
    act(() => toggle().click())
    expect(document.activeElement).toBe(panel().querySelector("button[aria-label='Close menu']"))
  })

  it("closes the menu on Escape", () => {
    act(() => toggle().click())
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(isOpen()).toBe(false)
  })

  it("returns focus to the menu button when Escape closes the menu from inside it", () => {
    act(() => toggle().click())
    const first = panel().querySelector<HTMLAnchorElement>("nav a")!
    act(() => first.focus())
    expect(document.activeElement).toBe(first)
    act(() => {
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(isOpen()).toBe(false)
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
    expect(isOpen()).toBe(false)
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
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it("closes the menu after a link is chosen", () => {
    act(() => toggle().click())
    const first = panel().querySelector<HTMLAnchorElement>("nav a")!
    first.addEventListener("click", (e) => e.preventDefault())
    act(() => first.click())
    expect(isOpen()).toBe(false)
  })

  it("closes the menu when the dim area behind it is tapped", () => {
    act(() => toggle().click())
    act(() => panel().querySelector<HTMLElement>(":scope > span[aria-hidden]")!.click())
    expect(isOpen()).toBe(false)
  })
})

describe("admin sidebar links", () => {
  it("keeps the fifteen items, their labels, destinations and order in both lists", () => {
    for (const list of lists())
      expect(list.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(NAV_ITEMS)
  })

  it("every link is 44px tall and shows a keyboard focus ring", () => {
    for (const a of lists().flat()) {
      expect(a.classList.contains("h-11")).toBe(true)
      expect(a.classList.contains("focus-visible:ring-2")).toBe(true)
    }
  })

  it.each([
    ["/stores", "Stores"],
    ["/stores/abc", "Stores"],
    ["/store-categories", "Store Cats"],
    ["/seller-inquiries/xyz", "Seller Inquiries"],
  ])("%s: one current link (%s) per list", (path, label) => {
    renderAt(path)
    for (const list of lists())
      expect(
        list.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent),
      ).toEqual([label])
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(2)
  })

  it("an unmatched route has no current link in either list", () => {
    renderAt("/not-a-page")
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(0)
  })

  it("does not treat a longer route name as the same page", () => {
    // /store-categories must not light up Stores, and /stores-x must light up nothing.
    renderAt("/stores-archive")
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(0)
  })
})

describe("admin sidebar pill", () => {
  it("sits on the active link: link N is N rows (one pill height each) down the list", () => {
    renderAt("/stores")
    for (const p of pills()) expect(p.classList.contains("translate-y-0")).toBe(true)
    renderAt("/products")
    for (const p of pills()) expect(p.classList.contains("translate-y-full")).toBe(true)
    renderAt("/orders") // 13th item, index 12
    for (const p of pills()) {
      expect(p.classList.contains("translate-y-[1200%]")).toBe(true)
      expect(p.classList.contains("translate-y-0")).toBe(false)
    }
    renderAt("/config") // last item, index 14
    for (const p of pills()) expect(p.classList.contains("translate-y-[1400%]")).toBe(true)
  })

  it("is one row tall, and each link row is the same height", () => {
    // The offsets assume a row of 48px: the pill box is h-12 and each link is h-11 in a py-0.5 row.
    for (const p of pills()) expect(p.classList.contains("h-12")).toBe(true)
    for (const a of lists().flat()) {
      expect(a.classList.contains("h-11")).toBe(true)
      expect(a.parentElement!.classList.contains("py-0.5")).toBe(true)
    }
  })

  it("slides (a transform transition) and stops under reduced motion", () => {
    for (const p of pills()) {
      expect(p.classList.contains("transition-[transform,opacity]")).toBe(true)
      expect(p.classList.contains("motion-reduce:transition-none")).toBe(true)
    }
  })

  it("hides when no page matches", () => {
    renderAt("/not-a-page")
    for (const p of pills()) expect(p.classList.contains("opacity-0")).toBe(true)
  })

  it("has one offset per nav item, in the same order", () => {
    // The offsets are written out whole for Tailwind; keep them in step with the list.
    NAV_ITEMS.forEach(([, href], i) => {
      renderAt(href!)
      const want =
        i === 0 ? "translate-y-0" : i === 1 ? "translate-y-full" : `translate-y-[${i * 100}%]`
      for (const p of pills()) expect(p.classList.contains(want), `${href} -> ${want}`).toBe(true)
    })
  })
})
