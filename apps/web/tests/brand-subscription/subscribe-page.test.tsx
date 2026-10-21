// @vitest-environment jsdom
// R5c-2: what /brands/[slug]/subscribe renders in each state, pinned on the old markup first
// (plans, labels, the three CTAs, redirects). Actions, queries and payment gating are not touched.
// Looks are asserted in the "R5c look" block added with the restyle.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as BomyDb from "@bomy/db"

const { auth, getStorePlans, subscribeToBrand, existingRow, paymentsEnabled } = vi.hoisted(() => ({
  auth: vi.fn(),
  getStorePlans: vi.fn(),
  subscribeToBrand: vi.fn(),
  existingRow: { value: null as null | Record<string, unknown> },
  paymentsEnabled: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/payments-enabled", () => ({ paymentsEnabled }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))
vi.mock("@bomy/db", async (orig) => ({
  ...(await orig<typeof BomyDb>()),
  withTenant: (_db: unknown, _ctx: unknown, fn: unknown) => {
    void fn
    return Promise.resolve(existingRow.value)
  },
}))
vi.mock("@/app/brands/[slug]/subscribe/actions", () => ({ getStorePlans, subscribeToBrand }))

import BrandSubscribePage from "@/app/brands/[slug]/subscribe/page"

const STORE = { id: "s1", name: "Acme Goods" }
const plan = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  termMonths: 3,
  priceMyrSen: 1990n,
  discountPct: 10,
  description: null,
  ...over,
})
const SESSION = { user: { id: "u1", role: "buyer" } }

async function render() {
  const el = await BrandSubscribePage({ params: Promise.resolve({ slug: "acme" }) })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}

beforeEach(() => {
  auth.mockReset()
  getStorePlans.mockReset()
  subscribeToBrand.mockReset()
  paymentsEnabled.mockReset()
  existingRow.value = null
  paymentsEnabled.mockReturnValue(true)
  auth.mockResolvedValue(null)
})

describe("subscribe page: not found and redirects", () => {
  it("an unknown store is a 404", async () => {
    getStorePlans.mockResolvedValue(null)
    await expect(render()).rejects.toThrow("NOT_FOUND")
  })

  it("a store with no plans is a 404", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [] })
    await expect(render()).rejects.toThrow("NOT_FOUND")
  })

  it("an active subscription goes to the success page", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    auth.mockResolvedValue(SESSION)
    existingRow.value = { status: "active", hitpayPaymentId: "h1", createdAt: new Date() }
    await expect(render()).rejects.toThrow("REDIRECT:/brands/acme/subscribe/success")
  })

  it("a fresh pending checkout goes to the success page", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    auth.mockResolvedValue(SESSION)
    existingRow.value = { status: "pending", hitpayPaymentId: null, createdAt: new Date() }
    await expect(render()).rejects.toThrow("REDIRECT:/brands/acme/subscribe/success")
  })

  it("a stale pending checkout does not redirect: the plans show", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    auth.mockResolvedValue(SESSION)
    existingRow.value = {
      status: "pending",
      hitpayPaymentId: null,
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    }
    const d = await render()
    expect(d.querySelector("h1")!.textContent).toBe("Acme Goods")
  })
})

describe("subscribe page: content", () => {
  it("shows the eyebrow, the store name, the intro and the footer sentence", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    const d = await render()
    expect(d.body.textContent).toContain("#2 Brand Subscription")
    expect(d.querySelector("h1")!.textContent).toBe("Acme Goods")
    expect(d.body.textContent).toContain(
      "Subscribe to unlock exclusive discounts on every order from this brand.",
    )
    expect(d.body.textContent).toContain(
      "Payment processed securely · MYR · One-time charge, no automatic renewal",
    )
  })

  it("one card per plan with its term label, price, discount and optional description", async () => {
    getStorePlans.mockResolvedValue({
      store: STORE,
      plans: [
        plan({ id: "a", termMonths: 3, priceMyrSen: 1990n }),
        plan({
          id: "b",
          termMonths: 6,
          priceMyrSen: 3500n,
          discountPct: 15,
          description: "Best value",
        }),
        plan({ id: "c", termMonths: 12, priceMyrSen: 6000n, discountPct: 20 }),
      ],
    })
    const d = await render()
    const cards = d.querySelectorAll("main > div > ul > li")
    expect(cards).toHaveLength(3)
    expect(cards[0]!.textContent).toContain("3 months")
    expect(cards[0]!.textContent).toContain("RM19.9")
    expect(cards[0]!.textContent).toContain("10% off every order")
    expect(cards[0]!.textContent).toContain("billed once")
    expect(cards[1]!.textContent).toContain("6 months")
    expect(cards[1]!.textContent).toContain("15% off every order")
    expect(cards[1]!.textContent).toContain("Best value")
    expect(cards[2]!.textContent).toContain("12 months")
    expect(cards[2]!.textContent).not.toContain("Best value")
  })
})

describe("subscribe page: the three CTAs", () => {
  it("payments off: every plan shows the status notice, no form and no sign-in link", async () => {
    paymentsEnabled.mockReturnValue(false)
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan(), plan({ id: "p2" })] })
    const d = await render()
    const notices = d.querySelectorAll('[role="status"]')
    expect(notices).toHaveLength(2)
    expect(notices[0]!.textContent).toBe("Subscriptions will reopen soon")
    expect(d.querySelector("form")).toBeNull()
    expect(d.querySelector('a[href^="/auth/sign-in"]')).toBeNull()
  })

  it("payments on, signed out: a sign-in link with the callback", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    const d = await render()
    const link = d.querySelector('a[href^="/auth/sign-in"]')!
    expect(link.getAttribute("href")).toBe("/auth/sign-in?callbackUrl=/brands/acme/subscribe")
    expect(link.textContent).toContain("Sign in to subscribe")
    expect(d.querySelector("form")).toBeNull()
  })

  it("payments on, signed in: a form with the Subscribe button and the price", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    auth.mockResolvedValue(SESSION)
    const d = await render()
    expect(d.querySelectorAll("form")).toHaveLength(1)
    const button = d.querySelector("form button")!
    expect(button.textContent).toContain("Subscribe — RM19.9")
    expect(d.querySelector('a[href^="/auth/sign-in"]')).toBeNull()
  })
})

const cls = (el: Element | null, tokens: string[]) => {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("subscribe page: R5c look", () => {
  const LONG = "R5C2LONGSTORE".repeat(6) + "AB"

  it("main is a plain padded column on the page ground (no full-height muted ground)", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    const d = await render()
    const main = d.querySelector("main")!
    cls(main, ["flex", "flex-col", "items-center", "px-4", "py-10", "sm:py-16"])
    for (const t of ["min-h-screen", "bg-muted", "pt-20"])
      expect(main.classList.contains(t)).toBe(false)
  })

  it("the store name is a centred PageHeading that may break anywhere", async () => {
    getStorePlans.mockResolvedValue({ store: { id: "s1", name: LONG }, plans: [plan()] })
    const d = await render()
    const h1 = d.querySelector("h1")!
    expect(h1.textContent).toBe(LONG)
    cls(h1, ["text-3xl", "font-bold", "tracking-tight", "sm:text-4xl", "[overflow-wrap:anywhere]"])
    cls(h1.parentElement, ["min-w-0", "text-center"])
  })

  it("the eyebrow uses the mono eyebrow style", async () => {
    getStorePlans.mockResolvedValue({ store: STORE, plans: [plan()] })
    const d = await render()
    const eyebrow = Array.from(d.querySelectorAll("p")).find(
      (p) => p.textContent === "#2 Brand Subscription",
    )!
    cls(eyebrow, ["font-mono", "text-xs", "uppercase", "tracking-eyebrow", "text-primary"])
  })

  it("plan cards are bento cards that can shrink and break long text", async () => {
    getStorePlans.mockResolvedValue({
      store: STORE,
      plans: [plan({ priceMyrSen: 999999999n, description: "LONGPLANDESCRIPTION".repeat(10) })],
    })
    const d = await render()
    const card = d.querySelector("main > div > ul > li")!
    cls(card, ["min-w-0", "rounded-bento", "border", "border-border", "bg-card", "shadow-sm"])
    for (const t of ["ring-1", "bg-background", "rounded-2xl"])
      expect(card.classList.contains(t)).toBe(false)
    const price = Array.from(card.querySelectorAll("p")).find(
      (p) => p.textContent === "RM9999999.99",
    )!
    cls(price, ["[overflow-wrap:anywhere]"])
    const desc = Array.from(card.querySelectorAll("li")).find((l) =>
      l.textContent.includes("LONGPLAN"),
    )!
    cls(desc, ["min-w-0", "[overflow-wrap:anywhere]"])
  })

  it("the grid follows the plan count: one plan is centred and narrow, two fill two columns, three fill three", async () => {
    const grid = async (n: number) => {
      getStorePlans.mockResolvedValue({
        store: STORE,
        plans: Array.from({ length: n }, (_, i) =>
          plan({ id: "p" + i, termMonths: [3, 6, 12][i] }),
        ),
      })
      return (await render()).querySelector("main > div > ul")!
    }
    cls(await grid(1), ["grid", "gap-4", "grid-cols-1", "sm:mx-auto", "sm:max-w-sm", "w-full"])
    cls(await grid(2), ["grid", "gap-4", "grid-cols-1", "sm:grid-cols-2", "w-full"])
    cls(await grid(3), ["grid", "gap-4", "grid-cols-1", "sm:grid-cols-3", "w-full"])
  })
})
