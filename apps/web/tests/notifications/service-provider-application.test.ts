import { describe, expect, it, vi } from "vitest"

import type { Mailer } from "@bomy/mailer"

import {
  sendApplicantAck,
  sendOpsAlert,
} from "../../src/notifications/service-provider-application.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

describe("sendApplicantAck", () => {
  it("sends to exactly the given email — the caller decides which address that is", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, { name: "Aisha", email: "current-account-email@example.com" })
    expect(sendMail.mock.calls[0]![0].to).toBe("current-account-email@example.com")
  })
})

describe("sendOpsAlert", () => {
  it("sends to every ops email, with the applicant's typed contact email and category in the BODY — and no link, since admin review doesn't exist yet", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendOpsAlert(
      mailer,
      {
        applicationId: "app-1",
        name: "Aisha",
        contactEmail: "typed-contact@example.com",
        contactNumber: "+60123456789",
        companyName: "Aisha Studio",
        category: "Graphic Design",
      },
      { opsEmails: ["ops1@test.example", "ops2@test.example"] },
    )
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toEqual(["ops1@test.example", "ops2@test.example"])
    expect(call.text).toContain("typed-contact@example.com")
    expect(call.text).toContain("Aisha Studio")
    expect(call.text).toContain("Graphic Design")
    // No dead link to the not-yet-built admin review page (spec §8).
    expect(call.text).not.toContain("http")
  })
})
