/**
 * RLS integration tests for body_image_upload_log.
 *
 * Requires a real Postgres with the bomy_app role and RLS applied:
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/db test --run tests/body-image-upload-log-rls.test.ts
 */
import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { bodyImageUploadLog, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

// RLS tests MUST run as a non-superuser so policies are enforced.
// DATABASE_APP_URL should point to the bomy_app role (no BYPASSRLS).
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("body_image_upload_log RLS", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("self insert/select — seller can INSERT their own row and SELECT it back", async () => {
    const sellerId = randomUUID()

    // Seed a seller user via withAdmin so we have a valid FK target.
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test seed" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: sellerId, email: `${sellerId}@rls-test.bomy`, role: "seller_owner" })
    })

    // Insert the log row as the seller via withTenant.
    const logId = randomUUID()
    await withTenant(handle.db, { userId: sellerId, userRole: "seller_owner" }, async (tx) => {
      await tx.insert(bodyImageUploadLog).values({ id: logId, userId: sellerId })
    })

    // Select it back via withTenant — should find exactly one row.
    const rows = await withTenant(
      handle.db,
      { userId: sellerId, userRole: "seller_owner" },
      async (tx) =>
        tx
          .select({ id: bodyImageUploadLog.id })
          .from(bodyImageUploadLog)
          .where(eq(bodyImageUploadLog.id, logId)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(logId)

    // Cleanup.
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test cleanup" }, async (tx) => {
      await tx.delete(bodyImageUploadLog).where(eq(bodyImageUploadLog.id, logId))
    })
  })

  it("cross-user isolation — seller A cannot SELECT seller B's rows", async () => {
    const sellerA = randomUUID()
    const sellerB = randomUUID()

    // Seed both sellers.
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: sellerA, email: `${sellerA}@rls-test.bomy`, role: "seller_owner" },
        { id: sellerB, email: `${sellerB}@rls-test.bomy`, role: "seller_owner" },
      ])
    })

    // Seller B inserts their own row.
    const bLogId = randomUUID()
    await withTenant(handle.db, { userId: sellerB, userRole: "seller_owner" }, async (tx) => {
      await tx.insert(bodyImageUploadLog).values({ id: bLogId, userId: sellerB })
    })

    // Seller A's session should not see seller B's row.
    const aView = await withTenant(
      handle.db,
      { userId: sellerA, userRole: "seller_owner" },
      async (tx) =>
        tx
          .select({ id: bodyImageUploadLog.id })
          .from(bodyImageUploadLog)
          .where(eq(bodyImageUploadLog.id, bLogId)),
    )
    expect(aView).toHaveLength(0)

    // Cleanup.
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test cleanup" }, async (tx) => {
      await tx.delete(bodyImageUploadLog).where(eq(bodyImageUploadLog.id, bLogId))
    })
  })

  it("forged-user INSERT rejection — WITH CHECK blocks inserting a different user_id", async () => {
    const realSeller = randomUUID()
    const forgedUserId = randomUUID()

    // Seed the real seller (forgedUserId doesn't need a row — the FK will catch it
    // if WITH CHECK doesn't; but the WITH CHECK fires first).
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test seed" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: realSeller, email: `${realSeller}@rls-test.bomy`, role: "seller_owner" })
    })

    // Attempt to insert a row with a user_id that doesn't match the session user.
    // WITH CHECK (user_id = app.current_user_id()) should reject this.
    await expect(
      withTenant(handle.db, { userId: realSeller, userRole: "seller_owner" }, async (tx) => {
        await tx.insert(bodyImageUploadLog).values({ id: randomUUID(), userId: forgedUserId })
      }),
    ).rejects.toThrow()
  })

  it("FORCE RLS bypass guard — bomy_app with mismatched context cannot see another user's row", async () => {
    // FORCE RLS means even the bomy_app connection (used by tests) is subject to policies.
    // This test verifies that when app.current_user_id is set to userA, userB's row is invisible
    // even though both connect through the same bomy_app database role.
    const userA = randomUUID()
    const userB = randomUUID()

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: userA, email: `${userA}@rls-test.bomy`, role: "seller_owner" },
        { id: userB, email: `${userB}@rls-test.bomy`, role: "seller_owner" },
      ])
    })

    // userB inserts their own log row.
    const bLogId = randomUUID()
    await withTenant(handle.db, { userId: userB, userRole: "seller_owner" }, async (tx) => {
      await tx.insert(bodyImageUploadLog).values({ id: bLogId, userId: userB })
    })

    // With userA context active on the bomy_app connection, userB's row must not appear.
    const result = await withTenant(
      handle.db,
      { userId: userA, userRole: "seller_owner" },
      async (tx) =>
        tx
          .select({ id: bodyImageUploadLog.id })
          .from(bodyImageUploadLog)
          .where(sql`true`),
    )
    const ids = result.map((r) => r.id)
    expect(ids).not.toContain(bLogId)

    // Cleanup.
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test cleanup" }, async (tx) => {
      await tx.delete(bodyImageUploadLog).where(eq(bodyImageUploadLog.id, bLogId))
    })
  })

  it("withAdmin cleanup deletion — SYSTEM_ACTOR can DELETE a row; confirms the admin DELETE policy works", async () => {
    const sellerId = randomUUID()

    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "rls test seed" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: sellerId, email: `${sellerId}@rls-test.bomy`, role: "seller_owner" })
    })

    // Insert row via the seller.
    const logId = randomUUID()
    await withTenant(handle.db, { userId: sellerId, userRole: "seller_owner" }, async (tx) => {
      await tx.insert(bodyImageUploadLog).values({ id: logId, userId: sellerId })
    })

    // Confirm row exists via withAdmin.
    const before = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "rls test read before delete" },
      async (tx) =>
        tx
          .select({ id: bodyImageUploadLog.id })
          .from(bodyImageUploadLog)
          .where(eq(bodyImageUploadLog.id, logId)),
    )
    expect(before).toHaveLength(1)

    // Delete via withAdmin (simulating nightly cleanup job).
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "rls test cleanup delete" },
      async (tx) => {
        await tx.delete(bodyImageUploadLog).where(eq(bodyImageUploadLog.id, logId))
      },
    )

    // Confirm row is gone.
    const after = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "rls test read after delete" },
      async (tx) =>
        tx
          .select({ id: bodyImageUploadLog.id })
          .from(bodyImageUploadLog)
          .where(eq(bodyImageUploadLog.id, logId)),
    )
    expect(after).toHaveLength(0)
  })
})
