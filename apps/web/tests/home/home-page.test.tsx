// @vitest-environment jsdom
// R3 Task 7: the home page puts the sections in one order, hides what the visibility table hides,
// reads its metadata from HOME_COPY, and is never prerendered (it reads the database).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getHomeData } = vi.hoisted(() => ({ getHomeData: vi.fn() }))
vi.mock("@/app/_home/home-queries", () => ({ getHomeData }))

import * as pageModule from "@/app/page"
import Home from "@/app/page"
import { HOME_COPY } from "@/app/_home/home-copy"

import { EMPTY, MARKERS, VISIBILITY_CASES } from "./visibility"

async function mount(data: unknown): Promise<HTMLElement> {
  getHomeData.mockResolvedValue(data)
  const div = document.createElement("div")
  div.innerHTML = renderToStaticMarkup(await Home())
  return div
}
const present = (root: Element) =>
  MARKERS.filter((m) => root.querySelector(`[data-home="${m}"]`) !== null)
const domOrder = (root: Element) =>
  [...root.querySelectorAll("[data-home]")].map((e) => e.getAttribute("data-home"))

beforeEach(() => getHomeData.mockReset())

describe.each(VISIBILITY_CASES)("Home page: $name", ({ data, present: expected }) => {
  it("shows exactly the sections the table allows, in the table's order", async () => {
    const root = await mount(data)
    expect(present(root)).toEqual(MARKERS.filter((m) => (expected as string[]).includes(m)))
    // the DOM order is the table order (every marker once)
    expect(domOrder(root).filter((m) => m !== null)).toEqual(
      MARKERS.filter((m) => (expected as string[]).includes(m)),
    )
  })

  it("has one main and one h1", async () => {
    const root = await mount(data)
    expect(root.querySelectorAll("main")).toHaveLength(1)
    expect(root.querySelectorAll("h1")).toHaveLength(1)
  })
})

describe("Home page: empty data", () => {
  it("is exactly headline, delivery, marquee, promise and CTA, with no zero and no empty frame", async () => {
    const root = await mount(EMPTY)
    expect(present(root)).toEqual(["hero-headline", "hero-delivery", "marquee", "promise", "cta"])
    for (const el of root.querySelectorAll("*")) {
      if (el.children.length === 0) expect(el.textContent?.trim()).not.toBe("0")
    }
    expect(root.querySelectorAll("section,div[data-home]").length).toBeGreaterThan(0)
    for (const s of root.querySelectorAll("section")) {
      expect(s.textContent?.trim(), s.outerHTML.slice(0, 60)).not.toBe("")
    }
    expect(root.querySelector("input,form")).toBeNull()
  })
})

describe("Home page: module", () => {
  it("is dynamic and takes its metadata from HOME_COPY", () => {
    expect(pageModule.dynamic).toBe("force-dynamic")
    const meta = pageModule.generateMetadata()
    expect(meta.title).toBe(HOME_COPY.meta.title)
    expect(meta.description).toBe(HOME_COPY.meta.description)
  })

  it("the layout, nav and footer own no main, so the page's is the only one", () => {
    for (const f of [
      "src/app/layout.tsx",
      "src/components/nav-bar.tsx",
      "src/components/footer.tsx",
    ]) {
      expect(readFileSync(resolve(__dirname, "../..", f), "utf8"), f).not.toMatch(/<main[\s>]/)
    }
  })

  it("reads only through getHomeData", () => {
    const src = readFileSync(resolve(__dirname, "../../src/app/page.tsx"), "utf8")
    expect(src).not.toMatch(/withAdmin|makeDb|@bomy\/db/)
  })
})
