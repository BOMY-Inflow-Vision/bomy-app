import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

const BOMY_ROLES: UserRole[] = ["bomy_ops", "bomy_admin", "bomy_finance"]

export const authConfig = {
  providers: [Google],
  pages: { signIn: "/auth/sign-in" },
  callbacks: {
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
