import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, type Mock, vi } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
const createRefund = vi.fn()
vi.mock("@bomy/hitpay", async (importActual) => {
  const actual = await importActual<typeof HitPayModule>()
  return { ...actual, HitPayClient: vi.fn(() => ({ createRefund })) }
})

import { auth } from "@/auth"
import { HitPayError } from "@bomy/hitpay"
import type * as HitPayModule from "@bomy/hitpay"
import { refundDuplicateCharge } from "../../src/app/payouts/reconciliation/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("refundDuplicateCharge", () => {
  let db: ReturnType<typeof makeDb>
  let adminId: string

  beforeAll(async () => {
    process.env["HITPAY_API_KEY"] = "k"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    db = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_finance" })
    })
  })
  afterAll(async () => {
    // NOTE: duplicate_charges has no DELETE RLS policy (records are permanent
    // by design). Seeded rows are left in the dev DB; this is acceptable for
    // an append-only forensic table. Each test run seeds new UUIDs.
    await db.close()
  })

  async function seedDup(status: "detected" | "refund_pending" = "detected") {
    const id = randomUUID()
    const paymentId = `pay_${randomUUID()}`
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx.insert(schema.duplicateCharges).values({
        id,
        subscriptionType: "brand_subscription",
        subscriptionId: randomUUID(),
        userId: randomUUID(),
        hitpayPaymentId: paymentId,
        amountSen: 50000n,
        currency: "MYR",
        status,
      })
    })
    return { id, paymentId }
  }
  function read(id: string) {
    return withAdmin(
      db.db,
      { userId: SYSTEM_ACTOR, reason: "read" },
      async (tx) =>
        (
          await tx.select().from(schema.duplicateCharges).where(eq(schema.duplicateCharges.id, id))
        )[0],
    )
  }

  it("happy path: CAS to refund_pending, calls createRefund once, stores refund id", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_finance" } })
    // Use a unique refund id per run: duplicate_charges has no DELETE policy
    // (records are permanent by design), so a static id would violate the unique
    // constraint on re-run.
    const refundId = `ref_${randomUUID()}`
    createRefund.mockResolvedValue({
      id: refundId,
      payment_id: "p",
      amount_refunded: "500.00",
      payment_method: "card",
      status: "pending",
      created_at: "",
    })
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: true })
    expect(createRefund).toHaveBeenCalledTimes(1)
    expect(createRefund.mock.calls[0]![0]).toMatchObject({ amount: "500.00" })
    const row = await read(id)
    expect(row?.status).toBe("refund_pending")
    expect(row?.hitpayRefundId).toBe(refundId)
    expect(row?.resolvedBy).toBe(adminId)
  })

  it("rejects bomy_ops", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_ops" } })
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "FORBIDDEN" })
    expect(createRefund).not.toHaveBeenCalled()
    expect((await read(id))?.status).toBe("detected")
  })

  it("no-op when not detected (already refund_pending)", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const { id } = await seedDup("refund_pending")
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "ALREADY_PROCESSING" })
    expect(createRefund).not.toHaveBeenCalled()
  })

  it("HitPayError reverts status to detected", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    createRefund.mockRejectedValue(new HitPayError("rejected", 422, {}))
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "REFUND_FAILED" })
    expect((await read(id))?.status).toBe("detected")
  })

  it("NOT_FOUND when id does not exist", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_finance" } })
    const res = await refundDuplicateCharge(randomUUID())
    expect(res).toEqual({ ok: false, error: "NOT_FOUND" })
    expect(createRefund).not.toHaveBeenCalled()
  })

  it("unknown/network error → REFUND_OUTCOME_UNKNOWN, row stays refund_pending (no throw)", async () => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    // A plain Error (not HitPayError) = indeterminate outcome.
    createRefund.mockRejectedValue(new Error("ETIMEDOUT"))
    const { id } = await seedDup()
    const res = await refundDuplicateCharge(id)
    expect(res).toEqual({ ok: false, error: "REFUND_OUTCOME_UNKNOWN" })
    expect((await read(id))?.status).toBe("refund_pending")
  })
})
