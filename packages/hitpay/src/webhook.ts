import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verifies a HitPay webhook signature.
 *
 * HitPay signs JSON webhooks by computing HMAC-SHA256 of the raw request
 * body using the salt key, then sending the hex digest in the
 * `Hitpay-Signature` header. rawBody must be the exact bytes received
 * (not re-serialised). signature is the `Hitpay-Signature` header value.
 * salt is `HITPAY_SALT` from env.
 */
export function verifyWebhookSignature(rawBody: string, signature: string, salt: string): boolean {
  const expected = createHmac("sha256", salt).update(rawBody).digest("hex")

  const expectedBuf = Buffer.from(expected, "utf8")
  const receivedBuf = Buffer.from(signature, "utf8")

  if (expectedBuf.length !== receivedBuf.length) return false

  return timingSafeEqual(expectedBuf, receivedBuf)
}
