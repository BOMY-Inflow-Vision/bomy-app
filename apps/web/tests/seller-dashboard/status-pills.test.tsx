// Fixture render of the real seller pages that show status pills but have no local data
// (orders) or an unreliable seed (subscriptions). Pages are rendered with their data layer mocked.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({
  orders: [] as unknown[],
  detail: null as unknown,
  plans: null as unknown,
}))

vi.mock("@/auth", () => ({
  auth: () => Promise.resolve({ user: { id: "user-1", role: "seller_owner" } }),
}))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("@bomy/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const stubTx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "store-1" }]) }) }),
    }),
  }
  return {
    ...actual,
    makeDb: () => ({ db: {} }),
    withTenant: (_db: unknown, _ctx: unknown, fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(stubTx)),
  }
})
vi.mock("@/app/seller/dashboard/orders/queries", () => ({
  fetchSellerOrders: () => Promise.resolve(data.orders),
  fetchSellerOrderDetail: () => Promise.resolve(data.detail),
}))
vi.mock("@/app/seller/dashboard/orders/[orderId]/_enter-tracking-form", () => ({
  EnterTrackingForm: () => null,
}))
vi.mock("@/app/seller/dashboard/orders/[orderId]/_mark-delivered-button", () => ({
  MarkDeliveredButton: () => null,
}))
vi.mock("@/app/seller/dashboard/subscriptions/actions", () => ({
  getSellerPlansData: () => Promise.resolve(data.plans),
}))
vi.mock("@/app/seller/dashboard/subscriptions/create-plan-form", () => ({
  CreatePlanForm: () => null,
}))
vi.mock("@/app/seller/dashboard/subscriptions/edit-plan-form", () => ({
  EditPlanForm: () => null,
}))

import SellerOrdersPage from "@/app/seller/dashboard/orders/page"
import SellerOrderDetailPage from "@/app/seller/dashboard/orders/[orderId]/page"
import SellerSubscriptionsPage from "@/app/seller/dashboard/subscriptions/page"

const ORDER_ID = "11111111-2222-3333-4444-555555555555"

// Class tokens of the pill <span> whose whole text is `text`.
function pill(html: string, text: string): string[] {
  const m = html.match(new RegExp(`<span class="([^"]*)">\\s*${text}\\s*</span>`))
  if (!m) throw new Error(`no <span> pill with text "${text}"`)
  return m[1]!.split(/\s+/)
}

beforeEach(() => {
  data.orders = [
    {
      id: ORDER_ID,
      fulfilmentStatus: "shipped",
      sellerPayoutSen: 12500n,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ]
  data.detail = {
    id: ORDER_ID,
    fulfilmentStatus: "delivered",
    sellerPayoutSen: 12500n,
    pspFeeAllocatedSen: 250n,
    carrier: null,
    trackingNumber: null,
    items: [],
  }
  data.plans = {
    store: { id: "store-1" },
    plans: [
      { id: "p-1", termMonths: 3, priceMyrSen: 5000n, discountPct: 10, isActive: true },
      { id: "p-2", termMonths: 6, priceMyrSen: 9000n, discountPct: 15, isActive: false },
    ],
    countByPlan: { "p-1": 2 },
    paidPayouts: [],
    pendingPayouts: [
      {
        id: "s-1",
        planId: "p-1",
        brandPayoutSen: 4500n,
        brandPayoutAt: null,
        periodEnd: new Date("2026-12-01T00:00:00Z"),
        status: "active",
      },
    ],
  }
})

async function ordersHtml() {
  return renderToStaticMarkup(await SellerOrdersPage({ searchParams: Promise.resolve({}) }))
}
async function detailHtml() {
  return renderToStaticMarkup(
    await SellerOrderDetailPage({ params: Promise.resolve({ orderId: ORDER_ID }) }),
  )
}
async function subsHtml() {
  return renderToStaticMarkup(await SellerSubscriptionsPage({ searchParams: Promise.resolve({}) }))
}

describe("seller orders list: accent pill", () => {
  it("renders the fulfilment status as an accent Badge", async () => {
    const t = pill(await ordersHtml(), "shipped")
    expect(t).toEqual(
      expect.arrayContaining([
        "inline-flex",
        "rounded-full",
        "border-transparent",
        "bg-accent",
        "text-accent-foreground",
        "mt-1",
        "capitalize",
      ]),
    )
  })
})

describe("seller order detail: header pill", () => {
  it("renders the fulfilment status as an accent Badge with header geometry", async () => {
    const t = pill(await detailHtml(), "delivered")
    expect(t).toEqual(
      expect.arrayContaining([
        "inline-flex",
        "rounded-full",
        "border-0",
        "px-3",
        "py-1",
        "text-sm",
        "font-medium",
        "capitalize",
        "bg-accent",
        "text-accent-foreground",
      ]),
    )
    expect(t).not.toContain("border")
  })
})

describe("seller subscriptions: status pills", () => {
  it("renders Active, Pending activation and Pending as Badges", async () => {
    const html = await subsHtml()
    expect(pill(html, "Active")).toEqual(
      expect.arrayContaining(["inline-flex", "bg-success-subtle", "text-success"]),
    )
    expect(pill(html, "Pending activation")).toEqual(
      expect.arrayContaining(["inline-flex", "bg-warning-subtle", "text-warning"]),
    )
    expect(pill(html, "Pending")).toEqual(
      expect.arrayContaining(["inline-flex", "bg-warning-subtle", "text-warning"]),
    )
  })
})
