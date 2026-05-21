"use server"

import { and, eq } from "drizzle-orm"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

type Result = { ok: true } | { ok: false; error: "UNAUTHENTICATED" | "NOT_FOUND" }

export async function confirmDelivery(orderId: string): Promise<Result> {
  const session = await auth()
  if (!session) return { ok: false, error: "UNAUTHENTICATED" }
  const userId = session.user.id

  const db = getDb()
  const result = await withAdmin(db, { userId, reason: "buyer confirmDelivery" }, async (tx) =>
    tx
      .update(schema.orders)
      .set({
        fulfilmentStatus: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.buyerId, userId),
          eq(schema.orders.fulfilmentStatus, "shipped"),
        ),
      )
      .returning({ id: schema.orders.id }),
  )

  if (result.length === 0) return { ok: false, error: "NOT_FOUND" }
  return { ok: true }
}
