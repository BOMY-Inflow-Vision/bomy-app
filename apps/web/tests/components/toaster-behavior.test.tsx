// @vitest-environment jsdom
//
// Announcement, queue, timers and dismiss behaviour of the toaster (PR 5d-11). Written first
// against the hand-built banner and raw dismiss button (baseline); after the Alert and Button swap
// only the dismiss control's class-token expectations changed. The live
// region, what is announced, the timers and the queue must not.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/x" }))

import { MAX_TOASTS, ToastProvider, stackLayout, useToast } from "@/components/toaster"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof useToast>
let api: Api
function Capture() {
  api = useToast()
  return null
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  document.cookie = "bomy_flash=; Max-Age=0; Path=/"
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

function mount(flash: string | null = null) {
  act(() => {
    root.render(
      <ToastProvider flash={flash}>
        <Capture />
      </ToastProvider>,
    )
  })
}

const region = () => container.querySelector<HTMLElement>('[role="region"]')!
const banners = () => [...container.querySelectorAll<HTMLElement>("li .pointer-events-auto")]
const rows = () => [...container.querySelectorAll("li")]
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const hover = (el: Element, over: boolean) =>
  act(() => {
    el.dispatchEvent(
      new MouseEvent(over ? "mouseover" : "mouseout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    )
  })

const COMMON = [
  "pointer-events-auto",
  "flex",
  "animate-toast-in",
  "items-center",
  "gap-3",
  "rounded-lg",
  "border",
  "p-4",
  "shadow-lg",
  "motion-reduce:animate-none",
]
const TYPES = {
  success: { tokens: ["border-success/30", "bg-success-subtle", "text-success"], sr: null },
  info: { tokens: ["border-info/30", "bg-info-subtle", "text-info"], sr: null },
  warning: { tokens: ["border-warning/30", "bg-warning-subtle", "text-warning"], sr: "Warning: " },
  error: { tokens: ["border-destructive/30", "bg-card", "text-destructive"], sr: "Error: " },
} as const

describe.each(Object.entries(TYPES))("a %s toast on its own", (type, spec) => {
  function show() {
    mount()
    act(() => api[type as keyof Api](`Message ${type}`))
  }

  it("is announced only through the one polite live region", () => {
    show()
    const live = container.querySelectorAll("[aria-live]")
    expect(live).toHaveLength(1)
    const r = region()
    expect(live[0]).toBe(r)
    expect(r.getAttribute("aria-label")).toBe("Notifications")
    expect(r.getAttribute("aria-live")).toBe("polite")
    expect(r.getAttribute("aria-relevant")).toBe("additions text")
    expect(r.contains(banners()[0]!)).toBe(true)
    for (const el of r.querySelectorAll("*")) {
      for (const a of ["role", "aria-live", "aria-atomic", "aria-relevant"]) {
        expect(el.hasAttribute(a), `${el.tagName} has ${a}`).toBe(false)
      }
    }
    expect(container.querySelectorAll("[role=alert],[role=status]")).toHaveLength(0)
  })

  it("keeps its screen-reader prefix, message and hidden icon", () => {
    show()
    const p = banners()[0]!.querySelector("p")!
    const sr = p.querySelector(".sr-only")
    if (spec.sr) expect(sr?.textContent).toBe(spec.sr)
    else expect(sr).toBeNull()
    expect(p.textContent).toBe(`${spec.sr ?? ""}Message ${type}`)
    expect(banners()[0]!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
  })

  it("has the same banner look", () => {
    show()
    const cls = [...banners()[0]!.classList]
    expect(cls).toEqual(expect.arrayContaining([...COMMON, ...spec.tokens]))
    if (type === "error") expect(cls).not.toContain("bg-destructive/10")
    expect(cls).not.toContain("animate-toast-out")
  })

  it("has a dismiss button with its name and type", () => {
    show()
    const btn = banners()[0]!.querySelector("button")!
    expect(btn.getAttribute("type")).toBe("button")
    expect(btn.getAttribute("aria-label")).toBe("Dismiss notification")
    expect(btn.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true")
    expect(btn.querySelector("svg")!.getAttribute("class")).toContain("size-4")
  })
})

// The dismiss control's own classes. It is the shared ghost icon Button with overrides that keep
// today's 24 px round control, foreground/10 hover, inherited text colour and 2 px current ring.
const DISMISS = [
  "h-6",
  "w-6",
  "shrink-0",
  "cursor-pointer",
  "rounded-full",
  "p-0",
  "transition-colors",
  "hover:bg-foreground/10",
  "hover:text-current",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-current",
]
it("the dismiss control keeps its look through the shared Button", () => {
  mount()
  act(() => api.success("x"))
  const btn = banners()[0]!.querySelector("button")!
  const cls = [...btn.classList]
  expect(cls).toEqual(expect.arrayContaining(DISMISS))
  for (const gone of [
    "h-9",
    "w-9",
    "p-1",
    "hover:bg-accent",
    "hover:text-accent-foreground",
    "focus-visible:ring-1",
    "focus-visible:ring-ring",
  ]) {
    expect(cls, gone).not.toContain(gone)
  }
})

describe("timers, pause and queue", () => {
  it("dismisses after 3000 ms and removes the row 300 ms later", () => {
    mount()
    act(() => api.success("A"))
    advance(2999)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(false)
    advance(1)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(true)
    advance(299)
    expect(rows()).toHaveLength(1)
    advance(1)
    expect(rows()).toHaveLength(0)
  })

  it("hover pauses the timer and leaving restarts a full 3000 ms", () => {
    mount()
    act(() => api.success("A"))
    advance(2000)
    hover(banners()[0]!, true)
    advance(10_000)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(false)
    hover(banners()[0]!, false)
    advance(2999)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(false)
    advance(1)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(true)
  })

  it("focus on the dismiss control pauses and blur resumes", () => {
    mount()
    act(() => api.info("A"))
    const btn = banners()[0]!.querySelector("button")!
    advance(2000)
    act(() => btn.focus())
    advance(10_000)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(false)
    act(() => btn.blur())
    advance(3000)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(true)
  })

  it("an identical message refreshes the timer instead of stacking", () => {
    mount()
    act(() => api.warning("Same"))
    advance(2000)
    act(() => api.warning("Same"))
    expect(rows()).toHaveLength(1)
    advance(2000)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(false)
    advance(1000)
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(true)
  })

  it(`a ${MAX_TOASTS + 1}th distinct toast starts dismissing the oldest`, () => {
    mount()
    for (const m of ["A", "B", "C", "D"]) act(() => api.success(m))
    const b = banners()
    expect(b).toHaveLength(4)
    expect(b.map((x) => x.classList.contains("animate-toast-out"))).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it("click on dismiss starts the exit and removes the row 300 ms later", () => {
    mount()
    act(() => api.error("A"))
    act(() => banners()[0]!.querySelector("button")!.click())
    expect(banners()[0]!.classList.contains("animate-toast-out")).toBe(true)
    advance(299)
    expect(rows()).toHaveLength(1)
    advance(1)
    expect(rows()).toHaveLength(0)
  })
})

describe("flash cookie", () => {
  it("shows the flashed toast once and clears the cookie", () => {
    document.cookie = `bomy_flash=${encodeURIComponent(JSON.stringify({ type: "warning", message: "Flash me" }))}; Path=/`
    mount("v1")
    expect(banners()).toHaveLength(1)
    expect(banners()[0]!.textContent).toContain("Flash me")
    expect(banners()[0]!.classList.contains("text-warning")).toBe(true)
    expect(document.cookie).not.toContain("bomy_flash")
  })

  it("ignores an invalid cookie but still clears it", () => {
    document.cookie = "bomy_flash=garbage; Path=/"
    mount("v1")
    expect(banners()).toHaveLength(0)
    expect(document.cookie).not.toContain("bomy_flash")
  })
})

describe("position", () => {
  it("keeps the fixed container where it is", () => {
    mount()
    const cls = [...region().classList]
    expect(cls).toEqual(
      expect.arrayContaining([
        "pointer-events-none",
        "fixed",
        "inset-x-4",
        "z-[60]",
        "sm:left-auto",
        "sm:w-80",
      ]),
    )
    expect(cls).toContain("top-[calc(var(--nav-height)+var(--nav-offset)+1rem)]")
  })
})

describe("stack layout", () => {
  const t = (id: number) => ({
    id,
    type: "info" as const,
    message: `m${id}`,
    leaving: false,
    bump: 0,
  })

  it("puts the newest toast in front at the top, older ones smaller and peeking below it", () => {
    const { items, height } = stackLayout([t(1), t(2), t(3)], { 1: 60, 2: 60, 3: 60 }, false)
    expect(items.get(3)).toEqual({ y: 0, scale: 1, behind: false })
    expect(items.get(2)).toEqual({ y: 60 - 0.9 * 60 + 12, scale: 0.9, behind: true })
    expect(items.get(1)?.scale).toBeCloseTo(0.8)
    expect(items.get(1)?.y).toBeCloseTo(60 - 0.8 * 60 + 24)
    expect(height).toBe(60 + 2 * 12)
  })

  it("spreads the toasts out with an 8 px gap when the stack is open", () => {
    const { items, height } = stackLayout([t(1), t(2)], { 1: 50, 2: 70 }, true)
    expect(items.get(2)).toEqual({ y: 0, scale: 1, behind: false })
    expect(items.get(1)).toEqual({ y: 78, scale: 1, behind: false })
    expect(height).toBe(70 + 8 + 50)
  })

  it("has no height with no toasts", () => {
    expect(stackLayout([], {}, false).height).toBe(0)
  })
})
