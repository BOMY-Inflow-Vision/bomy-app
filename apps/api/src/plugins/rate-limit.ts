import rateLimit from "@fastify/rate-limit"
import type { FastifyInstance } from "fastify"
import fp from "fastify-plugin"

/** Global default: max requests per client IP per window before a 429. */
export const API_RATE_LIMIT_MAX = 100
/** Rate-limit window, in milliseconds (1 minute). */
export const API_RATE_LIMIT_TIME_WINDOW = 60_000
/**
 * Stricter cap for POST /webhooks/hitpay. Real HitPay webhook volume sits far
 * below this; the tighter bucket blunts a flood of forged / HMAC-failing POSTs
 * before they reach signature verification and DB work.
 */
export const HITPAY_WEBHOOK_RATE_LIMIT_MAX = 30

/**
 * Global in-memory rate limiter (GAPS #3). The store is per-instance — adequate
 * for the current single Railway API instance; a horizontally-scaled deployment
 * would need a shared (Redis) store. The default keyGenerator uses request.ip,
 * which resolves to the forwarded client IP because the server sets trustProxy.
 * Routes opt out with `config.rateLimit: false` (health/ready) or tighten via a
 * per-route `config.rateLimit` override (the HitPay webhook).
 */
export const rateLimitPlugin = fp(async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    max: API_RATE_LIMIT_MAX,
    timeWindow: API_RATE_LIMIT_TIME_WINDOW,
  })
})
