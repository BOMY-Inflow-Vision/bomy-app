// @vitest-environment jsdom
//
// "Memberships will reopen soon" notice on /membership (PR 5d-9, man-t01). Written first against the
// hand-made div (baseline); after the swap to a disabled Button only the TOKENS / element assertions change.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ enabled: false, session: null as unknown }))

vi.mock("@/auth", () => ({ auth: () => Promise.resolve(state.session) }))
vi.mock("@/lib/payments-enabled", () => ({ paymentsEnabled: () => state.enabled }))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/membership", () => ({ isPendingAbandoned: () => false }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@/app/(marketing)/membership/actions", () => ({ joinMembership: () => {} }))
vi.mock("@/components/submit-button", () => ({
  SubmitButton: ({ children }: { children: React.ReactNode }) => (
    <button type="submit">{children}</button>
  ),
}))
// The page reads the price through withAdmin(...) and the member's row through withTenant(...).
vi.mock("@bomy/db", () => {
  const table = new Proxy({}, { get: (_t, k) => String(k) })
  return {
    schema: { platformConfig: table, memberSubscriptions: table },
    withAdmin: (_db: unknown, _ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({ from: () => ({ where: () => ({ limit: () => [{ value: 7500 }] }) }) }),
      }),
    withTenant: (_db: unknown, _ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
      }),
  }
})

import MembershipPage from "@/app/(marketing)/membership/page"

// Class tokens the notice carries. The swap task updates these (and only these).
const TOKENS = [
  "w-full",
  "rounded-xl",
  "bg-muted",
  "px-6",
  "py-3",
  "text-sm",
  "font-semibold",
  "text-muted-foreground",
  "text-center",
  "cursor-not-allowed",
]

async function render() {
  const el = await MembershipPage()
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}
const notice = (doc: Document) =>
  Array.from(doc.querySelectorAll("*")).find(
    (e) => e.children.length === 0 && e.textContent === "Memberships will reopen soon",
  )!

beforeEach(() => {
  state.enabled = false
  state.session = null
})

describe("membership closed notice", () => {
  it("shows the notice inside a status region when payments are off", async () => {
    const doc = await render()
    const el = notice(doc)
    expect(el).toBeDefined()
    expect(el.closest('[role="status"]')).not.toBeNull()
  })

  it("is not a link and not a join control", async () => {
    const doc = await render()
    expect(doc.body.textContent).not.toContain("Join now")
    expect(doc.body.textContent).not.toContain("Sign in to join")
    expect(notice(doc).closest("a")).toBeNull()
    expect(notice(doc).closest("form")).toBeNull()
  })

  it("is absent when payments are on (signed out shows the sign-in link)", async () => {
    state.enabled = true
    const doc = await render()
    expect(doc.body.textContent).not.toContain("Memberships will reopen soon")
    expect(doc.body.textContent).toContain("Sign in to join — RM75/yr")
  })

  it("class tokens (updated by the swap)", async () => {
    const el = notice(await render())
    for (const t of TOKENS) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
  })
})
