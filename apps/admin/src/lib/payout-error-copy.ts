// Shared humanization for the typed error codes returned by payouts/actions.ts and
// payouts/reconciliation/actions.ts (checkout-sessions/[sessionId]/actions.ts keeps its own
// small inline mapping — see _resolve-form.tsx — since its copy doesn't come from this table).
// Those action files return typed codes and must not change (payment/payout logic is
// out of scope for this unit) — this module only maps a code to copy for the client to render.
//
// The same code can mean different things in different actions (e.g. INVALID_INPUT is a
// missing manual reference in one action and missing notes in another), so lookups are keyed
// by (context, code) with a generic fallback when a context has no override.

export type PayoutErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_PAYABLE"
  | "ALREADY_EXISTS"
  | "INVALID_INPUT"
  | "ALREADY_PROCESSING"
  | "REFUND_FAILED"
  | "REFUND_OUTCOME_UNKNOWN"

export type PayoutActionContext =
  | "createPayout"
  | "markProcessing"
  | "markCompleted"
  | "markFailed"
  | "refund"

export type PayoutToastKind = "error" | "warning"

export interface PayoutErrorCopy {
  message: string
  toast: PayoutToastKind
}

const GENERIC_COPY: Record<PayoutErrorCode, string> = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "Not found — it may have changed since you loaded this page.",
  NOT_PAYABLE: "Nothing payable on this order.",
  ALREADY_EXISTS: "A payout already exists for this order.",
  INVALID_INPUT: "That input isn't valid.",
  ALREADY_PROCESSING: "Already being refunded.",
  REFUND_FAILED: "HitPay rejected the refund — you can retry.",
  REFUND_OUTCOME_UNKNOWN: "Refund outcome unknown — flagged for manual verification.",
}

const CONTEXT_OVERRIDES: Partial<
  Record<PayoutActionContext, Partial<Record<PayoutErrorCode, string>>>
> = {
  createPayout: {
    FORBIDDEN: "You don't have permission to create payouts.",
    NOT_FOUND: "Order not found or not completed.",
  },
  markProcessing: {
    NOT_FOUND: "Payout not found, or it's no longer pending.",
  },
  markCompleted: {
    NOT_FOUND: "Payout not found, or it's no longer pending/processing.",
    INVALID_INPUT: "Manual reference is required.",
  },
  markFailed: {
    NOT_FOUND: "Payout not found, or it's no longer pending/processing.",
    INVALID_INPUT: "Notes are required.",
  },
  refund: {
    NOT_FOUND: "Duplicate charge not found.",
  },
}

// REFUND_OUTCOME_UNKNOWN means the row stays refund_pending for manual verification rather
// than reverting — that's a warning to check on, not a failed action.
const WARNING_CODES: ReadonlySet<PayoutErrorCode> = new Set(["REFUND_OUTCOME_UNKNOWN"])

export function humanizePayoutError(
  context: PayoutActionContext,
  code: PayoutErrorCode,
): PayoutErrorCopy {
  const message = CONTEXT_OVERRIDES[context]?.[code] ?? GENERIC_COPY[code]
  return { message, toast: WARNING_CODES.has(code) ? "warning" : "error" }
}
