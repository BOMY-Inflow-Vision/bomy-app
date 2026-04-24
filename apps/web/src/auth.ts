import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"

import { makeAuthDb, schema } from "@bomy/db"

import { authConfig } from "./auth.config"

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
})
