// @vitest-environment jsdom
// R5c-1: behaviour of the cart page, pinned on the old markup first. Looks are asserted in the
// "R5c look" block added with the restyle. Quantity, remove, toasts, links and the subtotal must not change.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { cart, toast } = vi.hoisted(() => ({
  cart: {
    items: [] as unknown[],
    itemCount: 0,
    hydrated: true,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
  },
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/lib/cart", () => ({ useCart: () => cart }))
vi.mock("@/components/toaster", () => ({ useToast: () => toast }))

import CartPage from "@/app/cart/page"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

type Item = {
  variantId: string
  productId: string
  storeId: string
  storeName: string
  storeSlug: string
  productName: string
  productSlug: string
  variantName: string
  priceSen: number
  quantity: number
  coverImageUrl: string | null
}
const item = (o: Partial<Item> = {}): Item => ({
  variantId: "v1",
  productId: "p1",
  storeId: "s1",
  storeName: "Acme",
  storeSlug: "acme",
  productName: "Tea",
  productSlug: "tea",
  variantName: "Small",
  priceSen: 1250,
  quantity: 2,
  coverImageUrl: null,
  ...o,
})

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  cart.items = []
  cart.itemCount = 0
  cart.hydrated = true
  cart.removeItem.mockReset()
  cart.updateQuantity.mockReset()
  toast.info.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(items: Item[], hydrated = true) {
  cart.items = items
  cart.itemCount = items.reduce((n, i) => n + i.quantity, 0)
  cart.hydrated = hydrated
  act(() => {
    root.render(<CartPage />)
  })
}
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}
const byLabel = (l: string) => container.querySelector(`button[aria-label="${l}"]`)!
const removeButton = () =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Remove")!

describe("CartPage behaviour", () => {
  it("not hydrated shows only the heading", () => {
    mount([item()], false)
    expect(container.querySelector("h1")!.textContent).toBe("Your Cart")
    expect(container.querySelectorAll("li")).toHaveLength(0)
    expect(container.textContent).not.toContain("Subtotal")
  })

  it("empty shows the empty text and a Browse products link to /products", () => {
    mount([])
    expect(container.textContent).toContain("Your cart is empty.")
    const link = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "Browse products",
    )!
    expect(link.getAttribute("href")).toBe("/products")
    expect(container.textContent).not.toContain("Subtotal")
  })

  it("a row links to the product, shows store and variant, price, and the heading shows the count", () => {
    mount([item()])
    expect(container.querySelector("h1")!.textContent).toContain("Your Cart")
    expect(container.querySelector("h1")!.textContent).toContain("(2)")
    const link = container.querySelector('li a[href="/products/acme/tea"]')!
    expect(link.textContent).toBe("Tea")
    expect(container.textContent).toContain("Acme · Small")
    expect(container.textContent).toContain("RM12.50")
  })

  it("the subtotal is the sum of price times quantity and Continue to checkout goes to /checkout", () => {
    mount([
      item(),
      item({
        variantId: "v2",
        productSlug: "mug",
        productName: "Mug",
        priceSen: 3000,
        quantity: 1,
      }),
    ])
    expect(container.textContent).toContain("Subtotal")
    expect(container.textContent).toContain("RM55.00")
    const cta = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "Continue to checkout",
    )!
    expect(cta.getAttribute("href")).toBe("/checkout")
  })

  it("increase and decrease call updateQuantity with qty plus or minus one", () => {
    mount([item({ quantity: 3 })])
    click(byLabel("Increase quantity"))
    expect(cart.updateQuantity).toHaveBeenLastCalledWith("v1", 4)
    click(byLabel("Decrease quantity"))
    expect(cart.updateQuantity).toHaveBeenLastCalledWith("v1", 2)
    expect(cart.removeItem).not.toHaveBeenCalled()
  })

  it("decrease at quantity 1 removes the item and toasts the removal", () => {
    mount([item({ quantity: 1 })])
    click(byLabel("Decrease quantity"))
    expect(cart.removeItem).toHaveBeenCalledWith("v1")
    expect(toast.info).toHaveBeenCalledWith("Tea removed from cart")
    expect(cart.updateQuantity).not.toHaveBeenCalled()
  })

  it("Remove removes the item and toasts the removal", () => {
    mount([item()])
    click(removeButton())
    expect(cart.removeItem).toHaveBeenCalledWith("v1")
    expect(toast.info).toHaveBeenCalledWith("Tea removed from cart")
  })
})

const has = (el: Element | null, tokens: string[]) => {
  expect(el, tokens.join(" ")).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}
const LONG = "R5CLONGPRODUCT" + "X".repeat(66)

describe("CartPage thumbnail states (D4a, replaces the old emoji and broken-image pins)", () => {
  const tile = () => container.querySelector("li")!.firstElementChild!

  it("no image: a Package icon on a blush tile, no img, no emoji", () => {
    mount([item({ coverImageUrl: null })])
    expect(container.querySelector("li img")).toBeNull()
    expect(container.querySelector("li")!.textContent).not.toContain("📦")
    const icon = tile().querySelector("svg")!
    expect(icon.getAttribute("aria-hidden")).toBe("true")
    has(tile(), ["relative", "size-16", "shrink-0", "overflow-hidden", "rounded-lg", "bg-tint"])
  })

  it("an image URL renders the img with the product name as alt", () => {
    mount([item({ coverImageUrl: "https://img/x.jpg" })])
    const img = tile().querySelector("img")!
    expect(img.getAttribute("src")).toBe("https://img/x.jpg")
    expect(img.getAttribute("alt")).toBe("Tea")
    expect(tile().querySelector("svg")).toBeNull()
    has(tile(), ["size-16", "bg-tint"])
  })

  it("after an image error the img is replaced by the Package icon (the one declared behaviour change)", () => {
    mount([item({ coverImageUrl: "https://img/broken.jpg" })])
    act(() => {
      tile().querySelector("img")!.dispatchEvent(new Event("error"))
    })
    expect(container.querySelector("li img")).toBeNull()
    expect(tile().querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
    has(tile(), ["size-16", "bg-tint"])
  })
})

describe("CartPage R5c look", () => {
  it("the title comes from PageHeading; the count is part of the title text", () => {
    mount([item()])
    const h1 = container.querySelector("h1")!
    has(h1, ["sm:text-4xl", "[overflow-wrap:anywhere]"])
    expect(h1.textContent).toBe("Your Cart (2)")
    has(h1.parentElement, ["mb-6"])
  })

  it("the not-hydrated and empty titles are plain 'Your Cart' PageHeadings", () => {
    mount([], false)
    expect(container.querySelector("h1")!.textContent).toBe("Your Cart")
    has(container.querySelector("h1"), ["sm:text-4xl"])
    mount([])
    expect(container.querySelector("h1")!.textContent).toBe("Your Cart")
  })

  it("rows are rounded-2xl white cards that may shrink", () => {
    mount([item()])
    const li = container.querySelector("li")!
    has(li, ["min-w-0", "rounded-2xl", "border", "border-border", "bg-card"])
    expect(li.classList.contains("rounded-xl")).toBe(false)
    expect(li.classList.contains("bg-background")).toBe(false)
  })

  it("long product, store and variant names and prices break inside the row", () => {
    mount([item({ productName: LONG, storeName: LONG, variantName: LONG })])
    const li = container.querySelector("li")!
    const link = li.querySelector("a")!
    has(link, ["[overflow-wrap:anywhere]"])
    const meta = Array.from(li.querySelectorAll("p")).find((p) => p.textContent.includes("·"))!
    has(meta, ["[overflow-wrap:anywhere]"])
    const price = Array.from(li.querySelectorAll("p")).find((p) => p.textContent.startsWith("RM"))!
    has(price, ["[overflow-wrap:anywhere]"])
    has(link.parentElement, ["min-w-0"])
  })

  it("the empty state and the subtotal card are bento cards on the white card colour", () => {
    mount([])
    const empty = Array.from(container.querySelectorAll("div")).find((d) =>
      d.textContent.startsWith("Your cart is empty."),
    )!
    has(empty, ["rounded-bento", "border", "border-dashed", "bg-card", "text-center"])
    mount([item()])
    const summary = Array.from(container.querySelectorAll("div")).find(
      (d) =>
        d.firstElementChild?.textContent?.startsWith("Subtotal") && d.className.includes("rounded"),
    )!
    has(summary, ["rounded-bento", "border", "border-border", "bg-card", "p-6", "shadow-sm"])
    has(summary.firstElementChild, ["gap-2"])
    has(summary.querySelector(".font-bold"), ["[overflow-wrap:anywhere]"])
  })

  it("the quantity stepper keeps its labels and uses theme tokens only", () => {
    mount([item()])
    const stepper = byLabel("Increase quantity").closest("div.rounded-xl")!
    has(stepper, ["border-input"])
    for (const l of ["Increase quantity", "Decrease quantity"]) {
      expect(byLabel(l).className).not.toMatch(/\b(?:gray|slate|zinc|neutral|red|blue)-\d/)
    }
  })
})
