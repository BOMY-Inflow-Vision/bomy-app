import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import TermsPage from "@/app/terms/page"

const cases = [{ name: "Terms", Page: TermsPage, title: "Terms of Service" }]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })
})
