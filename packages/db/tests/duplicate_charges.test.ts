import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// In-package tests import via relative paths (not the self-referential
// "@bomy/db" export), matching every other packages/db test — a self-import
// triggers TS2209 (ambiguous project root) under the exports map.
import { makeDb } from "../src/client.js"
import * as schema from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("duplicate_charges table", () => {
  let db: ReturnType<typeof makeDb>

  beforeAll(() => {
    db = makeDb({ url: DATABASE_URL as string })
  })
  afterAll(async () => {
    await db.close()
  })

  it("inserts and reads a row under withAdmin; unique on hitpay_payment_id", async () => {
    const paymentId = `pay_${randomUUID()}`
    const id = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test" }, async (tx) => {
      const [row] = await tx
        .insert(schema.duplicateCharges)
        .values({
          subscriptionType: "brand_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          hitpayPaymentId: paymentId,
          amountSen: 50000n,
          currency: "MYR",
        })
        .returning({ id: schema.duplicateCharges.id })
      return row!.id
    })

    const rows = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "read" }, async (tx) =>
      tx.select().from(schema.duplicateCharges).where(eq(schema.duplicateCharges.id, id)),
    )
    expect(rows[0]?.status).toBe("detected")
    expect(rows[0]?.amountSen).toBe(50000n)

    // Duplicate payment id → unique violation (idempotency anchor).
    await expect(
      withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "dup" }, async (tx) => {
        await tx.insert(schema.duplicateCharges).values({
          subscriptionType: "brand_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          hitpayPaymentId: paymentId,
          amountSen: 50000n,
          currency: "MYR",
        })
      }),
    ).rejects.toThrow()

    // No cleanup: duplicate_charges has no DELETE policy by design (records are
    // permanent), so a withAdmin delete would silently affect 0 rows under FORCE
    // RLS. Tests use random ids/payment ids, so leftover rows never collide.
  })

  it("rejects amount_sen <= 0 (check constraint)", async () => {
    await expect(
      withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "neg" }, async (tx) => {
        await tx.insert(schema.duplicateCharges).values({
          subscriptionType: "member_subscription",
          subscriptionId: randomUUID(),
          userId: randomUUID(),
          hitpayPaymentId: `pay_${randomUUID()}`,
          amountSen: 0n,
          currency: "MYR",
        })
      }),
    ).rejects.toThrow()
  })
})
