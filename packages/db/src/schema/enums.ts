import { pgEnum } from "drizzle-orm/pg-core"

import {
  CURRENCIES,
  DISPATCH_STATUSES,
  LEDGER_DIRECTIONS,
  PRODUCT_STATUSES,
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
