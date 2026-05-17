// ─── Payment Request (one-time charge — used for brand subscriptions) ─────────

export interface CreatePaymentRequestInput {
  amount: string
  currency: "MYR"
  email: string
  purpose: string
  redirect_url: string
  /** URL HitPay redirects the buyer to when they cancel on HitPay's page. */
  cancel_url?: string
  webhook?: string
  name?: string
  reference_number?: string
  send_email?: boolean
  allow_repeated_payments?: boolean
  expiry_date?: string
}

export interface PaymentRequestResponse {
  id: string
  url: string
  status: "active" | "completed" | "expired"
  amount: string
  currency: string
  email: string
  name: string | null
  purpose: string
  reference_number: string | null
  payment_methods: string[]
  redirect_url: string
  webhook: string | null
  created_at: string
  updated_at: string
}

// ─── Recurring Billing (annual platform membership) ───────────────────────────

export interface CreateRecurringBillingInput {
  plan: {
    amount: string
    currency: "MYR"
    name: string
    description?: string
    cycle: "monthly" | "quarterly" | "yearly"
  }
  customer: {
    email: string
    name?: string
  }
  reference?: string
  webhook?: string
  redirect_url?: string
  start_date?: string
}

export interface RecurringBillingResponse {
  id: string
  url: string
  name: string
  description: string | null
  cycle: string
  status: "scheduled" | "active" | "paused" | "cancelled"
  amount: string
  currency: string
  reference: string | null
  created_at: string
  updated_at: string
}

// ─── Charge (emitted by recurring billing webhook) ────────────────────────────

export interface Charge {
  id: string
  amount: string
  currency: string
  status: "succeeded" | "failed" | "pending"
  payment_method: string | null
  fees: string | null
  recurring_billing_id: string | null
  created_at: string
}

// ─── Refund ────────────────────────────────────────────────────────────────────

export interface CreateRefundInput {
  payment_id: string
  amount?: string
  reason?: string
}

export interface RefundResponse {
  id: string
  payment_id: string
  amount_refunded: string
  payment_method: string
  status: "succeeded" | "pending" | "failed"
  created_at: string
}

// ─── Transfer (admin-triggered brand payout) ──────────────────────────────────

export interface TransferRecipient {
  bank_account_name: string
  bank_account_number: string
  bank_code: string
  amount: string
  purpose?: string
  reference?: string
}

export interface CreateTransferInput {
  currency: "MYR"
  transfers: TransferRecipient[]
}

export interface TransferResponse {
  id: string
  currency: string
  status: "pending" | "processing" | "completed" | "failed"
  transfers: Array<TransferRecipient & { status: string }>
  created_at: string
}

// ─── Webhook payloads ─────────────────────────────────────────────────────────

export type WebhookEventType =
  | "charge.created"
  | "charge.updated"
  | "payment_request.completed"
  | "payment_request.failed"
  | "recurring_billing.subscription_updated"

export interface WebhookPayload {
  payment_id: string
  payment_request_id?: string
  recurring_billing_id?: string
  amount: string
  currency: string
  status: string
  fees?: string
  reference_number?: string
  hmac?: string
}
