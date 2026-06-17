import { describe, expect, it } from "vitest"
import { joinUrl, parseOpsEmails } from "../src/helpers.js"

describe("parseOpsEmails", () => {
  it("splits comma-separated addresses and trims whitespace", () => {
    expect(
      parseOpsEmails({
        OPS_ALERT_EMAILS: "ops@brandsofmalaysia.com, finance@brandsofmalaysia.com , ",
      }),
    ).toEqual(["ops@brandsofmalaysia.com", "finance@brandsofmalaysia.com"])
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
    expect(joinUrl("https://app.brandsofmalaysia.com/", "/account/orders")).toBe(
      "https://app.brandsofmalaysia.com/account/orders",
    )
  })

  it("handles base without trailing slash", () => {
    expect(joinUrl("https://app.brandsofmalaysia.com", "/account/orders")).toBe(
      "https://app.brandsofmalaysia.com/account/orders",
    )
  })
})
