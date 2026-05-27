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

  it("inserts the row and attempts ops alert when OPS_ALERT_EMAILS is set; never sends to the submitted email", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"
    // EMAIL_DELIVERY_ENABLED unset → disabled mailer (logs skipped via console.log).

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")

    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    // Exactly one attempted send (ops alert) → one disabled-mode skip log.
    const skipCalls = logSpy.mock.calls.filter((c) => c[0] === "email_notification_skipped")
    expect(skipCalls).toHaveLength(1)

    // Defensive: the submitted (public) email must never appear as a recipient.
    for (const call of skipCalls) {
      const payload = call[1] as { to: string | string[] }
      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to]
      expect(recipients).not.toContain("aisyah@example.com")
    }
  })

  it("logs missing_ops_recipients and sends nothing when OPS_ALERT_EMAILS is empty", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await submitSellerInquiry(makeFormData())

    expect(infoSpy).toHaveBeenCalled()
    const infoArg = infoSpy.mock.calls[0]![0] as { event?: string; reason?: string }
    expect(infoArg.event).toBe("email_notification_skipped")
    expect(infoArg.reason).toBe("missing_ops_recipients")

    // No outbound send attempted when ops list is empty — applicant ack is gone.
    const skipCalls = logSpy.mock.calls.filter((c) => c[0] === "email_notification_skipped")
    expect(skipCalls).toHaveLength(0)
  })

  it("rejects when a required field is missing", async () => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ name: "" }))).rejects.toThrow(
      /All required fields/,
    )
  })

  it.each([
    "aisyah@example.com, attacker@evil.com", // comma-separated injection
    "aisyah@example.com;attacker@evil.com", // semicolon-separated injection
    "Aisyah <aisyah@example.com>", // angle-bracket display-name form
    "aisyah aisyah@example.com", // whitespace
    "not-an-email",
    "double@@example.com",
    '"quoted"@example.com',
  ])("rejects invalid/multi-recipient email shape: %s", async (badEmail) => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: badEmail }))).rejects.toThrow(
      /valid email/,
    )
  })
})
