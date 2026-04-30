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
