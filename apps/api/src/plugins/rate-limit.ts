import rateLimit from "@fastify/rate-limit"
import type { FastifyInstance } from "fastify"
import fp from "fastify-plugin"
import { Redis } from "ioredis"

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
 * Global rate limiter (GAPS #3). The default keyGenerator uses request.ip, which
 * resolves to the forwarded client IP because the server sets trustProxy: 1.
 * Routes opt out with `config.rateLimit: false` (health/ready) or tighten via a
 * per-route `config.rateLimit` override (the HitPay webhook).
 *
 * Store: when REDIS_URL is set (prod), a **shared Redis store** so the limit is
 * enforced across all Railway instances — a per-instance in-memory store lets a
 * client bypass the cap by being load-balanced across instances (found by the
 * PR #90 prod smoke). Without REDIS_URL (local/test) it falls back to in-memory.
 *
 * `skipOnError: true` fails **open**: if Redis is unreachable the limiter is
 * skipped rather than 500-ing every request — a Redis blip degrades limiting,
 * it does not take down the API. The client uses a short connect timeout and a
 * single retry so a down Redis fails fast instead of hanging the request.
 */
export const rateLimitPlugin = fp(async (app: FastifyInstance) => {
  const redisUrl = process.env["REDIS_URL"]
  const redis = redisUrl
    ? new Redis(redisUrl, {
        connectTimeout: 500,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      })
    : undefined

  if (redis) {
    // skipOnError fails open, so a Redis outage silently disables limiting.
    // Log once on each transition (down / recovered) so ops can tell when the
    // GAPS #3 protection is degraded — without spamming a line per retry.
    let degraded = false
    redis.on("error", (err: Error) => {
      if (degraded) return
      degraded = true
      app.log.error(
        { err: err.message, component: "rate-limit-redis" },
        "rate-limit Redis unavailable — limiting is failing open",
      )
    })
    redis.on("ready", () => {
      if (!degraded) return
      degraded = false
      app.log.info(
        { component: "rate-limit-redis" },
        "rate-limit Redis recovered — limiting restored",
      )
    })
  }

  await app.register(rateLimit, {
    max: API_RATE_LIMIT_MAX,
    timeWindow: API_RATE_LIMIT_TIME_WINDOW,
    skipOnError: true,
    ...(redis ? { redis } : {}),
  })

  if (redis) {
    app.addHook("onClose", async () => {
      await redis.quit()
    })
  }
})
