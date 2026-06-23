import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Footer } from "@/components/footer"

describe("Footer", () => {
  const html = renderToStaticMarkup(<Footer />)

  it("renders the four policy links", () => {
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/refund"')
    expect(html).toContain('href="/shipping"')
  })

  it("renders the quick links (About + Contact)", () => {
    expect(html).toContain('href="/about"')
    expect(html).toContain('href="/contact"')
  })

  it("renders brand block + business identity + copyright", () => {
    expect(html).toContain("BOMY")
    expect(html).toContain("A curated Malaysian multivendor marketplace.")
    expect(html).toContain("BOMY by Inflo Vision (202503276795)")
    expect(html).toContain("© 2026 BOMY. All rights reserved.")
  })
})
