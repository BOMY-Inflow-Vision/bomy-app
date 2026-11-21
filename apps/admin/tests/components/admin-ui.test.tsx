// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PageFrame } from "@/components/admin-ui/page-frame"
import { PageHeader } from "@/components/admin-ui/page-header"
import { SearchField } from "@/components/admin-ui/search-field"
import { Tile } from "@/components/admin-ui/tile"

const doc = (el: React.ReactElement) =>
  new DOMParser().parseFromString(renderToStaticMarkup(el), "text/html")

describe("Tile", () => {
  it("is a borderless white tile with the floating shadow", () => {
    const d = doc(<Tile className="overflow-x-auto">x</Tile>)
    const el = d.body.firstElementChild!
    for (const c of ["rounded-2xl", "bg-card", "shadow-tile", "overflow-x-auto", "relative"])
      expect(el.classList.contains(c), c).toBe(true)
    expect(el.classList.contains("border")).toBe(false)
  })
})

describe("PageHeader", () => {
  it("renders the title as the page's h1 and breaks a long unbroken title", () => {
    const d = doc(<PageHeader title={"N".repeat(80)} />)
    const h1 = d.querySelector("h1")!
    expect(h1.textContent).toBe("N".repeat(80))
    expect(h1.classList.contains("[overflow-wrap:anywhere]")).toBe(true)
    expect(h1.classList.contains("min-w-0")).toBe(true)
  })

  it("shows the description only when given", () => {
    expect(doc(<PageHeader title="A" />).querySelector("p")).toBeNull()
    expect(doc(<PageHeader title="A" description="Hello" />).querySelector("p")!.textContent).toBe(
      "Hello",
    )
  })

  it("wraps the controls under the title on a narrow screen, and omits an empty controls row", () => {
    const withControls = doc(
      <PageHeader title="A">
        <button type="button">Go</button>
      </PageHeader>,
    )
    const header = withControls.querySelector("header")!
    expect(header.classList.contains("flex-wrap")).toBe(true)
    expect(header.querySelectorAll("button")).toHaveLength(1)
    expect(header.children).toHaveLength(2)
    expect(doc(<PageHeader title="A" />).querySelector("header")!.children).toHaveLength(1)
  })
})

describe("SearchField", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const mount = (value = "") =>
    act(() =>
      root.render(
        <SearchField id="s" label="Search things" placeholder="Search…" defaultValue={value} />,
      ),
    )
  const input = () => container.querySelector<HTMLInputElement>("input")!
  const press = (init: KeyboardEventInit) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, ...init }))
    })

  it("is a labelled search field named q, with the current value", () => {
    mount("tea")
    expect(input().name).toBe("q")
    expect(input().type).toBe("search")
    expect(input().value).toBe("tea")
    expect(container.querySelector("label[for='s']")!.textContent).toBe("Search things")
  })

  it("shows the key hint while the box is empty", () => {
    mount()
    expect(container.querySelector("kbd")).not.toBeNull()
  })

  it("hides the key hint when there is a starting value", () => {
    mount("tea")
    expect(container.querySelector("kbd")).toBeNull()
  })

  it("hides the key hint as soon as something is typed", () => {
    mount()
    act(() => {
      const el = input()
      // React tracks the value itself: set it through the prototype's setter so it sees the change.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      set.call(el, "t")
      el.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(container.querySelector("kbd")).toBeNull()
  })

  it("Ctrl+K focuses the box from anywhere", () => {
    mount()
    expect(document.activeElement).not.toBe(input())
    press({ key: "k", ctrlKey: true })
    expect(document.activeElement).toBe(input())
  })

  it("ignores K without Cmd/Ctrl, with Shift or Alt, and while a modal dialog is open", () => {
    mount()
    press({ key: "k" })
    press({ key: "k", ctrlKey: true, shiftKey: true })
    press({ key: "k", ctrlKey: true, altKey: true })
    expect(document.activeElement).not.toBe(input())
    const dialog = document.createElement("div")
    dialog.setAttribute("aria-modal", "true")
    document.body.appendChild(dialog)
    press({ key: "k", ctrlKey: true })
    expect(document.activeElement).not.toBe(input())
    dialog.remove()
  })

  it("does not react to a closed drawer (aria-modal=false)", () => {
    mount()
    const closed = document.createElement("div")
    closed.setAttribute("aria-modal", "false")
    document.body.appendChild(closed)
    press({ key: "k", metaKey: true })
    expect(document.activeElement).toBe(input())
    closed.remove()
  })
})

describe("PageFrame and PageHeader extras", () => {
  it("PageFrame is wide by default and narrow on request, with the shared gutters", () => {
    const wide = doc(<PageFrame>x</PageFrame>).body.firstElementChild!
    const narrow = doc(<PageFrame width="narrow">x</PageFrame>).body.firstElementChild!
    for (const c of ["mx-auto", "px-4", "md:px-6", "lg:px-8"])
      expect(wide.classList.contains(c)).toBe(true)
    expect(wide.classList.contains("max-w-7xl")).toBe(true)
    expect(narrow.classList.contains("max-w-3xl")).toBe(true)
    expect(narrow.classList.contains("max-w-7xl")).toBe(false)
  })

  it("PageHeader passes an id to the h1 and accepts a node as the title", () => {
    const d = doc(
      <PageHeader
        title={
          <>
            Order <b>12</b>
          </>
        }
        titleId="t"
      />,
    )
    const h1 = d.querySelector("h1")!
    expect(h1.id).toBe("t")
    expect(h1.textContent).toBe("Order 12")
  })

  it("Tile marks itself so tables inside get the quiet header row", () => {
    expect(doc(<Tile>x</Tile>).body.firstElementChild!.classList.contains("admin-tile")).toBe(true)
  })
})

describe("labelTables", () => {
  it("copies each column heading onto its cells and skips full-width rows", async () => {
    const { labelTables } = await import("@/components/admin-ui/table-labels")
    const host = document.createElement("div")
    host.innerHTML = `<div class="admin-tile"><table><thead><tr><th>Order</th><th> Store </th></tr></thead>
      <tbody><tr><td>a</td><td>b</td></tr><tr><td colspan="2">No orders</td></tr></tbody></table></div>`
    labelTables(host)
    const cells = [...host.querySelectorAll("td")].map(
      (td) => td.getAttribute("data-label") ?? undefined,
    )
    expect(cells).toEqual(["Order", "Store", undefined])
  })
})
