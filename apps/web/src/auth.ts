import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import type { DefaultSession } from "next-auth"

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
  session: { strategy: "database" },
  callbacks: {
    ...authConfig.callbacks,
    session({ session, user }) {
      // user comes from the Drizzle adapter — our users table includes role,
      // but AdapterUser doesn't declare it. Cast to pick it up at runtime.
      const dbUser = user as typeof user & { role?: UserRole }
      session.user.id = user.id
      session.user.role = dbUser.role ?? "buyer"
      return session
    },
  },
})
