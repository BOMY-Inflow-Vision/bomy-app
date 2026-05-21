/**
 * Spec §10.1 — migration 0013 schema + RLS regression tests (tests 1–4).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/db test order_management
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb } from "../src/client.js"
import * as schema from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

// DATABASE_APP_URL must point at bomy_app (no BYPASSRLS) so RLS actually fires.
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
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
}

describe.skipIf(!shouldRun)("migration 0013 — resolved_at", () => {
  let testDb: ReturnType<typeof makeDb>
  let buyerId: string
  let sellerId: string
  let sessionId: string

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    buyerId = randomUUID()
    sellerId = randomUUID()
    sessionId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: "payment_review_required",
        paymentReviewReason: "amount_mismatch",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 1000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 1500n,
        expiresAt: new Date(Date.now() + 3600000),
      })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
    })
    await testDb.close()
  })

  // Test 1
  it("1 — resolved_at column exists and is nullable on checkout_sessions", async () => {
    const [row] = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read" },
      async (tx) =>
        tx
          .select({ resolvedAt: schema.checkoutSessions.resolvedAt })
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId)),
    )
    expect(row).toBeDefined()
    expect(row!.resolvedAt).toBeNull()
  })

  // Test 2
  it("2 — withAdmin can write all three resolution fields", async () => {
    const adminId = randomUUID()
    const resolvedAt = new Date()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed admin" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" })
    })

    await withAdmin(testDb.db, { userId: adminId, reason: "test resolve" }, async (tx) => {
      await tx
        .update(schema.checkoutSessions)
        .set({
          status: "payment_review_resolved",
          resolvedBy: adminId,
          resolutionNote: "manually reconciled",
          resolvedAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.checkoutSessions.id, sessionId))
    })

    const [row] = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test verify" },
      async (tx) =>
        tx
          .select({
            resolvedBy: schema.checkoutSessions.resolvedBy,
            resolutionNote: schema.checkoutSessions.resolutionNote,
            resolvedAt: schema.checkoutSessions.resolvedAt,
          })
          .from(schema.checkoutSessions)
          .where(eq(schema.checkoutSessions.id, sessionId)),
    )
    expect(row!.resolvedBy).toBe(adminId)
    expect(row!.resolutionNote).toBe("manually reconciled")
    expect(row!.resolvedAt?.toISOString()).toBe(resolvedAt.toISOString())

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test cleanup admin" },
      async (tx) => {
        await tx.delete(schema.users).where(eq(schema.users.id, adminId))
      },
    )
  })

  // Test 3
  it("3 — withTenant buyer role cannot UPDATE checkout_sessions.resolved_at (RLS silent deny)", async () => {
    const result = await withTenant(testDb.db, { userId: buyerId, userRole: "buyer" }, async (tx) =>
      tx
        .update(schema.checkoutSessions)
        .set({ resolvedAt: new Date() })
        .where(eq(schema.checkoutSessions.id, sessionId))
        .returning({ id: schema.checkoutSessions.id }),
    )
    expect(result).toHaveLength(0)
  })

  // Test 4
  it("4 — withTenant seller_owner role cannot UPDATE checkout_sessions.resolved_at (RLS silent deny)", async () => {
    const storeId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed store" }, async (tx) => {
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Test Store",
        slug: `test-store-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })

    const result = await withTenant(
      testDb.db,
      { userId: sellerId, userRole: "seller_owner", sellerId: storeId },
      async (tx) =>
        tx
          .update(schema.checkoutSessions)
          .set({ resolvedAt: new Date() })
          .where(eq(schema.checkoutSessions.id, sessionId))
          .returning({ id: schema.checkoutSessions.id }),
    )
    expect(result).toHaveLength(0)

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test cleanup store" },
      async (tx) => {
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      },
    )
  })
})
