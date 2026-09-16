// Maps Auth.js error codes (the `?error=<Code>` query param on the sign-in
// page) to short, specific, user-facing copy. Unknown codes fall back to a
// generic message rather than surfacing the raw code to the user.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Sign-in was denied. Use your BOMY Google account.",
  OAuthAccountNotLinked: "This email is already linked to a different sign-in method.",
  OAuthCallbackError: "Google sign-in didn't complete. Please try again.",
  OAuthSignin: "Google sign-in didn't complete. Please try again.",
  OAuthCallback: "Google sign-in didn't complete. Please try again.",
  Configuration: "Sign-in is misconfigured on our side. Contact the tech team.",
  MissingCSRF: "Your sign-in session expired. Please try again.",
}

const FALLBACK_MESSAGE = "Sign-in failed. Please try again."

export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null
  return AUTH_ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE
}
