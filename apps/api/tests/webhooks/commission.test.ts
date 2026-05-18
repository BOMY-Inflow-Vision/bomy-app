/**
 * Unit tests — apps/api/src/webhooks/hitpay/commission.ts (PR #32 Task 6).
 *
 * Pure-bigint helpers; no DB, no env, no skip gate. These tests run
 * always — vitest's serial-file mode (vitest.config.ts fileParallelism:
 * false) is fine, this file finishes in milliseconds.
 */
import { describe, expect, it } from "vitest"

import {
  allocatePspFee,
  assertJournalBalance,
  computeStoreSplit,
  type StorePspInput,
} from "../../src/webhooks/hitpay/commission.js"

describe("allocatePspFee", () => {
  it("empty stores → empty result", () => {
    expect(allocatePspFee([], 95n, 0n)).toEqual([])
  })

  it("single store → allocated == pspFeeSen exactly", () => {
    const stores: StorePspInput[] = [{ storeId: "s1", net: 5500n }]
    const result = allocatePspFee(stores, 95n, 5500n)
    expect(result).toEqual([{ storeId: "s1", pspFeeAllocatedSen: 95n }])
  })

  it("multi-store: sum of allocated == pspFeeSen; last absorbs remainder", () => {
    // Three stores contributing 5500, 3300, 1100 → total 9900.
    // Fee 95: per-store integer floor allocation:
    //   s1: floor(95 * 5500 / 9900) = floor(522500/9900) = 52
    //   s2: floor(95 * 3300 / 9900) = floor(313500/9900) = 31
    //   s3 (last): 95 - 52 - 31 = 12  ← absorbs remainder
    const stores: StorePspInput[] = [
      { storeId: "s1", net: 5500n },
      { storeId: "s2", net: 3300n },
      { storeId: "s3", net: 1100n },
    ]
    const result = allocatePspFee(stores, 95n, 9900n)
    expect(result).toEqual([
      { storeId: "s1", pspFeeAllocatedSen: 52n },
      { storeId: "s2", pspFeeAllocatedSen: 31n },
      { storeId: "s3", pspFeeAllocatedSen: 12n },
    ])
    expect(result.reduce((acc, r) => acc + r.pspFeeAllocatedSen, 0n)).toBe(95n)
  })

  it("zero pspFee → all allocations are 0", () => {
    const stores: StorePspInput[] = [
      { storeId: "s1", net: 5500n },
      { storeId: "s2", net: 3300n },
    ]
    const result = allocatePspFee(stores, 0n, 8800n)
    expect(result).toEqual([
      { storeId: "s1", pspFeeAllocatedSen: 0n },
      { storeId: "s2", pspFeeAllocatedSen: 0n },
    ])
  })

  it("multi-store with deliberate rounding remainder still sums exactly", () => {
    // Two stores of equal net, fee = 7 (odd).
    // s1: floor(7 * 500 / 1000) = 3; s2 last = 7 - 3 = 4.
    const stores: StorePspInput[] = [
      { storeId: "s1", net: 500n },
      { storeId: "s2", net: 500n },
    ]
    const result = allocatePspFee(stores, 7n, 1000n)
    expect(result.reduce((acc, r) => acc + r.pspFeeAllocatedSen, 0n)).toBe(7n)
    expect(result[0]?.pspFeeAllocatedSen).toBe(3n)
    expect(result[1]?.pspFeeAllocatedSen).toBe(4n)
  })

  it("degenerate totalBuyerPaysSen = 0 → all per-store = 0, last absorbs full fee", () => {
    // Defensive path; never reached in production because total > 0 is CHECKed.
    const stores: StorePspInput[] = [
      { storeId: "s1", net: 0n },
      { storeId: "s2", net: 0n },
    ]
    const result = allocatePspFee(stores, 50n, 0n)
    expect(result).toEqual([
      { storeId: "s1", pspFeeAllocatedSen: 0n },
      { storeId: "s2", pspFeeAllocatedSen: 50n },
    ])
  })
})

describe("computeStoreSplit", () => {
  it("pct=25, non-zero shipping and voucher: journal balances", () => {
    // discounted 5000, shipping 500, voucher 0, psp_fee 95 → total 5500.
    // catalog_psp = floor(95 * 5000 / 5500) = floor(475000/5500) = 86
    // shipping_psp = 95 - 86 = 9
    // net_catalog = 5000 - 86 = 4914
    // seller_share = floor(4914 * 75 / 100) = floor(368550/100) = 3685
    // seller_payout = 3685 + 500 - 9 = 4176
    // bomy = 4914 - 3685 - 0 = 1229
    // journal LHS = 4176 + 1229 + 95 = 5500 ✓; RHS = 5000 + 500 - 0 = 5500 ✓
    const r = computeStoreSplit({
      discountedSubtotalSen: 5000n,
      shippingFeeSen: 500n,
      voucherContributionSen: 0n,
      pspFeeAllocatedSen: 95n,
      commissionPct: 25,
    })
    expect(r.catalogPspFee).toBe(86n)
    expect(r.shippingPspFee).toBe(9n)
    expect(r.sellerPayoutSen).toBe(4176n)
    expect(r.bomyCommissionSen).toBe(1229n)
    assertJournalBalance(r.sellerPayoutSen, r.bomyCommissionSen, 95n, 5000n, 500n, 0n)
  })

  it("pct=25 with voucher contribution: bomy share reduced; journal balances", () => {
    // discounted 5000, shipping 500, voucher 800, psp_fee 95 → total 4700.
    // catalog_psp = 86, shipping_psp = 9 (same as above; net allocation logic unchanged)
    // net_catalog = 4914, seller_share = 3685, seller_payout = 4176
    // bomy = 4914 - 3685 - 800 = 429
    // journal LHS = 4176 + 429 + 95 = 4700 ✓; RHS = 5000 + 500 - 800 = 4700 ✓
    const r = computeStoreSplit({
      discountedSubtotalSen: 5000n,
      shippingFeeSen: 500n,
      voucherContributionSen: 800n,
      pspFeeAllocatedSen: 95n,
      commissionPct: 25,
    })
    expect(r.bomyCommissionSen).toBe(429n)
    assertJournalBalance(r.sellerPayoutSen, r.bomyCommissionSen, 95n, 5000n, 500n, 800n)
  })

  it("pct=100 with zero shipping → sellerPayout = 0", () => {
    // discounted 5000, shipping 0, voucher 0, psp_fee 100.
    // catalog_psp = floor(100 * 5000 / 5000) = 100; shipping_psp = 0
    // net_catalog = 4900; seller_share = floor(4900 * 0 / 100) = 0
    // seller_payout = 0 + 0 - 0 = 0
    // bomy = 4900 - 0 - 0 = 4900
    // journal LHS = 0 + 4900 + 100 = 5000 ✓
    const r = computeStoreSplit({
      discountedSubtotalSen: 5000n,
      shippingFeeSen: 0n,
      voucherContributionSen: 0n,
      pspFeeAllocatedSen: 100n,
      commissionPct: 100,
    })
    expect(r.sellerPayoutSen).toBe(0n)
    expect(r.bomyCommissionSen).toBe(4900n)
    assertJournalBalance(r.sellerPayoutSen, r.bomyCommissionSen, 100n, 5000n, 0n, 0n)
  })

  it("pct=0 → seller takes catalog minus catalog_psp; bomy = -voucher", () => {
    // discounted 5000, shipping 500, voucher 200, psp_fee 50.
    // catalog_psp = floor(50 * 5000 / 5500) = floor(250000/5500) = 45
    // shipping_psp = 5
    // net_catalog = 4955; seller_share = floor(4955 * 100 / 100) = 4955
    // seller_payout = 4955 + 500 - 5 = 5450
    // bomy = 4955 - 4955 - 200 = -200
    // journal: 5450 + (-200) + 50 = 5300 ✓; RHS 5000 + 500 - 200 = 5300 ✓
    const r = computeStoreSplit({
      discountedSubtotalSen: 5000n,
      shippingFeeSen: 500n,
      voucherContributionSen: 200n,
      pspFeeAllocatedSen: 50n,
      commissionPct: 0,
    })
    expect(r.bomyCommissionSen).toBe(-200n)
    assertJournalBalance(r.sellerPayoutSen, r.bomyCommissionSen, 50n, 5000n, 500n, 200n)
  })

  it("negative bomyCommissionSen when voucher exceeds BOMY share — returns without throwing", () => {
    // discounted 1000, shipping 0, voucher 800, psp_fee 0, pct 25.
    // net_catalog = 1000; seller_share = floor(1000 * 75 / 100) = 750
    // seller_payout = 750 + 0 - 0 = 750
    // bomy = 1000 - 750 - 800 = -550 (BOMY effectively funds the voucher)
    // journal: 750 + (-550) + 0 = 200 ✓; RHS 1000 + 0 - 800 = 200 ✓
    const r = computeStoreSplit({
      discountedSubtotalSen: 1000n,
      shippingFeeSen: 0n,
      voucherContributionSen: 800n,
      pspFeeAllocatedSen: 0n,
      commissionPct: 25,
    })
    expect(r.bomyCommissionSen).toBe(-550n)
    expect(r.sellerPayoutSen).toBe(750n)
    assertJournalBalance(r.sellerPayoutSen, r.bomyCommissionSen, 0n, 1000n, 0n, 800n)
  })

  it("zero pspFee → catalog_psp and shipping_psp both 0", () => {
    const r = computeStoreSplit({
      discountedSubtotalSen: 5000n,
      shippingFeeSen: 500n,
      voucherContributionSen: 0n,
      pspFeeAllocatedSen: 0n,
      commissionPct: 25,
    })
    expect(r.catalogPspFee).toBe(0n)
    expect(r.shippingPspFee).toBe(0n)
    // seller_share = floor(5000 * 75 / 100) = 3750
    // seller_payout = 3750 + 500 = 4250
    // bomy = 5000 - 3750 - 0 = 1250
    expect(r.sellerPayoutSen).toBe(4250n)
    expect(r.bomyCommissionSen).toBe(1250n)
    assertJournalBalance(r.sellerPayoutSen, r.bomyCommissionSen, 0n, 5000n, 500n, 0n)
  })

  it("degenerate zero-cost order (discounted + shipping = 0) → catalogPspFee = 0", () => {
    // Defensive path; never reached because total_buyer_pays > 0 is CHECKed
    // at checkout. Still want the function to not throw on division-by-zero.
    const r = computeStoreSplit({
      discountedSubtotalSen: 0n,
      shippingFeeSen: 0n,
      voucherContributionSen: 0n,
      pspFeeAllocatedSen: 0n,
      commissionPct: 25,
    })
    expect(r.catalogPspFee).toBe(0n)
    expect(r.shippingPspFee).toBe(0n)
    expect(r.sellerPayoutSen).toBe(0n)
    expect(r.bomyCommissionSen).toBe(0n)
  })
})

describe("assertJournalBalance", () => {
  it("passes when LHS === RHS", () => {
    expect(() => assertJournalBalance(4176n, 1229n, 95n, 5000n, 500n, 0n)).not.toThrow()
  })

  it("passes when bomyCommissionSen is negative but legs still balance", () => {
    // LHS = 750 + (-550) + 0 = 200; RHS = 1000 + 0 - 800 = 200
    expect(() => assertJournalBalance(750n, -550n, 0n, 1000n, 0n, 800n)).not.toThrow()
  })

  it("throws on imbalanced legs (diff in error message)", () => {
    // LHS = 4176 + 1229 + 95 = 5500; RHS = 5000 + 500 - 999 = 4501; diff = 999
    expect(() => assertJournalBalance(4176n, 1229n, 95n, 5000n, 500n, 999n)).toThrow(
      /assertJournalBalance: 5500 !== 4501 \(diff=999\)/,
    )
  })

  it("throws when seller_payout is off by one", () => {
    // LHS = 4177 + 1229 + 95 = 5501; RHS = 5500; diff = 1
    expect(() => assertJournalBalance(4177n, 1229n, 95n, 5000n, 500n, 0n)).toThrow(/diff=1/)
  })
})
