/**
 * Integration tests: a still-valid JWT whose account no longer exists (deleted user).
 *
 * Before PR #210 the checkout flag read wrote an admin_bypass_audit row with the session user as
 * actor, and its FK error doubled as an "account still exists" check. That write is gone, so
 * checkout now runs `sessionAccountExists` (read-only, RLS users_self_read, no withAdmin).
 *
 * Read-only against the shared dev DB: the ghost id never gets a row, and every action under test
 * must return before its first write. The only writes are the usual withAdmin audit rows from the
 * existing-user lookup and the before/after counts.
 *
 * A deleted account and a never-created id are the same DB state (no users row; FKs to users
 * cascade or restrict on delete, so nothing keyed by the id remains), so a random UUID stands in
 * for the deleted user.
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"
import { eq, sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { auth } from "@/auth"

import {
  cancelPendingCheckout,
  initiateCheckout,
  priceCheckoutPreview,
} from "../../src/app/checkout/actions"
import { sessionAccountExists } from "../../src/lib/session-account"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("stale session for a deleted account (checkout)", () => {
  let testDb: ReturnType<typeof makeDb>
  const ghostId = randomUUID()
  let existingBuyerId: string

  async function rateLimitRowsFor(userId: string): Promise<number> {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "stale-session test read" }, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.actionRateLimits)
        .where(eq(schema.actionRateLimits.userId, userId))
        .then((r) => r[0]!.n),
    )
  }

  async function auditRowsFor(userId: string): Promise<number> {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "stale-session test read" }, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.actorUserId, userId))
        .then((r) => r[0]!.n),
    )
  }

  beforeAll(async () => {
    testDb = makeDb()
    const rows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "stale-session test: pick an existing buyer" },
      (tx) =>
        tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.role, "buyer"))
          .limit(1),
    )
    if (!rows[0]) throw new Error("no buyer row in the local DB to test the positive case")
    existingBuyerId = rows[0].id
  })

  beforeEach(() => {
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ user: { id: ghostId, role: "buyer" } })
  })

  it("the check runs as bomy_app under RLS: own row visible, a missing row is not", async () => {
    const who = await testDb.sql<Array<{ u: string }>>`select current_user as u`
    expect(who[0]!.u).toBe("bomy_app")

    expect(await sessionAccountExists({ id: existingBuyerId, role: "buyer" })).toBe(true)
    expect(await sessionAccountExists({ id: ghostId, role: "buyer" })).toBe(false)
  })

  it("RLS users_self_read: a buyer cannot see another user's row (the check is self-only)", async () => {
    const rows = await withTenant(testDb.db, { userId: ghostId, userRole: "buyer" }, (tx) =>
      tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, existingBuyerId)),
    )
    expect(rows).toEqual([])
  })

  it("the check writes no audit row", async () => {
    const before = await auditRowsFor(existingBuyerId)
    await sessionAccountExists({ id: existingBuyerId, role: "buyer" })
    expect(await auditRowsFor(existingBuyerId)).toBe(before)
  })

  it("priceCheckoutPreview → UNAUTHENTICATED before the rate limiter (no FK error, no row)", async () => {
    const r = await priceCheckoutPreview({
      items: [{ variantId: randomUUID(), quantity: 1 }],
      voucherId: null,
    })
    expect(r).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(await rateLimitRowsFor(ghostId)).toBe(0)
  })

  it("initiateCheckout → UNAUTHENTICATED before the rate limiter and any audited write", async () => {
    const r = await initiateCheckout({
      items: [{ variantId: randomUUID(), quantity: 1 }],
      voucherId: null,
      shippingAddress: {},
    })
    expect(r).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(await rateLimitRowsFor(ghostId)).toBe(0)
    expect(await auditRowsFor(ghostId)).toBe(0)
  })

  it("cancelPendingCheckout → UNAUTHENTICATED before compensateInitiation's audited write", async () => {
    const r = await cancelPendingCheckout(randomUUID())
    expect(r).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(await auditRowsFor(ghostId)).toBe(0)
  })
})
