// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const mocks = vi.hoisted(() => ({
  updateUserRole: vi.fn(),
  updateVoucherConfig: vi.fn(),
  triggerVoucherIssuance: vi.fn(),
  requireAdmin: vi.fn(),
  withAdmin: vi.fn(),
}))

vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/app/users/actions", () => ({ updateUserRole: mocks.updateUserRole }))
vi.mock("@/app/vouchers/actions", () => ({
  updateVoucherConfig: mocks.updateVoucherConfig,
  triggerVoucherIssuance: mocks.triggerVoucherIssuance,
}))
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }))
// The page only touches schema.* inside the withAdmin callbacks, which this mock never runs.
vi.mock("@bomy/db", () => ({
  schema: { platformConfig: {}, vouchers: {}, users: {} },
  withAdmin: mocks.withAdmin,
}))

import { RoleSelector } from "@/app/users/role-selector"
import VouchersPage from "@/app/vouchers/page"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateUserRole.mockResolvedValue({ ok: true })
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1" })
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

async function submit(f: HTMLFormElement) {
  await act(async () => {
    f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe("A1 RoleSelector", () => {
  it("sends the chosen role and keeps showing it after a successful save", async () => {
    await render(<RoleSelector userId="u-1" currentRole="buyer" />)
    await typeahead("role-u-1", "bomy_a")
    expect(byId("role-u-1").textContent).toBe("bomy_admin")
    const f = container.querySelector("form")
    if (!f) throw new Error("no form")
    await submit(f)
    expect(mocks.updateUserRole).toHaveBeenCalledWith("u-1", "bomy_admin")
    // With <form action>, React 19's post-action reset made Radix revert to "buyer" here.
    expect(byId("role-u-1").textContent).toBe("bomy_admin")
    expect(new FormData(f).get("role")).toBe("bomy_admin")
  })
})

describe("A2 VouchersPage type", () => {
  function config(type: string) {
    mocks.withAdmin
      .mockResolvedValueOnce([{ key: "voucher_monthly_type", value: type }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ rows: [], total: 0 })
  }

  it("posts the stored type, then the chosen one, and shows the saved type after revalidation", async () => {
    config("fixed_myr")
    await render(await VouchersPage({ searchParams: Promise.resolve({}) }))
    const f = byId("voucher-config-form")
    if (!(f instanceof HTMLFormElement)) throw new Error("no voucher form")
    expect(byId("voucher-type").textContent).toBe("Fixed MYR")
    expect(new FormData(f).get("type")).toBe("fixed_myr")

    await typeahead("voucher-type", "Pe")
    await submit(f)
    const call = mocks.updateVoucherConfig.mock.calls[0]
    if (!call) throw new Error("updateVoucherConfig not called")
    const fd: unknown = call[0]
    if (!(fd instanceof FormData)) throw new Error("not FormData")
    expect(fd.get("type")).toBe("percentage")

    // Simulates revalidatePath: the server component renders again with the saved value.
    config("percentage")
    await render(await VouchersPage({ searchParams: Promise.resolve({}) }))
    expect(byId("voucher-type").textContent).toBe("Percentage")
    expect(new FormData(f).get("type")).toBe("percentage")
  })
})
