/**
 * Applies pending database migrations.
 * Run with: node packages/db/scripts/migrate.mjs
 *           or: pnpm --filter @bomy/db migrate
 *
 * Requires DATABASE_URL in the environment.
 * Tracks applied migrations in a _bomy_migrations table so re-runs are safe.
 *
 * Written as plain ESM (no TypeScript) so it runs without a build step —
 * all imports are from compiled npm packages already in node_modules.
 */

import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import postgres from "postgres"

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env["DATABASE_URL"]
if (!url) throw new Error("migrate: DATABASE_URL is required")

const sql = postgres(url, { max: 1 })

async function applySqlFile(filePath) {
  const content = await readFile(filePath, "utf8")
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    await sql.unsafe(stmt)
  }
}

const MIGRATIONS = [
  {
    name: "0000_initial_schema",
    file: join(__dirname, "../drizzle/0000_initial_schema.sql"),
  },
  {
    name: "0001_auth_tables",
    file: join(__dirname, "../drizzle/0001_auth_tables.sql"),
  },
  {
    name: "0002_store_and_inquiries",
    file: join(__dirname, "../drizzle/0002_store_and_inquiries.sql"),
  },
  {
    name: "0003_membership_subscriptions",
    file: join(__dirname, "../drizzle/0003_membership_subscriptions.sql"),
  },
  {
    name: "0004_brand_sub_hitpay_correlation",
    file: join(__dirname, "../drizzle/0004_brand_sub_hitpay_correlation.sql"),
  },
  {
    name: "0005_member_sub_pending_unique",
    file: join(__dirname, "../drizzle/0005_member_sub_pending_unique.sql"),
  },
  {
    name: "0006_brand_sub_active_pending_unique",
    file: join(__dirname, "../drizzle/0006_brand_sub_active_pending_unique.sql"),
  },
  {
    name: "0007_renewal_notification_days_seed",
    file: join(__dirname, "../drizzle/0007_renewal_notification_days_seed.sql"),
  },
  {
    name: "0008_admin_bypass_audit",
    file: join(__dirname, "../drizzle/0008_admin_bypass_audit.sql"),
  },
  {
    name: "0009_catalog_schema",
    file: join(__dirname, "../drizzle/0009_catalog_schema.sql"),
  },
  {
    name: "0010_storefront_rls_fix",
    file: join(__dirname, "../drizzle/0010_storefront_rls_fix.sql"),
  },
  {
    name: "0011_cart_checkout",
    file: join(__dirname, "../drizzle/0011_cart_checkout.sql"),
  },
  {
    name: "0012_order_webhook_ledger",
    file: join(__dirname, "../drizzle/0012_order_webhook_ledger.sql"),
  },
  {
    name: "0013_order_management",
    file: join(__dirname, "../drizzle/0013_order_management.sql"),
  },
  {
    name: "0014_tos_consent",
    file: join(__dirname, "../drizzle/0014_tos_consent.sql"),
  },
  {
    name: "0015_user_addresses",
    file: join(__dirname, "../drizzle/0015_user_addresses.sql"),
  },
  {
    name: "0016_duplicate_charge_reconciliation",
    file: join(__dirname, "../drizzle/0016_duplicate_charge_reconciliation.sql"),
  },
  {
    name: "0017_seller_inquiry_review",
    file: join(__dirname, "../drizzle/0017_seller_inquiry_review.sql"),
  },
  {
    name: "0018_seed_categories",
    file: join(__dirname, "../drizzle/0018_seed_categories.sql"),
  },
  {
    name: "0019_categories_seller_inactive_read",
    file: join(__dirname, "../drizzle/0019_categories_seller_inactive_read.sql"),
  },
  {
    name: "0020_cover_image_backfill",
    file: join(__dirname, "../drizzle/0020_cover_image_backfill.sql"),
  },
  {
    name: "0021_product_body_html",
    file: join(__dirname, "../drizzle/0021_product_body_html.sql"),
  },
  {
    name: "0022_variant_fulfillment_mode",
    file: join(__dirname, "../drizzle/0022_variant_fulfillment_mode.sql"),
  },
]

try {
  await sql`
    CREATE TABLE IF NOT EXISTS _bomy_migrations (
      id        serial      PRIMARY KEY,
      name      text        UNIQUE NOT NULL,
      applied_at timestamptz DEFAULT now() NOT NULL
    )
  `

  for (const { name, file } of MIGRATIONS) {
    const [row] = await sql`SELECT 1 FROM _bomy_migrations WHERE name = ${name}`
    if (row) {
      console.log(`  skip  ${name}`)
      continue
    }

    process.stdout.write(`  apply ${name} ... `)
    await applySqlFile(file)
    await sql`INSERT INTO _bomy_migrations (name) VALUES (${name})`
    console.log("done")
  }

  console.log("Migrations complete.")
} finally {
  await sql.end()
}
