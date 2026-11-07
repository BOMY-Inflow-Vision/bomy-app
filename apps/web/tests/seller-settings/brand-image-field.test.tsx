// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  getBrandImageUploadUrl: vi.fn(),
  saveBrandImage: vi.fn(),
  removeBrandImage: vi.fn(),
  setBrandImageFocus: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("@/app/seller/dashboard/settings/brand-image-actions", () => m)
vi.mock("@/components/toaster", () => ({ useToast: () => m.toast }))

import { BrandImageField } from "@/app/seller/dashboard/settings/brand-image-field"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(props: Partial<React.ComponentProps<typeof BrandImageField>> = {}) {
  act(() => {
    root.render(
      <BrandImageField
        initialImageUrl={null}
        initialFocalX={50}
        initialFocalY={50}
        brandName="Acme"
        {...props}
      />,
    )
  })
}
const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(name))

describe("BrandImageField", () => {
  it("without a picture offers only an add box (no preview, crop or remove)", () => {
    mount()
    expect(container.querySelector('input[type="file"]')!.getAttribute("aria-label")).toBe(
      "Add brand picture",
    )
    expect(container.querySelector("img")).toBeNull()
    expect(button("Adjust crop")).toBeUndefined()
    expect(button("Remove")).toBeUndefined()
  })

  it("with a picture shows it at its focal point and offers replace, crop and remove", () => {
    mount({
      initialImageUrl: "https://cdn.example/brands/a.png",
      initialFocalX: 75,
      initialFocalY: 20,
    })
    const img = container.querySelector("img")!
    expect(img.getAttribute("alt")).toBe("Acme brand picture")
    expect(img.style.objectPosition).toBe("75% 20%")
    expect(container.querySelector('input[type="file"]')!.getAttribute("aria-label")).toBe(
      "Replace brand picture",
    )
    expect(button("Adjust crop")).toBeDefined()
    expect(button("Remove")).toBeDefined()
  })

  it("Adjust crop opens the focus editor and Cancel closes it", () => {
    mount({ initialImageUrl: "https://cdn.example/brands/a.png" })
    expect(container.querySelector("[data-focus-editor]")).toBeNull()
    act(() => button("Adjust crop")!.click())
    expect(container.querySelector("[data-focus-editor]")).not.toBeNull()
    act(() => button("Cancel")!.click())
    expect(container.querySelector("[data-focus-editor]")).toBeNull()
  })

  it("Remove clears the picture and brings back the add box", async () => {
    m.removeBrandImage.mockResolvedValue({ ok: true, imageUrl: null, focalX: 50, focalY: 50 })
    mount({ initialImageUrl: "https://cdn.example/brands/a.png" })
    await act(async () => {
      button("Remove")!.click()
      await Promise.resolve()
    })
    expect(container.querySelector("img")).toBeNull()
    expect(m.toast.success).toHaveBeenCalledWith("Brand picture removed")
    expect(container.querySelector('input[type="file"]')!.getAttribute("aria-label")).toBe(
      "Add brand picture",
    )
  })

  it("a failed remove keeps the picture and shows the error", async () => {
    m.removeBrandImage.mockResolvedValue({ ok: false, error: "Store not found or not authorized" })
    mount({ initialImageUrl: "https://cdn.example/brands/a.png" })
    await act(async () => {
      button("Remove")!.click()
      await Promise.resolve()
    })
    expect(container.querySelector("img")).not.toBeNull()
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      "Store not found or not authorized",
    )
    expect(m.toast.error).toHaveBeenCalledWith("Store not found or not authorized")
  })

  it("a file over 2 MB is refused before any upload starts", async () => {
    mount()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })
    await act(async () => {
      Object.defineProperty(input, "files", { value: [big], configurable: true })
      input.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    expect(m.getBrandImageUploadUrl).not.toHaveBeenCalled()
    expect(m.toast.error).toHaveBeenCalledWith("Image must be smaller than 2 MB")
  })

  it("a non-image file is refused before any upload starts", async () => {
    mount()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" })
    await act(async () => {
      Object.defineProperty(input, "files", { value: [pdf], configurable: true })
      input.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    expect(m.getBrandImageUploadUrl).not.toHaveBeenCalled()
    expect(m.toast.error).toHaveBeenCalledWith("Only image files are allowed")
  })
})
