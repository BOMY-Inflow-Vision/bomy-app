/**
 * Strict decimal-string → sen converter.
 *
 * HitPay sends monetary amounts as "N.NN" strings. `parseFloat` is
 * deliberately avoided — a malformed string throws here so the caller
 * can park the session for review rather than silently producing the
 * wrong bigint.
 *
 * Single source of truth for parsing across the order webhook
 * (order-fanout.ts) and the route plugin's membership / brand-
 * subscription / refund branches (routes/webhooks/hitpay.ts).
 */
export function parseSen(amount: string): bigint {
  if (!/^\d+\.\d{2}$/.test(amount)) {
    throw new Error(`parseSen: invalid amount format "${amount}" — expected "N.NN"`)
  }
  const dotIdx = amount.indexOf(".")
  const whole = amount.slice(0, dotIdx)
  const cents = amount.slice(dotIdx + 1)
  return BigInt(whole) * 100n + BigInt(cents)
}
