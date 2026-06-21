import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

const BOMY_ROLES: UserRole[] = ["bomy_ops", "bomy_admin", "bomy_finance"]

export const authConfig = {
  providers: [Google],
  pages: { signIn: "/auth/sign-in" },
  callbacks: {
    // Propagate custom JWT claims into the session for the edge middleware.
    // With strategy:"jwt", the middleware decodes the JWT but does NOT run the
    // session callback in auth.ts — so this pass-through is required for the
    // authorized() role check below to see the user's role.
    session({ session, token }) {
      if (token["id"]) session.user.id = token["id"] as string
      if (token["role"]) session.user.role = token["role"] as UserRole
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      if (!auth?.user) return false
      const role = (auth.user as typeof auth.user & { role?: UserRole }).role
      if (!role || !BOMY_ROLES.includes(role)) {
        return Response.redirect(new URL("/unauthorized", nextUrl.origin))
      }
      return true
    },
  },
} satisfies NextAuthConfig
