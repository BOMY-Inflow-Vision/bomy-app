import { joinUrl, type Mailer } from "@bomy/mailer"

function senToMyrStr(sen: bigint): string {
  const whole = sen / 100n
  const cents = sen % 100n
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

export async function sendPayoutPendingEmail(
  mailer: Mailer,
  ctx: { orderId: string; sellerEmail: string; amountSen: bigint; currency: string },
  env: { appUrl: string },
): Promise<void> {
  const shortOrderId = ctx.orderId.slice(0, 8)
  const dashboardUrl = joinUrl(env.appUrl, `/seller/dashboard/orders/${ctx.orderId}`)
  const amount = senToMyrStr(ctx.amountSen)

  await mailer.sendMail({
    to: ctx.sellerEmail,
    subject: `Payout of RM ${amount} for order ${shortOrderId} is pending`,
    text:
      `A payout of RM ${amount} (${ctx.currency}) is pending for order ${shortOrderId}.\n\n` +
      `Status: pending. Funds will be transferred manually.\n\n` +
      `View this order: ${dashboardUrl}`,
  })
}
