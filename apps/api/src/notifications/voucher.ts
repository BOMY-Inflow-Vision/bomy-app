import { joinUrl, type Mailer } from "../lib/mailer.js"

export interface JobLogger {
  info(obj: object, msg: string): void
  warn(obj: object, msg: string): void
  error(obj: object, msg: string): void
}

export interface IssuedVoucher {
  id: string
  userId: string
  code: string
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedAmountSen: bigint | null
  percentage: number | null
  randomResolvedSen: bigint | null
  expiresAt: Date
}

export interface DispatchSummary {
  sent: number
  failed: number
  skipped: number
}

function senToMyrStr(sen: bigint): string {
  const whole = sen / 100n
  const cents = sen % 100n
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

function renderAmount(voucher: IssuedVoucher): string {
  if (voucher.type === "fixed_myr" && voucher.fixedAmountSen !== null) {
    return `RM ${senToMyrStr(voucher.fixedAmountSen)} off`
  }
  if (voucher.type === "percentage" && voucher.percentage !== null) {
    return `${voucher.percentage}% off`
  }
  if (voucher.type === "random_myr" && voucher.randomResolvedSen !== null) {
    return `RM ${senToMyrStr(voucher.randomResolvedSen)} off (your monthly random reward!)`
  }
  return "a monthly reward"
}

export async function sendVoucherIssuedEmail(
  mailer: Mailer,
  voucher: IssuedVoucher,
  email: string,
  env: { appUrl: string },
): Promise<void> {
  const expiryStr = voucher.expiresAt.toLocaleDateString("en-MY")
  const accountUrl = joinUrl(env.appUrl, "/account")
  const amountLine = renderAmount(voucher)

  await mailer.sendMail({
    to: email,
    subject: `Your BOMY monthly voucher — code ${voucher.code}`,
    text:
      `Your monthly BOMY voucher is ready: ${amountLine}.\n\n` +
      `Use code ${voucher.code} at checkout. Valid until ${expiryStr}.\n\n` +
      `Manage your account: ${accountUrl}`,
  })
}

export async function dispatchVoucherEmails(
  _mailer: Mailer,
  _inserted: readonly IssuedVoucher[],
  _emailByUserId: ReadonlyMap<string, string>,
  _env: { appUrl: string; issuedMonth: string },
  _log: JobLogger,
): Promise<DispatchSummary> {
  throw new Error("not implemented")
}
