import type { Mailer } from "../lib/mailer.js"

export async function sendRenewalEmail(
  mailer: Mailer,
  opts: { email: string; periodEnd: Date; daysBefore: number },
): Promise<void> {
  const appUrl = (process.env["APP_URL"] ?? "").replace(/\/$/, "")
  const manageUrl = `${appUrl}/membership/manage`
  const dateStr = opts.periodEnd.toLocaleDateString("en-MY")

  await mailer.sendMail({
    to: opts.email,
    subject: `Your BOMY membership renews in ${opts.daysBefore} days`,
    text: `Your BOMY membership will renew on ${dateStr}.\n\nManage your membership at ${manageUrl}`,
  })
}
