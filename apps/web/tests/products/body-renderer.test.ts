import type React from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

// renderBodyHtml is a pure function extracted from BodyRenderer for unit-testing.
// It accepts HTML string and returns a React node.
import { renderBodyHtml } from "../../src/app/products/[storeSlug]/[productSlug]/body-renderer"

describe("renderBodyHtml", () => {
  it("renders allowlisted elements", () => {
    const html = "<p>Hello <strong>world</strong></p>"
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).toContain("<p>")
    expect(output).toContain("<strong>")
  })

  it("discards unknown tags but preserves children", () => {
    const html = "<div><p>inside</p></div>"
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).not.toContain("<div")
    expect(output).toContain("<p>inside</p>")
  })

  it("rejects <a href=javascript:>", () => {
    const html = '<a href="javascript:alert(1)">click</a>'
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).not.toContain("javascript:")
    // link text preserved via children fallback
    expect(output).toContain("click")
  })

  it("rejects <img src=http:> (non-HTTPS)", () => {
    const html = '<img src="http://example.com/img.jpg" alt="test" />'
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).not.toContain("<img")
  })

  it("renders valid https img with lazy loading", () => {
    const html = '<img src="https://example.com/img.jpg" alt="test" />'
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).toContain('loading="lazy"')
    expect(output).toContain('decoding="async"')
  })

  it("wraps <table> in overflow-x-auto container", () => {
    const html = "<table><tr><td>cell</td></tr></table>"
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).toContain("overflow-x-auto")
    expect(output).toContain("<table")
  })

  it("renders <figure data-video-provider=youtube> as VideoEmbed placeholder", () => {
    const html =
      '<figure data-video-provider="youtube" data-video-id="dQw4w9WgXcQ" data-video-title="Never gonna give you up"></figure>'
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    // VideoEmbed renders a click-to-load placeholder — check for videoId presence
    expect(output).toContain("dQw4w9WgXcQ")
  })

  it("discards <figure> with invalid video ID", () => {
    const html = '<figure data-video-provider="youtube" data-video-id="invalid!!! id"></figure>'
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).not.toContain("figure")
    expect(output).not.toContain("invalid")
  })

  it("strips disallowed attributes from known tags", () => {
    const html = '<p class="evil" style="color:red">text</p>'
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).not.toContain("class=")
    expect(output).not.toContain("style=")
    expect(output).toContain("text")
  })

  it("decodes HTML entities in text nodes", () => {
    const html = "<p>A &amp; B &lt;em&gt;</p>"
    const output = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(output).toContain("A &amp; B &lt;em&gt;")
    expect(output).not.toContain("&amp;amp;")
  })
})
