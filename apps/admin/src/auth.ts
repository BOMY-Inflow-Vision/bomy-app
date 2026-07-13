import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { eq } from "drizzle-orm"
import NextAuth from "next-auth"
import type { DefaultSession } from "next-auth"

import { makeAuthDb, schema, type UserRole } from "@bomy/db"

import { authConfig } from "./auth.config"
import { refreshRole, type RoleToken } from "./lib/role-refresh"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession["user"]
    roleRefreshFailed?: boolean
  }
}

// Lazy singleton — DATABASE_URL is a runtime-only env var in Railway/Docker;
// calling makeAuthDb() at module load would fail during `next build`.
// Deferring to first invocation makes initialization request-time only.
let _nextAuth: ReturnType<typeof NextAuth> | null = null

function getNextAuth(): ReturnType<typeof NextAuth> {
  if (_nextAuth) return _nextAuth
  const { db } = makeAuthDb()
  _nextAuth = NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(db, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    // JWT strategy: the session lives in an encrypted cookie the edge
    // middleware can decode (database sessions are opaque tokens the middleware
    // can't read — that mismatch bounced every sign-in). The adapter is still
    // used for user/account persistence.
    session: { strategy: "jwt" },
    callbacks: {
      ...authConfig.callbacks,
      async jwt({ token, user }) {
        if (user?.id) {
          const dbUser = user as typeof user & { role?: UserRole }
          token["id"] = user.id
          token["role"] = dbUser.role ?? "buyer"
          token["roleCheckedAt"] = Date.now()
          token["roleRefreshFailed"] = false
          return token
        }
        const refreshed = await refreshRole(token as RoleToken, {
          now: Date.now(),
          lookupRole: async (userId) => {
            const rows = await db
              .select({ role: schema.users.role })
              .from(schema.users)
              .where(eq(schema.users.id, userId))
              .limit(1)
            return rows[0]?.role ?? null
          },
        })
        return { ...token, ...refreshed }
      },
      session({ session, token }) {
        session.user.id = (token["id"] as string) ?? token.sub ?? ""
        session.user.role = (token["role"] as UserRole) ?? "buyer"
        session.roleRefreshFailed = token["roleRefreshFailed"] === true
        return session
      },
    },
  })
  return _nextAuth
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
export const { handlers, signIn, signOut, auth } = {
  handlers: {
    GET: (...a: any[]) => (getNextAuth().handlers.GET as any)(...a),
    POST: (...a: any[]) => (getNextAuth().handlers.POST as any)(...a),
  },
  auth: (...a: any[]) => (getNextAuth().auth as any)(...a),
  signIn: (...a: any[]) => (getNextAuth().signIn as any)(...a),
  signOut: (...a: any[]) => (getNextAuth().signOut as any)(...a),
} as unknown as ReturnType<typeof NextAuth>
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
