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

  it("marks the current page in both menus", () => {
    const active = [...container.querySelectorAll("a")].filter((a) =>
      a.className.includes("border-primary"),
    )
    expect(active).toHaveLength(2)
  })
})
