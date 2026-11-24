/**
 * Migration 0039 — provider-neutral PSP columns (Stripe design §4.2).
 *
 * Covers the constraint and index behaviour 0039 introduces, for both the
 * legacy HitPay writer shape (hitpay_* only) and the new shapes (psp_* only,
 * or both dual-written):
 *   - psp_provider defaults to 'hitpay' on all three Stage 4 tables
 *   - brand_subscriptions_split_chk accepts the fee from either column
 *   - brand_subscriptions_fee_sync_chk rejects drifted fee columns
 *   - per-provider unique indexes (brand request, member checkout, duplicate
 *     payment / refund)
 *   - duplicate_charges_payment_ref_chk (hitpay_payment_id now nullable)
 *   - checkout_sessions review reasons widened; psp_paid_at /
 *     psp_async_pending_since writable
 *   - platform_config seeds active_psp + subscriptions_enabled
 *
 * Every fixture is written inside one withAdmin transaction that is rolled
 * back at the end (Rollback sentinel), so the suite leaves no rows behind —
 * not even in tables without a DELETE grant (users, duplicate_charges).
 * Expected constraint failures run inside a nested transaction (SAVEPOINT) so
 * the outer transaction stays usable.
 *
 * Gated like the other integration suites: needs DATABASE_APP_URL (bomy_app)
 * and BOMY_RLS_READY=1, otherwise it skips.
 */
import { randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Database, type Db } from "../src/client.js"
import {
  brandSubscriptionPlans,
  brandSubscriptions,
  checkoutSessions,
  duplicateCharges,
  memberSubscriptions,
  platformConfig,
  stores,
} from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

class Rollback extends Error {}

describe.skipIf(!shouldRun)("migration 0039 — psp provider columns", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  /** Runs `fn` in a withAdmin transaction and always rolls it back. */
  async function inRolledBackTx(fn: (tx: Database) => Promise<void>): Promise<void> {
    await expect(
      withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "test 0039 (rolled back)" },
        async (tx) => {
          await fn(tx)
          throw new Rollback()
        },
      ),
    ).rejects.toBeInstanceOf(Rollback)
  }

  /** Asserts `fn` fails with `pattern`, inside a SAVEPOINT so the outer tx survives. */
  async function expectViolation(
    tx: Database,
    pattern: RegExp,
    fn: (sp: Database) => Promise<unknown>,
  ): Promise<void> {
    await expect(tx.transaction(async (sp) => fn(sp as Database))).rejects.toThrow(pattern)
  }

  async function seedStoreAndPlan(tx: Database): Promise<{ storeId: string; planId: string }> {
    const storeId = randomUUID()
    const planId = randomUUID()
    await tx.insert(stores).values({
      id: storeId,
      ownerId: SYSTEM_ACTOR,
      name: "PSP 0039 test store",
      slug: `psp-0039-${storeId}`,
      status: "active",
    })
    await tx.insert(brandSubscriptionPlans).values({
      id: planId,
      storeId,
      termMonths: 3,
      priceMyrSen: 3000n,
      discountPct: 5,
      isActive: true,
    })
    return { storeId, planId }
  }

  function brandSubRow(
    storeId: string,
    planId: string,
    overrides: Partial<typeof brandSubscriptions.$inferInsert> = {},
  ): typeof brandSubscriptions.$inferInsert {
    return {
      userId: SYSTEM_ACTOR,
      storeId,
      planId,
      status: "active",
      priceMyrSen: 3000n,
      discountPct: 5,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      bomyCommissionSen: 290n,
      brandPayoutSen: 2610n,
      ...overrides,
    }
  }

  function dupRow(
    overrides: Partial<typeof duplicateCharges.$inferInsert> = {},
  ): typeof duplicateCharges.$inferInsert {
    return {
      subscriptionType: "member_subscription",
      subscriptionId: randomUUID(),
      userId: randomUUID(),
      amountSen: 5000n,
      currency: "MYR",
      ...overrides,
    }
  }

  it('seeds active_psp = "hitpay" and subscriptions_enabled = false', async () => {
    const rows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "test 0039 read seeds" },
      async (tx) =>
        tx
          .select({ key: platformConfig.key, value: platformConfig.value })
          .from(platformConfig)
          .where(inArray(platformConfig.key, ["active_psp", "subscriptions_enabled"])),
    )
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    expect(byKey["active_psp"]).toBe("hitpay")
    expect(byKey["subscriptions_enabled"]).toBe(false)
  })

  it("psp_provider defaults to 'hitpay' on member, brand and duplicate rows", async () => {
    await inRolledBackTx(async (tx) => {
      const { storeId, planId } = await seedStoreAndPlan(tx)
      const [member] = await tx
        .insert(memberSubscriptions)
        .values({
          userId: SYSTEM_ACTOR,
          status: "expired",
          priceMyrSen: 9900n,
          periodStart: new Date(),
          periodEnd: new Date(),
        })
        .returning({ pspProvider: memberSubscriptions.pspProvider })
      const [brand] = await tx
        .insert(brandSubscriptions)
        .values(brandSubRow(storeId, planId, { hitpayFeeSen: 100n }))
        .returning({ pspProvider: brandSubscriptions.pspProvider })
      const [dup] = await tx
        .insert(duplicateCharges)
        .values(dupRow({ hitpayPaymentId: `pay_${randomUUID()}` }))
        .returning({ pspProvider: duplicateCharges.pspProvider })
      expect(member?.pspProvider).toBe("hitpay")
      expect(brand?.pspProvider).toBe("hitpay")
      expect(dup?.pspProvider).toBe("hitpay")
    })
  })

  describe("brand_subscriptions split + fee-sync CHECKs", () => {
    it("accepts an active row whose fee is only in hitpay_fee_sen (pre-0039 writer)", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await tx
          .insert(brandSubscriptions)
          .values(brandSubRow(storeId, planId, { hitpayFeeSen: 100n }))
      })
    })

    it("accepts an active row whose fee is only in psp_fee_sen (Stripe writer)", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await tx.insert(brandSubscriptions).values(
          brandSubRow(storeId, planId, {
            pspProvider: "stripe",
            pspPaymentRequestId: `cs_${randomUUID()}`,
            pspPaymentId: `pi_${randomUUID()}`,
            pspFeeSen: 100n,
            pspPaidAt: new Date(),
          }),
        )
      })
    })

    it("accepts an active row with both fee columns equal (dual-writing HitPay code)", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await tx
          .insert(brandSubscriptions)
          .values(brandSubRow(storeId, planId, { hitpayFeeSen: 100n, pspFeeSen: 100n }))
      })
    })

    it("rejects an active row with no fee in either column", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await expectViolation(tx, /brand_subscriptions_split_chk/, (sp) =>
          sp.insert(brandSubscriptions).values(brandSubRow(storeId, planId)),
        )
      })
    })

    it("rejects an active row whose psp_fee_sen does not balance the split", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await expectViolation(tx, /brand_subscriptions_split_chk/, (sp) =>
          sp
            .insert(brandSubscriptions)
            .values(brandSubRow(storeId, planId, { pspProvider: "stripe", pspFeeSen: 99n })),
        )
      })
    })

    it("rejects drifted fee columns (fee-sync CHECK), even on a pending row", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await expectViolation(tx, /brand_subscriptions_fee_sync_chk/, (sp) =>
          sp.insert(brandSubscriptions).values(
            brandSubRow(storeId, planId, {
              status: "pending",
              bomyCommissionSen: 0n,
              brandPayoutSen: 0n,
              hitpayFeeSen: 100n,
              pspFeeSen: 101n,
            }),
          ),
        )
      })
    })

    it("still allows a pending row with no fee or split values", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        await tx.insert(brandSubscriptions).values(
          brandSubRow(storeId, planId, {
            status: "pending",
            bomyCommissionSen: 0n,
            brandPayoutSen: 0n,
          }),
        )
      })
    })

    it("psp_payment_request_id is unique per provider, not across providers", async () => {
      await inRolledBackTx(async (tx) => {
        const { storeId, planId } = await seedStoreAndPlan(tx)
        const requestId = `req_${randomUUID()}`
        const expired = { status: "expired" as const, hitpayFeeSen: 100n }
        await tx
          .insert(brandSubscriptions)
          .values(brandSubRow(storeId, planId, { ...expired, pspPaymentRequestId: requestId }))
        await tx.insert(brandSubscriptions).values(
          brandSubRow(storeId, planId, {
            status: "expired",
            pspProvider: "stripe",
            pspFeeSen: 100n,
            pspPaymentRequestId: requestId,
          }),
        )
        await expectViolation(tx, /brand_subscriptions_psp_request_unique_idx/, (sp) =>
          sp
            .insert(brandSubscriptions)
            .values(brandSubRow(storeId, planId, { ...expired, pspPaymentRequestId: requestId })),
        )
      })
    })
  })

  it("member_subscriptions psp_checkout_id is unique per provider", async () => {
    await inRolledBackTx(async (tx) => {
      const checkoutId = `cs_${randomUUID()}`
      const row = {
        userId: SYSTEM_ACTOR,
        status: "expired" as const,
        priceMyrSen: 9900n,
        periodStart: new Date(),
        periodEnd: new Date(),
        pspProvider: "stripe" as const,
        pspCheckoutId: checkoutId,
        pspCustomerId: `cus_${randomUUID()}`,
      }
      await tx.insert(memberSubscriptions).values(row)
      await tx.insert(memberSubscriptions).values({ ...row, pspProvider: "hitpay" })
      await expectViolation(tx, /member_subscriptions_psp_checkout_unique_idx/, (sp) =>
        sp.insert(memberSubscriptions).values(row),
      )
    })
  })

  describe("duplicate_charges", () => {
    it("accepts a Stripe row with no hitpay_payment_id", async () => {
      await inRolledBackTx(async (tx) => {
        const [row] = await tx
          .insert(duplicateCharges)
          .values(
            dupRow({
              pspProvider: "stripe",
              pspPaymentId: `pi_${randomUUID()}`,
              pspFeeSen: 150n,
            }),
          )
          .returning()
        expect(row?.hitpayPaymentId).toBeNull()
        expect(row?.pspProvider).toBe("stripe")
      })
    })

    it("rejects a row with neither payment id (payment_ref CHECK)", async () => {
      await inRolledBackTx(async (tx) => {
        await expectViolation(tx, /duplicate_charges_payment_ref_chk/, (sp) =>
          sp.insert(duplicateCharges).values(dupRow()),
        )
      })
    })

    it("psp_payment_id and psp_refund_id are unique per provider, not across providers", async () => {
      await inRolledBackTx(async (tx) => {
        const paymentId = `pay_${randomUUID()}`
        const refundId = `ref_${randomUUID()}`
        await tx
          .insert(duplicateCharges)
          .values(dupRow({ pspProvider: "stripe", pspPaymentId: paymentId, pspRefundId: refundId }))
        await tx.insert(duplicateCharges).values(
          dupRow({
            hitpayPaymentId: `pay_${randomUUID()}`,
            pspPaymentId: paymentId,
            pspRefundId: refundId,
          }),
        )
        await expectViolation(tx, /duplicate_charges_psp_payment_unique_idx/, (sp) =>
          sp
            .insert(duplicateCharges)
            .values(dupRow({ pspProvider: "stripe", pspPaymentId: paymentId })),
        )
        await expectViolation(tx, /duplicate_charges_psp_refund_unique_idx/, (sp) =>
          sp.insert(duplicateCharges).values(
            dupRow({
              pspProvider: "stripe",
              pspPaymentId: `pi_${randomUUID()}`,
              pspRefundId: refundId,
            }),
          ),
        )
      })
    })
  })

  describe("checkout_sessions", () => {
    function sessionRow(
      overrides: Partial<typeof checkoutSessions.$inferInsert> = {},
    ): typeof checkoutSessions.$inferInsert {
      return {
        id: randomUUID(),
        userId: SYSTEM_ACTOR,
        status: "pending_payment",
        shippingAddress: {},
        totalCatalogSen: 5000n,
        totalShippingSen: 500n,
        totalBuyerPaysSen: 5500n,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        ...overrides,
      }
    }

    it.each(["psp_fee_unavailable", "psp_async_timeout", "amount_mismatch"])(
      "accepts payment_review_reason %s",
      async (reason) => {
        await inRolledBackTx(async (tx) => {
          await tx
            .insert(checkoutSessions)
            .values(sessionRow({ status: "payment_review_required", paymentReviewReason: reason }))
        })
      },
    )

    it("rejects an unknown payment_review_reason", async () => {
      await inRolledBackTx(async (tx) => {
        await expectViolation(tx, /checkout_sessions_payment_review_reason_chk/, (sp) =>
          sp.insert(checkoutSessions).values(
            sessionRow({
              status: "payment_review_required",
              paymentReviewReason: "psp_whatever",
            }),
          ),
        )
      })
    })

    it("stores psp_paid_at and psp_async_pending_since (NULL by default)", async () => {
      await inRolledBackTx(async (tx) => {
        const plain = sessionRow()
        const stripe = sessionRow({
          pspProvider: "stripe",
          pspPaidAt: new Date(),
          pspAsyncPendingSince: new Date(),
        })
        await tx.insert(checkoutSessions).values([plain, stripe])
        const [p] = await tx
          .select()
          .from(checkoutSessions)
          .where(eq(checkoutSessions.id, plain.id))
        const [s] = await tx
          .select()
          .from(checkoutSessions)
          .where(eq(checkoutSessions.id, stripe.id))
        expect(p?.pspPaidAt).toBeNull()
        expect(p?.pspAsyncPendingSince).toBeNull()
        expect(s?.pspPaidAt).toBeInstanceOf(Date)
        expect(s?.pspAsyncPendingSince).toBeInstanceOf(Date)
      })
    })
  })
})
