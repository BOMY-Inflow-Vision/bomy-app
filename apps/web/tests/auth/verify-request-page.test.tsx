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
    "rounded-card",
    "border",
    "border-border",
    "bg-background",
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

  it("class tokens (updated by the swap)", () => {
    has(doc.querySelector("main > div"), TOKENS.box)
    has(doc.querySelector("main > div > div"), ["p-8"])
    has(doc.querySelector("a"), TOKENS.link)
  })
})
