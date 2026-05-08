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
