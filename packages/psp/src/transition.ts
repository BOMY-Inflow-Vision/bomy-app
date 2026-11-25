import type { PspProvider } from "./types.js"

/**
 * Transition helper (until the contract PR drops `hitpay_*`): the provider-neutral column
 * value, falling back to the legacy `hitpay_*` value for HitPay rows. Rows written by
 * pre-dual-write code between migration 0039 and this deploy may carry only the legacy value
 * (0040 re-backfills them); a non-HitPay row never falls back.
 */
export function pspRef(
  provider: PspProvider,
  pspValue: string | null,
  hitpayValue: string | null,
): string | null {
  if (pspValue !== null) return pspValue
  return provider === "hitpay" ? hitpayValue : null
}
