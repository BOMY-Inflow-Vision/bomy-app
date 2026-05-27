import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SAVED_ENV = { ...process.env }

describe("getMailer — lazy singleton", () => {
  beforeEach(async () => {
    vi.resetModules()
    const mod = await import("../../src/lib/mailer.js")
    mod.resetMailerForTests()
  })
  afterEach(() => {
    process.env = { ...SAVED_ENV }
  })

  it("returns a disabled no-op mailer when EMAIL_DELIVERY_ENABLED is unset", async () => {
    delete process.env["EMAIL_DELIVERY_ENABLED"]
    const { getMailer } = await import("../../src/lib/mailer.js")
    const m = getMailer()
    await expect(m.sendMail({ to: "a@b.com", subject: "x", text: "y" })).resolves.toBeUndefined()
  })

  it("caches the singleton instance across calls", async () => {
    delete process.env["EMAIL_DELIVERY_ENABLED"]
    const { getMailer } = await import("../../src/lib/mailer.js")
    expect(getMailer()).toBe(getMailer())
  })

  it("falls back to disabled no-op and logs mailer_config_invalid on bad enabled config", async () => {
    process.env["EMAIL_DELIVERY_ENABLED"] = "true"
    delete process.env["SMTP_HOST"]
    delete process.env["MAIL_FROM"]
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getMailer } = await import("../../src/lib/mailer.js")
    const m = getMailer()
    // Should not throw, and should be the disabled no-op:
    await expect(m.sendMail({ to: "a@b.com", subject: "x", text: "y" })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    const firstCall = errorSpy.mock.calls[0]![0] as { event?: string }
    expect(firstCall.event).toBe("mailer_config_invalid")
    errorSpy.mockRestore()
  })
})
