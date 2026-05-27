import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "@bomy/mailer"
import { sendOpsAlert } from "../../src/notifications/seller-inquiry.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

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
      { adminUrl: "https://admin.bomy.my/", opsEmails: ["ops@bomy.my", "finance@bomy.my"] },
    )
    const args = sendMail.mock.calls[0]![0]
    expect(args.to).toEqual(["ops@bomy.my", "finance@bomy.my"])
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
      "https://admin.bomy.my/seller-inquiries",
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
      { adminUrl: "https://admin.bomy.my", opsEmails: ["ops@bomy.my"] },
    )
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("(none)")
  })
})
