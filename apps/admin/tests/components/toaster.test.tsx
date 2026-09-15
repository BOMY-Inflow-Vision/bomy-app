import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  MAX_TOASTS,
  ToastProvider,
  toastReducer,
  useToast,
  type ToastItem,
} from "@/components/toaster"

// Node test env (no jsdom): auto-dismiss timers, hover-pause and animation are covered by live
// browser verification. These pin the stack rules and the always-present live region.
function add(
  state: ToastItem[],
  id: number,
  message = `m${id}`,
  type: ToastItem["type"] = "success",
) {
  return toastReducer(state, { type: "add", toast: { id, type, message } })
}

describe("toastReducer", () => {
  it("appends new toasts in arrival order", () => {
    const state = add(add([], 1), 2)
    expect(state.map((t) => t.id)).toEqual([1, 2])
    expect(state.every((t) => !t.leaving)).toBe(true)
  })

  it("marks a dismissed toast as leaving, then removes it", () => {
    const dismissed = toastReducer(add([], 1), { type: "dismiss", id: 1 })
    expect(dismissed).toHaveLength(1)
    expect(dismissed[0]?.leaving).toBe(true)
    expect(toastReducer(dismissed, { type: "remove", id: 1 })).toEqual([])
  })

  it(`starts dismissing the oldest once more than ${MAX_TOASTS} are active`, () => {
    let state: ToastItem[] = []
    for (let id = 1; id <= MAX_TOASTS + 1; id++) state = add(state, id)
    expect(state.filter((t) => t.leaving).map((t) => t.id)).toEqual([1])
    expect(state.filter((t) => !t.leaving)).toHaveLength(MAX_TOASTS)
  })

  it("refreshes an identical active toast instead of stacking a duplicate", () => {
    const first = add([], 1, "Tote added to cart")
    const again = add(first, 2, "Tote added to cart")
    expect(again).toHaveLength(1)
    expect(again[0]?.id).toBe(1)
    expect(again[0]?.bump).toBe((first[0]?.bump ?? 0) + 1)
  })

  it("stacks the same message when the type differs", () => {
    expect(add(add([], 1, "x", "success"), 2, "x", "info")).toHaveLength(2)
  })

  it("does not refresh a toast that is already leaving", () => {
    const leaving = toastReducer(add([], 1, "x"), { type: "dismiss", id: 1 })
    expect(add(leaving, 2, "x").map((t) => t.id)).toEqual([1, 2])
  })
})

describe("ToastProvider", () => {
  it("renders children plus an always-present polite live region", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <p>page</p>
      </ToastProvider>,
    )
    expect(html).toContain("<p>page</p>")
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Notifications"')
    expect(html).toContain('aria-live="polite"')
  })

  it("useToast throws outside the provider", () => {
    function Orphan() {
      useToast()
      return null
    }
    expect(() => renderToStaticMarkup(<Orphan />)).toThrow(/ToastProvider/)
  })
})
