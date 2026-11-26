/**
 * Unit tests — GET /ready PSP status (Stripe design PR 3). The Postgres/Redis probes are
 * mocked; this covers only the shape and that no secret material is ever returned.
 */
import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../src/lib/checks.js", () => ({
  checkPostgres: vi.fn(),
  checkRedis: vi.fn(),
}))

import { checkPostgres, checkRedis } from "../../src/lib/checks.js"
import { pspStatus } from "../../src/lib/psp-status.js"
import { readyRoutes } from "../../src/routes/ready.js"

const SALT = "salt-value-that-must-never-leak"
const STRIPE_KEY = "sk_live_must_never_leak"

async function buildApp() {
  const app = Fastify()
  await app.register(readyRoutes)
  return app
}

describe("pspStatus", () => {
  it("hitpay is true only when HITPAY_SALT is non-empty", () => {
    expect(pspStatus({ HITPAY_SALT: "x" }).hitpay).toBe(true)
    expect(pspStatus({ HITPAY_SALT: "" }).hitpay).toBe(false)
    expect(pspStatus({}).hitpay).toBe(false)
  })

  it("stripe is never configured in PR 3, even with Stripe env present", () => {
    expect(pspStatus({ STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_WEBHOOK_SECRET: "whsec_x" })).toEqual({
      hitpay: false,
      stripe: false,
      stripeLivemode: null,
    })
  })
})

describe("GET /ready", () => {
  const saved = { ...process.env }

  beforeEach(() => {
    process.env["HITPAY_SALT"] = SALT
    process.env["STRIPE_SECRET_KEY"] = STRIPE_KEY
  })

  afterEach(() => {
    process.env = { ...saved }
    vi.mocked(checkPostgres).mockReset()
    vi.mocked(checkRedis).mockReset()
  })

  it("200 with booleans-only psp block when healthy", async () => {
    vi.mocked(checkPostgres).mockResolvedValue(undefined)
    vi.mocked(checkRedis).mockResolvedValue(undefined)
    const app = await buildApp()
    const res = await app.inject({ method: "GET", url: "/ready" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      status: "ok",
      checks: { postgres: "ok", redis: "ok" },
      psp: { hitpay: true, stripe: false, stripeLivemode: null },
    })
    expect(res.body).not.toContain(SALT)
    expect(res.body).not.toContain(STRIPE_KEY)
    await app.close()
  })

  it("PSP status never changes the health verdict (503 comes from the probes only)", async () => {
    vi.mocked(checkPostgres).mockRejectedValue(new Error("down"))
    vi.mocked(checkRedis).mockResolvedValue(undefined)
    delete process.env["HITPAY_SALT"]
    const app = await buildApp()
    const res = await app.inject({ method: "GET", url: "/ready" })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      status: "error",
      psp: { hitpay: false, stripe: false, stripeLivemode: null },
    })
    await app.close()

    vi.mocked(checkPostgres).mockResolvedValue(undefined)
    const app2 = await buildApp()
    const ok = await app2.inject({ method: "GET", url: "/ready" })
    expect(ok.statusCode).toBe(200) // no HitPay salt, still healthy
    await app2.close()
  })
})
