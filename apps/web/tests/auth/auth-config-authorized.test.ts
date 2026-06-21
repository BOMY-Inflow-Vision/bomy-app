import { describe, expect, it } from "vitest"

import type { UserRole } from "@bomy/db"

import { authConfig } from "@/auth.config"

const TOS = "2026-06-17"

type TestUser = {
  role?: UserRole
  consentVersion?: string
  currentTosVersion?: string
}

type AuthorizedArg = Parameters<typeof authConfig.callbacks.authorized>[0]

// The authorized() callback only reads `auth.user` and `request.nextUrl`, so we
// pass a minimal shape (via `unknown`) rather than constructing a full
// Session / NextRequest.
function authorize(pathname: string, user: TestUser | null) {
  const nextUrl = new URL(`http://localhost:3000${pathname}`)
  const auth = user ? { user } : null
  return authConfig.callbacks.authorized({ auth, request: { nextUrl } } as unknown as AuthorizedArg)
}

const consented: TestUser = { role: "buyer", consentVersion: TOS, currentTosVersion: TOS }

function redirectTarget(result: ReturnType<typeof authorize>): string | null {
  if (result instanceof Response) {
    return new URL(result.headers.get("location")!).pathname
  }
  return null
}

describe("authConfig.authorized — public routes", () => {
  it("allows an anonymous visitor to a public path", () => {
    expect(authorize("/", null)).toBe(true)
  })

  it("allows a logged-in, consented visitor to a public path", () => {
    expect(authorize("/", consented)).toBe(true)
  })
})

describe("authConfig.authorized — login-required routes", () => {
  it.each(["/account", "/dashboard", "/membership/manage", "/membership/success"])(
    "blocks an anonymous visitor to %s",
    (path) => {
      expect(authorize(path, null)).toBe(false)
    },
  )

  it("allows a consented user to a login-required route", () => {
    expect(authorize("/account", consented)).toBe(true)
  })

  it("blocks an anonymous visitor to /seller/dashboard", () => {
    expect(authorize("/seller/dashboard", null)).toBe(false)
  })
})

describe("authConfig.authorized — consent gate", () => {
  it("redirects a logged-in user with no consent to /auth/consent", () => {
    const result = authorize("/account", { role: "buyer", currentTosVersion: TOS })
    expect(redirectTarget(result)).toBe("/auth/consent")
  })

  it("redirects a logged-in user with a stale consent version to /auth/consent", () => {
    const result = authorize("/account", {
      role: "buyer",
      consentVersion: "2026-01-01",
      currentTosVersion: TOS,
    })
    expect(redirectTarget(result)).toBe("/auth/consent")
  })

  it.each(["/auth/consent", "/auth/sign-in", "/terms", "/privacy", "/api/auth/signout"])(
    "does not redirect an unconsented user already on allowlisted path %s",
    (path) => {
      const result = authorize(path, { role: "buyer", currentTosVersion: TOS })
      expect(result).toBe(true)
    },
  )

  it("fires the consent gate before the seller-role check", () => {
    // Unconsented buyer hitting the seller dashboard must land on /auth/consent,
    // not the /account role-rejection target — consent gate has priority.
    const result = authorize("/seller/dashboard", { role: "buyer", currentTosVersion: TOS })
    expect(redirectTarget(result)).toBe("/auth/consent")
  })
})

describe("authConfig.authorized — seller-role gate", () => {
  it("allows a consented seller_owner into /seller/dashboard", () => {
    const seller: TestUser = {
      role: "seller_owner",
      consentVersion: TOS,
      currentTosVersion: TOS,
    }
    expect(authorize("/seller/dashboard", seller)).toBe(true)
  })

  it("redirects a consented non-seller away from /seller/dashboard to /account", () => {
    const result = authorize("/seller/dashboard", consented)
    expect(redirectTarget(result)).toBe("/account")
  })
})
