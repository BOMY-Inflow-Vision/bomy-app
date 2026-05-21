/**
 * Spec §10.5a — resolvePaymentReview integration tests (tests 36–40).
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/admin test checkout-sessions/actions --run
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"

import { resolvePaymentReview } from "../../src/app/checkout-sessions/[sessionId]/actions"

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

describe.skipIf(!shouldRun)("resolvePaymentReview", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let opsId: string
  let financeId: string
  let buyerId: string

  async function adminTx<T>(
    reason: string,
    fn: (tx: Parameters<Parameters<typeof withAdmin>[2]>[0]) => Promise<T>,
  ) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  async function seedReviewSession(): Promise<string> {
    const sessionId = randomUUID()
    const buyerIdLocal = randomUUID()
    await adminTx("seed session", async (tx) => {
      await tx.insert(schema.users).values({
        id: buyerIdLocal,
        email: `${buyerIdLocal}@test.bomy`,
        role: "buyer",
      })
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerIdLocal,
        status: "payment_review_required",
        paymentReviewReason: "amount_mismatch",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 1000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 1500n,
        expiresAt: new Date(Date.now() + 3600000),
      })
    })
    return sessionId
  }

  async function readSession(id: string) {
    return adminTx("read session", async (tx) => {
      const [row] = await tx
        .select({
          status: schema.checkoutSessions.status,
          resolvedBy: schema.checkoutSessions.resolvedBy,
          resolutionNote: schema.checkoutSessions.resolutionNote,
          resolvedAt: schema.checkoutSessions.resolvedAt,
        })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, id))
      return row ?? null
    })
  }

  beforeAll(async () => {
    testDb = makeDb({ url: DATABASE_URL as string })
    process.env["DATABASE_URL"] = DATABASE_URL as string
    adminId = randomUUID()
    opsId = randomUUID()
    financeId = randomUUID()
    buyerId = randomUUID()

    await adminTx("setup users", async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        { id: opsId, email: `${opsId}@test.bomy`, role: "bomy_ops" },
        { id: financeId, email: `${financeId}@test.bomy`, role: "bomy_finance" },
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" },
      ])
    })
  })

  afterAll(async () => {
    await adminTx("cleanup", async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
      await tx.delete(schema.users).where(eq(schema.users.id, opsId))
      await tx.delete(schema.users).where(eq(schema.users.id, financeId))
      await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
    })
    await testDb.close()
  })

  // Test 36
  it("36 — happy path: payment_review_required → payment_review_resolved; all three resolution fields written", async () => {
    const sessionId = await seedReviewSession()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const result = await resolvePaymentReview(sessionId, "Manually reconciled")

    expect(result).toEqual({ ok: true })
    const row = await readSession(sessionId)
    expect(row?.status).toBe("payment_review_resolved")
    expect(row?.resolvedBy).toBe(adminId)
    expect(row?.resolutionNote).toBe("Manually reconciled")
    expect(row?.resolvedAt).not.toBeNull()
  })

  // Test 37
  it("37 — session not in payment_review_required → NOT_FOUND", async () => {
    const sessionId = randomUUID()
    await adminTx("seed paid session", async (tx) => {
      await tx.insert(schema.checkoutSessions).values({
        id: sessionId,
        userId: buyerId,
        status: "paid",
        shippingAddress: VALID_ADDRESS,
        totalCatalogSen: 1000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 1500n,
        expiresAt: new Date(Date.now() + 3600000),
      })
    })
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const result = await resolvePaymentReview(sessionId, "note")

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  // Test 38
  it("38 — already resolved → NOT_FOUND", async () => {
    const sessionId = await seedReviewSession()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    await resolvePaymentReview(sessionId, "first resolve")
    const result = await resolvePaymentReview(sessionId, "second attempt")

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" })
  })

  // Test 39
  it("39 — bomy_ops role is allowed", async () => {
    const sessionId = await seedReviewSession()
    mockAuth.mockResolvedValue({ user: { id: opsId, role: "bomy_ops" } })

    const result = await resolvePaymentReview(sessionId, "ops team resolved")

    expect(result).toEqual({ ok: true })
  })

  // Test 40
  it("40 — bomy_finance role → FORBIDDEN", async () => {
    const sessionId = await seedReviewSession()
    mockAuth.mockResolvedValue({ user: { id: financeId, role: "bomy_finance" } })

    const result = await resolvePaymentReview(sessionId, "finance attempt")

    expect(result).toEqual({ ok: false, error: "FORBIDDEN" })
  })
})
