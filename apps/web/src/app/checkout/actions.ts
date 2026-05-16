"use server"

import { randomUUID } from "node:crypto"

import { and, eq, gt, isNull, sql } from "drizzle-orm"

import { makeDb, schema, withAdmin, withTenant, type CheckoutSessionStatus } from "@bomy/db"
import { HitPayClient, HitPayError, type PaymentRequestResponse } from "@bomy/hitpay"

import { auth } from "@/auth"
import { CheckoutError, type CheckoutErrorCode } from "@/lib/checkout-errors"
import { senToMyr } from "@/lib/money"
import { validateShippingAddress } from "@/lib/shipping-address-schema"

import { compensateInitiation } from "./compensate"
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

function hitpayClient(): HitPayClient {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  if (!apiKey) throw new Error("HITPAY_API_KEY is required")
  if (!apiUrl) throw new Error("HITPAY_API_URL is required")
  return new HitPayClient({ apiKey, baseUrl: apiUrl })
}

// Short, audit-friendly code derived from a HitPay error class name.
//   HitPayAuthError       → "auth"
//   HitPayValidationError → "validation"
//   HitPayNotFoundError   → "notfound"
//   HitPayRateLimitError  → "ratelimit"
//   plain HitPayError     → "error"
//   anything else         → "unknown"
function hitpayErrCode(err: unknown): string {
  if (err instanceof HitPayError) {
    const stripped = err.name
      .replace(/^HitPay/, "")
      .replace(/Error$/, "")
      .toLowerCase()
    return stripped || "error"
  }
  return "unknown"
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
// initiateCheckout — Phase 1 (Task 11) + Phase 1b (Task 12).
//
// Pre-txn guards: auth → checkout_enabled gate → non-empty cart →
// shipping address. Then a single withAdmin transaction (Phase 1):
//
//   advisory_xact_lock(buyer) → single-pending guard →
//   loadContextForInitiation (FOR UPDATE on variants + voucher) →
//   computeCheckoutTotals → payable guard → insert session/items/stores →
//   atomic stock decrement (UPDATE … WHERE stock_count >= qty RETURNING) →
//   insert reservations → conditional voucher reservation
//
// After commit, Phase 1b runs outside any transaction:
//
//   HitPay createPaymentRequest → Transaction 2: store PSP ref under
//   `WHERE status = 'pending_payment'` row-count guard → return HitPay
//   URL. Any failure (HitPay throw, T2 zero rows, T2 exception) triggers
//   compensateInitiation, which is idempotent so a concurrently-cancelled
//   session is handled safely.
//
// All money fields stay as bigint server-side; the response shape carries
// only strings/booleans across the server-action boundary.
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

  // Validate Phase 1b config BEFORE mutating any state. A missing env var
  // post-commit would leak a pending session + stock decrement + voucher
  // reservation because the throw would skip compensation.
  const webBaseUrl = process.env["WEB_BASE_URL"]
  const apiBaseUrl = process.env["API_BASE_URL"]
  if (!webBaseUrl) throw new Error("WEB_BASE_URL is required for checkout")
  if (!apiBaseUrl) throw new Error("API_BASE_URL is required for checkout")

  const sessionId = randomUUID()
  const db = getDb()
  // Captured inside the Phase 1 closure so Phase 1b can build the HitPay
  // payment-request amount without re-reading the session row.
  let phaseTotalBuyerPaysSen: bigint | null = null

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

        phaseTotalBuyerPaysSen = totals.totalBuyerPaysSen
      },
    )
  } catch (err) {
    if (err instanceof CheckoutError) {
      return { ok: false, error: err.code, details: err.details }
    }
    throw err
  }

  // Defensive invariant — Phase 1 commit without the assignment above is
  // unreachable, but the null check satisfies the type system across the
  // async-closure boundary.
  if (phaseTotalBuyerPaysSen === null) {
    throw new Error("initiateCheckout invariant: Phase 1 committed without total")
  }
  const totalBuyerPaysSen: bigint = phaseTotalBuyerPaysSen

  // ── Phase 1b ────────────────────────────────────────────────────────
  // Outside any transaction — HitPay is a slow third-party call, and the
  // PSP-ref UPDATE that follows is its own short Transaction 2.
  // (webBaseUrl / apiBaseUrl validated above pre-Phase-1.)

  let paymentRequest: PaymentRequestResponse
  try {
    paymentRequest = await hitpayClient().createPaymentRequest({
      amount: senToMyr(totalBuyerPaysSen),
      currency: "MYR",
      email: session.user.email ?? "",
      purpose: `BOMY order #${sessionId.slice(0, 8)}`,
      reference_number: sessionId,
      redirect_url: `${webBaseUrl}/checkout/success?session=${sessionId}`,
      cancel_url: `${webBaseUrl}/checkout/cancelled?session=${sessionId}`,
      webhook: `${apiBaseUrl}/webhooks/hitpay`,
    })
  } catch (err) {
    // HitPay call failed before any PSP ref was stored. Roll back Phase 1.
    await compensateInitiation(db, {
      sessionId,
      buyerId,
      reason: `hitpay_create_failed:${hitpayErrCode(err)}`,
    })
    return { ok: false, error: "PAYMENT_INIT_FAILED" }
  }

  // Transaction 2 — store PSP reference. The WHERE clause requires the
  // session to still be `pending_payment`; a concurrent cancel (expiry
  // job, buyer cancel) flips status and the UPDATE returns zero rows,
  // surfacing as PAYMENT_INIT_FAILED with compensation triggered.
  try {
    const updated = await withAdmin(
      db,
      { userId: buyerId, reason: `checkout_store_psp_ref:${sessionId}` },
      async (tx) =>
        tx
          .update(schema.checkoutSessions)
          .set({
            pspPaymentRequestId: paymentRequest.id,
            pspPaymentUrl: paymentRequest.url,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.checkoutSessions.id, sessionId),
              eq(schema.checkoutSessions.status, "pending_payment"),
            ),
          )
          .returning({ id: schema.checkoutSessions.id }),
    )
    if (updated.length !== 1) {
      await compensateInitiation(db, {
        sessionId,
        buyerId,
        reason: "store_psp_ref_zero_rows",
      })
      return { ok: false, error: "PAYMENT_INIT_FAILED" }
    }
  } catch {
    await compensateInitiation(db, {
      sessionId,
      buyerId,
      reason: "store_psp_ref_failed",
    })
    return { ok: false, error: "PAYMENT_INIT_FAILED" }
  }

  return { ok: true, redirectUrl: paymentRequest.url }
}

// ───────────────────────────────────────────────────────────────────────
// cancelPendingCheckout — buyer-initiated cancel (Task 13).
//
// Auth-gated; ownership + idempotency + terminal-state no-op are all
// delegated to compensateInitiation, which filters on
// `WHERE user_id = buyerId AND status = 'pending_payment'`. Callers
// always see `{ ok: true }` after a successful auth: whether the
// helper actually rolled anything back is internal — the buyer just
// wanted the session gone.
//
// The /checkout/cancelled GET route never mutates; it loads the
// cancellation UI and (per Task 14) invokes this server action via
// POST after the buyer confirms.
// ───────────────────────────────────────────────────────────────────────

export type CancelPendingCheckoutResult = { ok: true } | { ok: false; error: "UNAUTHENTICATED" }

export async function cancelPendingCheckout(
  sessionId: string,
): Promise<CancelPendingCheckoutResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }

  await compensateInitiation(getDb(), {
    sessionId,
    buyerId: session.user.id,
    reason: "buyer_cancelled",
  })

  return { ok: true }
}

// ───────────────────────────────────────────────────────────────────────
// getCheckoutSessionStatus — buyer-scoped status read (Task 13).
//
// Used by the /checkout/success poller. `withTenant` with `userRole:
// "buyer"` runs under RLS that only matches the buyer's own sessions,
// so a foreign or non-existent sessionId both yield zero rows and
// collapse into a single `NOT_FOUND` (no info leak).
// ───────────────────────────────────────────────────────────────────────

export type GetCheckoutSessionStatusResult =
  | { ok: true; status: CheckoutSessionStatus }
  | { ok: false; error: "UNAUTHENTICATED" | "NOT_FOUND" }

export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<GetCheckoutSessionStatusResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" }

  const rows = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: "buyer" },
    async (tx) =>
      tx
        .select({ status: schema.checkoutSessions.status })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.id, sessionId))
        .limit(1),
  )

  if (rows.length === 0) return { ok: false, error: "NOT_FOUND" }
  return { ok: true, status: rows[0]!.status }
}
