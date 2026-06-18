import { getToken } from "@auth/core/jwt"
import type { UserRole } from "@bomy/db"
import fp from "fastify-plugin"

export interface SessionUser {
  userId: string
  userRole: UserRole
}

declare module "fastify" {
  interface FastifyRequest {
    /** Resolved from the NextAuth JWE session cookie. Null if unauthenticated. */
    session: SessionUser | null
  }
}

const SESSION_COOKIES = [
  { name: "__Secure-authjs.session-token", secureCookie: true },
  { name: "authjs.session-token", secureCookie: false },
] as const

export const sessionPlugin = fp(async (app) => {
  app.decorateRequest("session", null)

  app.addHook("onRequest", async (request) => {
    const secret = process.env["AUTH_SECRET"]
    if (!secret) return

    let token: Awaited<ReturnType<typeof getToken>> = null
    for (const cookie of SESSION_COOKIES) {
      // NextAuth v5 uses the cookie name itself as the JWE salt. Try both names
      // because API hosts often see plain HTTP behind a TLS terminator.
      token = await getToken({
        req: { headers: request.headers as Record<string, string> },
        secret,
        cookieName: cookie.name,
        secureCookie: cookie.secureCookie,
        salt: cookie.name,
      })
      if (token) break
    }

    if (!token) return

    const userId = token["id"] as string | undefined
    const userRole = token["role"] as UserRole | undefined
    if (!userId || !userRole) return

    request.session = { userId, userRole }
  })
})
