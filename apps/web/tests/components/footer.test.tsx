// @vitest-environment jsdom
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

  describe("internal links and tap targets (PR 5d-10)", () => {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const INTERNAL = [
      ["/about", "About BOMY"],
      ["/contact", "Contact"],
      ["/terms", "Terms of Service"],
      ["/privacy", "Privacy Policy"],
      ["/refund", "Refund and Return"],
      ["/shipping", "Shipping and Delivery"],
    ] as const
    // Class tokens on the six links and the two lists. The swap task updates these (and only these).
    const LINK_TOKENS = [
      "inline-block",
      "rounded-sm",
      "py-1",
      "hover:text-foreground",
      "hover:underline",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    ]
    const LIST_TOKENS = ["mt-2", "-mb-2"]

    it.each(INTERNAL)("%s keeps its label", (href, label) => {
      const a = doc.querySelector(`a[href="${href}"]`)!
      expect(a.textContent.trim()).toBe(label)
      for (const t of LINK_TOKENS) expect(a.classList.contains(t), t).toBe(true)
    })

    it("lists exactly the six internal links plus the mailto", () => {
      const hrefs = Array.from(doc.querySelectorAll("footer a")).map((a) => a.getAttribute("href"))
      expect(hrefs).toEqual(["mailto:contact@brandsofmalaysia.com", ...INTERNAL.map(([h]) => h)])
    })

    it("the lists carry their spacing tokens", () => {
      const lists = Array.from(doc.querySelectorAll("footer ul"))
      expect(lists).toHaveLength(2)
      for (const ul of lists)
        for (const t of LIST_TOKENS) expect(ul.classList.contains(t), t).toBe(true)
    })
  })
})
