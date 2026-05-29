import "server-only"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TIMEOUT_MS = 5000

export type TurnstileVerifyResult =
  | { success: true }
  | { success: false; reason: "missing-secret" | "invalid-response" | "network-error" }

export async function verifyTurnstile(
  token: string | null,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  const secret = process.env["TURNSTILE_SECRET_KEY"]
  if (!secret) {
    console.error({ event: "turnstile_misconfigured" })
    return { success: false, reason: "missing-secret" }
  }

  if (!token) {
    return { success: false, reason: "invalid-response" }
  }

  const params = new URLSearchParams({ secret, response: token })
  if (remoteIp) params.set("remoteip", remoteIp)

  let response: Response
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error({
      event: "turnstile_network_error",
      message: err instanceof Error ? err.message : String(err),
    })
    return { success: false, reason: "network-error" }
  }

  if (response.status !== 200) {
    console.error({ event: "turnstile_network_error", status: response.status })
    return { success: false, reason: "network-error" }
  }

  let body: { success?: boolean; "error-codes"?: string[] }
  try {
    body = (await response.json()) as typeof body
  } catch {
    console.error({ event: "turnstile_network_error", message: "json-parse-failed" })
    return { success: false, reason: "network-error" }
  }

  if (body.success === true) {
    return { success: true }
  }

  console.info({ event: "turnstile_rejected", errorCodes: body["error-codes"] ?? [] })
  return { success: false, reason: "invalid-response" }
}
