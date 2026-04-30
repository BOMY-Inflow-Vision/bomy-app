import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { voucherTypeEnum } from "./enums.js"
import { users } from "./users.js"

// Monthly voucher issued to active #1 members. The amount is resolved
// at issuance time — not at redemption — so a `random_myr` voucher is
// stamped with `random_resolved_sen` the moment the row is inserted.
// Buyer always sees the actual amount from day one (locked decision §2).
//
// `redeemed_order_id` is a soft FK — orders table lands in Stage 5 — so
// it is intentionally NOT a foreign key here. We'll add the FK in a
// later migration once the orders table exists.
export const vouchers = pgTable(
  "vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    type: voucherTypeEnum("type").notNull(),
    fixedAmountSen: bigint("fixed_amount_sen", { mode: "bigint" }),
    percentage: smallint("percentage"),
    randomResolvedSen: bigint("random_resolved_sen", { mode: "bigint" }),
    issuedMonth: text("issued_month").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedOrderId: uuid("redeemed_order_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex("vouchers_code_unique_idx").on(t.code),
    userMonthUnique: uniqueIndex("vouchers_user_month_unique_idx").on(t.userId, t.issuedMonth),
    expiresIdx: index("vouchers_expires_at_idx").on(t.expiresAt),
    issuedMonthFmt: check(
      "vouchers_issued_month_fmt_chk",
      sql`${t.issuedMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    typeAmountChk: check(
      "vouchers_type_amount_chk",
      sql`(
        (${t.type} = 'fixed_myr'   AND ${t.fixedAmountSen}    IS NOT NULL AND ${t.percentage} IS NULL AND ${t.randomResolvedSen} IS NULL)
        OR (${t.type} = 'percentage' AND ${t.percentage}      IS NOT NULL AND ${t.fixedAmountSen} IS NULL AND ${t.randomResolvedSen} IS NULL)
        OR (${t.type} = 'random_myr' AND ${t.randomResolvedSen} IS NOT NULL AND ${t.fixedAmountSen} IS NULL AND ${t.percentage} IS NULL)
      )`,
    ),
    percentageRange: check(
      "vouchers_percentage_range_chk",
      sql`${t.percentage} IS NULL OR ${t.percentage} BETWEEN 1 AND 100`,
    ),
  }),
)
