import { PspUnsupportedError } from "../errors.js"
import type {
  OneTimeCheckoutInput,
  PaymentFee,
  PaymentProvider,
  RecurringCheckoutInput,
  RefundInput,
} from "../types.js"

const NOT_YET = "Stripe provider is not available yet (Stripe design PR 4)"

/**
 * Stripe placeholder (Stripe design PR 3). It exists so `active_psp = "stripe"` resolves to a
 * real provider object whose `isConfigured()` is false: every payments gate then fails closed,
 * and the admin switch refuses to select it. Every outbound method rejects with
 * `PspUnsupportedError`, so nothing can create, cancel or refund a Stripe object until PR 4
 * replaces this class with the SDK-backed adapter.
 */
export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const

  isConfigured(): boolean {
    return false
  }

  createOneTimeCheckout(
    _i: OneTimeCheckoutInput,
  ): Promise<{ pspRequestId: string; redirectUrl: string | null }> {
    return Promise.reject(new PspUnsupportedError("stripe", NOT_YET))
  }

  expireCheckout(_pspRequestId: string): Promise<"expired" | "already_paid" | "unsupported"> {
    return Promise.reject(new PspUnsupportedError("stripe", NOT_YET))
  }

  createRecurringCheckout(_i: RecurringCheckoutInput): Promise<{
    pspRequestId: string
    pspRecurringId: string | null
    redirectUrl: string | null
  }> {
    return Promise.reject(new PspUnsupportedError("stripe", NOT_YET))
  }

  cancelRecurring(_pspRecurringId: string, _o: { atPeriodEnd: boolean }): Promise<void> {
    return Promise.reject(new PspUnsupportedError("stripe", NOT_YET))
  }

  refund(_i: RefundInput): Promise<{
    pspRefundId: string
    status: "pending" | "succeeded" | "failed"
  }> {
    return Promise.reject(new PspUnsupportedError("stripe", NOT_YET))
  }

  getPaymentFee(_pspPaymentId: string): Promise<PaymentFee> {
    return Promise.reject(new PspUnsupportedError("stripe", NOT_YET))
  }
}
