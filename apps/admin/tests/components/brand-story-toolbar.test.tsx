// @vitest-environment jsdom
//
// Brand story editor toolbar buttons (PR 5d-9, man-t32). Written first against the five raw <button>
// definitions (baseline); after the local ToolbarIconButton swap only the TOKENS expectations change.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BrandStoryField } from "@/components/brand-story-field"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout; tiptap/ProseMirror need these to exist.
beforeEach(() => {
  const proto = Range.prototype as unknown as Record<string, unknown>
  proto["getBoundingClientRect"] ??= () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  })
  proto["getClientRects"] ??= () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  })
})

// Class tokens. The swap task updates these (and only these).
const TOKENS = {
  common: [
    "min-h-11",
    "min-w-11",
    "rounded",
    "px-2",
    "text-sm",
    "focus-visible:outline",
    "focus-visible:outline-2",
    "focus-visible:outline-offset-2",
    "focus-visible:outline-ring",
  ],
  inactive: ["bg-background", "text-foreground", "hover:bg-muted"],
  active: ["bg-accent", "text-accent-foreground"],
  tableTrigger: [
    "bg-background",
    "text-foreground",
    "hover:bg-muted",
    "data-[state=open]:bg-accent",
    "data-[state=open]:text-accent-foreground",
  ],
}

let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<BrandStoryField value="<p>hello</p>" onChange={() => {}} ariaLabel="Story" />)
    await Promise.resolve()
  })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const btn = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[role="toolbar"] [aria-label="${label}"]`)!
function has(el: Element, tokens: string[]) {
  for (const t of tokens) expect(el.classList.contains(t), `${t} on ${el.className}`).toBe(true)
}

const FIVE = [
  ["Bold", "toggle"],
  ["Set or unset link", "toggle"],
  ["Insert image by URL", "static"],
  ["Insert table", "trigger"],
  ["Embed YouTube video", "static"],
] as const

describe("toolbar buttons", () => {
  it.each(FIVE)("%s is a type=button with a title and the 44 px target", (label) => {
    const b = btn(label)
    expect(b).not.toBeNull()
    expect(b.tagName).toBe("BUTTON")
    expect(b.getAttribute("type")).toBe("button")
    expect(b.getAttribute("title")).toBeTruthy()
    has(b, TOKENS.common)
  })

  it("toggles expose aria-pressed; static buttons and the table trigger do not", () => {
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("false")
    expect(btn("Set or unset link").getAttribute("aria-pressed")).toBe("false")
    expect(btn("Insert image by URL").hasAttribute("aria-pressed")).toBe(false)
    expect(btn("Embed YouTube video").hasAttribute("aria-pressed")).toBe(false)
    expect(btn("Insert table").hasAttribute("aria-pressed")).toBe(false)
  })

  it("every toolbar toggle button (twelve, via ToolbarButton or LinkButton) is a 44 px button", () => {
    const all = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
    expect(all.length).toBeGreaterThanOrEqual(15)
    for (const b of all) has(b, ["min-h-11", "min-w-11"])
  })

  it("the table trigger opens its popover and marks itself open", async () => {
    const trigger = btn("Insert table")
    expect(trigger.getAttribute("data-state")).toBe("closed")
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    expect(trigger.getAttribute("data-state")).toBe("open")
    expect(document.body.querySelector('[aria-label="Insert table"][role="dialog"]')).not.toBeNull()
  })

  it("class tokens: inactive, table trigger (updated by the swap)", () => {
    has(btn("Bold"), TOKENS.inactive)
    has(btn("Insert image by URL"), TOKENS.inactive)
    has(btn("Embed YouTube video"), TOKENS.inactive)
    has(btn("Set or unset link"), TOKENS.inactive)
    has(btn("Insert table"), TOKENS.tableTrigger)
  })

  it("an active toggle takes the accent colours (cursor inside a heading)", async () => {
    await act(async () => {
      root.render(
        <BrandStoryField key="h" value="<h3>hi</h3>" onChange={() => {}} ariaLabel="Story" />,
      )
      await new Promise((r) => setTimeout(r, 50))
    })
    const h3 = btn("Heading 3")
    expect(h3.getAttribute("aria-pressed")).toBe("true")
    has(h3, TOKENS.active)
    expect(h3.classList.contains("bg-background")).toBe(false)
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("false")
  })
})
