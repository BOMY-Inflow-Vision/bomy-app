/**
 * Integration — shared Redis store across instances (GAPS #3 follow-up).
 *
 * A per-instance in-memory limiter only tracks one process's view of a key, so
 * it can't survive a rolling deploy (old + new container briefly overlapping)
 * or any future horizontal scaling. With REDIS_URL set the store must be
 * shared: two independent app instances count against ONE bucket. (The PR #90
 * prod smoke that originally motivated this was the rotating-edge-IP keying
 * bug — see GAPS.md #3/#9 — not confirmed multiple app replicas; Redis is
 * still the right store regardless.)
 *
 * Requires a reachable Redis; skips without REDIS_URL.
 */
import { randomUUID } from "node:crypto"

import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { rateLimitPlugin } from "../../src/plugins/rate-limit.js"

const shouldRun = Boolean(process.env["REDIS_URL"])

async function buildApp(groupId: string) {
  const app = Fastify({ trustProxy: 1 })
  await app.register(rateLimitPlugin)
  app.get(
    "/tiny",
    { config: { rateLimit: { max: 3, timeWindow: 60_000, groupId } } },
    async () => ({ ok: true }),
  )
  return app
}

describe.skipIf(!shouldRun)("rateLimitPlugin — shared store across instances", () => {
  let appA: Awaited<ReturnType<typeof buildApp>>
  let appB: Awaited<ReturnType<typeof buildApp>>
  // Unique groupId per run so Redis keys never collide with a previous run.
  const groupId = `test-shared-${randomUUID()}`
  const client = { "x-forwarded-for": "5.5.5.5" }

  beforeEach(async () => {
    appA = await buildApp(groupId)
    appB = await buildApp(groupId)
  })

  afterEach(async () => {
    await appA.close()
    await appB.close()
  })

  it("counts requests to two separate instances against one shared bucket", async () => {
    // Exhaust the max (3) entirely on instance A.
    const a1 = await appA.inject({ method: "GET", url: "/tiny", headers: client })
    const a2 = await appA.inject({ method: "GET", url: "/tiny", headers: client })
    const a3 = await appA.inject({ method: "GET", url: "/tiny", headers: client })
    expect([a1.statusCode, a2.statusCode, a3.statusCode]).toEqual([200, 200, 200])

    // Instance B, same client + groupId, sees the shared count already at the
    // limit → 429. With a per-instance store this would be 200.
    const b = await appB.inject({ method: "GET", url: "/tiny", headers: client })
    expect(b.statusCode).toBe(429)
  })
})
