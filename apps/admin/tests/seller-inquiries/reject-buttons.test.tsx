// @vitest-environment jsdom
//
// The two Reject buttons (PR 5d-9, man-t30): the list row's RejectButton and the detail form's Reject.
// Written first against the separately styled buttons (baseline); after the shared tone constant only the
// TOKENS expectations change. The shapes stay different on purpose (D19): link in the row, outline in the form.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  rejectInquiry: vi.fn(),
  approveInquiry: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("@/app/seller-inquiries/actions", () => m)
vi.mock("@/components/toaster", () => ({ useToast: () => m.toast }))
// The form embeds the tiptap editor; it is not under test here.
vi.mock("@/components/brand-story-field", () => ({ BrandStoryField: () => null }))

import { RejectButton } from "@/app/seller-inquiries/reject-button"
import { ApproveForm } from "@/app/seller-inquiries/[id]/approve-form"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Class tokens the two buttons carry (the shared REJECT_TONE gives both text-warning and hover:text-warning).
const TOKENS = {
  row: ["text-sm", "text-warning", "hover:text-warning"],
  form: ["border-warning/40", "text-warning", "hover:bg-warning-subtle", "hover:text-warning"],
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

const byText = (t: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === t)!
const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
  })
function has(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
}

describe("RejectButton (list row)", () => {
  const mount = () =>
    act(() => {
      root.render(<RejectButton inquiryId="inq-1" />)
    })

  it("is a button named Reject that calls rejectInquiry with the id, then toasts", async () => {
    m.rejectInquiry.mockResolvedValue({ ok: true })
    mount()
    const btn = byText("Reject")
    expect(btn.getAttribute("type")).toBe("button")
    await click(btn)
    expect(m.rejectInquiry).toHaveBeenCalledWith("inq-1")
    expect(m.toast.success).toHaveBeenCalledWith("Inquiry rejected.")
  })

  it("shows the error text and an error toast when the action fails", async () => {
    m.rejectInquiry.mockResolvedValue({ ok: false, error: "nope" })
    mount()
    await click(byText("Reject"))
    expect(m.toast.error).toHaveBeenCalledWith("nope")
    expect(container.textContent).toContain("nope")
  })

  it("is disabled and reads Rejecting… while the action runs", async () => {
    let release!: (v: { ok: true }) => void
    m.rejectInquiry.mockReturnValue(new Promise((r) => (release = r)))
    mount()
    await click(byText("Reject"))
    const pending = byText("Rejecting…")
    expect(pending.disabled).toBe(true)
    await act(async () => {
      release({ ok: true })
      await Promise.resolve()
    })
    expect(byText("Reject").disabled).toBe(false)
  })

  it("class tokens (updated by the swap)", () => {
    mount()
    has(byText("Reject"), TOKENS.row)
  })
})

describe("ApproveForm Reject (detail form)", () => {
  const mount = () =>
    act(() => {
      root.render(<ApproveForm inquiryId="inq-2" defaultSlug="Acme Co" />)
    })

  it("Reject calls rejectInquiry with the id, then toasts", async () => {
    m.rejectInquiry.mockResolvedValue({ ok: true })
    mount()
    const btn = byText("Reject")
    expect(btn.getAttribute("type")).toBe("button")
    await click(btn)
    expect(m.rejectInquiry).toHaveBeenCalledWith("inq-2")
    expect(m.approveInquiry).not.toHaveBeenCalled()
    expect(m.toast.success).toHaveBeenCalledWith("Inquiry rejected.")
  })

  it("shows the action error under the form", async () => {
    m.rejectInquiry.mockResolvedValue({ ok: false, error: "denied" })
    mount()
    await click(byText("Reject"))
    expect(m.toast.error).toHaveBeenCalledWith("denied")
    expect(container.textContent).toContain("denied")
  })

  it("Approve stays disabled until the story and video are filled", () => {
    mount()
    expect(byText("Approve").disabled).toBe(true)
  })

  it("class tokens (updated by the swap)", () => {
    mount()
    has(byText("Reject"), TOKENS.form)
  })
})
