import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const sellerInquiries = pgTable("seller_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  contactNumber: text("contact_number").notNull(),
  companyName: text("company_name").notNull(),
  storeName: text("store_name").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
