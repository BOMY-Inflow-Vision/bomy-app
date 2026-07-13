/**
 * Unit tests — rateLimitPlugin (GAPS #3)
 *
 * Verifies the global default limit, per-route strict overrides (HitPay
 * webhook), route exemption (health/ready), and that limits are keyed by the
 * real forwarded client IP when Fastify runs behind a proxy (Railway).
 */
import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_TIME_WINDOW,
  HITPAY_WEBHOOK_RATE_LIMIT_MAX,
  rateLimitPlugin,
} from "../../src/plugins/rate-limit.js"

async function buildApp() {
  // trustProxy mirrors the production server (server.ts) so request.ip resolves
  // to the leftmost X-Forwarded-For value behind Railway's proxy.
  const app = Fastify({ trustProxy: true })
  await app.register(rateLimitPlugin)

  app.get("/limited", async () => ({ ok: true }))
  app.get("/exempt", { config: { rateLimit: false } }, async () => ({ ok: true }))
  app.post(
    "/webhook-test",
    {
      config: {
        rateLimit: {
          max: HITPAY_WEBHOOK_RATE_LIMIT_MAX,
          timeWindow: API_RATE_LIMIT_TIME_WINDOW,
          groupId: "hitpay-webhook",
        },
      },
    },
    async () => ({ ok: true }),
  )
  // Small explicit limit to exercise IP keying without firing 100+ requests.
  app.get(
    "/tiny",
    { config: { rateLimit: { max: 2, timeWindow: API_RATE_LIMIT_TIME_WINDOW } } },
    async () => ({ ok: true }),
  )

  return app
}

describe("rateLimitPlugin", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it("allows requests up to the global default, then returns 429", async () => {
    for (let i = 0; i < API_RATE_LIMIT_MAX; i++) {
      const res = await app.inject({ method: "GET", url: "/limited" })
      expect(res.statusCode).toBe(200)
    }
    const overflow = await app.inject({ method: "GET", url: "/limited" })
    expect(overflow.statusCode).toBe(429)
  })

  it("never rate limits an exempt route (health/ready pattern)", async () => {
    for (let i = 0; i < API_RATE_LIMIT_MAX + 5; i++) {
      const res = await app.inject({ method: "GET", url: "/exempt" })
      expect(res.statusCode).toBe(200)
    }
  })

  it("enforces the stricter webhook limit below the global default", async () => {
    expect(HITPAY_WEBHOOK_RATE_LIMIT_MAX).toBeLessThan(API_RATE_LIMIT_MAX)

    for (let i = 0; i < HITPAY_WEBHOOK_RATE_LIMIT_MAX; i++) {
      const res = await app.inject({ method: "POST", url: "/webhook-test" })
      expect(res.statusCode).toBe(200)
    }
    const overflow = await app.inject({ method: "POST", url: "/webhook-test" })
    expect(overflow.statusCode).toBe(429)
  })

  it("keys limits by the forwarded client IP, not the proxy address", async () => {
    const ipA = { "x-forwarded-for": "203.0.113.10" }
    const ipB = { "x-forwarded-for": "198.51.100.20" }

    // Exhaust IP A's bucket on /tiny (max 2).
    expect((await app.inject({ method: "GET", url: "/tiny", headers: ipA })).statusCode).toBe(200)
    expect((await app.inject({ method: "GET", url: "/tiny", headers: ipA })).statusCode).toBe(200)
    expect((await app.inject({ method: "GET", url: "/tiny", headers: ipA })).statusCode).toBe(429)

    // A different client IP still has a fresh bucket.
    expect((await app.inject({ method: "GET", url: "/tiny", headers: ipB })).statusCode).toBe(200)
  })
})
