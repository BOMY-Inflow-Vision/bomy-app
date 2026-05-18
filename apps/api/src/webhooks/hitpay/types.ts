import type { FastifyInstance } from "fastify"

import type { Schema } from "@bomy/db"

import type { EventIdentity } from "./idempotency.js"

// Full Drizzle-inferred row type for checkout_sessions. `@bomy/db` re-exports
// `schema` as a namespace (`export * as schema from "./schema/index.js"`);
// individual table symbols are not re-exported from the package root. Use
// `Schema["checkoutSessions"]["$inferSelect"]` — a pure type reference with no
// runtime import — to get the row type without a missing-symbol error.
export type CheckoutSessionRow = Schema["checkoutSessions"]["$inferSelect"]

// Inputs to the order-payment dispatcher branch (spec §3.4). Parsed once from
// the HitPay webhook payload + headers by the route plugin (Task 11) and
// forwarded to handleOrderPayment / runFailureRelease / parkPaymentReview.
export interface OrderPaymentArgs {
  app: FastifyInstance
  /** HitPay payment_request_id; matches checkout_sessions.psp_payment_request_id. */
  paymentRequestId: string
  /** HitPay payment_id; may be empty on failed events (Bob B9 conditional set). */
  paymentId: string
  /** Raw HitPay status string: "completed" | "succeeded" | "failed" | other. */
  status: string
  /** "N.NN" amount from the payload. */
  amountStr: string
  /** "N.NN" fees from the payload. */
  feesStr: string
  /** Derived in the route plugin via deriveEventIdentity (Task 7). */
  eventIdentity: EventIdentity
}
