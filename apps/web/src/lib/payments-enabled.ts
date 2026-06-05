/**
 * Single source of truth for "can we initiate a HitPay flow today?"
 * Server-only — relies on process.env that is not exposed to clients.
 *
 * Used by /membership and /brands/[slug]/subscribe page components to gate
 * payment CTAs, and by the corresponding server actions as a
 * defence-in-depth guard before any HitPayClient construction.
 *
 * When HitPay creds restoration lands, setting HITPAY_API_KEY and
 * HITPAY_API_URL in Vercel flips this back to true without any code change.
 */
export function paymentsEnabled(): boolean {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  return Boolean(apiKey && apiUrl)
}
