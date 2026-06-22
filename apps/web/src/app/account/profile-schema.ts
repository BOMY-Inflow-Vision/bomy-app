const MAX_NAME = 80

export type DisplayNameResult = { ok: true; value: string | null } | { ok: false; error: string }

export function validateDisplayName(raw: string): DisplayNameResult {
  const name = raw.trim()
  if (name.length > MAX_NAME) {
    return { ok: false, error: `Name must be ${MAX_NAME} characters or fewer` }
  }
  return { ok: true, value: name === "" ? null : name }
}
