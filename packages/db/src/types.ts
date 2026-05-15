// Canonical type unions mirrored in Postgres enums (see src/schema/enums.ts).
// Keep these in sync; Drizzle pgEnum doesn't infer TS types automatically.

export const USER_ROLES = [
  "buyer",
  "seller_staff",
  "seller_owner",
  "bomy_ops",
  "bomy_admin",
  "bomy_finance",
] as const
export type UserRole = (typeof USER_ROLES)[number]

export const BOMY_ADMIN_ROLES: readonly UserRole[] = ["bomy_ops", "bomy_admin", "bomy_finance"]

export const STORE_STATUSES = ["pending", "active", "suspended"] as const
export type StoreStatus = (typeof STORE_STATUSES)[number]

// Monetary currency codes — MYR primary, USD for international orders.
// Storage is int64 minor units (sen / cents). Never floats.
export const CURRENCIES = ["MYR", "USD"] as const
export type Currency = (typeof CURRENCIES)[number]

// `revenue_source` tags every ledger leg so reconciliation can split
// regular-order commission (25%) from brand-subscription commission
// (10%) from voucher funding from refunds etc. Values must match
// Proposal v2 §3 / §8.
export const REVENUE_SOURCES = [
  "regular_order",
  "brand_subscription",
  "platform_subscription",
  "goodie_box_cogs",
  "voucher_fund",
  "refund",
  "referral_grant",
  "processing_fee",
] as const
export type RevenueSource = (typeof REVENUE_SOURCES)[number]

export const LEDGER_DIRECTIONS = ["debit", "credit"] as const
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number]

// Stage 4 membership & subscription enums.
export const SUBSCRIPTION_STATUSES = [
  "pending",
  "active",
  "expired",
  "cancelled",
  "payment_failed",
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const VOUCHER_TYPES = ["fixed_myr", "percentage", "random_myr"] as const
export type VoucherType = (typeof VOUCHER_TYPES)[number]

export const DISPATCH_STATUSES = ["pending", "dispatched", "delivered"] as const
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

// Stage 5 catalog enums.
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

// Stage 5 PR #31 cart-checkout enums.
export const CHECKOUT_SESSION_STATUSES = [
  "pending_payment",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "payment_review_required",
  "payment_review_resolved",
] as const
export type CheckoutSessionStatus = (typeof CHECKOUT_SESSION_STATUSES)[number]

export const INVENTORY_RESERVATION_STATUSES = [
  "active",
  "released",
  "expired",
  "converted",
] as const
export type InventoryReservationStatus = (typeof INVENTORY_RESERVATION_STATUSES)[number]

// Dual-PSP seam. PR #31 only writes 'hitpay'; 'stripe' is reserved.
export const PSP_PROVIDERS = ["hitpay", "stripe"] as const
export type PspProvider = (typeof PSP_PROVIDERS)[number]
