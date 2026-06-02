import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { LegalPageLayout } from "@/components/legal-page-layout"

describe("LegalPageLayout", () => {
  it("renders title, intro, and lastUpdated when provided", () => {
    const html = renderToStaticMarkup(
      <LegalPageLayout title="Test Policy" intro="A short summary." lastUpdated="June 1, 2026">
        <p>Body content.</p>
      </LegalPageLayout>,
    )
    expect(html).toContain("Test Policy")
    expect(html).toContain("A short summary.")
    expect(html).toContain("Last updated: June 1, 2026")
  })

  it("omits the Last updated line when lastUpdated is not provided", () => {
    const html = renderToStaticMarkup(
      <LegalPageLayout title="Test Policy" intro="A short summary.">
        <p>Body content.</p>
      </LegalPageLayout>,
    )
    expect(html).toContain("Test Policy")
    expect(html).not.toContain("Last updated:")
  })

  it("renders children content", () => {
    const html = renderToStaticMarkup(
      <LegalPageLayout title="Test Policy" intro="A short summary.">
        <p>Body content here.</p>
        <p>Second paragraph.</p>
      </LegalPageLayout>,
    )
    expect(html).toContain("Body content here.")
    expect(html).toContain("Second paragraph.")
  })
})
