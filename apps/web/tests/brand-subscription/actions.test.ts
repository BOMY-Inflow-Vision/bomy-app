/**
 * Integration tests — brand subscription server action
 *
 * Requires a live Postgres with bomy_app role and applied migrations.
 * next/navigation and @/auth are mocked; HitPayClient is mocked.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/web test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NOT_FOUND"), { name: "NotFoundError" })
  }),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("@bomy/hitpay", () => ({ HitPayClient: vi.fn() }))

import { auth } from "@/auth"
import { HitPayClient } from "@bomy/hitpay"
import { subscribeToBrand } from "../../src/app/brands/[slug]/subscribe/actions"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const MockHitPayClient = HitPayClient as unknown as Mock

function expectRedirect(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => {
      throw new Error("Expected redirect but action returned normally")
    },
    (err: Error) => {
      if (err.message.startsWith("REDIRECT:")) return err.message.slice("REDIRECT:".length)
      throw err
    },
  )
}

describe.skipIf(!shouldRun)("subscribeToBrand", () => {
  let testDb: ReturnType<typeof makeDb>
  let userId: string
  let ownerId: string
  let storeId: string
  let planId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    process.env["HITPAY_API_KEY"] = "test-api-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    process.env["APP_URL"] = "http://localhost:3000"

    testDb = makeDb({ url: DATABASE_URL as string })
    userId = randomUUID()
    ownerId = randomUUID()
    storeId = randomUUID()
    planId = randomUUID()

    await withAdmin(testDb.db, { userId: ownerId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: userId, email: `${userId}@test.bomy`, role: "buyer" },
        { id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" },
      ])
    })

    await withAdmin(testDb.db, { userId: ownerId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId,
        name: "Test Brand Store",
        slug: `test-brand-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })

    await withAdmin(testDb.db, { userId: ownerId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 5000n,
        discountPct: 5,
        isActive: true,
      })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: ownerId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.storeId, storeId))
      await tx
        .delete(schema.brandSubscriptionPlans)
        .where(eq(schema.brandSubscriptionPlans.storeId, storeId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
      await tx.delete(schema.users).where(eq(schema.users.id, ownerId))
    })
    await testDb.close()
  })

  it("unauthenticated → redirects to sign-in", async () => {
    mockAuth.mockResolvedValue(null)
    const url = await expectRedirect(() => subscribeToBrand(planId))
    expect(url).toBe("/auth/sign-in?callbackUrl=/account/subscriptions")
  })

  it("success: creates pending row, stores payment_request_id, redirects to checkout", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "t@test.bomy" } })

    const mockPR = {
      id: "pr-test-abc",
      url: "https://securecheckout.hit-pay.com/pr-test-abc",
    }
    const createPaymentRequest = vi.fn().mockResolvedValue(mockPR)
    MockHitPayClient.mockImplementation(() => ({ createPaymentRequest }))

    const url = await expectRedirect(() => subscribeToBrand(planId))
    expect(url).toBe(mockPR.url)

    expect(createPaymentRequest).toHaveBeenCalledOnce()
    const arg = createPaymentRequest.mock.calls[0]?.[0] as {
      amount: string
      currency: string
      email: string
      purpose: string
    }
    expect(arg?.amount).toBe("50.00")
    expect(arg?.currency).toBe("MYR")
    expect(arg?.email).toBe("t@test.bomy")

    const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
      tx
        .select()
        .from(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.userId, userId)),
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.status).toBe("pending")
    expect(row.priceMyrSen).toBe(5000n)
    expect(row.discountPct).toBe(5)
    expect(row.hitpayPaymentRequestId).toBe("pr-test-abc")
    expect(row.bomyCommissionSen).toBe(0n)
    expect(row.brandPayoutSen).toBe(0n)

    // Cleanup for subsequent tests
    await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.userId, userId))
    })
  })

  it("already pending → redirects to success page", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "t@test.bomy" } })

    const subId = randomUUID()
    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.brandSubscriptions).values({
        id: subId,
        userId,
        storeId,
        planId,
        status: "pending",
        priceMyrSen: 5000n,
        discountPct: 5,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 90 * 86400 * 1000),
        bomyCommissionSen: 0n,
        brandPayoutSen: 0n,
      })
    })

    try {
      const storeRows = await withAdmin(testDb.db, { userId, reason: "test read" }, async (tx) =>
        tx
          .select({ slug: schema.stores.slug })
          .from(schema.stores)
          .where(eq(schema.stores.id, storeId))
          .limit(1),
      )
      const slug = storeRows[0]!.slug
      const url = await expectRedirect(() => subscribeToBrand(planId))
      expect(url).toBe(`/brands/${slug}/subscribe/success`)
    } finally {
      await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId))
      })
    }
  })

  it("already active → redirects to success page", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "t@test.bomy" } })

    const subId = randomUUID()
    // Seed a valid active row: split must satisfy commission + payout + fee = price
    // (enforced by the brand_subscriptions_split_chk constraint for status='active').
    // price=5000, fee=100 → net=4900 → payout=floor(4900*90%)=4410, commission=490
    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.brandSubscriptions).values({
        id: subId,
        userId,
        storeId,
        planId,
        status: "active",
        priceMyrSen: 5000n,
        discountPct: 5,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 90 * 86400 * 1000),
        hitpayFeeSen: 100n,
        bomyCommissionSen: 490n,
        brandPayoutSen: 4410n,
      })
    })

    try {
      const storeRows = await withAdmin(testDb.db, { userId, reason: "test read" }, async (tx) =>
        tx
          .select({ slug: schema.stores.slug })
          .from(schema.stores)
          .where(eq(schema.stores.id, storeId))
          .limit(1),
      )
      const slug = storeRows[0]!.slug
      const url = await expectRedirect(() => subscribeToBrand(planId))
      expect(url).toBe(`/brands/${slug}/subscribe/success`)
    } finally {
      await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.brandSubscriptions).where(eq(schema.brandSubscriptions.id, subId))
      })
    }
  })

  it("HitPay error: deletes pending row so user can retry", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "t@test.bomy" } })

    const createPaymentRequest = vi.fn().mockRejectedValue(new Error("HitPay unavailable"))
    MockHitPayClient.mockImplementation(() => ({ createPaymentRequest }))

    await expect(subscribeToBrand(planId)).rejects.toThrow("HitPay unavailable")

    const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
      tx
        .select({ id: schema.brandSubscriptions.id })
        .from(schema.brandSubscriptions)
        .where(eq(schema.brandSubscriptions.userId, userId)),
    )
    expect(rows).toHaveLength(0)
  })

  // DB correlation failure compensation paths are covered in actions.unit.test.ts
})
