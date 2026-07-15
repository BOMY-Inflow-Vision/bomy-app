/**
 * A unique, deterministic client IP per call.
 *
 * The DB-backed webhook suites reuse one Fastify app across many requests. With
 * the rate limiter active (POST /webhooks/hitpay caps at 30/min/IP), sending
 * every request from the same default IP exhausts the bucket and later requests
 * 429 instead of exercising the money paths. Handing each request its own IP
 * keeps every request in its own bucket.
 *
 * The server runs `trustProxy: 1`, so request.ip resolves to the rightmost
 * X-Forwarded-For entry — set this as that header value.
 */
let counter = 0

export function nextTestClientIp(): string {
  counter += 1
  const n = counter
  return `10.${(n >> 16) & 0xff}.${(n >> 8) & 0xff}.${n & 0xff}`
}
