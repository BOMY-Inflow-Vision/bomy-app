"use server"

import { eq } from "drizzle-orm"

import { makeDb, schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"

import {
  computeCheckoutTotals,
  fetchCheckoutContext,
  loadAvailableVouchers,
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
