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

// Re-derives consent state from the DB. Both "tos" and "privacy" rows for the
// current tos_version must exist before consentVersion is stamped. Called at
// sign-in and on every session update — never trusts client-supplied data.
async function deriveConsentState(userId: string): Promise<{
  consentVersion: string | undefined
  currentTosVersion: string | undefined
}> {
  const configRows = await db
    .select({ value: schema.platformConfig.value })
    .from(schema.platformConfig)
    .where(eq(schema.platformConfig.key, "tos_version"))
    .limit(1)
  const currentTosVersion =
    typeof configRows[0]?.value === "string" ? configRows[0].value : undefined

  if (!currentTosVersion) return { consentVersion: undefined, currentTosVersion: undefined }

  const consentRows = await db
    .select({ document: schema.userConsents.document })
    .from(schema.userConsents)
    .where(
      and(
        eq(schema.userConsents.userId, userId),
        eq(schema.userConsents.version, currentTosVersion),
      ),
    )
  const docs = new Set(consentRows.map((r) => r.document))
  // Both documents must exist — partial acceptance is not sufficient.
  const consentVersion = docs.has("tos") && docs.has("privacy") ? currentTosVersion : undefined

  return { consentVersion, currentTosVersion }
}

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
    async jwt({ token, user, trigger }) {
      if (trigger === "update") {
        // unstable_update() is reachable client-side via useSession().update() —
        // never trust the payload. Re-derive consent state from DB so a forged
        // { consentVersion } cannot bypass the PDPA audit trail.
        // This also stamps currentTosVersion so pre-PR JWTs work after accept.
        const userId = token["id"] as string | undefined
        if (userId) {
          const { consentVersion, currentTosVersion } = await deriveConsentState(userId)
          token["consentVersion"] = consentVersion
          token["currentTosVersion"] = currentTosVersion
        }
        return token
      }

      if (user?.id) {
        // At sign-in: encode id, role, and current consent state into the JWT.
        // Eventual consistency: a concurrent acceptConsent() call during this
        // sign-in will produce a stale JWT. The user will be gated to /auth/consent
        // on their next page visit, which re-calls unstable_update() and fixes the
        // staleness. This window is sub-second and matches existing role-staleness
        // behaviour.
        const dbUser = user as typeof user & { role?: UserRole }
        token["id"] = user.id
        token["role"] = dbUser.role ?? "buyer"

        const { consentVersion, currentTosVersion } = await deriveConsentState(user.id)
        token["consentVersion"] = consentVersion
        token["currentTosVersion"] = currentTosVersion
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
