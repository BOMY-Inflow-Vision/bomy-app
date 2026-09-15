import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import RouteError from "@/app/error"
import { ToastProvider } from "@/components/toaster"

function render(error: Error & { digest?: string }) {
  return renderToStaticMarkup(
    <ToastProvider>
      <RouteError error={error} reset={() => {}} />
    </ToastProvider>,
  )
}

// Node env (no DOM): the mount-time error toast is covered by browser verification;
// these pin the recovery UI that replaces a crashed page.
describe("RouteError", () => {
  it("offers a retry and a way back home", () => {
    const html = render(new Error("boom"))
    expect(html).toContain("Something went wrong")
    expect(html).toContain("Try again")
    expect(html).toContain('href="/"')
  })

  it("never shows the raw error message", () => {
    expect(render(new Error("secret internals"))).not.toContain("secret internals")
  })

  it("shows the server digest as a support reference when present", () => {
    const html = render(Object.assign(new Error("boom"), { digest: "272438949" }))
    expect(html).toContain("272438949")
  })
})
