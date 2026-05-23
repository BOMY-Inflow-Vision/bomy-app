import { describe, expect, it, vi } from "vitest"

import type { Mailer } from "../../src/lib/mailer.js"
import { sendRenewalEmail } from "../../src/notifications/membership.js"

describe("sendRenewalEmail", () => {
  it("calls mailer.sendMail with subject and periodEnd date", async () => {
    const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
    const mailer: Mailer = { sendMail, close: vi.fn() }

    const periodEnd = new Date("2027-01-15T00:00:00Z")
    await sendRenewalEmail(mailer, { email: "user@example.com", periodEnd, daysBefore: 7 })

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toBe("user@example.com")
    expect(call.subject).toBe("Your BOMY membership renews in 7 days")
    expect(call.text).toContain("15") // date appears in body
    expect(call.text).not.toContain("amount") // no amount in body
    expect(call.text).toContain("/membership/manage")
  })

  it("propagates errors from mailer.sendMail", async () => {
    const sendMail = vi.fn<Mailer["sendMail"]>().mockRejectedValue(new Error("SMTP down"))
    const mailer: Mailer = { sendMail, close: vi.fn() }

    await expect(
      sendRenewalEmail(mailer, { email: "u@e.com", periodEnd: new Date(), daysBefore: 30 }),
    ).rejects.toThrow("SMTP down")
  })
})
