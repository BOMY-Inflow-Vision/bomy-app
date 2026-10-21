// @vitest-environment jsdom
//
// verify-request page (PR 5d-10, man-a1..a4). Written first against the hand-made box, inline svg
// and plain <a> (baseline); after the swap (Card, lucide Mail, next/link) only the TOKENS expectations change.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import VerifyRequestPage from "@/app/auth/verify-request/page"

const doc = new DOMParser().parseFromString(
  renderToStaticMarkup(<VerifyRequestPage />),
  "text/html",
)

// Class tokens the box and link carry. The swap task updates these (and only these).
const TOKENS = {
  box: [
    "w-full",
    "max-w-sm",
    // Card carries rounded-card and the class merge does not know rounded-bento, so the 28 px bento
    // corner needs the important modifier to win (checked in the browser: 28px, not 12px).
    "!rounded-bento",
    "border",
    "border-border",
    "bg-card",
    "text-center",
    "shadow-sm",
  ],
  link: [
    "underline",
    "underline-offset-4",
    "hover:text-foreground",
    "focus-visible:ring-2",
    "focus-visible:ring-ring",
  ],
}

function has(el: Element | null, tokens: string[]) {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("verify-request page", () => {
  it("keeps the words", () => {
    expect(doc.querySelector("h1")!.textContent).toBe("Check your email")
    const text = doc.body.textContent
    expect(text).toContain(
      "A sign-in link has been sent to your email address. The link expires in 24 hours.",
    )
    expect(text).toContain("Didn't receive it? Check your spam folder, or try again.")
  })

  it("the try-again link goes to /auth/sign-in", () => {
    const link = doc.querySelector("a")!
    expect(link.textContent).toBe("try again")
    expect(link.getAttribute("href")).toBe("/auth/sign-in")
    expect(doc.querySelectorAll("a")).toHaveLength(1)
  })

  it("the icon is decorative and sits in a 48 px round medallion", () => {
    const svg = doc.querySelector("svg")!
    expect(svg.getAttribute("aria-hidden")).toBe("true")
    const medallion = svg.parentElement!
    has(medallion, ["h-12", "w-12", "rounded-full", "bg-muted"])
  })

  it("R5c look: main fills the viewport below the nav on the page ground and centres the card", () => {
    const main = doc.querySelector("main")!
    for (const t of [
      "min-h-[calc(100dvh-var(--nav-height)-var(--nav-offset))]",
      "flex",
      "items-center",
      "justify-center",
      "px-4",
      "py-10",
    ])
      expect(main.classList.contains(t), `${t} on ${main.className}`).toBe(true)
    for (const t of ["min-h-screen", "bg-muted"]) expect(main.classList.contains(t)).toBe(false)
    expect(doc.querySelector("main > div")!.classList.contains("bg-background")).toBe(false)
  })

  it("class tokens (updated by the swap)", () => {
    has(doc.querySelector("main > div"), TOKENS.box)
    has(doc.querySelector("main > div > div"), ["p-8"])
    has(doc.querySelector("a"), TOKENS.link)
  })
})
