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

function Icon() {
  return <svg data-testid="icon" />
}

describe("Button icon slide", () => {
  it("renders the plain button unchanged when no icon is given", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>)
    expect(html).not.toContain("group/slide")
    expect(html).not.toContain("lucide-arrow-right")
    expect(html).toContain(">Save</button>")
  })

  it("adds the slide effect: leading icon, label, hidden arrow and pill shape", () => {
    const html = renderToStaticMarkup(<Button icon={<Icon />}>Save</Button>)
    expect(html).toMatch(/^<button[^>]*class="[^"]*group\/slide/)
    expect(html).toContain("rounded-full")
    expect(html).toContain('data-testid="icon"')
    expect(html).toContain("lucide-arrow-right")
    expect(html).toContain('<span class="shrink-0 whitespace-nowrap">Save</span>')
  })

  it("keeps the icon and pill but drops the arrow when arrowOnHover is false", () => {
    const html = renderToStaticMarkup(
      <Button icon={<Icon />} arrowOnHover={false}>
        Back
      </Button>,
    )
    expect(html).toContain('data-testid="icon"')
    expect(html).toContain("rounded-full")
    expect(html).not.toContain("lucide-arrow-right")
    expect(html).not.toContain("group/slide")
  })

  it("wraps an asChild link's own content so the link stays the root element", () => {
    const html = renderToStaticMarkup(
      <Button asChild icon={<Icon />}>
        <a href="/products">Browse products</a>
      </Button>,
    )
    expect(html).toMatch(/^<a[^>]*href="\/products"/)
    expect(html).toMatch(/^<a[^>]*class="[^"]*group\/slide/)
    expect(html).toContain('<span class="shrink-0 whitespace-nowrap">Browse products</span>')
    expect(html).toContain("lucide-arrow-right")
  })

  it("lets call-site classes override the slide defaults", () => {
    const html = renderToStaticMarkup(
      <Button icon={<Icon />} className="w-full px-6">
        Go
      </Button>,
    )
    const rootClass = /^<button[^>]*class="([^"]*)"/.exec(html)?.[1] ?? ""
    expect(rootClass.split(" ")).toEqual(expect.arrayContaining(["w-full", "px-6"]))
    expect(rootClass.split(" ")).not.toContain("px-1")
  })

  it("ignores the icon prop on icon-size buttons", () => {
    const html = renderToStaticMarkup(
      <Button size="icon" icon={<Icon />} aria-label="Close">
        ×
      </Button>,
    )
    expect(html).not.toContain("group/slide")
    expect(html).not.toContain('data-testid="icon"')
  })
})
