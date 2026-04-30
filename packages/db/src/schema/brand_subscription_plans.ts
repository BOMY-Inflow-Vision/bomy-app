import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { stores } from "./stores.js"

// Brand-defined subscription tiers (3/6/12 months). Plans are inactive
// until admin sets is_active=true (per spec §3.2). Buyers reading the
// public landing page see only is_active=true rows; sellers see all of
// their own plans (so they can preview pre-approval).
export const brandSubscriptionPlans = pgTable(
  "brand_subscription_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    termMonths: smallint("term_months").notNull(),
    priceMyrSen: bigint("price_myr_sen", { mode: "bigint" }).notNull(),
    discountPct: smallint("discount_pct").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index("brand_subscription_plans_store_idx").on(t.storeId),
    activeIdx: index("brand_subscription_plans_active_idx").on(t.isActive),
    storeTermUnique: uniqueIndex("brand_subscription_plans_store_term_unique_idx").on(
      t.storeId,
      t.termMonths,
    ),
    termAllowed: check("brand_subscription_plans_term_chk", sql`${t.termMonths} IN (3, 6, 12)`),
    priceNonNeg: check("brand_subscription_plans_price_chk", sql`${t.priceMyrSen} >= 0`),
    discountRange: check(
      "brand_subscription_plans_discount_chk",
      sql`${t.discountPct} BETWEEN 5 AND 10`,
    ),
  }),
)
