import { describe, expect, it } from "vitest"

import { authErrorMessage } from "@/lib/auth-error-messages"

describe("authErrorMessage", () => {
  it.each([undefined, ""])("returns null for %j (no error present)", (code) => {
    expect(authErrorMessage(code)).toBeNull()
  })

  it("maps Verification to the expired/used magic-link copy", () => {
    expect(authErrorMessage("Verification")).toBe(
      "That sign-in link has expired or was already used. Request a new one.",
    )
  })

  it("maps AccessDenied", () => {
    expect(authErrorMessage("AccessDenied")).toBe("Sign-in was denied for this account.")
  })

  it("maps OAuthAccountNotLinked", () => {
    expect(authErrorMessage("OAuthAccountNotLinked")).toBe(
      "This email is already linked to a different sign-in method. Sign in the way you did before.",
    )
  })

  it.each(["OAuthCallbackError", "OAuthSignInError", "OAuthSignin", "OAuthCallback"])(
    "maps %s to the Google cancelled/incomplete copy",
    (code) => {
      expect(authErrorMessage(code)).toBe(
        "Google sign-in was cancelled or didn't complete. Please try again.",
      )
    },
  )

  it("maps MissingCSRF", () => {
    expect(authErrorMessage("MissingCSRF")).toBe("Your sign-in session expired. Please try again.")
  })

  it("maps Configuration", () => {
    expect(authErrorMessage("Configuration")).toBe(
      "Sign-in is temporarily unavailable. Please try again later.",
    )
  })

  it("falls back to a generic message for an unrecognized code", () => {
    expect(authErrorMessage("SomeFutureAuthErrorCode")).toBe("Sign-in failed. Please try again.")
  })
})
