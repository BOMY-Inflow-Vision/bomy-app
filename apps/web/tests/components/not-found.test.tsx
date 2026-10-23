import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import NotFound from "@/app/not-found"

describe("NotFound", () => {
  it("renders one h1, the approved text and a way back home", () => {
    const html = renderToStaticMarkup(<NotFound />)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain("Page not found")
    expect(html).toContain(
      "We could not find that page. It may have moved, or the store may be closed for now.",
    )
    expect(html).toContain('href="/"')
    expect(html).toContain("Back to home")
  })
})
