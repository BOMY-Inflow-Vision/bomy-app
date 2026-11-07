import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { storeStatusEnum } from "./enums.js"
import { users } from "./users.js"

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    excerpt: text("excerpt"),
    status: storeStatusEnum("status").notNull().default("pending"),
    // Seller-set flat shipping fee per order, snapshotted into
    // checkout_session_stores.shipping_fee_sen at checkout initiation
    // and copied to orders.shipping_fee_sen at webhook fan-out (PR #32).
    // No commission on shipping. Seller-edit UI ships in PR #33.
    flatShippingFeeSen: bigint("flat_shipping_fee_sen", { mode: "bigint" }).notNull().default(0n),
    // Brand-story body content + revision tracking (migration 0028), mirroring
    // products.body_html/body_revision — see packages/db/src/schema/products.ts.
    bodyHtml: text("body_html"),
    bodyRevision: integer("body_revision").notNull().default(0),
    // YouTube video ID shown on the storefront page (migration 0028).
    videoId: text("video_id"),
    // SEO metadata (migration 0030) — all optional, seller/admin editable.
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImageUrl: text("og_image_url"),
    // The brand tile picture (migration 0038) and its focal point: percentages across / down the
    // picture used as the CSS object-position (50 / 50 = centre). NULL image = first-letter tile.
    imageUrl: text("image_url"),
    imageFocalX: smallint("image_focal_x").notNull().default(50),
    imageFocalY: smallint("image_focal_y").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("stores_slug_unique_idx").on(t.slug),
    ownerIdx: index("stores_owner_idx").on(t.ownerId),
    excerptLengthChk: check(
      "stores_excerpt_length_chk",
      sql`${t.excerpt} IS NULL OR length(${t.excerpt}) <= 160`,
    ),
    videoIdChk: check(
      "stores_video_id_chk",
      sql`${t.videoId} IS NULL OR ${t.videoId} ~ '^[A-Za-z0-9_-]{11}$'`,
    ),
    metaTitleLengthChk: check(
      "stores_meta_title_length_chk",
      sql`${t.metaTitle} IS NULL OR length(${t.metaTitle}) <= 70`,
    ),
    metaDescriptionLengthChk: check(
      "stores_meta_description_length_chk",
      sql`${t.metaDescription} IS NULL OR length(${t.metaDescription}) <= 160`,
    ),
    ogImageUrlChk: check(
      "stores_og_image_url_chk",
      sql`${t.ogImageUrl} IS NULL OR (length(${t.ogImageUrl}) <= 2048 AND ${t.ogImageUrl} ~ '^https?://')`,
    ),
    imageUrlChk: check(
      "stores_image_url_chk",
      sql`${t.imageUrl} IS NULL OR (length(${t.imageUrl}) <= 2048 AND ${t.imageUrl} ~ '^https?://')`,
    ),
    imageFocalChk: check(
      "stores_image_focal_chk",
      sql`${t.imageFocalX} BETWEEN 0 AND 100 AND ${t.imageFocalY} BETWEEN 0 AND 100`,
    ),
  }),
)
