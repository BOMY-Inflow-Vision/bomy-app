/**
 * RLS integration tests. Proposal v2 §7 guardrail #5.
 *
 * These hit a real Postgres — running these requires:
 *   1. `docker compose up postgres` (infra/docker/compose.yml)
 *   2. `DATABASE_APP_URL` pointed at the bomy_app non-superuser role,
 *      OR `DATABASE_URL` as fallback (but superuser connections bypass
 *      RLS — the RLS tests will fail if only superuser URL is provided)
 *   3. Schema + policies applied via `pnpm --filter @bomy/db migrate`
 *
 * bomy_app is created by infra/docker/postgres-init/01_app_role.sql on
 * fresh Docker volumes. For existing volumes apply it manually:
 *   docker exec -i bomy_postgres psql -U bomy -d bomy \
 *     < infra/docker/postgres-init/01_app_role.sql
 * Then re-run policies.sql to grant bomy_app table access.
 */
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { sellerInquiries, stores, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

// RLS tests MUST run as a non-superuser so policies are enforced.
// DATABASE_APP_URL should point to the bomy_app role (no BYPASSRLS).
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
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

describe.skipIf(!shouldRun)("Stage 3 schema", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("inserts a seller inquiry and reads it back via withAdmin", async () => {
    const adminId = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "test seed user" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" })
    })

    const inquiryId = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "test insert inquiry" }, async (tx) => {
      await tx.insert(sellerInquiries).values({
        id: inquiryId,
        name: "Test Seller",
        email: "seller@test.bomy",
        contactNumber: "+60123456789",
        companyName: "Test Sdn Bhd",
        storeName: "Test Store",
      })
    })

    const rows = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read inquiry" },
      async (tx) =>
        tx
          .select()
          .from(sellerInquiries)
          .where(sql`${sellerInquiries.id} = ${inquiryId}`),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.storeName).toBe("Test Store")
    expect(rows[0]!.message).toBeNull()
  })

  it("creates a store with description and approves it, updating user role atomically", async () => {
    const adminId = randomUUID()
    const buyerId = randomUUID()
    const storeId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: buyerId, email: `buyer-${buyerId}@test.bomy`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: buyerId,
        name: "Desc Store",
        slug: `desc-${storeId}`,
        description: "A store with a description",
        status: "pending",
      })
    })

    const [before] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read" },
      async (tx) =>
        tx
          .select({ description: stores.description, status: stores.status })
          .from(stores)
          .where(sql`${stores.id} = ${storeId}`),
    )
    expect(before!.description).toBe("A store with a description")
    expect(before!.status).toBe("pending")

    await withAdmin(handle.db, { userId: adminId, reason: "test approve store" }, async (tx) => {
      await tx
        .update(stores)
        .set({ status: "active", updatedAt: new Date() })
        .where(sql`${stores.id} = ${storeId}`)
      await tx
        .update(users)
        .set({ role: "seller_owner", updatedAt: new Date() })
        .where(sql`${users.id} = ${buyerId}`)
    })

    const [afterStore] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read after approve" },
      async (tx) =>
        tx
          .select({ status: stores.status })
          .from(stores)
          .where(sql`${stores.id} = ${storeId}`),
    )
    const [afterUser] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read user after approve" },
      async (tx) =>
        tx
          .select({ role: users.role })
          .from(users)
          .where(sql`${users.id} = ${buyerId}`),
    )
    expect(afterStore!.status).toBe("active")
    expect(afterUser!.role).toBe("seller_owner")
  })

  it("suspending a store does not change the user role", async () => {
    const adminId = randomUUID()
    const sellerId = randomUUID()
    const storeId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `admin2-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: sellerId, email: `seller-${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Suspend Store",
        slug: `susp-${storeId}`,
        status: "active",
      })
    })

    await withAdmin(handle.db, { userId: adminId, reason: "test suspend" }, async (tx) => {
      await tx
        .update(stores)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(sql`${stores.id} = ${storeId}`)
    })

    const [afterUser] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read after suspend" },
      async (tx) =>
        tx
          .select({ role: users.role })
          .from(users)
          .where(sql`${users.id} = ${sellerId}`),
    )
    expect(afterUser!.role).toBe("seller_owner")
  })

  it("hard-deletes a seller inquiry", async () => {
    const adminId = randomUUID()
    const inquiryId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "test seed admin" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: adminId, email: `admin3-${adminId}@test.bomy`, role: "bomy_admin" })
    })

    await withAdmin(handle.db, { userId: adminId, reason: "test insert" }, async (tx) => {
      await tx.insert(sellerInquiries).values({
        id: inquiryId,
        name: "Del Seller",
        email: "del@test.bomy",
        contactNumber: "+601",
        companyName: "Del Co",
        storeName: "Del Store",
      })
    })

    await withAdmin(handle.db, { userId: adminId, reason: "test delete" }, async (tx) => {
      await tx.delete(sellerInquiries).where(sql`${sellerInquiries.id} = ${inquiryId}`)
    })

    const rows = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test confirm deleted" },
      async (tx) =>
        tx
          .select()
          .from(sellerInquiries)
          .where(sql`${sellerInquiries.id} = ${inquiryId}`),
    )
    expect(rows).toHaveLength(0)
  })
})
