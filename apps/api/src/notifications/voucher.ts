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
  mailer: Mailer,
  inserted: readonly IssuedVoucher[],
  emailByUserId: ReadonlyMap<string, string>,
  env: { appUrl: string; issuedMonth: string },
  log: JobLogger,
): Promise<DispatchSummary> {
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const v of inserted) {
    const email = emailByUserId.get(v.userId)
    if (!email) {
      skipped++
      log.warn(
        {
          event: "email_notification_skipped",
          reason: "user_email_not_found",
          voucherId: v.id,
          userId: v.userId,
        },
        "email_notification_skipped",
      )
      continue
    }
    try {
      await sendVoucherIssuedEmail(mailer, v, email, { appUrl: env.appUrl })
      sent++
    } catch (err) {
      failed++
      log.error(
        {
          event: "email_notification_failed",
          voucherId: v.id,
          userId: v.userId,
          email,
          message: err instanceof Error ? err.message : String(err),
        },
        "email_notification_failed",
      )
    }
  }

  log.info(
    {
      event: "voucher_issuance_summary",
      issuedMonth: env.issuedMonth,
      inserted: inserted.length,
      sent,
      failed,
      skipped,
    },
    "voucher_issuance_summary",
  )

  return { sent, failed, skipped }
}
