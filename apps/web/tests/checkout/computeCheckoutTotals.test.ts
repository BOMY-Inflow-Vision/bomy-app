import { describe, expect, test } from "vitest"

import { computeCheckoutTotals, type VoucherInput } from "@/app/checkout/queries"

const lineA = {
  variantId: "v1",
  storeId: "s1",
  quantity: 2,
  unitPriceSen: 1000n, // 2 × 1000 = 2000 sen
  productSnapshot: {},
  variantSnapshot: {},
}
const lineB = {
  variantId: "v2",
  storeId: "s2",
  quantity: 1,
  unitPriceSen: 5000n,
  productSnapshot: {},
  variantSnapshot: {},
}

const voucherFixed = (amount: bigint): VoucherInput => ({
  type: "fixed_myr",
  fixedAmountSen: amount,
  percentage: null,
  randomResolvedSen: null,
})
const voucherRandom = (amount: bigint): VoucherInput => ({
  type: "random_myr",
  fixedAmountSen: null,
  percentage: null,
  randomResolvedSen: amount,
})
const voucherPct = (pct: number): VoucherInput => ({
  type: "percentage",
  fixedAmountSen: null,
  percentage: pct,
  randomResolvedSen: null,
})

describe("computeCheckoutTotals", () => {
  test("happy path: 2 stores, no discounts, flat shipping each", () => {
    const r = computeCheckoutTotals({
      lines: [lineA, lineB],
      storeShipping: new Map([
        ["s1", 500n],
        ["s2", 1000n],
      ]),
      brandSubs: new Map(),
      voucher: null,
    })
    expect(r.totalCatalogSen).toBe(7000n) // 2000 + 5000
    expect(r.totalShippingSen).toBe(1500n)
    expect(r.voucherDiscountSen).toBe(0n)
    expect(r.brandDiscountTotalSen).toBe(0n)
    expect(r.totalBuyerPaysSen).toBe(8500n)
    expect(r.storeRows).toHaveLength(2)
    expect(r.storeRows[0]!.storeId).toBe("s1") // ASC order
    expect(r.itemRows).toHaveLength(2)
  })

  test("brand discount applies per-line (10% off, floor); voucher null", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map([["s1", 10]]),
      voucher: null,
    })
    expect(r.itemRows[0]!.brandDiscountSen).toBe(200n) // floor(2000 * 10/100)
    expect(r.storeRows[0]!.brandDiscountSen).toBe(200n)
    expect(r.storeRows[0]!.discountedSubtotalSen).toBe(1800n)
    expect(r.brandDiscountTotalSen).toBe(200n)
    expect(r.totalBuyerPaysSen).toBe(1800n)
  })

  test("voucher suppresses brand discount even if active brand sub exists", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map([["s1", 10]]),
      voucher: voucherFixed(500n),
    })
    expect(r.brandDiscountTotalSen).toBe(0n)
    expect(r.voucherDiscountSen).toBe(500n)
    expect(r.itemRows[0]!.brandDiscountSen).toBe(0n)
  })

  test("fixed_myr voucher capped at catalog total", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map(),
      voucher: voucherFixed(9999n),
    })
    expect(r.voucherDiscountSen).toBe(2000n) // capped
    expect(r.totalBuyerPaysSen).toBe(0n) // TOTAL_NOT_PAYABLE guard upstream
  })

  test("random_myr voucher uses random_resolved_sen, capped", () => {
    const r = computeCheckoutTotals({
      lines: [lineA],
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map(),
      voucher: voucherRandom(1500n),
    })
    expect(r.voucherDiscountSen).toBe(1500n)
    expect(r.totalBuyerPaysSen).toBe(500n)
  })

  test("percentage voucher: floor against total_catalog", () => {
    const r = computeCheckoutTotals({
      lines: [lineA], // 2000 sen catalog
      storeShipping: new Map([["s1", 0n]]),
      brandSubs: new Map(),
      voucher: voucherPct(15),
    })
    expect(r.voucherDiscountSen).toBe(300n) // floor(2000 * 15 / 100)
  })

  test("per-store voucher allocation: proportional, last-store-absorbs", () => {
    // s1: 2000 sen, s2: 5000 sen, total = 7000. Voucher = 1000 sen.
    // floor(2000 * 1000 / 7000) = 285 (s1); s2 = 1000 - 285 = 715.
    const r = computeCheckoutTotals({
      lines: [lineA, lineB],
      storeShipping: new Map([
        ["s1", 0n],
        ["s2", 0n],
      ]),
      brandSubs: new Map(),
      voucher: voucherFixed(1000n),
    })
    expect(r.storeRows[0]!.voucherContributionSen).toBe(285n)
    expect(r.storeRows[1]!.voucherContributionSen).toBe(715n)
    const sum = r.storeRows.reduce((a, s) => a + s.voucherContributionSen, 0n)
    expect(sum).toBe(r.voucherDiscountSen)
  })

  test("deterministic store order: ASC by storeId", () => {
    const r = computeCheckoutTotals({
      lines: [
        { ...lineB, storeId: "zzz" },
        { ...lineA, storeId: "aaa" },
      ],
      storeShipping: new Map([
        ["aaa", 0n],
        ["zzz", 0n],
      ]),
      brandSubs: new Map(),
      voucher: null,
    })
    expect(r.storeRows[0]!.storeId).toBe("aaa")
    expect(r.storeRows[1]!.storeId).toBe("zzz")
  })

  test("empty lines throws", () => {
    expect(() =>
      computeCheckoutTotals({
        lines: [],
        storeShipping: new Map(),
        brandSubs: new Map(),
        voucher: null,
      }),
    ).toThrow(/empty lines/)
  })
})
