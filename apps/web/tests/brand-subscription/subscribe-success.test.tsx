// @vitest-environment jsdom
// R5c-2: the brand subscription success page and its poller, by their real states, pinned on the old
// markup first. The poller timers and the abandon action are not touched.
// States: active, fresh pending (activating, then unconfirmed after 10 s), stale pending or no row (unconfirmed).
// Looks are asserted in the "R5c look" block added with the restyle.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as BomyDb from "@bomy/db"
import type * as PollerModule from "@/app/brands/[slug]/subscribe/success/poller"

const { auth, router, subRow, storeRow, abandon } = vi.hoisted(() => ({
  auth: vi.fn(),
  router: { refresh: vi.fn() },
  subRow: { value: null as null | Record<string, unknown> },
  storeRow: { value: null as null | Record<string, unknown> },
  abandon: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
}))
vi.mock("@bomy/db", async (orig) => ({
  ...(await orig<typeof BomyDb>()),
  withAdmin: () => Promise.resolve(storeRow.value),
  withTenant: () => Promise.resolve(subRow.value),
}))
vi.mock("@/app/brands/[slug]/subscribe/actions", () => ({
  abandonPendingBrandSubscription: abandon,
}))
vi.mock("@/app/brands/[slug]/subscribe/success/poller", () => ({
  BrandSubscriptionPoller: (p: Record<string, unknown>) => (
    <div
      data-testid="poller"
      data-initial-active={String(p["initialActive"])}
      data-pending-fresh={String(p["pendingFresh"])}
      data-slug={String(p["storeSlug"])}
      data-name={String(p["storeName"])}
    />
  ),
}))

import SuccessPage from "@/app/brands/[slug]/subscribe/success/page"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

async function renderPage() {
  const el = await SuccessPage({ params: Promise.resolve({ slug: "acme" }) })
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}

beforeEach(() => {
  auth.mockReset()
  auth.mockResolvedValue({ user: { id: "u1", role: "buyer" } })
  storeRow.value = { id: "s1", name: "Acme Goods", slug: "acme" }
  subRow.value = null
})

describe("success page: gating and what it passes to the poller", () => {
  it("signed out redirects to sign-in with the success callback", async () => {
    auth.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow(
      "REDIRECT:/auth/sign-in?callbackUrl=/brands/acme/subscribe/success",
    )
  })

  it("an unknown store is a 404", async () => {
    storeRow.value = null
    await expect(renderPage()).rejects.toThrow("NOT_FOUND")
  })

  it("an active row passes initialActive", async () => {
    subRow.value = { status: "active", hitpayPaymentId: "h1", createdAt: new Date() }
    const p = (await renderPage()).querySelector('[data-testid="poller"]')!
    expect(p.getAttribute("data-initial-active")).toBe("true")
    expect(p.getAttribute("data-pending-fresh")).toBe("false")
    expect(p.getAttribute("data-slug")).toBe("acme")
    expect(p.getAttribute("data-name")).toBe("Acme Goods")
  })

  it("a pending row without a payment id made just now passes pendingFresh", async () => {
    subRow.value = { status: "pending", hitpayPaymentId: null, createdAt: new Date() }
    const p = (await renderPage()).querySelector('[data-testid="poller"]')!
    expect(p.getAttribute("data-initial-active")).toBe("false")
    expect(p.getAttribute("data-pending-fresh")).toBe("true")
  })

  it("a pending row older than 30 minutes passes neither", async () => {
    subRow.value = {
      status: "pending",
      hitpayPaymentId: null,
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    }
    const p = (await renderPage()).querySelector('[data-testid="poller"]')!
    expect(p.getAttribute("data-initial-active")).toBe("false")
    expect(p.getAttribute("data-pending-fresh")).toBe("false")
  })

  it("no row passes neither", async () => {
    const p = (await renderPage()).querySelector('[data-testid="poller"]')!
    expect(p.getAttribute("data-initial-active")).toBe("false")
    expect(p.getAttribute("data-pending-fresh")).toBe("false")
  })
})

describe("poller: the three renderings", () => {
  let container: HTMLDivElement
  let root: Root
  let Poller: typeof PollerModule.BrandSubscriptionPoller

  beforeEach(async () => {
    vi.useFakeTimers()
    router.refresh.mockReset()
    abandon.mockReset()
    const real = await vi.importActual<typeof PollerModule>(
      "@/app/brands/[slug]/subscribe/success/poller",
    )
    Poller = real.BrandSubscriptionPoller
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function mount(props: { initialActive: boolean; pendingFresh: boolean }) {
    act(() => {
      root.render(<Poller {...props} storeSlug="acme" storeName="Acme Goods" />)
    })
  }
  function tick(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it("active: heading, store sentence and the link to /account/subscriptions", () => {
    mount({ initialActive: true, pendingFresh: false })
    expect(container.querySelector("h1")!.textContent).toBe("Subscription activated!")
    expect(container.textContent).toContain(
      "You now get a discount on every order from Acme Goods.",
    )
    const link = container.querySelector("a")!
    expect(link.getAttribute("href")).toBe("/account/subscriptions")
    expect(link.textContent).toContain("View my subscriptions")
    tick(30_000)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it("fresh pending: activating text, refreshes every 2 s, then the unconfirmed view after 10 s", () => {
    mount({ initialActive: false, pendingFresh: true })
    expect(container.querySelector("h1")!.textContent).toBe("Activating your subscription…")
    expect(container.textContent).toContain(
      "Payment confirmed. Hang tight — this usually takes a few seconds.",
    )
    expect(container.querySelector("svg.animate-spin")).not.toBeNull()
    tick(2000)
    expect(router.refresh).toHaveBeenCalledTimes(1)
    tick(6000)
    expect(router.refresh).toHaveBeenCalledTimes(4)
    expect(container.querySelector("h1")!.textContent).toBe("Activating your subscription…")
    tick(2000)
    expect(container.querySelector("h1")!.textContent).toBe("We haven't confirmed your payment")
    tick(10_000)
    expect(router.refresh).toHaveBeenCalledTimes(4)
  })

  it("not fresh: the unconfirmed view at once, with the two buttons and no polling", () => {
    mount({ initialActive: false, pendingFresh: false })
    expect(container.querySelector("h1")!.textContent).toBe("We haven't confirmed your payment")
    expect(container.textContent).toContain(
      "If you completed payment, confirmation can take a moment — check again shortly. If you didn't finish paying, you can start over.",
    )
    const check = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("I've paid — check again"),
    )!
    const startOver = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Start over"),
    )!
    expect(check.getAttribute("type")).toBe("button")
    expect(startOver.getAttribute("type")).toBe("submit")
    expect(startOver.closest("form")).not.toBeNull()
    act(() => {
      check.click()
    })
    expect(router.refresh).toHaveBeenCalledTimes(1)
    tick(30_000)
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })
})
