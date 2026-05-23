import { schema, withAdmin } from "@bomy/db"
import { eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { FastifyInstance } from "fastify"

import type { NotificationDescriptor, OrderPaidDescriptor } from "./types.js"

export function parseOpsEmails(env: NodeJS.ProcessEnv): string[] {
  return (env["OPS_ALERT_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`)
}

function senToMyrStr(sen: bigint): string {
  const whole = sen / 100n
  const cents = sen % 100n
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

async function send(
  app: FastifyInstance,
  opts: { to: string | string[]; subject: string; text: string },
  meta: { type: string; sessionId: string },
): Promise<void> {
  try {
    await app.mailer.sendMail(opts)
  } catch (err) {
    app.log.error({ err, type: meta.type, sessionId: meta.sessionId }, "email_notification_failed")
  }
}

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

async function dispatchOrderPaid(
  d: OrderPaidDescriptor,
  app: FastifyInstance,
  appUrl: string,
): Promise<void> {
  const buyerUser = alias(schema.users, "buyer_user")
  const sellerUser = alias(schema.users, "seller_user")

  const rows = await withAdmin(
    app.db.db,
    { userId: SYSTEM_ACTOR, reason: "notification: order_paid email dispatch" },
    async (tx) =>
      tx
        .select({
          orderId: schema.orders.id,
          storeId: schema.orders.storeId,
          storeName: schema.stores.name,
          sellerPayoutSen: schema.orders.sellerPayoutSen,
          buyerEmail: buyerUser.email,
          sellerEmail: sellerUser.email,
        })
        .from(schema.orders)
        .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
        .innerJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
        .innerJoin(sellerUser, eq(schema.stores.ownerId, sellerUser.id))
        .where(inArray(schema.orders.id, d.orderIds)),
  )

  if (rows.length === 0) return

  const buyerEmail = rows[0]!.buyerEmail
  const ordersUrl = joinUrl(appUrl, "/account/orders")

  const storeLines = rows
    .map((r) => `${r.storeName}: RM ${senToMyrStr(r.sellerPayoutSen)}`)
    .join("\n")
  const buyerBody = d.voucherClaimFailed
    ? `Your BOMY order is confirmed.\n\n${storeLines}\n\nNote: your voucher could not be applied and is under review. We'll contact you shortly.\n\nView your orders: ${ordersUrl}`
    : `Your BOMY order is confirmed.\n\n${storeLines}\n\nView your orders: ${ordersUrl}`

  await send(
    app,
    { to: buyerEmail, subject: "Your BOMY order is confirmed", text: buyerBody },
    { type: d.type, sessionId: d.sessionId },
  )

  const sellersDone = new Set<string>()
  for (const row of rows) {
    if (sellersDone.has(row.storeId)) continue
    sellersDone.add(row.storeId)

    const sellerOrdersUrl = joinUrl(appUrl, "/seller/dashboard/orders")
    const sellerBody = `You have a new order on ${row.storeName}.\n\nPayout amount: RM ${senToMyrStr(row.sellerPayoutSen)}\n\nView your orders: ${sellerOrdersUrl}`

    await send(
      app,
      { to: row.sellerEmail, subject: "New order received on BOMY", text: sellerBody },
      { type: d.type, sessionId: d.sessionId },
    )
  }
}

export async function dispatchOrderNotifications(
  descriptors: NotificationDescriptor[],
  app: FastifyInstance,
): Promise<void> {
  const appUrl = process.env["APP_URL"] ?? ""
  const adminUrl = process.env["ADMIN_URL"] ?? ""
  const opsEmails = parseOpsEmails(process.env)

  for (const d of descriptors) {
    if (d.type === "order_paid") {
      await dispatchOrderPaid(d, app, appUrl)
      continue
    }

    if (d.type === "order_failed") {
      const userRows = await withAdmin(
        app.db.db,
        { userId: SYSTEM_ACTOR, reason: "notification: order_failed email dispatch" },
        async (tx) =>
          tx
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, d.buyerId))
            .limit(1),
      )
      const buyerEmail = userRows[0]?.email
      if (buyerEmail) {
        const cartUrl = joinUrl(appUrl, "/cart")
        await send(
          app,
          {
            to: buyerEmail,
            subject: "Your BOMY payment could not be processed",
            text: `We were unable to process your payment. You can try again at ${cartUrl}.`,
          },
          { type: d.type, sessionId: d.sessionId },
        )
      }
      continue
    }

    if (d.type === "order_review") {
      if (opsEmails.length === 0) {
        app.log.info(
          { type: d.type, sessionId: d.sessionId, reason: "missing_ops_recipients" },
          "email_notification_skipped",
        )
        continue
      }
      const adminLink = joinUrl(adminUrl, `/checkout-sessions/${d.sessionId}`)
      await send(
        app,
        {
          to: opsEmails,
          subject: `[BOMY Ops] Payment review required — ${d.reason}`,
          text: `Session: ${d.sessionId}\nReason: ${d.reason}\nAdmin: ${adminLink}`,
        },
        { type: d.type, sessionId: d.sessionId },
      )
      continue
    }

    if (d.type === "voucher_claim_failed") {
      if (opsEmails.length === 0) {
        app.log.info(
          { type: d.type, sessionId: d.sessionId, reason: "missing_ops_recipients" },
          "email_notification_skipped",
        )
        continue
      }
      const adminLink = joinUrl(adminUrl, `/checkout-sessions/${d.sessionId}`)
      await send(
        app,
        {
          to: opsEmails,
          subject: `[BOMY Ops] Voucher claim failed for session ${d.sessionId}`,
          text: `Session: ${d.sessionId}\nVoucher: ${d.voucherId}\nAction required: reconcile voucher manually.\nAdmin: ${adminLink}`,
        },
        { type: d.type, sessionId: d.sessionId },
      )
    }
  }
}
