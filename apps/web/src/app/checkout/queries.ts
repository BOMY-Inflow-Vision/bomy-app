/**
 * Stage 5 PR #31 — checkout computation + DB read helpers.
 *
 * - `computeCheckoutTotals` is a pure function (no DB).
 * - `fetchCheckoutContext` reads product / store / voucher / brand-sub
 *   state from the DB under buyer-scoped RLS (`withTenant`). Pricing,
 *   stock, and validity are recomputed server-side every time — the
 *   client cart is advisory only.
 * - `loadAvailableVouchers` returns the buyer's redeemable vouchers
 *   for the /checkout dropdown. No `voucher.code` exposed (per Q3 lock).
 *
 * All money is integer sen (bigint). Deterministic iteration ascending
 * by store_id; last store absorbs rounding remainder per spec §3.4.
 */

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm"

import { schema, withTenant } from "@bomy/db"
import type { Database } from "@bomy/db"

// ───────────────────────────────────────────────────────────────────────
// Pure types + computation
// ───────────────────────────────────────────────────────────────────────

export type VoucherInput = {
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedAmountSen: bigint | null
  percentage: number | null // smallint in DB
  randomResolvedSen: bigint | null
}

export type CheckoutLine = {
  variantId: string
  storeId: string
  quantity: number
  unitPriceSen: bigint
  productSnapshot: unknown
  variantSnapshot: unknown
}

export type CheckoutTotals = {
  totalCatalogSen: bigint
  totalShippingSen: bigint
  voucherDiscountSen: bigint
  brandDiscountTotalSen: bigint
  totalBuyerPaysSen: bigint
  itemRows: Array<CheckoutLine & { lineTotalSen: bigint; brandDiscountSen: bigint }>
  storeRows: Array<{
    storeId: string
    retailSubtotalSen: bigint
    brandDiscountSen: bigint
    discountedSubtotalSen: bigint
    voucherContributionSen: bigint
    shippingFeeSen: bigint
  }>
}

export function computeCheckoutTotals(input: {
  lines: CheckoutLine[]
  storeShipping: Map<string, bigint> // storeId → flat_shipping_fee_sen
  brandSubs: Map<string, number> // storeId → discount_pct (only when voucher null)
  voucher: VoucherInput | null
}): CheckoutTotals {
  if (input.lines.length === 0) throw new Error("computeCheckoutTotals: empty lines")

  const voucherSuppressesBrand = input.voucher !== null
  const effectiveBrandSubs = voucherSuppressesBrand ? new Map<string, number>() : input.brandSubs

  // Per-line: line_total + brand_discount (floor per line; sum into store)
  const itemRows = input.lines.map((l) => {
    const lineTotalSen = l.unitPriceSen * BigInt(l.quantity)
    const pct = effectiveBrandSubs.get(l.storeId)
    const brandDiscountSen = pct ? (lineTotalSen * BigInt(pct)) / 100n : 0n
    return { ...l, lineTotalSen, brandDiscountSen }
  })

  const distinctStoreIds = [...new Set(itemRows.map((r) => r.storeId))].sort()
  const storeRowsPre = distinctStoreIds.map((storeId) => {
    const lines = itemRows.filter((r) => r.storeId === storeId)
    const retailSubtotalSen = lines.reduce((a, l) => a + l.lineTotalSen, 0n)
    const brandDiscountSen = lines.reduce((a, l) => a + l.brandDiscountSen, 0n)
    const discountedSubtotalSen = retailSubtotalSen - brandDiscountSen
    const shippingFeeSen = input.storeShipping.get(storeId) ?? 0n
    return { storeId, retailSubtotalSen, brandDiscountSen, discountedSubtotalSen, shippingFeeSen }
  })

  const totalCatalogSen = storeRowsPre.reduce((a, s) => a + s.retailSubtotalSen, 0n)
  const totalShippingSen = storeRowsPre.reduce((a, s) => a + s.shippingFeeSen, 0n)
  const brandDiscountTotalSen = storeRowsPre.reduce((a, s) => a + s.brandDiscountSen, 0n)

  // Voucher value (catalog-only, capped at total_catalog_sen)
  let voucherDiscountSen = 0n
  if (input.voucher) {
    const v = input.voucher
    let raw: bigint = 0n
    if (v.type === "fixed_myr" && v.fixedAmountSen !== null) raw = v.fixedAmountSen
    if (v.type === "random_myr" && v.randomResolvedSen !== null) raw = v.randomResolvedSen
    if (v.type === "percentage" && v.percentage !== null)
      raw = (totalCatalogSen * BigInt(v.percentage)) / 100n
    voucherDiscountSen = raw < totalCatalogSen ? raw : totalCatalogSen
  }

  // Per-store voucher allocation: proportional, last-store absorbs remainder
  let runningAllocated = 0n
  const storeRows = storeRowsPre.map((s, idx) => {
    let voucherContributionSen: bigint
    if (voucherDiscountSen === 0n) {
      voucherContributionSen = 0n
    } else if (idx === storeRowsPre.length - 1) {
      voucherContributionSen = voucherDiscountSen - runningAllocated
    } else {
      voucherContributionSen =
        totalCatalogSen === 0n ? 0n : (s.retailSubtotalSen * voucherDiscountSen) / totalCatalogSen
      runningAllocated += voucherContributionSen
    }
    return { ...s, voucherContributionSen }
  })

  const totalBuyerPaysSen =
    totalCatalogSen + totalShippingSen - voucherDiscountSen - brandDiscountTotalSen

  return {
    totalCatalogSen,
    totalShippingSen,
    voucherDiscountSen,
    brandDiscountTotalSen,
    totalBuyerPaysSen,
    itemRows,
    storeRows,
  }
}

// ───────────────────────────────────────────────────────────────────────
// DB-reading helpers
// ───────────────────────────────────────────────────────────────────────

export type InvalidLineReason =
  | "missing"
  | "variant_inactive"
  | "product_not_active"
  | "store_not_active"
  | "insufficient_stock"
  | "invalid_quantity"

export type CheckoutContext = {
  validLines: CheckoutLine[]
  invalidLines: Array<{ variantId: string; reason: InvalidLineReason }>
  storeShipping: Map<string, bigint>
  brandSubs: Map<string, number>
  voucher: VoucherInput | null
}

/**
 * Read-only checkout context. Runs under `withTenant` so RLS is enforced:
 *   - Active products / variants / active stores via public-read policy
 *   - Buyer's own vouchers via tenant policy
 *   - Buyer's own brand_subscriptions via tenant policy
 *
 * No writes. No HitPay. No reservations. Safe to call repeatedly.
 */
export async function fetchCheckoutContext(input: {
  db: Database
  buyerId: string
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
}): Promise<CheckoutContext> {
  return withTenant(input.db, { userId: input.buyerId, userRole: "buyer" }, async (tx) => {
    if (input.items.length === 0) {
      return {
        validLines: [],
        invalidLines: [],
        storeShipping: new Map<string, bigint>(),
        brandSubs: new Map<string, number>(),
        voucher: null,
      }
    }

    // ── Normalise input ──────────────────────────────────────────────
    // 1. Aggregate duplicate variantId entries (sum quantities) so the
    //    stock check sees the combined demand, not per-line slices.
    // 2. Validate each input quantity is a positive integer; otherwise
    //    the variantId surfaces as an invalid line (invalid_quantity).
    // This must happen BEFORE the DB lookup so Phase 1 never sees a
    // quantity it can't validate.
    const aggregated = new Map<string, number>()
    const invalidQuantityVariants = new Set<string>()
    for (const { variantId, quantity } of input.items) {
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        invalidQuantityVariants.add(variantId)
        continue
      }
      aggregated.set(variantId, (aggregated.get(variantId) ?? 0) + quantity)
    }

    const validInputs = [...aggregated.entries()].map(([variantId, quantity]) => ({
      variantId,
      quantity,
    }))
    const variantIds = validInputs.map((i) => i.variantId)

    const rows =
      variantIds.length === 0
        ? []
        : await tx
            .select({
              variantId: schema.productVariants.id,
              variantActive: schema.productVariants.isActive,
              unitPriceSen: schema.productVariants.priceMyrSen,
              stockCount: schema.productVariants.stockCount,
              productId: schema.products.id,
              productStatus: schema.products.status,
              productName: schema.products.name,
              productSlug: schema.products.slug,
              productCoverUrl: schema.products.coverImageUrl,
              variantName: schema.productVariants.name,
              storeId: schema.stores.id,
              storeStatus: schema.stores.status,
              storeName: schema.stores.name,
              storeSlug: schema.stores.slug,
              flatShippingFeeSen: schema.stores.flatShippingFeeSen,
            })
            .from(schema.productVariants)
            .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
            .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
            .where(inArray(schema.productVariants.id, variantIds))

    const byVariant = new Map(rows.map((r) => [r.variantId, r]))

    const validLines: CheckoutLine[] = []
    const invalidLines: CheckoutContext["invalidLines"] = []
    const storeShipping = new Map<string, bigint>()

    // Surface invalid-quantity entries first; one row per offending variantId
    for (const variantId of invalidQuantityVariants) {
      invalidLines.push({ variantId, reason: "invalid_quantity" })
    }

    for (const { variantId, quantity } of validInputs) {
      const r = byVariant.get(variantId)
      if (!r) {
        invalidLines.push({ variantId, reason: "missing" })
        continue
      }
      if (!r.variantActive) {
        invalidLines.push({ variantId, reason: "variant_inactive" })
        continue
      }
      if (r.productStatus !== "active") {
        invalidLines.push({ variantId, reason: "product_not_active" })
        continue
      }
      if (r.storeStatus !== "active") {
        invalidLines.push({ variantId, reason: "store_not_active" })
        continue
      }
      if (r.stockCount < quantity) {
        invalidLines.push({ variantId, reason: "insufficient_stock" })
        continue
      }
      validLines.push({
        variantId,
        storeId: r.storeId,
        quantity,
        unitPriceSen: r.unitPriceSen,
        productSnapshot: {
          id: r.productId,
          name: r.productName,
          slug: r.productSlug,
          coverImageUrl: r.productCoverUrl,
          storeName: r.storeName,
          storeSlug: r.storeSlug,
        },
        variantSnapshot: {
          id: variantId,
          name: r.variantName,
          priceMyrSen: r.unitPriceSen.toString(),
        },
      })
      storeShipping.set(r.storeId, r.flatShippingFeeSen)
    }

    // Voucher (only if id provided AND available AND owned)
    let voucher: VoucherInput | null = null
    if (input.voucherId) {
      const vRows = await tx
        .select({
          type: schema.vouchers.type,
          fixedAmountSen: schema.vouchers.fixedAmountSen,
          percentage: schema.vouchers.percentage,
          randomResolvedSen: schema.vouchers.randomResolvedSen,
        })
        .from(schema.vouchers)
        .where(
          and(
            eq(schema.vouchers.id, input.voucherId),
            eq(schema.vouchers.userId, input.buyerId),
            isNull(schema.vouchers.redeemedAt),
            isNull(schema.vouchers.reservedCheckoutSessionId),
            gt(schema.vouchers.expiresAt, sql`now()`),
          ),
        )
        .limit(1)
      if (vRows.length === 1) voucher = vRows[0]!
    }

    // Brand subs — suppressed when voucher is selected
    const brandSubs = new Map<string, number>()
    if (!voucher && validLines.length > 0) {
      const distinctStoreIds = [...new Set(validLines.map((l) => l.storeId))]
      const subs = await tx
        .select({
          storeId: schema.brandSubscriptions.storeId,
          discountPct: schema.brandSubscriptions.discountPct,
        })
        .from(schema.brandSubscriptions)
        .where(
          and(
            eq(schema.brandSubscriptions.userId, input.buyerId),
            inArray(schema.brandSubscriptions.storeId, distinctStoreIds),
            eq(schema.brandSubscriptions.status, "active"),
            gt(schema.brandSubscriptions.periodEnd, sql`now()`),
          ),
        )
      for (const s of subs) brandSubs.set(s.storeId, s.discountPct)
    }

    return { validLines, invalidLines, storeShipping, brandSubs, voucher }
  })
}

// ───────────────────────────────────────────────────────────────────────
// In-transaction loader for initiateCheckout (Phase 1)
//
// Near-clone of fetchCheckoutContext that runs INSIDE an already-open
// withAdmin transaction (RLS bypassed). Two important differences:
//
//   1. Active/status filters are applied server-side. The buyer-RLS path
//      lets the public-read policies hide inactive products/variants/
//      stores; under withAdmin we see everything, so we must filter.
//   2. FOR UPDATE on product_variants rows locks them for the atomic
//      stock decrement that follows; FOR UPDATE on the voucher row
//      contends with concurrent reservations from another transaction.
// ───────────────────────────────────────────────────────────────────────

export async function loadContextForInitiation(input: {
  tx: Database
  buyerId: string
  items: Array<{ variantId: string; quantity: number }>
  voucherId: string | null
}): Promise<CheckoutContext> {
  const { tx, buyerId, items, voucherId } = input

  if (items.length === 0) {
    return {
      validLines: [],
      invalidLines: [],
      storeShipping: new Map<string, bigint>(),
      brandSubs: new Map<string, number>(),
      voucher: null,
    }
  }

  // Identical input normalisation to fetchCheckoutContext (Bob R12):
  // aggregate duplicate variantIds, surface invalid quantities up front.
  const aggregated = new Map<string, number>()
  const invalidQuantityVariants = new Set<string>()
  for (const { variantId, quantity } of items) {
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      invalidQuantityVariants.add(variantId)
      continue
    }
    aggregated.set(variantId, (aggregated.get(variantId) ?? 0) + quantity)
  }

  const validInputs = [...aggregated.entries()].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }))
  const variantIds = validInputs.map((i) => i.variantId)

  const rows =
    variantIds.length === 0
      ? []
      : await tx
          .select({
            variantId: schema.productVariants.id,
            variantActive: schema.productVariants.isActive,
            unitPriceSen: schema.productVariants.priceMyrSen,
            stockCount: schema.productVariants.stockCount,
            productId: schema.products.id,
            productStatus: schema.products.status,
            productName: schema.products.name,
            productSlug: schema.products.slug,
            productCoverUrl: schema.products.coverImageUrl,
            variantName: schema.productVariants.name,
            storeId: schema.stores.id,
            storeStatus: schema.stores.status,
            storeName: schema.stores.name,
            storeSlug: schema.stores.slug,
            flatShippingFeeSen: schema.stores.flatShippingFeeSen,
          })
          .from(schema.productVariants)
          .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
          .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
          .where(inArray(schema.productVariants.id, variantIds))
          .for("update", { of: [schema.productVariants] })

  const byVariant = new Map(rows.map((r) => [r.variantId, r]))

  const validLines: CheckoutLine[] = []
  const invalidLines: CheckoutContext["invalidLines"] = []
  const storeShipping = new Map<string, bigint>()

  for (const variantId of invalidQuantityVariants) {
    invalidLines.push({ variantId, reason: "invalid_quantity" })
  }

  for (const { variantId, quantity } of validInputs) {
    const r = byVariant.get(variantId)
    if (!r) {
      invalidLines.push({ variantId, reason: "missing" })
      continue
    }
    if (!r.variantActive) {
      invalidLines.push({ variantId, reason: "variant_inactive" })
      continue
    }
    if (r.productStatus !== "active") {
      invalidLines.push({ variantId, reason: "product_not_active" })
      continue
    }
    if (r.storeStatus !== "active") {
      invalidLines.push({ variantId, reason: "store_not_active" })
      continue
    }
    if (r.stockCount < quantity) {
      invalidLines.push({ variantId, reason: "insufficient_stock" })
      continue
    }
    validLines.push({
      variantId,
      storeId: r.storeId,
      quantity,
      unitPriceSen: r.unitPriceSen,
      productSnapshot: {
        id: r.productId,
        name: r.productName,
        slug: r.productSlug,
        coverImageUrl: r.productCoverUrl,
        storeName: r.storeName,
        storeSlug: r.storeSlug,
      },
      variantSnapshot: {
        id: variantId,
        name: r.variantName,
        priceMyrSen: r.unitPriceSen.toString(),
      },
    })
    storeShipping.set(r.storeId, r.flatShippingFeeSen)
  }

  // Voucher — FOR UPDATE so a concurrent reservation transaction contends here.
  let voucher: VoucherInput | null = null
  if (voucherId) {
    const vRows = await tx
      .select({
        type: schema.vouchers.type,
        fixedAmountSen: schema.vouchers.fixedAmountSen,
        percentage: schema.vouchers.percentage,
        randomResolvedSen: schema.vouchers.randomResolvedSen,
      })
      .from(schema.vouchers)
      .where(
        and(
          eq(schema.vouchers.id, voucherId),
          eq(schema.vouchers.userId, buyerId),
          isNull(schema.vouchers.redeemedAt),
          isNull(schema.vouchers.reservedCheckoutSessionId),
          gt(schema.vouchers.expiresAt, sql`now()`),
        ),
      )
      .for("update")
      .limit(1)
    if (vRows.length === 1) voucher = vRows[0]!
  }

  const brandSubs = new Map<string, number>()
  if (!voucher && validLines.length > 0) {
    const distinctStoreIds = [...new Set(validLines.map((l) => l.storeId))]
    const subs = await tx
      .select({
        storeId: schema.brandSubscriptions.storeId,
        discountPct: schema.brandSubscriptions.discountPct,
      })
      .from(schema.brandSubscriptions)
      .where(
        and(
          eq(schema.brandSubscriptions.userId, buyerId),
          inArray(schema.brandSubscriptions.storeId, distinctStoreIds),
          eq(schema.brandSubscriptions.status, "active"),
          gt(schema.brandSubscriptions.periodEnd, sql`now()`),
        ),
      )
    for (const s of subs) brandSubs.set(s.storeId, s.discountPct)
  }

  return { validLines, invalidLines, storeShipping, brandSubs, voucher }
}

// ───────────────────────────────────────────────────────────────────────
// Available-vouchers loader (UI dropdown)
// ───────────────────────────────────────────────────────────────────────

export type AvailableVoucher = {
  id: string
  type: "fixed_myr" | "percentage" | "random_myr"
  label: string
  expiresAt: string // ISO
}

function formatExpiry(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function labelForVoucher(v: {
  id: string
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedAmountSen: bigint | null
  percentage: number | null
  randomResolvedSen: bigint | null
  expiresAt: Date
}): string {
  const exp = formatExpiry(v.expiresAt)
  switch (v.type) {
    case "fixed_myr": {
      const sen = v.fixedAmountSen ?? 0n
      return `RM${(Number(sen) / 100).toFixed(2)} off — expires ${exp}`
    }
    case "random_myr": {
      const sen = v.randomResolvedSen ?? 0n
      return `RM${(Number(sen) / 100).toFixed(2)} off — expires ${exp}`
    }
    case "percentage":
      return `${v.percentage ?? 0}% off — expires ${exp}`
  }
}

/**
 * Returns the buyer's available (unredeemed, unreserved, unexpired) vouchers
 * sorted by expires_at ASC. Labels per spec §4.2 — no voucher.code exposed.
 * Tied labels get a short id suffix `(#abc12345)` for disambiguation.
 */
export async function loadAvailableVouchers(
  db: Database,
  buyerId: string,
): Promise<AvailableVoucher[]> {
  return withTenant(db, { userId: buyerId, userRole: "buyer" }, async (tx) => {
    const rows = await tx
      .select({
        id: schema.vouchers.id,
        type: schema.vouchers.type,
        fixedAmountSen: schema.vouchers.fixedAmountSen,
        percentage: schema.vouchers.percentage,
        randomResolvedSen: schema.vouchers.randomResolvedSen,
        expiresAt: schema.vouchers.expiresAt,
      })
      .from(schema.vouchers)
      .where(
        and(
          eq(schema.vouchers.userId, buyerId),
          isNull(schema.vouchers.redeemedAt),
          isNull(schema.vouchers.reservedCheckoutSessionId),
          gt(schema.vouchers.expiresAt, sql`now()`),
        ),
      )
      .orderBy(schema.vouchers.expiresAt)

    const baseLabels = rows.map((r) => labelForVoucher(r))
    const counts = new Map<string, number>()
    for (const lbl of baseLabels) counts.set(lbl, (counts.get(lbl) ?? 0) + 1)

    return rows.map((r, i) => {
      const label = baseLabels[i]!
      const needsSuffix = counts.get(label)! > 1
      return {
        id: r.id,
        type: r.type,
        label: needsSuffix ? `${label} (#${r.id.slice(0, 8)})` : label,
        expiresAt: r.expiresAt.toISOString(),
      }
    })
  })
}
