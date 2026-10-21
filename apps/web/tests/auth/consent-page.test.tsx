// @vitest-environment jsdom
// R5c-2: what /auth/consent renders and when it redirects, pinned on the old markup first.
// The consent actions are not touched. Looks are asserted in the "R5c look" block added later.
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock("@/auth", () => ({ auth }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock("@/app/auth/consent/consent-actions", () => ({
  ConsentActions: () => <div data-testid="consent-actions" />,
}))

import ConsentPage from "@/app/auth/consent/page"

async function render() {
  const el = await ConsentPage()
  return new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")
}

beforeEach(() => {
  auth.mockReset()
})

describe("consent page: redirects", () => {
  it("signed out goes to sign-in", async () => {
    auth.mockResolvedValue(null)
    await expect(ConsentPage()).rejects.toThrow("REDIRECT:/auth/sign-in")
  })

  it("already consented to the current version goes home", async () => {
    auth.mockResolvedValue({ user: { consentVersion: "v2", currentTosVersion: "v2" } })
    await expect(ConsentPage()).rejects.toThrow("REDIRECT:/")
  })
})

describe("consent page: content", () => {
  it("shows the version, the two links in new tabs and the actions", async () => {
    auth.mockResolvedValue({ user: { consentVersion: "v1", currentTosVersion: "v2" } })
    const d = await render()
    expect(d.querySelector("h1")!.textContent).toBe("Before you continue")
    expect(d.body.textContent).toContain(
      "Please review and accept our updated Terms of Service and Privacy Policy (version v2) to use BOMY.",
    )
    expect(d.body.textContent).toContain(
      "By clicking I Agree, you confirm you have read and accept our",
    )
    const terms = d.querySelector('a[href="/terms"]')!
    const privacy = d.querySelector('a[href="/privacy"]')!
    expect(terms.getAttribute("target")).toBe("_blank")
    expect(privacy.getAttribute("target")).toBe("_blank")
    expect(d.querySelector('[data-testid="consent-actions"]')).not.toBeNull()
  })

  it("falls back to the word 'current' when no version is known", async () => {
    auth.mockResolvedValue({ user: { consentVersion: null, currentTosVersion: null } })
    const d = await render()
    expect(d.body.textContent).toContain("(version current)")
  })
})

const MAIN_MIN_H = "min-h-[calc(100dvh-var(--nav-height)-var(--nav-offset))]"

describe("consent page: R5c look", () => {
  it("main fills the viewport below the nav on the page ground and centres the card", async () => {
    auth.mockResolvedValue({ user: { consentVersion: "v1", currentTosVersion: "v2" } })
    const d = await render()
    const main = d.querySelector("main")!
    for (const t of [MAIN_MIN_H, "flex", "items-center", "justify-center", "px-4", "py-10"])
      expect(main.classList.contains(t), `${t} on ${main.className}`).toBe(true)
    for (const t of ["min-h-screen", "bg-muted"]) expect(main.classList.contains(t)).toBe(false)
  })

  it("the card is a white bento card with a border; the title keeps its size", async () => {
    auth.mockResolvedValue({ user: { consentVersion: "v1", currentTosVersion: "v2" } })
    const d = await render()
    const card = d.querySelector("main > div")!
    for (const t of [
      "w-full",
      "max-w-lg",
      "rounded-bento",
      "border",
      "border-border",
      "bg-card",
      "shadow-sm",
      "p-8",
    ])
      expect(card.classList.contains(t), `${t} on ${card.className}`).toBe(true)
    for (const t of ["ring-1", "bg-background", "rounded-2xl"])
      expect(card.classList.contains(t)).toBe(false)
    expect(d.querySelector("h1")!.classList.contains("text-2xl")).toBe(true)
  })
})
