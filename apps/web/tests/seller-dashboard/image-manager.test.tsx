// @vitest-environment jsdom
//
// Product image upload box (PR 5d-12, man-t12). Written first against the hand-made drop zone
// (baseline); after the FileDropzone swap the hidden-input and accessible-name assertions change.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  getPresignedUploadUrl: vi.fn(),
  addProductImage: vi.fn(),
  removeProductImage: vi.fn(),
  reorderImages: vi.fn(),
  setImageCutout: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("@/app/seller/dashboard/products/actions", () => m)
vi.mock("@/components/toaster", () => ({ useToast: () => m.toast }))

import { ImageManager } from "@/app/seller/dashboard/products/[id]/edit/image-manager"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Class tokens of the upload box (updated by the swap only where the plan says so).
const BOX = ["h-24", "w-24", "border-2", "border-dashed", "rounded-lg", "cursor-pointer"]
const IDLE = ["border-input", "hover:border-primary", "hover:text-primary"]
const OVER = ["scale-[1.02]", "border-primary", "bg-primary/5", "text-primary"]

type XhrCtl = { instances: FakeXhr[] }
class FakeXhr {
  static ctl: XhrCtl = { instances: [] }
  status = 200
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  method = ""
  url = ""
  sent: unknown = null
  headers: Record<string, string> = {}
  constructor() {
    FakeXhr.ctl.instances.push(this)
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  send(body: unknown) {
    this.sent = body
  }
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  FakeXhr.ctl.instances = []
  vi.stubGlobal("XMLHttpRequest", FakeXhr)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const mount = () =>
  act(() => {
    root.render(<ImageManager productId="prod-1" images={[]} />)
  })
const box = () => container.querySelector("label")!
const input = () => container.querySelector<HTMLInputElement>('input[type="file"]')!
const flush = async () => {
  await act(() => new Promise<void>((r) => setTimeout(r, 0)))
  await act(() => new Promise<void>((r) => setTimeout(r, 0)))
}
function has(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
}
function lacks(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(false)
}
const drag = (el: Element, type: string, files?: File[]) =>
  act(() => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    if (files) Object.defineProperty(ev, "dataTransfer", { value: { files } })
    el.dispatchEvent(ev)
  })
const png = (size = 10) => new File([new Uint8Array(size)], "a.png", { type: "image/png" })

function setFiles(el: HTMLInputElement, files: File[]) {
  Object.defineProperty(el, "files", { value: files, configurable: true })
}

describe("upload box markup", () => {
  it("is a dashed 96 px label with the idle look and the text Add image", () => {
    mount()
    has(box(), [...BOX, ...IDLE])
    lacks(box(), OVER)
    expect(box().textContent).toContain("Add image")
  })

  it("the input accepts images only", () => {
    mount()
    expect(input().getAttribute("accept")).toBe("image/*")
    expect(input().disabled).toBe(false)
  })

  it("file input is keyboard-reachable, named and described by the hint", () => {
    mount()
    expect(input().classList.contains("hidden")).toBe(false)
    expect(input().classList.contains("sr-only")).toBe(true)
    expect(input().getAttribute("aria-label")).toBe("Add product image")
    const hint = container.querySelector(`[id="${input().getAttribute("aria-describedby")}"]`)
    expect(hint?.textContent).toContain("Max 2 MB per image")
  })
})

describe("drag and drop states", () => {
  it("drag enter shows Drop to upload and the over look", () => {
    mount()
    drag(box(), "dragenter")
    has(box(), OVER)
    expect(box().textContent).toContain("Drop to upload")
  })

  it("leaving onto a child keeps the state until the counter reaches 0", () => {
    mount()
    drag(box(), "dragenter")
    drag(box(), "dragenter") // entering a child element
    drag(box(), "dragleave") // leaving the box edge onto the child
    has(box(), OVER)
    drag(box(), "dragleave")
    lacks(box(), OVER)
    expect(box().textContent).toContain("Add image")
  })

  it("after a drop a fresh enter/leave cycle returns to idle (counter was reset)", async () => {
    m.getPresignedUploadUrl.mockResolvedValue({ error: "stop" })
    mount()
    drag(box(), "dragenter")
    drag(box(), "dragenter")
    drag(box(), "drop", [png()])
    await flush()
    lacks(box(), OVER)
    drag(box(), "dragenter")
    has(box(), OVER)
    drag(box(), "dragleave")
    lacks(box(), OVER)
  })
})

describe("choosing a file", () => {
  it("a dropped non-image shows the error and does not call the upload", () => {
    mount()
    drag(box(), "drop", [new File(["x"], "a.txt", { type: "text/plain" })])
    expect(container.textContent).toContain("Only image files are allowed")
    expect(m.toast.error).toHaveBeenCalledWith("Only image files are allowed")
    expect(m.getPresignedUploadUrl).not.toHaveBeenCalled()
  })

  it("a file over 2 MB shows the error and does not call the upload", () => {
    mount()
    drag(box(), "drop", [png(2 * 1024 * 1024 + 1)])
    expect(container.textContent).toContain("Image must be smaller than 2 MB")
    expect(m.getPresignedUploadUrl).not.toHaveBeenCalled()
  })

  it("a file at exactly 2 MB is accepted", async () => {
    m.getPresignedUploadUrl.mockResolvedValue({ error: "stop" })
    mount()
    drag(box(), "drop", [png(2 * 1024 * 1024)])
    await flush()
    expect(m.getPresignedUploadUrl).toHaveBeenCalledWith("image/png", 2 * 1024 * 1024)
  })

  async function runUpload(start: () => void | Promise<void>) {
    m.getPresignedUploadUrl.mockResolvedValue({ url: "http://s/put", key: "k1", claim: "c1" })
    m.addProductImage.mockResolvedValue({
      ok: true,
      image: { id: "img-1", url: "http://s/img-1.png", altText: null, sortOrder: 0 },
    })
    mount()
    await start()
    await flush()
    const xhr = FakeXhr.ctl.instances[0]!
    expect(xhr.method).toBe("PUT")
    expect(xhr.url).toBe("http://s/put")
    expect(xhr.headers["Content-Type"]).toBe("image/png")
    expect(m.addProductImage).not.toHaveBeenCalled()
    await act(async () => {
      xhr.onload?.()
      await Promise.resolve()
    })
    await flush()
    expect(m.addProductImage).toHaveBeenCalledWith("prod-1", "k1", "c1")
    expect(m.toast.success).toHaveBeenCalledWith("Image uploaded")
    expect(container.querySelector('img[src="http://s/img-1.png"]')).not.toBeNull()
  }

  it("a dropped image runs the presigned upload, the PUT and addProductImage", async () => {
    await runUpload(() => drag(box(), "drop", [png()]))
  })

  it("choosing a file through the input does the same as a drop", async () => {
    await runUpload(async () => {
      setFiles(input(), [png()])
      await act(async () => {
        input().dispatchEvent(new Event("change", { bubbles: true }))
        await Promise.resolve()
      })
    })
  })

  it("while uploading the input is disabled, the percentage shows and a second drop is ignored", async () => {
    m.getPresignedUploadUrl.mockResolvedValue({ url: "http://s/put", key: "k1", claim: "c1" })
    mount()
    drag(box(), "drop", [png()])
    await flush()
    const xhr = FakeXhr.ctl.instances[0]!
    await act(async () => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
      await Promise.resolve()
    })
    expect(input().disabled).toBe(true)
    expect(container.textContent).toContain("50%")
    expect(box().classList.contains("pointer-events-none")).toBe(true)
    drag(box(), "drop", [png()])
    await flush()
    expect(m.getPresignedUploadUrl).toHaveBeenCalledTimes(1)
  })

  it("only the first dropped file is used", async () => {
    m.getPresignedUploadUrl.mockResolvedValue({ error: "stop" })
    mount()
    drag(box(), "drop", [png(10), png(20)])
    await flush()
    expect(m.getPresignedUploadUrl).toHaveBeenCalledTimes(1)
    expect(m.getPresignedUploadUrl).toHaveBeenCalledWith("image/png", 10)
  })
})

describe("cut-out tick on each image", () => {
  const LABEL = "Transparent background"
  const imgs = [
    { id: "i1", url: "https://cdn.test/a.jpg", altText: null, sortOrder: 0, isCutout: false },
    { id: "i2", url: "https://cdn.test/b.png", altText: "Chair", sortOrder: 1, isCutout: true },
  ]
  const mountWith = () =>
    act(() => {
      root.render(<ImageManager productId="prod-1" images={imgs} />)
    })
  const boxes = () =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))

  it("every image has a ticked-or-not box with the approved label, saved state shown", () => {
    mountWith()
    expect(boxes()).toHaveLength(2)
    expect(boxes().map((b) => b.checked)).toEqual([false, true])
    for (const b of boxes()) expect(b.labels?.[0]?.textContent).toContain(LABEL)
  })

  it("the approved help text shows once", () => {
    mountWith()
    const hits = container.textContent.split("Shows the product floating on the coloured tile.")
    expect(hits).toHaveLength(2)
  })

  it("ticking calls setImageCutout with the image id and true, and keeps the tick", async () => {
    m.setImageCutout.mockResolvedValue({ ok: true })
    mountWith()
    act(() => boxes()[0]!.click())
    await flush()
    expect(m.setImageCutout).toHaveBeenCalledWith("i1", true)
    expect(boxes()[0]!.checked).toBe(true)
  })

  it("unticking sends false", async () => {
    m.setImageCutout.mockResolvedValue({ ok: true })
    mountWith()
    act(() => boxes()[1]!.click())
    await flush()
    expect(m.setImageCutout).toHaveBeenCalledWith("i2", false)
    expect(boxes()[1]!.checked).toBe(false)
  })

  it("the box is disabled while its save runs, so a fast second click cannot race the first", async () => {
    let finish!: (v: { ok: true }) => void
    m.setImageCutout.mockReturnValue(new Promise((r) => (finish = r)))
    mountWith()
    act(() => boxes()[0]!.click())
    expect(boxes()[0]!.disabled).toBe(true)
    expect(boxes()[1]!.disabled).toBe(false)
    act(() => boxes()[0]!.click())
    expect(m.setImageCutout).toHaveBeenCalledTimes(1)
    act(() => finish({ ok: true }))
    await flush()
    expect(boxes()[0]!.disabled).toBe(false)
  })

  it("if saving fails, the box goes back and the error shows", async () => {
    m.setImageCutout.mockResolvedValue({ ok: false, error: "Image not found or not authorized" })
    mountWith()
    act(() => boxes()[0]!.click())
    await flush()
    expect(boxes()[0]!.checked).toBe(false)
    expect(m.toast.error).toHaveBeenCalledWith("Image not found or not authorized")
  })
})
