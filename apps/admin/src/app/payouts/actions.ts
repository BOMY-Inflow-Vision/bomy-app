"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { requireRole } from "@/lib/auth"
import { getDb } from "@/lib/db"

const PAYOUT_ROLES = ["bomy_admin", "bomy_finance"] as const

type CreateResult =
  | { ok: true; payoutId: string }
  | {
      ok: false
      error: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "NOT_PAYABLE" | "ALREADY_EXISTS"
    }

type ActionResult =
  | { ok: true }
  | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" }

export async function createPayoutRecord(orderId: string): Promise<CreateResult> {
  const session = await auth()
  let adminId: string
  try {
    adminId = requireRole(session, [...PAYOUT_ROLES])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin createPayoutRecord" },
    async (tx): Promise<CreateResult> => {
      // Lock the order row to serialize concurrent payout creation
      const [order] = await tx
        .select({
          fulfilmentStatus: schema.orders.fulfilmentStatus,
          sellerPayoutSen: schema.orders.sellerPayoutSen,
          currency: schema.orders.currency,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .for("update")
        .limit(1)

      if (!order || order.fulfilmentStatus !== "completed") {
        return { ok: false, error: "NOT_FOUND" }
      }
      if (order.sellerPayoutSen <= 0n) {
        return { ok: false, error: "NOT_PAYABLE" }
      }

      // Check for active (non-failed) payout
      const existing = await tx
        .select({ id: schema.orderPayouts.id })
        .from(schema.orderPayouts)
        .where(
          and(
            eq(schema.orderPayouts.orderId, orderId),
            inArray(schema.orderPayouts.status, ["pending", "processing", "completed"]),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        return { ok: false, error: "ALREADY_EXISTS" }
      }

      const [inserted] = await tx
        .insert(schema.orderPayouts)
        .values({
          orderId,
          amountSen: order.sellerPayoutSen,
          currency: order.currency,
          status: "pending",
          triggeredBy: adminId,
        })
        .returning({ id: schema.orderPayouts.id })

      return { ok: true, payoutId: inserted!.id }
    },
  )

  if (result.ok) revalidatePath("/payouts")
  return result
}

export async function markPayoutProcessing(payoutId: string): Promise<ActionResult> {
  const session = await auth()
  let adminId: string
  try {
    adminId = requireRole(session, [...PAYOUT_ROLES])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin markPayoutProcessing" },
    async (tx) =>
      tx
        .update(schema.orderPayouts)
        .set({ status: "processing" })
        .where(and(eq(schema.orderPayouts.id, payoutId), eq(schema.orderPayouts.status, "pending")))
        .returning({ id: schema.orderPayouts.id }),
  )

  if (rows.length === 0) return { ok: false, error: "NOT_FOUND" }
  revalidatePath("/payouts")
  return { ok: true }
}

export async function markPayoutCompleted(
  payoutId: string,
  manualRef: string,
): Promise<ActionResult> {
  const session = await auth()
  let adminId: string
  try {
    adminId = requireRole(session, [...PAYOUT_ROLES])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  if (!manualRef.trim()) return { ok: false, error: "INVALID_INPUT" }

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin markPayoutCompleted" },
    async (tx) =>
      tx
        .update(schema.orderPayouts)
        .set({ status: "completed", manualRef: manualRef.trim(), completedAt: new Date() })
        .where(
          and(
            eq(schema.orderPayouts.id, payoutId),
            inArray(schema.orderPayouts.status, ["pending", "processing"]),
          ),
        )
        .returning({ id: schema.orderPayouts.id }),
  )

  if (rows.length === 0) return { ok: false, error: "NOT_FOUND" }
  revalidatePath("/payouts")
  return { ok: true }
}

export async function markPayoutFailed(payoutId: string, notes: string): Promise<ActionResult> {
  const session = await auth()
  let adminId: string
  try {
    adminId = requireRole(session, [...PAYOUT_ROLES])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  if (!notes.trim()) return { ok: false, error: "INVALID_INPUT" }

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin markPayoutFailed" },
    async (tx) =>
      tx
        .update(schema.orderPayouts)
        .set({ status: "failed", reconciliationNotes: notes.trim() })
        .where(
          and(
            eq(schema.orderPayouts.id, payoutId),
            inArray(schema.orderPayouts.status, ["pending", "processing"]),
          ),
        )
        .returning({ id: schema.orderPayouts.id }),
  )

  if (rows.length === 0) return { ok: false, error: "NOT_FOUND" }
  revalidatePath("/payouts")
  return { ok: true }
}
