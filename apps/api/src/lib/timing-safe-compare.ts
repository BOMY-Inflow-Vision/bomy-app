import { timingSafeEqual } from "node:crypto"

/**
 * Constant-time string comparison for secrets (GAPS #4).
 *
 * `timingSafeEqual` throws on length mismatch, so compare lengths first — that
 * leaks only the length, never a per-character prefix match.
 */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
