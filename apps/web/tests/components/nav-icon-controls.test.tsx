// @vitest-environment jsdom
//
// Nav icon controls (PR 5d-6): account/sign-in link, cart link, cart count pill and the theme
// toggle. Written first against the hand-made markup (baseline). After the Button/Badge swap only
// the TOKENS expectations below change; names, destinations, tab order and the pill rules must not.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  session: null as unknown,
  cart: { itemCount: 0, hydrated: true },
}))

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: state.session }) }))
vi.mock("@/lib/cart", () => ({ useCart: () => state.cart }))
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { NavBar } from "@/components/nav-bar"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Class tokens the controls carry (Button/Badge after the 5d-6 swap).
const BUTTON = [
  "h-9",
  "w-9",
  "rounded-full",
  "text-muted-foreground",
  "hover:bg-muted",
  "focus-visible:ring-1",
  "focus-visible:ring-ring",
]
const TOKENS = {
  accountLink: BUTTON,
  // D5(a): the cart is the filled primary round button; its hover pair is named so the base muted
  // hover classes are replaced, not left in force.
  cartLink: [
    "h-12",
    "w-auto",
    "gap-2",
    "rounded-full",
    "px-4",
    "relative",
    "bg-primary",
    "text-primary-foreground",
    "hover:bg-primary",
    "hover:text-primary-foreground",
    "hover:brightness-90",
    "focus-visible:ring-1",
    "focus-visible:ring-ring",
  ],
  // The count badge has its own surface so it stays visible on the filled button.
  // The counter sits inside the pill, beside the label: a round inline chip, never overlapping.
  pill: [
    "grid",
    "size-6",
    "place-items-center",
    "rounded-full",
    "animate-badge-pop",
    "bg-card",
    "text-foreground",
    "tabular-nums",
  ],
  toggle: BUTTON,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // jsdom has no matchMedia; the NavBar watches the lg breakpoint (PR 5d-7).
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  state.session = null
  state.cart = { itemCount: 0, hydrated: true }
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function mount() {
  act(() => {
    root.render(<NavBar />)
  })
}

function desktopRow() {
  return container.querySelector<HTMLElement>("div.hidden.lg\\:flex")!
}
function mobileCluster() {
  return container.querySelector<HTMLElement>("div.flex.items-center.gap-1.lg\\:hidden")!
}
function panel() {
  return container.querySelector<HTMLElement>("#mobile-menu")!
}

function label(el: Element): string {
  return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""
}
/** Focusable controls in DOM order as "tag:name". Skips inert subtrees and tabindex=-1. */
function focusables(scope: Element): string[] {
  return Array.from(scope.querySelectorAll("a[href], button"))
    .filter((el) => !el.closest("[inert]") && el.getAttribute("tabindex") !== "-1")
    .map((el) => `${el.tagName.toLowerCase()}:${label(el)}`)
}
function has(el: Element | null, tokens: string[]) {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}
function byLabel(scope: Element, name: string) {
  return scope.querySelector(`[aria-label="${name}"]`)
}

const STATES = {
  "signed out": { session: null, name: "Sign in", href: "/auth/sign-in" },
  buyer: { session: { user: { role: "buyer" } }, name: "Account", href: "/account" },
  seller: { session: { user: { role: "seller_owner" } }, name: "Account", href: "/account" },
} as const

describe("names, tags and destinations", () => {
  it.each(Object.entries(STATES))("%s: desktop cart, account and theme controls", (_n, s) => {
    state.session = s.session
    mount()
    const row = desktopRow()
    const cart = byLabel(row, "Cart")!
    expect(cart.tagName).toBe("A")
    expect(cart.getAttribute("href")).toBe("/cart")
    const account = byLabel(row, s.name)!
    expect(account.tagName).toBe("A")
    expect(account.getAttribute("href")).toBe(s.href)
    const toggle = byLabel(row, "Switch to dark mode")!
    expect(toggle.tagName).toBe("BUTTON")
    expect(toggle.getAttribute("type")).toBe("button")
  })

  it.each(Object.entries(STATES))(
    "%s: mobile cluster holds only theme, cart, hamburger",
    (_n, s) => {
      state.session = s.session
      mount()
      expect(focusables(mobileCluster())).toEqual([
        "button:Switch to dark mode",
        "a:Cart",
        "button:Open menu",
      ])
      expect(byLabel(mobileCluster(), "Cart")!.getAttribute("href")).toBe("/cart")
    },
  )

  it.each(Object.entries(STATES))("%s: the opened mobile panel has the account link", (_n, s) => {
    state.session = s.session
    mount()
    act(() => {
      byLabel(container, "Open menu")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const links = Array.from(panel().querySelectorAll("a"))
    const account = links.find((a) => a.getAttribute("href") === s.href)!
    expect(account.textContent).toBe(s.name)
    expect(panel().hasAttribute("inert")).toBe(false)
  })
})

describe("tab order", () => {
  it("signed out / buyer: links, cart, account, theme toggle", () => {
    state.session = null
    mount()
    expect(focusables(desktopRow())).toEqual([
      "a:Brands",
      "a:Products",
      "a:Membership",
      "a:Sell with us",
      "a:Become a provider",
      "a:Cart",
      "a:Sign in",
      "button:Switch to dark mode",
    ])
  })

  it("seller: account icon, then the Seller menu trigger, then theme toggle", () => {
    state.session = STATES.seller.session
    mount()
    expect(focusables(desktopRow())).toEqual([
      "a:Brands",
      "a:Products",
      "a:Membership",
      "a:Sell with us",
      "a:Become a provider",
      "a:Cart",
      "a:Account",
      "button:Seller menu",
      "button:Switch to dark mode",
    ])
  })

  it("opened mobile panel: its links end with account/sign-in (seller adds Seller first)", () => {
    state.session = STATES.seller.session
    mount()
    act(() => {
      byLabel(container, "Open menu")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(focusables(panel())).toEqual([
      "a:Brands",
      "a:Products",
      "a:Membership",
      "a:Sell with us",
      "a:Become a provider",
      "a:Seller",
      "a:Account",
    ])
  })
})

describe("cart count pill", () => {
  const pill = () => byLabel(desktopRow(), "Cart")!.querySelector<HTMLElement>("[data-cart-count]")

  it("shows 0 for an empty cart (D7), so the pill keeps its width as the count changes", () => {
    mount()
    expect(pill()!.textContent).toBe("0")
    expect(pill()!.classList.contains("opacity-0")).toBe(false)
  })

  it("before hydration it keeps its place but shows no number and is invisible", () => {
    state.cart = { itemCount: 3, hydrated: false }
    mount()
    expect(pill()!.classList.contains("opacity-0")).toBe(true)
    expect(pill()!.textContent).not.toBe("3")
  })

  it("has a visible Cart label (hidden below lg) and no overlap by construction", () => {
    state.cart = { itemCount: 3, hydrated: true }
    mount()
    const cart = byLabel(desktopRow(), "Cart")!
    const label = cart.querySelector<HTMLElement>("[data-cart-label]")!
    expect(label.textContent).toBe("Cart")
    has(label, ["hidden", "lg:inline"])
    expect(cart.getAttribute("aria-label")).toBe("Cart")
    for (const t of ["absolute", "-top-0.5", "-right-0.5", "ring-1"]) {
      expect(pill()!.classList.contains(t), `${t} must not be on the counter`).toBe(false)
    }
  })

  it("shows the count, caps at 99+, and stays unlabeled", () => {
    state.cart = { itemCount: 3, hydrated: true }
    mount()
    expect(pill()!.textContent).toBe("3")
    expect(pill()!.hasAttribute("aria-label")).toBe(false)
    act(() => root.unmount())
    root = createRoot(container)
    state.cart = { itemCount: 100, hydrated: true }
    mount()
    expect(pill()!.textContent).toBe("99+")
    expect(pill()!.textContent).not.toBe("100")
  })

  it("adds no live region to any control", () => {
    state.cart = { itemCount: 3, hydrated: true }
    mount()
    expect(desktopRow().querySelector("[aria-live]")).toBeNull()
    expect(mobileCluster().querySelector("[aria-live]")).toBeNull()
  })
})

describe("hamburger is untouched", () => {
  it("label, expanded and controls follow the open state", () => {
    mount()
    const btn = byLabel(container, "Open menu")!
    expect(btn.getAttribute("aria-expanded")).toBe("false")
    expect(btn.getAttribute("aria-controls")).toBe("mobile-menu")
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const open = byLabel(container, "Close menu")!
    expect(open.getAttribute("aria-expanded")).toBe("true")
  })
})

describe("class tokens (updated by the swap)", () => {
  it("account link, cart link, pill and theme toggle", () => {
    state.cart = { itemCount: 3, hydrated: true }
    mount()
    const row = desktopRow()
    has(byLabel(row, "Sign in"), TOKENS.accountLink)
    has(byLabel(row, "Cart"), TOKENS.cartLink)
    has(byLabel(row, "Cart")!.querySelector("[data-cart-count]"), TOKENS.pill)
    has(byLabel(row, "Switch to dark mode"), TOKENS.toggle)
  })

  it("the filled cart replaces the muted hover classes and the badge is not primary-on-primary", () => {
    state.cart = { itemCount: 3, hydrated: true }
    mount()
    const cart = byLabel(desktopRow(), "Cart")!
    for (const t of ["hover:bg-muted", "hover:text-foreground", "text-muted-foreground"]) {
      expect(cart.classList.contains(t), `${t} must be gone`).toBe(false)
    }
    expect(cart.querySelector("[data-cart-count]")!.classList.contains("bg-primary")).toBe(false)
  })
})
