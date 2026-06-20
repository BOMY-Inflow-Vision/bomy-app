"use server"

import { and, eq, gt, lt } from "drizzle-orm"

import { schema } from "@bomy/db"

import { getAuthDb } from "@/auth"
import { signIn } from "@/auth"
import { verifyTurnstile } from "@/lib/turnstile"

// Same regex as seller-apply to keep validation consistent across public endpoints.
const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/

export type MagicLinkState = { error: string } | null

export async function sendMagicLinkAction(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  // 1. Turnstile FIRST — before email validation or any side effect.
  const rawToken = formData.get("cf-turnstile-response")
  const token = typeof rawToken === "string" && rawToken.length > 0 ? rawToken : null
  const verify = await verifyTurnstile(token)
  if (!verify.success) {
    return { error: "Verification failed. Please try the challenge again." }
  }

  // 2. Server-side single-address email validation.
  const raw = formData.get("email")
  const email = typeof raw === "string" ? raw.trim() : ""
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." }
  }

  // 3. Per-email cooldown. NextAuth only deletes a verification token when its
  //    link is clicked, so abandoned requests leave expired rows that nothing
  //    else cleans up. First drop any expired tokens for this address (prevents
  //    a permanent lockout and unbounded table growth), then block only if a
  //    still-live token remains.
  const db = getAuthDb()
  await db
    .delete(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.identifier, email),
        lt(schema.verificationTokens.expires, new Date()),
      ),
    )

  const existing = await db
    .select({ identifier: schema.verificationTokens.identifier })
    .from(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.identifier, email),
        gt(schema.verificationTokens.expires, new Date()),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    return {
      error:
        "A sign-in link was already sent — check your inbox or wait a few minutes before requesting another.",
    }
  }

  // 4. On success signIn() sends the magic link and redirects to /auth/verify-request.
  //    On AuthError it throws; NEXT_REDIRECT propagates to the Next.js router.
  await signIn("nodemailer", { email, redirectTo: "/auth/consent" })

  // Unreachable — signIn always redirects or throws; satisfies TypeScript.
  return null
}
