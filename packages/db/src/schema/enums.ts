import { pgEnum } from "drizzle-orm/pg-core"

import {
  CURRENCIES,
  LEDGER_DIRECTIONS,
  REVENUE_SOURCES,
  STORE_STATUSES,
  USER_ROLES,
} from "../types.js"

export const userRoleEnum = pgEnum("user_role", USER_ROLES)
export const storeStatusEnum = pgEnum("store_status", STORE_STATUSES)
export const currencyEnum = pgEnum("currency_code", CURRENCIES)
export const revenueSourceEnum = pgEnum("revenue_source", REVENUE_SOURCES)
export const ledgerDirectionEnum = pgEnum("ledger_direction", LEDGER_DIRECTIONS)
