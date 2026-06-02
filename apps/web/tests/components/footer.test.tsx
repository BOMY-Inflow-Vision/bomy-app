import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Footer } from "@/components/footer"

describe("Footer", () => {
  const html = renderToStaticMarkup(<Footer />)

  it("renders all 5 policy links", () => {
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/refund"')
    expect(html).toContain('href="/shipping"')
    expect(html).toContain('href="/contact"')
  })

  it("renders brand block + business identity + copyright", () => {
    expect(html).toContain("BOMY")
    expect(html).toContain("A curated Malaysian multivendor marketplace.")
    expect(html).toContain("Operated by Inflo Vision (Partnership), Malaysia.")
    expect(html).toContain("© 2026 Inflo Vision. All rights reserved.")
  })
})
