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
