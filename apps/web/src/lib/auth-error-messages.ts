// Maps Auth.js `?error=<code>` codes (see auth.config.ts `pages.error`) to
// user-facing copy shown inline and in a toast on the sign-in page.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  AccessDenied: "Sign-in was denied for this account.",
  OAuthAccountNotLinked:
    "This email is already linked to a different sign-in method. Sign in the way you did before.",
  OAuthCallbackError: "Google sign-in was cancelled or didn't complete. Please try again.",
  OAuthSignInError: "Google sign-in was cancelled or didn't complete. Please try again.",
  OAuthSignin: "Google sign-in was cancelled or didn't complete. Please try again.",
  OAuthCallback: "Google sign-in was cancelled or didn't complete. Please try again.",
  MissingCSRF: "Your sign-in session expired. Please try again.",
  Configuration: "Sign-in is temporarily unavailable. Please try again later.",
}

const FALLBACK_MESSAGE = "Sign-in failed. Please try again."

// undefined/empty → null (no error present); unrecognized code → generic fallback.
export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null
  return AUTH_ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE
}
