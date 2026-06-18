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

export const sessionPlugin = fp(async (app) => {
  app.decorateRequest("session", null)

  app.addHook("onRequest", async (request) => {
    const secret = process.env["AUTH_SECRET"]
    if (!secret) return

    // NextAuth v5 uses the cookie name itself as the JWE salt.
    const secureCookie = request.protocol === "https"
    const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token"

    const token = await getToken({
      req: { headers: request.headers as Record<string, string> },
      secret,
      secureCookie,
      salt: cookieName,
    })

    if (!token) return

    const userId = token["id"] as string | undefined
    const userRole = token["role"] as UserRole | undefined
    if (!userId || !userRole) return

    request.session = { userId, userRole }
  })
})
