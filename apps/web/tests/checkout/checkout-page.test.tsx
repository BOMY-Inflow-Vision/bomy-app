// @vitest-environment jsdom
// R5c-1: gating and structure of /checkout, pinned on the old markup first. The form itself is
// mocked (its callouts have their own test); looks are asserted in the "R5c look" block added later.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { auth, readCheckoutEnabled, listAddresses } = vi.hoisted(() => ({
  auth: vi.fn(),
  readCheckoutEnabled: vi.fn(),
  listAddresses: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock("@/app/checkout/actions", () => ({ readCheckoutEnabled }))
vi.mock("@/app/account/addresses/actions", () => ({ listAddresses }))
vi.mock("@/app/checkout/_form", () => ({
  CheckoutForm: (p: { savedAddresses: { id: string; line1: string }[] }) => (
    <div
      data-testid="form"
      data-addresses={p.savedAddresses.map((a) => a.id + ":" + a.line1).join("|")}
    />
  ),
}))

import CheckoutPage from "@/app/checkout/page"

const ADDRESS = {
  id: "a1",
  label: "Home",
  recipientName: "Ann",
  phone: "0123",
  line1: "1 Main St",
  line2: null,
  city: "KL",
  postcode: "50000",
  state: "Kuala Lumpur",
  isDefault: true,
  extra: "dropped",
}

async function render() {
  const el = await CheckoutPage()
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}

beforeEach(() => {
  auth.mockReset()
  readCheckoutEnabled.mockReset()
  listAddresses.mockReset()
})

describe("CheckoutPage gating and structure", () => {
  it("signed out redirects to sign-in with the checkout callback", async () => {
    auth.mockResolvedValue(null)
    await expect(CheckoutPage()).rejects.toThrow("REDIRECT:/auth/sign-in?callbackUrl=/checkout")
  })

  it("a stale session (missing audit actor) redirects to sign-in too", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } })
    readCheckoutEnabled.mockRejectedValue({
      code: "23503",
      constraint_name: "admin_bypass_audit_actor_user_id_fkey",
    })
    await expect(CheckoutPage()).rejects.toThrow("REDIRECT:/auth/sign-in?callbackUrl=/checkout")
  })

  it("disabled shows the paused text and no form", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } })
    readCheckoutEnabled.mockResolvedValue(false)
    const d = await render()
    expect(d.querySelector("h1")!.textContent).toBe("Checkout")
    expect(d.body.textContent).toContain("Checkout is paused. We'll let you know when it's back.")
    expect(d.querySelector('[data-testid="form"]')).toBeNull()
    expect(listAddresses).not.toHaveBeenCalled()
  })

  it("enabled shows the stepper at step 1 and the form with the mapped saved addresses", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } })
    readCheckoutEnabled.mockResolvedValue(true)
    listAddresses.mockResolvedValue([ADDRESS])
    const d = await render()
    expect(d.querySelector("h1")!.textContent).toBe("Checkout")
    const stepper = d.querySelector('[role="group"][aria-label="Checkout progress"]')!
    expect(stepper).not.toBeNull()
    expect(stepper.querySelector('[aria-current="step"]')!.textContent).toContain("2")
    expect(d.querySelector('[data-testid="form"]')!.getAttribute("data-addresses")).toBe(
      "a1:1 Main St",
    )
  })
})

const has = (el: Element | null, tokens: string[]) => {
  expect(el, tokens.join(" ")).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("CheckoutPage R5c look", () => {
  it("the paused page: PageHeading title and a bento dashed card", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } })
    readCheckoutEnabled.mockResolvedValue(false)
    const d = await render()
    has(d.querySelector("h1"), ["sm:text-4xl", "[overflow-wrap:anywhere]"])
    has(d.querySelector("h1")!.parentElement, ["mb-4"])
    const card = d.querySelector("main > div")!
    has(card, [
      "rounded-bento",
      "border",
      "border-dashed",
      "border-input",
      "bg-card",
      "p-6",
      "text-center",
    ])
    expect(card.classList.contains("bg-muted")).toBe(false)
  })

  it("the enabled page: PageHeading title above the stepper", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } })
    readCheckoutEnabled.mockResolvedValue(true)
    listAddresses.mockResolvedValue([ADDRESS])
    const d = await render()
    has(d.querySelector("h1"), ["sm:text-4xl"])
    has(d.querySelector("h1")!.parentElement, ["mb-4"])
    expect(d.querySelector('[role="group"][aria-label="Checkout progress"]')).not.toBeNull()
  })
})
