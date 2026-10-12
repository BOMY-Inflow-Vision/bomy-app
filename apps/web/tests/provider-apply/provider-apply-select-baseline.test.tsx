// @vitest-environment jsdom
//
// Contract for the /provider/apply category control (PR 5b, plan Step 3b proofs a-c).
// Written first against the NATIVE <select> (commit f6ac6d5); now run against the @bomy/ui Select.
// Expected choices, validation outcomes, ordered FormData and error behaviour are unchanged.
// Only these REPRESENTATIONS changed (listed in the PR body): `choose()` (typeahead keys),
// reading the current choice and option list (hidden select + trigger text), V5 (aria-required),
// E1/E2 (no placeholder), and the T1/T2 typeahead tests.
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const submitProviderApplication = vi.hoisted(() => vi.fn())

vi.mock("@/components/toaster", () => ({ useToast: () => toast }))
vi.mock("@/app/provider/apply/actions", () => ({ submitProviderApplication }))

import { ProviderApplyForm } from "@/app/provider/apply/provider-apply-form"
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const C1 = "11111111-1111-1111-1111-111111111111"
const C2 = "22222222-2222-2222-2222-222222222222"
const CATEGORIES = [
  { id: C1, name: "Graphic Design" },
  { id: C2, name: "Videography" },
]
const OTHER = "__other__"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  lastKeyAt = 0
  vi.clearAllMocks()
  submitProviderApplication.mockResolvedValue({ ok: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(categories = CATEGORIES) {
  await act(async () => {
    root.render(<ProviderApplyForm categories={categories} />)
    await Promise.resolve()
  })
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} not found`)
  return el
}

function form(): HTMLFormElement {
  const f = container.querySelector("form")
  if (!f) throw new Error("no form")
  return f
}

function setValue(id: string, value: string) {
  const el = byId(id)
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    throw new Error(`#${id} is not a text control`)
  }
  el.value = value
}

function fillRequired() {
  setValue("name", "Aina Rahman")
  setValue("contactEmail", "aina@example.com")
  setValue("contactNumber", "+60 12-345 6789")
  setValue("companyName", "Aina Studio")
}

// REPRESENTATION HELPERS (changed by the migration; the expected values are not).
function trigger(): HTMLElement {
  const el = byId("serviceCategoryChoice")
  if (el.tagName !== "BUTTON" || el.getAttribute("role") !== "combobox") {
    throw new Error("combobox trigger expected")
  }
  return el
}

// Radix's hidden native select is what the browser submits and validates.
function hidden(): HTMLSelectElement {
  const el = container.querySelector('select[name="serviceCategoryChoice"]')
  if (!(el instanceof HTMLSelectElement)) throw new Error("hidden select expected")
  return el
}

// The current choice as the user sees it (trigger text) and as it is submitted (hidden value).
function chosen(): { value: string; label: string } {
  return { value: hidden().value, label: trigger().textContent ?? "" }
}

const FIRST_KEY: Record<string, string> = { [C1]: "G", [C2]: "V", [OTHER]: "O" }

let lastKeyAt = 0

async function key(k: string, delay = 0) {
  const el = trigger()
  el.focus()
  lastKeyAt = Date.now()
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  if (delay) await act(async () => void (await new Promise((r) => setTimeout(r, delay))))
}

// Choose by real typeahead on the closed trigger (Radix's own keyboard path).
// Radix keeps typed characters for 1 s, so a second choice in the same test waits that window
// out (otherwise "O" then "G" would search "OG").
async function choose(value: string) {
  const wait = 1050 - (Date.now() - lastKeyAt)
  if (lastKeyAt && wait > 0)
    await act(async () => void (await new Promise((r) => setTimeout(r, wait))))
  await key(FIRST_KEY[value]!)
}

// Returns the ids of the controls that fail constraint validation, in DOM order.
function invalidIds(): string[] {
  return [...form().querySelectorAll(":invalid")].map((e) => e.id)
}

async function submit() {
  await act(async () => {
    form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function sentEntries(): Array<[string, string]> {
  const call = submitProviderApplication.mock.calls[0]
  if (!call) throw new Error("action not called")
  const fd: unknown = call[0]
  if (!(fd instanceof FormData)) throw new Error("argument is not FormData")
  return [...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name])
}

function base(choice: string, id: string, description = ""): Array<[string, string]> {
  return [
    ["name", "Aina Rahman"],
    ["contactEmail", "aina@example.com"],
    ["contactNumber", "+60 12-345 6789"],
    ["companyName", "Aina Studio"],
    ["serviceCategoryChoice", choice],
    ["businessDescription", description],
    ["serviceCategoryId", id],
  ]
}

describe("state: what the control shows and how the description reacts", () => {
  it("S1 first category is selected on mount; description is optional", async () => {
    await render()
    expect(chosen()).toEqual({ value: C1, label: "Graphic Design" })
    expect([...hidden().options].map((o) => [o.value, o.textContent])).toEqual([
      [C1, "Graphic Design"],
      [C2, "Videography"],
      [OTHER, "Other"],
    ])
    expect(byId("businessDescription").hasAttribute("required")).toBe(false)
    expect(container.textContent).toContain("(optional)")
  })

  it("S2 choosing another category keeps the description optional", async () => {
    await render()
    await choose(C2)
    expect(chosen()).toEqual({ value: C2, label: "Videography" })
    expect(byId("businessDescription").hasAttribute("required")).toBe(false)
  })

  it("S3 choosing Other makes the description required and swaps (optional) for *; leaving Other reverses it", async () => {
    await render()
    await choose(OTHER)
    expect(byId("businessDescription").hasAttribute("required")).toBe(true)
    expect(container.textContent).not.toContain("(optional)")
    expect(container.querySelector('label[for="businessDescription"]')?.textContent).toContain("*")
    await choose(C1)
    expect(byId("businessDescription").hasAttribute("required")).toBe(false)
    expect(container.textContent).toContain("(optional)")
  })

  it("S4 with no categories, Other is the only option, selected, and the description is required", async () => {
    await render([])
    expect([...hidden().options].map((o) => [o.value, o.textContent])).toEqual([[OTHER, "Other"]])
    expect(chosen()).toEqual({ value: OTHER, label: "Other" })
    expect(byId("businessDescription").hasAttribute("required")).toBe(true)
  })
})

describe("validation: the category control is never what blocks submit", () => {
  it("V1 with the other required fields filled, a first/second category and Other-with-description are valid", async () => {
    await render()
    fillRequired()
    expect(form().checkValidity()).toBe(true)
    await choose(C2)
    expect(form().checkValidity()).toBe(true)
    await choose(OTHER)
    setValue("businessDescription", "We repair film cameras.")
    expect(form().checkValidity()).toBe(true)
    expect(invalidIds()).toEqual([])
  })

  it("V2 Other with an empty description is invalid, and the failing control is the description", async () => {
    await render()
    fillRequired()
    await choose(OTHER)
    expect(form().checkValidity()).toBe(false)
    expect(invalidIds()).toEqual(["businessDescription"])
  })

  it("V3 no categories: valid once the description is filled; before that only the description fails", async () => {
    await render([])
    fillRequired()
    expect(invalidIds()).toEqual(["businessDescription"])
    setValue("businessDescription", "Printing and packaging.")
    expect(form().checkValidity()).toBe(true)
  })

  it("V4 required fields left empty: the failing controls are the text inputs, never the category control", async () => {
    await render()
    expect(invalidIds()).toEqual(["name", "contactEmail", "contactNumber", "companyName"])
  })

  it("V5 the control carries the required marker (trigger aria-required; hidden select required)", async () => {
    await render()
    expect(trigger().getAttribute("aria-required")).toBe("true")
    expect(hidden().required).toBe(true)
  })
})

describe("FormData: the full entry list posted to the server action", () => {
  it("F1 first category, untouched", async () => {
    await render()
    fillRequired()
    await submit()
    expect(sentEntries()).toEqual(base(C1, C1))
  })

  it("F2 second category", async () => {
    await render()
    fillRequired()
    await choose(C2)
    await submit()
    expect(sentEntries()).toEqual(base(C2, C2))
  })

  it('F3 Other: the choice is "__other__" and serviceCategoryId is "" (empty selection means Other)', async () => {
    await render()
    fillRequired()
    await choose(OTHER)
    setValue("businessDescription", "We repair film cameras.")
    await submit()
    expect(sentEntries()).toEqual(base(OTHER, "", "We repair film cameras."))
  })

  it("F4 no categories seeded: Other only", async () => {
    await render([])
    fillRequired()
    setValue("businessDescription", "Printing and packaging.")
    await submit()
    expect(sentEntries()).toEqual(base(OTHER, "", "Printing and packaging."))
  })

  it("F5 a category with a description posts both", async () => {
    await render()
    fillRequired()
    setValue("businessDescription", "Logos and brand kits.")
    await submit()
    expect(sentEntries()).toEqual(base(C1, C1, "Logos and brand kits."))
  })

  it("F6 submit runs once per submit event", async () => {
    await render()
    fillRequired()
    await submit()
    expect(submitProviderApplication).toHaveBeenCalledTimes(1)
  })
})

describe("empty selection and server errors", () => {
  it("E1 the trigger always shows a category or Other, never a placeholder (replaces the native no-empty-option and forced-empty checks, which cannot occur)", async () => {
    await render()
    expect(trigger().hasAttribute("data-placeholder")).toBe(false)
    expect([...hidden().options].some((o) => o.value === "")).toBe(false)
    expect(chosen().label).not.toBe("")
  })

  it("E1b with no categories the trigger shows Other, never a placeholder", async () => {
    await render([])
    expect(trigger().hasAttribute("data-placeholder")).toBe(false)
    expect(chosen()).toEqual({ value: OTHER, label: "Other" })
  })

  it("E3 a serviceCategoryId error sets aria-invalid and aria-describedby on the control, shows the alert, and keeps the choice", async () => {
    submitProviderApplication.mockResolvedValue({
      ok: false,
      errors: {
        serviceCategoryId: "That category is no longer available. Please pick another.",
        code: "inactive_category",
      },
    })
    await render()
    fillRequired()
    await choose(C2)
    await submit()
    const el = trigger()
    expect(el.getAttribute("aria-invalid")).toBe("true")
    expect(el.getAttribute("aria-describedby")).toBe("serviceCategoryId-error")
    const alert = byId("serviceCategoryId-error")
    expect(alert.getAttribute("role")).toBe("alert")
    expect(alert.textContent).toBe("That category is no longer available. Please pick another.")
    expect(chosen()).toEqual({ value: C2, label: "Videography" })
  })

  it("E4 without a category error the control has no aria-invalid and no aria-describedby", async () => {
    await render()
    const el = trigger()
    expect(el.hasAttribute("aria-invalid")).toBe(false)
    expect(el.hasAttribute("aria-describedby")).toBe(false)
  })

  it("E5 the label is wired to the control", async () => {
    await render()
    expect(container.querySelector('label[for="serviceCategoryChoice"]')?.textContent?.trim()).toBe(
      "Service Category *",
    )
  })
})

// Multi-key typeahead on the trigger. The seeded names share no prefix, so these use two pairs
// that do. Keys are 150 ms apart, inside Radix's 1 s window. jsdom is NOT proof for the pinned
// version (it hid #4097); the same literals run in a production build in the browser proof.
const TYPEAHEAD = [
  { id: "id-gd", name: "Graphic Design" },
  { id: "id-ph", name: "Photography" },
  { id: "id-pe", name: "Photo Editing" },
  { id: "id-pd", name: "Print Design" },
  { id: "id-ps", name: "Printing Services" },
]

async function typeSteps(keys: string[]): Promise<string[]> {
  const seen: string[] = []
  for (const k of keys) {
    await key(k, 150)
    seen.push(chosen().label)
  }
  return seen
}

describe("typeahead: multi-key accumulation", () => {
  it("T1 p h o t o then space then e: Photography until the space, then Photo Editing", async () => {
    await render(TYPEAHEAD)
    expect(await typeSteps(["p", "h", "o", "t", "o", " ", "e"])).toEqual([
      "Photography",
      "Photography",
      "Photography",
      "Photography",
      "Photography",
      "Photo Editing",
      "Photo Editing",
    ])
    expect(chosen().value).toBe("id-pe")
    fillRequired()
    await submit()
    expect(sentEntries()).toEqual(base("id-pe", "id-pe"))
  })

  it("T2 p r i n t i: Print Design until the last i, then Printing Services", async () => {
    await render(TYPEAHEAD)
    expect(await typeSteps(["p", "r", "i", "n", "t", "i"])).toEqual([
      "Photography",
      "Print Design",
      "Print Design",
      "Print Design",
      "Print Design",
      "Printing Services",
    ])
    expect(chosen().value).toBe("id-ps")
    fillRequired()
    await submit()
    expect(sentEntries()).toEqual(base("id-ps", "id-ps"))
  })
})
