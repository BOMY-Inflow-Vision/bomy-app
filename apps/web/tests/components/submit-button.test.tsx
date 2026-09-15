import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SubmitButton } from "@/components/submit-button"

function Icon() {
  return <svg data-testid="icon" />
}

// Outside a <form> useFormStatus reports pending=false, so this pins the idle state;
// the pending spinner swap is covered by live browser verification.
describe("SubmitButton", () => {
  it("renders a submit button with the slide effect when given an icon", () => {
    const html = renderToStaticMarkup(<SubmitButton icon={<Icon />}>Save</SubmitButton>)
    expect(html).toMatch(/^<button[^>]*type="submit"/)
    expect(html).toContain("group/slide")
    expect(html).toContain('data-testid="icon"')
    expect(html).toContain("<span>Save</span>")
  })

  it("stays a plain submit button without an icon", () => {
    const html = renderToStaticMarkup(<SubmitButton>Save</SubmitButton>)
    expect(html).toMatch(/^<button[^>]*type="submit"/)
    expect(html).not.toContain("group/slide")
  })
})
