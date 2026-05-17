/**
 * Convert sen (bigint, minor units) to a MYR amount string with exactly
 * 2 decimal places. Used by the HitPay client which takes a string amount.
 *
 * Never floats. Pure bigint arithmetic.
 *
 *   senToMyr(2999n) === "29.99"
 *   senToMyr(0n)    === "0.00"
 *   senToMyr(1n)    === "0.01"
 *   senToMyr(100n)  === "1.00"
 */
export function senToMyr(sen: bigint): string {
  if (sen < 0n) throw new Error(`senToMyr: negative amount ${sen}`)
  const major = sen / 100n
  const minor = sen % 100n
  return `${major}.${minor.toString().padStart(2, "0")}`
}
