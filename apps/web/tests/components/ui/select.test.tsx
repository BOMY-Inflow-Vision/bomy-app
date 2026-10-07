// @vitest-environment jsdom
import React, { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"

// Form-submission contract of the shared Select (Radix 2.3.x). jsdom, not a browser: pointer
// interaction, layout and animation are covered by the live browser check instead.
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
// Radix calls these while opening/navigating the list; jsdom does not implement them.
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}

const CATEGORY_ITEMS = [
  { value: "", label: "No category" },
  { value: "c-1", label: "Apparel" },
  { value: "c-2", label: "Books" },
]

function CategorySelect(props: { name?: string; defaultValue?: string; disabled?: boolean }) {
  return (
    <Select {...props}>
      <SelectTrigger id="cat">
        <SelectValue placeholder="No category" />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_ITEMS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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

async function render(ui: React.ReactNode) {
  await act(async () => {
    root.render(ui)
    await Promise.resolve()
  })
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el
}

async function press(el: HTMLElement, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

async function typeahead(el: HTMLElement, text: string) {
  el.focus()
  for (const key of text) await press(el, key)
}

function fields(formId: string): [string, string][] {
  const form = byId(formId)
  if (!(form instanceof HTMLFormElement)) throw new Error(`#${formId} is not a form`)
  return [...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name])
}

describe("@bomy/ui Select — form contract", () => {
  it("posts the default value without any interaction, and shows its label", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-2" />
      </form>,
    )
    expect(fields("f")).toEqual([["categoryId", "c-2"]])
    expect(byId("cat").textContent).toBe("Books")
  })

  it("posts an empty string when nothing is selected, and shows the placeholder", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" />
      </form>,
    )
    expect(fields("f")).toEqual([["categoryId", ""]])
    expect(byId("cat").hasAttribute("data-placeholder")).toBe(true)
  })

  it('allows an item with value "" and posts "" when it is chosen (Radix >= 2.3.1)', async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-2" />
      </form>,
    )
    await typeahead(byId("cat"), "N")
    expect(fields("f")).toEqual([["categoryId", ""]])
    // The trigger shows the placeholder for "", so call sites set placeholder = that item's label.
    expect(byId("cat").textContent).toBe("No category")
  })

  it("keyboard: Enter opens, ArrowUp + Enter selects, focus returns to the trigger", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-2" />
      </form>,
    )
    const trigger = byId("cat")
    trigger.focus()
    await press(trigger, "Enter")
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement?.getAttribute("role")).toBe("option")
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) throw new Error("no focused option")
    await press(active, "ArrowUp")
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const next = document.activeElement
    if (!(next instanceof HTMLElement)) throw new Error("no focused option")
    await press(next, "Enter")
    expect(fields("f")).toEqual([["categoryId", "c-1"]])
    expect(document.activeElement).toBe(trigger)
  })

  it("form.reset() restores the mount value", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-1" />
      </form>,
    )
    await typeahead(byId("cat"), "B")
    expect(fields("f")).toEqual([["categoryId", "c-2"]])
    await act(async () => {
      ;(byId("f") as HTMLFormElement).reset()
      await Promise.resolve()
    })
    expect(fields("f")).toEqual([["categoryId", "c-1"]])
    expect(byId("cat").textContent).toBe("Apparel")
  })

  it("a disabled Select is left out of FormData (today's hidden input was not)", async () => {
    await render(
      <form id="f">
        <CategorySelect name="categoryId" defaultValue="c-1" disabled />
      </form>,
    )
    expect(fields("f")).toEqual([])
  })

  it("renders no native control outside a form", async () => {
    await render(
      <div id="d">
        <CategorySelect name="categoryId" defaultValue="c-1" />
      </div>,
    )
    expect(byId("d").querySelector("select")).toBeNull()
  })

  it("server render: a named native select with no options yet (pre-hydration submit posts nothing)", () => {
    const html = renderToStaticMarkup(
      <form>
        <CategorySelect name="categoryId" defaultValue="c-1" />
      </form>,
    )
    expect(html).toContain('name="categoryId"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("<option")
  })
})
