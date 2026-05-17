/**
 * Stage 5 PR #31 — Checkout error taxonomy.
 *
 * Server actions return `{ ok: false, error: CheckoutErrorCode, details? }`.
 * The UI maps the code to copy via CHECKOUT_USER_COPY.
 *
 * `CheckoutError` is also throwable from inside the withAdmin Phase 1
 * transaction — the wrapper catches it and turns it into a return value.
 */

export type CheckoutErrorCode =
  | "UNAUTHENTICATED"
  | "CHECKOUT_DISABLED"
  | "EMPTY_CART"
  | "INVALID_ADDRESS"
  | "PENDING_CHECKOUT_EXISTS"
  | "INVALID_CART"
  | "OUT_OF_STOCK_RACE"
  | "VOUCHER_UNAVAILABLE"
  | "VOUCHER_RACE"
  | "TOTAL_NOT_PAYABLE"
  | "PAYMENT_INIT_FAILED"

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode
  readonly details: Record<string, unknown>
  constructor(code: CheckoutErrorCode, details: Record<string, unknown> = {}) {
    super(code)
    this.code = code
    this.details = details
    this.name = "CheckoutError"
  }
}

export const CHECKOUT_USER_COPY: Record<CheckoutErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  CHECKOUT_DISABLED: "Checkout is temporarily unavailable.",
  EMPTY_CART: "Your cart is empty.",
  INVALID_ADDRESS: "Please check the shipping address.",
  PENDING_CHECKOUT_EXISTS:
    "You have a checkout in progress. Complete or cancel it before starting again.",
  INVALID_CART: "Some items in your cart are no longer available.",
  OUT_OF_STOCK_RACE: "Stock changed while you were reviewing — please refresh.",
  VOUCHER_UNAVAILABLE: "Voucher is no longer valid.",
  VOUCHER_RACE: "Voucher is no longer valid.",
  TOTAL_NOT_PAYABLE:
    "Voucher covers the full order; please remove it or add shipping/another item.",
  PAYMENT_INIT_FAILED: "Payment provider unavailable — please try again.",
}
