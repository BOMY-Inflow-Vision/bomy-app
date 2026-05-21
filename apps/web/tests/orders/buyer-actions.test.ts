/**
 * Spec §10.3 — buyer order actions integration tests (tests 18–24).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/web test buyer-actions --run
 */
import { randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"

import { confirmDelivery } from "../../src/app/account/orders/[orderId]/actions"

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

describe.skipIf(!shouldRun)("confirmDelivery", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerAId: string
  let buyerBId: string
  let sellerId: string
  let storeId: string
  const trackedOrderIds = new Set<string>()

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  async function seedOrder(
    buyerId: string,
    fulfilmentStatus: "processing" | "shipped" | "delivered",
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
        ...(fulfilmentStatus === "shipped" ? { shippedAt: new Date() } : {}),
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
          deliveredAt: schema.orders.deliveredAt,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, id))
      return row ?? null
    })
  }

  async function countAuditByReason(reason: string): Promise<number> {
    const rows = await adminTx("count audit", async (tx) =>
      tx.select().from(schema.adminBypassAudit).where(eq(schema.adminBypassAudit.reason, reason)),
    )
    return rows.length
  }

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    process.env["DATABASE_URL"] = DATABASE_URL as string
    buyerAId = randomUUID()
    buyerBId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()

    await adminTx("setup", async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
        { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Buyer Test Store",
        slug: `buyer-store-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await adminTx("cleanup", async (tx) => {
      if (trackedOrderIds.size > 0) {
        await tx.delete(schema.orders).where(inArray(schema.orders.id, [...trackedOrderIds]))
      }
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerAId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerBId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
    })
    await testDb.close()
  })

  // Test 18
  it("18 — happy path: shipped → delivered, deliveredAt set, audit row written", async () => {
    const orderId = await seedOrder(buyerAId, "shipped")
    mockAuth.mockResolvedValue({ user: { id: buyerAId, role: "buyer" } })

    const result = await confirmDelivery(orderId)

    expect(result).toEqual({ ok: true })
    const row = await readOrder(orderId)
    expect(row?.fulfilmentStatus).toBe("delivered")
    expect(row?.deliveredAt).not.toBeNull()
  })

  // Test 19
  it("19 — wrong status (processing) → NOT_FOUND", async () => {
    const orderId = await seedOrder(buyerAId, "processing")
    mockAuth.mockResolvedValue({ user: { id: buyerAId, role: "buyer" } })

    const result = await confirmDelivery(orderId)

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  // Test 20
  it("20 — wrong buyer → NOT_FOUND (cross-tenant existence not leaked)", async () => {
    const orderId = await seedOrder(buyerAId, "shipped") // order belongs to buyerA
    mockAuth.mockResolvedValue({ user: { id: buyerBId, role: "buyer" } }) // but buyerB calls it

    const result = await confirmDelivery(orderId)

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
    // Order should remain shipped (no mutation)
    expect((await readOrder(orderId))?.fulfilmentStatus).toBe("shipped")
  })

  // Test 21
  it("21 — order not found → NOT_FOUND", async () => {
    mockAuth.mockResolvedValue({ user: { id: buyerAId, role: "buyer" } })

    const result = await confirmDelivery(randomUUID())

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  // Test 22
  it("22 — unauthenticated → UNAUTHENTICATED", async () => {
    mockAuth.mockResolvedValue(null)

    const result = await confirmDelivery(randomUUID())

    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" })
  })

  // Test 23
  it("23 — already delivered: second call → NOT_FOUND (idempotency)", async () => {
    const orderId = await seedOrder(buyerAId, "shipped")
    mockAuth.mockResolvedValue({ user: { id: buyerAId, role: "buyer" } })

    await confirmDelivery(orderId)
    const result = await confirmDelivery(orderId)

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  // Test 24
  it("24 — audit row written with reason 'buyer confirmDelivery'", async () => {
    const orderId = await seedOrder(buyerAId, "shipped")
    mockAuth.mockResolvedValue({ user: { id: buyerAId, role: "buyer" } })

    const before = await countAuditByReason("buyer confirmDelivery")
    await confirmDelivery(orderId)
    const after = await countAuditByReason("buyer confirmDelivery")

    expect(after).toBeGreaterThan(before)
  })
})
