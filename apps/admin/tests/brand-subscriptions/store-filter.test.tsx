// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { StoreFilter } from "@/app/brand-subscriptions/store-filter"

const options = [
  { id: "s1", name: "Alpha", href: "/brand-subscriptions?storeId=s1" },
  { id: "s2", name: "Beta", href: "/brand-subscriptions?storeId=s2" },
]

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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

function trigger() {
  return container.querySelector<HTMLElement>("#store-filter")!
}
function show(value: string) {
  act(() =>
    root.render(<StoreFilter value={value} allHref="/brand-subscriptions" options={options} />),
  )
}

describe("StoreFilter trigger", () => {
  it("shows the chosen store's name", () => {
    show("s2")
    expect(trigger().textContent).toBe("Beta")
  })
  it("reads All stores when no filter is set", () => {
    show("")
    expect(trigger().textContent).toBe("All stores")
  })
  it("is labelled Store", () => {
    show("")
    expect(container.querySelector("label[for=store-filter]")?.textContent).toBe("Store")
  })
})
