import { describe, expect, it } from "vitest"

import type { UserRole } from "@bomy/db"

import { authConfig } from "@/auth.config"

type SessionArg = Parameters<typeof authConfig.callbacks.session>[0]
type AuthorizedArg = Parameters<typeof authConfig.callbacks.authorized>[0]

function runSession(token: Record<string, unknown>) {
  const session = { user: {} as { id?: string; role?: UserRole } }
  // The callback mutates session.user in place; read it back after.
  authConfig.callbacks.session({ session, token } as unknown as SessionArg)
  return session
}

function authorize(pathname: string, user: { role?: UserRole } | null) {
  const nextUrl = new URL(`https://admin.example.com${pathname}`)
  const auth = user ? { user } : null
  return authConfig.callbacks.authorized({ auth, request: { nextUrl } } as unknown as AuthorizedArg)
}

function redirectPath(result: ReturnType<typeof authorize>): string | null {
  if (result instanceof Response) return new URL(result.headers.get("location")!).pathname
  return null
}

// The fix: middleware decodes the JWT but never runs auth.ts's session callback,
// so authConfig itself must propagate id/role from the token for authorized() to see it.
describe("admin authConfig.session — JWT → session propagation (edge middleware)", () => {
  it("copies id and role from the token into session.user", () => {
    const result = runSession({ id: "u-1", role: "bomy_admin" })
    expect(result.user.id).toBe("u-1")
    expect(result.user.role).toBe("bomy_admin")
  })

  it("leaves session.user fields unset when the token carries no custom claims", () => {
    const result = runSession({})
    expect(result.user.id).toBeUndefined()
    expect(result.user.role).toBeUndefined()
  })
})

describe("admin authConfig.authorized — BOMY role gate", () => {
  it.each(["bomy_ops", "bomy_admin", "bomy_finance"] as const)(
    "allows %s into the console",
    (role) => {
      expect(authorize("/stores", { role })).toBe(true)
    },
  )

  it("returns false (→ sign-in) when not signed in", () => {
    expect(authorize("/stores", null)).toBe(false)
  })

  it("redirects a signed-in non-BOMY role to /unauthorized", () => {
    expect(redirectPath(authorize("/stores", { role: "buyer" }))).toBe("/unauthorized")
  })

  it("redirects a signed-in user with no role to /unauthorized", () => {
    expect(redirectPath(authorize("/stores", {}))).toBe("/unauthorized")
  })
})
