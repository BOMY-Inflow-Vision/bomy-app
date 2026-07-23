/**
 * Auth-gating tests for POST /internal/jobs/voucher-issuance (GAPS #4 —
 * constant-time secret compare). All cases here return before any Redis/
 * BullMQ work, so no queue mocking is needed — the actual queue.add() success
 * path is exercised by the manual runbook flow, not here. The "valid secret"
 * case below still proves the auth gate is crossed: with REDIS_URL unset, a
 * correct bearer reaches the REDIS_URL check and 503s there instead of 401ing
 * at the auth check.
 */
import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { internalJobRoutes } from "../../../src/routes/internal/jobs.js"

const SECRET = "test-internal-secret"

async function buildApp() {
  const app = Fastify()
  await app.register(internalJobRoutes)
  return app
}

function post(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/internal/jobs/voucher-issuance", headers })
}

describe("POST /internal/jobs/voucher-issuance — auth gate", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env["INTERNAL_API_SECRET"] = SECRET
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    delete process.env["INTERNAL_API_SECRET"]
  })

  it("503s when INTERNAL_API_SECRET is not configured", async () => {
    // internalJobRoutes reads process.env at REGISTRATION time, not
    // per-request — the secret must be absent before buildApp() runs, not
    // just before the request.
    delete process.env["INTERNAL_API_SECRET"]
    const freshApp = await buildApp()
    try {
      expect((await post(freshApp)).statusCode).toBe(503)
    } finally {
      await freshApp.close()
    }
  })

  it("401s without an Authorization header", async () => {
    expect((await post(app)).statusCode).toBe(401)
  })

  it("401s on a wrong secret of a different length", async () => {
    expect((await post(app, { authorization: "Bearer short" })).statusCode).toBe(401)
  })

  it("401s on a wrong secret of the same length — exercises timingSafeEqual, not just the length check", async () => {
    const wrong = "x".repeat(SECRET.length)
    expect((await post(app, { authorization: `Bearer ${wrong}` })).statusCode).toBe(401)
  })

  it("401s on the right secret with a mismatched scheme (no 'Bearer ' prefix)", async () => {
    expect((await post(app, { authorization: SECRET })).statusCode).toBe(401)
  })

  it("a valid secret crosses the auth gate — 503s on REDIS_URL, not 401", async () => {
    // Proves the correct-secret path isn't accidentally also rejected (e.g. by
    // an off-by-one in the length check). Forcing REDIS_URL unset lets this
    // assert past the auth gate without mocking ioredis/bullmq.
    const savedRedisUrl = process.env["REDIS_URL"]
    delete process.env["REDIS_URL"]
    try {
      const res = await post(app, { authorization: `Bearer ${SECRET}` })
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual({ error: "REDIS_URL not configured" })
    } finally {
      if (savedRedisUrl !== undefined) process.env["REDIS_URL"] = savedRedisUrl
    }
  })
})
