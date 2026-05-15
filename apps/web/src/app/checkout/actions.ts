"use server"

import { randomUUID } from "node:crypto"

import { and, eq, gt, isNull, sql } from "drizzle-orm"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { CheckoutError, type CheckoutErrorCode } from "@/lib/checkout-errors"
import { validateShippingAddress } from "@/lib/shipping-address-schema"

import {
  computeCheckoutTotals,
  fetchCheckoutContext,
  loadAvailableVouchers,
  loadContextForInitiation,
  type AvailableVoucher,
  type InvalidLineReason,
} from "./queries"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

// ───────────────────────────────────────────────────────────────────────
// Serialised return types
//
// React Server Components can serialise plain strings but NOT bigint over
// the action boundary. All money fields are returned as decimal-string sen
// (e.g. "2999"). The UI parses with BigInt(...) when arithmetic is needed
// or uses Number(...) / 100 for display.
// ───────────────────────────────────────────────────────────────────────

export type PreviewItemRow = {
  variantId: string
  storeId: string
  quantity: number
  lineTotalSen: string
  brandDiscountSen: string
  productSnapshot: unknown
  variantSnapshot: unknown
}

export type PreviewStoreRow = {
  storeId: string
  retailSubtotalSen: string
  brandDiscountSen: string
  discountedSubtotalSen: string
  voucherContributionSen: string
  shippingFeeSen: string
}

export type PreviewResult =
  | {
      ok: true
      invalidLines: Array<{ variantId: string; reason: InvalidLineReason }>
      itemRows: PreviewItemRow[]
      storeRows: PreviewStoreRow[]
      totalCatalogSen: string
      totalShippingSen: string
      voucherDiscountSen: string
      brandDiscountTotalSen: string
      totalBuyerPaysSen: string
      availableVouchers: AvailableVoucher[]
      voucherApplied: boolean
    }
  | {
      ok: false
      error: "INVALID_CART" | "TOTAL_NOT_PAYABLE"
      invalidLines: Array<{ variantId: string; reason: InvalidLineReason }>
      availableVouchers: AvailableVoucher[]
    }
  | { ok: false; error: "UNAUTHENTICATED" | "EMPTY_CART" }

export async function priceCheckoutPreview(input: {
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
}): Promise<PreviewResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }
  if (input.items.length === 0) return { ok: false, error: "EMPTY_CART" }

  const db = getDb()
  const ctx = await fetchCheckoutContext({
    db,
    buyerId: session.user.id,
    items: input.items,
    voucherId: input.voucherId,
  })

  const availableVouchers = await loadAvailableVouchers(db, session.user.id)

  if (ctx.invalidLines.length > 0) {
    return { ok: false, error: "INVALID_CART", invalidLines: ctx.invalidLines, availableVouchers }
  }

  const totals = computeCheckoutTotals({
    lines: ctx.validLines,
    storeShipping: ctx.storeShipping,
    brandSubs: ctx.brandSubs,
    voucher: ctx.voucher,
  })

  if (totals.totalBuyerPaysSen <= 0n) {
    return { ok: false, error: "TOTAL_NOT_PAYABLE", invalidLines: [], availableVouchers }
  }

  return {
    ok: true,
    invalidLines: [],
    itemRows: totals.itemRows.map((r) => ({
      variantId: r.variantId,
      storeId: r.storeId,
      quantity: r.quantity,
      lineTotalSen: r.lineTotalSen.toString(),
      brandDiscountSen: r.brandDiscountSen.toString(),
      productSnapshot: r.productSnapshot,
      variantSnapshot: r.variantSnapshot,
    })),
    storeRows: totals.storeRows.map((s) => ({
      storeId: s.storeId,
      retailSubtotalSen: s.retailSubtotalSen.toString(),
      brandDiscountSen: s.brandDiscountSen.toString(),
      discountedSubtotalSen: s.discountedSubtotalSen.toString(),
      voucherContributionSen: s.voucherContributionSen.toString(),
      shippingFeeSen: s.shippingFeeSen.toString(),
    })),
    totalCatalogSen: totals.totalCatalogSen.toString(),
    totalShippingSen: totals.totalShippingSen.toString(),
    voucherDiscountSen: totals.voucherDiscountSen.toString(),
    brandDiscountTotalSen: totals.brandDiscountTotalSen.toString(),
    totalBuyerPaysSen: totals.totalBuyerPaysSen.toString(),
    availableVouchers,
    voucherApplied: ctx.voucher !== null,
  }
}

// ───────────────────────────────────────────────────────────────────────
// readPlatformConfig — staff-only RLS, so we use withAdmin (audit per call)
// matches apps/web/src/app/(marketing)/membership/page.tsx pattern.
// Exported for reuse by /checkout server component shell.
// ───────────────────────────────────────────────────────────────────────

export async function readCheckoutEnabled(actorUserId?: string): Promise<boolean> {
  const db = getDb()
  const rows = await withAdmin(
    db,
    {
      userId: actorUserId ?? SYSTEM_ACTOR,
      reason: "read checkout_enabled gate",
    },
    async (tx) =>
      tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "checkout_enabled"))
        .limit(1),
  )
  return rows[0]?.value === true
}

// ───────────────────────────────────────────────────────────────────────
// initiateCheckout — Phase 1 only (Task 11).
//
// Pre-txn guards: auth → checkout_enabled gate → non-empty cart →
// shipping address. Then a single withAdmin transaction:
//
//   advisory_xact_lock(buyer) → single-pending guard →
//   loadContextForInitiation (FOR UPDATE on variants + voucher) →
//   computeCheckoutTotals → payable guard → insert session/items/stores →
//   atomic stock decrement (UPDATE … WHERE stock_count >= qty RETURNING) →
//   insert reservations → conditional voucher reservation
//
// All money fields stay as bigint server-side; the response shape carries
// only strings/booleans across the server-action boundary. Phase 1b
// (HitPay redirect + PSP-ref persistence + compensation triggers) lands
// in Task 12 — for now we return a placeholder redirect to /checkout/
// success?session=… so callers can be wired before HitPay is live.
// ───────────────────────────────────────────────────────────────────────

export type InitiateCheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: CheckoutErrorCode; details?: Record<string, unknown> }

export async function initiateCheckout(input: {
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
  shippingAddress: unknown
}): Promise<InitiateCheckoutResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }
  const buyerId = session.user.id

  if (!(await readCheckoutEnabled(buyerId))) {
    return { ok: false, error: "CHECKOUT_DISABLED" }
  }

  if (input.items.length === 0) return { ok: false, error: "EMPTY_CART" }

  const addressValidation = validateShippingAddress(input.shippingAddress)
  if (!addressValidation.ok) {
    return {
      ok: false,
      error: "INVALID_ADDRESS",
      details: { fieldErrors: addressValidation.errors },
    }
  }

  const sessionId = randomUUID()
  const db = getDb()

  try {
    await withAdmin(
      db,
      { userId: buyerId, reason: `checkout_initiation:${sessionId}` },
      async (tx) => {
        // Per-buyer advisory lock — serialises concurrent inits by the
        // same buyer. Different buyers get different hash keys and so
        // don't contend with each other.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('checkout:' || ${buyerId}::text))`,
        )

        const existing = await tx
          .select({ id: schema.checkoutSessions.id })
          .from(schema.checkoutSessions)
          .where(
            and(
              eq(schema.checkoutSessions.userId, buyerId),
              eq(schema.checkoutSessions.status, "pending_payment"),
              gt(schema.checkoutSessions.expiresAt, sql`now()`),
            ),
          )
          .limit(1)
        if (existing.length > 0) {
          throw new CheckoutError("PENDING_CHECKOUT_EXISTS", { sessionId: existing[0]!.id })
        }

        const ctx = await loadContextForInitiation({
          tx,
          buyerId,
          items: input.items,
          voucherId: input.voucherId,
        })

        if (ctx.invalidLines.length > 0) {
          throw new CheckoutError("INVALID_CART", { invalidLines: ctx.invalidLines })
        }
        if (input.voucherId && !ctx.voucher) {
          throw new CheckoutError("VOUCHER_UNAVAILABLE")
        }

        const totals = computeCheckoutTotals({
          lines: ctx.validLines,
          storeShipping: ctx.storeShipping,
          brandSubs: ctx.brandSubs,
          voucher: ctx.voucher,
        })

        if (totals.totalBuyerPaysSen <= 0n) {
          throw new CheckoutError("TOTAL_NOT_PAYABLE")
        }

        await tx.insert(schema.checkoutSessions).values({
          id: sessionId,
          userId: buyerId,
          status: "pending_payment",
          pspProvider: "hitpay",
          shippingAddress: addressValidation.value,
          voucherId: ctx.voucher ? input.voucherId : null,
          totalCatalogSen: totals.totalCatalogSen,
          totalShippingSen: totals.totalShippingSen,
          voucherDiscountSen: totals.voucherDiscountSen,
          brandDiscountTotalSen: totals.brandDiscountTotalSen,
          totalBuyerPaysSen: totals.totalBuyerPaysSen,
          expiresAt: sql`now() + interval '30 minutes'`,
        })

        await tx.insert(schema.checkoutSessionItems).values(
          totals.itemRows.map((r) => ({
            checkoutSessionId: sessionId,
            storeId: r.storeId,
            variantId: r.variantId,
            productSnapshot: r.productSnapshot,
            variantSnapshot: r.variantSnapshot,
            quantity: r.quantity,
            unitPriceSen: r.unitPriceSen,
            lineTotalSen: r.lineTotalSen,
            brandDiscountSen: r.brandDiscountSen,
          })),
        )

        await tx.insert(schema.checkoutSessionStores).values(
          totals.storeRows.map((s) => ({
            checkoutSessionId: sessionId,
            storeId: s.storeId,
            retailSubtotalSen: s.retailSubtotalSen,
            brandDiscountSen: s.brandDiscountSen,
            discountedSubtotalSen: s.discountedSubtotalSen,
            voucherContributionSen: s.voucherContributionSen,
            shippingFeeSen: s.shippingFeeSen,
          })),
        )

        // Atomic stock decrement per variant. The WHERE clause includes
        // stock_count >= qty so a concurrent decrement that drained the
        // inventory between Phase 1's read and this UPDATE causes the
        // RETURNING to be empty, surfacing as OUT_OF_STOCK_RACE.
        for (const line of totals.itemRows) {
          const r = await tx
            .update(schema.productVariants)
            .set({
              stockCount: sql`${schema.productVariants.stockCount} - ${line.quantity}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.productVariants.id, line.variantId),
                sql`${schema.productVariants.stockCount} >= ${line.quantity}`,
              ),
            )
            .returning({ id: schema.productVariants.id })
          if (r.length === 0) {
            throw new CheckoutError("OUT_OF_STOCK_RACE", { variantId: line.variantId })
          }
        }

        await tx.insert(schema.inventoryReservations).values(
          totals.itemRows.map((line) => ({
            variantId: line.variantId,
            checkoutSessionId: sessionId,
            quantity: line.quantity,
            expiresAt: sql`now() + interval '30 minutes'`,
          })),
        )

        if (ctx.voucher) {
          const r = await tx
            .update(schema.vouchers)
            .set({ reservedCheckoutSessionId: sessionId, reservedAt: new Date() })
            .where(
              and(
                eq(schema.vouchers.id, input.voucherId!),
                eq(schema.vouchers.userId, buyerId),
                isNull(schema.vouchers.redeemedAt),
                isNull(schema.vouchers.reservedCheckoutSessionId),
                gt(schema.vouchers.expiresAt, sql`now()`),
              ),
            )
            .returning({ id: schema.vouchers.id })
          if (r.length === 0) throw new CheckoutError("VOUCHER_RACE")
        }
      },
    )
  } catch (err) {
    if (err instanceof CheckoutError) {
      return { ok: false, error: err.code, details: err.details }
    }
    throw err
  }

  // Phase 1b lands in Task 12 (HitPay redirect + PSP-ref persistence).
  return { ok: true, redirectUrl: `/checkout/success?session=${sessionId}` }
}
