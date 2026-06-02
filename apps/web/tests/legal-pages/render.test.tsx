import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import ContactPage from "@/app/contact/page"
import PrivacyPage from "@/app/privacy/page"
import RefundPage from "@/app/refund/page"
import ShippingPage from "@/app/shipping/page"
import TermsPage from "@/app/terms/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
  { name: "Refund", Page: RefundPage, title: "Refund and Return Policy" },
  { name: "Shipping", Page: ShippingPage, title: "Shipping and Delivery Policy" },
  { name: "Contact", Page: ContactPage, title: "Contact Us" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })

  it("has no unfilled [PLACEHOLDER: ...] markers", () => {
    expect(html).not.toContain("[PLACEHOLDER:")
  })
})
