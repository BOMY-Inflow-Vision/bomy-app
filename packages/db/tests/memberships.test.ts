/**
 * Stage 4 integration tests — membership & subscriptions schema + RLS.
 *
 * Mirrors tests/rls.test.ts: requires a live Postgres with the bomy_app
 * role (non-superuser) and `BOMY_RLS_READY=1`. The RLS policies under
 * test rely on app.current_user_id / app.current_user_role / the
 * bypass flag, which means superuser connections will silently pass
 * checks they should fail — the role gate matters.
 *
 *   docker compose up postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/db test
 */
import { randomUUID } from "node:crypto"

import { inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import {
  brandSubscriptionPlans,
  brandSubscriptions,
  goodieBoxDispatches,
  ledgerEntries,
  memberSubscriptions,
  platformConfig,
  stores,
  users,
  vouchers,
} from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

// Helpers used across describe blocks. Each test seeds its own data
// under withAdmin so the seed itself isn't subject to RLS, then opens
// a withTenant block to verify RLS as the relevant role.
const sixWeeksFromNow = () => new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000)

describe.skipIf(!shouldRun)("Stage 4 — platform_config seeds", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("seeds the 6 voucher + membership keys", async () => {
    const adminId = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed admin" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" })
    })

    const expectedKeys = [
      "platform_membership_price_myr_sen",
      "voucher_monthly_type",
      "voucher_monthly_fixed_sen",
      "voucher_monthly_pct",
      "voucher_monthly_random_min_sen",
      "voucher_monthly_random_max_sen",
    ]

    const rows = await withAdmin(handle.db, { userId: adminId, reason: "read seeds" }, async (tx) =>
      tx
        .select({ key: platformConfig.key, value: platformConfig.value })
        .from(platformConfig)
        .where(inArray(platformConfig.key, expectedKeys)),
    )

    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    expect(byKey["platform_membership_price_myr_sen"]).toBe(7500)
    expect(byKey["voucher_monthly_type"]).toBe("fixed_myr")
    expect(byKey["voucher_monthly_fixed_sen"]).toBe(500)
    expect(byKey["voucher_monthly_pct"]).toBe(10)
    expect(byKey["voucher_monthly_random_min_sen"]).toBe(200)
    expect(byKey["voucher_monthly_random_max_sen"]).toBe(1000)
  })
})

describe.skipIf(!shouldRun)("Stage 4 — member_subscriptions RLS + constraints", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("a member sees own subscription but not someone else's", async () => {
    const adminId = randomUUID()
    const memberA = randomUUID()
    const memberB = randomUUID()
    const subA = randomUUID()
    const subB = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed members" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: memberA, email: `${memberA}@t`, role: "buyer" },
        { id: memberB, email: `${memberB}@t`, role: "buyer" },
      ])
      await tx.insert(memberSubscriptions).values([
        {
          id: subA,
          userId: memberA,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: sixWeeksFromNow(),
        },
        {
          id: subB,
          userId: memberB,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: sixWeeksFromNow(),
        },
      ])
    })

    const aView = await withTenant(handle.db, { userId: memberA, userRole: "buyer" }, async (tx) =>
      tx.select({ id: memberSubscriptions.id }).from(memberSubscriptions),
    )
    const aIds = aView.map((r) => r.id)
    expect(aIds).toContain(subA)
    expect(aIds).not.toContain(subB)
  })

  it("DB rejects a second active membership for the same user (partial unique index)", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed user" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
      await tx.insert(memberSubscriptions).values({
        userId: member,
        status: "active",
        priceMyrSen: 7500n,
        periodStart: new Date(),
        periodEnd: sixWeeksFromNow(),
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "double active" }, async (tx) => {
        await tx.insert(memberSubscriptions).values({
          userId: member,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: sixWeeksFromNow(),
        })
      }),
    ).rejects.toThrow(/member_subscriptions_active_user_unique_idx|duplicate key/)
  })

  it("an expired + a new active membership for the same user is allowed", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed user" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
      await tx.insert(memberSubscriptions).values([
        {
          userId: member,
          status: "expired",
          priceMyrSen: 7500n,
          periodStart: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          periodEnd: new Date(Date.now() - 1),
        },
        {
          userId: member,
          status: "active",
          priceMyrSen: 7500n,
          periodStart: new Date(),
          periodEnd: sixWeeksFromNow(),
        },
      ])
    })
    // No throw → pass.
    expect(true).toBe(true)
  })
})

describe.skipIf(!shouldRun)("Stage 4 — brand_subscription_plans RLS + checks", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("any buyer sees active plans; only owner sees inactive plan", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const otherBuyer = randomUUID()
    const storeId = randomUUID()
    const activePlanId = randomUUID()
    const inactivePlanId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed plans" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
        { id: otherBuyer, email: `${otherBuyer}@t`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "Plan Store",
        slug: `plan-${storeId}`,
        status: "active",
      })
      await tx.insert(brandSubscriptionPlans).values([
        {
          id: activePlanId,
          storeId,
          termMonths: 3,
          priceMyrSen: 3000n,
          discountPct: 5,
          isActive: true,
        },
        {
          id: inactivePlanId,
          storeId,
          termMonths: 6,
          priceMyrSen: 5000n,
          discountPct: 8,
          isActive: false,
        },
      ])
    })

    // Other buyer: sees only the active plan.
    const buyerView = await withTenant(
      handle.db,
      { userId: otherBuyer, userRole: "buyer" },
      async (tx) =>
        tx
          .select({ id: brandSubscriptionPlans.id })
          .from(brandSubscriptionPlans)
          .where(sql`${brandSubscriptionPlans.storeId} = ${storeId}`),
    )
    const buyerIds = buyerView.map((r) => r.id)
    expect(buyerIds).toContain(activePlanId)
    expect(buyerIds).not.toContain(inactivePlanId)

    // Seller (own store): sees both.
    const sellerView = await withTenant(
      handle.db,
      { userId: seller, userRole: "seller_owner", sellerId: storeId },
      async (tx) =>
        tx
          .select({ id: brandSubscriptionPlans.id })
          .from(brandSubscriptionPlans)
          .where(sql`${brandSubscriptionPlans.storeId} = ${storeId}`),
    )
    const sellerIds = sellerView.map((r) => r.id)
    expect(sellerIds).toContain(activePlanId)
    expect(sellerIds).toContain(inactivePlanId)
  })

  it("CHECK rejects term_months not in (3,6,12)", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const storeId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "S",
        slug: `s-${storeId}`,
        status: "active",
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "bad term" }, async (tx) => {
        await tx.insert(brandSubscriptionPlans).values({
          storeId,
          termMonths: 4,
          priceMyrSen: 1000n,
          discountPct: 5,
        })
      }),
    ).rejects.toThrow(/brand_subscription_plans_term_chk/)
  })

  it("CHECK rejects discount_pct outside 5..10", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const storeId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "S",
        slug: `s-${storeId}`,
        status: "active",
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "bad pct" }, async (tx) => {
        await tx.insert(brandSubscriptionPlans).values({
          storeId,
          termMonths: 3,
          priceMyrSen: 1000n,
          discountPct: 15,
        })
      }),
    ).rejects.toThrow(/brand_subscription_plans_discount_chk/)
  })
})

describe.skipIf(!shouldRun)("Stage 4 — brand_subscriptions RLS + split check", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("buyer sees own; store seller sees subs to their store; unrelated buyer sees nothing", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const buyer = randomUUID()
    const otherBuyer = randomUUID()
    const storeId = randomUUID()
    const planId = randomUUID()
    const subId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
        { id: buyer, email: `${buyer}@t`, role: "buyer" },
        { id: otherBuyer, email: `${otherBuyer}@t`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "Sub Store",
        slug: `sub-${storeId}`,
        status: "active",
      })
      await tx.insert(brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 3000n,
        discountPct: 5,
        isActive: true,
      })
      // Locked 2026-05-01: fee taken off top, then 90/10 split.
      // price=3000, fee=100, net=2900, brand=2610, bomy=290.
      await tx.insert(brandSubscriptions).values({
        id: subId,
        userId: buyer,
        storeId,
        planId,
        status: "active",
        priceMyrSen: 3000n,
        discountPct: 5,
        periodStart: new Date(),
        periodEnd: sixWeeksFromNow(),
        hitpayFeeSen: 100n,
        bomyCommissionSen: 290n,
        brandPayoutSen: 2610n,
      })
    })

    const buyerView = await withTenant(
      handle.db,
      { userId: buyer, userRole: "buyer" },
      async (tx) => tx.select({ id: brandSubscriptions.id }).from(brandSubscriptions),
    )
    expect(buyerView.map((r) => r.id)).toContain(subId)

    const sellerView = await withTenant(
      handle.db,
      { userId: seller, userRole: "seller_owner", sellerId: storeId },
      async (tx) => tx.select({ id: brandSubscriptions.id }).from(brandSubscriptions),
    )
    expect(sellerView.map((r) => r.id)).toContain(subId)

    const otherView = await withTenant(
      handle.db,
      { userId: otherBuyer, userRole: "buyer" },
      async (tx) => tx.select({ id: brandSubscriptions.id }).from(brandSubscriptions),
    )
    expect(otherView.map((r) => r.id)).not.toContain(subId)
  })

  it("CHECK rejects active rows where commission + payout + fee != price", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const buyer = randomUUID()
    const storeId = randomUUID()
    const planId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
        { id: buyer, email: `${buyer}@t`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "S",
        slug: `s-${storeId}`,
        status: "active",
      })
      await tx.insert(brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 3000n,
        discountPct: 5,
        isActive: true,
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "bad split" }, async (tx) => {
        await tx.insert(brandSubscriptions).values({
          userId: buyer,
          storeId,
          planId,
          status: "active",
          priceMyrSen: 3000n,
          discountPct: 5,
          periodStart: new Date(),
          periodEnd: sixWeeksFromNow(),
          hitpayFeeSen: 100n,
          bomyCommissionSen: 290n,
          brandPayoutSen: 2500n, // 290 + 2500 + 100 = 2890 ≠ 3000
        })
      }),
    ).rejects.toThrow(/brand_subscriptions_split_chk/)
  })

  it("CHECK rejects active rows missing hitpay_fee_sen", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const buyer = randomUUID()
    const storeId = randomUUID()
    const planId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
        { id: buyer, email: `${buyer}@t`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "S",
        slug: `s-${storeId}`,
        status: "active",
      })
      await tx.insert(brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 3000n,
        discountPct: 5,
        isActive: true,
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "active no fee" }, async (tx) => {
        await tx.insert(brandSubscriptions).values({
          userId: buyer,
          storeId,
          planId,
          status: "active",
          priceMyrSen: 3000n,
          discountPct: 5,
          periodStart: new Date(),
          periodEnd: sixWeeksFromNow(),
          // hitpayFeeSen intentionally omitted.
          bomyCommissionSen: 300n,
          brandPayoutSen: 2700n,
        })
      }),
    ).rejects.toThrow(/brand_subscriptions_split_chk/)
  })

  it("allows pending rows without fee/split values", async () => {
    const adminId = randomUUID()
    const seller = randomUUID()
    const buyer = randomUUID()
    const storeId = randomUUID()
    const planId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: seller, email: `${seller}@t`, role: "seller_owner" },
        { id: buyer, email: `${buyer}@t`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: seller,
        name: "S",
        slug: `s-${storeId}`,
        status: "active",
      })
      await tx.insert(brandSubscriptionPlans).values({
        id: planId,
        storeId,
        termMonths: 3,
        priceMyrSen: 3000n,
        discountPct: 5,
        isActive: true,
      })
      await tx.insert(brandSubscriptions).values({
        userId: buyer,
        storeId,
        planId,
        status: "pending",
        priceMyrSen: 3000n,
        discountPct: 5,
        periodStart: new Date(),
        periodEnd: sixWeeksFromNow(),
        // No fee, zeroed split — webhook will populate on activation.
        bomyCommissionSen: 0n,
        brandPayoutSen: 0n,
      })
    })
    // No throw → pass.
    expect(true).toBe(true)
  })
})

describe.skipIf(!shouldRun)("Stage 4 — vouchers constraints", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("rejects a 2nd voucher for the same user in the same issued_month", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
      await tx.insert(vouchers).values({
        userId: member,
        code: `V-${randomUUID().slice(0, 8)}`,
        type: "fixed_myr",
        fixedAmountSen: 500n,
        issuedMonth: "2026-05",
        expiresAt: new Date("2026-05-31T23:59:59Z"),
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "dup voucher" }, async (tx) => {
        await tx.insert(vouchers).values({
          userId: member,
          code: `V-${randomUUID().slice(0, 8)}`,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-05",
          expiresAt: new Date("2026-05-31T23:59:59Z"),
        })
      }),
    ).rejects.toThrow(/vouchers_user_month_unique_idx|duplicate key/)
  })

  it("CHECK rejects fixed_myr voucher without fixed_amount_sen", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "bad voucher" }, async (tx) => {
        await tx.insert(vouchers).values({
          userId: member,
          code: `V-${randomUUID().slice(0, 8)}`,
          type: "fixed_myr",
          issuedMonth: "2026-06",
          expiresAt: new Date("2026-06-30T23:59:59Z"),
        })
      }),
    ).rejects.toThrow(/vouchers_type_amount_chk/)
  })

  it("CHECK rejects malformed issued_month", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "bad month" }, async (tx) => {
        await tx.insert(vouchers).values({
          userId: member,
          code: `V-${randomUUID().slice(0, 8)}`,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-13", // invalid
          expiresAt: new Date(),
        })
      }),
    ).rejects.toThrow(/vouchers_issued_month_fmt_chk/)
  })

  it("RLS: member sees own vouchers, not someone else's", async () => {
    const adminId = randomUUID()
    const memberA = randomUUID()
    const memberB = randomUUID()
    const codeA = `V-${randomUUID().slice(0, 8)}`
    const codeB = `V-${randomUUID().slice(0, 8)}`

    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: memberA, email: `${memberA}@t`, role: "buyer" },
        { id: memberB, email: `${memberB}@t`, role: "buyer" },
      ])
      await tx.insert(vouchers).values([
        {
          userId: memberA,
          code: codeA,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-07",
          expiresAt: new Date("2026-07-31T23:59:59Z"),
        },
        {
          userId: memberB,
          code: codeB,
          type: "fixed_myr",
          fixedAmountSen: 500n,
          issuedMonth: "2026-07",
          expiresAt: new Date("2026-07-31T23:59:59Z"),
        },
      ])
    })

    const aView = await withTenant(handle.db, { userId: memberA, userRole: "buyer" }, async (tx) =>
      tx.select({ code: vouchers.code }).from(vouchers),
    )
    const aCodes = aView.map((r) => r.code)
    expect(aCodes).toContain(codeA)
    expect(aCodes).not.toContain(codeB)
  })
})

describe.skipIf(!shouldRun)("Stage 4 — goodie_box_dispatches constraints", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("rejects a 2nd dispatch for the same user in the same quarter", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
      await tx.insert(goodieBoxDispatches).values({
        userId: member,
        quarter: "2026-Q2",
        shippingName: "Charlie",
        shippingAddress: { line1: "1 Main St", city: "KL", postcode: "50000" },
      })
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "dup dispatch" }, async (tx) => {
        await tx.insert(goodieBoxDispatches).values({
          userId: member,
          quarter: "2026-Q2",
          shippingName: "Charlie",
          shippingAddress: { line1: "1 Main St", city: "KL", postcode: "50000" },
        })
      }),
    ).rejects.toThrow(/goodie_box_dispatches_user_quarter_unique_idx|duplicate key/)
  })

  it("CHECK rejects malformed quarter", async () => {
    const adminId = randomUUID()
    const member = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `${adminId}@t`, role: "bomy_admin" },
        { id: member, email: `${member}@t`, role: "buyer" },
      ])
    })

    await expect(
      withAdmin(handle.db, { userId: adminId, reason: "bad quarter" }, async (tx) => {
        await tx.insert(goodieBoxDispatches).values({
          userId: member,
          quarter: "2026-Q5",
          shippingName: "x",
          shippingAddress: {},
        })
      }),
    ).rejects.toThrow(/goodie_box_dispatches_quarter_fmt_chk/)
  })
})

describe.skipIf(!shouldRun)("Stage 4 — revenue_source enum carries processing_fee", () => {
  let handle: Db
  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await handle.close()
  })

  it("accepts a ledger_entries insert with revenue_source = processing_fee", async () => {
    const adminId = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "seed" }, async (tx) => {
      await tx.insert(users).values({ id: adminId, email: `${adminId}@t`, role: "bomy_admin" })
      await tx.insert(ledgerEntries).values({
        transactionId: randomUUID(),
        idempotencyKey: `psp-fee-${randomUUID()}`,
        direction: "debit",
        account: "psp_processing_fee",
        amountMinor: 150n,
        currency: "MYR",
        revenueSource: "processing_fee",
      })
    })
    expect(true).toBe(true)
  })
})
