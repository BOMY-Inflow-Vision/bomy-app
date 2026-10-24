// @vitest-environment jsdom
// R3 Task 4: the marquee band is decoration, the browse bento is real category links.
import type React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Browse } from "@/app/_home/browse"
import { Marquee } from "@/app/_home/marquee"

import { sentinelCopy, visibleTextOutside } from "./sentinel-copy"
import { OVERFULL, VISIBILITY_CASES } from "./visibility"

function mountEl(el: React.ReactElement): HTMLElement {
  const div = document.createElement("div")
  div.innerHTML = renderToStaticMarkup(el)
  return div
}
const q = (root: Element, m: string) => root.querySelector(`[data-home="${m}"]`)

describe.each(VISIBILITY_CASES)("Marquee: $name", ({ data }) => {
  it("always renders; the words are hidden from screen readers and clipped", () => {
    const root = mountEl(<Marquee categories={data.categories} copy={sentinelCopy().marquee} />)
    const el = q(root, "marquee")!
    expect(el).not.toBeNull()
    expect(el.getAttribute("aria-hidden")).toBe("true")
    expect(el.className).toMatch(/overflow-hidden/)
    for (const w of sentinelCopy().marquee) expect(el.textContent).toContain(w)
    for (const c of data.categories) expect(el.textContent).toContain(c.name)
  })
})

// R6b Task 1: the band moves. Two identical copies side by side, the track slides by exactly one
// copy (-50 %), so the loop is seamless. Each copy is at least one screen wide, so no gap can
// show at the right edge however few words there are (the live site has only the 3 copy words).
describe("Marquee motion", () => {
  const copy = sentinelCopy().marquee
  const render = () => mountEl(<Marquee categories={[]} copy={copy} />)

  it("moves only when motion is allowed; reduced motion shows one still copy", () => {
    const track = q(render(), "marquee")!.querySelector("[data-marquee-track]")!
    expect(track.className).toContain("motion-safe:animate-marquee")
    const copies = [...track.children]
    expect(copies).toHaveLength(2)
    expect(copies[0]!.className).not.toContain("motion-reduce:hidden")
    expect(copies[1]!.className).toContain("motion-reduce:hidden")
  })

  it("each copy is at least a screen wide and spreads its words evenly (seam = word spacing)", () => {
    const copies = [...q(render(), "marquee")!.querySelector("[data-marquee-track]")!.children]
    for (const c of copies) {
      expect(c.className).toContain("min-w-[100vw]")
      expect(c.className).toContain("shrink-0")
      expect(c.className).toContain("justify-around")
    }
    expect(copies[0]!.textContent).toBe(copies[1]!.textContent)
  })

  it("the second copy repeats the words but is not read twice (whole band aria-hidden)", () => {
    const root = render()
    expect(q(root, "marquee")!.getAttribute("aria-hidden")).toBe("true")
  })

  it("the pause button is outside the hidden band and is named for screen readers", () => {
    const root = render()
    const button = root.querySelector("button")!
    expect(button.getAttribute("aria-label")).toBe("Pause moving words")
    expect(q(root, "marquee")!.contains(button)).toBe(false)
    expect(button.closest("[aria-hidden='true']")).toBeNull()
    expect(button.className).toContain("motion-reduce:hidden")
  })
})

describe.each(VISIBILITY_CASES)("Browse: $name", ({ data, present }) => {
  it("follows the visibility rule and uses no hard-coded words", () => {
    const root = mountEl(<Browse categories={data.categories} copy={sentinelCopy().browse} />)
    expect(q(root, "browse") !== null).toBe((present as string[]).includes("browse"))
    expect(
      visibleTextOutside(
        root,
        data.categories.map((c) => c.name),
      ),
    ).toEqual([])
  })
})

describe("Browse details", () => {
  const copy = sentinelCopy().browse
  const full = VISIBILITY_CASES[1]!.data

  it("links each tile to the category filter with the real count", () => {
    const root = mountEl(<Browse categories={full.categories} copy={copy} />)
    const tiles = [...q(root, "browse")!.querySelectorAll("a[href^='/products?category=']")]
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual([
      "/products?category=c1",
      "/products?category=c2",
      "/products?category=c3",
    ])
    expect(tiles[0]!.textContent).toContain("Alpha")
    expect(tiles[0]!.textContent).toContain("«browse.count(5)»")
    expect(q(root, "browse")!.querySelector("a[href='/products']")!.textContent).toBe(
      "«browse.all»",
    )
  })

  it("shows at most five tiles, most products first", () => {
    const root = mountEl(<Browse categories={OVERFULL.categories} copy={copy} />)
    const hrefs = [...q(root, "browse")!.querySelectorAll("a[href^='/products?category=']")].map(
      (a) => a.getAttribute("href"),
    )
    expect(hrefs).toEqual(["c0", "c1", "c2", "c3", "c4"].map((id) => `/products?category=${id}`))
  })

  it("skips a category with no product", () => {
    const root = mountEl(
      <Browse categories={[{ id: "z", name: "Zero", activeProductCount: 0 }]} copy={copy} />,
    )
    expect(q(root, "browse")).toBeNull()
  })

  it("encodes the category id in the link", () => {
    const root = mountEl(
      <Browse categories={[{ id: "a b&c", name: "Odd", activeProductCount: 1 }]} copy={copy} />,
    )
    expect(root.querySelector("a[href^='/products?category=']")!.getAttribute("href")).toBe(
      "/products?category=a%20b%26c",
    )
  })

  it("an 80-character category name wraps inside its tile", () => {
    const name = "W".repeat(80)
    const root = mountEl(
      <Browse categories={[{ id: "w", name, activeProductCount: 2 }]} copy={copy} />,
    )
    const a = root.querySelector("a[href^='/products?category=']")!
    expect(a.className).toMatch(/min-w-0/)
    expect(a.innerHTML).toMatch(/\[overflow-wrap:anywhere\]/)
  })
})

// The toggle needs real clicks, so it is mounted with react-dom rather than static markup.
describe("Marquee pause button", () => {
  it("toggles the name and the track's play state", async () => {
    const { act } = await import("react")
    const { createRoot } = await import("react-dom/client")
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<Marquee categories={[]} copy={sentinelCopy().marquee} />))
    const button = host.querySelector("button")!
    const track = host.querySelector<HTMLElement>("[data-marquee-track]")!
    expect(track.style.animationPlayState).toBe("running")
    act(() => button.click())
    expect(button.getAttribute("aria-label")).toBe("Play moving words")
    expect(track.style.animationPlayState).toBe("paused")
    act(() => button.click())
    expect(button.getAttribute("aria-label")).toBe("Pause moving words")
    expect(track.style.animationPlayState).toBe("running")
    act(() => root.unmount())
    host.remove()
  })
})
