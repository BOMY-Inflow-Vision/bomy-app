/**
 * Formats non-negative integer sen as a major-unit decimal string for PSP APIs that take
 * strings (HitPay): 2999n → "29.99", 100n → "1.00", 0n → "0.00".
 * Throws on a negative amount — no PSP call should ever carry one.
 */
export function senToMajorString(sen: bigint): string {
  if (sen < 0n) throw new Error(`senToMajorString: negative amount ${sen}`)
  const whole = sen / 100n
  const frac = String(sen % 100n).padStart(2, "0")
  return `${whole}.${frac}`
}

/**
 * Converts an integer minor-unit amount from a PSP JSON payload (Stripe sends numbers) into a
 * bigint. Strict: rejects non-integers, unsafe integers (> 2^53 − 1, where JSON numbers lose
 * precision), negatives, NaN and non-numbers. Never rounds.
 */
export function assertSafeMinor(n: unknown): bigint {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
    throw new Error(`assertSafeMinor: not a safe non-negative integer: ${String(n)}`)
  }
  return BigInt(n)
}
