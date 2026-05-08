import { randomBytes } from "node:crypto"

import { eq, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

// Unambiguous uppercase alphanumeric charset (no 0/O, 1/I/L).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Generate a unique 8-character voucher code. */
export function generateCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes)
    .map((b) => CODE_CHARS[b % CODE_CHARS.length]!)
    .join("")
}

interface VoucherConfig {
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedSen?: bigint
  percentage?: number
  randomMinSen?: bigint
  randomMaxSen?: bigint
}

async function readVoucherConfig(db: Database): Promise<VoucherConfig | null> {
  const rows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read voucher monthly config" },
    async (tx) =>
      tx
        .select({ key: schema.platformConfig.key, value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(sql`${schema.platformConfig.key} LIKE 'voucher_monthly_%'`),
  )

  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const type = cfg["voucher_monthly_type"] as string | undefined

  if (type === "fixed_myr") {
    const fixedSen = cfg["voucher_monthly_fixed_sen"]
    if (typeof fixedSen !== "number") return null
    return { type: "fixed_myr", fixedSen: BigInt(fixedSen) }
  }
  if (type === "percentage") {
    const pct = cfg["voucher_monthly_pct"]
    if (typeof pct !== "number") return null
    return { type: "percentage", percentage: pct }
  }
  if (type === "random_myr") {
    const minSen = cfg["voucher_monthly_random_min_sen"]
    const maxSen = cfg["voucher_monthly_random_max_sen"]
    if (typeof minSen !== "number" || typeof maxSen !== "number") return null
    return { type: "random_myr", randomMinSen: BigInt(minSen), randomMaxSen: BigInt(maxSen) }
  }
  return null
}

function getMYTYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date())
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  }
}

function currentIssuedMonth(): string {
  const { year, month } = getMYTYearMonth()
  return `${year}-${String(month).padStart(2, "0")}`
}

function endOfCurrentMonth(): Date {
  const { year, month } = getMYTYearMonth()
  // First moment of next month 00:00 MYT, converted to UTC (MYT = UTC+8).
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const firstOfNextMonthUTC = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000
  // Last ms of current MYT month = first of next month MYT − 1 ms.
  return new Date(firstOfNextMonthUTC - 1)
}

type VoucherInsert = typeof schema.vouchers.$inferInsert

function buildVoucherRow(
  userId: string,
  config: VoucherConfig,
  issuedMonth: string,
  expiresAt: Date,
): VoucherInsert {
  const base = { userId, code: generateCode(), issuedMonth, expiresAt }

  if (config.type === "fixed_myr") {
    return { ...base, type: "fixed_myr", fixedAmountSen: config.fixedSen! }
  }
  if (config.type === "percentage") {
    return { ...base, type: "percentage", percentage: config.percentage! }
  }
  // random_myr — resolve amount at issuance time
  const range = Number(config.randomMaxSen! - config.randomMinSen!)
  const randomSen = config.randomMinSen! + BigInt(Math.floor(Math.random() * range))
  return { ...base, type: "random_myr", randomResolvedSen: randomSen }
}

/**
 * Issue monthly vouchers to all active #1 platform members.
 * Idempotent: skips members who already have a voucher for the current month
 * (enforced by the unique index on (user_id, issued_month)).
 *
 * Returns the number of vouchers inserted.
 */
export async function issueMonthlyVouchers(db: Database): Promise<number> {
  const config = await readVoucherConfig(db)
  if (!config) {
    console.log("[voucher-issuance] No config found — skipping")
    return 0
  }

  const issuedMonth = currentIssuedMonth()
  const expiresAt = endOfCurrentMonth()

  const activeMembers = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read active member subscriptions for voucher issuance" },
    async (tx) =>
      tx
        .select({ userId: schema.memberSubscriptions.userId })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.status, "active")),
  )

  if (activeMembers.length === 0) return 0

  const rows: VoucherInsert[] = activeMembers.map((m) =>
    buildVoucherRow(m.userId, config, issuedMonth, expiresAt),
  )

  const inserted = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "bulk insert monthly vouchers" },
    async (tx) => {
      const result = await tx
        .insert(schema.vouchers)
        .values(rows)
        .onConflictDoNothing({ target: [schema.vouchers.userId, schema.vouchers.issuedMonth] })
        .returning({ id: schema.vouchers.id })
      return result.length
    },
  )

  console.log(
    `[voucher-issuance] Issued ${inserted}/${activeMembers.length} vouchers for ${issuedMonth}`,
  )
  return inserted
}
