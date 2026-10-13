// @vitest-environment jsdom
//
// Filter chips on the six admin list pages (PR 5d-4). Written first against the hand-built
// <a>/<Link> chips (baseline); after the FilterTabs swap the hrefs, the order and the active chip
// are unchanged. Only aria-current appears (on the active chip) and the groups gain a nav label.
// Behaviour per page is pinned as it is today: on goodie-box, memberships and brand-subscriptions
// an invalid nonempty status leaves NO chip active; on payouts, inquiries and stores it selects All.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  requireAdmin: () => Promise.resolve({ id: "admin-1", role: "bomy_admin" }),
}))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("@bomy/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    withAdmin: (_db: unknown, ctx: { reason: string }) => {
      switch (ctx.reason) {
        case "admin list goodie box quarters":
          return Promise.resolve([{ quarter: "2026-Q4" }, { quarter: "2026-Q3" }])
        case "admin list stores for brand sub filter":
          return Promise.resolve([
            { id: "11111111-1111-4111-8111-111111111111", name: "Store One" },
          ])
        case "admin read renewal_notification_days":
          return Promise.resolve([])
        default:
          return Promise.resolve({ rows: [], total: 0 })
      }
    },
  }
})
vi.mock("@/app/payouts/_payout-actions", () => ({ PayoutActions: () => null }))
vi.mock("@/app/seller-inquiries/actions", () => ({ deleteInquiry: vi.fn() }))
vi.mock("@/app/seller-inquiries/reject-button", () => ({ RejectButton: () => null }))
vi.mock("@/app/stores/actions", () => ({ approveStore: vi.fn(), suspendStore: vi.fn() }))
vi.mock("@/app/stores/copy-id", () => ({ CopyId: () => null }))
vi.mock("@/app/goodie-box/actions", () => ({ markDispatched: vi.fn() }))
vi.mock("@/app/memberships/actions", () => ({
  cancelMembership: vi.fn(),
  updateRenewalNotificationDays: vi.fn(),
}))
vi.mock("@/app/brand-subscriptions/store-filter", () => ({ StoreFilter: () => null }))

import BrandSubscriptionsPage from "@/app/brand-subscriptions/page"
import GoodieBoxPage from "@/app/goodie-box/page"
import MembershipsPage from "@/app/memberships/page"
import PayoutsPage from "@/app/payouts/page"
import SellerInquiriesPage from "@/app/seller-inquiries/page"
import StoresPage from "@/app/stores/page"

// Set to true in the swap commit: the active chip then carries aria-current="page".
const AFTER = false

type Chip = {
  text: string
  href: string
  active: boolean
  current: string | null
  tag: string
  classes: string[]
}

// Exact look of each chip variant, active and inactive, as it is today.
const INVERSE = {
  active: ["rounded-full", "px-3", "py-1", "text-sm", "bg-foreground", "text-background"],
  inactive: ["rounded-full", "px-3", "py-1", "text-sm", "bg-muted", "text-muted-foreground"],
}
const FLAT = {
  active: ["rounded", "px-3", "py-1", "bg-accent", "text-accent-foreground"],
  inactive: ["rounded", "px-3", "py-1", "text-muted-foreground", "hover:bg-muted"],
}

function expectLook(got: Chip[], look: { active: string[]; inactive: string[] }) {
  for (const c of got) {
    const want = c.active ? look.active : look.inactive
    expect(c.classes).toEqual(expect.arrayContaining(want))
    if (c.active) expect(c.classes).not.toContain("bg-muted")
  }
}

function chips(html: string, hrefPrefix: string, texts: string[]): Chip[] {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const out: Chip[] = []
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a")) {
    const href = a.getAttribute("href") ?? ""
    const text = a.textContent?.trim() ?? ""
    if (!href.startsWith(hrefPrefix) || !texts.includes(text)) continue
    if (!/\bpy-1\b/.test(a.className)) continue
    out.push({
      text,
      href,
      active: /\b(bg-primary|bg-foreground|bg-accent)\b/.test(a.className),
      current: a.getAttribute("aria-current"),
      tag: a.tagName,
      classes: a.className.split(/\s+/),
    })
  }
  return out
}

function expectChips(got: Chip[], expected: Array<[string, string]>, activeText: string | null) {
  expect(got.map((c) => [c.text, c.href])).toEqual(expected)
  expect(got.filter((c) => c.active).map((c) => c.text)).toEqual(activeText ? [activeText] : [])
  for (const c of got) expect(c.current).toBe(AFTER && c.active ? "page" : null)
}

type SP = { status?: string; q?: string; sort?: string; quarter?: string; page?: string }
const render = async (el: Promise<React.ReactElement>) => renderToStaticMarkup(await el)

describe("admin payouts (inverse chips; invalid status selects All)", () => {
  const S = ["pending", "processing", "completed", "failed"]
  const exp = (): Array<[string, string]> => [
    ["All", "/payouts"],
    ...S.map((s): [string, string] => [s, `/payouts?status=${s}`]),
  ]
  it.each([
    [{}, "All"],
    [{ status: "completed" }, "completed"],
    [{ status: "bogus" }, "All"],
    [{ status: "", page: "3" }, "All"],
  ])("%j", async (spIn, active) => {
    const sp: SP = spIn
    const html = await render(PayoutsPage({ searchParams: Promise.resolve(sp) }))
    const got = chips(html, "/payouts", ["All", ...S])
    expectChips(got, exp(), active)
    expectLook(got, INVERSE)
    for (const c of got) expect(c.classes).not.toContain("font-medium")
  })
})

describe("admin seller inquiries (flat chips; invalid status selects All)", () => {
  const S = ["pending", "approved", "rejected"]
  it.each([
    [{}, "All"],
    [{ status: "approved", q: "ada", sort: "status" }, "approved"],
    [{ status: "bogus", q: "ada" }, "All"],
  ])("%j", async (spIn, active) => {
    const sp: SP = spIn
    const html = await render(SellerInquiriesPage({ searchParams: Promise.resolve(sp) }))
    const got = chips(html, "/seller-inquiries", ["All", ...S])
    expectLook(got, FLAT)
    expect(got.map((c) => c.text)).toEqual(["All", ...S])
    expect(got.filter((c) => c.active).map((c) => c.text)).toEqual([active])
    for (const c of got) expect(c.current).toBe(AFTER && c.active ? "page" : null)
    const q = sp.q ? `q=${sp.q}` : ""
    const so = sp.sort ? `sort=${sp.sort}` : ""
    expect(got.map((c) => c.href)).toEqual(
      ["", ...S].map((s) => {
        const ps = [s && `status=${s}`, q, so].filter(Boolean).join("&")
        return ps ? `/seller-inquiries?${ps}` : "/seller-inquiries"
      }),
    )
  })
})

describe("admin stores (flat chips; invalid status selects All)", () => {
  const S = ["pending", "active", "suspended"]
  it.each([
    [{}, "All"],
    [{ status: "suspended", q: "x" }, "suspended"],
    [{ status: "bogus" }, "All"],
  ])("%j", async (spIn, active) => {
    const sp: SP = spIn
    const html = await render(StoresPage({ searchParams: Promise.resolve(sp) }))
    const got = chips(html, "/stores", ["All", ...S])
    expectLook(got, FLAT)
    expect(got.map((c) => c.text)).toEqual(["All", ...S])
    expect(got.filter((c) => c.active).map((c) => c.text)).toEqual([active])
    for (const c of got) expect(c.current).toBe(AFTER && c.active ? "page" : null)
    const q = sp.q ? `q=${sp.q}` : ""
    expect(got.map((c) => c.href)).toEqual(
      ["", ...S].map((s) => {
        const ps = [s && `status=${s}`, q].filter(Boolean).join("&")
        return ps ? `/stores?${ps}` : "/stores"
      }),
    )
  })
})

describe("admin goodie box (status and quarter groups; invalid status leaves no chip active)", () => {
  const S = ["pending", "dispatched", "delivered"]
  it.each([
    [{}, "All", "All"],
    [{ status: "delivered", quarter: "2026-Q3" }, "delivered", "2026-Q3"],
    [{ status: "bogus" }, null, "All"],
  ])("%j", async (spIn, activeStatus, activeQuarter) => {
    const sp: SP = spIn
    const html = await render(GoodieBoxPage({ searchParams: Promise.resolve(sp) }))
    // Status chips first (px-3), quarter chips after (px-2): read them by their padding class.
    const doc = new DOMParser().parseFromString(html, "text/html")
    const all = [...doc.querySelectorAll<HTMLAnchorElement>("a")].filter(
      (a) => /\brounded\b/.test(a.className) && /\bpy-1\b/.test(a.className),
    )
    const statusChips = all.filter((a) => /\bpx-3\b/.test(a.className))
    const quarterChips = all.filter((a) => /\bpx-2\b/.test(a.className))
    expect(statusChips.map((a) => a.textContent?.trim())).toEqual(["All", ...S])
    expect(quarterChips.map((a) => a.textContent?.trim())).toEqual(["All", "2026-Q4", "2026-Q3"])
    const act = (list: HTMLAnchorElement[]) =>
      list.filter((a) => /\bbg-accent\b/.test(a.className)).map((a) => a.textContent?.trim())
    for (const a of statusChips) {
      const on = /\bbg-accent\b/.test(a.className)
      expect([...a.classList]).toEqual(expect.arrayContaining(on ? FLAT.active : FLAT.inactive))
    }
    for (const a of quarterChips) {
      const on = /\bbg-accent\b/.test(a.className)
      expect([...a.classList]).toEqual(
        expect.arrayContaining(
          (on ? FLAT.active : FLAT.inactive).map((t) => (t === "px-3" ? "px-2" : t)),
        ),
      )
    }
    expect(act(statusChips)).toEqual(activeStatus ? [activeStatus] : [])
    expect(act(quarterChips)).toEqual([activeQuarter])
    const q = sp.quarter ? `quarter=${sp.quarter}` : ""
    expect(statusChips.map((a) => a.getAttribute("href"))).toEqual(
      ["", ...S].map((s) => {
        const ps = [s && `status=${s}`, q].filter(Boolean).join("&")
        return ps ? `/goodie-box?${ps}` : "/goodie-box"
      }),
    )
    const st = sp.status ? `status=${sp.status}` : ""
    expect(quarterChips.map((a) => a.getAttribute("href"))).toEqual(
      ["", "2026-Q4", "2026-Q3"].map((qq) => {
        const ps = [st, qq && `quarter=${qq}`].filter(Boolean).join("&")
        return ps ? `/goodie-box?${ps}` : "/goodie-box"
      }),
    )
    for (const a of [...statusChips, ...quarterChips]) {
      const on = /\bbg-accent\b/.test(a.className)
      expect(a.getAttribute("aria-current")).toBe(AFTER && on ? "page" : null)
    }
  })
})

describe.each([
  ["memberships", MembershipsPage],
  ["brand-subscriptions", BrandSubscriptionsPage],
] as const)("admin %s (flat chips; invalid status leaves no chip active)", (path, Page) => {
  const S = ["pending", "active", "cancelled", "expired", "payment_failed"]
  it.each([
    [{}, "All"],
    [{ status: "active" }, "active"],
    [{ status: "bogus" }, null],
  ])("%j", async (spIn, active) => {
    const sp: SP = spIn
    const html = await render(Page({ searchParams: Promise.resolve(sp) }))
    const got = chips(html, `/${path}`, ["All", ...S])
    expectLook(got, FLAT)
    expect(got.map((c) => c.text)).toEqual(["All", ...S])
    expect(got.filter((c) => c.active).map((c) => c.text)).toEqual(active ? [active] : [])
    for (const c of got) expect(c.current).toBe(AFTER && c.active ? "page" : null)
    expect(got.map((c) => c.href)).toEqual(
      ["", ...S].map((s) => (s ? `/${path}?status=${s}` : `/${path}`)),
    )
  })
})
