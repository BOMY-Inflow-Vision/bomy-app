/**
 * Spec §10.4 — seller order actions integration tests (tests 25–35).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/web test seller-actions --run
 */
import { randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"

import {
  enterTracking,
  markDelivered,
} from "../../src/app/seller/dashboard/orders/[orderId]/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

const VALID_ADDRESS = {
  name: "Tester",
  phone: "+60123456789",
  line1: "1 Jalan Test",
  city: "Kuala Lumpur",
  postcode: "50000",
  state: "Kuala Lumpur",
  country: "MY",
}

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

describe.skipIf(!shouldRun)("seller order actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerId: string
  let sellerAId: string
  let sellerBId: string
  let storeAId: string
  let storeBId: string
  const trackedOrderIds = new Set<string>()

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  async function seedOrder(
    storeId: string,
    fulfilmentStatus: "processing" | "shipped" | "delivered",
    shippedAt?: Date,
  ): Promise<string> {
    const sessionId = randomUUID()
    const orderId = randomUUID()
    await adminTx("seed order", async (tx) => {
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
        fulfilmentStatus,
        shippedAt: shippedAt ?? null,
      })
    })
    trackedOrderIds.add(orderId)
    return orderId
  }

  async function readOrder(id: string) {
    return adminTx("read order", async (tx) => {
      const [row] = await tx
        .select({
          fulfilmentStatus: schema.orders.fulfilmentStatus,
          carrier: schema.orders.carrier,
          trackingNumber: schema.orders.trackingNumber,
          shippedAt: schema.orders.shippedAt,
          deliveredAt: schema.orders.deliveredAt,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, id))
      return row ?? null
    })
  }

  async function countAuditByReason(reason: string) {
    const rows = await adminTx("count audit", async (tx) =>
      tx.select().from(schema.adminBypassAudit).where(eq(schema.adminBypassAudit.reason, reason)),
    )
    return rows.length
  }

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    process.env["DATABASE_URL"] = DATABASE_URL as string
    buyerId = randomUUID()
    sellerAId = randomUUID()
    sellerBId = randomUUID()
    storeAId = randomUUID()
    storeBId = randomUUID()

    await adminTx("setup", async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
        { id: sellerAId, email: `${sellerAId}@test.bomy`, role: "seller_owner" },
        { id: sellerBId, email: `${sellerBId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values([
        {
          id: storeAId,
          ownerId: sellerAId,
          name: "Store A",
          slug: `store-a-${storeAId.slice(0, 8)}`,
          status: "active",
        },
        {
          id: storeBId,
          ownerId: sellerBId,
          name: "Store B",
          slug: `store-b-${storeBId.slice(0, 8)}`,
          status: "active",
        },
      ])
    })
  })

  afterAll(async () => {
    await adminTx("cleanup", async (tx) => {
      if (trackedOrderIds.size > 0) {
        await tx.delete(schema.orders).where(inArray(schema.orders.id, [...trackedOrderIds]))
      }
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeAId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeBId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerAId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerBId))
    })
    await testDb.close()
  })

  // ─── enterTracking ───────────────────────────────────────────────────

  it("25 — first entry processing→shipped: shippedAt set, carrier + tracking written", async () => {
    const orderId = await seedOrder(storeAId, "processing")
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    const result = await enterTracking(orderId, "Pos Laju", "EE123456789MY")

    expect(result).toEqual({ ok: true })
    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("shipped")
    expect(row?.carrier).toBe("Pos Laju")
    expect(row?.trackingNumber).toBe("EE123456789MY")
    expect(row?.shippedAt).not.toBeNull()
  })

  it("26 — re-entry on shipped: tracking updated, shippedAt unchanged", async () => {
    const originalShippedAt = new Date(Date.now() - 3600000) // 1 hour ago
    const orderId = await seedOrder(storeAId, "shipped", originalShippedAt)
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    const result = await enterTracking(orderId, "J&T Express", "JT9876543210")

    expect(result).toEqual({ ok: true })
    const row = await readOrder(orderId)
    expect(row?.carrier).toBe("J&T Express")
    expect(row?.trackingNumber).toBe("JT9876543210")
    // shippedAt must not change — within 1 second of the original
    expect(Math.abs((row?.shippedAt?.getTime() ?? 0) - originalShippedAt.getTime())).toBeLessThan(
      1000,
    )
  })

  it("27 — status delivered → NOT_FOUND", async () => {
    const orderId = await seedOrder(storeAId, "delivered")
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    const result = await enterTracking(orderId, "DHL", "1234567890")

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  it("28 — wrong store → NOT_FOUND", async () => {
    const orderId = await seedOrder(storeAId, "processing") // belongs to storeA
    mockAuth.mockResolvedValue({ user: { id: sellerBId, role: "seller_owner" } }) // but sellerB calls

    const result = await enterTracking(orderId, "DHL", "XYZ")

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  it("29 — audit row written with reason 'seller enterTracking'", async () => {
    const orderId = await seedOrder(storeAId, "processing")
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    const before = await countAuditByReason("seller enterTracking")
    await enterTracking(orderId, "Pos Laju", "EE000000001MY")
    const after = await countAuditByReason("seller enterTracking")

    expect(after).toBeGreaterThan(before)
  })

  // ─── markDelivered ───────────────────────────────────────────────────

  it("30 — happy path shipped → delivered, deliveredAt set", async () => {
    const orderId = await seedOrder(storeAId, "shipped", new Date())
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    const result = await markDelivered(orderId)

    expect(result).toEqual({ ok: true })
    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("delivered")
    expect(row?.deliveredAt).not.toBeNull()
  })

  it("31 — wrong status (processing) → NOT_FOUND", async () => {
    const orderId = await seedOrder(storeAId, "processing")
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    expect(await markDelivered(orderId)).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  it("32 — wrong store → NOT_FOUND", async () => {
    const orderId = await seedOrder(storeAId, "shipped", new Date()) // storeA
    mockAuth.mockResolvedValue({ user: { id: sellerBId, role: "seller_owner" } }) // sellerB

    expect(await markDelivered(orderId)).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  it("33 — audit row written with reason 'seller markDelivered'", async () => {
    const orderId = await seedOrder(storeAId, "shipped", new Date())
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })

    const before = await countAuditByReason("seller markDelivered")
    await markDelivered(orderId)
    const after = await countAuditByReason("seller markDelivered")

    expect(after).toBeGreaterThan(before)
  })

  it("34 — markDelivered unauthenticated → UNAUTHENTICATED", async () => {
    mockAuth.mockResolvedValue(null)
    expect(await markDelivered(randomUUID())).toEqual({ ok: false, error: "UNAUTHENTICATED" })
  })

  it("35 — enterTracking unauthenticated → UNAUTHENTICATED", async () => {
    mockAuth.mockResolvedValue(null)
    expect(await enterTracking(randomUUID(), "DHL", "X")).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
    })
  })

  it("36 — non-seller role: enterTracking → NOT_FOUND (role guard fires before DB write)", async () => {
    const orderId = await seedOrder(storeAId, "processing")
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "buyer" } })
    const result = await enterTracking(orderId, "DHL", "X")
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
    // Verify the order was NOT updated (guard returned before any write)
    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("processing")
  })

  it("37 — non-seller role: markDelivered → NOT_FOUND (role guard fires before DB write)", async () => {
    const orderId = await seedOrder(storeAId, "shipped", new Date())
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "buyer" } })
    const result = await markDelivered(orderId)
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
    // Verify the order was NOT updated
    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("shipped")
  })

  it("38 — store-resolution read emits no admin_bypass_audit row", async () => {
    const orderId = await seedOrder(storeAId, "processing")
    mockAuth.mockResolvedValue({ user: { id: sellerAId, role: "seller_owner" } })
    const before = await countAuditByReason("seller resolveStoreId")
    await enterTracking(orderId, "Pos Laju", "EE999000001MY")
    const after = await countAuditByReason("seller resolveStoreId")
    // withTenant emits no audit row; reason "seller resolveStoreId" must never appear
    expect(after).toBe(before)
  })
})
