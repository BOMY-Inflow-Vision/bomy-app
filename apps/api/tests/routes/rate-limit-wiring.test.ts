/**
 * Integration — rate-limit wiring on the real route modules (GAPS #3).
 *
 * DB-free: a 429 (limiter) or 401 (bad signature) short-circuits before any
 * withAdmin/DB work, so these assert that the actual production route options
 * carry the exemption / strict-override config — not just a test route.
 */
import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  API_RATE_LIMIT_MAX,
  HITPAY_WEBHOOK_RATE_LIMIT_MAX,
  rateLimitPlugin,
} from "../../src/plugins/rate-limit.js"
import { healthRoutes } from "../../src/routes/health.js"
import { hitpayWebhookRoutes } from "../../src/routes/webhooks/hitpay.js"

async function buildApp() {
  const app = Fastify({ trustProxy: true })
  await app.register(rateLimitPlugin)
  await app.register(healthRoutes)
  await app.register(hitpayWebhookRoutes)
  return app
}

function forgedWebhook(app: Awaited<ReturnType<typeof buildApp>>) {
  return app.inject({
    method: "POST",
    url: "/webhooks/hitpay",
    headers: { "content-type": "application/json", "hitpay-signature": "bad" },
    body: "{}",
  })
}

describe("rate-limit wiring (real routes)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env["HITPAY_SALT"] = "test-salt-for-wiring"
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    delete process.env["HITPAY_SALT"]
  })

  it("exempts GET /health from the global limit", async () => {
    for (let i = 0; i < API_RATE_LIMIT_MAX + 5; i++) {
      const res = await app.inject({ method: "GET", url: "/health" })
      expect(res.statusCode).toBe(200)
    }
  })

  it("applies the stricter limit to POST /webhooks/hitpay", async () => {
    // Forged posts fail HMAC (401) but still consume the bucket.
    for (let i = 0; i < HITPAY_WEBHOOK_RATE_LIMIT_MAX; i++) {
      expect((await forgedWebhook(app)).statusCode).toBe(401)
    }
    // One past the strict cap (well under the global default) → 429.
    expect((await forgedWebhook(app)).statusCode).toBe(429)
  })
})
