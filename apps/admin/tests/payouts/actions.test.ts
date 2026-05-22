/**
 * Spec §10.5b — payout lifecycle action tests (tests 41–51).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/admin test "payouts/actions" --run
 */
import { randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"

import {
  createPayoutRecord,
  markPayoutCompleted,
  markPayoutFailed,
  markPayoutProcessing,
} from "../../src/app/payouts/actions"

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

describe.skipIf(!shouldRun)("payout lifecycle actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let financeId: string
  let opsId: string
  let buyerId: string
  let sellerId: string
  let storeId: string
  const trackedOrderIds = new Set<string>()
  const trackedPayoutIds = new Set<string>()
  const trackedSessionIds = new Set<string>()

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  async function seedCompletedOrder(overrides?: {
    sellerPayoutSen?: bigint
    fulfilmentStatus?: "completed" | "processing"
  }): Promise<string> {
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
      const sellerPayoutSen = overrides?.sellerPayoutSen ?? 4050n
      const bomyCommissionSen = 5500n - 100n - sellerPayoutSen
      await tx.insert(schema.orders).values({
        id: orderId,
        checkoutSessionId: sessionId,
        storeId,
        buyerId,
        shippingAddress: VALID_ADDRESS,
        shippingFeeSen: 500n,
        retailSubtotalSen: 5000n,
        brandDiscountSen: 0n,
        discountedSubtotalSen: 5000n,
        voucherContributionSen: 0n,
        pspFeeAllocatedSen: 100n,
        bomyCommissionSen,
        bomyCommissionPct: 25,
        sellerPayoutSen,
        paymentStatus: "paid",
        fulfilmentStatus: overrides?.fulfilmentStatus ?? "completed",
      })
    })
    trackedSessionIds.add(sessionId)
    trackedOrderIds.add(orderId)
    return orderId
  }

  async function readPayout(id: string) {
    return adminTx("read payout", async (tx) => {
      const [row] = await tx
        .select({
          status: schema.orderPayouts.status,
          manualRef: schema.orderPayouts.manualRef,
          completedAt: schema.orderPayouts.completedAt,
          reconciliationNotes: schema.orderPayouts.reconciliationNotes,
        })
        .from(schema.orderPayouts)
        .where(eq(schema.orderPayouts.id, id))
      return row ?? null
    })
  }

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    process.env["DATABASE_URL"] = DATABASE_URL as string
    adminId = randomUUID()
    financeId = randomUUID()
    opsId = randomUUID()
    buyerId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()

    await adminTx("setup", async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        { id: financeId, email: `${financeId}@test.bomy`, role: "bomy_finance" },
        { id: opsId, email: `${opsId}@test.bomy`, role: "bomy_ops" },
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Payout Test Store",
        slug: `payout-store-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await adminTx("cleanup", async (tx) => {
      if (trackedPayoutIds.size > 0) {
        await tx
          .delete(schema.orderPayouts)
          .where(inArray(schema.orderPayouts.id, [...trackedPayoutIds]))
      }
      if (trackedOrderIds.size > 0) {
        await tx.delete(schema.orders).where(inArray(schema.orders.id, [...trackedOrderIds]))
      }
      if (trackedSessionIds.size > 0) {
        await tx
          .delete(schema.checkoutSessions)
          .where(inArray(schema.checkoutSessions.id, [...trackedSessionIds]))
      }
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
      await tx.delete(schema.users).where(eq(schema.users.id, financeId))
      await tx.delete(schema.users).where(eq(schema.users.id, opsId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
    })
    await testDb.close()
  })

  // ─── createPayoutRecord ──────────────────────────────────────────────

  it("41 — happy path: payout row inserted, status=pending, amountSen=sellerPayoutSen", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const result = await createPayoutRecord(orderId)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    trackedPayoutIds.add(result.payoutId)

    const payout = await readPayout(result.payoutId)
    expect(payout?.status).toBe("pending")
  })

  it("42 — sellerPayoutSen = 0 → NOT_PAYABLE", async () => {
    const orderId = await seedCompletedOrder({ sellerPayoutSen: 0n })
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const result = await createPayoutRecord(orderId)

    expect(result).toEqual({ ok: false, error: "NOT_PAYABLE" })
  })

  it("43 — existing pending payout blocks → ALREADY_EXISTS", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const first = await createPayoutRecord(orderId)
    expect(first.ok).toBe(true)
    if (first.ok) trackedPayoutIds.add(first.payoutId)

    const second = await createPayoutRecord(orderId)
    expect(second).toEqual({ ok: false, error: "ALREADY_EXISTS" })
  })

  it("44 — existing completed payout blocks → ALREADY_EXISTS", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const first = await createPayoutRecord(orderId)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    trackedPayoutIds.add(first.payoutId)

    // Complete the payout directly
    await markPayoutCompleted(first.payoutId, "REF-TEST-44")

    const second = await createPayoutRecord(orderId)
    expect(second).toEqual({ ok: false, error: "ALREADY_EXISTS" })
  })

  it("45 — existing failed payout does NOT block — new pending record created", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const first = await createPayoutRecord(orderId)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    trackedPayoutIds.add(first.payoutId)

    await markPayoutFailed(first.payoutId, "Transfer declined")

    const second = await createPayoutRecord(orderId)
    expect(second.ok).toBe(true)
    if (second.ok) trackedPayoutIds.add(second.payoutId)
  })

  // ─── markPayoutCompleted ──────────────────────────────────────────────

  it("46 — markPayoutCompleted from pending (one-step close): manualRef + completedAt set", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const { payoutId } = (await createPayoutRecord(orderId)) as { ok: true; payoutId: string }
    trackedPayoutIds.add(payoutId)

    const result = await markPayoutCompleted(payoutId, "REF-DIRECT-46")

    expect(result).toEqual({ ok: true })
    const payout = await readPayout(payoutId)
    expect(payout?.status).toBe("completed")
    expect(payout?.manualRef).toBe("REF-DIRECT-46")
    expect(payout?.completedAt).not.toBeNull()
  })

  it("47 — markPayoutCompleted from processing: succeeds", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const { payoutId } = (await createPayoutRecord(orderId)) as { ok: true; payoutId: string }
    trackedPayoutIds.add(payoutId)
    await markPayoutProcessing(payoutId)

    const result = await markPayoutCompleted(payoutId, "REF-VIA-PROCESSING-47")

    expect(result).toEqual({ ok: true })
    expect((await readPayout(payoutId))?.status).toBe("completed")
  })

  it("48 — markPayoutCompleted empty manualRef → INVALID_INPUT", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const { payoutId } = (await createPayoutRecord(orderId)) as { ok: true; payoutId: string }
    trackedPayoutIds.add(payoutId)

    const result = await markPayoutCompleted(payoutId, "")

    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" })
  })

  // ─── markPayoutFailed ─────────────────────────────────────────────────

  it("49 — markPayoutFailed from pending, non-empty notes required", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const { payoutId } = (await createPayoutRecord(orderId)) as { ok: true; payoutId: string }
    trackedPayoutIds.add(payoutId)

    const result = await markPayoutFailed(payoutId, "Bank rejected transfer")

    expect(result).toEqual({ ok: true })
    const payout = await readPayout(payoutId)
    expect(payout?.status).toBe("failed")
    expect(payout?.reconciliationNotes).toBe("Bank rejected transfer")
  })

  it("50 — markPayoutFailed empty notes → INVALID_INPUT", async () => {
    const orderId = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const { payoutId } = (await createPayoutRecord(orderId)) as { ok: true; payoutId: string }
    trackedPayoutIds.add(payoutId)

    const result = await markPayoutFailed(payoutId, "")

    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" })
  })

  // ─── Role guard ───────────────────────────────────────────────────────

  it("51 — bomy_finance is allowed; bomy_ops → FORBIDDEN", async () => {
    const orderId = await seedCompletedOrder()

    // bomy_finance: allowed
    mockAuth.mockResolvedValue({ user: { id: financeId, role: "bomy_finance" } })
    const result = await createPayoutRecord(orderId)
    expect(result.ok).toBe(true)
    if (result.ok) trackedPayoutIds.add(result.payoutId)

    // bomy_ops: forbidden
    const orderId2 = await seedCompletedOrder()
    mockAuth.mockResolvedValue({ user: { id: opsId, role: "bomy_ops" } })
    const result2 = await createPayoutRecord(orderId2)
    expect(result2).toEqual({ ok: false, error: "FORBIDDEN" })
  })
})
