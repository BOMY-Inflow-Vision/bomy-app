// @vitest-environment jsdom
//
// Baseline for the /provider/apply category control (PR 5b, plan Step 3b proofs a-c).
// Written against the NATIVE <select> so it records today's behaviour. The migration to the
// @bomy/ui Select must keep every literal below; only `choose()` (the interaction helper) changes.
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

// INTERACTION HELPER: the only thing the migration changes (a native `change` event today;
// typeahead keys on the Radix trigger afterwards).
async function choose(value: string) {
  const el = byId("serviceCategoryChoice")
  if (!(el instanceof HTMLSelectElement)) throw new Error("native select expected")
  await act(async () => {
    el.value = value
    el.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
  })
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
    const el = byId("serviceCategoryChoice")
    expect(el.tagName).toBe("SELECT")
    expect((el as HTMLSelectElement).value).toBe(C1)
    expect([...(el as HTMLSelectElement).options].map((o) => [o.value, o.textContent])).toEqual([
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
    expect((byId("serviceCategoryChoice") as HTMLSelectElement).value).toBe(C2)
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
    const el = byId("serviceCategoryChoice") as HTMLSelectElement
    expect([...el.options].map((o) => [o.value, o.textContent])).toEqual([[OTHER, "Other"]])
    expect(el.value).toBe(OTHER)
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

  it("V5 the control carries the required marker", async () => {
    await render()
    expect(byId("serviceCategoryChoice").hasAttribute("required")).toBe(true)
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
  it("E1 the UI offers no empty option and no placeholder", async () => {
    await render()
    const el = byId("serviceCategoryChoice") as HTMLSelectElement
    expect([...el.options].some((o) => o.value === "")).toBe(false)
  })

  it("E2 a forced empty value (not reachable by clicking) cannot stick: React snaps the control back to its first option, so it stays valid", async () => {
    // Latent quirk, recorded and NOT a requirement: the component's state becomes "" while the DOM
    // shows the first option, so serviceCategoryId posts "" next to serviceCategoryChoice = C1.
    await render()
    fillRequired()
    const el = byId("serviceCategoryChoice") as HTMLSelectElement
    await act(async () => {
      el.selectedIndex = -1
      el.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    expect(el.selectedIndex).toBe(0)
    expect(el.value).toBe(C1)
    expect(invalidIds()).toEqual([])
    await submit()
    expect(sentEntries()).toEqual(base(C1, ""))
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
    const el = byId("serviceCategoryChoice") as HTMLSelectElement
    expect(el.getAttribute("aria-invalid")).toBe("true")
    expect(el.getAttribute("aria-describedby")).toBe("serviceCategoryId-error")
    const alert = byId("serviceCategoryId-error")
    expect(alert.getAttribute("role")).toBe("alert")
    expect(alert.textContent).toBe("That category is no longer available. Please pick another.")
    expect(el.value).toBe(C2)
  })

  it("E4 without a category error the control has no aria-invalid and no aria-describedby", async () => {
    await render()
    const el = byId("serviceCategoryChoice")
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
