import { describe, expect, it, vi } from "vitest"
import type { FastifyInstance } from "fastify"
import { dispatchOrderNotifications } from "../../src/notifications/order.js"
import type { NotificationDescriptor } from "../../src/notifications/types.js"

describe("dispatchOrderNotifications", () => {
  it("order_review: logs email_notification_skipped when OPS_ALERT_EMAILS is unset", async () => {
    const infoLog = vi.fn()
    const app = {
      mailer: { sendMail: vi.fn(), close: vi.fn() },
      log: { error: vi.fn(), info: infoLog },
      db: { db: {} },
    } as unknown as FastifyInstance

    const saved = process.env["OPS_ALERT_EMAILS"]
    delete process.env["OPS_ALERT_EMAILS"]

    const descriptor: NotificationDescriptor = {
      type: "order_review",
      sessionId: "sess-1",
      reason: "amount_mismatch",
    }
    await dispatchOrderNotifications([descriptor], app)

    expect(infoLog).toHaveBeenCalledOnce()
    const logObj = infoLog.mock.calls[0]![0] as Record<string, unknown>
    const logMsg = infoLog.mock.calls[0]![1] as string
    expect(logMsg).toBe("email_notification_skipped")
    expect(logObj["reason"]).toBe("missing_ops_recipients")

    if (saved !== undefined) process.env["OPS_ALERT_EMAILS"] = saved
  })

  it("voucher_claim_failed: logs email_notification_skipped when OPS_ALERT_EMAILS is unset", async () => {
    const infoLog = vi.fn()
    const app = {
      mailer: { sendMail: vi.fn(), close: vi.fn() },
      log: { error: vi.fn(), info: infoLog },
      db: { db: {} },
    } as unknown as FastifyInstance

    const saved = process.env["OPS_ALERT_EMAILS"]
    delete process.env["OPS_ALERT_EMAILS"]

    const descriptor: NotificationDescriptor = {
      type: "voucher_claim_failed",
      sessionId: "sess-2",
      voucherId: "v-1",
    }
    await dispatchOrderNotifications([descriptor], app)

    expect(infoLog).toHaveBeenCalledOnce()
    expect(infoLog.mock.calls[0]![1]).toBe("email_notification_skipped")

    if (saved !== undefined) process.env["OPS_ALERT_EMAILS"] = saved
  })

  it("per-send failure isolation: one sendMail throw logs email_notification_failed and continues", async () => {
    const errorLog = vi.fn()
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValue(undefined)

    const savedOps = process.env["OPS_ALERT_EMAILS"]
    const savedAdmin = process.env["ADMIN_URL"]
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"

    const app = {
      mailer: { sendMail, close: vi.fn() },
      log: { error: errorLog, info: vi.fn() },
      db: { db: {} },
    } as unknown as FastifyInstance

    const descriptors: NotificationDescriptor[] = [
      { type: "order_review", sessionId: "sess-a", reason: "amount_mismatch" },
      { type: "order_review", sessionId: "sess-b", reason: "invalid_commission_config" },
    ]
    await dispatchOrderNotifications(descriptors, app)

    // Both sends were attempted
    expect(sendMail).toHaveBeenCalledTimes(2)

    // First failure was logged
    expect(errorLog).toHaveBeenCalledOnce()
    const logObj = errorLog.mock.calls[0]![0] as Record<string, unknown>
    const logMsg = errorLog.mock.calls[0]![1] as string
    expect(logMsg).toBe("email_notification_failed")
    expect(logObj["type"]).toBe("order_review")
    expect(logObj["sessionId"]).toBe("sess-a")
    // Body text MUST NOT appear in the log
    expect(JSON.stringify(logObj)).not.toContain("admin.bomy.my")

    if (savedOps !== undefined) process.env["OPS_ALERT_EMAILS"] = savedOps
    else delete process.env["OPS_ALERT_EMAILS"]
    if (savedAdmin !== undefined) process.env["ADMIN_URL"] = savedAdmin
    else delete process.env["ADMIN_URL"]
  })

  it("order_review: sends ops alert with correct subject when OPS_ALERT_EMAILS is set", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined)

    const savedOps = process.env["OPS_ALERT_EMAILS"]
    const savedAdmin = process.env["ADMIN_URL"]
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"

    const app = {
      mailer: { sendMail, close: vi.fn() },
      log: { error: vi.fn(), info: vi.fn() },
      db: { db: {} },
    } as unknown as FastifyInstance

    const descriptor: NotificationDescriptor = {
      type: "order_review",
      sessionId: "sess-x",
      reason: "amount_mismatch",
    }
    await dispatchOrderNotifications([descriptor], app)

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0] as { to: unknown; subject: string; text: string }
    expect(call.to).toEqual(["ops@bomy.my"])
    expect(call.subject).toContain("amount_mismatch")
    expect(call.subject).toContain("[BOMY Ops]")

    if (savedOps !== undefined) process.env["OPS_ALERT_EMAILS"] = savedOps
    else delete process.env["OPS_ALERT_EMAILS"]
    if (savedAdmin !== undefined) process.env["ADMIN_URL"] = savedAdmin
    else delete process.env["ADMIN_URL"]
  })
})

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("dispatchOrderNotifications — no-body logging (integration)", () => {
  it("email_notification_failed log does not include the email body", async () => {
    const { makeDb, schema, withAdmin } = await import("@bomy/db")
    const { dispatchOrderNotifications } = await import("../../src/notifications/order.js")
    const { randomUUID } = await import("node:crypto")
    const { eq } = await import("drizzle-orm")

    const db = makeDb({ url: DATABASE_URL as string })
    const errorLogs: object[] = []
    const buyerId = randomUUID()
    const sellerId = randomUUID()
    const storeId = randomUUID()
    const orderId = randomUUID()
    const sessionId = randomUUID()
    const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

    await withAdmin(
      db.db,
      { userId: SYSTEM_ACTOR, reason: "no-body-log test seed" },
      async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer" })
        await tx
          .insert(schema.users)
          .values({ id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" })
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "Test Store",
          slug: `slug-${storeId}`,
          status: "active",
        })
        await tx.insert(schema.checkoutSessions).values({
          id: sessionId,
          userId: buyerId,
          status: "paid",
          currency: "MYR",
          shippingAddress: {
            name: "T",
            phone: "+60123456789",
            line1: "1 Jln",
            city: "KL",
            postcode: "50000",
            state: "KL",
            country: "MY",
          },
          totalCatalogSen: 1000n,
          totalShippingSen: 0n,
          totalBuyerPaysSen: 1000n,
          expiresAt: new Date(Date.now() + 3600000),
        })
        await tx.insert(schema.orders).values({
          id: orderId,
          checkoutSessionId: sessionId,
          storeId,
          buyerId,
          currency: "MYR",
          shippingAddress: {
            name: "T",
            phone: "+60123456789",
            line1: "1 Jln",
            city: "KL",
            postcode: "50000",
            state: "KL",
            country: "MY",
          },
          shippingFeeSen: 0n,
          retailSubtotalSen: 1000n,
          brandDiscountSen: 0n,
          discountedSubtotalSen: 1000n,
          voucherContributionSen: 0n,
          pspFeeAllocatedSen: 30n,
          bomyCommissionSen: 243n,
          bomyCommissionPct: 25,
          sellerPayoutSen: 727n,
          paymentStatus: "paid",
          fulfilmentStatus: "processing",
        })
      },
    )

    // Mailer throws — triggers email_notification_failed log.
    const fakeApp = {
      db,
      mailer: { sendMail: vi.fn().mockRejectedValue(new Error("SMTP fail")), close: vi.fn() },
      log: {
        info: vi.fn(),
        error: (_obj: object, _msg: string) => {
          errorLogs.push(_obj)
        },
        warn: vi.fn(),
      },
    } as unknown as FastifyInstance

    await dispatchOrderNotifications(
      [{ type: "order_paid", sessionId, buyerId, orderIds: [orderId], voucherClaimFailed: false }],
      fakeApp,
    )

    // Verify error was logged.
    expect(errorLogs.length).toBeGreaterThan(0)
    // Verify body text is NOT in any log entry.
    for (const log of errorLogs) {
      const serialized = JSON.stringify(log)
      expect(serialized).not.toContain("confirmed") // body content
      expect(serialized).not.toContain("account/orders") // body URL
    }

    // Cleanup.
    await withAdmin(
      db.db,
      { userId: SYSTEM_ACTOR, reason: "no-body-log test cleanup" },
      async (tx) => {
        await tx.delete(schema.orders).where(eq(schema.orders.id, orderId))
        await tx.delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.id, sessionId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
      },
    )

    await db.close()
  })
})
