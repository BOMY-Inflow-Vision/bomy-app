/**
 * Order-payment fan-out for HitPay webhooks (PR #32 spec §3.4 + §3.6).
 *
 * This is the joinpoint where every Bob invariant lands:
 *
 *   B4  PSP fee parsed + persisted before split math (§3.6 step 2)
 *   B5  Failed events route BEFORE amount validation (§3.4 Step D)
 *   B6  Locked-session pending_payment guard before fan-out (§3.4 Step F)
 *   B7  ON CONFLICT DO NOTHING on orders insert; 0 rows → log + commit
 *       (NEVER throw — audit row must persist) (§3.6 step 7)
 *   B8  Empty paymentId on completed → park amount_mismatch (§3.4)
 *   B9  Conditional psp_payment_id spread (delegated to parkPaymentReview
 *       + the step-10 session UPDATE)
 *   B10 Seller-payout and processing-fee ledger legs gated on > 0n (§3.6 step 8)
 *   B11 claimEvent collision detection via warnOnEventCollision (§3.2)
 *
 * Plus Task 6 R1: NegativeSellerPayoutError → park as invalid_commission_config
 * BEFORE any orders/ledger inserts. The two-pass design (compute first,
 * then insert) is what makes the negative-payout parking safe — once
 * we've started inserting orders, throwing would roll back the audit row.
 *
 * Lock order: checkout_sessions → inventory_reservations → product_variants
 *  → vouchers. Matches PR #31 expiry job (FOR UPDATE OF cs, r SKIP LOCKED)
 * and compensateInitiation. See spec §3.3 and pr31-cart-checkout-design.md
 * §5.1. Do not deviate.
 */
import { trace } from "@opentelemetry/api"
import { schema, withAdmin, type Database } from "@bomy/db"
import { and, eq, isNull, sql } from "drizzle-orm"

import {
  allocatePspFee,
  assertJournalBalance,
  assertNonNegativeSellerPayout,
  computeStoreSplit,
  NegativeSellerPayoutError,
  type StorePspInput,
  type StoreSplitResult,
} from "./commission.js"
import { runFailureRelease } from "./failure-release.js"
import { claimEvent } from "./idempotency.js"
import { parkPaymentReview, runConsistencyCheck, warnOnEventCollision } from "./park-review.js"
import { parseSen } from "./parse-sen.js"
import type { CheckoutSessionRow, OrderPaymentArgs } from "./types.js"
import type { NotificationDescriptor, OrderPaymentResult } from "../../notifications/types.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

/** Lock the checkout_session row by psp_payment_request_id for the duration of this tx. */
export async function selectSessionForUpdate(
  tx: Database,
  paymentRequestId: string,
): Promise<CheckoutSessionRow | null> {
  const rows = await tx
    .select()
    .from(schema.checkoutSessions)
    .where(eq(schema.checkoutSessions.pspPaymentRequestId, paymentRequestId))
    .for("update")
    .limit(1)
  return rows[0] ?? null
}

/**
 * Entry point for the order-payment dispatcher branch. Returns
 * `"handled"` when the event was a checkout-session payment (regardless
 * of whether fan-out, parking, or failure-release ran); `"not_order"`
 * when no checkout_session matched the payment_request_id, so the
 * route plugin can fall through to the brand-subscription branch.
 *
 * Everything happens inside a single `withAdmin` transaction. The
 * dispatch lookup (Step 0) runs under admin bypass — withPublicRead
 * can't see checkout_sessions (its nil buyer never matches any
 * session's buyer_id), and a tenant lookup is wrong here because the
 * caller is a webhook with no buyer context.
 */
export async function handleOrderPayment(args: OrderPaymentArgs): Promise<OrderPaymentResult> {
  const notifications: NotificationDescriptor[] = []
  let result: OrderPaymentResult = { result: "not_order", notifications: [] }

  await withAdmin(
    args.app.db.db,
    {
      userId: SYSTEM_ACTOR,
      reason: `hitpay webhook: order payment ${args.eventIdentity.pspEventId}`,
    },
    async (tx) => {
      // Step 0: dispatch lookup. If no checkout_session matches the
      // payment_request_id, this is a brand-subscription / membership
      // event — return without claiming idempotency so the dispatcher
      // can fall through. Cheap, no lock.
      const dispatchRows = await tx
        .select({ id: schema.checkoutSessions.id })
        .from(schema.checkoutSessions)
        .where(eq(schema.checkoutSessions.pspPaymentRequestId, args.paymentRequestId))
        .limit(1)
      if (dispatchRows.length === 0) {
        return // result stays { result: "not_order", notifications: [] }
      }

      // From here on we own the event.
      result = { result: "handled", notifications }

      // Step A: claim idempotency. Comparison against existing happens in Step C.
      const claim = await claimEvent(tx, args.eventIdentity)

      // Step B: lock the session FOR UPDATE.
      const session = await selectSessionForUpdate(tx, args.paymentRequestId)
      if (!session) {
        // Impossible in practice — Step 0 just confirmed the row exists.
        args.app.log.error(
          { paymentRequestId: args.paymentRequestId },
          "hitpay webhook: order payment for vanished checkout_session",
        )
        return
      }

      // OTel: tag the active span so traces correlate to a specific checkout session.
      trace.getActiveSpan()?.setAttribute("bomy.checkout_session_id", session.id)

      // Step C: idempotency hit — collision check + consistency audit.
      if (!claim.owned) {
        warnOnEventCollision(args, claim.existing) // B11
        await runConsistencyCheck(tx, session, args)
        return
      }

      // Step D (B5): failed routes BEFORE amount/fees parsing.
      if (args.status === "failed") {
        await runFailureRelease(tx, session, args, notifications)
        return
      }

      // Step E: unknown non-failed status — park for review.
      // Bob R1: every park path emits event: "order_payment_review" so
      // PR #34's event-keyed alerting picks up parked sessions.
      if (args.status !== "completed" && args.status !== "succeeded") {
        args.app.log.error(
          {
            event: "order_payment_review",
            sessionId: session.id,
            paymentId: args.paymentId,
            eventId: args.eventIdentity.pspEventId,
            reason: "amount_mismatch",
            hitpayStatus: args.status,
          },
          "hitpay webhook: unknown payment_request status — parking for review",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
        return
      }

      // Step E2 (B8): missing payment_id on a completed event.
      if (!args.paymentId) {
        args.app.log.error(
          {
            event: "order_payment_review",
            sessionId: session.id,
            paymentId: args.paymentId,
            eventId: args.eventIdentity.pspEventId,
            reason: "amount_mismatch",
            cause: "missing_payment_id_on_completed",
            paymentRequestId: args.paymentRequestId,
          },
          "hitpay webhook: order payment completed but payment_id missing — parking for review",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
        return
      }

      // Step E3: amount parse + match.
      let amountSen: bigint
      try {
        amountSen = parseSen(args.amountStr)
      } catch {
        args.app.log.error(
          {
            event: "order_payment_review",
            sessionId: session.id,
            paymentId: args.paymentId,
            eventId: args.eventIdentity.pspEventId,
            reason: "amount_mismatch",
            cause: "amount_unparseable",
            amountStr: args.amountStr,
          },
          "hitpay webhook: order payment amount unparseable — parking for review",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
        return
      }
      if (amountSen !== session.totalBuyerPaysSen) {
        args.app.log.error(
          {
            event: "order_payment_review",
            sessionId: session.id,
            paymentId: args.paymentId,
            eventId: args.eventIdentity.pspEventId,
            reason: "amount_mismatch",
            expectedAmount: session.totalBuyerPaysSen.toString(),
            receivedAmount: amountSen.toString(),
          },
          "hitpay webhook: order payment amount mismatch — parking for review",
        )
        await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
        return
      }

      // Step F (B6): second-barrier idempotency guard. Even with a fresh
      // psp_event_id, only one delivery can fan out a given session. If
      // the session is no longer pending_payment, treat as already
      // processed and run the consistency audit instead.
      if (session.status !== "pending_payment") {
        args.app.log.info(
          {
            sessionId: session.id,
            sessionStatus: session.status,
            eventId: args.eventIdentity.pspEventId,
          },
          "hitpay webhook: session already in terminal/review state — skipping fan-out",
        )
        await runConsistencyCheck(tx, session, args)
        return
      }

      // Step G: paid-path fan-out.
      await fanOutPaid(tx, session, args, notifications)
    },
  )

  return result
}

/**
 * Paid-path fan-out. 12 steps per spec §3.6, with a two-pass split
 * around the orders insert so a math problem (negative seller payout
 * from PSP-fee over-allocation, missing/invalid commission config)
 * parks the session in payment_review_required BEFORE any orders or
 * ledger rows are written. The withAdmin audit row stays committed
 * either way — every park path returns rather than throws.
 */
async function fanOutPaid(
  tx: Database,
  session: CheckoutSessionRow,
  args: OrderPaymentArgs,
  notifications: NotificationDescriptor[],
): Promise<void> {
  // Lock order: cs → reservations → variants → vouchers. The session
  // was locked FOR UPDATE at Step B; this explicit FOR UPDATE on the
  // active reservations keeps the lock order convention readable and
  // serialises against the expiry job's SKIP LOCKED scan.
  await tx
    .select({ id: schema.inventoryReservations.id })
    .from(schema.inventoryReservations)
    .where(
      and(
        eq(schema.inventoryReservations.checkoutSessionId, session.id),
        eq(schema.inventoryReservations.status, "active"),
      ),
    )
    .for("update")

  // Step 2 (B4): parse + validate + persist PSP fee.
  let pspFeeSen: bigint
  try {
    pspFeeSen = parseSen(args.feesStr)
  } catch {
    args.app.log.error(
      {
        event: "order_payment_review",
        sessionId: session.id,
        paymentId: args.paymentId,
        eventId: args.eventIdentity.pspEventId,
        reason: "amount_mismatch",
        cause: "psp_fee_unparseable",
        feesStr: args.feesStr,
      },
      "hitpay webhook: psp fee unparseable — parking for review",
    )
    await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
    return
  }
  if (pspFeeSen > session.totalBuyerPaysSen) {
    args.app.log.error(
      {
        event: "order_payment_review",
        sessionId: session.id,
        paymentId: args.paymentId,
        eventId: args.eventIdentity.pspEventId,
        reason: "amount_mismatch",
        cause: "psp_fee_exceeds_gross",
        pspFeeSen: pspFeeSen.toString(),
        totalBuyerPaysSen: session.totalBuyerPaysSen.toString(),
      },
      "hitpay webhook: psp fee greater than gross — parking for review",
    )
    await parkPaymentReview(tx, session, "amount_mismatch", args, notifications)
    return
  }
  await tx
    .update(schema.checkoutSessions)
    .set({ pspFeeSen, updatedAt: sql`now()` })
    .where(eq(schema.checkoutSessions.id, session.id))

  // Step 3: read commission_pct (fail-closed on missing / invalid).
  const pctRows = await tx
    .select({ value: schema.platformConfig.value })
    .from(schema.platformConfig)
    .where(eq(schema.platformConfig.key, "regular_order_commission_pct"))
    .limit(1)
  const pctRaw = pctRows[0]?.value
  const commissionPct = typeof pctRaw === "number" ? pctRaw : null
  if (
    commissionPct === null ||
    !Number.isInteger(commissionPct) ||
    commissionPct < 0 ||
    commissionPct > 100
  ) {
    args.app.log.error(
      {
        event: "order_payment_review",
        sessionId: session.id,
        paymentId: args.paymentId,
        eventId: args.eventIdentity.pspEventId,
        reason: "invalid_commission_config",
        pctValue: pctRaw,
      },
      "hitpay webhook: invalid regular_order_commission_pct — parking for review",
    )
    await parkPaymentReview(tx, session, "invalid_commission_config", args, notifications)
    return
  }

  // Step 4: read checkout_session_stores (asc by storeId for determinism) + items grouped by store.
  const csStores = await tx
    .select()
    .from(schema.checkoutSessionStores)
    .where(eq(schema.checkoutSessionStores.checkoutSessionId, session.id))
    .orderBy(schema.checkoutSessionStores.storeId)

  const csItems = await tx
    .select()
    .from(schema.checkoutSessionItems)
    .where(eq(schema.checkoutSessionItems.checkoutSessionId, session.id))

  const itemsByStore = new Map<string, typeof csItems>()
  for (const item of csItems) {
    const arr = itemsByStore.get(item.storeId) ?? []
    arr.push(item)
    itemsByStore.set(item.storeId, arr)
  }

  // Step 5: allocate PSP fee. Stores must be sorted asc by storeId
  // (already done by Step 4's ORDER BY).
  const storesWithNet: StorePspInput[] = csStores.map((cs) => ({
    storeId: cs.storeId,
    net: cs.discountedSubtotalSen + cs.shippingFeeSen - cs.voucherContributionSen,
  }))
  const allocations = allocatePspFee(storesWithNet, pspFeeSen, session.totalBuyerPaysSen)
  const allocationByStore = new Map(allocations.map((a) => [a.storeId, a.pspFeeAllocatedSen]))

  // Step 6: per-store split (PASS 1 — math only, no DB writes).
  //   Compute split → assertJournalBalance → assertNonNegativeSellerPayout
  //   Catch NegativeSellerPayoutError → park as invalid_commission_config
  //   before any orders or ledger rows are written (Task 6 R1).
  //   Negative bomy_commission_sen logs a warn but does not park (open question #1).
  interface StorePlan {
    csStore: (typeof csStores)[number]
    split: StoreSplitResult
    pspFeeAllocatedSen: bigint
  }
  const plans: StorePlan[] = []
  for (const cs of csStores) {
    const pspFeeAllocatedSen = allocationByStore.get(cs.storeId) ?? 0n
    const split = computeStoreSplit({
      discountedSubtotalSen: cs.discountedSubtotalSen,
      shippingFeeSen: cs.shippingFeeSen,
      voucherContributionSen: cs.voucherContributionSen,
      pspFeeAllocatedSen,
      commissionPct,
    })
    assertJournalBalance(
      split.sellerPayoutSen,
      split.bomyCommissionSen,
      pspFeeAllocatedSen,
      cs.discountedSubtotalSen,
      cs.shippingFeeSen,
      cs.voucherContributionSen,
    )
    try {
      assertNonNegativeSellerPayout(split.sellerPayoutSen, cs.storeId)
    } catch (err) {
      if (err instanceof NegativeSellerPayoutError) {
        args.app.log.error(
          {
            event: "order_payment_review",
            sessionId: session.id,
            paymentId: args.paymentId,
            eventId: args.eventIdentity.pspEventId,
            storeId: err.storeId,
            sellerPayoutSen: err.sellerPayoutSen.toString(),
            pspFeeAllocatedSen: pspFeeAllocatedSen.toString(),
            reason: "invalid_commission_config",
            cause: "negative_seller_payout",
          },
          "hitpay webhook: negative seller_payout (PSP fee over-allocation) — parking for review",
        )
        await parkPaymentReview(tx, session, "invalid_commission_config", args, notifications)
        return
      }
      throw err
    }
    // bomy_commission_negative is logged in Step 8 (after the order
    // INSERT) so the structured payload can include orderId per
    // spec §6.1. Pass1 only collects plans.
    plans.push({ csStore: cs, split, pspFeeAllocatedSen })
  }

  // Step 7 (B7): insert orders (PASS 2 — DB writes start here).
  //   ON CONFLICT (checkout_session_id, store_id) DO NOTHING RETURNING id.
  //   0 rows → unique index caught a duplicate fan-out (Step F guard
  //   bypassed by a future bug). Log error and RETURN — must commit so
  //   the withAdmin audit row persists. Do NOT throw.
  interface InsertedOrder {
    id: string
    storeId: string
    sellerPayoutSen: bigint
    pspFeeAllocatedSen: bigint
    bomyCommissionSen: bigint
  }
  const insertedOrders: InsertedOrder[] = []
  for (const plan of plans) {
    const cs = plan.csStore
    const inserted = await tx
      .insert(schema.orders)
      .values({
        checkoutSessionId: session.id,
        storeId: cs.storeId,
        buyerId: session.userId,
        currency: session.currency,
        shippingAddress: session.shippingAddress,
        shippingFeeSen: cs.shippingFeeSen,
        retailSubtotalSen: cs.retailSubtotalSen,
        brandDiscountSen: cs.brandDiscountSen,
        discountedSubtotalSen: cs.discountedSubtotalSen,
        voucherContributionSen: cs.voucherContributionSen,
        pspFeeAllocatedSen: plan.pspFeeAllocatedSen,
        bomyCommissionSen: plan.split.bomyCommissionSen,
        bomyCommissionPct: commissionPct,
        sellerPayoutSen: plan.split.sellerPayoutSen,
        paymentStatus: "paid",
        fulfilmentStatus: "processing",
      })
      // Targeted at orders_session_store_unique only (Bob R2). A blanket
      // ON CONFLICT DO NOTHING would silently swallow any future unique
      // constraint on the table — anything other than the duplicate-
      // fan-out case should surface as an error.
      .onConflictDoNothing({
        target: [schema.orders.checkoutSessionId, schema.orders.storeId],
      })
      .returning({ id: schema.orders.id })

    if (inserted.length === 0) {
      args.app.log.error(
        {
          event: "webhook_duplicate_fanout_blocked",
          sessionId: session.id,
          storeId: cs.storeId,
          eventId: args.eventIdentity.pspEventId,
        },
        "hitpay webhook: duplicate fan-out blocked by orders_session_store_unique — committing for audit row",
      )
      return // commit transaction; audit row must persist (B7)
    }

    const orderId = inserted[0]!.id
    insertedOrders.push({
      id: orderId,
      storeId: cs.storeId,
      sellerPayoutSen: plan.split.sellerPayoutSen,
      pspFeeAllocatedSen: plan.pspFeeAllocatedSen,
      bomyCommissionSen: plan.split.bomyCommissionSen,
    })

    // Bob R4 (spec §6.1): bomy_commission_negative must include
    // orderId. Emitted here, after the INSERT, so the orderId is
    // available — not in Pass 1 where only storeId existed.
    if (plan.split.bomyCommissionSen < 0n) {
      args.app.log.warn(
        {
          event: "bomy_commission_negative",
          sessionId: session.id,
          orderId,
          storeId: cs.storeId,
          bomyCommissionSen: plan.split.bomyCommissionSen.toString(),
        },
        "hitpay webhook: bomy commission negative (voucher exceeds BOMY share)",
      )
    }

    // Insert order_items for this store.
    const items = itemsByStore.get(cs.storeId) ?? []
    if (items.length > 0) {
      await tx.insert(schema.orderItems).values(
        items.map((item) => ({
          orderId,
          storeId: cs.storeId,
          variantId: item.variantId,
          currency: item.currency,
          productSnapshot: item.productSnapshot,
          variantSnapshot: item.variantSnapshot,
          quantity: item.quantity,
          unitPriceSen: item.unitPriceSen,
          lineTotalSen: item.lineTotalSen,
        })),
      )
    }
  }

  // Step 8: ledger fan-out. Single transactionId = session.id shared
  // across all legs. Per-leg idempotency keys are derived from
  // session/order ids; a same-content replay would write the same
  // keys, but claimEvent at Step A already blocks duplicate deliveries
  // before we reach here.
  await tx.insert(schema.ledgerEntries).values({
    transactionId: session.id,
    idempotencyKey: `checkout:${session.id}:credit`,
    direction: "credit",
    account: "revenue:regular_order",
    amountMinor: session.totalBuyerPaysSen,
    currency: session.currency,
    revenueSource: "regular_order",
    referenceId: session.id,
    referenceType: "checkout_session",
  })
  for (const order of insertedOrders) {
    // B10: seller_payout debit gated on > 0n (the > 0 ledger CHECK).
    // Negative seller_payout was already short-circuited at the
    // Step-6 assertNonNegativeSellerPayout guard above.
    if (order.sellerPayoutSen > 0n) {
      await tx.insert(schema.ledgerEntries).values({
        transactionId: session.id,
        idempotencyKey: `order:${order.id}:seller_payout`,
        direction: "debit",
        account: "payable:seller_payout",
        amountMinor: order.sellerPayoutSen,
        currency: session.currency,
        revenueSource: "regular_order",
        referenceId: order.id,
        referenceType: "order",
      })
    }
    // B10: processing_fee debit gated on > 0n.
    if (order.pspFeeAllocatedSen > 0n) {
      await tx.insert(schema.ledgerEntries).values({
        transactionId: session.id,
        idempotencyKey: `order:${order.id}:processing_fee`,
        direction: "debit",
        account: "expense:processing_fee",
        amountMinor: order.pspFeeAllocatedSen,
        currency: session.currency,
        revenueSource: "processing_fee",
        referenceId: order.id,
        referenceType: "order",
      })
    }
  }

  // Step 9: voucher claim. WHERE binds ownership + not-redeemed so a
  // racing flow can't double-claim. If 0 rows returned, the voucher
  // reservation was lost mid-tx (data integrity issue) — park as
  // voucher_claim_failed. Orders + ledger STAY committed because
  // money has already moved; admin reconciles via the admin console.
  let voucherClaimed = false
  let voucherClaimFailed = false
  if (session.voucherId) {
    const claimed = await tx
      .update(schema.vouchers)
      .set({
        redeemedCheckoutSessionId: session.id,
        redeemedAt: sql`now()`,
        reservedCheckoutSessionId: null,
      })
      .where(
        and(
          eq(schema.vouchers.id, session.voucherId),
          eq(schema.vouchers.reservedCheckoutSessionId, session.id),
          isNull(schema.vouchers.redeemedAt),
        ),
      )
      .returning({ id: schema.vouchers.id })
    if (claimed.length === 0) {
      voucherClaimFailed = true
      args.app.log.error(
        {
          event: "voucher_claim_failed",
          sessionId: session.id,
          voucherId: session.voucherId,
          paymentId: args.paymentId,
        },
        "hitpay webhook: voucher claim failed — fan-out committed, parking for review",
      )
      // Park the session BEFORE step 10 so the WHERE-status guard on
      // step 10's UPDATE silently no-ops. Do NOT skip step 11 — the
      // reservations still need to be marked converted to match the
      // committed orders.
      await parkPaymentReview(tx, session, "voucher_claim_failed", args, notifications, {
        emitNotification: false,
      })
    } else {
      voucherClaimed = true
    }
  }

  // Step 10: mark session paid. WHERE-guarded so the voucher_claim_failed
  // park above (which moved status off pending_payment) silently no-ops.
  await tx
    .update(schema.checkoutSessions)
    .set({
      status: "paid",
      pspPaymentId: args.paymentId,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.checkoutSessions.id, session.id),
        eq(schema.checkoutSessions.status, "pending_payment"),
      ),
    )

  // Step 11: convert reservations active → converted. Runs regardless
  // of voucher_claim_failed because the orders were created.
  await tx
    .update(schema.inventoryReservations)
    .set({ status: "converted", updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.inventoryReservations.checkoutSessionId, session.id),
        eq(schema.inventoryReservations.status, "active"),
      ),
    )

  // Step 12: structured success log (or paid-with-voucher-claim-failed log).
  const totalBomyCommissionSen = plans.reduce((acc, p) => acc + p.split.bomyCommissionSen, 0n)
  args.app.log.info(
    {
      event: "order_payment_paid",
      sessionId: session.id,
      paymentId: args.paymentId,
      eventId: args.eventIdentity.pspEventId,
      ordersCount: insertedOrders.length,
      bomyCommissionSen: totalBomyCommissionSen.toString(),
      pspFeeSen: pspFeeSen.toString(),
      voucherClaimed,
      voucherClaimFailed,
    },
    voucherClaimFailed
      ? "hitpay webhook: order payment paid — voucher claim failed (in review)"
      : "hitpay webhook: order payment paid",
  )

  notifications.push({
    type: "order_paid",
    sessionId: session.id,
    buyerId: session.userId,
    orderIds: insertedOrders.map((o) => o.id),
    voucherClaimFailed,
  })
  if (voucherClaimFailed && session.voucherId) {
    notifications.push({
      type: "voucher_claim_failed",
      sessionId: session.id,
      voucherId: session.voucherId,
    })
  }
}
