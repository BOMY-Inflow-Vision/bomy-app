import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { inquiryStatusEnum } from "./enums.js"
import { stores } from "./stores.js"
import { users } from "./users.js"

export const sellerInquiries = pgTable("seller_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  contactNumber: text("contact_number").notNull(),
  companyName: text("company_name").notNull(),
  storeName: text("store_name").notNull(),
  message: text("message"),
  status: inquiryStatusEnum("status").notNull().default("pending"),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
