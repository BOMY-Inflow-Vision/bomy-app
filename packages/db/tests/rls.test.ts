/**
 * RLS integration tests. Proposal v2 §7 guardrail #5.
 *
 * These hit a real Postgres — running these requires:
 *   1. `docker compose up postgres` (infra/docker/compose.yml)
 *   2. `DATABASE_URL` set to that instance
 *   3. Schema + policies applied (not wired in this PR — see README)
 *
 * Until migrations are wired (PR #9) these tests auto-skip with a
 * readable hint. That's intentional — we want the test code checked
 * in now, next to the thing it protects, so the moment migrations
 * land these tests run in CI.
 */
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { stores, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("RLS policies", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("seller A cannot read seller B's store", async () => {
    // Seed two sellers + two stores via admin bypass so the seed
    // itself isn't subject to RLS.
    const sellerA = randomUUID()
    const sellerB = randomUUID()
    const storeAId = randomUUID()
    const storeBId = randomUUID()

    await withAdmin(handle.db, { userId: randomUUID(), reason: "rls test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: sellerA, email: `${sellerA}@test.bomy`, role: "seller_owner" },
        { id: sellerB, email: `${sellerB}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(stores).values([
        {
          id: storeAId,
          ownerId: sellerA,
          name: "Store A",
          slug: `a-${sellerA}`,
          status: "pending",
        },
        {
          id: storeBId,
          ownerId: sellerB,
          name: "Store B",
          slug: `b-${sellerB}`,
          status: "pending",
        },
      ])
    })

    // Seller A's session: should see store A, not store B.
    const aView = await withTenant(
      handle.db,
      { userId: sellerA, userRole: "seller_owner", sellerId: storeAId },
      async (tx) =>
        tx
          .select({ id: stores.id })
          .from(stores)
          .where(sql`true`),
    )
    const aIds = aView.map((r) => r.id)
    expect(aIds).toContain(storeAId)
    expect(aIds).not.toContain(storeBId)
  })

  it("an unset tenant context returns no rows for tenant-scoped tables", async () => {
    // Run a raw select under a transaction with NO app.current_* set.
    // Default-deny should kick in and return zero rows.
    const rows = await handle.db.transaction(async (tx) => {
      // Explicit reset in case a previous test left settings behind at
      // the session scope (DISCARD ALL in withTenant guards against
      // this already, but we belt-and-brace).
      await tx.execute(sql`SELECT set_config('app.current_user_id', '', true)`)
      await tx.execute(sql`SELECT set_config('app.current_user_role', '', true)`)
      return tx.select({ id: users.id }).from(users)
    })
    expect(rows).toHaveLength(0)
  })

  it("withAdmin sees cross-tenant rows the tenant wrapper hides", async () => {
    const seeder = randomUUID()
    const others = [randomUUID(), randomUUID(), randomUUID()]
    await withAdmin(
      handle.db,
      { userId: seeder, reason: "rls test cross-tenant seed" },
      async (tx) => {
        await tx.insert(users).values(
          others.map((id) => ({
            id,
            email: `${id}@test.bomy`,
            role: "buyer" as const,
          })),
        )
      },
    )

    const adminView = await withAdmin(
      handle.db,
      { userId: seeder, reason: "rls test cross-tenant read" },
      async (tx) => tx.select({ id: users.id }).from(users),
    )
    for (const id of others) {
      expect(adminView.map((r) => r.id)).toContain(id)
    }
  })
})

describe("withTenant argument validation", () => {
  it("rejects a non-UUID userId without touching the database", async () => {
    // Uses a dummy db handle — fn should never run.
    const fakeDb = {
      transaction: () => {
        throw new Error("transaction should not be reached")
      },
    } as unknown as Parameters<typeof withTenant>[0]

    await expect(
      withTenant(fakeDb, { userId: "not-a-uuid", userRole: "buyer" }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow(/userId must be a UUID/)
  })

  it("rejects an unknown role without touching the database", async () => {
    const fakeDb = {
      transaction: () => {
        throw new Error("transaction should not be reached")
      },
    } as unknown as Parameters<typeof withTenant>[0]

    await expect(
      withTenant(
        fakeDb,
        {
          userId: "00000000-0000-0000-0000-000000000000",
          userRole: "root" as never,
        },
        () => Promise.resolve(undefined),
      ),
    ).rejects.toThrow(/userRole must be one of/)
  })
})
