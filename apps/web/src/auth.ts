import { and, eq } from "drizzle-orm"
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
      // Version the user last accepted (undefined = never consented).
      consentVersion?: string | undefined
      // platform_config tos_version in force when this token was minted.
      currentTosVersion?: string | undefined
    } & DefaultSession["user"]
  }
}

const { db } = makeAuthDb()

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // JWT strategy: session lives in an encrypted cookie, no DB lookup at runtime.
  // The adapter is still used for user/account management.
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session: updateData }) {
      // unstable_update() called from acceptConsent action — re-stamp the accepted version.
      const update = updateData as { consentVersion?: string } | null | undefined
      if (trigger === "update" && typeof update?.consentVersion === "string") {
        token["consentVersion"] = update.consentVersion
        return token
      }

      if (user?.id) {
        // At sign-in: encode id, role, and current consent state into the JWT.
        const dbUser = user as typeof user & { role?: UserRole }
        token["id"] = user.id
        token["role"] = dbUser.role ?? "buyer"

        // Read current tos_version from platform_config (authDb bypasses RLS).
        const configRows = await db
          .select({ value: schema.platformConfig.value })
          .from(schema.platformConfig)
          .where(eq(schema.platformConfig.key, "tos_version"))
          .limit(1)
        const currentTosVersion =
          typeof configRows[0]?.value === "string" ? configRows[0].value : undefined

        token["currentTosVersion"] = currentTosVersion

        // Check if the user has already accepted the current version.
        // Eventual consistency: a concurrent acceptConsent() call during this
        // sign-in will produce a stale JWT. The user will be gated to /auth/consent
        // on their next page visit, which re-calls unstable_update() and fixes the
        // staleness. This window is sub-second and matches existing role-staleness
        // behaviour.
        if (currentTosVersion) {
          const consentRows = await db
            .select({ id: schema.userConsents.id })
            .from(schema.userConsents)
            .where(
              and(
                eq(schema.userConsents.userId, user.id),
                eq(schema.userConsents.document, "tos"),
                eq(schema.userConsents.version, currentTosVersion),
              ),
            )
            .limit(1)
          token["consentVersion"] = consentRows.length > 0 ? currentTosVersion : undefined
        }
      }
      return token
    },
    session({ session, token }) {
      session.user.id = (token["id"] as string) ?? token.sub ?? ""
      session.user.role = (token["role"] as UserRole) ?? "buyer"
      session.user.consentVersion = token["consentVersion"] as string | undefined
      session.user.currentTosVersion = token["currentTosVersion"] as string | undefined
      return session
    },
  },
})
