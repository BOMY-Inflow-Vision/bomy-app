import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "@bomy/mailer"
import { sendApprovalEmail } from "../../src/notifications/seller-inquiry.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

const INQUIRY = {
  name: "Aisha",
  email: "applicant@example.com",
  storeName: "Aisha's Atelier",
  storeSlug: "aishas-atelier",
}

describe("sendApprovalEmail", () => {
  it("sends to the applicant email", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApprovalEmail(mailer, INQUIRY, { appUrl: "https://test.example" })
    expect(sendMail.mock.calls[0]![0].to).toBe("applicant@example.com")
  })

  it("uses a 'next steps' subject, not an 'approved' subject", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApprovalEmail(mailer, INQUIRY, { appUrl: "https://test.example" })
    const subject = sendMail.mock.calls[0]![0].subject
    expect(subject.toLowerCase()).toContain("next steps")
    expect(subject.toLowerCase()).not.toContain("approved")
  })

  it("body links to APP_URL/auth/sign-in with no hardcoded domain", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApprovalEmail(mailer, INQUIRY, { appUrl: "https://test.example" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("https://test.example/auth/sign-in")
    expect(body).not.toContain("brandsofmalaysia.com")
  })

  it("uses 'sign in once' framing, not 'application status'", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApprovalEmail(mailer, INQUIRY, { appUrl: "https://test.example" })
    const body = sendMail.mock.calls[0]![0].text.toLowerCase()
    expect(body).toContain("sign in once")
    expect(body).not.toContain("application status")
  })

  it("does not promise seller-dashboard access", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApprovalEmail(mailer, INQUIRY, { appUrl: "https://test.example" })
    const body = sendMail.mock.calls[0]![0].text.toLowerCase()
    expect(body).not.toContain("seller/dashboard")
    expect(body).not.toContain("dashboard")
  })

  it("falls back to 'there' when name is null", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApprovalEmail(mailer, { ...INQUIRY, name: null }, { appUrl: "https://test.example" })
    expect(sendMail.mock.calls[0]![0].text).toContain("Hi there,")
  })
})
