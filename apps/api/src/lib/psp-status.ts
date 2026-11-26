/**
 * Which PSPs this api deployment can process inbound webhooks for (Stripe design §3.4, §10).
 * Booleans only: never a key, secret, prefix or length, so `/ready` stays safe to expose.
 *
 * - `hitpay`: the HMAC salt `/webhooks/hitpay` verifies with is present.
 * - `stripe`: always false until Stripe PR 4 ships `/webhooks/stripe` and the real adapter
 *   (matching the `StripeProvider` placeholder's `isConfigured() = false`).
 * - `stripeLivemode`: null until then (PR 4 derives it from the secret key prefix).
 *
 * Reads env only (no DB, no network), and is deliberately NOT part of the `/ready` health
 * verdict: a missing PSP secret must not mark the api unhealthy.
 */
export interface PspStatus {
  hitpay: boolean
  stripe: boolean
  stripeLivemode: boolean | null
}

export function pspStatus(env: NodeJS.ProcessEnv = process.env): PspStatus {
  return {
    hitpay: Boolean(env["HITPAY_SALT"]),
    stripe: false,
    stripeLivemode: null,
  }
}
