import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"

describe("status variants", () => {
  it.each([
    ["success", "bg-success-subtle", "text-success"],
    ["warning", "bg-warning-subtle", "text-warning"],
    ["info", "bg-info-subtle", "text-info"],
  ] as const)("Badge %s uses its subtle tint and text token", (variant, bg, text) => {
    const html = renderToStaticMarkup(<Badge variant={variant}>x</Badge>)
    expect(html).toContain(bg)
    expect(html).toContain(text)
  })

  it("Badge muted is the neutral status pill: muted fill and muted text, no border colour", () => {
    const html = renderToStaticMarkup(<Badge variant="muted">x</Badge>)
    expect(html).toContain("bg-muted")
    expect(html).toContain("text-muted-foreground")
    expect(html).toContain("border-transparent")
    expect(html).not.toContain("text-foreground")
  })

  it("Badge destructive-subtle is a 10% red tint with destructive text, not the solid fill", () => {
    const html = renderToStaticMarkup(<Badge variant="destructive-subtle">x</Badge>)
    expect(html).toContain("bg-destructive/10")
    expect(html).toContain("text-destructive")
    expect(html).toContain("border-transparent")
    expect(html).not.toContain("text-destructive-foreground")
  })

  it.each([
    ["success", "bg-success", "text-success-foreground"],
    ["warning", "bg-warning", "text-warning-foreground"],
  ] as const)(
    "Button %s is a solid fill with its foreground and a brightness hover",
    (variant, bg, fg) => {
      const html = renderToStaticMarkup(<Button variant={variant}>x</Button>)
      expect(html).toContain(bg)
      expect(html).toContain(fg)
      expect(html).toContain("hover:brightness-90")
      expect(html).not.toMatch(/\b(?:bg|text)-(?:green|amber|emerald|yellow|blue)-/)
    },
  )
})
