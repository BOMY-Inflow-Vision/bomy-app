export type PaymentReviewReason =
  | "amount_mismatch"
  | "invalid_commission_config"
  | "voucher_claim_failed"

export type OrderPaidDescriptor = {
  type: "order_paid"
  sessionId: string
  buyerId: string
  orderIds: string[]
  voucherClaimFailed: boolean
}

export type OrderFailedDescriptor = {
  type: "order_failed"
  sessionId: string
  buyerId: string
}

export type OrderReviewDescriptor = {
  type: "order_review"
  sessionId: string
  reason: Exclude<PaymentReviewReason, "voucher_claim_failed">
}

export type VoucherClaimDescriptor = {
  type: "voucher_claim_failed"
  sessionId: string
  voucherId: string
}

export type NotificationDescriptor =
  | OrderPaidDescriptor
  | OrderFailedDescriptor
  | OrderReviewDescriptor
  | VoucherClaimDescriptor

export type OrderPaymentResult =
  | { result: "not_order"; notifications: [] }
  | { result: "handled"; notifications: NotificationDescriptor[] }
