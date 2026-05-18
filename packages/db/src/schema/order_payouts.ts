import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { currencyEnum, orderPayoutStatusEnum, pspProviderEnum } from "./enums.js"
import { orders } from "./orders.js"
import { users } from "./users.js"

// Admin-driven payout records. PR #32 ships the schema only — no writer
// in this PR. PR #33's /payouts page is the first writer (admin clicks
// "Create Payout Record" on a completed order; runs under withAdmin).
// HitPay Transfers API integration is Stage 6+ (KYB-gated); the
// psp_* columns stay null until then.
export const orderPayouts = pgTable("order_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  amountSen: bigint("amount_sen", { mode: "bigint" }).notNull(),
  currency: currencyEnum("currency").notNull().default("MYR"),
  pspProvider: pspProviderEnum("psp_provider"),
  pspTransferId: text("psp_transfer_id"),
  manualRef: text("manual_ref"),
  status: orderPayoutStatusEnum("status").notNull().default("pending"),
  reconciliationNotes: text("reconciliation_notes"),
  triggeredBy: uuid("triggered_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
})
