import type { RateLimitConfig } from "@bomy/db"

const ONE_MINUTE_MS = 60_000

/**
 * Per-user server-action throttles (GAPS #3). Numbers are a starting point,
 * not tuned against real traffic — generous enough that a real shopper never
 * notices, tight enough to blunt scripted abuse. Revisit if either turns out
 * wrong in practice.
 */
export const ACTION_RATE_LIMITS = {
  /** Recalculated on every cart/voucher change while a buyer reviews checkout. */
  checkoutPreview: { max: 30, windowMs: ONE_MINUTE_MS },
  /** Creates a session + decrements stock — much stricter than preview. */
  checkoutInitiate: { max: 5, windowMs: ONE_MINUTE_MS },
  /** add/update/delete/setDefault share one bucket — all mutate the same resource. */
  addressWrite: { max: 20, windowMs: ONE_MINUTE_MS },
  profileEdit: { max: 10, windowMs: ONE_MINUTE_MS },
} as const satisfies Record<string, RateLimitConfig>

export const RATE_LIMIT_USER_MESSAGE = "Too many requests — please wait a moment and try again."
