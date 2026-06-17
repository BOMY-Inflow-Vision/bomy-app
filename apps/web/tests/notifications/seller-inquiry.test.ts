import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "@bomy/mailer"
import { sendApplicantAck, sendOpsAlert } from "../../src/notifications/seller-inquiry.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

describe("sendApplicantAck", () => {
  it("addresses the applicant by submitted email and mentions the store name", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, {
      name: "Aisyah",
      email: "aisyah@example.com",
      storeName: "Kedai Aisyah",
    })
    const args = sendMail.mock.calls[0]![0]
    expect(args.to).toBe("aisyah@example.com")
    expect(args.subject).toContain("seller application")
    expect(args.text).toContain("Aisyah")
    expect(args.text).toContain("Kedai Aisyah")
  })

  it("does not promise a specific SLA in the body", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, {
      name: "Aisyah",
      email: "aisyah@example.com",
      storeName: "Kedai Aisyah",
    })
    const body = sendMail.mock.calls[0]![0].text
    expect(body.toLowerCase()).not.toMatch(/business days?/i)
    expect(body.toLowerCase()).not.toMatch(/within \d+ (hour|day)/i)
  })
})

describe("sendOpsAlert", () => {
  it("addresses the ops recipients and includes every submitted field plus the admin link", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendOpsAlert(
      mailer,
      {
        inquiryId: "inq-1",
        name: "Aisyah",
        email: "aisyah@example.com",
        contactNumber: "012-3456789",
        companyName: "Aisyah Sdn Bhd",
        storeName: "Kedai Aisyah",
        message: "Looking forward.",
      },
      {
        adminUrl: "https://admin.brandsofmalaysia.com/",
        opsEmails: ["ops@brandsofmalaysia.com", "finance@brandsofmalaysia.com"],
      },
    )
    const args = sendMail.mock.calls[0]![0]
    expect(args.to).toEqual(["ops@brandsofmalaysia.com", "finance@brandsofmalaysia.com"])
    expect(args.subject).toContain("New seller inquiry")
    expect(args.subject).toContain("Kedai Aisyah")

    const body = args.text
    for (const fragment of [
      "Aisyah",
      "aisyah@example.com",
      "012-3456789",
      "Aisyah Sdn Bhd",
      "Kedai Aisyah",
      "Looking forward.",
      "https://admin.brandsofmalaysia.com/seller-inquiries",
    ]) {
      expect(body).toContain(fragment)
    }
  })

  it("renders message as '(none)' when null", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendOpsAlert(
      mailer,
      {
        inquiryId: "inq-1",
        name: "Aisyah",
        email: "aisyah@example.com",
        contactNumber: "012-3456789",
        companyName: "Aisyah Sdn Bhd",
        storeName: "Kedai Aisyah",
        message: null,
      },
      { adminUrl: "https://admin.brandsofmalaysia.com", opsEmails: ["ops@brandsofmalaysia.com"] },
    )
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("(none)")
  })
})
