import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import type { DefaultSession } from "next-auth"

import { makeAuthDb, schema, type UserRole } from "@bomy/db"

import { authConfig } from "./auth.config"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession["user"]
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
    session: { strategy: "database" },
    callbacks: {
      ...authConfig.callbacks,
      session({ session, user }) {
        const dbUser = user as typeof user & { role?: UserRole }
        session.user.id = user.id
        session.user.role = dbUser.role ?? "buyer"
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
