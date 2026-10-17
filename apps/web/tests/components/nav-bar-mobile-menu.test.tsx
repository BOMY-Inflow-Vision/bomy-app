// @vitest-environment jsdom
//
// Web mobile menu (PR 5d-7; man-b4, man-b5, man-b9b). Written first against the hand-made
// hamburger and panel (baseline); the swaps change only the TOKENS expectations. The behaviour
// tests (open/close, Escape, row and scrim click, items and order) must not change.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn<() => { data: unknown }>(),
}))
vi.mock("next-auth/react", () => ({ useSession: () => useSessionMock() }))
vi.mock("@/lib/cart", () => ({ useCart: () => ({ itemCount: 0, hydrated: false }) }))
// next-themes needs a provider; the theme toggle is not under test.
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button" aria-label="Switch to dark mode" />,
}))

import { NavBar } from "@/components/nav-bar"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Class tokens (updated by the swaps; the plan says which).
const TOKENS = {
  shell: ["pointer-events-none", "sticky", "z-50"],
  frame: ["pointer-events-auto", "relative", "mx-auto", "max-w-5xl"],
  bar: ["h-nav", "rounded-full"],
  scrim: ["pointer-events-auto", "top-nav-clear", "md:hidden", "-z-10", "bg-scrim/30"],
  panel: ["mt-2", "rounded-bento"],
  hamburger: [
    "size-11",
    "rounded-md",
    "transition-none",
    "text-muted-foreground",
    "hover:bg-muted",
    "hover:text-foreground",
  ],
  row: [
    "h-auto",
    "justify-start",
    "rounded-md",
    "px-3",
    "py-3",
    "text-base",
    "font-normal",
    "text-foreground",
    "transition-none",
    "hover:bg-muted",
    "hover:text-foreground",
  ],
}
const BAR_COMMON = [
  "absolute",
  "h-0.5",
  "w-4",
  "rounded-full",
  "bg-current",
  "motion-reduce:transition-none",
]

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  // jsdom has no matchMedia; the menu watches the md breakpoint (D30). The D30 tests override this.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function mount(session: unknown = null) {
  useSessionMock.mockReturnValue({ data: session })
  act(() => {
    root.render(<NavBar />)
  })
}
const hamburger = () => container.querySelector<HTMLButtonElement>('[aria-controls="mobile-menu"]')!
const panel = () => container.querySelector<HTMLElement>("#mobile-menu")!
const rows = () => Array.from(panel().querySelectorAll("a"))
const scrim = () => container.querySelector<HTMLButtonElement>('button[aria-hidden="true"]')
const bars = () => Array.from(hamburger().querySelectorAll("span > span"))
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  })
function has(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
}

describe("hamburger", () => {
  it("is a closed type=button wired to the panel, with the 44 px box and the muted look", () => {
    mount()
    const b = hamburger()
    expect(b.tagName).toBe("BUTTON")
    expect(b.getAttribute("type")).toBe("button")
    expect(b.getAttribute("aria-label")).toBe("Open menu")
    expect(b.getAttribute("aria-expanded")).toBe("false")
    has(b, TOKENS.hamburger)
    expect(b.querySelector("span")!.classList.contains("h-6")).toBe(true)
    expect(b.querySelector("span")!.classList.contains("w-6")).toBe(true)
  })

  it("the three bars: closed lines, with the spring transition and reduced-motion off-switch", () => {
    mount()
    const [top, mid, bottom] = bars()
    has(top!, [
      ...BAR_COMMON,
      "transition-transform",
      "duration-300",
      "ease-spring",
      "-translate-y-1.5",
      "rotate-0",
    ])
    has(mid!, [...BAR_COMMON, "transition-opacity", "duration-150", "opacity-100"])
    has(bottom!, [
      ...BAR_COMMON,
      "transition-transform",
      "duration-300",
      "ease-spring",
      "translate-y-1.5",
      "rotate-0",
    ])
  })

  it("the three bars: open cross, middle bar faded", () => {
    mount()
    click(hamburger())
    const [top, mid, bottom] = bars()
    has(top!, ["translate-y-0", "rotate-45"])
    has(mid!, ["opacity-0"])
    has(bottom!, ["translate-y-0", "-rotate-45"])
  })
})

describe("open and close", () => {
  it("click opens (label, aria-expanded, panel no longer inert, scrim present) and again closes", () => {
    mount()
    expect(panel().hasAttribute("inert")).toBe(true)
    expect(scrim()).toBeNull()
    click(hamburger())
    expect(hamburger().getAttribute("aria-label")).toBe("Close menu")
    expect(hamburger().getAttribute("aria-expanded")).toBe("true")
    expect(panel().hasAttribute("inert")).toBe(false)
    expect(scrim()).not.toBeNull()
    click(hamburger())
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(panel().hasAttribute("inert")).toBe(true)
    expect(scrim()).toBeNull()
  })

  it("Escape closes an open menu", () => {
    mount()
    click(hamburger())
    escape()
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(panel().hasAttribute("inert")).toBe(true)
  })

  it("Escape does nothing while the menu is closed", () => {
    mount()
    escape()
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
  })

  it("a click on a row closes the menu", () => {
    mount()
    click(hamburger())
    click(rows()[0]!)
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
  })

  it("a click on the scrim closes the menu", () => {
    mount()
    click(hamburger())
    click(scrim()!)
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(scrim()).toBeNull()
  })
})

describe("rows", () => {
  const PUBLIC = [
    ["Brands", "/brands"],
    ["Products", "/products"],
    ["Membership", "/membership"],
    ["Sell with us", "/seller/apply"],
    ["Become a provider", "/provider/apply"],
  ]
  const items = () => rows().map((a) => [a.textContent, a.getAttribute("href")])

  it("signed out: the public links then Sign in", () => {
    mount(null)
    expect(items()).toEqual([...PUBLIC, ["Sign in", "/auth/sign-in"]])
  })

  it("buyer: the public links then Account", () => {
    mount({ user: { role: "buyer" } })
    expect(items()).toEqual([...PUBLIC, ["Account", "/account"]])
  })

  it("seller_owner: the public links, then Seller, then Account", () => {
    mount({ user: { role: "seller_owner" } })
    expect(items()).toEqual([...PUBLIC, ["Seller", "/seller/dashboard"], ["Account", "/account"]])
  })

  it("class tokens: every row (updated by the swap)", () => {
    mount({ user: { role: "seller_owner" } })
    for (const a of rows()) has(a, TOKENS.row)
  })
})

describe("nav height", () => {
  it("class tokens: floating shell, pill, panel and scrim (updated by the floating pill)", () => {
    mount()
    has(container.querySelector("nav")!, TOKENS.shell)
    has(container.querySelector("nav > div")!, TOKENS.frame)
    has(container.querySelector("nav > div > div")!, TOKENS.bar)
    has(panel(), TOKENS.panel)
    click(hamburger())
    has(scrim()!, TOKENS.scrim)
  })

  it("the scrim sits inside a pointer-events-none shell, so it must opt back in to receive clicks", () => {
    mount()
    click(hamburger())
    expect(container.querySelector("nav")!.classList.contains("pointer-events-none")).toBe(true)
    expect(scrim()!.classList.contains("pointer-events-auto")).toBe(true)
  })
})

describe("Escape and focus (D29)", () => {
  const themeToggle = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Switch to dark mode"]')!

  it("focus on a row: Escape closes the menu and focus returns to the hamburger", () => {
    mount()
    click(hamburger())
    act(() => rows()[1]!.focus())
    expect(document.activeElement).toBe(rows()[1])
    escape()
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(hamburger())
  })

  it("focus on the hamburger: Escape closes the menu and focus stays there", () => {
    mount()
    click(hamburger())
    act(() => hamburger().focus())
    escape()
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(hamburger())
  })

  it("focus on another page control: Escape closes the menu and leaves focus alone", () => {
    mount()
    click(hamburger())
    const toggle = themeToggle()
    act(() => toggle.focus())
    escape()
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(toggle)
  })
})

describe("crossing the md breakpoint (D30)", () => {
  type Listener = (e: { matches: boolean }) => void
  let listeners: Listener[]
  beforeEach(() => {
    listeners = []
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: (_: string, l: Listener) => listeners.push(l),
        removeEventListener: (_: string, l: Listener) => {
          listeners = listeners.filter((x) => x !== l)
        },
      })),
    )
  })
  afterEach(() => vi.unstubAllGlobals())
  const cross = (matches: boolean) =>
    act(() => {
      for (const l of listeners) l({ matches })
    })

  it("reaching 768 px closes an open menu, and it stays closed when going back", () => {
    mount()
    click(hamburger())
    expect(hamburger().getAttribute("aria-expanded")).toBe("true")
    cross(true)
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    cross(false)
    expect(hamburger().getAttribute("aria-expanded")).toBe("false")
    expect(panel().hasAttribute("inert")).toBe(true)
  })

  it("watches the md query and removes its listener on unmount", () => {
    mount()
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)")
    expect(listeners).toHaveLength(1)
    act(() => root.unmount())
    expect(listeners).toHaveLength(0)
    root = createRoot(container)
  })
})
