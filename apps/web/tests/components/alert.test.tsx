import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Alert } from "@bomy/ui/alert"

function tokens(html: string): string[] {
  const m = html.match(/class="([^"]*)"/)
  if (!m) throw new Error("no class attribute")
  return m[1]!.split(/\s+/)
}

describe("Alert", () => {
  it.each([
    ["success", ["border-success/30", "bg-success-subtle", "text-success"]],
    ["warning", ["border-warning/30", "bg-warning-subtle", "text-warning"]],
    ["info", ["border-info/30", "bg-info-subtle", "text-info"]],
    ["destructive", ["border-destructive/30", "bg-destructive/10", "text-destructive"]],
  ] as const)("%s renders its three colour tokens on the shared base", (variant, expected) => {
    const t = tokens(renderToStaticMarkup(<Alert variant={variant}>x</Alert>))
    expect(t).toEqual(expect.arrayContaining(["rounded-lg", "border", "p-4", ...expected]))
  })

  it("defaults to info", () => {
    const t = tokens(renderToStaticMarkup(<Alert>x</Alert>))
    expect(t).toEqual(expect.arrayContaining(["bg-info-subtle", "text-info"]))
  })

  it("has no role and no aria-live by default", () => {
    const html = renderToStaticMarkup(<Alert variant="destructive">x</Alert>)
    expect(html).not.toMatch(/\brole=/)
    expect(html).not.toMatch(/\baria-live=/)
  })

  it("passes role and aria-live through when a call site asks for them", () => {
    const html = renderToStaticMarkup(
      <Alert role="alert" aria-live="polite">
        x
      </Alert>,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="polite"')
  })

  it("lets className override padding and radius", () => {
    const t = tokens(
      renderToStaticMarkup(
        <Alert variant="warning" className="p-3 rounded-xl">
          x
        </Alert>,
      ),
    )
    expect(t).toContain("p-3")
    expect(t).toContain("rounded-xl")
    expect(t).not.toContain("p-4")
    expect(t).not.toContain("rounded-lg")
  })

  it("forwards id, data attributes and children", () => {
    const html = renderToStaticMarkup(
      <Alert id="a1" data-x="y">
        <b>hi</b>
      </Alert>,
    )
    expect(html).toContain('id="a1"')
    expect(html).toContain('data-x="y"')
    expect(html).toContain("<b>hi</b>")
  })
})
