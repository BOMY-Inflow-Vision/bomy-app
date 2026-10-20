// @vitest-environment jsdom
import React from "react"
import Link from "next/link"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { FilterPill, FilterPills } from "@/components/filter-pill"

function classes(html: string): string[] {
  const m = html.match(/class="([^"]*)"/)
  if (!m) throw new Error("no class attribute")
  return m[1]!.split(/\s+/)
}

describe("FilterPill", () => {
  it("base: round, 44 px tall, focus ring, long text may break anywhere", () => {
    const c = classes(renderToStaticMarkup(<FilterPill href="/x">x</FilterPill>))
    expect(c).toEqual(
      expect.arrayContaining([
        "inline-flex",
        "min-h-11",
        "max-w-full",
        "rounded-full",
        "px-4",
        "text-sm",
        "font-medium",
        "[overflow-wrap:anywhere]",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
      ]),
    )
  })

  it("active is inverse (bg-foreground, text-background); inactive is muted with a card hover", () => {
    const on = classes(
      renderToStaticMarkup(
        <FilterPill active href="/x">
          x
        </FilterPill>,
      ),
    )
    const off = classes(renderToStaticMarkup(<FilterPill href="/x">x</FilterPill>))
    expect(on).toEqual(expect.arrayContaining(["bg-foreground", "text-background"]))
    expect(off).toEqual(
      expect.arrayContaining(["text-muted-foreground", "hover:bg-card", "hover:text-foreground"]),
    )
    expect(on).not.toContain("text-muted-foreground")
    expect(off).not.toContain("bg-foreground")
  })

  it("sets aria-current only on the active pill", () => {
    expect(
      renderToStaticMarkup(
        <FilterPill active href="/x">
          x
        </FilterPill>,
      ),
    ).toContain('aria-current="page"')
    expect(renderToStaticMarkup(<FilterPill href="/x">x</FilterPill>)).not.toContain("aria-current")
  })

  it("asChild puts classes and aria-current on the child and keeps its href", () => {
    const html = renderToStaticMarkup(
      <FilterPill active asChild>
        <Link href="/products?category=c1">Tea</Link>
      </FilterPill>,
    )
    expect(html).toContain('href="/products?category=c1"')
    expect(html).toContain('aria-current="page"')
    expect(classes(html)).toContain("rounded-full")
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it("className merges after the base (px-2 replaces px-4)", () => {
    const c = classes(
      renderToStaticMarkup(
        <FilterPill className="px-2" href="/x">
          x
        </FilterPill>,
      ),
    )
    expect(c).toContain("px-2")
    expect(c).not.toContain("px-4")
  })
})

describe("FilterPills", () => {
  const html = renderToStaticMarkup(
    <FilterPills label="Filter by category" className="mb-4">
      <FilterPill href="/x">x</FilterPill>
    </FilterPills>,
  )
  it("is a labelled nav, not an ARIA tab widget", () => {
    expect(html).toMatch(/^<nav aria-label="Filter by category"/)
    expect(html).not.toContain('role="tab')
    expect(html).not.toContain("tablist")
  })
  it("is a wrapping rounded tray on the muted ground and merges className", () => {
    const c = classes(html)
    expect(c).toEqual(
      expect.arrayContaining([
        "flex",
        "min-w-0",
        "flex-wrap",
        "gap-1",
        "rounded-3xl",
        "bg-muted",
        "p-1",
        "mb-4",
      ]),
    )
  })
})
