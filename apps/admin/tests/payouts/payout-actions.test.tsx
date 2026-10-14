// @vitest-environment jsdom
//
// Payout row actions (PR 5d-9, man-t31; money path). Written first against the current buttons
// (baseline); after the swap only the first Fail button's TOKENS change. The action calls and their
// arguments, the disabled rules and which buttons hide must not.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  markPayoutProcessing: vi.fn(),
  markPayoutCompleted: vi.fn(),
  markPayoutFailed: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/app/payouts/actions", () => ({
  markPayoutProcessing: m.markPayoutProcessing,
  markPayoutCompleted: m.markPayoutCompleted,
  markPayoutFailed: m.markPayoutFailed,
}))
vi.mock("@/components/toaster", () => ({ useToast: () => m.toast }))

import { PayoutActions } from "@/app/payouts/_payout-actions"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Class tokens. After the swap fail is the destructive variant; complete and processing keep their
// intentional status tints (D17).
const TOKENS = {
  fail: ["bg-destructive", "text-destructive-foreground", "hover:brightness-90"],
  complete: ["border-success/40", "text-success", "hover:bg-success-subtle", "hover:text-success"],
  processing: ["bg-info-subtle", "text-info", "hover:bg-info-subtle", "hover:brightness-95"],
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = (status: "pending" | "processing" | "completed" | "failed") =>
  act(() => {
    root.render(<PayoutActions payoutId="po-1" status={status} />)
  })
const buttons = () => Array.from(container.querySelectorAll("button"))
const byText = (t: string) => buttons().find((b) => b.textContent.trim() === t)
const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
  })
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto.prototype, "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}
function has(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
}

describe("PayoutActions", () => {
  it("pending: Processing calls markPayoutProcessing(id) and then goes away", async () => {
    m.markPayoutProcessing.mockResolvedValue({ ok: true })
    mount("pending")
    await click(byText("Processing")!)
    expect(m.markPayoutProcessing).toHaveBeenCalledWith("po-1")
    expect(m.toast.success).toHaveBeenCalledWith("Payout marked processing.")
    expect(byText("Processing")).toBeUndefined()
  })

  it("Complete form: Confirm needs a reference, then calls markPayoutCompleted(id, ref)", async () => {
    m.markPayoutCompleted.mockResolvedValue({ ok: true })
    mount("processing")
    await click(byText("Complete")!)
    expect(byText("Confirm")!.disabled).toBe(true)
    await type(container.querySelector("input")!, "REF-9")
    expect(byText("Confirm")!.disabled).toBe(false)
    await click(byText("Confirm")!)
    expect(m.markPayoutCompleted).toHaveBeenCalledWith("po-1", "REF-9")
    expect(container.textContent).toContain("completed")
  })

  it("Fail form: Confirm needs notes, then calls markPayoutFailed(id, notes)", async () => {
    m.markPayoutFailed.mockResolvedValue({ ok: true })
    mount("processing")
    await click(byText("Fail")!)
    expect(byText("Confirm")!.disabled).toBe(true)
    await type(container.querySelector("textarea")!, "bank rejected")
    expect(byText("Confirm")!.disabled).toBe(false)
    await click(byText("Confirm")!)
    expect(m.markPayoutFailed).toHaveBeenCalledWith("po-1", "bank rejected")
    expect(container.textContent).toContain("failed")
  })

  it("the Complete and Fail openers hide while either form is open; Cancel brings them back", async () => {
    mount("processing")
    expect(byText("Complete")).toBeDefined()
    expect(byText("Fail")).toBeDefined()
    await click(byText("Fail")!)
    expect(byText("Complete")).toBeUndefined()
    expect(byText("Fail")).toBeUndefined()
    await click(byText("Cancel")!)
    expect(byText("Complete")).toBeDefined()
    expect(byText("Fail")).toBeDefined()
    await click(byText("Complete")!)
    expect(byText("Fail")).toBeUndefined()
  })

  it("while an action runs Processing is disabled; Complete, Fail and Cancel are not disabled by loading", async () => {
    let release!: (v: { ok: true }) => void
    m.markPayoutProcessing.mockReturnValue(new Promise((r) => (release = r)))
    mount("pending")
    await click(byText("Processing")!)
    expect(byText("Processing")!.disabled).toBe(true)
    expect(byText("Complete")!.disabled).toBe(false)
    expect(byText("Fail")!.disabled).toBe(false)
    await act(async () => {
      release({ ok: true })
      await Promise.resolve()
    })
  })

  it("Confirm is disabled while its action runs", async () => {
    let release!: (v: { ok: true }) => void
    m.markPayoutCompleted.mockReturnValue(new Promise((r) => (release = r)))
    mount("processing")
    await click(byText("Complete")!)
    await type(container.querySelector("input")!, "R")
    await click(byText("Confirm")!)
    expect(byText("Confirm")!.disabled).toBe(true)
    expect(byText("Cancel")!.disabled).toBe(false)
    await act(async () => {
      release({ ok: true })
      await Promise.resolve()
    })
  })

  it("completed and failed rows show only the status text", () => {
    mount("completed")
    expect(buttons()).toHaveLength(0)
    expect(container.textContent).toBe("completed")
  })

  it("class tokens (updated by the swap)", () => {
    mount("pending")
    has(byText("Fail")!, TOKENS.fail)
    has(byText("Complete")!, TOKENS.complete)
    has(byText("Processing")!, TOKENS.processing)
  })
})
