/**
 * Integration tests — membership server actions
 *
 * Requires a live Postgres with bomy_app role and applied migrations.
 * next/navigation and @/auth are mocked; HitPayClient is mocked.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/web test
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("@bomy/hitpay", () => ({
  HitPayClient: vi.fn(),
}))

// Import after mocks are registered
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { HitPayClient } from "@bomy/hitpay"
import { cancelMembership, joinMembership } from "../../src/app/(marketing)/membership/actions"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const MockHitPayClient = HitPayClient as unknown as Mock
const mockRedirect = redirect as unknown as Mock

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

describe.skipIf(!shouldRun)("membership actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let userId: string

  beforeAll(async () => {
    // Dummy env vars — HitPayClient is mocked so these never hit the real API
    process.env["HITPAY_API_KEY"] = "test-api-key"
    process.env["HITPAY_BASE_URL"] = "https://api.hit-pay.com"

    testDb = makeDb({ url: DATABASE_URL as string })
    userId = randomUUID()

    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
    })

    // Ensure platform_config price seed exists (from migration 0003)
    await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.platformConfig)
        .values({
          key: "platform_membership_price_myr_sen",
          value: 7500,
          description: "test",
        })
        .onConflictDoNothing()
    })
  })

  afterAll(async () => {
    // Clean up all test rows for this user
    await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.userId, userId))
    })
    await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, userId))
    })
    await testDb.close()
  })

  beforeAll(() => {
    // Suppress redirect mock call history between suites
    mockRedirect.mockImplementation((url: string) => {
      throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
    })
  })

  // ── joinMembership ──────────────────────────────────────────────────────

  describe("joinMembership", () => {
    it("unauthenticated → redirects to sign-in", async () => {
      mockAuth.mockResolvedValue(null)
      const url = await expectRedirect(joinMembership)
      expect(url).toBe("/auth/sign-in?callbackUrl=/membership")
    })

    it("already active → redirects to /membership/manage", async () => {
      mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "test@test.bomy" } })

      const subId = randomUUID()
      await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 365 * 86400 * 1000),
        })
      })

      try {
        const url = await expectRedirect(joinMembership)
        expect(url).toBe("/membership/manage")
      } finally {
        await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
          await tx
            .delete(schema.memberSubscriptions)
            .where(eq(schema.memberSubscriptions.id, subId))
        })
      }
    })

    it("already pending → redirects to /membership/success", async () => {
      mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "test@test.bomy" } })

      const subId = randomUUID()
      await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId,
          status: "pending",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 365 * 86400 * 1000),
        })
      })

      try {
        const url = await expectRedirect(joinMembership)
        expect(url).toBe("/membership/success")
      } finally {
        await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
          await tx
            .delete(schema.memberSubscriptions)
            .where(eq(schema.memberSubscriptions.id, subId))
        })
      }
    })

    it("success: creates pending row, stores recurring ID, redirects to checkout", async () => {
      mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "test@test.bomy" } })

      const mockBilling = {
        id: "recurring-abc123",
        url: "https://securecheckout.hit-pay.com/recurring/abc123",
      }
      const createRecurringBilling = vi.fn().mockResolvedValue(mockBilling)
      MockHitPayClient.mockImplementation(() => ({ createRecurringBilling }))

      const url = await expectRedirect(joinMembership)
      expect(url).toBe(mockBilling.url)

      // Verify createRecurringBilling was called with correct args
      expect(createRecurringBilling).toHaveBeenCalledOnce()
      const callArg = createRecurringBilling.mock.calls[0]?.[0] as {
        plan: { amount: string; currency: string; cycle: string }
        customer: { email: string }
      }
      expect(callArg?.plan?.amount).toBe("75.00")
      expect(callArg?.plan?.currency).toBe("MYR")
      expect(callArg?.plan?.cycle).toBe("yearly")
      expect(callArg?.customer?.email).toBe("test@test.bomy")

      // Verify DB row: pending with hitpayRecurringId set
      const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
        tx
          .select()
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.userId, userId)),
      )
      expect(rows).toHaveLength(1)
      const row = rows[0]!
      expect(row.status).toBe("pending")
      expect(row.priceMyrSen).toBe(7500n)
      expect(row.hitpayRecurringId).toBe("recurring-abc123")

      // Cleanup
      await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
        await tx
          .delete(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.userId, userId))
      })
    })

    it("HitPay error: cleans up pending row so user can retry", async () => {
      mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "test@test.bomy" } })

      const createRecurringBilling = vi.fn().mockRejectedValue(new Error("HitPay unavailable"))
      MockHitPayClient.mockImplementation(() => ({ createRecurringBilling }))

      await expect(joinMembership()).rejects.toThrow("HitPay unavailable")

      // Pending row should have been deleted
      const rows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
        tx
          .select({ id: schema.memberSubscriptions.id })
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.userId, userId)),
      )
      expect(rows).toHaveLength(0)
    })
  })

  // ── cancelMembership ────────────────────────────────────────────────────

  describe("cancelMembership", () => {
    it("unauthenticated → redirects to sign-in", async () => {
      mockAuth.mockResolvedValue(null)
      const url = await expectRedirect(cancelMembership)
      expect(url).toBe("/auth/sign-in?callbackUrl=/membership")
    })

    it("no active subscription → redirects to /membership", async () => {
      mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "test@test.bomy" } })
      const url = await expectRedirect(cancelMembership)
      expect(url).toBe("/membership")
    })

    it("success: calls cancelRecurringBilling, sets status cancelled, redirects", async () => {
      mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer", email: "test@test.bomy" } })

      const cancelRecurringBilling = vi.fn().mockResolvedValue(undefined)
      MockHitPayClient.mockImplementation(() => ({ cancelRecurringBilling }))

      const subId = randomUUID()
      await withAdmin(testDb.db, { userId, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.memberSubscriptions).values({
          id: subId,
          userId,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 365 * 86400 * 1000),
          hitpayRecurringId: "recurring-xyz",
        })
      })

      const url = await expectRedirect(cancelMembership)
      expect(url).toBe("/membership")
      expect(cancelRecurringBilling).toHaveBeenCalledWith("recurring-xyz")

      const cancelRows = await withAdmin(testDb.db, { userId, reason: "test assert" }, async (tx) =>
        tx
          .select({
            status: schema.memberSubscriptions.status,
            cancelledAt: schema.memberSubscriptions.cancelledAt,
          })
          .from(schema.memberSubscriptions)
          .where(eq(schema.memberSubscriptions.id, subId)),
      )
      expect(cancelRows[0]?.status).toBe("cancelled")
      expect(cancelRows[0]?.cancelledAt).not.toBeNull()

      // Cleanup
      await withAdmin(testDb.db, { userId, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.memberSubscriptions).where(eq(schema.memberSubscriptions.id, subId))
      })
    })
  })
})
