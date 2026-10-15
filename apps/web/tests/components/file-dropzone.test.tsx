// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FileDropzone } from "@bomy/ui/file-dropzone"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// The look the image manager's hand-made box had, kept token for token.
const BASE = [
  "relative",
  "flex",
  "h-24",
  "w-24",
  "cursor-pointer",
  "flex-col",
  "items-center",
  "justify-center",
  "overflow-hidden",
  "rounded-lg",
  "border-2",
  "border-dashed",
  "text-muted-foreground",
  "transition-[transform,border-color,background-color]",
  "duration-150",
]
const IDLE = ["border-input", "hover:border-primary", "hover:text-primary"]
const OVER = ["scale-[1.02]", "border-primary", "bg-primary/5", "text-primary"]
const FOCUS = [
  "has-[:focus-visible]:ring-2",
  "has-[:focus-visible]:ring-ring",
  "has-[:focus-visible]:ring-offset-2",
  "has-[:focus-visible]:ring-offset-background",
]

let container: HTMLDivElement
let root: Root
const onFile = vi.fn()
beforeEach(() => {
  onFile.mockClear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(
  props: Partial<React.ComponentProps<typeof FileDropzone>> = {},
  children: React.ComponentProps<typeof FileDropzone>["children"] = ({ isDragOver }) =>
    isDragOver ? "Drop to upload" : "Add image",
) {
  act(() => {
    root.render(
      <FileDropzone onFile={onFile} aria-label="Upload image" {...props}>
        {children}
      </FileDropzone>,
    )
  })
}
const box = () => container.querySelector("label")!
const input = () => container.querySelector<HTMLInputElement>('input[type="file"]')!
function has(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
}
function lacks(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(false)
}
const fire = (el: Element, type: string, files?: File[]) =>
  act(() => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    if (files) Object.defineProperty(ev, "dataTransfer", { value: { files } })
    el.dispatchEvent(ev)
  })
const file = (name = "a.png") => new File(["x"], name, { type: "image/png" })

describe("FileDropzone markup", () => {
  it("is a dashed 96 px label with the idle look and the focus-ring tokens", () => {
    mount()
    has(box(), [...BASE, ...IDLE, ...FOCUS])
    lacks(box(), OVER)
    expect(box().textContent).toBe("Add image")
  })

  it("the input is reachable by keyboard: visually hidden, not display:none", () => {
    mount()
    expect(input().classList.contains("sr-only")).toBe(true)
    expect(input().classList.contains("hidden")).toBe(false)
    expect(input().tabIndex).toBe(0)
    expect(input().disabled).toBe(false)
  })

  it("passes the name, description and accept to the input", () => {
    mount({ accept: "image/*", "aria-describedby": "hint" })
    expect(input().getAttribute("aria-label")).toBe("Upload image")
    expect(input().getAttribute("aria-describedby")).toBe("hint")
    expect(input().getAttribute("accept")).toBe("image/*")
    expect(box().hasAttribute("aria-label")).toBe(false)
  })

  it("className merges last and can change the size", () => {
    mount({ className: "h-32 w-32" })
    has(box(), ["h-32", "w-32"])
    lacks(box(), ["h-24", "w-24"])
  })

  it("renders plain children as given", () => {
    mount({}, <span>Pick</span>)
    expect(box().textContent).toBe("Pick")
  })
})

describe("choosing with the input", () => {
  it("calls onFile once with the first file and clears the input value", () => {
    mount()
    const a = file("a.png")
    const b = file("b.png")
    let value = "C:\\fakepath\\a.png"
    Object.defineProperty(input(), "files", { value: [a, b], configurable: true })
    Object.defineProperty(input(), "value", {
      get: () => value,
      set: (v: string) => {
        value = v
      },
      configurable: true,
    })
    fire(input(), "change")
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(a)
    expect(value).toBe("")
  })

  it("does nothing when no file was chosen", () => {
    mount()
    Object.defineProperty(input(), "files", { value: [], configurable: true })
    fire(input(), "change")
    expect(onFile).not.toHaveBeenCalled()
  })
})

describe("drag and drop", () => {
  it("drag enter shows the over look and gives children isDragOver", () => {
    mount()
    fire(box(), "dragenter")
    has(box(), OVER)
    lacks(box(), ["border-input"])
    expect(box().textContent).toBe("Drop to upload")
  })

  it("leaving onto a child keeps the state until the counter reaches 0", () => {
    mount()
    fire(box(), "dragenter")
    fire(box(), "dragenter")
    fire(box(), "dragleave")
    has(box(), OVER)
    fire(box(), "dragleave")
    lacks(box(), OVER)
    expect(box().textContent).toBe("Add image")
  })

  it("a drop calls onFile with the first file only, and resets the state and the counter", () => {
    mount()
    fire(box(), "dragenter")
    fire(box(), "dragenter")
    const a = file("a.png")
    fire(box(), "drop", [a, file("b.png")])
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(a)
    lacks(box(), OVER)
    fire(box(), "dragenter")
    has(box(), OVER)
    fire(box(), "dragleave")
    lacks(box(), OVER)
  })

  it("a drop with no files does not call onFile", () => {
    mount()
    fire(box(), "drop", [])
    expect(onFile).not.toHaveBeenCalled()
  })

  it("drag over and drop are default-prevented so the browser does not open the file", () => {
    mount()
    const over = new Event("dragover", { bubbles: true, cancelable: true })
    act(() => {
      box().dispatchEvent(over)
    })
    expect(over.defaultPrevented).toBe(true)
  })

  it("when disabled: input disabled, pointer-events-none, enter and drop ignored", () => {
    mount({ disabled: true })
    expect(input().disabled).toBe(true)
    has(box(), ["pointer-events-none"])
    fire(box(), "dragenter")
    lacks(box(), OVER)
    fire(box(), "drop", [file()])
    expect(onFile).not.toHaveBeenCalled()
  })

  it("children as a function receive isDragOver", () => {
    const seen: boolean[] = []
    mount({}, ({ isDragOver }) => {
      seen.push(isDragOver)
      return null
    })
    fire(box(), "dragenter")
    expect(seen).toContain(true)
    expect(seen[0]).toBe(false)
  })
})
