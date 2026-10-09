import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "@bomy/ui/button"

describe("Button slide wrapper", () => {
  it("clips the parked arrow on the x axis only", () => {
    const html = renderToStaticMarkup(<Button icon={<span>i</span>}>Go</Button>)
    expect(html).toContain("overflow-x-clip")
    // y must stay visible: clipping it cut text descenders (see the comment in button.tsx)
    expect(html).not.toMatch(/\boverflow-(hidden|clip)\b/)
  })
})
