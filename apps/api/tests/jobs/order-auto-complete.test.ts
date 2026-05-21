/**
 * Spec §10.2 — OrderAutoCompleteJob integration tests (tests 5–17).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test order-auto-complete
 */
import { randomUUID } from "node:crypto"

import { eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { runOrderAutoCompleteJob } from "../../src/jobs/order-auto-complete.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const VALID_ADDRESS = {
  name: "Tester",
  phone: "+60123456789",
  line1: "1 Jalan Test",
  city: "Kuala Lumpur",
  postcode: "50000",
  state: "Kuala Lumpur",
  country: "MY",
} as const

const ORDER_SEED = {
  shippingAddress: VALID_ADDRESS,
  shippingFeeSen: 500n,
  retailSubtotalSen: 5000n,
  brandDiscountSen: 0n,
  discountedSubtotalSen: 5000n,
  voucherContributionSen: 0n,
  pspFeeAllocatedSen: 100n,
  bomyCommissionSen: 1350n,
  bomyCommissionPct: 25,
  sellerPayoutSen: 4050n,
  paymentStatus: "paid" as const,
}

const DAY_MS = 24 * 60 * 60 * 1000
const AUTO_DELIVERED_DAYS = 30
const AUTO_COMPLETE_DAYS = 7

describe.skipIf(!shouldRun)("runOrderAutoCompleteJob", () => {
  let testDb: ReturnType<typeof makeDb>
  let lockDb: ReturnType<typeof makeDb>
  let buyerId: string
  let sellerId: string
  let storeId: string
  const trackedOrderIds = new Set<string>()
  const trackedSessionIds = new Set<string>()

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ): Promise<T> {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  async function seedOrder(overrides: {
    fulfilmentStatus: "shipped" | "delivered" | "processing"
    shippedAt?: Date
    deliveredAt?: Date
  }): Promise<string> {
    const sessionId = randomUUID()
    const orderId = randomUUID()

    await adminTx("test seed order", async (tx) => {
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: "paid",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 5000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 5500n,
        expiresAt: new Date(Date.now() + 3600000),
      })
      await tx.insert(schema.orders).values({
        id: orderId,
        checkoutSessionId: sessionId,
        storeId,
        buyerId,
        ...ORDER_SEED,
        ...overrides,
      })
    })

    trackedOrderIds.add(orderId)
    trackedSessionIds.add(sessionId)
    return orderId
  }

  async function readOrder(id: string) {
    return adminTx("test read order", async (tx) => {
      const [row] = await tx
        .select({
          fulfilmentStatus: schema.orders.fulfilmentStatus,
          deliveredAt: schema.orders.deliveredAt,
          completedAt: schema.orders.completedAt,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, id))
      return row ?? null
    })
  }

  async function setConfig(key: string, value: number) {
    await adminTx("set config", async (tx) => {
      await tx
        .update(schema.platformConfig)
        .set({ value })
        .where(eq(schema.platformConfig.key, key))
    })
  }

  async function deleteConfig(key: string) {
    await adminTx("delete config", async (tx) => {
      await tx.delete(schema.platformConfig).where(eq(schema.platformConfig.key, key))
    })
  }

  async function restoreConfigs() {
    await adminTx("restore configs", async (tx) => {
      await tx
        .insert(schema.platformConfig)
        .values([
          {
            key: "order_auto_delivered_days",
            value: AUTO_DELIVERED_DAYS,
            description: "Days after shippedAt to auto-mark delivered",
          },
          {
            key: "order_auto_complete_days",
            value: AUTO_COMPLETE_DAYS,
            description: "Days after deliveredAt to auto-complete",
          },
        ])
        .onConflictDoUpdate({
          target: schema.platformConfig.key,
          set: { value: sql`excluded.value` },
        })
    })
  }

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    lockDb = makeDb({ url: DATABASE_URL as string })
    buyerId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()

    await adminTx("test setup", async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Auto Complete Test Store",
        slug: `ac-store-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await adminTx("test cleanup", async (tx) => {
      if (trackedOrderIds.size > 0) {
        await tx.delete(schema.orders).where(inArray(schema.orders.id, [...trackedOrderIds]))
      }
      if (trackedSessionIds.size > 0) {
        await tx
          .delete(schema.checkoutSessions)
          .where(inArray(schema.checkoutSessions.id, [...trackedSessionIds]))
      }
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
    })
    await restoreConfigs()
    await lockDb.close()
    await testDb.close()
  })

  // ─── Pass 1: shipped → delivered ────────────────────────────────────

  it("5 — Pass 1 advances stale shipped orders to delivered; sets delivered_at", async () => {
    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const orderId = await seedOrder({ fulfilmentStatus: "shipped", shippedAt: staleShippedAt })

    await runOrderAutoCompleteJob(testDb.db)

    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("delivered")
    expect(row?.deliveredAt).not.toBeNull()
  })

  it("6 — Pass 1 leaves non-stale shipped orders unchanged", async () => {
    const freshShippedAt = new Date(Date.now() - 1 * DAY_MS) // only 1 day ago
    const orderId = await seedOrder({ fulfilmentStatus: "shipped", shippedAt: freshShippedAt })

    await runOrderAutoCompleteJob(testDb.db)

    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("shipped")
  })

  // ─── Pass 2: delivered → completed ──────────────────────────────────

  it("7 — Pass 2 advances stale delivered orders to completed; sets completed_at", async () => {
    const staleDeliveredAt = new Date(Date.now() - (AUTO_COMPLETE_DAYS + 1) * DAY_MS)
    const orderId = await seedOrder({
      fulfilmentStatus: "delivered",
      deliveredAt: staleDeliveredAt,
    })

    await runOrderAutoCompleteJob(testDb.db)

    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("completed")
    expect(row?.completedAt).not.toBeNull()
  })

  it("8 — Pass 2 leaves non-stale delivered orders unchanged", async () => {
    const freshDeliveredAt = new Date(Date.now() - 1 * DAY_MS)
    const orderId = await seedOrder({
      fulfilmentStatus: "delivered",
      deliveredAt: freshDeliveredAt,
    })

    await runOrderAutoCompleteJob(testDb.db)

    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("delivered")
  })

  it("9 — cooling-off: Pass 1 order (delivered_at = now) is NOT completed in same run", async () => {
    // Seed a shipped order that is stale enough for Pass 1
    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const orderId = await seedOrder({ fulfilmentStatus: "shipped", shippedAt: staleShippedAt })

    await runOrderAutoCompleteJob(testDb.db)

    // Should be delivered (Pass 1 ran) but NOT completed (Pass 2 filter: delivered_at < now - N days)
    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("delivered")
    expect(row?.completedAt).toBeNull()
  })

  // ─── SKIP LOCKED ─────────────────────────────────────────────────────

  it("10 — SKIP LOCKED Pass 1: row locked by another connection is skipped; others advance", async () => {
    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const lockedOrderId = await seedOrder({
      fulfilmentStatus: "shipped",
      shippedAt: staleShippedAt,
    })
    const otherOrderId = await seedOrder({ fulfilmentStatus: "shipped", shippedAt: staleShippedAt })

    let release!: () => void
    let lockAcquiredResolve!: () => void
    const lockHeld = new Promise<void>((r) => {
      release = r
    })
    const lockAcquired = new Promise<void>((r) => {
      lockAcquiredResolve = r
    })

    const lockerDone = withAdmin(
      lockDb.db,
      { userId: SYSTEM_ACTOR, reason: "test 10 lock holder" },
      async (tx) => {
        await tx
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, lockedOrderId))
          .for("update")
        lockAcquiredResolve()
        await lockHeld
      },
    ).catch(() => {})

    try {
      await lockAcquired

      await runOrderAutoCompleteJob(testDb.db)

      // Locked row skipped; other row advanced
      expect((await readOrder(lockedOrderId))?.fulfilmentStatus).toBe("shipped")
      expect((await readOrder(otherOrderId))?.fulfilmentStatus).toBe("delivered")
    } finally {
      release()
      await lockerDone
    }
  })

  it("11 — SKIP LOCKED Pass 2: row locked by another connection is skipped; others advance", async () => {
    const staleDeliveredAt = new Date(Date.now() - (AUTO_COMPLETE_DAYS + 1) * DAY_MS)
    const lockedOrderId = await seedOrder({
      fulfilmentStatus: "delivered",
      deliveredAt: staleDeliveredAt,
    })
    const otherOrderId = await seedOrder({
      fulfilmentStatus: "delivered",
      deliveredAt: staleDeliveredAt,
    })

    let release!: () => void
    let lockAcquiredResolve!: () => void
    const lockHeld = new Promise<void>((r) => {
      release = r
    })
    const lockAcquired = new Promise<void>((r) => {
      lockAcquiredResolve = r
    })

    const lockerDone = withAdmin(
      lockDb.db,
      { userId: SYSTEM_ACTOR, reason: "test 11 lock holder" },
      async (tx) => {
        await tx
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, lockedOrderId))
          .for("update")
        lockAcquiredResolve()
        await lockHeld
      },
    ).catch(() => {})

    try {
      await lockAcquired

      await runOrderAutoCompleteJob(testDb.db)

      expect((await readOrder(lockedOrderId))?.fulfilmentStatus).toBe("delivered")
      expect((await readOrder(otherOrderId))?.fulfilmentStatus).toBe("completed")
    } finally {
      release()
      await lockerDone
    }
  })

  // ─── Config missing/invalid ──────────────────────────────────────────

  it("12 — order_auto_delivered_days missing → Pass 1 skips; Pass 2 still runs", async () => {
    await deleteConfig("order_auto_delivered_days")

    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const staleDeliveredAt = new Date(Date.now() - (AUTO_COMPLETE_DAYS + 1) * DAY_MS)
    const shippedOrderId = await seedOrder({
      fulfilmentStatus: "shipped",
      shippedAt: staleShippedAt,
    })
    const deliveredOrderId = await seedOrder({
      fulfilmentStatus: "delivered",
      deliveredAt: staleDeliveredAt,
    })

    await runOrderAutoCompleteJob(testDb.db)

    expect((await readOrder(shippedOrderId))?.fulfilmentStatus).toBe("shipped") // Pass 1 skipped
    expect((await readOrder(deliveredOrderId))?.fulfilmentStatus).toBe("completed") // Pass 2 ran

    await restoreConfigs()
  })

  it("13 — order_auto_complete_days missing → Pass 2 skips; Pass 1 still runs", async () => {
    await deleteConfig("order_auto_complete_days")

    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const staleDeliveredAt = new Date(Date.now() - (AUTO_COMPLETE_DAYS + 1) * DAY_MS)
    const shippedOrderId = await seedOrder({
      fulfilmentStatus: "shipped",
      shippedAt: staleShippedAt,
    })
    const deliveredOrderId = await seedOrder({
      fulfilmentStatus: "delivered",
      deliveredAt: staleDeliveredAt,
    })

    await runOrderAutoCompleteJob(testDb.db)

    expect((await readOrder(shippedOrderId))?.fulfilmentStatus).toBe("delivered") // Pass 1 ran
    expect((await readOrder(deliveredOrderId))?.fulfilmentStatus).toBe("delivered") // Pass 2 skipped

    await restoreConfigs()
  })

  it("14 — config invalid (zero) for Pass 1 → warn + skip Pass 1; Pass 2 unaffected", async () => {
    await setConfig("order_auto_delivered_days", 0)

    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const shippedOrderId = await seedOrder({
      fulfilmentStatus: "shipped",
      shippedAt: staleShippedAt,
    })

    await runOrderAutoCompleteJob(testDb.db)

    expect((await readOrder(shippedOrderId))?.fulfilmentStatus).toBe("shipped")

    await restoreConfigs()
  })

  it("15 — config invalid (zero) for Pass 2 → warn + skip Pass 2; Pass 1 unaffected", async () => {
    await setConfig("order_auto_complete_days", 0)

    const staleShippedAt = new Date(Date.now() - (AUTO_DELIVERED_DAYS + 1) * DAY_MS)
    const shippedOrderId = await seedOrder({
      fulfilmentStatus: "shipped",
      shippedAt: staleShippedAt,
    })

    await runOrderAutoCompleteJob(testDb.db)

    expect((await readOrder(shippedOrderId))?.fulfilmentStatus).toBe("delivered")

    await restoreConfigs()
  })

  it("16 — sellerPayoutSen = 0 order advances correctly (job does not gate on payout)", async () => {
    const staleDeliveredAt = new Date(Date.now() - (AUTO_COMPLETE_DAYS + 1) * DAY_MS)
    const sessionId = randomUUID()
    const orderId = randomUUID()

    await adminTx("seed zero-payout order", async (tx) => {
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: "paid",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 1000n,
        totalShippingSen: 0n,
        totalBuyerPaysSen: 1000n,
        expiresAt: new Date(Date.now() + 3600000),
      })
      // Journal balance: 0 + 1000 + 0 = 1000 + 0 - 0 = 1000 ✓
      await tx.insert(schema.orders).values({
        id: orderId,
        checkoutSessionId: sessionId,
        storeId,
        buyerId,
        shippingAddress: VALID_ADDRESS,
        shippingFeeSen: 0n,
        retailSubtotalSen: 1000n,
        brandDiscountSen: 0n,
        discountedSubtotalSen: 1000n,
        voucherContributionSen: 0n,
        pspFeeAllocatedSen: 0n,
        bomyCommissionSen: 1000n,
        bomyCommissionPct: 100,
        sellerPayoutSen: 0n,
        paymentStatus: "paid",
        fulfilmentStatus: "delivered",
        deliveredAt: staleDeliveredAt,
      })
    })
    trackedOrderIds.add(orderId)
    trackedSessionIds.add(sessionId)

    await runOrderAutoCompleteJob(testDb.db)

    expect((await readOrder(orderId))?.fulfilmentStatus).toBe("completed")
  })

  it(
    "17 — batch limit: 501 stale delivered orders → only 500 advanced per run",
    { timeout: 60000 },
    async () => {
      const staleDeliveredAt = new Date(Date.now() - (AUTO_COMPLETE_DAYS + 1) * DAY_MS)
      const baseMs = staleDeliveredAt.getTime() - 501 * 1000

      const ids: string[] = []
      const sids: string[] = []
      // Insert in chunks to avoid driver limits
      const CHUNK = 50
      for (let start = 0; start < 501; start += CHUNK) {
        const end = Math.min(start + CHUNK, 501)
        const sessionValues: (typeof schema.checkoutSessions.$inferInsert)[] = []
        const orderValues: (typeof schema.orders.$inferInsert)[] = []

        for (let i = start; i < end; i++) {
          const sid = randomUUID()
          const oid = randomUUID()
          ids.push(oid)
          sids.push(sid)
          sessionValues.push({
            id: sid,
            userId: buyerId,
            status: "paid",
            shippingAddress: VALID_ADDRESS,
            totalCatalogSen: 5000n,
            totalShippingSen: 500n,
            totalBuyerPaysSen: 5500n,
            expiresAt: new Date(Date.now() + 3600000),
          })
          orderValues.push({
            id: oid,
            checkoutSessionId: sid,
            storeId,
            buyerId,
            ...ORDER_SEED,
            fulfilmentStatus: "delivered",
            deliveredAt: new Date(baseMs + i * 1000),
          })
        }
        await adminTx("seed batch", async (tx) => {
          await tx.insert(schema.checkoutSessions).values(sessionValues)
          await tx.insert(schema.orders).values(orderValues)
        })
        ids.forEach((id) => trackedOrderIds.add(id))
        sids.forEach((id) => trackedSessionIds.add(id))
      }

      await runOrderAutoCompleteJob(testDb.db)

      const rows = await adminTx("read batch", async (tx) =>
        tx
          .select({ fulfilmentStatus: schema.orders.fulfilmentStatus })
          .from(schema.orders)
          .where(inArray(schema.orders.id, ids)),
      )
      const completed = rows.filter((r) => r.fulfilmentStatus === "completed").length
      const delivered = rows.filter((r) => r.fulfilmentStatus === "delivered").length
      expect(completed).toBe(500)
      expect(delivered).toBe(1)
    },
  )
})
