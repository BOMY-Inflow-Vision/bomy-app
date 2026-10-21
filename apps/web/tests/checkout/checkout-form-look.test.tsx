// @vitest-environment jsdom
// R5c-1: the cards of the checkout form carry the new look. Only class strings may change; the
// form's behaviour and callouts are pinned by callouts.test.tsx, which stays untouched.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const actions = vi.hoisted(() => ({ priceCheckoutPreview: vi.fn(), initiateCheckout: vi.fn() }))
const cart = vi.hoisted(() => ({
  items: [{ variantId: "aaaaaaaa-0000-0000-0000-000000000001", quantity: 1 }] as unknown[],
  clearCart: () => undefined,
  hydrated: true,
}))
vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/lib/cart", () => ({ useCart: () => cart }))
vi.mock("@/app/checkout/actions", () => actions)
vi.mock("@/app/account/addresses/actions", () => ({ addAddress: vi.fn() }))

import { CheckoutForm } from "@/app/checkout/_form"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const LONG_LINE = "LONGADDRESSLINE".repeat(13) + "XXXXX"
const SAVED = [
  {
    id: "addr-1",
    label: null,
    recipientName: "Ada Lim",
    phone: "+60123456789",
    line1: LONG_LINE,
    line2: null,
    city: "George Town",
    postcode: "10200",
    state: "Pulau Pinang",
    isDefault: true,
  },
]

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  cart.items = [{ variantId: "aaaaaaaa-0000-0000-0000-000000000001", quantity: 1 }]
  actions.priceCheckoutPreview.mockResolvedValue({
    ok: true,
    storeRows: [
      {
        storeId: "s1",
        retailSubtotalSen: "5000",
        brandDiscountSen: "0",
        voucherContributionSen: "0",
        shippingFeeSen: "800",
      },
    ],
    totalBuyerPaysSen: "5800",
    availableVouchers: [],
    invalidLines: [],
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderForm() {
  await act(async () => {
    root.render(<CheckoutForm savedAddresses={SAVED} />)
    await Promise.resolve()
  })
}
const has = (el: Element | null, tokens: string[]) => {
  expect(el, tokens.join(" ")).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("CheckoutForm R5c look", () => {
  it("the empty-cart card is a bento card on the white card colour", async () => {
    cart.items = []
    await renderForm()
    const card = Array.from(container.querySelectorAll("div")).find((d) =>
      d.textContent.startsWith("Your cart is empty."),
    )!
    has(card, [
      "rounded-bento",
      "border",
      "border-dashed",
      "border-input",
      "bg-card",
      "p-6",
      "text-center",
    ])
    expect(card.classList.contains("bg-muted")).toBe(false)
  })

  it("the order summary list is a rounded-2xl white card; its numbers and headings are unchanged", async () => {
    await renderForm()
    const list = container.querySelector("section div.divide-y")!
    has(list, ["divide-border", "rounded-2xl", "border", "border-border", "bg-card"])
    expect(list.textContent).toContain("RM50.00")
    expect(list.textContent).toContain("RM58.00")
    expect(Array.from(container.querySelectorAll("h2")).map((h) => h.textContent)).toEqual([
      "Order summary",
      "Shipping address",
    ])
  })

  it("a long saved address wraps inside its details card (found in the R5c baseline: it widened the page)", async () => {
    await renderForm()
    const card = Array.from(container.querySelectorAll("div")).find((d) =>
      d.textContent.startsWith("Ada Lim"),
    )!
    expect(card.textContent).toContain(LONG_LINE)
    has(card, [
      "min-w-0",
      "[overflow-wrap:anywhere]",
      "rounded-lg",
      "border",
      "bg-muted",
      "p-4",
      "text-sm",
    ])
  })
})
