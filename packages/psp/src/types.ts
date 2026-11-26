/**
 * Provider-neutral outbound payment seam (Stripe design §3.2).
 *
 * This package has no DB dependency. `PspProvider` mirrors `PSP_PROVIDERS` in
 * `@bomy/db` (and the PG enum `psp_provider`); the union is structural, so a
 * row's `pspProvider` value passes straight into `getProvider()`, and a new
 * value added to the DB enum fails typecheck at every call site until it is
 * added here too.
 */
export const PSP_PROVIDER_IDS = ["hitpay", "stripe"] as const
export type PspProvider = (typeof PSP_PROVIDER_IDS)[number]

/** Narrows an untrusted value (e.g. a platform_config JSON value) to a known provider id. */
export function isPspProvider(value: unknown): value is PspProvider {
  return typeof value === "string" && (PSP_PROVIDER_IDS as readonly string[]).includes(value)
}

export type PaymentKind = "order" | "brand_subscription" | "member_subscription"

export interface OneTimeCheckoutInput {
  kind: "order" | "brand_subscription"
  /** checkout_sessions.id / brand_subscriptions.id. HitPay: `reference_number`. */
  bomyRefId: string
  amountSen: bigint
  currency: "MYR"
  customerEmail: string
  /** Buyer-facing line. HitPay: `purpose`. */
  description: string
  successUrl: string
  /** Optional: today only order checkout gives HitPay a cancel URL. */
  cancelUrl?: string | undefined
  /** Optional: HitPay requests carry no expiry today; Stripe will need it (PR 4). */
  expiresAt?: Date | undefined
  /**
   * Per-request webhook URL. HitPay honours it (falls back to the dashboard webhook when
   * absent); providers with a dashboard-configured endpoint ignore it.
   */
  webhookUrl?: string | undefined
  /** Sent as the PSP's idempotency key where supported (Stripe). HitPay has none. */
  idempotencyKey: string
}

export interface RecurringCheckoutInput {
  kind: "member_subscription"
  bomyRefId: string
  amountSen: bigint
  currency: "MYR"
  interval: "year"
  customerEmail: string
  /** Plan / product name. HitPay: `name`. */
  description: string
  successUrl: string
  /** Optional: HitPay recurring billing has no cancel URL. */
  cancelUrl?: string | undefined
  startDate: Date
  webhookUrl?: string | undefined
  idempotencyKey: string
}

export interface RefundInput {
  pspPaymentId: string
  amountSen: bigint
  reason: string
  idempotencyKey: string
}

export type PaymentFee =
  | { status: "known"; feeSen: bigint; netSen: bigint; currency: "MYR" }
  | { status: "pending" }

/** Outbound calls to one PSP. Inbound webhooks are per-provider routes, not part of this seam. */
export interface PaymentProvider {
  readonly id: PspProvider
  /** Env present and safe for this deployment. Fail-closed. */
  isConfigured(): boolean

  /** One-off hosted checkout: orders + brand subscriptions. */
  createOneTimeCheckout(i: OneTimeCheckoutInput): Promise<{
    pspRequestId: string
    /**
     * null = the PSP created the object (the ids above are real and MUST be stored so the
     * webhook can correlate) but returned no usable URL. The caller shows an error and never
     * redirects. A response with no usable id throws instead (nothing to keep).
     */
    redirectUrl: string | null
  }>

  /** Close an unpaid hosted checkout. Returns "already_paid" if it completed first. */
  expireCheckout(pspRequestId: string): Promise<"expired" | "already_paid" | "unsupported">

  /** Recurring membership checkout. */
  createRecurringCheckout(i: RecurringCheckoutInput): Promise<{
    pspRequestId: string
    pspRecurringId: string | null
    /**
     * null = the PSP created the object (the ids above are real and MUST be stored so the
     * webhook can correlate) but returned no usable URL. The caller shows an error and never
     * redirects. A response with no usable id throws instead (nothing to keep).
     */
    redirectUrl: string | null
  }>

  cancelRecurring(pspRecurringId: string, o: { atPeriodEnd: boolean }): Promise<void>

  refund(i: RefundInput): Promise<{
    pspRefundId: string
    status: "pending" | "succeeded" | "failed"
  }>

  /** Fee actually charged; "pending" while the PSP has not settled it yet. */
  getPaymentFee(pspPaymentId: string): Promise<PaymentFee>
}
