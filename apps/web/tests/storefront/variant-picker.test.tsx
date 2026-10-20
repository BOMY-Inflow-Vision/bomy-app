// @vitest-environment jsdom
// R5b: behaviour of the variant picker, pinned on the old markup first. Looks are asserted in the
// "R5b look" block (added with the restyle). Logic, texts, the toast and the cart item must not change.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { addItem, success } = vi.hoisted(() => ({ addItem: vi.fn(), success: vi.fn() }))
vi.mock("@/lib/cart", () => ({ useCart: () => ({ addItem }) }))
vi.mock("@/components/toaster", () => ({ useToast: () => ({ success }) }))

import { VariantPicker } from "@/app/products/[storeSlug]/[productSlug]/variant-picker"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const PRODUCT = {
  id: "p1",
  name: "Tea",
  slug: "tea",
  storeId: "s1",
  storeName: "Acme",
  storeSlug: "acme",
  coverImageUrl: "https://img/x.jpg",
}
type V = Parameters<typeof VariantPicker>[0]["variants"][number]
const v = (o: Partial<V> & { id: string; name: string }): V => ({
  priceSen: 1000,
  stockCount: 5,
  attributes: {},
  sortOrder: 0,
  fulfillmentMode: "normal",
  preorderLeadDays: null,
  ...o,
})

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  addItem.mockReset()
  success.mockReset()
  vi.useFakeTimers()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const mount = (variants: V[]) => {
  act(() => {
    root.render(<VariantPicker product={PRODUCT} variants={variants} />)
  })
}
const chip = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent === name)!
const addButton = () =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    /add(ed)? to cart/i.test(b.textContent ?? ""),
  )!
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("VariantPicker behaviour", () => {
  const two = [
    v({ id: "a", name: "Small", priceSen: 1000, stockCount: 5 }),
    v({ id: "b", name: "Large", priceSen: 2500, stockCount: 1 }),
  ]

  it("selects the first variant by default and shows its price and stock", () => {
    mount(two)
    expect(container.textContent).toContain("RM")
    expect(container.textContent).toContain("5 in stock")
  })

  it("clicking a chip changes the price and the status", () => {
    mount(two)
    click(chip("Large"))
    expect(container.textContent).toContain("1 in stock")
    expect(container.textContent).not.toContain("5 in stock")
  })

  it("a normal out-of-stock variant is disabled; back-order and pre-order stay selectable with a label", () => {
    mount([
      v({ id: "a", name: "Small" }),
      v({ id: "b", name: "Gone", stockCount: 0 }),
      v({ id: "c", name: "Later", stockCount: 0, fulfillmentMode: "backorder" }),
      v({
        id: "d",
        name: "Soon",
        stockCount: 0,
        fulfillmentMode: "preorder",
        preorderLeadDays: 14,
      }),
    ])
    expect(chip("Gone").disabled).toBe(true)
    expect(chip("Later").disabled).toBe(false)
    expect(chip("Soon").disabled).toBe(false)
    click(chip("Later"))
    expect(container.textContent).toContain("Back-order — ships when available")
    click(chip("Soon"))
    expect(container.textContent).toContain("Pre-order — ships in 14 days")
  })

  it("keeps today's pre-order wording: 1 day reads '1 days'; no lead days shows no days", () => {
    mount([
      v({ id: "a", name: "One", stockCount: 0, fulfillmentMode: "preorder", preorderLeadDays: 1 }),
      v({
        id: "b",
        name: "None",
        stockCount: 0,
        fulfillmentMode: "preorder",
        preorderLeadDays: null,
      }),
    ])
    expect(container.textContent).toContain("Pre-order — ships in 1 days")
    click(chip("None"))
    expect(container.textContent).toContain("Pre-order")
    expect(container.textContent).not.toContain("ships in")
  })

  it("Add to cart is disabled at stock 0 and enabled above 0", () => {
    mount([
      v({ id: "a", name: "Gone", stockCount: 0, fulfillmentMode: "backorder" }),
      v({ id: "b", name: "Here" }),
    ])
    expect(addButton().disabled).toBe(true)
    click(chip("Here"))
    expect(addButton().disabled).toBe(false)
  })

  it("Add to cart sends the exact cart item, toasts, shows 'Added to cart' for 2 s", () => {
    mount(two)
    click(chip("Large"))
    click(addButton())
    expect(addItem).toHaveBeenCalledWith({
      variantId: "b",
      productId: "p1",
      storeId: "s1",
      storeName: "Acme",
      storeSlug: "acme",
      productName: "Tea",
      productSlug: "tea",
      variantName: "Large",
      priceSen: 2500,
      coverImageUrl: "https://img/x.jpg",
    })
    expect(success).toHaveBeenCalledWith("Tea added to cart")
    expect(addButton().textContent).toContain("Added to cart")
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(addButton().textContent).toContain("Add to cart")
  })

  it("one variant shows no chooser; zero variants shows the empty text", () => {
    mount([v({ id: "a", name: "Only" })])
    expect(container.textContent).not.toContain("Choose variant")
    mount([])
    expect(container.textContent).toContain("No variants available.")
  })
})
