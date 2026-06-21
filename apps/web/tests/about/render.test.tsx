import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import AboutPage from "@/app/about/page"

describe("About page", () => {
  const html = renderToStaticMarkup(<AboutPage />)

  it("renders the hero headline in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain("The home of authentic Malaysian brands.")
  })

  it("renders the three 'how it works' pillars", () => {
    expect(html).toContain("A curated marketplace")
    expect(html).toContain("Membership &amp; community")
    expect(html).toContain("Shop with purpose")
  })

  it("points the shopper CTA at /products and the brand CTA at /seller/apply", () => {
    expect(html).toContain('href="/products"')
    expect(html).toContain('href="/seller/apply"')
  })

  it("never links to the non-existent /brands index", () => {
    expect(html).not.toContain('href="/brands"')
  })

  it("does not describe the unbuilt egg/mascot gamification", () => {
    expect(html).not.toContain("Hatch")
    expect(html).not.toContain("mascot")
  })

  it("does not use the unapproved 'BOMY Insider' name", () => {
    expect(html).not.toContain("BOMY Insider")
  })

  it("does not imply live ordering while checkout is paused", () => {
    expect(html).not.toContain("Every order")
    expect(html).not.toContain("when you buy")
  })

  it("does not name the legal entity in body copy", () => {
    expect(html).not.toContain("Inflo Vision")
  })

  it("has no unfilled [PLACEHOLDER: ...] markers", () => {
    expect(html).not.toContain("[PLACEHOLDER:")
  })
})
