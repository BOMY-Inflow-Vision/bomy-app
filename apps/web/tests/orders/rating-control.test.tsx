// @vitest-environment jsdom
// Star control on the order page: states (open / changeable / locked / removed / hidden), the
// accessible radio group, and how it reacts to each rateProduct result.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { rateProduct, toastError, toastInfo } = vi.hoisted(() => ({
  rateProduct: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}))
vi.mock("@/app/account/orders/[orderId]/rating-actions", () => ({ rateProduct }))
vi.mock("@/components/toaster", () => ({
  useToast: () => ({ error: toastError, info: toastInfo, success: vi.fn() }),
}))

import { RatingControl } from "@/app/account/orders/[orderId]/_rating-control"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

type Props = React.ComponentProps<typeof RatingControl>
const BASE: Props = {
  orderItemId: "item-1",
  productName: "Tea",
  stars: null,
  hoursLeft: 0,
  removed: false,
  canRate: true,
  windowHours: 24,
}

let container: HTMLDivElement
let root: Root
let mounts = 0 // fresh key per mount: state is seeded from props
beforeEach(() => {
  rateProduct.mockReset()
  toastError.mockReset()
  toastInfo.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = (p: Partial<Props> = {}) =>
  act(() => {
    root.render(<RatingControl key={++mounts} {...BASE} {...p} />)
  })
const radios = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
const text = () => container.textContent ?? ""
async function pick(n: number) {
  await act(async () => {
    radios()[n - 1]!.click()
    await Promise.resolve()
  })
}

describe("RatingControl", () => {
  it("renders nothing when the item cannot be rated", () => {
    mount({ canRate: false, stars: 4, hoursLeft: 5 })
    expect(container.innerHTML).toBe("")
  })

  it("is a labelled radio group with five named radios, current value checked", () => {
    mount({ stars: 3, hoursLeft: 10 })
    const group = container.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute("aria-label")).toBe("Rate Tea")
    expect(radios().map((r) => r.getAttribute("aria-label"))).toEqual([
      "1 star",
      "2 stars",
      "3 stars",
      "4 stars",
      "5 stars",
    ])
    expect(radios().map((r) => r.checked)).toEqual([false, false, true, false, false])
    // one name so the arrow keys move between stars natively
    expect(new Set(radios().map((r) => r.name)).size).toBe(1)
    expect(radios()[0]!.name).not.toBe("")
  })

  it("shows the change note with hours (plural and singular)", () => {
    mount({ stars: 4, hoursLeft: 22 })
    expect(text()).toContain("You can change this for 22 more hours")
    mount({ stars: 4, hoursLeft: 1 })
    expect(text()).toContain("You can change this for 1 more hour")
    expect(text()).not.toContain("1 more hours")
  })

  it("window closed: read-only display with 'Rating locked' and the stars shown", () => {
    mount({ stars: 4, hoursLeft: 0 })
    expect(radios()).toHaveLength(0)
    expect(text()).toContain("Rating locked")
    expect(container.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(
      "Your rating: 4 out of 5",
    )
  })

  it("removed: read-only message and nothing to pick", () => {
    mount({ stars: 4, hoursLeft: 10, removed: true })
    expect(radios()).toHaveLength(0)
    expect(text()).toContain("Your rating was removed")
    expect(text()).not.toContain("Rating locked")
  })

  it("selecting a star calls rateProduct(orderItemId, n) and keeps the new value", async () => {
    rateProduct.mockResolvedValue({ ok: true, avg: "5.00", count: 1 })
    mount({ stars: null, windowHours: 6 })
    await pick(5)
    expect(rateProduct).toHaveBeenCalledWith("item-1", 5)
    expect(radios()[4]!.checked).toBe(true)
    expect(text()).toContain("You can change this for 6 more hours")
    expect(text()).not.toContain("24")
  })

  it("a change keeps the remaining hours", async () => {
    rateProduct.mockResolvedValue({ ok: true, avg: "2.00", count: 1 })
    mount({ stars: 4, hoursLeft: 7 })
    await pick(2)
    expect(radios()[1]!.checked).toBe(true)
    expect(text()).toContain("You can change this for 7 more hours")
  })

  it("WINDOW_CLOSED flips to locked and shows a toast", async () => {
    rateProduct.mockResolvedValue({ ok: false, error: "WINDOW_CLOSED" })
    mount({ stars: 4, hoursLeft: 1 })
    await pick(2)
    expect(radios()).toHaveLength(0)
    expect(text()).toContain("Rating locked")
    expect(container.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(
      "Your rating: 4 out of 5",
    )
    expect(toastInfo).toHaveBeenCalledTimes(1)
  })

  it("RATING_REMOVED flips to the removed state", async () => {
    rateProduct.mockResolvedValue({ ok: false, error: "RATING_REMOVED" })
    mount({ stars: 4, hoursLeft: 3 })
    await pick(1)
    expect(radios()).toHaveLength(0)
    expect(text()).toContain("Your rating was removed")
  })

  it("other errors keep the previous value and show a short message", async () => {
    rateProduct.mockResolvedValue({ ok: false, error: "NOT_ELIGIBLE" })
    mount({ stars: 4, hoursLeft: 3 })
    await pick(1)
    expect(radios()[3]!.checked).toBe(true)
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it("never throws to the user when the action rejects", async () => {
    rateProduct.mockRejectedValue(new Error("network"))
    mount({ stars: null })
    await pick(3)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(radios()[2]!.checked).toBe(false)
  })

  it("ignores a second selection while a request is pending, and keeps radios enabled", async () => {
    let resolve!: (v: { ok: true; avg: string; count: number }) => void
    rateProduct.mockReturnValue(new Promise((r) => (resolve = r)))
    mount({ stars: 4, hoursLeft: 5 })
    const second = radios()[1]!
    act(() => second.focus())
    await pick(2)
    expect(rateProduct).toHaveBeenCalledTimes(1)
    expect(radios().every((r) => !r.disabled)).toBe(true)
    expect(document.activeElement).toBe(second)
    expect(container.querySelector('[role="radiogroup"]')!.getAttribute("aria-busy")).toBe("true")
    await pick(3)
    expect(rateProduct).toHaveBeenCalledTimes(1)
    expect(radios()[3]!.checked).toBe(true)
    await act(async () => {
      resolve({ ok: true, avg: "2.00", count: 1 })
      await Promise.resolve()
    })
    expect(radios()[1]!.checked).toBe(true)
  })
})
