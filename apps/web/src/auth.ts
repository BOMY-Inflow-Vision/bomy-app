import { and, eq } from "drizzle-orm"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import type { DefaultSession } from "next-auth"

import { makeAuthDb, schema, type UserRole } from "@bomy/db"
import { sendMagicLink } from "@bomy/mailer"

import { getMailer } from "@/lib/mailer"
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

// Re-derives consent state from the DB. Both "tos" and "privacy" rows for the
// current tos_version must exist before consentVersion is stamped. Called at
// sign-in and on every session update — never trusts client-supplied data.
async function deriveConsentState(
  db: ReturnType<typeof makeAuthDb>["db"],
  userId: string,
): Promise<{ consentVersion: string | undefined; currentTosVersion: string | undefined }> {
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

// Lazy initialization — NextAuth({}) and DrizzleAdapter() are only called on first request,
// never at module load time. At Next.js build time (including Vercel Preview builds) this
// module is imported but none of the exported functions are invoked, so the absence of
// DATABASE_APP_URL / DATABASE_URL causes no build-time error.
// DrizzleAdapter uses instanceof checks (not property access) to detect the DB type, so a
// Proxy wrapping {} cannot satisfy it — the entire NextAuth({}) call must be deferred.
let _nextAuth: ReturnType<typeof NextAuth> | null = null

function getNextAuth(): ReturnType<typeof NextAuth> {
  if (_nextAuth) return _nextAuth
  const { db } = makeAuthDb()

  // Build a raw email-provider object rather than using the Nodemailer() factory.
  // The factory throws AuthError("Nodemailer requires a `server` configuration") when
  // no server is supplied — even when a custom sendVerificationRequest is provided.
  // Our provider routes through @bomy/mailer so we need neither server nor the factory.
  const emailProvider =
    process.env["EMAIL_DELIVERY_ENABLED"] === "true"
      ? {
          id: "nodemailer",
          type: "email" as const,
          name: "Email",
          from: process.env["MAIL_FROM"] ?? "BOMY <contact@brandsofmalaysia.com>",
          maxAge: 24 * 60 * 60,
          sendVerificationRequest: async ({
            identifier: email,
            url,
          }: {
            identifier: string
            url: string
          }) => {
            await sendMagicLink(getMailer(), { to: email, url })
          },
        }
      : null

  _nextAuth = NextAuth({
    ...authConfig,
    // Cast required: NodemailerConfig.sendVerificationRequest's param type is technically
    // incompatible with EmailConfig under exactOptionalPropertyTypes; runtime is correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    providers: [...authConfig.providers, ...(emailProvider ? [emailProvider as any] : [])],
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
            const { consentVersion, currentTosVersion } = await deriveConsentState(db, userId)
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

          const { consentVersion, currentTosVersion } = await deriveConsentState(db, user.id)
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
  return _nextAuth
}

// Typed lazy proxies — each wrapper forwards to the lazily-initialized NextAuth instance.
// The outer cast preserves Auth.js-augmented return types for all callers.
// The inner `as any` casts are required because TypeScript disallows spreading any[]
// into functions with specific signatures; the runtime behaviour is correct.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
export const { handlers, signIn, signOut, auth, unstable_update } = {
  handlers: {
    GET: (...a: any[]) => (getNextAuth().handlers.GET as any)(...a),
    POST: (...a: any[]) => (getNextAuth().handlers.POST as any)(...a),
  },
  auth: (...a: any[]) => (getNextAuth().auth as any)(...a),
  signIn: (...a: any[]) => (getNextAuth().signIn as any)(...a),
  signOut: (...a: any[]) => (getNextAuth().signOut as any)(...a),
  unstable_update: (...a: any[]) => (getNextAuth().unstable_update as any)(...a),
} as unknown as ReturnType<typeof NextAuth>
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
