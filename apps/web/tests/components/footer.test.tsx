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

  // The business identity is locked (Inflo Vision, SSM, contact, Penang address). R2 changes layout
  // and type only, never these values.
  it("keeps the locked business identity text", () => {
    for (const s of [
      "BOMY by Inflo Vision (202503276795)",
      "contact@brandsofmalaysia.com",
      "19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang.",
      "© 2026 BOMY. All rights reserved.",
    ])
      expect(html).toContain(s)
  })

  describe("dark ink card (soft-red R2, Kvist parity)", () => {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const card = doc.querySelector("footer > div")!

    it("is a rounded card on the page ground, on the fixed dark ink surface", () => {
      for (const t of [
        "rounded-bento",
        "bg-ink",
        "text-ink-foreground",
        "overflow-hidden",
        "mx-auto",
      ])
        expect(card.classList.contains(t), t).toBe(true)
      expect(doc.querySelector("footer")!.classList.contains("bg-muted")).toBe(false)
    })

    it("the group labels are mono, upper case and muted-ink", () => {
      const labels = Array.from(doc.querySelectorAll("footer p")).filter((p) =>
        ["Quick Links", "Policies"].includes(p.textContent.trim()),
      )
      expect(labels).toHaveLength(2)
      for (const l of labels)
        for (const t of ["font-mono", "uppercase", "text-xs", "text-ink-muted"])
          expect(l.classList.contains(t), t).toBe(true)
    })

    it("has one giant decorative BOMY wordmark, hidden from screen readers", () => {
      const marks = Array.from(doc.querySelectorAll('footer [aria-hidden="true"]')).filter(
        (e) => e.textContent.trim() === "BOMY",
      )
      expect(marks).toHaveLength(1)
      for (const t of ["font-display", "font-bold", "overflow-hidden", "select-none"])
        expect(marks[0]!.classList.contains(t), t).toBe(true)
    })

    it("has a divider and the copyright row below the wordmark", () => {
      const html2 = doc.querySelector("footer")!.innerHTML
      expect(html2.indexOf('aria-hidden="true"')).toBeLessThan(html2.indexOf("© 2026 BOMY"))
      expect(doc.querySelector("footer .border-t")).not.toBeNull()
    })

    it("uses tokens only: no literal palette colour", () => {
      expect(html).not.toMatch(
        /\b(?:bg|text|border|ring)-(?:gray|slate|zinc|neutral|stone|black|white)\b/,
      )
    })
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
      "text-ink-muted",
      "hover:text-ink-foreground",
      "hover:underline",
      "focus-visible:ring-2",
      "focus-visible:ring-ink-foreground",
    ]
    const LIST_TOKENS = ["mt-2", "-mb-1"]

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
