import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "../../src/lib/mailer.js"
import {
  type DispatchSummary,
  type IssuedVoucher,
  type JobLogger,
  dispatchVoucherEmails,
  sendVoucherIssuedEmail,
} from "../../src/notifications/voucher.js"

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

function makeLog(): JobLogger & {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function makeVoucher(idx: number): IssuedVoucher {
  return {
    id: `v-${idx}`,
    userId: `u-${idx}`,
    code: `CODE${idx}`,
    type: "fixed_myr",
    fixedAmountSen: 1000n,
    percentage: null,
    randomResolvedSen: null,
    expiresAt: EXPIRES,
  }
}

describe("dispatchVoucherEmails", () => {
  it("happy path: sends one email per inserted row and returns matching summary", async () => {
    const { mailer, sendMail } = makeMailer()
    const log = makeLog()
    const inserted = [makeVoucher(1), makeVoucher(2)]
    const emailByUserId = new Map([
      ["u-1", "u1@bomy.my"],
      ["u-2", "u2@bomy.my"],
    ])

    const summary = await dispatchVoucherEmails(
      mailer,
      inserted,
      emailByUserId,
      { appUrl: "https://app.bomy.my", issuedMonth: "2026-05" },
      log,
    )

    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(summary).toEqual<DispatchSummary>({ sent: 2, failed: 0, skipped: 0 })
    expect(log.info).toHaveBeenCalledOnce()
    expect(log.info.mock.calls[0]![1]).toBe("voucher_issuance_summary")
  })

  it("isolates per-row failures: first send throws, second sent, loop continues", async () => {
    const sendMail = vi
      .fn<Mailer["sendMail"]>()
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValueOnce(undefined)
    const mailer: Mailer = { sendMail, close: vi.fn<Mailer["close"]>() }
    const log = makeLog()
    const inserted = [makeVoucher(1), makeVoucher(2)]
    const emailByUserId = new Map([
      ["u-1", "u1@bomy.my"],
      ["u-2", "u2@bomy.my"],
    ])

    const summary = await dispatchVoucherEmails(
      mailer,
      inserted,
      emailByUserId,
      { appUrl: "https://app.bomy.my", issuedMonth: "2026-05" },
      log,
    )

    expect(summary).toEqual<DispatchSummary>({ sent: 1, failed: 1, skipped: 0 })
    expect(log.error).toHaveBeenCalledOnce()
    const errCall = log.error.mock.calls[0] as [Record<string, unknown>, string]
    expect(errCall[0]["event"]).toBe("email_notification_failed")
    expect(errCall[0]["voucherId"]).toBe("v-1")
    expect(errCall[0]["userId"]).toBe("u-1")
    expect(JSON.stringify(errCall[0])).not.toContain("Your monthly BOMY voucher")
  })

  it("logs email_notification_skipped when a userId has no entry in emailByUserId (defensive)", async () => {
    const { mailer, sendMail } = makeMailer()
    const log = makeLog()
    const inserted = [makeVoucher(1), makeVoucher(2)]
    const emailByUserId = new Map([["u-2", "u2@bomy.my"]])

    const summary = await dispatchVoucherEmails(
      mailer,
      inserted,
      emailByUserId,
      { appUrl: "https://app.bomy.my", issuedMonth: "2026-05" },
      log,
    )

    expect(summary).toEqual<DispatchSummary>({ sent: 1, failed: 0, skipped: 1 })
    expect(sendMail).toHaveBeenCalledOnce()
    expect(log.warn).toHaveBeenCalledOnce()
    const warnCall = log.warn.mock.calls[0] as [Record<string, unknown>, string]
    expect(warnCall[0]["event"]).toBe("email_notification_skipped")
    expect(warnCall[0]["reason"]).toBe("user_email_not_found")
    expect(warnCall[0]["voucherId"]).toBe("v-1")
  })
})
