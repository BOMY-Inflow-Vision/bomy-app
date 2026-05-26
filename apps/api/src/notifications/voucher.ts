import type { Mailer } from "../lib/mailer.js"

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

export async function sendVoucherIssuedEmail(
  _mailer: Mailer,
  _voucher: IssuedVoucher,
  _email: string,
  _env: { appUrl: string },
): Promise<void> {
  throw new Error("not implemented")
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
