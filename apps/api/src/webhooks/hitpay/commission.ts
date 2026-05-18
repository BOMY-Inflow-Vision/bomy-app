/**
 * Pure-bigint helpers for the order webhook fan-out (PR #32 spec §3.6).
 *
 * All amounts are sen (1/100 MYR). Integer arithmetic only — bigint
 * division floors toward zero, which is the deterministic rounding rule
 * the spec mandates (last store absorbs the rounding remainder).
 *
 * Lock-order convention: these functions touch no DB state and have no
 * I/O. They run inside the fan-out withAdmin transaction between the
 * locked SELECTs and the orders/order_items/ledger INSERTs. See
 * order-fanout.ts §3.6 for the call sequence.
 */

export interface StorePspInput {
  storeId: string
  /** Per-store contribution to total_buyer_pays_sen:
   *  discounted_subtotal_sen + shipping_fee_sen − voucher_contribution_sen */
  net: bigint
}

export interface StoreSplitInput {
  discountedSubtotalSen: bigint
  shippingFeeSen: bigint
  voucherContributionSen: bigint
  pspFeeAllocatedSen: bigint
  /** Snapshot of platform_config.regular_order_commission_pct at fan-out time. */
  commissionPct: number
}

export interface StoreSplitResult {
  sellerPayoutSen: bigint
  bomyCommissionSen: bigint
  catalogPspFee: bigint
  shippingPspFee: bigint
}

/**
 * Allocate `pspFeeSen` across stores proportional to each store's
 * `net` contribution to `totalBuyerPaysSen`. Stores must be sorted
 * ascending by `storeId` so the allocation is deterministic across
 * webhook deliveries (the LAST store in the sorted array absorbs the
 * integer-floor remainder).
 *
 * Properties:
 *  - sum of returned pspFeeAllocatedSen === pspFeeSen (exactly).
 *  - When pspFeeSen = 0, every allocation is 0.
 *  - When totalBuyerPaysSen = 0 (degenerate), every per-store allocation
 *    is 0 except the last which absorbs the whole pspFeeSen.
 */
export function allocatePspFee(
  stores: StorePspInput[],
  pspFeeSen: bigint,
  totalBuyerPaysSen: bigint,
): Array<{ storeId: string; pspFeeAllocatedSen: bigint }> {
  if (stores.length === 0) return []

  const result: Array<{ storeId: string; pspFeeAllocatedSen: bigint }> = []
  let remaining = pspFeeSen

  for (let i = 0; i < stores.length - 1; i++) {
    const store = stores[i]!
    const allocated = totalBuyerPaysSen === 0n ? 0n : (pspFeeSen * store.net) / totalBuyerPaysSen
    result.push({ storeId: store.storeId, pspFeeAllocatedSen: allocated })
    remaining -= allocated
  }

  // Last store absorbs the rounding remainder so the sum is exact.
  const last = stores[stores.length - 1]!
  result.push({ storeId: last.storeId, pspFeeAllocatedSen: remaining })
  return result
}

/**
 * Per-store commission split. Net-of-fees commission (Stage 5 §3 / spec §3.6 step 6):
 *
 *   catalog_psp_fee  = floor(psp_fee_allocated × discounted_subtotal / (discounted_subtotal + shipping_fee))
 *   shipping_psp_fee = psp_fee_allocated − catalog_psp_fee
 *   net_catalog      = discounted_subtotal − catalog_psp_fee
 *   seller_share     = floor(net_catalog × (100 − pct) / 100)
 *   seller_payout    = seller_share + shipping_fee − shipping_psp_fee
 *   bomy_commission  = net_catalog − seller_share − voucher_contribution
 *
 * `bomy_commission_sen` can legitimately go negative when a generous
 * voucher exceeds BOMY's share (open question #1 in the design spec:
 * allow + warn log at fan-out time).
 *
 * Degenerate `discounted_subtotal + shipping_fee = 0` (a zero-cost
 * order — should never reach the webhook because total_buyer_pays > 0
 * is CHECKed at checkout, but kept defensive here) attributes the
 * whole psp_fee_allocated to shipping_psp_fee, which produces a
 * negative seller_payout. The caller (fanOutPaid) gates the ledger
 * legs on > 0 so this stays internally consistent.
 */
export function computeStoreSplit(input: StoreSplitInput): StoreSplitResult {
  const {
    discountedSubtotalSen,
    shippingFeeSen,
    voucherContributionSen,
    pspFeeAllocatedSen,
    commissionPct,
  } = input
  const denominator = discountedSubtotalSen + shippingFeeSen
  const catalogPspFee =
    denominator === 0n ? 0n : (pspFeeAllocatedSen * discountedSubtotalSen) / denominator
  const shippingPspFee = pspFeeAllocatedSen - catalogPspFee
  const netCatalog = discountedSubtotalSen - catalogPspFee
  const sellerShare = (netCatalog * BigInt(100 - commissionPct)) / 100n
  const sellerPayoutSen = sellerShare + shippingFeeSen - shippingPspFee
  const bomyCommissionSen = netCatalog - sellerShare - voucherContributionSen
  return { sellerPayoutSen, bomyCommissionSen, catalogPspFee, shippingPspFee }
}

/**
 * Assert the journal-balance invariant before any INSERT, so a mismatch
 * surfaces as a thrown JS error (with the diff in the message) instead
 * of a Postgres `check_violation` on the orders table.
 *
 *   seller_payout + bomy_commission + psp_fee_allocated
 *     = discounted_subtotal + shipping_fee − voucher_contribution
 *
 * This is the same invariant the `orders_journal_balance` CHECK enforces
 * at the DB layer (migration 0012). Calling this in JS first makes test
 * failures debuggable (the diff tells you which arm of the equation is off).
 */
export function assertJournalBalance(
  sellerPayoutSen: bigint,
  bomyCommissionSen: bigint,
  pspFeeAllocatedSen: bigint,
  discountedSubtotalSen: bigint,
  shippingFeeSen: bigint,
  voucherContributionSen: bigint,
): void {
  const lhs = sellerPayoutSen + bomyCommissionSen + pspFeeAllocatedSen
  const rhs = discountedSubtotalSen + shippingFeeSen - voucherContributionSen
  if (lhs !== rhs) {
    throw new Error(
      `assertJournalBalance: ${lhs} !== ${rhs} (diff=${lhs - rhs}); ` +
        `legs seller=${sellerPayoutSen} bomy=${bomyCommissionSen} psp=${pspFeeAllocatedSen}; ` +
        `discounted=${discountedSubtotalSen} shipping=${shippingFeeSen} voucher=${voucherContributionSen}`,
    )
  }
}

/**
 * Custom error thrown by {@link assertNonNegativeSellerPayout} so the
 * fan-out handler (Task 10) can catch it specifically and park the
 * session in `payment_review_required` instead of letting it bubble.
 *
 * Why this exists (Bob R1 on Task 6): the PSP fee allocator's
 * "last-store absorbs remainder" rule can over-allocate a per-store
 * `psp_fee_allocated_sen` greater than that store's gross. Example:
 * four 1-sen stores, pspFeeSen = 3 → last store gets psp_fee = 3
 * against gross = 1, producing `sellerPayoutSen = -1`. The journal
 * still balances (BOMY absorbs the difference into its own commission),
 * but the planned ledger gate `seller_payout > 0n → debit` would SKIP
 * the leg, breaking the spec §3.6-8 reconciliation invariant
 * `sum(debits) == sum(orders.seller_payout_sen + psp_fee_allocated_sen)`.
 *
 * Negative `bomy_commission_sen` is fine (open question #1 default:
 * allow + warn). Negative seller payout is NOT — sellers must never
 * appear to owe BOMY. The webhook handler treats this as a math edge
 * that ops must reconcile manually.
 */
export class NegativeSellerPayoutError extends Error {
  readonly storeId: string | undefined
  readonly sellerPayoutSen: bigint
  constructor(sellerPayoutSen: bigint, storeId?: string) {
    super(
      `negative seller_payout_sen=${sellerPayoutSen}` +
        (storeId !== undefined ? ` for store ${storeId}` : ""),
    )
    this.name = "NegativeSellerPayoutError"
    this.storeId = storeId
    this.sellerPayoutSen = sellerPayoutSen
  }
}

/**
 * Throws {@link NegativeSellerPayoutError} if `sellerPayoutSen < 0n`.
 * Call once per store split, BEFORE any orders/ledger INSERT — the
 * fan-out handler catches this and parks the session in
 * `payment_review_required`.
 *
 * Sibling to {@link assertJournalBalance}: both are pre-INSERT
 * invariants. This one is application-level (no DB CHECK constrains
 * `orders.seller_payout_sen`), so the only place it can fire is here.
 */
export function assertNonNegativeSellerPayout(sellerPayoutSen: bigint, storeId?: string): void {
  if (sellerPayoutSen < 0n) {
    throw new NegativeSellerPayoutError(sellerPayoutSen, storeId)
  }
}
