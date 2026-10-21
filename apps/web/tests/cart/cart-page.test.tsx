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

describe("CartPage thumbnail states (OLD behaviour, replaced by the D4a pins in Task A2)", () => {
  it("no image renders no img and shows the emoji in a muted tile", () => {
    mount([item({ coverImageUrl: null })])
    const li = container.querySelector("li")!
    expect(li.querySelector("img")).toBeNull()
    expect(li.textContent).toContain("📦")
    expect(li.querySelector("div.bg-muted")).not.toBeNull()
  })

  it("an image URL renders an img with the product name as alt and 64x64", () => {
    mount([item({ coverImageUrl: "https://img/x.jpg" })])
    const img = container.querySelector("li img")!
    expect(img.getAttribute("src")).toBe("https://img/x.jpg")
    expect(img.getAttribute("alt")).toBe("Tea")
    expect(img.getAttribute("width")).toBe("64")
    expect(img.getAttribute("height")).toBe("64")
  })

  it("after an image error the img stays and no fallback appears (the browser shows its broken-image box)", () => {
    mount([item({ coverImageUrl: "https://img/broken.jpg" })])
    const img = container.querySelector("li img")!
    act(() => {
      img.dispatchEvent(new Event("error"))
    })
    expect(container.querySelector("li img")).not.toBeNull()
    expect(container.querySelector("li")!.textContent).not.toContain("📦")
    expect(container.querySelector("li svg.lucide-package")).toBeNull()
  })
})
