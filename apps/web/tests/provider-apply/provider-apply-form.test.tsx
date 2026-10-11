import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/provider/apply/actions", () => ({
  submitProviderApplication: vi.fn(),
}))

import { ToastProvider } from "@/components/toaster"
import { ProviderApplyForm } from "@/app/provider/apply/provider-apply-form"

const CATEGORIES = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Graphic Design" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Videography" },
]

describe("ProviderApplyForm", () => {
  it("renders the Radix combobox trigger and its hidden required select, with no option text on the server", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <ProviderApplyForm categories={CATEGORIES} />
      </ToastProvider>,
    )
    // Attribute order is not part of the contract: read each tag, then check attributes.
    const button = html.match(/<button[^>]*id="serviceCategoryChoice"[^>]*>/)?.[0] ?? ""
    expect(button).toContain('role="combobox"')
    expect(button).toContain('aria-required="true"')
    const select = html.match(/<select[^>]*name="serviceCategoryChoice"[^>]*>/)?.[0] ?? ""
    expect(select).toContain('aria-hidden="true"')
    expect(select).toContain("required")
    expect(html).not.toMatch(/<option/)
    expect(html).toMatch(/<label[^>]*for="serviceCategoryChoice"[^>]*>\s*Service Category \*/)
  })

  it("with a real category preselected, the description is optional", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <ProviderApplyForm categories={CATEGORIES} />
      </ToastProvider>,
    )
    expect(html).toContain("(optional)")
    expect(html).not.toMatch(/id="businessDescription"[^>]*required/)
  })

  it("with no categories seeded at all, 'Other' is the only choice, so the description is required", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <ProviderApplyForm categories={[]} />
      </ToastProvider>,
    )
    expect(html).not.toContain("(optional)")
    expect(html).toMatch(/id="businessDescription"[^>]*required/)
  })
})
