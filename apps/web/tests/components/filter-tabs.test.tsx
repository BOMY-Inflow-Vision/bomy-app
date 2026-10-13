// @vitest-environment jsdom
import React, { act } from "react"
import Link from "next/link"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FilterTab, FilterTabs } from "@bomy/ui/filter-tabs"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function tokens(html: string): string[] {
  const m = html.match(/class="([^"]*)"/)
  if (!m) throw new Error("no class attribute")
  return m[1]!.split(/\s+/)
}

const LOOKS = {
  primary: {
    base: ["rounded-full", "px-3", "py-1", "text-xs", "font-medium"],
    active: ["bg-primary", "text-primary-foreground"],
    inactive: ["bg-muted", "text-muted-foreground", "hover:bg-muted/80"],
  },
  inverse: {
    base: ["rounded-full", "px-3", "py-1", "text-sm"],
    active: ["bg-foreground", "text-background"],
    inactive: ["bg-muted", "text-muted-foreground"],
  },
  flat: {
    base: ["rounded", "px-3", "py-1"],
    active: ["bg-accent", "text-accent-foreground"],
    inactive: ["text-muted-foreground", "hover:bg-muted"],
  },
} as const

describe("FilterTab", () => {
  it.each(Object.entries(LOOKS))("%s: base, active and inactive tokens", (name, look) => {
    const variant = name as keyof typeof LOOKS
    const on = tokens(
      renderToStaticMarkup(
        <FilterTab variant={variant} active href="/x">
          x
        </FilterTab>,
      ),
    )
    const off = tokens(
      renderToStaticMarkup(
        <FilterTab variant={variant} href="/x">
          x
        </FilterTab>,
      ),
    )
    expect(on).toEqual(expect.arrayContaining([...look.base, ...look.active]))
    expect(off).toEqual(expect.arrayContaining([...look.base, ...look.inactive]))
    expect(on).not.toContain("bg-muted")
    for (const t of look.inactive)
      if (!look.active.includes(t as never)) expect(on).not.toContain(t)
    for (const t of look.active) expect(off).not.toContain(t)
  })

  it("adds a visible focus ring on every variant", () => {
    for (const v of ["primary", "inverse", "flat"] as const) {
      const t = tokens(
        renderToStaticMarkup(
          <FilterTab variant={v} href="/x">
            x
          </FilterTab>,
        ),
      )
      expect(t).toEqual(
        expect.arrayContaining([
          "focus-visible:outline-none",
          "focus-visible:ring-2",
          "focus-visible:ring-ring",
        ]),
      )
    }
  })

  it("sets aria-current only on the active tab", () => {
    expect(
      renderToStaticMarkup(
        <FilterTab active href="/x">
          x
        </FilterTab>,
      ),
    ).toContain('aria-current="page"')
    expect(renderToStaticMarkup(<FilterTab href="/x">x</FilterTab>)).not.toContain("aria-current")
  })

  it("asChild puts classes and aria-current on the child and keeps its href", () => {
    const html = renderToStaticMarkup(
      <FilterTab asChild variant="flat" active>
        <a href="/stores?status=active">active</a>
      </FilterTab>,
    )
    expect(html).toMatch(/^<a /)
    expect(html).toContain('href="/stores?status=active"')
    expect(html).toContain('aria-current="page"')
    expect(tokens(html)).toEqual(expect.arrayContaining(["bg-accent", "rounded", "px-3"]))
  })

  it("works around next/link, which renders an anchor with the same href", () => {
    const html = renderToStaticMarkup(
      <FilterTab asChild variant="inverse">
        <Link href="/payouts?status=failed">failed</Link>
      </FilterTab>,
    )
    expect(html).toMatch(/^<a /)
    expect(html).toContain('href="/payouts?status=failed"')
    expect(tokens(html)).toEqual(expect.arrayContaining(["bg-muted", "rounded-full"]))
  })

  it("className merges after the variant (px-2 replaces px-3)", () => {
    const t = tokens(
      renderToStaticMarkup(
        <FilterTab variant="flat" className="px-2" href="/x">
          x
        </FilterTab>,
      ),
    )
    expect(t).toContain("px-2")
    expect(t).not.toContain("px-3")
  })
})

describe("FilterTabs", () => {
  it("is a labelled nav and merges className", () => {
    const html = renderToStaticMarkup(
      <FilterTabs label="Filter by status" className="gap-1 text-sm">
        <FilterTab href="/x">x</FilterTab>
      </FilterTabs>,
    )
    expect(html).toMatch(/^<nav /)
    expect(html).toContain('aria-label="Filter by status"')
    expect(tokens(html)).toEqual(expect.arrayContaining(["flex", "flex-wrap", "gap-1", "text-sm"]))
  })

  it("does not use ARIA tab roles", () => {
    const html = renderToStaticMarkup(
      <FilterTabs label="Filter by status">
        <FilterTab href="/a" active>
          a
        </FilterTab>
        <FilterTab href="/b">b</FilterTab>
      </FilterTabs>,
    )
    expect(html).not.toMatch(/role="(tab|tablist)"/)
  })
})

describe("FilterTabs keyboard order", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("every tab is a focusable link, in DOM order", async () => {
    await act(async () => {
      root.render(
        <FilterTabs label="Filter by status">
          <FilterTab href="/a" active>
            a
          </FilterTab>
          <FilterTab href="/b">b</FilterTab>
          <FilterTab href="/c">c</FilterTab>
        </FilterTabs>,
      )
      await Promise.resolve()
    })
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/a", "/b", "/c"])
    for (const a of links) {
      expect(a.tabIndex).toBe(0)
      act(() => a.focus())
      expect(document.activeElement).toBe(a)
    }
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null, null])
  })
})
