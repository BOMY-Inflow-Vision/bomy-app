import { sql } from "drizzle-orm"
import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { checkoutSessions } from "./checkout_sessions.js"
import { inventoryReservationStatusEnum } from "./enums.js"
import { productVariants } from "./product_variants.js"

// One row per (cart line × session). Created during Phase 1 of
// initiateCheckout alongside an atomic stock decrement; released by
// compensateInitiation on Phase 1b failure or buyer cancel; expired by
// runInventoryReservationExpiryJob 5 minutes past expires_at.
//
// RLS: no buyer access. Staff/admin may SELECT for ops console;
// writes are admin-bypass only.
export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    status: inventoryReservationStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusExpiresIdx: index("inventory_reservations_status_expires_idx").on(t.status, t.expiresAt),
    sessionIdx: index("inventory_reservations_session_idx").on(t.checkoutSessionId),
    variantIdx: index("inventory_reservations_variant_idx").on(t.variantId),
    qtyChk: check("inventory_reservations_qty_chk", sql`quantity > 0`),
  }),
)
