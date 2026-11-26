/**
 * Migration 0040 — re-run of the 0039 hitpay_* → psp_* backfill (Stripe design §4.1, PR 2).
 *
 * Seeds rows shaped like the 0039→PR 2 deploy window (hitpay_* written, psp_* empty), then runs
 * the migration's own statements, read from the .sql file, twice:
 *   - first run copies every empty psp_* column from its hitpay_* twin
 *   - a psp_* value already written is never overwritten
 *   - a non-HitPay (stripe) row never inherits a hitpay_* value
 *   - the second run updates 0 rows (idempotent)
 *
 * Everything runs inside one withAdmin transaction that is rolled back (Rollback sentinel), so the
 * suite leaves no rows behind. Gated like the other integration suites.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Database, type Db } from "../src/client.js"
import {
  brandSubscriptionPlans,
  brandSubscriptions,
  duplicateCharges,
  memberSubscriptions,
  stores,
} from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle/0040_psp_rebackfill.sql",
)

/** The UPDATE statements of 0040, without comments and the file's own BEGIN/COMMIT. */
function backfillStatements(): string[] {
  const body = readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
  return body
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(BEGIN|COMMIT)$/i.test(s))
}

class Rollback extends Error {}

describe.skipIf(!shouldRun)("migration 0040 — psp re-backfill", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  async function inRolledBackTx(fn: (tx: Database) => Promise<void>): Promise<void> {
    await expect(
      withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "test 0040 (rolled back)" },
        async (tx) => {
          await fn(tx)
          throw new Rollback()
        },
      ),
    ).rejects.toBeInstanceOf(Rollback)
  }

  /** Runs every 0040 statement; returns the total number of rows updated. */
  async function runBackfill(tx: Database): Promise<number> {
    let total = 0
    for (const stmt of backfillStatements()) {
      const res = (await tx.execute(sql.raw(stmt))) as unknown as { count?: number }
      total += res.count ?? 0
    }
    return total
  }

  it("contains exactly the three UPDATEs and no DDL", () => {
    const stmts = backfillStatements()
    expect(stmts).toHaveLength(3)
    for (const s of stmts)
      expect(s).toMatch(/^UPDATE (member_subscriptions|brand_subscriptions|duplicate_charges)\b/)
  })

  it("copies window rows, never overwrites psp_*, skips non-HitPay rows, and is idempotent", async () => {
    await inRolledBackTx(async (tx) => {
      const u = randomUUID().slice(0, 8)

      // ─── member_subscriptions ───────────────────────────────────────────
      const [windowMember] = await tx
        .insert(memberSubscriptions)
        .values({
          userId: SYSTEM_ACTOR,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: new Date(),
          hitpayRecurringId: `rb_${u}`,
          hitpayPaymentId: `pay_m_${u}`,
        })
        .returning({ id: memberSubscriptions.id })
      const [dualMember] = await tx
        .insert(memberSubscriptions)
        .values({
          userId: SYSTEM_ACTOR,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: new Date(),
          hitpayRecurringId: `rb_old_${u}`,
          pspRecurringId: `rb_keep_${u}`,
          hitpayPaymentId: `pay_old_${u}`,
        })
        .returning({ id: memberSubscriptions.id })
      const [stripeMember] = await tx
        .insert(memberSubscriptions)
        .values({
          userId: SYSTEM_ACTOR,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: new Date(),
          pspProvider: "stripe",
          hitpayPaymentId: `pay_stray_${u}`,
        })
        .returning({ id: memberSubscriptions.id })

      // ─── brand_subscriptions ────────────────────────────────────────────
      const storeId = randomUUID()
      const planId = randomUUID()
      await tx.insert(stores).values({
        id: storeId,
        ownerId: SYSTEM_ACTOR,
        name: "PSP 0040 test store",
        slug: `psp-0040-${storeId}`,
        status: "active",
      })
      await tx.insert(brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 3000n,
        discountPct: 5,
        isActive: true,
      })
      const [windowBrand] = await tx
        .insert(brandSubscriptions)
        .values({
          userId: SYSTEM_ACTOR,
          storeId,
          planId,
          status: "active",
          priceMyrSen: 3000n,
          discountPct: 5,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          bomyCommissionSen: 290n,
          brandPayoutSen: 2610n,
          hitpayPaymentRequestId: `pr_${u}`,
          hitpayPaymentId: `pay_b_${u}`,
          hitpayFeeSen: 100n,
        })
        .returning({ id: brandSubscriptions.id })

      // ─── duplicate_charges ──────────────────────────────────────────────
      const [windowDup] = await tx
        .insert(duplicateCharges)
        .values({
          subscriptionType: "member_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          amountSen: 7500n,
          currency: "MYR",
          hitpayPaymentId: `pay_d_${u}`,
          hitpayRefundId: `ref_${u}`,
        })
        .returning({ id: duplicateCharges.id })

      // ─── first run ──────────────────────────────────────────────────────
      const first = await runBackfill(tx)
      // At least our three window rows + the dual row; other local rows may also need copying.
      expect(first).toBeGreaterThanOrEqual(4)

      const [m1] = await tx
        .select()
        .from(memberSubscriptions)
        .where(eq(memberSubscriptions.id, windowMember!.id))
      expect(m1?.pspRecurringId).toBe(`rb_${u}`)
      expect(m1?.pspPaymentId).toBe(`pay_m_${u}`)

      const [m2] = await tx
        .select()
        .from(memberSubscriptions)
        .where(eq(memberSubscriptions.id, dualMember!.id))
      expect(m2?.pspRecurringId).toBe(`rb_keep_${u}`) // never overwritten
      expect(m2?.pspPaymentId).toBe(`pay_old_${u}`) // the empty column still filled

      const [m3] = await tx
        .select()
        .from(memberSubscriptions)
        .where(eq(memberSubscriptions.id, stripeMember!.id))
      expect(m3?.pspPaymentId).toBeNull() // non-HitPay row untouched

      const [b] = await tx
        .select()
        .from(brandSubscriptions)
        .where(eq(brandSubscriptions.id, windowBrand!.id))
      expect(b?.pspPaymentRequestId).toBe(`pr_${u}`)
      expect(b?.pspPaymentId).toBe(`pay_b_${u}`)
      expect(b?.pspFeeSen).toBe(100n)

      const [d] = await tx
        .select()
        .from(duplicateCharges)
        .where(eq(duplicateCharges.id, windowDup!.id))
      expect(d?.pspPaymentId).toBe(`pay_d_${u}`)
      expect(d?.pspRefundId).toBe(`ref_${u}`)

      // ─── second run: nothing left to copy ───────────────────────────────
      expect(await runBackfill(tx)).toBe(0)
    })
  })
})
