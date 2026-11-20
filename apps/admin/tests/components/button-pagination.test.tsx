import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/admin-ui/button"
import { Pagination } from "@/components/ui/pagination"

const html = (node: React.ReactElement) => renderToStaticMarkup(node)

describe("admin Button", () => {
  it("is a 44px pill with 14px semibold words", () => {
    const out = html(<Button>Save</Button>)
    for (const c of ["h-11", "rounded-full", "text-sm", "font-semibold", "px-5", "bg-primary"])
      expect(out).toContain(c)
  })

  it("keeps a link button small and plain", () => {
    const out = html(<Button variant="link">View</Button>)
    expect(out).toContain("h-auto")
    expect(out).not.toContain("h-11")
  })

  it("puts the icon before the label, also through asChild, and drops arrowOnHover", () => {
    const plain = html(<Button icon={<i data-i />}>Go</Button>)
    expect(plain.indexOf("data-i")).toBeLessThan(plain.indexOf("Go"))
    const link = html(
      <Button asChild icon={<i data-i />} arrowOnHover={false}>
        <a href="/x">Go</a>
      </Button>,
    )
    expect(link).toMatch(/<a [^>]*href="\/x"[^>]*><i data-i="true"><\/i>Go<\/a>/)
    expect(link).not.toContain("arrowonhover")
  })
})

describe("Pagination", () => {
  const href = (p: number) => `/orders?page=${p}`

  it("renders nothing for a single page", () => {
    expect(html(<Pagination page={1} totalPages={1} buildHref={href} />)).toBe("")
  })

  it("says which page it is on, marks it current, and disables Previous on page 1", () => {
    const out = html(<Pagination page={1} totalPages={4} buildHref={href} />)
    expect(out).toMatch(/Page <span[^>]*>1<\/span> of <span[^>]*>4<\/span>/)
    expect(out).toContain('aria-current="page"')
    expect(out).toContain('aria-disabled="true"')
    expect(out).toContain('href="/orders?page=2"')
  })

  it("links Next to the following page and disables it on the last page", () => {
    const mid = html(<Pagination page={2} totalPages={4} buildHref={href} />)
    expect(mid).toContain('href="/orders?page=3"')
    expect(mid).not.toContain('aria-disabled="true"')
    const last = html(<Pagination page={4} totalPages={4} buildHref={href} />)
    expect(last).toContain('aria-disabled="true"')
  })
})
