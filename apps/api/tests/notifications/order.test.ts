import { describe, expect, it } from "vitest"
import { joinUrl, parseOpsEmails } from "../../src/notifications/order.js"

describe("parseOpsEmails", () => {
  it("splits comma-separated addresses and trims whitespace", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "ops@bomy.my, finance@bomy.my , " })).toEqual([
      "ops@bomy.my",
      "finance@bomy.my",
    ])
  })

  it("returns empty array when OPS_ALERT_EMAILS is unset", () => {
    expect(parseOpsEmails({})).toEqual([])
  })

  it("returns empty array when OPS_ALERT_EMAILS is empty string", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "" })).toEqual([])
  })
})

describe("joinUrl", () => {
  it("strips trailing slash from base", () => {
    expect(joinUrl("https://app.bomy.my/", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })

  it("handles base without trailing slash", () => {
    expect(joinUrl("https://app.bomy.my", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })
})
