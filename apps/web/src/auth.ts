import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import type { DefaultSession } from "next-auth"
import type { JWT } from "next-auth/jwt"

import { makeAuthDb, schema, type UserRole } from "@bomy/db"

import { authConfig } from "./auth.config"

// Augment the session type so server components get id + role without casts.
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession["user"]
  }
}

const { db } = makeAuthDb()

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // JWT strategy: session data lives in the encrypted cookie, not the DB.
  // This lets the edge middleware read id+role from the JWT without a DB
  // round-trip. The adapter is still used for user/account management.
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        // At sign-in: encode id and role into the JWT so the edge middleware
        // can populate auth.user without touching the database.
        const dbUser = user as typeof user & { role?: UserRole }
        token["id"] = user.id
        token["role"] = dbUser.role ?? "buyer"
      }
      return token
    },
    session({ session, token }) {
      // Read id and role from the JWT token (set by the jwt callback above).
      const t = token as JWT & { id?: string; role?: UserRole }
      session.user.id = t.id ?? ""
      session.user.role = t.role ?? "buyer"
      return session
    },
  },
})
