import NextAuth from "next-auth"

import { authConfig } from "./auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // Run on all routes except static assets and _next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
