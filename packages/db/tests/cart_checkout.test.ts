/**
 * Stage 5 PR #31 — Cart + Checkout schema & RLS integration tests.
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/db test
 */
import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import {
  checkoutSessionItems,
  checkoutSessionStores,
  checkoutSessions,
  inventoryReservations,
  productVariants,
  products,
  stores,
  users,
} from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("PR #31 cart + checkout schema & RLS", () => {
  let handle: Db

  let buyerAId: string
  let buyerBId: string
  let staffId: string
  let sellerId: string
  let storeId: string
  let productId: string
  let variantId: string

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })

    buyerAId = randomUUID()
    buyerBId = randomUUID()
    staffId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()
    productId = randomUUID()
    variantId = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "cart_checkout test seed" },
      async (tx) => {
        await tx.insert(users).values([
          { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
          { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
          { id: staffId, email: `${staffId}@test.bomy`, role: "bomy_ops" },
          { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
        ])
        await tx.insert(stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "Cart Test Store",
          slug: `cart-${storeId}`,
          status: "active",
        })
        await tx.insert(products).values({
          id: productId,
          storeId,
          name: "Cart Test Product",
          slug: `prod-${productId}`,
          status: "active",
        })
        await tx.insert(productVariants).values({
          id: variantId,
          productId,
          name: "M / Red",
          priceMyrSen: 5000n,
          stockCount: 100,
          isActive: true,
        })
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "cart_checkout test teardown" },
      async (tx) => {
        // Cascades from checkout_sessions take care of items/stores/reservations.
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerAId))
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerBId))
        await tx.delete(productVariants).where(eq(productVariants.id, variantId))
        await tx.delete(products).where(eq(products.id, productId))
        await tx.delete(stores).where(eq(stores.id, storeId))
        await tx.delete(users).where(eq(users.id, buyerAId))
        await tx.delete(users).where(eq(users.id, buyerBId))
        await tx.delete(users).where(eq(users.id, staffId))
        await tx.delete(users).where(eq(users.id, sellerId))
      },
    )
    await handle.close()
  })

  beforeEach(async () => {
    // Each test starts from a clean slate on checkout_sessions.
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "cart_checkout test reset" },
      async (tx) => {
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerAId))
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerBId))
      },
    )
  })

  // ─── Helpers ─────────────────────────────────────────────────────────

  function validSessionRow(overrides: Partial<typeof checkoutSessions.$inferInsert> = {}) {
    return {
      id: randomUUID(),
      userId: buyerAId,
      status: "pending_payment" as const,
      shippingAddress: {},
      totalCatalogSen: 5000n,
      totalShippingSen: 500n,
      totalBuyerPaysSen: 5500n,
      voucherDiscountSen: 0n,
      brandDiscountTotalSen: 0n,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      ...overrides,
    }
  }

  async function insertSessionViaAdmin(row: Partial<typeof checkoutSessions.$inferInsert> = {}) {
    const full = validSessionRow(row)
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "insert session for test" },
      async (tx) => {
        await tx.insert(checkoutSessions).values(full)
      },
    )
    return full
  }

  // ─── 1. Schema CHECK constraints ─────────────────────────────────────

  describe("schema CHECKs", () => {
    it("checkout_sessions rejects voucher_discount > 0 AND brand_discount_total > 0", async () => {
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.insert(checkoutSessions).values(
            validSessionRow({
              totalCatalogSen: 5000n,
              totalShippingSen: 0n,
              voucherDiscountSen: 1000n,
              brandDiscountTotalSen: 1000n,
              totalBuyerPaysSen: 3000n,
            }),
          )
        }),
      ).rejects.toThrow(/voucher_brand_xor_chk/)
    })

    it("checkout_sessions rejects total_buyer_pays mismatch with derived formula", async () => {
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.insert(checkoutSessions).values(
            validSessionRow({
              totalCatalogSen: 5000n,
              totalShippingSen: 500n,
              totalBuyerPaysSen: 9999n, // wrong
            }),
          )
        }),
      ).rejects.toThrow(/total_derived_chk/)
    })

    it("checkout_sessions rejects total_buyer_pays = 0", async () => {
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.insert(checkoutSessions).values(
            validSessionRow({
              totalCatalogSen: 1000n,
              totalShippingSen: 0n,
              voucherDiscountSen: 1000n,
              totalBuyerPaysSen: 0n,
            }),
          )
        }),
      ).rejects.toThrow(/total_positive_chk/)
    })

    it("checkout_sessions rejects voucher_discount > total_catalog", async () => {
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.insert(checkoutSessions).values(
            validSessionRow({
              totalCatalogSen: 1000n,
              totalShippingSen: 0n,
              voucherDiscountSen: 9999n,
              totalBuyerPaysSen: 1n, // forces total_derived_chk to pass artificially
            }),
          )
        }),
      ).rejects.toThrow(/voucher_cap_chk|total_derived_chk/)
    })

    it("checkout_session_stores rejects brand_discount > retail_subtotal", async () => {
      const session = await insertSessionViaAdmin()
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.insert(checkoutSessionStores).values({
            checkoutSessionId: session.id,
            storeId,
            retailSubtotalSen: 1000n,
            brandDiscountSen: 5000n,
            discountedSubtotalSen: -4000n,
            shippingFeeSen: 0n,
          })
        }),
      ).rejects.toThrow(/brand_cap_chk/)
    })

    it("checkout_session_stores rejects discounted_subtotal mismatch", async () => {
      const session = await insertSessionViaAdmin()
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.insert(checkoutSessionStores).values({
            checkoutSessionId: session.id,
            storeId,
            retailSubtotalSen: 1000n,
            brandDiscountSen: 100n,
            discountedSubtotalSen: 9999n, // wrong; should be 900
            shippingFeeSen: 0n,
          })
        }),
      ).rejects.toThrow(/discounted_chk/)
    })

    it("stores.flat_shipping_fee_sen rejects negative value", async () => {
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "check test" }, async (tx) => {
          await tx.update(stores).set({ flatShippingFeeSen: -1n }).where(eq(stores.id, storeId))
        }),
      ).rejects.toThrow(/flat_shipping_fee_sen_chk/)
    })

    it("vouchers.redeemed_order_id column has been dropped", async () => {
      const rows = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "check column dropped" },
        async (tx) =>
          tx.execute(sql`
            SELECT column_name
              FROM information_schema.columns
             WHERE table_name = 'vouchers' AND column_name = 'redeemed_order_id'
          `),
      )
      expect(rows.length).toBe(0)
    })

    it("vouchers_available_user_idx exists", async () => {
      const rows = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "check index exists" },
        async (tx) =>
          tx.execute(sql`
            SELECT 1 FROM pg_indexes WHERE indexname = 'vouchers_available_user_idx'
          `),
      )
      expect(rows.length).toBe(1)
    })
  })

  // ─── 2. RLS — checkout_sessions ──────────────────────────────────────

  describe("RLS — checkout_sessions buyer SELECT only", () => {
    it("buyer reads own checkout_session; cannot read another buyer's", async () => {
      const sessionA = await insertSessionViaAdmin({ userId: buyerAId })
      const sessionB = await insertSessionViaAdmin({ userId: buyerBId })

      const aReadingOwn = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) =>
          tx
            .select({ id: checkoutSessions.id })
            .from(checkoutSessions)
            .where(eq(checkoutSessions.id, sessionA.id)),
      )
      expect(aReadingOwn).toHaveLength(1)

      const aReadingB = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) =>
          tx
            .select({ id: checkoutSessions.id })
            .from(checkoutSessions)
            .where(eq(checkoutSessions.id, sessionB.id)),
      )
      expect(aReadingB).toHaveLength(0)
    })

    it("buyer cannot INSERT a checkout_session even with user_id = self", async () => {
      await expect(
        withTenant(handle.db, { userId: buyerAId, userRole: "buyer" }, async (tx) => {
          await tx.insert(checkoutSessions).values(validSessionRow({ userId: buyerAId }))
        }),
      ).rejects.toThrow()
    })

    it("buyer cannot UPDATE own checkout_session", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      const updated = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) =>
          tx
            .update(checkoutSessions)
            .set({ status: "cancelled" })
            .where(eq(checkoutSessions.id, session.id))
            .returning({ id: checkoutSessions.id }),
      )
      // RLS UPDATE with no matching policy returns 0 rows (silent denial).
      expect(updated).toHaveLength(0)
      // Verify status unchanged
      const after = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "verify status" },
        async (tx) =>
          tx
            .select({ status: checkoutSessions.status })
            .from(checkoutSessions)
            .where(eq(checkoutSessions.id, session.id)),
      )
      expect(after[0]?.status).toBe("pending_payment")
    })

    it("buyer cannot DELETE own checkout_session", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      const deleted = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) =>
          tx
            .delete(checkoutSessions)
            .where(eq(checkoutSessions.id, session.id))
            .returning({ id: checkoutSessions.id }),
      )
      expect(deleted).toHaveLength(0)
    })

    it("staff (bomy_ops via withTenant) can SELECT but cannot INSERT", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      const read = await withTenant(
        handle.db,
        { userId: staffId, userRole: "bomy_ops" },
        async (tx) =>
          tx
            .select({ id: checkoutSessions.id })
            .from(checkoutSessions)
            .where(eq(checkoutSessions.id, session.id)),
      )
      expect(read).toHaveLength(1)

      await expect(
        withTenant(handle.db, { userId: staffId, userRole: "bomy_ops" }, async (tx) => {
          await tx.insert(checkoutSessions).values(validSessionRow({ userId: buyerAId }))
        }),
      ).rejects.toThrow()
    })
  })

  // ─── 3. RLS — child tables ───────────────────────────────────────────

  describe("RLS — checkout_session_items/stores buyer SELECT via parent", () => {
    it("buyer cannot INSERT checkout_session_items even into own session", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await expect(
        withTenant(handle.db, { userId: buyerAId, userRole: "buyer" }, async (tx) => {
          await tx.insert(checkoutSessionItems).values({
            checkoutSessionId: session.id,
            storeId,
            variantId,
            productSnapshot: {},
            variantSnapshot: {},
            quantity: 1,
            unitPriceSen: 5000n,
            lineTotalSen: 5000n,
          })
        }),
      ).rejects.toThrow()
    })

    it("buyer cannot INSERT checkout_session_stores even into own session", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await expect(
        withTenant(handle.db, { userId: buyerAId, userRole: "buyer" }, async (tx) => {
          await tx.insert(checkoutSessionStores).values({
            checkoutSessionId: session.id,
            storeId,
            retailSubtotalSen: 1000n,
            brandDiscountSen: 0n,
            discountedSubtotalSen: 1000n,
            shippingFeeSen: 0n,
          })
        }),
      ).rejects.toThrow()
    })

    it("buyer SELECTs items of own session via parent join", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed item" }, async (tx) => {
        await tx.insert(checkoutSessionItems).values({
          checkoutSessionId: session.id,
          storeId,
          variantId,
          productSnapshot: {},
          variantSnapshot: {},
          quantity: 1,
          unitPriceSen: 5000n,
          lineTotalSen: 5000n,
        })
      })
      const rows = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) =>
          tx
            .select({ id: checkoutSessionItems.id })
            .from(checkoutSessionItems)
            .where(eq(checkoutSessionItems.checkoutSessionId, session.id)),
      )
      expect(rows).toHaveLength(1)
    })
  })

  // ─── 4. RLS — inventory_reservations ─────────────────────────────────

  describe("RLS — inventory_reservations admin-only writes; staff/admin SELECT", () => {
    it("buyer (withTenant) cannot SELECT inventory_reservations", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "seed reservation" },
        async (tx) => {
          await tx.insert(inventoryReservations).values({
            variantId,
            checkoutSessionId: session.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          })
        },
      )
      const rows = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) =>
          tx
            .select({ id: inventoryReservations.id })
            .from(inventoryReservations)
            .where(eq(inventoryReservations.checkoutSessionId, session.id)),
      )
      expect(rows).toHaveLength(0)
    })

    it("staff (withTenant bomy_ops) CAN SELECT inventory_reservations", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "seed reservation" },
        async (tx) => {
          await tx.insert(inventoryReservations).values({
            variantId,
            checkoutSessionId: session.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          })
        },
      )
      const rows = await withTenant(
        handle.db,
        { userId: staffId, userRole: "bomy_ops" },
        async (tx) =>
          tx
            .select({ id: inventoryReservations.id })
            .from(inventoryReservations)
            .where(eq(inventoryReservations.checkoutSessionId, session.id)),
      )
      expect(rows).toHaveLength(1)
    })

    it("buyer (withTenant) cannot INSERT inventory_reservations", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await expect(
        withTenant(handle.db, { userId: buyerAId, userRole: "buyer" }, async (tx) => {
          await tx.insert(inventoryReservations).values({
            variantId,
            checkoutSessionId: session.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          })
        }),
      ).rejects.toThrow()
    })

    it("staff (withTenant bomy_ops) cannot INSERT inventory_reservations", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      await expect(
        withTenant(handle.db, { userId: staffId, userRole: "bomy_ops" }, async (tx) => {
          await tx.insert(inventoryReservations).values({
            variantId,
            checkoutSessionId: session.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          })
        }),
      ).rejects.toThrow()
    })

    it("withAdmin can INSERT, UPDATE, SELECT inventory_reservations", async () => {
      const session = await insertSessionViaAdmin({ userId: buyerAId })
      const resId = randomUUID()
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "admin full access" },
        async (tx) => {
          await tx.insert(inventoryReservations).values({
            id: resId,
            variantId,
            checkoutSessionId: session.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          })
          await tx
            .update(inventoryReservations)
            .set({ status: "released" })
            .where(eq(inventoryReservations.id, resId))
          const rows = await tx
            .select({ status: inventoryReservations.status })
            .from(inventoryReservations)
            .where(eq(inventoryReservations.id, resId))
          expect(rows[0]?.status).toBe("released")
        },
      )
    })
  })
})
