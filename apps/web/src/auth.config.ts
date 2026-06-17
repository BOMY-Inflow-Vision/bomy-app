import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

// Paths a logged-in but unconsented user may still visit.
const CONSENT_ALLOWLIST = ["/auth/consent", "/auth/sign-in", "/terms", "/privacy", "/api/auth"]

// Edge-safe config: no DB imports. Used by both middleware and the full auth.ts.
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    // Propagate custom JWT fields into the session for edge middleware.
    // With strategy:"jwt", the middleware decodes the JWT but does NOT call the
    // session callback in auth.ts — so this pass-through is required.
    session({ session, token }) {
      if (token["id"]) session.user.id = token["id"] as string
      if (token["role"]) session.user.role = token["role"] as UserRole
      if (token["consentVersion"] !== undefined)
        session.user.consentVersion = token["consentVersion"] as string | undefined
      if (token["currentTosVersion"] !== undefined)
        session.user.currentTosVersion = token["currentTosVersion"] as string | undefined
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const user = auth?.user as
        | { role?: UserRole; consentVersion?: string; currentTosVersion?: string }
        | undefined

      // Consent gate: logged-in users must have a current-version consent row.
      // Gate fires before role checks so unconsented users can't reach any
      // protected route. Allowlist prevents redirect loops.
      if (isLoggedIn) {
        const needsConsent = !user?.consentVersion || user.consentVersion !== user.currentTosVersion
        const onAllowlist = CONSENT_ALLOWLIST.some((p) => nextUrl.pathname.startsWith(p))
        if (needsConsent && !onAllowlist) {
          return Response.redirect(new URL("/auth/consent", nextUrl.origin))
        }
      }

      // Routes that require any login
      const requiresLogin =
        nextUrl.pathname.startsWith("/account") ||
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/membership/manage") ||
        nextUrl.pathname.startsWith("/membership/success")
      if (requiresLogin && !isLoggedIn) return false

      // Seller dashboard requires seller_owner role
      if (nextUrl.pathname.startsWith("/seller/dashboard")) {
        if (!isLoggedIn) return false
        if (user?.role !== "seller_owner") {
          return Response.redirect(new URL("/account", nextUrl.origin))
        }
      }

      return true
    },
  },
} satisfies NextAuthConfig
