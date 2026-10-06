// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const actions = vi.hoisted(() => ({
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  addVariant: vi.fn(),
  archiveProduct: vi.fn(),
  deactivateVariant: vi.fn(),
  reactivateVariant: vi.fn(),
  reorderVariants: vi.fn(),
  updateVariant: vi.fn(),
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  setDefault: vi.fn(),
}))

vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/app/seller/dashboard/subscriptions/actions", () => ({
  createPlan: actions.createPlan,
  updatePlan: actions.updatePlan,
}))
vi.mock("@/app/seller/dashboard/products/actions", () => ({
  createProduct: actions.createProduct,
  updateProduct: actions.updateProduct,
  addVariant: actions.addVariant,
  archiveProduct: actions.archiveProduct,
  deactivateVariant: actions.deactivateVariant,
  reactivateVariant: actions.reactivateVariant,
  reorderVariants: actions.reorderVariants,
  updateVariant: actions.updateVariant,
}))
vi.mock("@/app/account/addresses/actions", () => ({
  addAddress: actions.addAddress,
  updateAddress: actions.updateAddress,
  deleteAddress: actions.deleteAddress,
  setDefault: actions.setDefault,
}))

import { AddressManager } from "@/app/account/addresses/address-manager"
import { ProductEditForm } from "@/app/seller/dashboard/products/[id]/edit/product-edit-form"
import { ProductForm } from "@/app/seller/dashboard/products/new/product-form"
import { CreatePlanForm } from "@/app/seller/dashboard/subscriptions/create-plan-form"
import { EditPlanForm } from "@/app/seller/dashboard/subscriptions/edit-plan-form"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  actions.createPlan.mockResolvedValue({ ok: true })
  actions.updatePlan.mockResolvedValue({ ok: true })
  actions.createProduct.mockResolvedValue({ ok: false, error: "stub" })
  actions.updateProduct.mockResolvedValue({ ok: true })
  actions.addAddress.mockResolvedValue({ ok: true })
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

// Typeahead on a closed trigger changes the value through Radix's own keyboard path.
async function typeahead(id: string, text: string) {
  const el = byId(id)
  el.focus()
  for (const key of text) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
  }
}

function form(): HTMLFormElement {
  const f = container.querySelector("form")
  if (!f) throw new Error("no form")
  return f
}

// Dispatches submit directly (skips constraint validation on unrelated required inputs);
// the W5/W6 test checks validation separately with checkValidity().
async function submit(f: HTMLFormElement = form()) {
  await act(async () => {
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function sentFormData(fn: Mock, argIndex = 0): FormData {
  const call = fn.mock.calls[0]
  if (!call) throw new Error("action not called")
  const fd: unknown = call[argIndex]
  if (!(fd instanceof FormData)) throw new Error("argument is not FormData")
  return fd
}

const CATEGORIES = [
  { id: "c-1", name: "Apparel" },
  { id: "c-2", name: "Books" },
]

describe("W1/W2 ProductForm", () => {
  it('posts categoryId="" and status="draft" without interaction', async () => {
    await render(<ProductForm categories={CATEGORIES} />)
    await submit()
    const fd = sentFormData(actions.createProduct)
    expect(fd.get("categoryId")).toBe("")
    expect(fd.get("status")).toBe("draft")
  })

  it("posts the chosen category and status", async () => {
    await render(<ProductForm categories={CATEGORIES} />)
    await typeahead("categoryId", "B")
    await typeahead("status", "A")
    await submit()
    const fd = sentFormData(actions.createProduct)
    expect(fd.get("categoryId")).toBe("c-2")
    expect(fd.get("status")).toBe("active")
  })
})

describe("W3/W4 ProductEditForm", () => {
  const product = {
    id: "p-1",
    name: "Mug",
    slug: "mug",
    description: null,
    categoryId: "c-2",
    status: "archived" as const,
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
  }
  const categories = [
    { id: "c-1", name: "Apparel", isActive: true },
    { id: "c-2", name: "Books", isActive: false },
  ]

  it("posts the product's own category and status without interaction", async () => {
    await render(<ProductEditForm product={product} variants={[]} categories={categories} />)
    expect(byId("categoryId").textContent).toBe("Books (inactive)")
    await submit()
    const fd = sentFormData(actions.updateProduct, 1)
    expect(fd.get("categoryId")).toBe("c-2")
    expect(fd.get("status")).toBe("archived")
  })

  it('choosing "No category" posts ""', async () => {
    await render(<ProductEditForm product={product} variants={[]} categories={categories} />)
    await typeahead("categoryId", "N")
    await submit()
    expect(sentFormData(actions.updateProduct, 1).get("categoryId")).toBe("")
  })
})

describe("W5/W6 CreatePlanForm", () => {
  it('does not block submit with nothing selected and posts "" (server validates, as today)', async () => {
    await render(<CreatePlanForm availableTerms={[3, 6, 12]} />)
    const price = byId("priceMyrSen")
    if (!(price instanceof HTMLInputElement)) throw new Error("price is not an input")
    price.value = "50.00"
    expect(form().checkValidity()).toBe(true)
    await submit()
    const fd = sentFormData(actions.createPlan)
    expect(fd.get("termMonths")).toBe("")
    expect(fd.get("discountPct")).toBe("")
    expect(byId("termMonths").getAttribute("aria-required")).toBe("true")
  })

  it("posts the chosen term and discount", async () => {
    await render(<CreatePlanForm availableTerms={[3, 6, 12]} />)
    await typeahead("termMonths", "6")
    await typeahead("discountPct", "7")
    await submit()
    const fd = sentFormData(actions.createPlan)
    expect(fd.get("termMonths")).toBe("6")
    expect(fd.get("discountPct")).toBe("7")
  })
})

describe("W7 EditPlanForm", () => {
  it("posts the current discount until it is changed", async () => {
    await render(
      <EditPlanForm
        planId="pl-1"
        defaultPriceMyr="50.00"
        defaultDiscountPct={8}
        defaultDescription=""
      />,
    )
    await submit()
    expect(sentFormData(actions.updatePlan, 1).get("discountPct")).toBe("8")
  })
})

describe("W11 AddressManager", () => {
  it("passes the chosen state to addAddress", async () => {
    await render(<AddressManager initial={[]} />)
    const add = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add address"),
    )
    if (!add) throw new Error("no Add address button")
    await act(async () => {
      add.click()
      await Promise.resolve()
    })
    expect(byId("addr-state").hasAttribute("data-placeholder")).toBe(true)
    await typeahead("addr-state", "Pah")
    await submit()
    const call = actions.addAddress.mock.calls[0]
    if (!call) throw new Error("addAddress not called")
    expect(call[0]).toMatchObject({ state: "Pahang" })
  })
})
