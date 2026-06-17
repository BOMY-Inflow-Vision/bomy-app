import { schema, type UserRole } from "@bomy/db"
import { eq } from "drizzle-orm"
import fp from "fastify-plugin"

export interface SessionUser {
  userId: string
  userRole: UserRole
}

declare module "fastify" {
  interface FastifyRequest {
    /** Resolved from the NextAuth session cookie. Null if unauthenticated. */
    session: SessionUser | null
  }
}

// NextAuth v5 uses the secure prefix on HTTPS, plain prefix on HTTP (dev).
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"]

export const sessionPlugin = fp(async (app) => {
  app.decorateRequest("session", null)

  app.addHook("onRequest", async (request) => {
    let token: string | undefined
    for (const name of SESSION_COOKIES) {
      token = request.cookies[name]
      if (token) break
    }
    if (!token) return

    // TODO(PR#44): apps/web switched to strategy:"jwt" — the cookie value is now
    // a JWE blob, not a UUID. This lookup never matches and always returns null.
    // Replace with getToken() from @auth/core/jwt to decode the JWE directly.
    const [row] = await app.authDb.db
      .select({
        userId: schema.sessions.userId,
        expires: schema.sessions.expires,
        userRole: schema.users.role,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.sessions.sessionToken, token))
      .limit(1)

    if (!row || row.expires <= new Date()) return

    request.session = { userId: row.userId, userRole: row.userRole }
  })
})
