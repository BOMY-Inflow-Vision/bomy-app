// @vitest-environment jsdom
// Stripe design PR 3 review: "Renew" on /account/subscriptions starts a NEW brand subscription,
// so it follows the same paymentsEnabled() gate as /brands/[slug]/subscribe.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { withTenant, paymentsEnabled } = vi.hoisted(() => ({
  withTenant: vi.fn(),
  paymentsEnabled: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: "u1", role: "buyer" } }) }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock("@bomy/db", () => ({ schema: {}, withTenant }))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/payments-enabled", () => ({ paymentsEnabled }))
vi.mock("@/app/account/account-tabs", () => ({ AccountTabs: () => null }))

import AccountSubscriptionsPage from "@/app/account/subscriptions/page"

function sub(status: string) {
  return {
    id: `id-${status}`,
    status,
    priceMyrSen: 1000n,
    discountPct: 10,
    periodEnd: new Date("2026-01-01T00:00:00Z"),
    periodStart: new Date("2025-01-01T00:00:00Z"),
    storeName: "Acme",
    storeSlug: "acme",
    termMonths: 12,
  }
}

async function render() {
  const el = await AccountSubscriptionsPage()
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}

const renew = (d: Document) => d.querySelector('a[href="/brands/acme/subscribe"]')

beforeEach(() => {
  withTenant.mockReset()
  paymentsEnabled.mockReset()
})

describe("account subscriptions Renew link", () => {
  it("shows for an expired subscription when new subscriptions are open", async () => {
    withTenant.mockResolvedValue([sub("expired")])
    paymentsEnabled.mockResolvedValue(true)
    expect(renew(await render())?.textContent).toContain("Renew")
  })

  it("is hidden while new subscriptions are closed", async () => {
    withTenant.mockResolvedValue([sub("cancelled")])
    paymentsEnabled.mockResolvedValue(false)
    const d = await render()
    expect(renew(d)).toBeNull()
    expect(d.body.textContent).toContain("Acme")
  })

  it("does not read the flags when no row could show Renew", async () => {
    withTenant.mockResolvedValue([sub("active")])
    await render()
    expect(paymentsEnabled).not.toHaveBeenCalled()
  })
})
