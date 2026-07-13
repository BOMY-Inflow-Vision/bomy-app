"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { HitPayClient, HitPayError } from "@bomy/hitpay"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { senToMyr } from "@/lib/money"

const PAYOUT_ROLES = ["bomy_admin", "bomy_finance"] as const

type Result =
  | { ok: true }
  | {
      ok: false
      error:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "ALREADY_PROCESSING"
        | "REFUND_FAILED"
        | "REFUND_OUTCOME_UNKNOWN"
    }

function hitpayClient(): HitPayClient {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!apiUrl) throw new Error("HITPAY_API_URL is required")
  return new HitPayClient({ apiKey, baseUrl: apiUrl })
}

export async function refundDuplicateCharge(id: string): Promise<Result> {
  let adminId: string
  try {
    adminId = await requireAdminId({ roles: PAYOUT_ROLES })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  // Construct the HitPay client BEFORE the CAS so a missing-env error leaves the
  // row untouched (stays 'detected') instead of claiming it with no way to contact HitPay.
  const client = hitpayClient()

  // CAS the row to refund_pending BEFORE any external call. Closes the
  // double-click / double-refund window: only one caller can flip detected→pending.
  const claimed = await withAdmin(
    getDb(),
    { userId: adminId, reason: "claim duplicate charge for refund" },
    async (tx) =>
      tx
        .update(schema.duplicateCharges)
        .set({ status: "refund_pending", resolvedBy: adminId })
        .where(
          and(eq(schema.duplicateCharges.id, id), eq(schema.duplicateCharges.status, "detected")),
        )
        .returning({
          id: schema.duplicateCharges.id,
          hitpayPaymentId: schema.duplicateCharges.hitpayPaymentId,
          amountSen: schema.duplicateCharges.amountSen,
        }),
  )

  if (claimed.length === 0) {
    // Either it does not exist or it is no longer 'detected' (already handled).
    const exists = await withAdmin(
      getDb(),
      { userId: adminId, reason: "check duplicate charge existence" },
      async (tx) =>
        tx
          .select({ id: schema.duplicateCharges.id })
          .from(schema.duplicateCharges)
          .where(eq(schema.duplicateCharges.id, id))
          .limit(1),
    )
    return { ok: false, error: exists.length === 0 ? "NOT_FOUND" : "ALREADY_PROCESSING" }
  }

  const row = claimed[0]!
  try {
    const refund = await client.createRefund({
      payment_id: row.hitpayPaymentId,
      amount: senToMyr(row.amountSen),
      reason: "Duplicate subscription charge",
    })
    await withAdmin(
      getDb(),
      { userId: adminId, reason: "store duplicate charge refund id" },
      async (tx) =>
        tx
          .update(schema.duplicateCharges)
          .set({ hitpayRefundId: refund.id })
          .where(
            and(
              eq(schema.duplicateCharges.id, row.id),
              eq(schema.duplicateCharges.status, "refund_pending"),
            ),
          ),
    )
    revalidatePath("/payouts/reconciliation")
    return { ok: true }
  } catch (err) {
    if (err instanceof HitPayError) {
      // Definite API rejection — the refund was NOT issued. Revert so an admin can retry.
      await withAdmin(
        getDb(),
        { userId: adminId, reason: "revert duplicate charge refund (HitPay rejected)" },
        async (tx) =>
          tx
            .update(schema.duplicateCharges)
            .set({ status: "detected", resolvedBy: null })
            .where(
              and(
                eq(schema.duplicateCharges.id, row.id),
                eq(schema.duplicateCharges.status, "refund_pending"),
              ),
            ),
      )
      return { ok: false, error: "REFUND_FAILED" }
    }
    // Unknown/network error — outcome indeterminate. Leave it refund_pending for
    // manual verification; do NOT revert (we cannot prove no charge was refunded).
    // Return (do not throw) so the client button shows an error instead of crashing.
    console.error("refundDuplicateCharge: HitPay refund outcome unknown", { id: row.id, err })
    revalidatePath("/payouts/reconciliation")
    return { ok: false, error: "REFUND_OUTCOME_UNKNOWN" }
  }
}
