import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { currencyEnum, ledgerDirectionEnum, revenueSourceEnum } from "./enums.js"

// Double-entry ledger, append-only. One row per leg (debit or credit).
// Legs of the same journal entry share `transaction_id`; every write
// carries an `idempotency_key` so retries are safe (Proposal v2 §8).
//
// Monetary values are bigint minor units (sen for MYR, cents for USD)
// — never floats. `amount_minor` is always a positive magnitude;
// direction is carried in the `direction` enum.
//
// Reserved nullable columns (`source`, `kyc_status`, `compliance_flags`)
// are placeholders for the Stage 10+ wallet top-up flow (ADR-07, gated
// behind BNM e-money licensing review). Keeping the columns here now
// lets us flip the top-up feature flag without a schema migration.
// Per Stage 1 kickoff decision (2026-04-20): PR #6 ships these reserved
// slots rather than wait on ADR-07.
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    direction: ledgerDirectionEnum("direction").notNull(),
    account: text("account").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    revenueSource: revenueSourceEnum("revenue_source").notNull(),
    referenceId: uuid("reference_id"),
    referenceType: text("reference_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // Reserved for future wallet top-up (ADR-07). Null at V1.
    source: text("source"),
    kycStatus: text("kyc_status"),
    complianceFlags: jsonb("compliance_flags"),
  },
  (t) => ({
    idempotencyUnique: uniqueIndex("ledger_entries_idempotency_direction_unique_idx").on(
      t.idempotencyKey,
      t.direction,
    ),
    transactionIdx: index("ledger_entries_transaction_idx").on(t.transactionId),
    referenceIdx: index("ledger_entries_reference_idx").on(t.referenceType, t.referenceId),
    createdAtIdx: index("ledger_entries_created_at_idx").on(t.createdAt),
    amountPositive: check("ledger_entries_amount_positive_chk", sql`${t.amountMinor} > 0`),
  }),
)
