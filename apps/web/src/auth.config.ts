import type { NextAuthConfig } from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

// Edge-safe config: no DB imports. Used by both middleware and the full auth.ts.
export const authConfig = {
  providers: [Google, Facebook],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
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
