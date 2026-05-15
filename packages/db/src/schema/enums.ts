import { pgEnum } from "drizzle-orm/pg-core"

import {
  CHECKOUT_SESSION_STATUSES,
  CURRENCIES,
  DISPATCH_STATUSES,
  INVENTORY_RESERVATION_STATUSES,
  LEDGER_DIRECTIONS,
  PRODUCT_STATUSES,
  PSP_PROVIDERS,
  REVENUE_SOURCES,
  STORE_STATUSES,
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
  VOUCHER_TYPES,
} from "../types.js"

export const userRoleEnum = pgEnum("user_role", USER_ROLES)
export const storeStatusEnum = pgEnum("store_status", STORE_STATUSES)
export const currencyEnum = pgEnum("currency_code", CURRENCIES)
export const revenueSourceEnum = pgEnum("revenue_source", REVENUE_SOURCES)
export const ledgerDirectionEnum = pgEnum("ledger_direction", LEDGER_DIRECTIONS)
export const subscriptionStatusEnum = pgEnum("subscription_status", SUBSCRIPTION_STATUSES)
export const voucherTypeEnum = pgEnum("voucher_type", VOUCHER_TYPES)
export const dispatchStatusEnum = pgEnum("dispatch_status", DISPATCH_STATUSES)
export const productStatusEnum = pgEnum("product_status", PRODUCT_STATUSES)
export const checkoutSessionStatusEnum = pgEnum(
  "checkout_session_status",
  CHECKOUT_SESSION_STATUSES,
)
export const inventoryReservationStatusEnum = pgEnum(
  "inventory_reservation_status",
  INVENTORY_RESERVATION_STATUSES,
)
export const pspProviderEnum = pgEnum("psp_provider", PSP_PROVIDERS)
