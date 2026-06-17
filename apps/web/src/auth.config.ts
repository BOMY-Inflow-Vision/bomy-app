import type { NextAuthConfig } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

// Edge-safe config: no DB imports. Used by both middleware and the full auth.ts.
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    // Propagate custom JWT fields (id, role) into the session for edge middleware.
    // With strategy:"jwt", the middleware decodes the JWT but does NOT call the
    // session callback defined in auth.ts — so we need this pass-through here.
    session({ session, token }) {
      const t = token as JWT & { id?: string; role?: UserRole }
      if (t.id) session.user.id = t.id
      if (t.role) session.user.role = t.role
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const role = (auth?.user as { role?: UserRole } | undefined)?.role

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
        if (role !== "seller_owner") {
          return Response.redirect(new URL("/account", nextUrl.origin))
        }
      }

      return true
    },
  },
} satisfies NextAuthConfig
