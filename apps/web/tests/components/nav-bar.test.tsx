import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// NavBar reads the session client-side via next-auth's useSession and the cart
// via useCart. The web test harness runs in a node environment (no jsdom), so we
// static-render and drive the session per test. The open/close *interaction*
// (click / Escape / backdrop) needs a DOM and is covered by live preview smoke,
// not here — these tests pin the auth-state gating and the closed initial state.
const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn<() => { data: unknown }>(),
}))
vi.mock("next-auth/react", () => ({ useSession: () => useSessionMock() }))
vi.mock("@/lib/cart", () => ({ useCart: () => ({ itemCount: 0, hydrated: false }) }))

import { NavBar } from "@/components/nav-bar"

function render(session: unknown) {
  useSessionMock.mockReturnValue({ data: session })
  return renderToStaticMarkup(<NavBar />)
}

describe("NavBar auth gating", () => {
  it("logged out → Sign in, never Account or the seller dashboard", () => {
    const html = render(null)
    expect(html).toContain('href="/auth/sign-in"')
    expect(html).not.toContain('href="/account"')
    expect(html).not.toContain('href="/seller/dashboard"')
  })

  it("buyer → Account, but never the seller dashboard link", () => {
    const html = render({ user: { role: "buyer" } })
    expect(html).toContain('href="/account"')
    expect(html).not.toContain('href="/seller/dashboard"')
    expect(html).not.toContain('href="/auth/sign-in"')
  })

  it("seller_owner → seller dashboard link plus Account", () => {
    const html = render({ user: { role: "seller_owner" } })
    expect(html).toContain('href="/seller/dashboard"')
    expect(html).toContain('href="/account"')
  })
})

describe("NavBar responsive structure", () => {
  it("exposes a hamburger trigger wired to the mobile panel", () => {
    const html = render(null)
    expect(html).toContain('id="mobile-menu"')
    expect(html).toContain('aria-controls="mobile-menu"')
    expect(html).toContain('aria-label="Open menu"')
    expect(html).toContain('aria-expanded="false"')
  })

  it("keeps a desktop-only row and a mobile-only panel that is inert when closed", () => {
    const html = render(null)
    expect(html).toContain("hidden items-center gap-4 md:flex") // desktop row
    expect(html).toContain("md:hidden") // mobile-only blocks
    expect(html).toContain('inert=""') // closed panel removed from a11y tree + tab order
  })

  it("always exposes the public links (Products, Membership, Sell with us)", () => {
    const html = render(null)
    expect(html).toContain('href="/products"')
    expect(html).toContain('href="/membership"')
    expect(html).toContain('href="/seller/apply"')
  })
})
