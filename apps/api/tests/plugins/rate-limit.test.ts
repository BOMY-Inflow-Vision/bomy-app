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
  // trustProxy mirrors the production server (server.ts): trust one hop so
  // request.ip resolves to the rightmost (Railway-stamped) X-Forwarded-For value.
  const app = Fastify({ trustProxy: 1 })
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

  it("keys on the trusted (Railway-appended, rightmost) IP, not a spoofed leftmost XFF", async () => {
    // Railway's edge proxy appends the real client to the RIGHT of
    // X-Forwarded-For; the leftmost entries are attacker-controlled. Rotating
    // the spoofed prefix must NOT mint fresh buckets, or the limiter is trivially
    // bypassed. /tiny has max 2, so the third request from the same real client
    // must 429 despite a rotating spoof.
    const realClient = "5.5.5.5"
    const tiny = (spoof: string) =>
      app.inject({
        method: "GET",
        url: "/tiny",
        headers: { "x-forwarded-for": `${spoof}, ${realClient}` },
      })

    expect((await tiny("1.1.1.1")).statusCode).toBe(200)
    expect((await tiny("2.2.2.2")).statusCode).toBe(200)
    expect((await tiny("3.3.3.3")).statusCode).toBe(429)

    // A genuinely different real client (different rightmost) keeps its own bucket.
    const other = await app.inject({
      method: "GET",
      url: "/tiny",
      headers: { "x-forwarded-for": "1.1.1.1, 8.8.8.8" },
    })
    expect(other.statusCode).toBe(200)
  })
})
