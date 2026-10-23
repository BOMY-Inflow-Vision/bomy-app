import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { StoreStatusNotice } from "../../src/app/seller/dashboard/store-status-notice"

describe("StoreStatusNotice", () => {
  it("suspended: shows an announced destructive alert with a contact link", () => {
    const html = renderToStaticMarkup(<StoreStatusNotice status="suspended" />)
    expect(html).toContain('role="alert"')
    expect(html).toContain("Your store is suspended.")
    expect(html).toContain('href="/contact"')
  })

  it("pending: shows a waiting-for-approval status message", () => {
    const html = renderToStaticMarkup(<StoreStatusNotice status="pending" />)
    expect(html).toContain('role="status"')
    expect(html).toContain("Your store is waiting for approval.")
  })

  it("active: renders nothing", () => {
    expect(renderToStaticMarkup(<StoreStatusNotice status="active" />)).toBe("")
  })
})
