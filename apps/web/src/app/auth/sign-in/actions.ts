"use server"

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

  // 3. On success signIn() sends the magic link and redirects to /auth/verify-request.
  //    On AuthError it throws; NEXT_REDIRECT propagates to the Next.js router.
  await signIn("nodemailer", { email, redirectTo: "/auth/consent" })

  // Unreachable — signIn always redirects or throws; satisfies TypeScript.
  return null
}
