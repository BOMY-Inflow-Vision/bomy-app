// @vitest-environment jsdom
// R5c-1: what the checkout result pages render in each state, pinned on the old markup first
// (heading, text, buttons and hrefs, toasts, cart clearing). The poll and cancel logic is not touched.
// Looks are asserted in the "R5c look" block added with the restyle.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { router, params, clearCart, toast, getCheckoutSessionStatus, cancelPendingCheckout } =
  vi.hoisted(() => ({
    router: { replace: vi.fn(), refresh: vi.fn() },
    params: { value: "" },
    clearCart: vi.fn(),
    toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    getCheckoutSessionStatus: vi.fn(),
    cancelPendingCheckout: vi.fn(),
  }))
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({ get: (k: string) => (k === "session" ? params.value : null) }),
}))
vi.mock("@/lib/cart", () => ({ useCart: () => ({ clearCart }) }))
vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/app/checkout/actions", () => ({ getCheckoutSessionStatus, cancelPendingCheckout }))

import { CancelHandler } from "@/app/checkout/cancelled/_cancel"
import CancelledPage from "@/app/checkout/cancelled/page"
import { SuccessPoller } from "@/app/checkout/success/_poller"
import SuccessPage from "@/app/checkout/success/page"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const UUID = "11111111-2222-4333-8444-555555555555"

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  params.value = UUID
  router.replace.mockReset()
  clearCart.mockReset()
  Object.values(toast).forEach((f) => f.mockReset())
  getCheckoutSessionStatus.mockReset()
  cancelPendingCheckout.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

async function mount(node: React.ReactElement) {
  await act(async () => {
    root.render(node)
    await Promise.resolve()
  })
}
const h1 = () => container.querySelector("h1")?.textContent
const text = () => container.textContent ?? ""
const link = (label: string) =>
  Array.from(container.querySelectorAll("a")).find((a) => a.textContent === label)

describe("SuccessPoller states", () => {
  it("polling: heading, text, spinner and the stepper at step 2", async () => {
    getCheckoutSessionStatus.mockResolvedValue({ ok: true, status: "pending_payment" })
    await mount(<SuccessPoller />)
    expect(h1()).toBe("Waiting for payment…")
    expect(text()).toContain("Please wait while we confirm your payment.")
    expect(container.querySelector(".animate-spin")).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Checkout progress"] [aria-current="step"]')!
        .textContent,
    ).toContain("3")
  })

  it("no or bad session id is 'Session not found' with a Back to cart link", async () => {
    params.value = "not-a-uuid"
    await mount(<SuccessPoller />)
    expect(h1()).toBe("Session not found")
    expect(text()).toContain("This checkout session doesn't exist or has already been processed.")
    expect(link("Back to cart")!.getAttribute("href")).toBe("/cart")
    expect(getCheckoutSessionStatus).not.toHaveBeenCalled()
  })

  it("NOT_FOUND from the status read is 'Session not found'", async () => {
    getCheckoutSessionStatus.mockResolvedValue({ ok: false, error: "NOT_FOUND" })
    await mount(<SuccessPoller />)
    expect(h1()).toBe("Session not found")
  })

  it("UNAUTHENTICATED replaces to sign-in with the success callback", async () => {
    getCheckoutSessionStatus.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" })
    await mount(<SuccessPoller />)
    expect(router.replace).toHaveBeenCalledWith(
      `/auth/sign-in?callbackUrl=${encodeURIComponent(`/checkout/success?session=${UUID}`)}`,
    )
  })

  it("30 pending polls end as 'Still processing'", async () => {
    getCheckoutSessionStatus.mockResolvedValue({ ok: true, status: "pending_payment" })
    await mount(<SuccessPoller />)
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
    }
    expect(getCheckoutSessionStatus).toHaveBeenCalledTimes(30)
    expect(h1()).toBe("Still processing")
    expect(text()).toContain("Your payment is still being processed.")
  })

  const done: [string, string, string, string | null, string | null, string][] = [
    // status, heading, text, button label, href, toast method
    [
      "paid",
      "Payment confirmed",
      "Your order has been placed.",
      "View my orders",
      "/account/orders",
      "success",
    ],
    [
      "failed",
      "Payment failed",
      "Your payment was not successful. Please try again.",
      "Try again",
      "/checkout",
      "error",
    ],
    [
      "expired",
      "Session expired",
      "Your checkout session has expired.",
      "Back to cart",
      "/cart",
      "warning",
    ],
    [
      "cancelled",
      "Checkout cancelled",
      "Your checkout was cancelled. Your cart is still saved.",
      "Back to cart",
      "/cart",
      "",
    ],
    [
      "payment_review_required",
      "Payment under review",
      "Your payment is being reviewed.",
      null,
      null,
      "",
    ],
    [
      "payment_review_resolved",
      "Payment under review",
      "Your payment is being reviewed.",
      null,
      null,
      "",
    ],
  ]
  it.each(done)("done %s", async (status, heading, copy, label, href, toastMethod) => {
    getCheckoutSessionStatus.mockResolvedValue({ ok: true, status })
    await mount(<SuccessPoller />)
    expect(h1()).toBe(heading)
    expect(text()).toContain(copy)
    if (label) expect(link(label)!.getAttribute("href")).toBe(href)
    else expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(clearCart).toHaveBeenCalledTimes(status === "paid" ? 1 : 0)
    const fired = Object.entries(toast)
      .filter(([, f]) => f.mock.calls.length > 0)
      .map(([k]) => k)
    expect(fired).toEqual(toastMethod ? [toastMethod] : [])
  })

  it("paid shows every step completed (the stepper is one past the last index)", async () => {
    getCheckoutSessionStatus.mockResolvedValue({ ok: true, status: "paid" })
    await mount(<SuccessPoller />)
    expect(
      container.querySelector('[aria-label="Checkout progress"] [aria-current="step"]'),
    ).toBeNull()
    expect(text()).toContain("✓")
  })
})

describe("CancelHandler states", () => {
  it("cancelling: spinner and text while the action runs", async () => {
    cancelPendingCheckout.mockReturnValue(new Promise(() => undefined))
    await mount(<CancelHandler />)
    expect(text()).toContain("Cancelling your checkout…")
    expect(container.querySelector(".animate-spin")).not.toBeNull()
    expect(container.querySelector("h1")).toBeNull()
  })

  it("cancelled: heading, text, Back to cart and the toast", async () => {
    cancelPendingCheckout.mockResolvedValue({ ok: true })
    await mount(<CancelHandler />)
    expect(h1()).toBe("Checkout cancelled")
    expect(text()).toContain("Your checkout has been cancelled. Your cart is still saved.")
    expect(link("Back to cart")!.getAttribute("href")).toBe("/cart")
    expect(toast.info).toHaveBeenCalledWith("Checkout cancelled — your cart is still saved")
  })

  it("a not-ok result replaces to sign-in with the cancelled callback and keeps the spinner", async () => {
    cancelPendingCheckout.mockResolvedValue({ ok: false })
    await mount(<CancelHandler />)
    expect(router.replace).toHaveBeenCalledWith(
      `/auth/sign-in?callbackUrl=${encodeURIComponent(`/checkout/cancelled?session=${UUID}`)}`,
    )
    expect(text()).toContain("Cancelling your checkout…")
  })

  it("error: 'Something went wrong', Back to cart and the error toast", async () => {
    cancelPendingCheckout.mockRejectedValue(new Error("boom"))
    await mount(<CancelHandler />)
    expect(h1()).toBe("Something went wrong")
    expect(text()).toContain("We couldn't cancel your checkout.")
    expect(link("Back to cart")!.getAttribute("href")).toBe("/cart")
    expect(toast.error).toHaveBeenCalledWith(
      "We couldn't cancel your checkout. Please try again or contact support.",
    )
  })
})

describe("route pages wrap the handlers in Suspense with a Loading fallback", () => {
  it.each([
    ["success", SuccessPage],
    ["cancelled", CancelledPage],
  ])("%s fallback", (_n, Page) => {
    const el = Page() as React.ReactElement<{ fallback: React.ReactElement }>
    const html = renderToStaticMarkup(el.props.fallback)
    expect(html).toContain("Loading…")
    expect(html).toContain("animate-spin")
  })
})
