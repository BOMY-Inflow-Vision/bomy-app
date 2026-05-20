/**
 * Stage 5 PR #32 — Order webhook schema & RLS integration tests (spec §7.1, tests 1–10c).
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/db test order_webhook.test.ts --run
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import {
  checkoutSessions,
  orderItems,
  orderPayouts,
  orders,
  processedWebhookEvents,
  productVariants,
  products,
  stores,
  users,
} from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"
import type { UserRole } from "../src/types.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("PR #32 order webhook schema & RLS", () => {
  let handle: Db

  // Buyers
  let buyerAId: string
  let buyerBId: string

  // Sellers — each owns one store
  let ownerUId: string
  let ownerOtherId: string

  // Staff roles
  let opsId: string
  let adminId: string
  let financeId: string

  // Catalog
  let storeS1Id: string
  let storeS2Id: string
  let productP1Id: string
  let productP2Id: string
  let variantV1Id: string
  let variantV2Id: string

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })

    buyerAId = randomUUID()
    buyerBId = randomUUID()
    ownerUId = randomUUID()
    ownerOtherId = randomUUID()
    opsId = randomUUID()
    adminId = randomUUID()
    financeId = randomUUID()
    storeS1Id = randomUUID()
    storeS2Id = randomUUID()
    productP1Id = randomUUID()
    productP2Id = randomUUID()
    variantV1Id = randomUUID()
    variantV2Id = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "order_webhook test seed" },
      async (tx) => {
        await tx.insert(users).values([
          { id: buyerAId, email: `${buyerAId}@test.bomy`, role: "buyer" },
          { id: buyerBId, email: `${buyerBId}@test.bomy`, role: "buyer" },
          { id: ownerUId, email: `${ownerUId}@test.bomy`, role: "seller_owner" },
          { id: ownerOtherId, email: `${ownerOtherId}@test.bomy`, role: "seller_owner" },
          { id: opsId, email: `${opsId}@test.bomy`, role: "bomy_ops" },
          { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
          { id: financeId, email: `${financeId}@test.bomy`, role: "bomy_finance" },
        ])
        await tx.insert(stores).values([
          {
            id: storeS1Id,
            ownerId: ownerUId,
            name: "Store S1",
            slug: `store-${storeS1Id}`,
            status: "active",
          },
          {
            id: storeS2Id,
            ownerId: ownerOtherId,
            name: "Store S2",
            slug: `store-${storeS2Id}`,
            status: "active",
          },
        ])
        await tx.insert(products).values([
          {
            id: productP1Id,
            storeId: storeS1Id,
            name: "Product P1",
            slug: `prod-${productP1Id}`,
            status: "active",
          },
          {
            id: productP2Id,
            storeId: storeS2Id,
            name: "Product P2",
            slug: `prod-${productP2Id}`,
            status: "active",
          },
        ])
        await tx.insert(productVariants).values([
          {
            id: variantV1Id,
            productId: productP1Id,
            name: "V1",
            priceMyrSen: 5000n,
            stockCount: 100,
            isActive: true,
          },
          {
            id: variantV2Id,
            productId: productP2Id,
            name: "V2",
            priceMyrSen: 5000n,
            stockCount: 100,
            isActive: true,
          },
        ])
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "order_webhook test teardown" },
      async (tx) => {
        // orders ON DELETE CASCADE → order_items. order_payouts ON DELETE RESTRICT → orders,
        // so wipe payouts first.
        await tx.delete(orderPayouts)
        await tx.delete(orders)
        await tx.delete(processedWebhookEvents)
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerAId))
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerBId))
        await tx.delete(productVariants).where(eq(productVariants.id, variantV1Id))
        await tx.delete(productVariants).where(eq(productVariants.id, variantV2Id))
        await tx.delete(products).where(eq(products.id, productP1Id))
        await tx.delete(products).where(eq(products.id, productP2Id))
        await tx.delete(stores).where(eq(stores.id, storeS1Id))
        await tx.delete(stores).where(eq(stores.id, storeS2Id))
        for (const id of [buyerAId, buyerBId, ownerUId, ownerOtherId, opsId, adminId, financeId]) {
          await tx.delete(users).where(eq(users.id, id))
        }
      },
    )
    await handle.close()
  })

  beforeEach(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "order_webhook test reset" },
      async (tx) => {
        await tx.delete(orderPayouts)
        await tx.delete(orders)
        await tx.delete(processedWebhookEvents)
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerAId))
        await tx.delete(checkoutSessions).where(eq(checkoutSessions.userId, buyerBId))
      },
    )
  })

  // ─── Helpers ─────────────────────────────────────────────────────────

  function validSessionRow(
    buyerId: string,
    overrides: Partial<typeof checkoutSessions.$inferInsert> = {},
  ) {
    return {
      id: randomUUID(),
      userId: buyerId,
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

  async function insertSession(buyerId: string): Promise<string> {
    const row = validSessionRow(buyerId)
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "seed checkout_session" },
      async (tx) => {
        await tx.insert(checkoutSessions).values(row)
      },
    )
    return row.id
  }

  // Returns a row that satisfies every CHECK constraint:
  // discounted_subtotal = retail - brand_discount = 5000 - 0 = 5000
  // journal: seller_payout 3500 + bomy_commission 1250 + psp_fee 250 = 5000
  //          discounted 5000 + shipping 500 - voucher 0 = 5500 → off by 500
  // recompute: journal LHS must equal discounted + shipping - voucher = 5500
  // so split 5500 across the three legs.
  function validOrderRow(
    sessionId: string,
    storeId: string,
    buyerId: string,
    overrides: Partial<typeof orders.$inferInsert> = {},
  ) {
    // retail 5000, shipping 500, no brand discount, no voucher → discounted 5000, total leg 5500.
    // psp fee 250; commission 25% of (discounted - psp_fee_on_catalog).
    // To keep it simple: seller_payout 4000, bomy_commission 1250, psp_fee 250 → 5500 ✓
    return {
      id: randomUUID(),
      checkoutSessionId: sessionId,
      storeId,
      buyerId,
      shippingAddress: {},
      shippingFeeSen: 500n,
      retailSubtotalSen: 5000n,
      brandDiscountSen: 0n,
      discountedSubtotalSen: 5000n,
      voucherContributionSen: 0n,
      pspFeeAllocatedSen: 250n,
      bomyCommissionSen: 1250n,
      bomyCommissionPct: 25,
      sellerPayoutSen: 4000n,
      paymentStatus: "paid" as const,
      fulfilmentStatus: "processing" as const,
      ...overrides,
    }
  }

  async function insertOrder(
    sessionId: string,
    storeId: string,
    buyerId: string,
    overrides: Partial<typeof orders.$inferInsert> = {},
  ): Promise<string> {
    const row = validOrderRow(sessionId, storeId, buyerId, overrides)
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed order" }, async (tx) => {
      await tx.insert(orders).values(row)
    })
    return row.id
  }

  // ─── 1. Schema CHECK constraints (tests 1–5) ─────────────────────────

  describe("schema CHECKs", () => {
    it("1: orders rejects journal balance violation", async () => {
      const sessionId = await insertSession(buyerAId)
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "ck1" }, async (tx) => {
          await tx.insert(orders).values(
            validOrderRow(sessionId, storeS1Id, buyerAId, {
              // seller_payout + bomy_commission + psp_fee = 4000 + 9999 + 250 = 14249
              // but discounted + shipping - voucher = 5000 + 500 - 0 = 5500 → violation
              bomyCommissionSen: 9999n,
            }),
          )
        }),
      ).rejects.toThrow(/orders_journal_balance/)
    })

    it("2: orders rejects discounted_subtotal ≠ retail − brand_discount", async () => {
      const sessionId = await insertSession(buyerAId)
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "ck2" }, async (tx) => {
          await tx.insert(orders).values(
            validOrderRow(sessionId, storeS1Id, buyerAId, {
              retailSubtotalSen: 5000n,
              brandDiscountSen: 1000n,
              discountedSubtotalSen: 5000n, // wrong; should be 4000
            }),
          )
        }),
      ).rejects.toThrow(/orders_discounted_check|orders_journal_balance/)
    })

    it("3: orders rejects bomy_commission_pct = 101", async () => {
      const sessionId = await insertSession(buyerAId)
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "ck3" }, async (tx) => {
          await tx
            .insert(orders)
            .values(validOrderRow(sessionId, storeS1Id, buyerAId, { bomyCommissionPct: 101 }))
        }),
      ).rejects.toThrow(/orders_commission_pct_range/)
    })

    it("4: orders ACCEPTS bomy_commission_sen < 0 when journal still balances", async () => {
      const sessionId = await insertSession(buyerAId)
      // Aggressive voucher: voucher_contribution 4000 → journal = discounted 5000 + shipping 500 - voucher 4000 = 1500
      // seller_payout 4000 + bomy_commission (-2750) + psp_fee 250 = 1500 ✓
      const orderId = randomUUID()
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "ck4" }, async (tx) => {
        await tx.insert(orders).values(
          validOrderRow(sessionId, storeS1Id, buyerAId, {
            id: orderId,
            voucherContributionSen: 4000n,
            bomyCommissionSen: -2750n,
          }),
        )
      })
      // Verify it actually persisted
      const rows = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "ck4 verify" },
        async (tx) =>
          tx.select({ bomy: orders.bomyCommissionSen }).from(orders).where(eq(orders.id, orderId)),
      )
      expect(rows[0]?.bomy).toBe(-2750n)
    })

    it("5: order_items rejects line_total ≠ quantity * unit_price", async () => {
      const sessionId = await insertSession(buyerAId)
      const orderId = await insertOrder(sessionId, storeS1Id, buyerAId)
      await expect(
        withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "ck5" }, async (tx) => {
          await tx.insert(orderItems).values({
            orderId,
            storeId: storeS1Id,
            variantId: variantV1Id,
            productSnapshot: {},
            variantSnapshot: {},
            quantity: 2,
            unitPriceSen: 5000n,
            lineTotalSen: 9999n, // wrong; should be 10000
          })
        }),
      ).rejects.toThrow(/order_items_line_total_chk/)
    })
  })

  // ─── 2. RLS — SELECT scoping (tests 6–8) ─────────────────────────────

  describe("RLS — orders SELECT scoping", () => {
    it("6: buyer SELECTs own orders; cannot SELECT another buyer's", async () => {
      const sessionA = await insertSession(buyerAId)
      const sessionB = await insertSession(buyerBId)
      const orderA = await insertOrder(sessionA, storeS1Id, buyerAId)
      const orderB = await insertOrder(sessionB, storeS1Id, buyerBId)

      const aOwn = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderA)),
      )
      expect(aOwn).toHaveLength(1)

      const aReadingB = await withTenant(
        handle.db,
        { userId: buyerAId, userRole: "buyer" },
        async (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderB)),
      )
      expect(aReadingB).toHaveLength(0)
    })

    it("7: seller_owner SELECTs orders for own store; cannot SELECT another store's", async () => {
      const sessionA = await insertSession(buyerAId)
      const sessionB = await insertSession(buyerBId)
      const orderS1 = await insertOrder(sessionA, storeS1Id, buyerAId)
      const orderS2 = await insertOrder(sessionB, storeS2Id, buyerBId)

      const uReadingOwn = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "seller_owner" },
        async (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderS1)),
      )
      expect(uReadingOwn).toHaveLength(1)

      const uReadingOther = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "seller_owner" },
        async (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderS2)),
      )
      expect(uReadingOther).toHaveLength(0)
    })

    it("8: staff (bomy_admin / bomy_ops / bomy_finance via withTenant) SELECT all orders", async () => {
      const sessionA = await insertSession(buyerAId)
      const sessionB = await insertSession(buyerBId)
      const orderS1 = await insertOrder(sessionA, storeS1Id, buyerAId)
      const orderS2 = await insertOrder(sessionB, storeS2Id, buyerBId)
      const staff: { id: string; role: UserRole }[] = [
        { id: opsId, role: "bomy_ops" },
        { id: adminId, role: "bomy_admin" },
        { id: financeId, role: "bomy_finance" },
      ]
      for (const { id, role } of staff) {
        const rows = await withTenant(handle.db, { userId: id, userRole: role }, async (tx) =>
          tx.select({ id: orders.id }).from(orders),
        )
        const ids = rows.map((r) => r.id)
        expect(ids).toContain(orderS1)
        expect(ids).toContain(orderS2)
      }
    })
  })

  // ─── 3. RLS — writes denied under withTenant (test 9) ────────────────

  describe("RLS — writes admin-bypass only (test 9)", () => {
    const allRoles: { id: () => string; role: UserRole }[] = [
      { id: () => buyerAId, role: "buyer" },
      { id: () => ownerUId, role: "seller_owner" },
      { id: () => opsId, role: "bomy_ops" },
      { id: () => adminId, role: "bomy_admin" },
      { id: () => financeId, role: "bomy_finance" },
    ]

    it("INSERT into orders/order_items/order_payouts/processed_webhook_events is denied for every tenant role", async () => {
      const sessionId = await insertSession(buyerAId)
      // Need a seeded order so order_items / order_payouts INSERT attempts have something to FK against.
      const orderId = await insertOrder(sessionId, storeS1Id, buyerAId)

      for (const { id, role } of allRoles) {
        const userId = id()
        // orders
        await expect(
          withTenant(handle.db, { userId, userRole: role }, async (tx) => {
            await tx.insert(orders).values(validOrderRow(sessionId, storeS1Id, buyerAId))
          }),
        ).rejects.toThrow()
        // order_items
        await expect(
          withTenant(handle.db, { userId, userRole: role }, async (tx) => {
            await tx.insert(orderItems).values({
              orderId,
              storeId: storeS1Id,
              variantId: variantV1Id,
              productSnapshot: {},
              variantSnapshot: {},
              quantity: 1,
              unitPriceSen: 5000n,
              lineTotalSen: 5000n,
            })
          }),
        ).rejects.toThrow()
        // order_payouts — note Bob R0: even bomy_admin/bomy_finance under withTenant
        // are denied. Writes must go through withAdmin to land the audit row.
        await expect(
          withTenant(handle.db, { userId, userRole: role }, async (tx) => {
            await tx.insert(orderPayouts).values({
              orderId,
              amountSen: 4000n,
              triggeredBy: SYSTEM_ACTOR,
            })
          }),
        ).rejects.toThrow()
        // processed_webhook_events
        await expect(
          withTenant(handle.db, { userId, userRole: role }, async (tx) => {
            await tx.insert(processedWebhookEvents).values({
              pspProvider: "hitpay",
              pspEventId: `evt-${randomUUID()}`,
              eventType: "payment_request.completed",
              payloadHash: "deadbeef",
            })
          }),
        ).rejects.toThrow()
      }
    })

    it("UPDATE / DELETE on every table is denied (silent 0-row return) for every tenant role — incl. processed_webhook_events append-only", async () => {
      const sessionId = await insertSession(buyerAId)
      const orderId = await insertOrder(sessionId, storeS1Id, buyerAId)
      const orderItemId = randomUUID()
      const orderPayoutId = randomUUID()
      const eventId = randomUUID()
      const eventPspId = `evt-${eventId}`

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "test 9 update/delete seed" },
        async (tx) => {
          await tx.insert(orderItems).values({
            id: orderItemId,
            orderId,
            storeId: storeS1Id,
            variantId: variantV1Id,
            productSnapshot: { initial: true },
            variantSnapshot: { initial: true },
            quantity: 1,
            unitPriceSen: 5000n,
            lineTotalSen: 5000n,
          })
          await tx.insert(orderPayouts).values({
            id: orderPayoutId,
            orderId,
            amountSen: 4000n,
            triggeredBy: SYSTEM_ACTOR,
          })
          await tx.insert(processedWebhookEvents).values({
            id: eventId,
            pspProvider: "hitpay",
            pspEventId: eventPspId,
            eventType: "payment_request.completed",
            payloadHash: "deadbeef",
          })
        },
      )

      for (const { id, role } of allRoles) {
        const userId = id()

        // orders
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .update(orders)
              .set({ fulfilmentStatus: "shipped" })
              .where(eq(orders.id, orderId))
              .returning({ id: orders.id }),
          ),
        ).toHaveLength(0)
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx.delete(orders).where(eq(orders.id, orderId)).returning({ id: orders.id }),
          ),
        ).toHaveLength(0)

        // order_items
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .update(orderItems)
              .set({ productSnapshot: { tampered: true } })
              .where(eq(orderItems.id, orderItemId))
              .returning({ id: orderItems.id }),
          ),
        ).toHaveLength(0)
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .delete(orderItems)
              .where(eq(orderItems.id, orderItemId))
              .returning({ id: orderItems.id }),
          ),
        ).toHaveLength(0)

        // order_payouts — even bomy_admin/bomy_finance under withTenant are denied.
        // PR #33's admin UI must call withAdmin to land the audit row (Bob B3).
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .update(orderPayouts)
              .set({ status: "completed" })
              .where(eq(orderPayouts.id, orderPayoutId))
              .returning({ id: orderPayouts.id }),
          ),
        ).toHaveLength(0)
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .delete(orderPayouts)
              .where(eq(orderPayouts.id, orderPayoutId))
              .returning({ id: orderPayouts.id }),
          ),
        ).toHaveLength(0)

        // processed_webhook_events — append-only by RLS (no UPDATE/DELETE
        // policies at all). Every role's attempts must silently no-op.
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .update(processedWebhookEvents)
              .set({ eventType: "tampered" })
              .where(eq(processedWebhookEvents.id, eventId))
              .returning({ id: processedWebhookEvents.id }),
          ),
        ).toHaveLength(0)
        expect(
          await withTenant(handle.db, { userId, userRole: role }, async (tx) =>
            tx
              .delete(processedWebhookEvents)
              .where(eq(processedWebhookEvents.id, eventId))
              .returning({ id: processedWebhookEvents.id }),
          ),
        ).toHaveLength(0)
      }

      // Verify every seeded row survived intact and unchanged.
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "verify intact" }, async (tx) => {
        const ord = await tx
          .select({
            fulfilment: orders.fulfilmentStatus,
            payment: orders.paymentStatus,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
        expect(ord[0]?.fulfilment).toBe("processing")
        expect(ord[0]?.payment).toBe("paid")

        const item = await tx
          .select({ snapshot: orderItems.productSnapshot })
          .from(orderItems)
          .where(eq(orderItems.id, orderItemId))
        expect(item[0]?.snapshot).toEqual({ initial: true })

        const payout = await tx
          .select({ status: orderPayouts.status })
          .from(orderPayouts)
          .where(eq(orderPayouts.id, orderPayoutId))
        expect(payout[0]?.status).toBe("pending")

        const event = await tx
          .select({ eventType: processedWebhookEvents.eventType })
          .from(processedWebhookEvents)
          .where(eq(processedWebhookEvents.id, eventId))
        expect(event[0]?.eventType).toBe("payment_request.completed")
      })
    })
  })

  // ─── 4. processed_webhook_events visibility (test 10) ────────────────

  describe("processed_webhook_events admin-only", () => {
    it("10: not readable under any withTenant context; readable under withAdmin", async () => {
      const eventId = `evt-${randomUUID()}`
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed event" }, async (tx) => {
        await tx.insert(processedWebhookEvents).values({
          pspProvider: "hitpay",
          pspEventId: eventId,
          eventType: "payment_request.completed",
          payloadHash: "deadbeef",
        })
      })

      const roles: { id: string; role: UserRole }[] = [
        { id: buyerAId, role: "buyer" },
        { id: ownerUId, role: "seller_owner" },
        { id: opsId, role: "bomy_ops" },
        { id: adminId, role: "bomy_admin" },
        { id: financeId, role: "bomy_finance" },
      ]
      for (const { id, role } of roles) {
        const rows = await withTenant(handle.db, { userId: id, userRole: role }, async (tx) =>
          tx
            .select({ id: processedWebhookEvents.id })
            .from(processedWebhookEvents)
            .where(eq(processedWebhookEvents.pspEventId, eventId)),
        )
        expect(rows).toHaveLength(0)
      }

      const adminRows = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "read event" },
        async (tx) =>
          tx
            .select({ id: processedWebhookEvents.id })
            .from(processedWebhookEvents)
            .where(eq(processedWebhookEvents.pspEventId, eventId)),
      )
      expect(adminRows).toHaveLength(1)
    })
  })

  // ─── 5. Bob regression tests (10a / 10b / 10c) ───────────────────────

  describe("Bob regressions", () => {
    it("10a: default-deny restrictive — no tenant context AND no admin bypass returns 0 rows on all 4 tables", async () => {
      // Seed one row in each table under withAdmin first so we have something to NOT see.
      const sessionId = await insertSession(buyerAId)
      const orderId = await insertOrder(sessionId, storeS1Id, buyerAId)
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "10a seed" }, async (tx) => {
        await tx.insert(orderItems).values({
          orderId,
          storeId: storeS1Id,
          variantId: variantV1Id,
          productSnapshot: {},
          variantSnapshot: {},
          quantity: 1,
          unitPriceSen: 5000n,
          lineTotalSen: 5000n,
        })
        await tx.insert(orderPayouts).values({
          orderId,
          amountSen: 4000n,
          triggeredBy: SYSTEM_ACTOR,
        })
        await tx.insert(processedWebhookEvents).values({
          pspProvider: "hitpay",
          pspEventId: `evt-${randomUUID()}`,
          eventType: "payment_request.completed",
          payloadHash: "deadbeef",
        })
      })

      // Now read each table via handle.db directly — no withTenant, no withAdmin.
      // Transaction-local set_config from the seed has cleared on commit; this
      // query runs with no app.current_user_id and no app.bypass_rls, so the
      // RESTRICTIVE default_deny policy USING (IS NOT NULL OR is_admin_bypass())
      // evaluates false → 0 rows. (Regression for the USING (false) bug.)
      const ord = await handle.db.select({ id: orders.id }).from(orders)
      expect(ord).toHaveLength(0)
      const items = await handle.db.select({ id: orderItems.id }).from(orderItems)
      expect(items).toHaveLength(0)
      const payouts = await handle.db.select({ id: orderPayouts.id }).from(orderPayouts)
      expect(payouts).toHaveLength(0)
      const events = await handle.db
        .select({ id: processedWebhookEvents.id })
        .from(processedWebhookEvents)
      expect(events).toHaveLength(0)
    })

    it("10b: order_payouts role-predicate guard — buyer-context store owner CANNOT see payouts; seller_owner CAN", async () => {
      // ownerUId owns storeS1Id. Seed order + payout under storeS1.
      const sessionId = await insertSession(buyerAId)
      const orderId = await insertOrder(sessionId, storeS1Id, buyerAId)
      const payoutId = randomUUID()
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "10b seed" }, async (tx) => {
        await tx.insert(orderPayouts).values({
          id: payoutId,
          orderId,
          amountSen: 4000n,
          triggeredBy: SYSTEM_ACTOR,
        })
      })

      // ownerU under buyer context: SHOULD NOT see the payout.
      const asBuyer = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "buyer" },
        async (tx) =>
          tx
            .select({ id: orderPayouts.id })
            .from(orderPayouts)
            .where(eq(orderPayouts.id, payoutId)),
      )
      expect(asBuyer).toHaveLength(0)

      // ownerU under seller_owner context: SHOULD see the payout.
      const asSeller = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "seller_owner" },
        async (tx) =>
          tx
            .select({ id: orderPayouts.id })
            .from(orderPayouts)
            .where(eq(orderPayouts.id, payoutId)),
      )
      expect(asSeller).toHaveLength(1)
    })

    it("10c: orders + order_items role-predicate guard — store owner in buyer context CANNOT see other buyers' orders/items for their store; seller_owner CAN", async () => {
      // ownerUId owns storeS1Id. buyerB places an order against S1.
      const sessionB = await insertSession(buyerBId)
      const orderId = await insertOrder(sessionB, storeS1Id, buyerBId)
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "10c seed item" }, async (tx) => {
        await tx.insert(orderItems).values({
          orderId,
          storeId: storeS1Id,
          variantId: variantV1Id,
          productSnapshot: {},
          variantSnapshot: {},
          quantity: 1,
          unitPriceSen: 5000n,
          lineTotalSen: 5000n,
        })
      })

      // ownerU under buyer context: must NOT see B's order or its items even
      // though U owns S1. (Bob B2: role predicate prevents context-bleed.)
      const ordAsBuyer = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "buyer" },
        async (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)),
      )
      expect(ordAsBuyer).toHaveLength(0)
      const itemsAsBuyer = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "buyer" },
        async (tx) =>
          tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId)),
      )
      expect(itemsAsBuyer).toHaveLength(0)

      // ownerU under seller_owner context: SHOULD see both.
      const ordAsSeller = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "seller_owner" },
        async (tx) => tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)),
      )
      expect(ordAsSeller).toHaveLength(1)
      const itemsAsSeller = await withTenant(
        handle.db,
        { userId: ownerUId, userRole: "seller_owner" },
        async (tx) =>
          tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId)),
      )
      expect(itemsAsSeller).toHaveLength(1)
    })
  })
})
