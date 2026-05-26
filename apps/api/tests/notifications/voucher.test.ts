import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "../../src/lib/mailer.js"
import { type IssuedVoucher, sendVoucherIssuedEmail } from "../../src/notifications/voucher.js"

function makeMailer() {
  const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
  const close = vi.fn<Mailer["close"]>().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

const EXPIRES = new Date("2026-05-31T15:59:59Z")

const BASE: IssuedVoucher = {
  id: "v-1",
  userId: "u-1",
  code: "ABCD1234",
  type: "fixed_myr",
  fixedAmountSen: 1000n,
  percentage: null,
  randomResolvedSen: null,
  expiresAt: EXPIRES,
}

describe("sendVoucherIssuedEmail", () => {
  it("subject includes the voucher code", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, BASE, "u@bomy.my", { appUrl: "https://app.bomy.my" })
    expect(sendMail).toHaveBeenCalledOnce()
    const args = sendMail.mock.calls[0]![0]
    expect(args.subject).toContain("ABCD1234")
    expect(args.to).toBe("u@bomy.my")
  })

  it("renders fixed_myr amount as RM N.NN", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, BASE, "u@bomy.my", { appUrl: "https://app.bomy.my" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("RM 10.00")
    expect(body).toContain("ABCD1234")
  })

  it("renders percentage as N%", async () => {
    const v: IssuedVoucher = {
      ...BASE,
      type: "percentage",
      fixedAmountSen: null,
      percentage: 15,
    }
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, v, "u@bomy.my", { appUrl: "https://app.bomy.my" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("15%")
  })

  it("renders random_myr as the resolved RM amount", async () => {
    const v: IssuedVoucher = {
      ...BASE,
      type: "random_myr",
      fixedAmountSen: null,
      randomResolvedSen: 2550n,
    }
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, v, "u@bomy.my", { appUrl: "https://app.bomy.my" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("RM 25.50")
  })

  it("includes the joinUrl-formed /account CTA (not /account/vouchers)", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, BASE, "u@bomy.my", { appUrl: "https://app.bomy.my/" })
    const body = sendMail.mock.calls[0]![0].text
    expect(body).toContain("https://app.bomy.my/account")
    expect(body).not.toContain("/account/vouchers")
  })
})
