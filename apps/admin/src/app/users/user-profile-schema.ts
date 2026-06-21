const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/

export type UserProfileInput = { name: string; email: string }

export type UserProfileResult =
  | { ok: true; value: { name: string | null; email: string } }
  | { ok: false; errors: { name?: string; email?: string } }

export function validateUserProfile(input: UserProfileInput): UserProfileResult {
  const errors: { name?: string; email?: string } = {}

  const email = input.email.trim().toLowerCase()
  if (email === "") errors.email = "Email is required"
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address"

  const name = input.name.trim()

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name: name === "" ? null : name, email } }
}
