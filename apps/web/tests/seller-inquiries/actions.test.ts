import { randomUUID } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

// Hoisted mock handles — stable across vi.resetModules() so dynamically-imported
// actions.ts resolves the same mock instances we configure in beforeEach.
const { verifyTurnstileMock, sendApplicantAckMock, sendOpsAlertMock } = vi.hoisted(() => ({
  verifyTurnstileMock: vi.fn(),
  sendApplicantAckMock: vi.fn(),
  sendOpsAlertMock: vi.fn(),
}))

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: verifyTurnstileMock,
}))

vi.mock("@/notifications/seller-inquiry", () => ({
  sendApplicantAck: sendApplicantAckMock,
  sendOpsAlert: sendOpsAlertMock,
}))

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

function makeUniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.bomy`
}

describe.skipIf(!shouldRun)("submitSellerInquiry — server action", () => {
  beforeEach(async () => {
    vi.resetModules()
    verifyTurnstileMock.mockReset()
    verifyTurnstileMock.mockResolvedValue({ success: true })
    sendApplicantAckMock.mockReset()
    sendApplicantAckMock.mockResolvedValue(undefined)
    sendOpsAlertMock.mockReset()
    sendOpsAlertMock.mockResolvedValue(undefined)
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
    // Default: verify-passes via the mock; token value is arbitrary.
    if (!("cf-turnstile-response" in overrides)) {
      fd.set("cf-turnstile-response", "test-token")
    } else if (overrides["cf-turnstile-response"]) {
      fd.set("cf-turnstile-response", overrides["cf-turnstile-response"])
    }
    return fd
  }

  it("verify-failure (invalid-response): throws generic error; no DB insert; no email", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "invalid-response" })
    const uniqueEmail = makeUniqueEmail("verify-fail-invalid")
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: uniqueEmail }))).rejects.toThrow(
      /Verification failed/,
    )
    const { makeDb, schema } = await import("@bomy/db")
    const { db } = makeDb()
    const rows = await db
      .select()
      .from(schema.sellerInquiries)
      .where(eq(schema.sellerInquiries.email, uniqueEmail))
    expect(rows).toHaveLength(0)
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("verify-failure (missing-secret): identical generic error", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "missing-secret" })
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).rejects.toThrow(
      /Verification failed\. Please try the challenge again\./,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("verify-failure (network-error): identical generic error", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "network-error" })
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).rejects.toThrow(
      /Verification failed\. Please try the challenge again\./,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("missing cf-turnstile-response reaches verify as null and rejects", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "invalid-response" })
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    const fd = makeFormData()
    fd.delete("cf-turnstile-response")
    await expect(submitSellerInquiry(fd)).rejects.toThrow(/Verification failed/)
    expect(verifyTurnstileMock).toHaveBeenCalledWith(null)
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("verify passes → inserts row + dispatches BOTH applicant ack and ops alert", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@brandsofmalaysia.com"
    process.env["ADMIN_URL"] = "https://admin.brandsofmalaysia.com"
    const uniqueEmail = makeUniqueEmail("happy")
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: uniqueEmail }))).resolves.toBeUndefined()

    const { makeDb, schema } = await import("@bomy/db")
    const { db } = makeDb()
    const rows = await db
      .select()
      .from(schema.sellerInquiries)
      .where(eq(schema.sellerInquiries.email, uniqueEmail))
    expect(rows).toHaveLength(1)

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendApplicantAckMock.mock.calls[0]![1]).toMatchObject({
      name: "Aisyah",
      email: uniqueEmail,
      storeName: "Kedai Aisyah",
    })
    expect(sendOpsAlertMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock.mock.calls[0]![2]).toMatchObject({
      opsEmails: ["ops@brandsofmalaysia.com"],
    })
  })

  it("OPS_ALERT_EMAILS empty: logs skip; sends ONLY applicant ack", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await submitSellerInquiry(makeFormData())

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()

    const skipCall = infoSpy.mock.calls.find((c) => {
      const arg = c[0] as { event?: string }
      return arg?.event === "email_notification_skipped"
    })
    expect(skipCall).toBeDefined()
    const arg = skipCall![0] as { reason?: string }
    expect(arg.reason).toBe("missing_ops_recipients")
  })

  it("applicant send throws → ops alert still attempted; action resolves", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@brandsofmalaysia.com"
    sendApplicantAckMock.mockRejectedValueOnce(new Error("smtp boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock).toHaveBeenCalledOnce()

    const failCall = errorSpy.mock.calls.find((c) => {
      const arg = c[0] as { event?: string; recipientType?: string }
      return arg?.event === "email_notification_failed" && arg.recipientType === "applicant"
    })
    expect(failCall).toBeDefined()
  })

  it("ops alert throws → applicant ack already attempted; action resolves", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@brandsofmalaysia.com"
    sendOpsAlertMock.mockRejectedValueOnce(new Error("smtp boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock).toHaveBeenCalledOnce()

    const failCall = errorSpy.mock.calls.find((c) => {
      const arg = c[0] as { event?: string; recipientType?: string }
      return arg?.event === "email_notification_failed" && arg.recipientType === "ops"
    })
    expect(failCall).toBeDefined()
  })

  it("rejects when a required field is missing", async () => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ name: "" }))).rejects.toThrow(
      /All required fields/,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
  })

  it.each([
    "aisyah@example.com, attacker@evil.com",
    "aisyah@example.com;attacker@evil.com",
    "Aisyah <aisyah@example.com>",
    "aisyah aisyah@example.com",
    "not-an-email",
    "double@@example.com",
    '"quoted"@example.com',
  ])("rejects invalid/multi-recipient email shape: %s", async (badEmail) => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: badEmail }))).rejects.toThrow(
      /valid email/,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
  })
})
