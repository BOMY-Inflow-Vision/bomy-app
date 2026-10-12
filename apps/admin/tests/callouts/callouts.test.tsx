// @vitest-environment jsdom
// Baseline of the three admin callout boxes (PR 5d-3, Task 1): the approved and rejected boxes on
// the seller inquiry page and the payment-review row on the reconciliation page. Written first
// against the hand-built divs; after the Alert swap only the expected class tokens change, never
// the announcement state (no role, no aria-live) or the list structure.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({
  inquiry: null as Record<string, unknown> | null,
  sessions: [] as unknown[],
}))

vi.mock("@/lib/auth", () => ({
  requireAdmin: () => Promise.resolve({ id: "admin-1", role: "bomy_admin" }),
}))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("@bomy/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    withAdmin: (_db: unknown, ctx: { reason: string }) => {
      if (ctx.reason === "admin view seller inquiry") return Promise.resolve([data.inquiry])
      if (ctx.reason === "admin list payment review sessions") return Promise.resolve(data.sessions)
      return Promise.resolve([])
    },
  }
})
vi.mock("@/app/seller-inquiries/[id]/approve-form", () => ({ ApproveForm: () => null }))
vi.mock("@/app/orders/_queries", () => ({
  fetchNegativeCommissionOrders: () => Promise.resolve([]),
}))
vi.mock("@/app/payouts/reconciliation/_refund-button", () => ({ RefundButton: () => null }))

import SellerInquiryDetailPage from "@/app/seller-inquiries/[id]/page"
import ReconciliationPage from "@/app/payouts/reconciliation/page"

const REVIEWED = new Date("2026-10-01T00:00:00Z")

function inquiry(status: "approved" | "rejected") {
  return {
    id: "inq-1",
    name: "Ada Lim",
    email: "ada@example.com",
    contactNumber: "+60123456789",
    companyName: "Ada Co",
    storeName: "Ada Store",
    message: "Hello",
    status,
    reviewedAt: REVIEWED,
    createdAt: REVIEWED,
    reviewerName: "Bob",
    reviewerEmail: "bob@example.com",
    storeIdLinked: "store-1",
    storeNameLinked: "Ada Store",
    storeSlugLinked: "ada-store",
    storeStatusLinked: "pending",
  }
}

async function inquiryDoc(status: "approved" | "rejected"): Promise<Document> {
  data.inquiry = inquiry(status)
  const html = renderToStaticMarkup(
    await SellerInquiryDetailPage({ params: Promise.resolve({ id: "inq-1" }) }),
  )
  return new DOMParser().parseFromString(html, "text/html")
}

async function reconciliationDoc(): Promise<Document> {
  const html = renderToStaticMarkup(await ReconciliationPage())
  return new DOMParser().parseFromString(html, "text/html")
}

// The box is the nearest element with a border class that holds `text`.
function box(doc: Document, text: string): HTMLElement {
  const hit = [...doc.querySelectorAll<HTMLElement>("div, li")].find(
    (e) =>
      /\bborder-(success|warning|destructive)\/30\b/.test(e.className) &&
      e.textContent?.includes(text),
  )
  if (!hit) throw new Error(`no callout box with text "${text}"`)
  return hit
}

function announced(el: HTMLElement): boolean {
  for (let e: HTMLElement | null = el; e && e.tagName !== "BODY"; e = e.parentElement) {
    if (e.hasAttribute("role") || e.hasAttribute("aria-live")) return true
  }
  return false
}

beforeEach(() => {
  data.inquiry = null
  data.sessions = [
    {
      id: "cccccccc-0000-0000-0000-000000000003",
      status: "payment_review_required",
      paymentReviewReason: "amount_mismatch",
      createdAt: REVIEWED,
    },
  ]
})

describe("seller inquiry callouts", () => {
  it("approved: hand-built success box, no announcement attributes (baseline)", async () => {
    const el = box(await inquiryDoc("approved"), "Approved — pending store provisioned")
    expect([...el.classList]).toEqual(
      expect.arrayContaining([
        "rounded-lg",
        "border",
        "border-success/30",
        "bg-success-subtle",
        "p-4",
        "text-sm",
        "text-success",
      ]),
    )
    expect(announced(el)).toBe(false)
    expect(el.querySelector("a")?.getAttribute("href")).toBe("/stores")
  })

  it("rejected: hand-built destructive box, no announcement attributes (baseline)", async () => {
    const el = box(await inquiryDoc("rejected"), "Rejected on")
    expect([...el.classList]).toEqual(
      expect.arrayContaining([
        "rounded-lg",
        "border",
        "border-destructive/30",
        "bg-destructive/10",
        "p-4",
        "text-sm",
        "text-destructive",
      ]),
    )
    expect(announced(el)).toBe(false)
  })
})

describe("reconciliation review row", () => {
  it("is a hand-built warning li inside the ul, with no announcement attributes (baseline)", async () => {
    const doc = await reconciliationDoc()
    const el = box(doc, "amount_mismatch")
    expect(el.tagName).toBe("LI")
    expect(el.parentElement?.tagName).toBe("UL")
    expect([...el.classList]).toEqual(
      expect.arrayContaining([
        "flex",
        "items-center",
        "justify-between",
        "rounded-xl",
        "border",
        "border-warning/30",
        "bg-warning-subtle",
        "px-6",
        "py-4",
      ]),
    )
    expect(announced(el)).toBe(false)
    expect(el.querySelector("a")?.getAttribute("href")).toBe(
      "/checkout-sessions/cccccccc-0000-0000-0000-000000000003",
    )
  })
})
