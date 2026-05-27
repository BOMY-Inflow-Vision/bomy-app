/**
 * Integration tests — VoucherIssuanceJob logic
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/api test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { generateCode, issueMonthlyVouchers } from "../../src/jobs/voucher-issuance.js"
import type { Mailer } from "../../src/lib/mailer.js"
import type { JobLogger } from "../../src/notifications/voucher.js"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

/** Pre-seeded system actor (migration 0008). Always exists in users table. */
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

function noopMailer(): Mailer {
  return { sendMail: async () => {}, close: async () => {} }
}
function noopLog(): JobLogger {
  return { info: () => {}, warn: () => {}, error: () => {} }
}

describe("generateCode", () => {
  it("returns an 8-character uppercase alphanumeric string", () => {
    const code = generateCode()
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
  })

  it("generates distinct codes across multiple calls", () => {
    const codes = new Set(Array.from({ length: 100 }, generateCode))
    expect(codes.size).toBeGreaterThan(95) // negligible collision probability
  })
})

describe.skipIf(!shouldRun)("issueMonthlyVouchers", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    // Use SYSTEM_ACTOR to seed adminId — the new UUID doesn't exist in users yet
    // so cannot be the audit actor itself.
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed admin" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      // Restore platform_config voucher keys to migration 0003 defaults so other
      // packages' tests (e.g. @bomy/db memberships.test.ts) see a clean baseline.
      for (const { key, value } of [
        { key: "voucher_monthly_type", value: "fixed_myr" },
        { key: "voucher_monthly_fixed_sen", value: 500 },
        { key: "voucher_monthly_pct", value: 10 },
        { key: "voucher_monthly_random_min_sen", value: 200 },
        { key: "voucher_monthly_random_max_sen", value: 1000 },
      ] as const) {
        await tx
          .update(schema.platformConfig)
          .set({ value, updatedAt: new Date() })
          .where(eq(schema.platformConfig.key, key))
      }
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
    })
    await testDb.close()
  })

  async function seedConfig(type: "fixed_myr" | "percentage" | "random_myr") {
    const entries =
      type === "fixed_myr"
        ? [
            { key: "voucher_monthly_type", value: "fixed_myr", description: "type" },
            { key: "voucher_monthly_fixed_sen", value: 1000, description: "fixed sen" },
          ]
        : type === "percentage"
          ? [
              { key: "voucher_monthly_type", value: "percentage", description: "type" },
              { key: "voucher_monthly_pct", value: 10, description: "pct" },
            ]
          : [
              { key: "voucher_monthly_type", value: "random_myr", description: "type" },
              { key: "voucher_monthly_random_min_sen", value: 500, description: "min" },
              { key: "voucher_monthly_random_max_sen", value: 2000, description: "max" },
            ]

    await withAdmin(testDb.db, { userId: adminId, reason: "test seed config" }, async (tx) => {
      for (const e of entries) {
        await tx
          .insert(schema.platformConfig)
          .values({ key: e.key, value: e.value, description: e.description })
          .onConflictDoUpdate({
            target: schema.platformConfig.key,
            set: { value: e.value, updatedAt: new Date() },
          })
      }
    })
  }

  async function seedActiveMember(): Promise<{ userId: string; subId: string }> {
    const userId = randomUUID()
    const subId = randomUUID()
    const now = new Date()

    await withAdmin(testDb.db, { userId: adminId, reason: "test seed member" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
      await tx.insert(schema.memberSubscriptions).values({
        id: subId,
        userId,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 365 * 86400 * 1000),
      })
    })
    return { userId, subId }
  }

  async function cleanupMember(userId: string, subId: string, issuedMonth: string) {
    await withAdmin(testDb.db, { userId: adminId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, userId))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
    })
    void issuedMonth // used in description only
  }

  it("issues a fixed_myr voucher for each active member", async () => {
    await seedConfig("fixed_myr")
    const { userId, subId } = await seedActiveMember()
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const now = new Date()
    const issuedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    const count = await issueMonthlyVouchers(testDb.db, noopMailer(), noopLog())
    expect(count).toBeGreaterThanOrEqual(1)

    const vouchers = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, userId)),
    )
    expect(vouchers).toHaveLength(1)
    const v = vouchers[0]!
    expect(v.type).toBe("fixed_myr")
    expect(v.fixedAmountSen).toBe(1000n)
    expect(v.issuedMonth).toBe(issuedMonth)
    expect(v.code).toMatch(/^[A-Z0-9]{8}$/)
    // expires_at should be last millisecond of the current month
    expect(v.expiresAt.getFullYear()).toBe(now.getFullYear())
    expect(v.expiresAt.getMonth()).toBe(now.getMonth())

    vi.restoreAllMocks()
    await cleanupMember(userId, subId, issuedMonth)
  })

  it("skips members who already have a voucher for the current month (idempotent)", async () => {
    await seedConfig("fixed_myr")
    const { userId, subId } = await seedActiveMember()
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const now = new Date()
    const issuedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    await issueMonthlyVouchers(testDb.db, noopMailer(), noopLog())
    const countAfterFirst = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, userId)),
    )
    expect(countAfterFirst).toHaveLength(1)

    // Second run — must not insert a duplicate
    await issueMonthlyVouchers(testDb.db, noopMailer(), noopLog())
    const countAfterSecond = await withAdmin(
      testDb.db,
      { userId: adminId, reason: "test assert" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, userId)),
    )
    expect(countAfterSecond).toHaveLength(1)

    vi.restoreAllMocks()
    await cleanupMember(userId, subId, issuedMonth)
  })

  it("issues a percentage voucher when config type is percentage", async () => {
    await seedConfig("percentage")
    const { userId, subId } = await seedActiveMember()
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const now = new Date()
    const issuedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    await issueMonthlyVouchers(testDb.db, noopMailer(), noopLog())

    const [v] = await withAdmin(testDb.db, { userId: adminId, reason: "test assert" }, async (tx) =>
      tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, userId)),
    )
    expect(v?.type).toBe("percentage")
    expect(v?.percentage).toBe(10)

    vi.restoreAllMocks()
    await cleanupMember(userId, subId, issuedMonth)
  })

  it("issues a random_myr voucher with resolved amount within configured range", async () => {
    await seedConfig("random_myr")
    const { userId, subId } = await seedActiveMember()
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const now = new Date()
    const issuedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    await issueMonthlyVouchers(testDb.db, noopMailer(), noopLog())

    const [v] = await withAdmin(testDb.db, { userId: adminId, reason: "test assert" }, async (tx) =>
      tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, userId)),
    )
    expect(v?.type).toBe("random_myr")
    expect(v?.randomResolvedSen).toBeGreaterThanOrEqual(500n)
    expect(v?.randomResolvedSen).toBeLessThan(2000n)

    vi.restoreAllMocks()
    await cleanupMember(userId, subId, issuedMonth)
  })

  it("calls dispatchVoucherEmails with the inserted rows and hydrated emails", async () => {
    // Seed: 2 active members; run job with a mock mailer; assert sendMail invoked twice
    // with addresses matching the seeded users.

    const u1 = randomUUID()
    const u2 = randomUUID()
    const email1 = `${u1}@test.bomy`
    const email2 = `${u2}@test.bomy`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test seed members" },
      async (tx) => {
        await tx.insert(schema.users).values([
          { id: u1, email: email1, role: "buyer" },
          { id: u2, email: email2, role: "buyer" },
        ])
        await tx.insert(schema.memberSubscriptions).values([
          {
            userId: u1,
            status: "active",
            priceMyrSen: 7500n,
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
          {
            userId: u2,
            status: "active",
            priceMyrSen: 7500n,
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
        ])
      },
    )

    await seedConfig("fixed_myr")

    const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
    const mailer: Mailer = { sendMail, close: vi.fn<Mailer["close"]>() }

    const count = await issueMonthlyVouchers(testDb.db, mailer, noopLog())

    expect(count).toBeGreaterThanOrEqual(2)
    expect(sendMail).toHaveBeenCalledTimes(count)
    const recipients = sendMail.mock.calls.map((c) => c[0].to as string)
    expect(recipients).toContain(email1)
    expect(recipients).toContain(email2)

    // Cleanup
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, u1))
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, u2))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.userId, u1))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.userId, u2))
      await tx.delete(schema.users).where(eq(schema.users.id, u1))
      await tx.delete(schema.users).where(eq(schema.users.id, u2))
    })
  })

  it("returns inserted count even if a send throws (insert tx already committed)", async () => {
    const u3 = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed member" }, async (tx) => {
      await tx.insert(schema.users).values({ id: u3, email: `${u3}@test.bomy`, role: "buyer" })
      await tx.insert(schema.memberSubscriptions).values({
        userId: u3,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      })
    })

    await seedConfig("fixed_myr")

    const sendMail = vi.fn<Mailer["sendMail"]>().mockRejectedValue(new Error("SMTP down"))
    const mailer: Mailer = { sendMail, close: vi.fn<Mailer["close"]>() }

    const count = await issueMonthlyVouchers(testDb.db, mailer, noopLog())

    expect(count).toBeGreaterThanOrEqual(1)
    // Voucher row should exist for u3 (insert committed)
    const rows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "verify" },
      async (tx) => tx.select().from(schema.vouchers).where(eq(schema.vouchers.userId, u3)),
    )
    expect(rows).toHaveLength(1)

    // Cleanup
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.vouchers).where(eq(schema.vouchers.userId, u3))
      await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.userId, u3))
      await tx.delete(schema.users).where(eq(schema.users.id, u3))
    })
  })
})
