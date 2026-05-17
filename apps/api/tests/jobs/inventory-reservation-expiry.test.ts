/**
 * Integration tests — InventoryReservationExpiryJob (spec §6.5 tests 43–52).
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test inventory-reservation-expiry
 */
import { randomUUID } from "node:crypto"

import {
  makeDb,
  schema,
  withAdmin,
  type CheckoutSessionStatus,
  type InventoryReservationStatus,
} from "@bomy/db"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { runInventoryReservationExpiryJob } from "../../src/jobs/inventory-reservation-expiry.js"

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

const fakeLog = { info: (_obj: object, _msg: string) => {} }

const MIN = 60_000
const PAST_GRACE = 10 * MIN // > 5-min grace
const WITHIN_GRACE = 1 * MIN // < 5-min grace

const PAST_GRACE_RES_AT = () => new Date(Date.now() - PAST_GRACE)
const WITHIN_GRACE_RES_AT = () => new Date(Date.now() - WITHIN_GRACE)

describe.skipIf(!shouldRun)("runInventoryReservationExpiryJob", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let storeId: string
  let productId: string
  const trackedUserIds = new Set<string>()
  const trackedVariantIds = new Set<string>()

  // ── Helpers ──────────────────────────────────────────────────────────

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ): Promise<T> {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  async function createBuyer(): Promise<string> {
    const id = randomUUID()
    await adminTx("test seed buyer", async (tx) => {
      await tx.insert(schema.users).values({ id, email: `${id}@test.bomy`, role: "buyer" })
    })
    trackedUserIds.add(id)
    return id
  }

  async function createVariant(stockCount: number): Promise<string> {
    const id = randomUUID()
    await adminTx("test seed variant", async (tx) => {
      await tx.insert(schema.productVariants).values({
        id,
        productId,
        name: `var-${id.slice(0, 8)}`,
        priceMyrSen: 1000n,
        stockCount,
        isActive: true,
      })
    })
    trackedVariantIds.add(id)
    return id
  }

  interface CreateSessionInput {
    userId: string
    status?: CheckoutSessionStatus
    pspPaymentRequestId?: string | null
    sessionExpiresAt?: Date
    voucherId?: string | null
    paymentReviewReason?: string | null
  }
  async function createSession(input: CreateSessionInput): Promise<string> {
    const id = randomUUID()
    await adminTx("test seed session", async (tx) => {
      await tx.insert(schema.checkoutSessions).values({
        id,
        userId: input.userId,
        status: input.status ?? "pending_payment",
        pspPaymentRequestId: input.pspPaymentRequestId ?? null,
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 1000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 1500n,
        expiresAt: input.sessionExpiresAt ?? new Date(Date.now() - PAST_GRACE),
        voucherId: input.voucherId ?? null,
        paymentReviewReason: input.paymentReviewReason ?? null,
      })
    })
    return id
  }

  interface CreateReservationInput {
    sessionId: string
    variantId: string
    quantity?: number
    status?: InventoryReservationStatus
    expiresAt?: Date
  }
  async function createReservation(input: CreateReservationInput): Promise<string> {
    const id = randomUUID()
    await adminTx("test seed reservation", async (tx) => {
      await tx.insert(schema.inventoryReservations).values({
        id,
        variantId: input.variantId,
        checkoutSessionId: input.sessionId,
        quantity: input.quantity ?? 1,
        status: input.status ?? "active",
        expiresAt: input.expiresAt ?? PAST_GRACE_RES_AT(),
      })
    })
    return id
  }

  interface CreateVoucherInput {
    userId: string
    reservedSessionId?: string | null
  }
  async function createVoucher(input: CreateVoucherInput): Promise<string> {
    const id = randomUUID()
    await adminTx("test seed voucher", async (tx) => {
      await tx.insert(schema.vouchers).values({
        id,
        userId: input.userId,
        code: `vc-${id.slice(0, 8)}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-05",
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        reservedCheckoutSessionId: input.reservedSessionId ?? null,
        reservedAt: input.reservedSessionId ? new Date() : null,
      })
    })
    return id
  }

  async function readReservation(id: string) {
    return adminTx("test read reservation", async (tx) => {
      const rows = await tx
        .select({ status: schema.inventoryReservations.status })
        .from(schema.inventoryReservations)
        .where(eq(schema.inventoryReservations.id, id))
      return rows[0] ?? null
    })
  }

  async function readSession(id: string) {
    return adminTx("test read session", async (tx) => {
      const rows = await tx
        .select({ status: schema.checkoutSessions.status })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, id))
      return rows[0] ?? null
    })
  }

  async function readVariant(id: string) {
    return adminTx("test read variant", async (tx) => {
      const rows = await tx
        .select({ stockCount: schema.productVariants.stockCount })
        .from(schema.productVariants)
        .where(eq(schema.productVariants.id, id))
      return rows[0] ?? null
    })
  }

  async function readVoucher(id: string) {
    return adminTx("test read voucher", async (tx) => {
      const rows = await tx
        .select({
          reservedSessionId: schema.vouchers.reservedCheckoutSessionId,
          reservedAt: schema.vouchers.reservedAt,
        })
        .from(schema.vouchers)
        .where(eq(schema.vouchers.id, id))
      return rows[0] ?? null
    })
  }

  async function countJobAuditRows(): Promise<number> {
    return adminTx("test count job audit", async (tx) => {
      const rows = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.reason, "inventory_reservation_expiry_job"))
      return Number(rows[0]?.c ?? 0)
    })
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()

    await adminTx("inv-expiry test seed", async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" })
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "InvExpiry Store",
        slug: `inv-expiry-${storeId.slice(0, 8)}`,
        status: "active",
        flatShippingFeeSen: 500n,
      })
      await tx.insert(schema.products).values({
        id: productId,
        storeId,
        name: "InvExpiry Product",
        slug: `inv-expiry-${productId.slice(0, 8)}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await adminTx("inv-expiry test teardown", async (tx) => {
      // All buyers from tests have unique random IDs tracked above. Wipe their
      // dependents first to satisfy FKs, then themselves. Seller/store/product
      // stay until the end of the file.
      const buyers = [...trackedUserIds]
      if (buyers.length > 0) {
        await tx
          .delete(schema.inventoryReservations)
          .where(
            inArray(
              schema.inventoryReservations.checkoutSessionId,
              tx
                .select({ id: schema.checkoutSessions.id })
                .from(schema.checkoutSessions)
                .where(inArray(schema.checkoutSessions.userId, buyers)),
            ),
          )
        await tx
          .delete(schema.checkoutSessionItems)
          .where(
            inArray(
              schema.checkoutSessionItems.checkoutSessionId,
              tx
                .select({ id: schema.checkoutSessions.id })
                .from(schema.checkoutSessions)
                .where(inArray(schema.checkoutSessions.userId, buyers)),
            ),
          )
        await tx
          .delete(schema.checkoutSessionStores)
          .where(
            inArray(
              schema.checkoutSessionStores.checkoutSessionId,
              tx
                .select({ id: schema.checkoutSessions.id })
                .from(schema.checkoutSessions)
                .where(inArray(schema.checkoutSessions.userId, buyers)),
            ),
          )
        await tx
          .update(schema.checkoutSessions)
          .set({ voucherId: null })
          .where(inArray(schema.checkoutSessions.userId, buyers))
        await tx.delete(schema.vouchers).where(inArray(schema.vouchers.userId, buyers))
        await tx
          .delete(schema.checkoutSessions)
          .where(inArray(schema.checkoutSessions.userId, buyers))
        await tx.delete(schema.users).where(inArray(schema.users.id, buyers))
      }
      if (trackedVariantIds.size > 0) {
        await tx
          .delete(schema.productVariants)
          .where(inArray(schema.productVariants.id, [...trackedVariantIds]))
      }
      await tx.delete(schema.products).where(eq(schema.products.id, productId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
    })
    await testDb.close()
  })

  beforeEach(async () => {
    // Each test creates its own buyer + variant. No global delete needed —
    // afterAll handles full cleanup. Reset trackedVariantIds count happens
    // implicitly across tests since each test allocates new UUIDs.
  })

  // ─── 43: happy path ──────────────────────────────────────────────────

  it("43: active reservation past grace → reservation expired, stock restored, voucher released, session expired, audit row written", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(5)
    const voucherId = await createVoucher({ userId: buyerId })
    const sessionId = await createSession({ userId: buyerId, voucherId })
    const resId = await createReservation({ sessionId, variantId, quantity: 2 })
    // Re-bind voucher to session post-insert (avoid FK chicken/egg)
    await adminTx("attach voucher reservation", async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
        .where(eq(schema.vouchers.id, voucherId))
    })

    const auditBefore = await countJobAuditRows()
    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })
    const auditAfter = await countJobAuditRows()

    expect((await readReservation(resId))?.status).toBe("expired")
    expect((await readVariant(variantId))?.stockCount).toBe(7)
    expect((await readVoucher(voucherId))?.reservedSessionId).toBeNull()
    expect((await readSession(sessionId))?.status).toBe("expired")
    expect(auditAfter).toBe(auditBefore + 1)
  })

  // ─── 44: within grace → skipped ──────────────────────────────────────

  it("44: active reservation within grace → skipped (no changes)", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(5)
    const sessionId = await createSession({ userId: buyerId })
    const resId = await createReservation({
      sessionId,
      variantId,
      quantity: 2,
      expiresAt: WITHIN_GRACE_RES_AT(),
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readReservation(resId))?.status).toBe("active")
    expect((await readVariant(variantId))?.stockCount).toBe(5)
    expect((await readSession(sessionId))?.status).toBe("pending_payment")
  })

  // ─── 45: paid session → skipped ──────────────────────────────────────

  it("45: active reservation but session=paid → skipped (no changes)", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(5)
    const voucherId = await createVoucher({ userId: buyerId })
    const sessionId = await createSession({ userId: buyerId, status: "paid", voucherId })
    const resId = await createReservation({ sessionId, variantId, quantity: 2 })
    await adminTx("attach voucher reservation", async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
        .where(eq(schema.vouchers.id, voucherId))
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readReservation(resId))?.status).toBe("active")
    expect((await readVariant(variantId))?.stockCount).toBe(5)
    expect((await readVoucher(voucherId))?.reservedSessionId).toBe(sessionId)
    expect((await readSession(sessionId))?.status).toBe("paid")
  })

  // ─── 46: payment_review_required → skipped ───────────────────────────

  it("46: active reservation but session=payment_review_required → skipped (no changes)", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(5)
    const sessionId = await createSession({
      userId: buyerId,
      status: "payment_review_required",
      paymentReviewReason: "amount_mismatch",
    })
    const resId = await createReservation({ sessionId, variantId, quantity: 1 })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readReservation(resId))?.status).toBe("active")
    expect((await readVariant(variantId))?.stockCount).toBe(5)
    expect((await readSession(sessionId))?.status).toBe("payment_review_required")
  })

  // ─── 47: stale failed session — terminal status preserved ────────────

  it("47: stale failed session with active reservation past grace → reservation expired, stock restored, voucher released, session stays failed", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(3)
    const voucherId = await createVoucher({ userId: buyerId })
    const sessionId = await createSession({ userId: buyerId, status: "failed", voucherId })
    const resId = await createReservation({ sessionId, variantId, quantity: 1 })
    await adminTx("attach voucher reservation", async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
        .where(eq(schema.vouchers.id, voucherId))
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readReservation(resId))?.status).toBe("expired")
    expect((await readVariant(variantId))?.stockCount).toBe(4)
    expect((await readVoucher(voucherId))?.reservedSessionId).toBeNull()
    expect((await readSession(sessionId))?.status).toBe("failed")
  })

  // ─── 48: stale cancelled session — terminal status preserved ─────────

  it("48: stale cancelled session with active reservation past grace → reservation expired, stock restored, voucher released, session stays cancelled", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(3)
    const voucherId = await createVoucher({ userId: buyerId })
    const sessionId = await createSession({ userId: buyerId, status: "cancelled", voucherId })
    const resId = await createReservation({ sessionId, variantId, quantity: 1 })
    await adminTx("attach voucher reservation", async (tx) => {
      await tx
        .update(schema.vouchers)
        .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
        .where(eq(schema.vouchers.id, voucherId))
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readReservation(resId))?.status).toBe("expired")
    expect((await readVariant(variantId))?.stockCount).toBe(4)
    expect((await readVoucher(voucherId))?.reservedSessionId).toBeNull()
    expect((await readSession(sessionId))?.status).toBe("cancelled")
  })

  // ─── 49: orphan session → cancelled ──────────────────────────────────

  it("49: orphan pending_payment session (no PSP id, no active reservations, no reserved voucher, past grace) → cancelled", async () => {
    const buyerId = await createBuyer()
    const sessionId = await createSession({
      userId: buyerId,
      pspPaymentRequestId: null,
      sessionExpiresAt: new Date(Date.now() - PAST_GRACE),
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readSession(sessionId))?.status).toBe("cancelled")
  })

  // ─── 50: orphan guard — active reservation prevents orphan cancel ────

  it("50: orphan-guard: pending_payment + no PSP id + past grace but with active in-grace reservation → NOT cancelled", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(5)
    const sessionId = await createSession({
      userId: buyerId,
      pspPaymentRequestId: null,
      sessionExpiresAt: new Date(Date.now() - PAST_GRACE),
    })
    const resId = await createReservation({
      sessionId,
      variantId,
      quantity: 1,
      expiresAt: WITHIN_GRACE_RES_AT(), // not past grace → candidate pass skips it
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readSession(sessionId))?.status).toBe("pending_payment")
    expect((await readReservation(resId))?.status).toBe("active")
    expect((await readVariant(variantId))?.stockCount).toBe(5)
  })

  // ─── 51: concurrent runs — SKIP LOCKED prevents double-process ───────

  it("51: two concurrent job runs (two pools) → reservation expired and stock restored exactly once", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(2)
    const sessionId = await createSession({ userId: buyerId })
    const resId = await createReservation({ sessionId, variantId, quantity: 3 })

    const testDb2 = makeDb({ url: DATABASE_URL as string })
    try {
      await Promise.all([
        runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog }),
        runInventoryReservationExpiryJob({ db: testDb2.db, log: fakeLog }),
      ])
    } finally {
      await testDb2.close()
    }

    expect((await readReservation(resId))?.status).toBe("expired")
    expect((await readVariant(variantId))?.stockCount).toBe(5)
    expect((await readSession(sessionId))?.status).toBe("expired")
  })

  // ─── 52: batch size 500 — oldest first, two-pass drain ───────────────

  it("52: 600 candidates → first run processes 500 (oldest first), second run processes remaining 100", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(0)
    const total = 600
    const baseMs = Date.now() - PAST_GRACE - total * 1000

    // Bulk-insert 600 sessions + 600 reservations, all past grace, with
    // deterministic increasing expires_at. Single tx to keep wall time down.
    await adminTx("bulk seed 600", async (tx) => {
      const sessions: (typeof schema.checkoutSessions.$inferInsert)[] = []
      const reservations: (typeof schema.inventoryReservations.$inferInsert)[] = []
      const sessionIds: string[] = []
      for (let i = 0; i < total; i++) {
        const sid = randomUUID()
        sessionIds.push(sid)
        sessions.push({
          id: sid,
          userId: buyerId,
          status: "pending_payment",
          shippingAddress: VALID_ADDRESS,
          totalCatalogSen: 1000n,
          totalShippingSen: 500n,
          totalBuyerPaysSen: 1500n,
          expiresAt: new Date(baseMs + i * 1000),
        })
        reservations.push({
          variantId,
          checkoutSessionId: sid,
          quantity: 1,
          status: "active",
          expiresAt: new Date(baseMs + i * 1000),
        })
      }
      // Insert in chunks to avoid driver parameter limits.
      const CHUNK = 200
      for (let i = 0; i < sessions.length; i += CHUNK) {
        await tx.insert(schema.checkoutSessions).values(sessions.slice(i, i + CHUNK))
      }
      for (let i = 0; i < reservations.length; i += CHUNK) {
        await tx.insert(schema.inventoryReservations).values(reservations.slice(i, i + CHUNK))
      }
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    const counts1 = await adminTx("count after run 1", async (tx) => {
      const expired = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.inventoryReservations)
        .where(
          and(
            eq(schema.inventoryReservations.variantId, variantId),
            eq(schema.inventoryReservations.status, "expired"),
          ),
        )
      const active = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.inventoryReservations)
        .where(
          and(
            eq(schema.inventoryReservations.variantId, variantId),
            eq(schema.inventoryReservations.status, "active"),
          ),
        )
      return { expired: Number(expired[0]!.c), active: Number(active[0]!.c) }
    })
    expect(counts1.expired).toBe(500)
    expect(counts1.active).toBe(100)
    expect((await readVariant(variantId))?.stockCount).toBe(500)

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    const counts2 = await adminTx("count after run 2", async (tx) => {
      const expired = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.inventoryReservations)
        .where(
          and(
            eq(schema.inventoryReservations.variantId, variantId),
            eq(schema.inventoryReservations.status, "expired"),
          ),
        )
      const active = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.inventoryReservations)
        .where(
          and(
            eq(schema.inventoryReservations.variantId, variantId),
            eq(schema.inventoryReservations.status, "active"),
          ),
        )
      return { expired: Number(expired[0]!.c), active: Number(active[0]!.c) }
    })
    expect(counts2.expired).toBe(600)
    expect(counts2.active).toBe(0)
    expect((await readVariant(variantId))?.stockCount).toBe(600)

    // Bonus invariant: the first run expired the oldest 500 by expires_at.
    // After run 1, the remaining-active rows are exactly the newest 100.
    // After run 2, the latest-expired-100 are the newest-by-expires_at.
    // Verify by reading top-100 expired (most recent updatedAt) and checking
    // they were originally the newest 100 by expires_at.
    const top100 = await adminTx("read latest expired", async (tx) =>
      tx
        .select({ expiresAt: schema.inventoryReservations.expiresAt })
        .from(schema.inventoryReservations)
        .where(
          and(
            eq(schema.inventoryReservations.variantId, variantId),
            eq(schema.inventoryReservations.status, "expired"),
          ),
        )
        .orderBy(desc(schema.inventoryReservations.updatedAt))
        .limit(100),
    )
    const minTopExpires = Math.min(...top100.map((r) => r.expiresAt.getTime()))
    const cutoff = baseMs + 500 * 1000 // anything >= this index is in the newest-100
    expect(minTopExpires).toBeGreaterThanOrEqual(cutoff)
  })

  // ─── 53 (Bob R1): post-payment rows must not starve the batch ────────
  //
  // The candidate query selects up to 500 active-expired reservations. If
  // post-payment (`paid` / `payment_review_required` / `payment_review_resolved`)
  // sessions own 500 of those rows and sort earlier by expires_at, an
  // in-memory POST_PAYMENT skip would fill the batch with skipped rows and
  // starve a later pending session. The SQL candidate query must exclude
  // post-payment statuses so processable rows always make the cut.

  it("53: 500 paid-session reservations (older expires_at) do not starve a later pending session", async () => {
    const buyerId = await createBuyer()
    const variantId = await createVariant(0)
    const total = 500

    // Pre-seed 500 paid sessions with active expired reservations, all
    // strictly older than the pending session that follows. Without the
    // SQL exclusion, ORDER BY r.expires_at ASC LIMIT 500 fills the batch
    // with paid rows and the in-loop guard then skips them all — pending
    // never reaches the candidate set.
    const PAID_BASE = Date.now() - PAST_GRACE - (total + 10) * 1000
    await adminTx("bulk seed paid + pending", async (tx) => {
      const paidSessions: (typeof schema.checkoutSessions.$inferInsert)[] = []
      const paidReservations: (typeof schema.inventoryReservations.$inferInsert)[] = []
      for (let i = 0; i < total; i++) {
        const sid = randomUUID()
        paidSessions.push({
          id: sid,
          userId: buyerId,
          status: "paid",
          shippingAddress: VALID_ADDRESS,
          totalCatalogSen: 1000n,
          totalShippingSen: 500n,
          totalBuyerPaysSen: 1500n,
          expiresAt: new Date(PAID_BASE + i * 1000),
          pspPaymentRequestId: `pr-paid-${i}-${sid.slice(0, 8)}`,
          pspPaymentId: `py-paid-${i}-${sid.slice(0, 8)}`,
        })
        paidReservations.push({
          variantId,
          checkoutSessionId: sid,
          quantity: 1,
          status: "active",
          expiresAt: new Date(PAID_BASE + i * 1000),
        })
      }
      const CHUNK = 200
      for (let i = 0; i < paidSessions.length; i += CHUNK) {
        await tx.insert(schema.checkoutSessions).values(paidSessions.slice(i, i + CHUNK))
      }
      for (let i = 0; i < paidReservations.length; i += CHUNK) {
        await tx.insert(schema.inventoryReservations).values(paidReservations.slice(i, i + CHUNK))
      }
    })

    // Single pending session, strictly newer expires_at than every paid row.
    const pendingSessionId = await createSession({
      userId: buyerId,
      sessionExpiresAt: new Date(Date.now() - PAST_GRACE),
    })
    const pendingResId = await createReservation({
      sessionId: pendingSessionId,
      variantId,
      quantity: 1,
      expiresAt: new Date(Date.now() - PAST_GRACE), // newer than any paid row
    })

    await runInventoryReservationExpiryJob({ db: testDb.db, log: fakeLog })

    expect((await readReservation(pendingResId))?.status).toBe("expired")
    expect((await readSession(pendingSessionId))?.status).toBe("expired")
    expect((await readVariant(variantId))?.stockCount).toBe(1)
  })
})
