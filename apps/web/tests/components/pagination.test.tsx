// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Pagination, pageRange } from "@bomy/ui/pagination"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const href = (p: number) => `/x?page=${p}`
const doc = (html: string) => new DOMParser().parseFromString(html, "text/html")

describe("pageRange", () => {
  it("returns every page up to 7", () => {
    expect(pageRange(1, 1)).toEqual([1])
    expect(pageRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it.each([
    [1, 8, [1, 2, "...", 8]],
    [3, 8, [1, 2, 3, 4, "...", 8]],
    [4, 8, [1, "...", 3, 4, 5, "...", 8]],
    [6, 8, [1, "...", 5, 6, 7, 8]],
    [8, 8, [1, "...", 7, 8]],
    [10, 20, [1, "...", 9, 10, 11, "...", 20]],
    [20, 20, [1, "...", 19, 20]],
  ])("page %i of %i", (cur, total, want) => {
    expect(pageRange(cur, total)).toEqual(want)
  })
  it("always starts at 1, ends at the last page and has no duplicates, for every position", () => {
    for (let total = 1; total <= 30; total++) {
      for (let cur = 1; cur <= total; cur++) {
        const r = pageRange(cur, total)
        expect(r[0]).toBe(1)
        expect(r[r.length - 1]).toBe(total)
        const nums = r.filter((x): x is number => x !== "...")
        expect(new Set(nums).size).toBe(nums.length)
        expect(nums).toContain(cur)
        expect(nums).toEqual([...nums].sort((a, b) => a - b))
      }
    }
  })
})

describe("Pagination", () => {
  it("renders nothing for one page or none", () => {
    expect(
      renderToStaticMarkup(<Pagination page={1} totalPages={1} buildHref={href} label="P" />),
    ).toBe("")
    expect(
      renderToStaticMarkup(<Pagination page={1} totalPages={0} buildHref={href} label="P" />),
    ).toBe("")
  })

  it("shows every number when not collapsed", () => {
    const d = doc(
      renderToStaticMarkup(<Pagination page={3} totalPages={12} buildHref={href} label="P" />),
    )
    expect([...d.querySelectorAll("a")].map((a) => a.textContent)).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i + 1)),
    )
    expect(d.querySelector("span")).toBeNull()
  })

  it("collapses with aria-hidden ellipses", () => {
    const d = doc(
      renderToStaticMarkup(
        <Pagination page={10} totalPages={20} buildHref={href} label="P" collapse />,
      ),
    )
    const nav = d.querySelector("nav")!
    expect([...nav.children].map((c) => c.textContent)).toEqual([
      "1",
      "…",
      "9",
      "10",
      "11",
      "…",
      "20",
    ])
    expect(
      [...d.querySelectorAll("span")].every((s) => s.getAttribute("aria-hidden") === "true"),
    ).toBe(true)
  })

  it("marks only the current page, labels each link and takes hrefs from buildHref", () => {
    const d = doc(
      renderToStaticMarkup(<Pagination page={2} totalPages={3} buildHref={href} label="P" />),
    )
    const links = [...d.querySelectorAll("a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/x?page=1",
      "/x?page=2",
      "/x?page=3",
    ])
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Page 1", "Page 2", "Page 3"])
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null])
  })

  it("is a labelled nav and keeps the caller's className", () => {
    const html = renderToStaticMarkup(
      <Pagination
        page={1}
        totalPages={2}
        buildHref={href}
        label="Products pagination"
        className="mt-8 flex gap-2"
      />,
    )
    expect(html).toMatch(/^<nav /)
    expect(html).toContain('aria-label="Products pagination"')
    expect(doc(html).querySelector("nav")!.className).toBe("mt-8 flex gap-2")
  })

  it("size sets the target size and the look of current and other pages", () => {
    for (const [size, cls] of [
      ["md", ["h-8", "w-8"]],
      ["lg", ["h-11", "w-11"]],
    ] as const) {
      const d = doc(
        renderToStaticMarkup(
          <Pagination page={1} totalPages={2} buildHref={href} label="P" size={size} />,
        ),
      )
      const [cur, other] = [...d.querySelectorAll("a")]
      expect([...cur!.classList]).toEqual(
        expect.arrayContaining([
          ...cls,
          "rounded-control",
          "bg-primary",
          "text-primary-foreground",
          "focus-visible:ring-2",
        ]),
      )
      expect([...other!.classList]).toEqual(
        expect.arrayContaining([
          ...cls,
          "border",
          "border-border",
          "text-muted-foreground",
          "hover:bg-muted",
        ]),
      )
    }
  })

  it("linkAs renders that component for every page link", () => {
    function Custom({ href: h, children, ...rest }: React.ComponentProps<"a">) {
      return (
        <a href={h} data-custom="yes" {...rest}>
          {children}
        </a>
      )
    }
    const d = doc(
      renderToStaticMarkup(
        <Pagination page={1} totalPages={3} buildHref={href} label="P" linkAs={Custom} />,
      ),
    )
    expect([...d.querySelectorAll("a")].every((a) => a.getAttribute("data-custom") === "yes")).toBe(
      true,
    )
  })
})

describe("Pagination keyboard order", () => {
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

  it("links are focusable in DOM order and the ellipses are skipped", async () => {
    await act(async () => {
      root.render(<Pagination page={10} totalPages={20} buildHref={href} label="P" collapse />)
      await Promise.resolve()
    })
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a")]
    expect(links.map((a) => a.textContent)).toEqual(["1", "9", "10", "11", "20"])
    for (const a of links) {
      expect(a.tabIndex).toBe(0)
      act(() => a.focus())
      expect(document.activeElement).toBe(a)
    }
    expect(container.querySelector("span")!.tabIndex).toBe(-1)
  })
})
