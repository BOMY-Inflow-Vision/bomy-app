"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { getProvider, isPspRequestError, pspRef } from "@bomy/psp"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"

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

// Duplicate charges are refunded on the provider that took the payment (design Invariant 2).
// Only HitPay rows exist until PR 4; a non-HitPay row is released untouched below.
const REFUND_PSP = "hitpay" as const

export async function refundDuplicateCharge(id: string): Promise<Result> {
  let adminId: string
  try {
    adminId = await requireAdminId({ roles: PAYOUT_ROLES })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  // Check the provider is configured BEFORE the CAS so a missing-env error leaves the
  // row untouched (stays 'detected') instead of claiming it with no way to contact the PSP.
  const provider = getProvider(REFUND_PSP)
  if (!provider.isConfigured()) {
    throw new Error("HITPAY_API_KEY and HITPAY_API_URL are required")
  }

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
          pspProvider: schema.duplicateCharges.pspProvider,
          pspPaymentId: schema.duplicateCharges.pspPaymentId,
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
  const paymentId =
    row.pspProvider === REFUND_PSP
      ? pspRef(row.pspProvider, row.pspPaymentId, row.hitpayPaymentId)
      : null
  if (paymentId === null) {
    // A non-HitPay (Stripe) row, or one with no payment id, cannot be refunded here yet.
    // Unreachable until Stripe duplicates exist (every HitPay row carries the id); release the
    // claim untouched so nothing is stuck in refund_pending.
    await withAdmin(
      getDb(),
      { userId: adminId, reason: "revert duplicate charge refund (no HitPay payment id)" },
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
  try {
    const refund = await provider.refund({
      pspPaymentId: paymentId,
      amountSen: row.amountSen,
      reason: "Duplicate subscription charge",
      idempotencyKey: `dup_refund:${row.id}`,
    })
    await withAdmin(
      getDb(),
      { userId: adminId, reason: "store duplicate charge refund id" },
      async (tx) =>
        tx
          .update(schema.duplicateCharges)
          // HitPay dual-write (design §4.1): the HitPay webhook still correlates on
          // hitpay_refund_id; psp_refund_id is the provider-neutral copy.
          .set({ hitpayRefundId: refund.pspRefundId, pspRefundId: refund.pspRefundId })
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
    if (isPspRequestError(err)) {
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
