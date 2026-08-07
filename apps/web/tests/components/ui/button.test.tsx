import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"

describe("Button reward variant", () => {
  it("renders with the reward background/foreground classes", () => {
    const html = renderToStaticMarkup(<Button variant="reward">Join now</Button>)
    expect(html).toContain("bg-reward")
    expect(html).toContain("text-reward-foreground")
  })

  it("still renders the default variant unchanged", () => {
    const html = renderToStaticMarkup(<Button>Continue</Button>)
    expect(html).toContain("bg-primary")
    expect(html).toContain("text-primary-foreground")
  })
})
