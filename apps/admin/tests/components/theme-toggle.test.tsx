// @vitest-environment jsdom
//
// Admin ThemeToggle (PR 5d-6): hydration placeholder, label flip and click action. Written first
// against the raw button (baseline); after the Button swap only TOKENS changes.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const theme = vi.hoisted(() => ({
  resolvedTheme: "light" as string | undefined,
  setTheme: vi.fn(),
}))
vi.mock("next-themes", () => ({ useTheme: () => theme }))

import { ThemeToggle } from "@/components/theme-toggle"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const TOKENS = [
  "size-8",
  "rounded-full",
  "text-sidebar-muted",
  "hover:bg-sidebar-accent",
  "hover:text-sidebar-strong",
  "focus-visible:ring-2",
  "focus-visible:ring-sidebar-ring",
  "relative",
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  theme.resolvedTheme = "light"
  theme.setTheme.mockReset()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount() {
  act(() => {
    root.render(<ThemeToggle />)
  })
  return container.querySelector("button")!
}

describe("admin ThemeToggle", () => {
  it("server render (before the effect): dark-mode label even if the theme is dark, sun visible", () => {
    theme.resolvedTheme = "dark"
    const html = renderToStaticMarkup(<ThemeToggle />)
    expect(html).toContain('aria-label="Switch to dark mode"')
    expect(html).toContain('type="button"')
    const doc = new DOMParser().parseFromString(html, "text/html")
    const [sun, moon] = Array.from(doc.querySelectorAll("svg"))
    expect(sun!.getAttribute("class")).toContain("opacity-100")
    expect(moon!.getAttribute("class")).toContain("opacity-0")
  })

  it("after mount in light: dark-mode label; click sets dark", () => {
    const btn = mount()
    expect(btn.getAttribute("aria-label")).toBe("Switch to dark mode")
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(theme.setTheme).toHaveBeenCalledWith("dark")
  })

  it("after mount in dark: light-mode label, moon visible; click sets light", () => {
    theme.resolvedTheme = "dark"
    const btn = mount()
    expect(btn.getAttribute("aria-label")).toBe("Switch to light mode")
    const [sun, moon] = Array.from(btn.querySelectorAll("svg"))
    expect(sun!.getAttribute("class")).toContain("opacity-0")
    expect(moon!.getAttribute("class")).toContain("opacity-100")
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(theme.setTheme).toHaveBeenCalledWith("light")
  })

  it("icons are aria-hidden", () => {
    const btn = mount()
    for (const svg of Array.from(btn.querySelectorAll("svg"))) {
      expect(svg.getAttribute("aria-hidden")).toBe("true")
    }
  })

  it("class tokens (updated by the swap)", () => {
    const btn = mount()
    for (const t of TOKENS) expect(btn.classList.contains(t), t).toBe(true)
  })
})
