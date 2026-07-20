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
 * Rate-limit key: the real client IP.
 *
 * **Not `request.ip`.** Under `trustProxy` that resolves to the rightmost
 * X-Forwarded-For entry, which on Railway is an edge node that **rotates per
 * connection** — so every fresh connection minted a new key and the cap never
 * accumulated. That was GAPS #3: 90 fresh-connection requests produced 0× 429.
 *
 * Railway sets `X-Real-IP` to the real client and **overwrites** any
 * caller-supplied value, so it is both stable and unspoofable. Proved on prod
 * 2026-07-20 — see `docs/runbooks/evidence/2026-07-20_ip-diagnostic-probe_prod.md`
 * for the measurements, including that `X-Envoy-External-Address` passes through
 * client-controlled and must never be used here.
 *
 * Falls back to `request.ip` when the header is absent (local dev, tests, or a
 * future non-Railway host). Deliberately **not** a shared constant: a single
 * fallback key would let one header-less client exhaust the bucket for all of
 * them.
 */
export function clientIpKey(request: {
  headers: Record<string, string | string[] | undefined>
  ip: string
}): string {
  const header = request.headers["x-real-ip"]
  // Node may surface a repeated header as an array — key on the first value so a
  // duplicated header shares a bucket with the single-value form.
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  return request.ip
}

/**
 * Global rate limiter (GAPS #3). Keys on the real client IP via `clientIpKey`.
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
    keyGenerator: clientIpKey,
    ...(redis ? { redis } : {}),
  })

  if (redis) {
    app.addHook("onClose", async () => {
      await redis.quit()
    })
  }
})
