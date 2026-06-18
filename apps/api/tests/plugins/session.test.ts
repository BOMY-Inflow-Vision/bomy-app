/**
 * Unit tests — sessionPlugin JWT decode
 *
 * Verifies that the session plugin correctly decodes a NextAuth v5 JWE cookie
 * into request.session without touching the database.
 */
import cookie from "@fastify/cookie"
import sensible from "@fastify/sensible"
import { encode } from "@auth/core/jwt"
import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { sessionPlugin } from "../../src/plugins/session.js"

const TEST_SECRET = "test-secret-at-least-32-chars-long!!"
const COOKIE_NAME = "authjs.session-token"

async function makeToken(payload: Record<string, unknown>): Promise<string> {
  return encode({ token: payload, secret: TEST_SECRET, salt: COOKIE_NAME })
}

async function buildApp() {
  const app = Fastify()
  await app.register(sensible)
  await app.register(cookie)
  await app.register(sessionPlugin)

  // Minimal test route that echoes the resolved session
  app.get("/session-echo", async (request) => request.session ?? { none: true })

  return app
}

describe("sessionPlugin", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env["AUTH_SECRET"] = TEST_SECRET
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    delete process.env["AUTH_SECRET"]
  })

  it("decodes a valid JWE cookie into request.session", async () => {
    const token = await makeToken({ id: "user-abc", role: "buyer" })

    const res = await app.inject({
      method: "GET",
      url: "/session-echo",
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ userId: "user-abc", userRole: "buyer" })
  })

  it("returns null session when no cookie is present", async () => {
    const res = await app.inject({ method: "GET", url: "/session-echo" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ none: true })
  })

  it("returns null session when AUTH_SECRET is missing", async () => {
    delete process.env["AUTH_SECRET"]

    const token = await makeToken({ id: "user-abc", role: "buyer" })
    const res = await app.inject({
      method: "GET",
      url: "/session-echo",
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ none: true })
  })

  it("returns null session for a tampered / invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/session-echo",
      headers: { Cookie: `${COOKIE_NAME}=not-a-real-jwe` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ none: true })
  })

  it("returns null session when JWT lacks id or role", async () => {
    const token = await makeToken({ sub: "user-abc" }) // no id/role fields

    const res = await app.inject({
      method: "GET",
      url: "/session-echo",
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ none: true })
  })
})
