import { randomUUID } from "node:crypto"

import { and, eq, lt } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { makeAuthDb, schema } from "@bomy/db"

// getAuthDb() is swappable: unit tests use a chainable query-builder stub
// backed by limitMock; the DB regression suite points it at a real auth pool
// so the SQL-level `expires` filter is actually exercised.
const { signInMock, verifyTurnstileMock, limitMock, authDbHolder } = vi.hoisted(() => {
  const limitMock = vi.fn()
  const chainStub = {
    delete: () => ({ where: () => Promise.resolve(undefined) }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: limitMock,
        }),
      }),
    }),
  }
  return {
    signInMock: vi.fn(),
    verifyTurnstileMock: vi.fn(),
    limitMock,
    // typed loosely; the action sees the real getAuthDb return type from @/auth
    authDbHolder: { current: chainStub as unknown, chainStub: chainStub as unknown },
  }
})

vi.mock("@/auth", () => ({
  signIn: signInMock,
  getAuthDb: () => authDbHolder.current,
}))

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: verifyTurnstileMock,
}))

import { sendMagicLinkAction } from "../../src/app/auth/sign-in/actions.js"

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

function makeFormData(email = "buyer@example.com", token = "turnstile-token"): FormData {
  const fd = new FormData()
  fd.set("email", email)
  fd.set("cf-turnstile-response", token)
  return fd
}

describe("sendMagicLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authDbHolder.current = authDbHolder.chainStub // unit tests use the stub
    verifyTurnstileMock.mockResolvedValue({ success: true })
    signInMock.mockResolvedValue(undefined)
    limitMock.mockResolvedValue([]) // no existing token → cooldown passes
  })

  it("runs Turnstile verification before email validation and side effects", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({
      success: false,
      reason: "invalid-response",
    })

    const result = await sendMagicLinkAction(null, makeFormData("not-an-email", ""))

    expect(result).toEqual({ error: "Verification failed. Please try the challenge again." })
    expect(verifyTurnstileMock).toHaveBeenCalledWith(null)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it.each([
    "buyer@example.com, attacker@evil.com",
    "buyer@example.com;attacker@evil.com",
    "Buyer <buyer@example.com>",
    "buyer buyer@example.com",
    "not-an-email",
    "double@@example.com",
    '"quoted"@example.com',
  ])("rejects invalid or multi-recipient email shape: %s", async (email) => {
    const result = await sendMagicLinkAction(null, makeFormData(email))

    expect(result).toEqual({ error: "Please enter a valid email address." })
    expect(verifyTurnstileMock).toHaveBeenCalledOnce()
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("trims a valid address and starts the nodemailer sign-in flow", async () => {
    const result = await sendMagicLinkAction(null, makeFormData("  buyer@example.com  "))

    expect(result).toBeNull()
    expect(signInMock).toHaveBeenCalledWith("nodemailer", {
      email: "buyer@example.com",
      redirectTo: "/auth/consent",
    })
  })

  it("rejects with a cooldown message when a token already exists for the address", async () => {
    limitMock.mockResolvedValueOnce([{ identifier: "buyer@example.com" }])

    const result = await sendMagicLinkAction(null, makeFormData("buyer@example.com"))

    expect(result).toEqual({
      error:
        "A sign-in link was already sent — check your inbox or wait a few minutes before requesting another.",
    })
    expect(signInMock).not.toHaveBeenCalled()
  })
})

// Real-DB regression for the cooldown expiry bug: the cooldown must only block
// on a LIVE (unexpired) token. An expired-but-unclicked token must NOT lock the
// user out, since nothing else cleans those rows up.
describe.skipIf(!shouldRun)("sendMagicLinkAction — cooldown expiry (DB)", () => {
  const { db: authDb, close } = makeAuthDb()
  const email = `cooldown-${randomUUID()}@test.bomy`

  async function clearTokens() {
    await authDb
      .delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.identifier, email))
  }

  beforeAll(() => {
    authDbHolder.current = authDb
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    verifyTurnstileMock.mockResolvedValue({ success: true })
    signInMock.mockResolvedValue(undefined)
    await clearTokens()
  })

  afterEach(async () => {
    await clearTokens()
  })

  afterAll(async () => {
    authDbHolder.current = authDbHolder.chainStub
    await close()
  })

  it("an expired token does NOT block a new sign-in link", async () => {
    await authDb.insert(schema.verificationTokens).values({
      identifier: email,
      token: randomUUID(),
      expires: new Date(Date.now() - 60_000), // expired 1 min ago
    })

    const result = await sendMagicLinkAction(null, makeFormData(email))

    expect(result).toBeNull()
    expect(signInMock).toHaveBeenCalledWith("nodemailer", {
      email,
      redirectTo: "/auth/consent",
    })
  })

  it("a live (unexpired) token DOES block with the cooldown message", async () => {
    await authDb.insert(schema.verificationTokens).values({
      identifier: email,
      token: randomUUID(),
      expires: new Date(Date.now() + 60 * 60_000), // valid for 1 h
    })

    const result = await sendMagicLinkAction(null, makeFormData(email))

    expect(result).toEqual({
      error:
        "A sign-in link was already sent — check your inbox or wait a few minutes before requesting another.",
    })
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("an expired token is cleaned up so the table does not grow unbounded", async () => {
    await authDb.insert(schema.verificationTokens).values({
      identifier: email,
      token: randomUUID(),
      expires: new Date(Date.now() - 60_000),
    })

    await sendMagicLinkAction(null, makeFormData(email))

    const stale = await authDb
      .select({ token: schema.verificationTokens.token })
      .from(schema.verificationTokens)
      .where(
        and(
          eq(schema.verificationTokens.identifier, email),
          lt(schema.verificationTokens.expires, new Date()),
        ),
      )
    expect(stale).toHaveLength(0)
  })
})
