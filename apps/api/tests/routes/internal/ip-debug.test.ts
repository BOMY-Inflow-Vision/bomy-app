/**
 * GET /internal/ip-debug — temporary proxy-header diagnostic (GAPS #3).
 *
 * DB-free. Covers the two gates (feature flag, bearer secret) and asserts the
 * response exposes exactly the proxy/IP fields we need to prove which header
 * carries the real client — and nothing else.
 */
import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ipDebugRoutes } from "../../../src/routes/internal/ip-debug.js"

const SECRET = "test-internal-secret"

type IpDebugPayload = {
  requestIp: string
  requestIps: string[] | null
  xForwardedFor: string | null
  xRealIp: string | null
  xEnvoyExternalAddress: string | null
  fastlyClientIp: string | null
  xRailwayEdge: string | null
  xRailwayRequestId: string | null
  socketRemoteAddress: string | null
}

async function buildApp() {
  const app = Fastify({ trustProxy: 1 })
  await app.register(ipDebugRoutes)
  return app
}

function get(
  app: Awaited<ReturnType<typeof buildApp>>,
  headers: Record<string, string> = { authorization: `Bearer ${SECRET}` },
) {
  return app.inject({ method: "GET", url: "/internal/ip-debug", headers })
}

describe("GET /internal/ip-debug", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env["INTERNAL_API_SECRET"] = SECRET
    process.env["ENABLE_IP_DIAGNOSTIC"] = "1"
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    delete process.env["INTERNAL_API_SECRET"]
    delete process.env["ENABLE_IP_DIAGNOSTIC"]
  })

  it("404s when ENABLE_IP_DIAGNOSTIC is unset — inert on merge", async () => {
    delete process.env["ENABLE_IP_DIAGNOSTIC"]
    expect((await get(app)).statusCode).toBe(404)
  })

  it("404s when ENABLE_IP_DIAGNOSTIC is set to anything other than 1", async () => {
    process.env["ENABLE_IP_DIAGNOSTIC"] = "true"
    expect((await get(app)).statusCode).toBe(404)
  })

  it("404s before checking the secret, so the flag alone hides the route", async () => {
    delete process.env["ENABLE_IP_DIAGNOSTIC"]
    const res = await get(app, {})
    expect(res.statusCode).toBe(404)
  })

  it("503s when the flag is on but INTERNAL_API_SECRET is not configured", async () => {
    delete process.env["INTERNAL_API_SECRET"]
    expect((await get(app)).statusCode).toBe(503)
  })

  it("401s without an Authorization header", async () => {
    expect((await get(app, {})).statusCode).toBe(401)
  })

  it("401s on a wrong secret of the same length", async () => {
    const wrong = "x".repeat(SECRET.length)
    expect((await get(app, { authorization: `Bearer ${wrong}` })).statusCode).toBe(401)
  })

  it("401s on a wrong secret of a different length", async () => {
    expect((await get(app, { authorization: "Bearer short" })).statusCode).toBe(401)
  })

  it("echoes the proxy headers and resolved IPs when authorised", async () => {
    const res = await get(app, {
      authorization: `Bearer ${SECRET}`,
      "x-forwarded-for": "161.142.170.133, 152.233.1.2",
      "x-real-ip": "152.233.1.2",
      "x-envoy-external-address": "161.142.170.133",
      "fastly-client-ip": "161.142.170.133",
      "x-railway-edge": "railway/asia-southeast1",
      "x-railway-request-id": "req-abc123",
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<IpDebugPayload>()

    expect(body).toEqual({
      requestIp: "152.233.1.2",
      // trustProxy: 1 truncates `ips` to the socket + the single trusted hop —
      // the left-hand entries are dropped. Proving the real client therefore
      // needs the RAW x-forwarded-for below, not this.
      requestIps: ["127.0.0.1", "152.233.1.2"],
      xForwardedFor: "161.142.170.133, 152.233.1.2",
      xRealIp: "152.233.1.2",
      xEnvoyExternalAddress: "161.142.170.133",
      fastlyClientIp: "161.142.170.133",
      xRailwayEdge: "railway/asia-southeast1",
      xRailwayRequestId: "req-abc123",
      socketRemoteAddress: "127.0.0.1",
    })
  })

  it("reports nulls for absent proxy headers", async () => {
    const res = await get(app)

    expect(res.statusCode).toBe(200)
    const body = res.json<IpDebugPayload>()

    expect(body.xForwardedFor).toBeNull()
    expect(body.xRealIp).toBeNull()
    expect(body.xEnvoyExternalAddress).toBeNull()
    expect(body.fastlyClientIp).toBeNull()
    expect(body.xRailwayEdge).toBeNull()
    expect(body.xRailwayRequestId).toBeNull()
  })
})
