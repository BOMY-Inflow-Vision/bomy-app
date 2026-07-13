"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"

type Result = { ok: true } | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" }

export async function resolvePaymentReview(sessionId: string, note: string): Promise<Result> {
  let userId: string
  try {
    userId = await requireAdminId({ roles: ["bomy_admin", "bomy_ops"] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  const result = await withAdmin(
    getDb(),
    { userId, reason: "admin resolvePaymentReview" },
    async (tx) =>
      tx
        .update(schema.checkoutSessions)
        .set({
          status: "payment_review_resolved",
          resolvedBy: userId,
          resolutionNote: note,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.checkoutSessions.id, sessionId),
            eq(schema.checkoutSessions.status, "payment_review_required"),
          ),
        )
        .returning({ id: schema.checkoutSessions.id }),
  )

  if (result.length === 0) return { ok: false, error: "NOT_FOUND" }
  revalidatePath(`/checkout-sessions/${sessionId}`)
  return { ok: true }
}
