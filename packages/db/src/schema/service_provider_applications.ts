// packages/db/src/schema/service_provider_applications.ts
import { sql } from "drizzle-orm"
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { inquiryStatusEnum } from "./enums.js"
import { serviceCategories } from "./service_categories.js"
import { users } from "./users.js"

export const serviceProviderApplications = pgTable(
  "service_provider_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantUserId: uuid("applicant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactNumber: text("contact_number").notNull(),
    companyName: text("company_name").notNull(),
    serviceCategoryId: uuid("service_category_id").references(() => serviceCategories.id, {
      onDelete: "restrict",
    }),
    businessDescription: text("business_description"),
    status: inquiryStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    applicantIdx: index("service_provider_applications_applicant_idx").on(t.applicantUserId),
    // At most one open (pending or approved) application per account — DB-level,
    // race-safe duplicate prevention (spec §3). A rejected row doesn't count, so
    // re-applying after rejection is allowed today (open question, deferred).
    oneOpenPerUser: uniqueIndex("service_provider_applications_one_open_per_user_idx")
      .on(t.applicantUserId)
      .where(sql`${t.status} IN ('pending','approved')`),
    // "Other" (NULL category) requires a non-empty description. Enforced here,
    // not just in the validator, because it's the only guarantee that survives
    // a direct/buggy insert (spec §3).
    categoryOrDescriptionChk: check(
      "service_provider_applications_category_or_description_chk",
      sql`${t.serviceCategoryId} IS NOT NULL OR (${t.businessDescription} IS NOT NULL AND length(trim(${t.businessDescription})) > 0)`,
    ),
  }),
)
