// @vitest-environment jsdom
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { RatingRow } from "@/components/rating-row"

describe("RatingRow", () => {
  it("shows a muted zero state", () => {
    const html = renderToStaticMarkup(<RatingRow avg="0.00" count={0} />)
    expect(html.replace(/<[^>]+>/g, "")).toContain("★ 0 (0)")
    expect(html).toContain("text-muted-foreground")
    expect(html).toContain("Not rated yet")
  })
  it("shows average and count", () => {
    const html = renderToStaticMarkup(<RatingRow avg="4.60" count={23} className="mt-1" />)
    expect(html.replace(/<[^>]+>/g, "")).toContain("★ 4.6 (23)")
    expect(html).not.toContain("text-muted-foreground")
    expect(html).toContain("Rated 4.6 out of 5 from 23 ratings")
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain("mt-1")
  })
})
