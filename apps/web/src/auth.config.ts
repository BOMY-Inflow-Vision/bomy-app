import type { NextAuthConfig } from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

// Edge-safe config: no DB imports. Used by both middleware and the full auth.ts.
export const authConfig = {
  providers: [Google, Facebook],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected =
        nextUrl.pathname.startsWith("/account") || nextUrl.pathname.startsWith("/dashboard")
      if (isProtected && !isLoggedIn) return false
      return true
    },
  },
} satisfies NextAuthConfig
