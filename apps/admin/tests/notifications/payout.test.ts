import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "@bomy/mailer"
import { sendPayoutPendingEmail } from "../../src/notifications/payout.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

const CTX = {
  orderId: "12345678-aaaa-bbbb-cccc-deadbeefcafe",
  sellerEmail: "seller@example.com",
  amountSen: 5000n,
  currency: "MYR",
}

describe("sendPayoutPendingEmail", () => {
  it("subject contains the RM amount and the first 8 chars of the order id", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const args = sendMail.mock.calls[0]![0]
    expect(args.subject).toContain("RM 50.00")
    expect(args.subject).toContain("12345678")
    expect(args.subject).not.toContain(CTX.orderId)
  })

  it("body has the full UUID in the dashboard link path", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain(
      `https://app.brandsofmalaysia.com/seller/dashboard/orders/${CTX.orderId}`,
    )
  })

  it("sends to the seller email", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    expect(sendMail.mock.calls[0]![0].to).toBe("seller@example.com")
  })

  it("does not include 'commission' in the body", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body.toLowerCase()).not.toContain("commission")
  })

  it("does not promise a specific SLA (e.g. '3-5 business days')", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body.toLowerCase()).not.toMatch(/business days?/i)
    expect(body.toLowerCase()).not.toMatch(/\d+ ?-? ?\d+ ?days/i)
  })

  it("renders non-MYR currency with the currency code as prefix (no 'RM')", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(
      mailer,
      { ...CTX, currency: "USD" },
      { appUrl: "https://app.brandsofmalaysia.com" },
    )
    const args = sendMail.mock.calls[0]![0]
    expect(args.subject).toContain("USD 50.00")
    expect(args.subject).not.toContain("RM")
    expect(args.text).toContain("USD 50.00")
    expect(args.text).not.toContain("RM")
  })
})
