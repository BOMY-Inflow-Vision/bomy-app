"use server"

import { and, eq, inArray } from "drizzle-orm"

import { makeDb, schema, withAdmin, withTenant, type UserRole } from "@bomy/db"

import { auth } from "@/auth"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

type Result = { ok: true } | { ok: false; error: "UNAUTHENTICATED" | "NOT_FOUND" }

async function resolveStoreId(userId: string, userRole: UserRole): Promise<string | null> {
  if (userRole !== "seller_owner") return null
  const db = getDb()
  const rows = await withTenant(db, { userId, userRole }, async (tx) =>
    tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, userId))
      .limit(1),
  )
  return rows[0]?.id ?? null
}

export async function enterTracking(
  orderId: string,
  carrier: string,
  trackingNumber: string,
): Promise<Result> {
  const session = await auth()
  if (!session) return { ok: false, error: "UNAUTHENTICATED" }
  const userId = session.user.id

  const storeId = await resolveStoreId(userId, session.user.role)
  if (!storeId) return { ok: false, error: "NOT_FOUND" }

  const db = getDb()
  const result = await withAdmin(db, { userId, reason: "seller enterTracking" }, async (tx) => {
    // Lock the row and read current status to decide whether this is first ship
    const [order] = await tx
      .select({ fulfilmentStatus: schema.orders.fulfilmentStatus })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.storeId, storeId)))
      .for("update")
      .limit(1)

    if (!order) return []
    if (!["processing", "shipped"].includes(order.fulfilmentStatus)) return []

    const isFirstShip = order.fulfilmentStatus === "processing"

    // Atomic update: WHERE includes storeId + status guard
    return tx
      .update(schema.orders)
      .set({
        fulfilmentStatus: "shipped",
        carrier,
        trackingNumber,
        ...(isFirstShip ? { shippedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.storeId, storeId),
          inArray(schema.orders.fulfilmentStatus, ["processing", "shipped"]),
        ),
      )
      .returning({ id: schema.orders.id })
  })

  if (result.length === 0) return { ok: false, error: "NOT_FOUND" }
  return { ok: true }
}

export async function markDelivered(orderId: string): Promise<Result> {
  const session = await auth()
  if (!session) return { ok: false, error: "UNAUTHENTICATED" }
  const userId = session.user.id

  const storeId = await resolveStoreId(userId, session.user.role)
  if (!storeId) return { ok: false, error: "NOT_FOUND" }

  const db = getDb()
  const result = await withAdmin(db, { userId, reason: "seller markDelivered" }, async (tx) =>
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
          eq(schema.orders.storeId, storeId),
          eq(schema.orders.fulfilmentStatus, "shipped"),
        ),
      )
      .returning({ id: schema.orders.id }),
  )

  if (result.length === 0) return { ok: false, error: "NOT_FOUND" }
  return { ok: true }
}
