import { beforeEach, describe, expect, it, vi } from "vitest"

const { signInMock, verifyTurnstileMock, limitMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  verifyTurnstileMock: vi.fn(),
  limitMock: vi.fn(),
}))

// getAuthDb() returns a chainable query builder; the action calls
// .select().from().where().limit() to check for an existing magic-link token.
vi.mock("@/auth", () => ({
  signIn: signInMock,
  getAuthDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: limitMock,
        }),
      }),
    }),
  }),
}))

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: verifyTurnstileMock,
}))

import { sendMagicLinkAction } from "../../src/app/auth/sign-in/actions.js"

function makeFormData(email = "buyer@example.com", token = "turnstile-token"): FormData {
  const fd = new FormData()
  fd.set("email", email)
  fd.set("cf-turnstile-response", token)
  return fd
}

describe("sendMagicLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
