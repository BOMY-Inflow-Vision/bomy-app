import { describe, expect, it } from "vitest"

import { authErrorMessage } from "@/lib/auth-error-messages"

describe("authErrorMessage", () => {
  it.each([undefined, ""] as const)("returns null for %j", (code) => {
    expect(authErrorMessage(code)).toBeNull()
  })

  it("maps AccessDenied to a specific message", () => {
    expect(authErrorMessage("AccessDenied")).toBe(
      "Sign-in was denied. Use your BOMY Google account.",
    )
  })

  it("maps OAuthAccountNotLinked to a specific message", () => {
    expect(authErrorMessage("OAuthAccountNotLinked")).toBe(
      "This email is already linked to a different sign-in method.",
    )
  })

  it.each(["OAuthCallbackError", "OAuthSignin", "OAuthCallback"] as const)(
    "maps %s to the Google-retry message",
    (code) => {
      expect(authErrorMessage(code)).toBe("Google sign-in didn't complete. Please try again.")
    },
  )

  it("maps Configuration to a specific message", () => {
    expect(authErrorMessage("Configuration")).toBe(
      "Sign-in is misconfigured on our side. Contact the tech team.",
    )
  })

  it("maps MissingCSRF to a specific message", () => {
    expect(authErrorMessage("MissingCSRF")).toBe("Your sign-in session expired. Please try again.")
  })

  it("falls back to a generic message for unknown codes", () => {
    expect(authErrorMessage("SomeUnknownCode")).toBe("Sign-in failed. Please try again.")
  })
})
