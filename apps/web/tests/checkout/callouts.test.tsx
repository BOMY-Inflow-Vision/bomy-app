// @vitest-environment jsdom
//
// Baseline of the two callout boxes in the checkout form (PR 5d-3, Task 1): the invalid-lines
// warning and the top error. Written first against the hand-built divs; after the Alert swap only
// the expected class tokens change, never the announcement state (no role, no aria-live).
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const actions = vi.hoisted(() => ({ priceCheckoutPreview: vi.fn(), initiateCheckout: vi.fn() }))

vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
// One stable object: a fresh `items` array on every render would re-run the preview effect forever.
const cart = vi.hoisted(() => ({
  items: [{ variantId: "aaaaaaaa-0000-0000-0000-000000000001", quantity: 1 }],
  clearCart: () => undefined,
  hydrated: true,
}))
vi.mock("@/lib/cart", () => ({ useCart: () => cart }))
vi.mock("@/app/checkout/actions", () => actions)
vi.mock("@/app/account/addresses/actions", () => ({ addAddress: vi.fn() }))

import { CheckoutForm } from "@/app/checkout/_form"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const SAVED = [
  {
    id: "addr-1",
    label: null,
    recipientName: "Ada Lim",
    phone: "+60123456789",
    line1: "1 Jalan Satu",
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
  actions.priceCheckoutPreview.mockResolvedValue({
    ok: false,
    error: "INVALID_CART",
    invalidLines: [{ variantId: "bbbbbbbb-0000-0000-0000-000000000002", reason: "missing" }],
    availableVouchers: [],
  })
  actions.initiateCheckout.mockResolvedValue({ ok: false, error: "CHECKOUT_DISABLED" })
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

// The box is the nearest <div> around the paragraph that holds `text`.
function box(text: string): HTMLElement {
  const p = [...container.querySelectorAll("p")].find((x) => x.textContent?.includes(text))
  const el = p?.closest("div")
  if (!el) throw new Error(`no callout box with text "${text}"`)
  return el
}

// True if the box or any ancestor up to the form carries a role or an aria-live attribute.
function announced(el: HTMLElement): boolean {
  for (let e: HTMLElement | null = el; e && e.tagName !== "FORM"; e = e.parentElement) {
    if (e.hasAttribute("role") || e.hasAttribute("aria-live")) return true
  }
  return false
}

describe("checkout callouts: invalid lines warning", () => {
  it("is a hand-built warning box with no announcement attributes (baseline)", async () => {
    await renderForm()
    const el = box("Some items in your cart")
    expect([...el.classList]).toEqual(
      expect.arrayContaining([
        "rounded-lg",
        "border",
        "border-warning/30",
        "bg-warning-subtle",
        "p-4",
      ]),
    )
    expect(announced(el)).toBe(false)
    expect(el.textContent).toContain("No longer available (ID: bbbbbbbb…)")
  })
})

describe("checkout callouts: top error", () => {
  it("is a hand-built destructive box with p-3 and no announcement attributes (baseline)", async () => {
    await renderForm()
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    const el = box("Checkout is temporarily unavailable.")
    expect([...el.classList]).toEqual(
      expect.arrayContaining([
        "rounded-lg",
        "border",
        "border-destructive/30",
        "bg-destructive/10",
        "p-3",
      ]),
    )
    expect(el.classList.contains("p-4")).toBe(false)
    expect(announced(el)).toBe(false)
    expect(toast.error).toHaveBeenCalledWith("Checkout is temporarily unavailable.")
  })
})
