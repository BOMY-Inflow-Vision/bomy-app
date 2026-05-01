import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verifies a HitPay webhook signature.
 *
 * HitPay signs webhooks by:
 * 1. Sorting all body parameters (excluding `hmac`) by key name
 * 2. Concatenating their values in that sorted order
 * 3. Computing HMAC-SHA256 of the concatenated string using the salt key
 *
 * rawBody must be the raw URL-encoded form string exactly as received.
 * hmacValue is the `hmac` field from the parsed body.
 * salt is `HITPAY_SALT` from env.
 */
export function verifyWebhookSignature(rawBody: string, hmacValue: string, salt: string): boolean {
  const params = new URLSearchParams(rawBody)
  params.delete("hmac")

  const sortedKeys = [...params.keys()].sort()
  const message = sortedKeys.map((k) => params.get(k) ?? "").join("")

  const expected = createHmac("sha256", salt).update(message).digest("hex")

  const expectedBuf = Buffer.from(expected, "utf8")
  const receivedBuf = Buffer.from(hmacValue, "utf8")

  if (expectedBuf.length !== receivedBuf.length) return false

  return timingSafeEqual(expectedBuf, receivedBuf)
}
