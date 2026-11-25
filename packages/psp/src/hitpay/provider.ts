import { HitPayClient, type CreatePaymentRequestInput } from "@bomy/hitpay"

import { PspRequestError, PspUnsupportedError } from "../errors.js"
import { senToMajorString } from "../money.js"
import type {
  OneTimeCheckoutInput,
  PaymentFee,
  PaymentProvider,
  RecurringCheckoutInput,
  RefundInput,
} from "../types.js"
import { formatHitPayStartDate } from "./start-date.js"

type Env = Record<string, string | undefined>

export interface HitPayProviderOptions {
  /** Defaults to the live `process.env`, read on every call (never cached). */
  env?: Env
}

/**
 * HitPay adapter over the unchanged `@bomy/hitpay` client.
 *
 * Behaviour-neutral by construction (Stripe design PR 2): every method sends exactly the
 * request body the app built inline before this package existed.
 *
 * - A fresh `HitPayClient` is built per call from the current env, as each action's own
 *   `hitpayClient()` helper did. Missing env throws the same plain `Error` messages
 *   ("HITPAY_API_KEY is required" / "HITPAY_API_URL is required").
 * - A HitPay API error (any `HitPayError` subclass: the API answered with an error status) is
 *   re-thrown as `PspRequestError`, whose `outcome` comes from the status: 4xx (bar 408/409/425)
 *   is a definite rejection, 5xx/408/409/425 is unknown. A 2xx whose body lacks the id is an
 *   `unknown`-outcome `PspRequestError` ("invalid_response"); a 2xx with an id but no URL
 *   returns `redirectUrl: null` so the caller can still store the id. Anything else —
 *   network failure, timeout, unparseable JSON — propagates unchanged (unknown outcome).
 * - `expireCheckout` → "unsupported" (HitPay payment requests are not expired today).
 * - `getPaymentFee` throws: HitPay delivers the fee in the webhook, so it is never called.
 * - `idempotencyKey` and `expiresAt` are accepted and ignored (HitPay has neither today).
 * - `cancelRecurring` ignores `atPeriodEnd`: HitPay cancels the recurring billing outright and
 *   the entitlement is kept until `period_end` on our side, as before.
 */
export class HitPayProvider implements PaymentProvider {
  readonly id = "hitpay" as const
  readonly #env: Env

  constructor(options: HitPayProviderOptions = {}) {
    this.#env = options.env ?? process.env
  }

  isConfigured(): boolean {
    return Boolean(this.#env["HITPAY_API_KEY"] && this.#env["HITPAY_API_URL"])
  }

  async createOneTimeCheckout(
    i: OneTimeCheckoutInput,
  ): Promise<{ pspRequestId: string; redirectUrl: string | null }> {
    const body: CreatePaymentRequestInput = {
      amount: senToMajorString(i.amountSen),
      currency: i.currency,
      email: i.customerEmail,
      purpose: i.description,
      reference_number: i.bomyRefId,
      redirect_url: i.successUrl,
      ...(i.cancelUrl ? { cancel_url: i.cancelUrl } : {}),
      // A prepaid brand term must never be payable twice on one request. Orders have never set
      // it (HitPay's default applies), so it stays brand-only.
      ...(i.kind === "brand_subscription" ? { allow_repeated_payments: false } : {}),
      ...(i.webhookUrl ? { webhook: i.webhookUrl } : {}),
    }
    const res = await this.#call((c) => c.createPaymentRequest(body))
    return {
      pspRequestId: requireString(res, "id", "payment request"),
      redirectUrl: field(res, "url"),
    }
  }

  expireCheckout(_pspRequestId: string): Promise<"expired" | "already_paid" | "unsupported"> {
    return Promise.resolve("unsupported")
  }

  async createRecurringCheckout(i: RecurringCheckoutInput): Promise<{
    pspRequestId: string
    pspRecurringId: string | null
    redirectUrl: string | null
  }> {
    const billing = await this.#call((c) =>
      c.createRecurringBilling({
        amount: senToMajorString(i.amountSen),
        currency: i.currency,
        name: i.description,
        cycle: "yearly",
        customer_email: i.customerEmail,
        start_date: formatHitPayStartDate(i.startDate),
        reference: i.bomyRefId,
        redirect_url: i.successUrl,
        ...(i.webhookUrl ? { webhook: i.webhookUrl } : {}),
      }),
    )
    // HitPay has no separate checkout object: the recurring billing id is both.
    const id = requireString(billing, "id", "recurring billing")
    return {
      pspRequestId: id,
      pspRecurringId: id,
      redirectUrl: field(billing, "url"),
    }
  }

  async cancelRecurring(pspRecurringId: string, _o: { atPeriodEnd: boolean }): Promise<void> {
    await this.#call((c) => c.cancelRecurringBilling(pspRecurringId))
  }

  async refund(
    i: RefundInput,
  ): Promise<{ pspRefundId: string; status: "pending" | "succeeded" | "failed" }> {
    const refund = await this.#call((c) =>
      c.createRefund({
        payment_id: i.pspPaymentId,
        amount: senToMajorString(i.amountSen),
        reason: i.reason,
      }),
    )
    // A refund HitPay accepted but whose id we cannot read is NOT a rejection: the money may
    // have moved. requireString throws an unknown-outcome error, never a rejection.
    return { pspRefundId: requireString(refund, "id", "refund"), status: refund.status }
  }

  getPaymentFee(_pspPaymentId: string): Promise<PaymentFee> {
    return Promise.reject(
      new PspUnsupportedError("hitpay", "HitPay reports the fee in the webhook; never polled"),
    )
  }

  #client(): HitPayClient {
    const apiKey = this.#env["HITPAY_API_KEY"]
    const apiUrl = this.#env["HITPAY_API_URL"]
    if (!apiKey) throw new Error("HITPAY_API_KEY is required")
    if (!apiUrl) throw new Error("HITPAY_API_URL is required")
    return new HitPayClient({ apiKey, baseUrl: apiUrl })
  }

  async #call<T>(fn: (c: HitPayClient) => Promise<T>): Promise<T> {
    const client = this.#client()
    try {
      return await fn(client)
    } catch (err) {
      throw toPspError(err)
    }
  }
}

/**
 * A non-empty string field of a 2xx body, else null (never `undefined` / "undefined"). Used
 * as-is for a URL HitPay may leave out, so the caller keeps the id it did get.
 */
function field(res: unknown, key: string): string | null {
  const v: unknown =
    typeof res === "object" && res !== null ? (res as Record<string, unknown>)[key] : undefined
  return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * An id we cannot do without: a 2xx body missing it may still have taken effect, so this
 * throws an unknown-outcome error (never a rejection). Only thrown when there is no id at all,
 * so no usable id is ever discarded.
 */
function requireString(res: unknown, key: string, what: string): string {
  const v = field(res, key)
  if (v !== null) return v
  throw new PspRequestError({
    provider: "hitpay",
    code: "invalid_response",
    statusCode: 200,
    body: res,
    outcome: "unknown",
    message: `HitPay ${what} response has no usable "${key}"`,
  })
}

/**
 * HitPayError (and subclasses) carry `statusCode` + `body`. Matched by shape, not
 * `instanceof`, for the same cross-chunk reason as `isPspRequestError`.
 */
function toPspError(err: unknown): unknown {
  if (
    err instanceof Error &&
    err.name.startsWith("HitPay") &&
    "statusCode" in err &&
    typeof err.statusCode === "number" &&
    "body" in err
  ) {
    const code =
      err.name
        .replace(/^HitPay/, "")
        .replace(/Error$/, "")
        .toLowerCase() || "error"
    return new PspRequestError({
      provider: "hitpay",
      code,
      statusCode: err.statusCode,
      body: err.body,
      message: err.message,
      cause: err,
    })
  }
  return err
}
