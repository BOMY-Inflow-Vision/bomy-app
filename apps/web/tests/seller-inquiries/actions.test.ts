import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("submitSellerInquiry — server action", () => {
  beforeEach(async () => {
    vi.resetModules()
    const mailerMod = await import("../../src/lib/mailer.js")
    mailerMod.resetMailerForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env["OPS_ALERT_EMAILS"]
    delete process.env["ADMIN_URL"]
  })

  function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
    const fd = new FormData()
    fd.set("name", overrides["name"] ?? "Aisyah")
    fd.set("email", overrides["email"] ?? "aisyah@example.com")
    fd.set("contactNumber", overrides["contactNumber"] ?? "012-3456789")
    fd.set("companyName", overrides["companyName"] ?? "Aisyah Sdn Bhd")
    fd.set("storeName", overrides["storeName"] ?? "Kedai Aisyah")
    fd.set("message", overrides["message"] ?? "Looking forward.")
    return fd
  }

  it("inserts the row, attempts applicant ack, and attempts ops alert when OPS_ALERT_EMAILS is set", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"
    // EMAIL_DELIVERY_ENABLED unset → disabled mailer (logs skipped via console.log).

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")

    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    // Two attempted sends produce two "email_notification_skipped" logs from the disabled-mode mailer.
    const skipCalls = logSpy.mock.calls.filter((c) => c[0] === "email_notification_skipped")
    expect(skipCalls).toHaveLength(2)
  })

  it("logs missing_ops_recipients but still attempts applicant ack when OPS_ALERT_EMAILS is empty", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await submitSellerInquiry(makeFormData())

    expect(infoSpy).toHaveBeenCalled()
    const infoArg = infoSpy.mock.calls[0]![0] as { event?: string; reason?: string }
    expect(infoArg.event).toBe("email_notification_skipped")
    expect(infoArg.reason).toBe("missing_ops_recipients")

    // Applicant send was still attempted (disabled-mode skip log fires exactly once):
    const skipCalls = logSpy.mock.calls.filter((c) => c[0] === "email_notification_skipped")
    expect(skipCalls).toHaveLength(1)
  })

  it("rejects when a required field is missing", async () => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ name: "" }))).rejects.toThrow(
      /All required fields/,
    )
  })
})
