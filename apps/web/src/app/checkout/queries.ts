/**
 * Stage 5 PR #31 — checkout pure-computation helpers.
 *
 * Pure functions only — no DB access here. DB-reading helpers
 * (fetchCheckoutContext, loadAvailableVouchers, loadContextForInitiation)
 * land in Task 9 alongside priceCheckoutPreview.
 *
 * All money is integer sen (bigint). Deterministic iteration ascending by
 * store_id; last store absorbs rounding remainder per spec §3.4.
 */

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

  // Per-line: line_total + brand_discount
  const itemRows = input.lines.map((l) => {
    const lineTotalSen = l.unitPriceSen * BigInt(l.quantity)
    const pct = effectiveBrandSubs.get(l.storeId)
    const brandDiscountSen = pct ? (lineTotalSen * BigInt(pct)) / 100n : 0n
    return { ...l, lineTotalSen, brandDiscountSen }
  })

  // Group by store, ASC store_id
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

  // Per-store voucher allocation: proportional, last-store-absorbs remainder
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
