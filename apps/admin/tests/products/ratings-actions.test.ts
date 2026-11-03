/**
 * adminSetRating / adminRemoveRating integration tests: role gate (ops + admin only), input
 * validation, the soft delete, the aggregate, the audit row, and concurrent writes on one product.
 *
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     node_modules/.bin/vitest --run tests/products/ratings-actions.test.ts
 */
import { randomUUID } from "node:crypto"

import { and, eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, recomputeProductRating, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

import { adminRemoveRating, adminSetRating } from "../../src/app/products/[id]/ratings-actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock
const mockRevalidatePath = revalidatePath as unknown as Mock

type Tx = Parameters<Parameters<typeof withAdmin>[2]>[0]

describe.skipIf(!shouldRun)("admin rating override actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let opsId: string
  let adminId: string
  let financeId: string
  let sellerId: string
  let storeId: string
  const buyerIds: string[] = []
  const trackedProductIds = new Set<string>()

  async function adminTx<T>(reason: string, fn: (tx: Tx) => Promise<T>) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason }, fn)
  }

  function signIn(userId: string, role: string) {
    mockAuth.mockResolvedValue({ user: { id: userId, role } })
  }

  async function newBuyer(): Promise<string> {
    const id = randomUUID()
    await adminTx("seed buyer", async (tx) => {
      await tx.insert(schema.users).values({ id, email: `${id}@test.bomy`, role: "buyer" })
    })
    buyerIds.push(id)
    return id
  }

  async function seedProduct(): Promise<string> {
    const productId = randomUUID()
    await adminTx("seed product", async (tx) => {
      await tx.insert(schema.products).values({
        id: productId,
        storeId,
        name: "Admin Rated Product",
        slug: `admin-rated-${productId.slice(0, 8)}`,
        status: "active",
      })
    })
    trackedProductIds.add(productId)
    return productId
  }

  /** Seeds a rating 48 h old (outside the buyer window) and recomputes the aggregate. */
  async function seedRating(productId: string, stars: number, userId?: string): Promise<string> {
    const buyer = userId ?? (await newBuyer())
    return adminTx("seed rating", async (tx) => {
      const [row] = await tx
        .insert(schema.productRatings)
        .values({
          productId,
          userId: buyer,
          stars,
          createdAt: sql`now() - interval '48 hours'`,
          updatedAt: sql`now() - interval '48 hours'`,
        })
        .returning({ id: schema.productRatings.id })
      await recomputeProductRating(tx, productId)
      return row!.id
    })
  }

  async function readRating(ratingId: string) {
    return adminTx("read rating", async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.productRatings)
        .where(eq(schema.productRatings.id, ratingId))
      return row
    })
  }

  async function readAggregate(productId: string) {
    return adminTx("read aggregate", async (tx) => {
      const [row] = await tx
        .select({ avg: schema.products.ratingAvg, count: schema.products.ratingCount })
        .from(schema.products)
        .where(eq(schema.products.id, productId))
      return row
    })
  }

  async function auditRows(actorId: string, ratingId: string) {
    return adminTx("read audit", async (tx) =>
      tx
        .select({ reason: schema.adminBypassAudit.reason })
        .from(schema.adminBypassAudit)
        .where(
          and(
            eq(schema.adminBypassAudit.actorUserId, actorId),
            like(schema.adminBypassAudit.reason, `%${ratingId}%`),
          ),
        ),
    )
  }

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    opsId = randomUUID()
    adminId = randomUUID()
    financeId = randomUUID()
    sellerId = randomUUID()
    storeId = randomUUID()

    await adminTx("setup", async (tx) => {
      await tx.insert(schema.users).values([
        { id: opsId, email: `ops-${opsId}@test.bomy`, role: "bomy_ops" },
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: financeId, email: `fin-${financeId}@test.bomy`, role: "bomy_finance" },
        { id: sellerId, email: `seller-${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Admin Rating Store",
        slug: `admin-rating-${storeId.slice(0, 8)}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await adminTx("cleanup", async (tx) => {
      if (trackedProductIds.size > 0) {
        // Ratings cascade with the product.
        await tx.delete(schema.products).where(inArray(schema.products.id, [...trackedProductIds]))
      }
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await testDb.close()
  })

  // ── Set stars ─────────────────────────────────────────────────────────────

  it.each([
    ["bomy_ops", () => opsId],
    ["bomy_admin", () => adminId],
  ])(
    "%s changes stars on a rating older than 24 h; aggregate updates, created_at kept",
    async (role, who) => {
      const productId = await seedProduct()
      const ratingId = await seedRating(productId, 1)
      await seedRating(productId, 5)
      const before = await readRating(ratingId)

      signIn(who(), role)
      const result = await adminSetRating(ratingId, 4, "  seller dispute ticket 12  ")
      expect(result).toEqual({ ok: true, avg: "4.50", count: 2 })

      const after = await readRating(ratingId)
      expect(after?.stars).toBe(4)
      expect(after?.createdAt.getTime()).toBe(before!.createdAt.getTime())
      expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())
      expect(after?.removedAt).toBeNull()
      expect(await readAggregate(productId)).toEqual({ avg: "4.50", count: 2 })

      const audit = await auditRows(who(), ratingId)
      expect(audit).toHaveLength(1)
      expect(audit[0]!.reason).toBe(`admin rating set ${ratingId}: seller dispute ticket 12`)
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/products/${productId}`)
    },
  )

  it.each([
    ["bomy_finance", () => financeId],
    ["seller_owner", () => sellerId],
    ["buyer", () => buyerIds[0]!],
  ])("%s gets UNAUTHORIZED for both actions and nothing changes", async (role, who) => {
    const productId = await seedProduct()
    const ratingId = await seedRating(productId, 2)
    const before = await readRating(ratingId)

    signIn(who(), role)
    expect(await adminSetRating(ratingId, 5, "reason")).toEqual({
      ok: false,
      error: "UNAUTHORIZED",
    })
    expect(await adminRemoveRating(ratingId, "reason")).toEqual({
      ok: false,
      error: "UNAUTHORIZED",
    })

    expect(await readRating(ratingId)).toEqual(before)
    expect(await readAggregate(productId)).toEqual({ avg: "2.00", count: 1 })
    expect(await auditRows(who(), ratingId)).toHaveLength(0)
  })

  it("signed-out caller gets UNAUTHORIZED", async () => {
    mockAuth.mockResolvedValue(null)
    expect(await adminSetRating(randomUUID(), 3, "reason")).toEqual({
      ok: false,
      error: "UNAUTHORIZED",
    })
    expect(await adminRemoveRating(randomUUID(), "reason")).toEqual({
      ok: false,
      error: "UNAUTHORIZED",
    })
  })

  it.each([[""], ["   "], ["\n\t"]])("reason %j → REASON_REQUIRED, nothing written", async (r) => {
    const productId = await seedProduct()
    const ratingId = await seedRating(productId, 3)
    signIn(adminId, "bomy_admin")
    expect(await adminSetRating(ratingId, 5, r)).toEqual({ ok: false, error: "REASON_REQUIRED" })
    expect(await adminRemoveRating(ratingId, r)).toEqual({ ok: false, error: "REASON_REQUIRED" })
    const row = await readRating(ratingId)
    expect(row?.stars).toBe(3)
    expect(row?.removedAt).toBeNull()
  })

  it("a non-string reason → REASON_REQUIRED", async () => {
    signIn(adminId, "bomy_admin")
    expect(await adminSetRating(randomUUID(), 5, undefined as unknown as string)).toEqual({
      ok: false,
      error: "REASON_REQUIRED",
    })
  })

  it.each([[0], [6], [2.5], ["5"], [null], [Number.NaN]])(
    "stars %j → INVALID_STARS",
    async (stars) => {
      const productId = await seedProduct()
      const ratingId = await seedRating(productId, 3)
      signIn(adminId, "bomy_admin")
      expect(await adminSetRating(ratingId, stars, "reason")).toEqual({
        ok: false,
        error: "INVALID_STARS",
      })
      expect((await readRating(ratingId))?.stars).toBe(3)
    },
  )

  it("unknown or malformed rating id → NOT_FOUND (no Postgres error)", async () => {
    signIn(adminId, "bomy_admin")
    expect(await adminSetRating(randomUUID(), 3, "reason")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    })
    expect(await adminRemoveRating(randomUUID(), "reason")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    })
    expect(await adminSetRating("not-a-uuid", 3, "reason")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    })
    expect(await adminRemoveRating("'; drop table x; --", "reason")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    })
  })

  it("caps a very long reason at 500 characters", async () => {
    const productId = await seedProduct()
    const ratingId = await seedRating(productId, 3)
    signIn(adminId, "bomy_admin")
    const result = await adminRemoveRating(ratingId, "x".repeat(2000))
    expect(result.ok).toBe(true)
    expect((await readRating(ratingId))?.removalReason).toBe("x".repeat(500))
  })

  // ── Remove ────────────────────────────────────────────────────────────────

  it("remove soft-deletes the row and drops it from the aggregate; audited", async () => {
    const productId = await seedProduct()
    const ratingId = await seedRating(productId, 1)
    await seedRating(productId, 5)
    expect(await readAggregate(productId)).toEqual({ avg: "3.00", count: 2 })

    signIn(opsId, "bomy_ops")
    const result = await adminRemoveRating(ratingId, "  buyer left it without cause  ")
    expect(result).toEqual({ ok: true, avg: "5.00", count: 1 })

    const row = await readRating(ratingId)
    expect(row).toBeDefined() // no hard delete
    expect(row?.removedAt).toBeInstanceOf(Date)
    expect(row?.removedBy).toBe(opsId)
    expect(row?.removalReason).toBe("buyer left it without cause")
    expect(row?.stars).toBe(1)
    expect(await readAggregate(productId)).toEqual({ avg: "5.00", count: 1 })

    const audit = await auditRows(opsId, ratingId)
    expect(audit).toHaveLength(1)
    expect(audit[0]!.reason).toBe(`admin rating remove ${ratingId}: buyer left it without cause`)
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/products/${productId}`)
  })

  it("removing the only rating resets the aggregate to 0 / 0", async () => {
    const productId = await seedProduct()
    const ratingId = await seedRating(productId, 4)
    signIn(adminId, "bomy_admin")
    expect(await adminRemoveRating(ratingId, "dispute")).toEqual({
      ok: true,
      avg: "0.00",
      count: 0,
    })
  })

  it("removing twice → ALREADY_REMOVED; setting stars on a removed rating → ALREADY_REMOVED", async () => {
    const productId = await seedProduct()
    const ratingId = await seedRating(productId, 2)
    signIn(adminId, "bomy_admin")
    expect((await adminRemoveRating(ratingId, "first")).ok).toBe(true)
    const removed = await readRating(ratingId)

    expect(await adminRemoveRating(ratingId, "second")).toEqual({
      ok: false,
      error: "ALREADY_REMOVED",
    })
    expect(await adminSetRating(ratingId, 5, "restore")).toEqual({
      ok: false,
      error: "ALREADY_REMOVED",
    })
    expect(await readRating(ratingId)).toEqual(removed)
    expect(await readAggregate(productId)).toEqual({ avg: "0.00", count: 0 })
    // withAdmin audits every bypass transaction, refused attempts included (same as the other
    // admin actions): the removal plus the two refused calls.
    const audit = (await auditRows(adminId, ratingId)).map((r) => r.reason).sort()
    expect(audit).toEqual([
      `admin rating remove ${ratingId}: first`,
      `admin rating remove ${ratingId}: second`,
      `admin rating set ${ratingId}: restore`,
    ])
  })

  it("after removal the buyer's row stays blocking: the buyer write path refuses it (DB state)", async () => {
    // Task 3's rateProduct lives in apps/web and cannot be imported here; it returns
    // RATING_REMOVED exactly when the (product, user) row has removed_at set. Assert that state and
    // that the buyer's upsert (same SQL guard as rateProduct) changes nothing.
    const productId = await seedProduct()
    const buyer = await newBuyer()
    const ratingId = await seedRating(productId, 1, buyer)
    signIn(adminId, "bomy_admin")
    expect((await adminRemoveRating(ratingId, "dispute")).ok).toBe(true)

    const written = await adminTx(
      "buyer-style upsert",
      async (tx) =>
        (await tx.execute(sql`
        INSERT INTO product_ratings (product_id, user_id, stars)
        VALUES (${productId}, ${buyer}, 5)
        ON CONFLICT (product_id, user_id) DO UPDATE
           SET stars = excluded.stars, updated_at = now()
         WHERE product_ratings.removed_at IS NULL
        RETURNING id
      `)) as unknown as Array<{ id: string }>,
    )
    expect(written).toHaveLength(0)
    const row = await readRating(ratingId)
    expect(row?.removedAt).not.toBeNull()
    expect(row?.stars).toBe(1)
    expect(await readAggregate(productId)).toEqual({ avg: "0.00", count: 0 })
  })

  // ── Concurrency ───────────────────────────────────────────────────────────

  it("two concurrent admin edits on different ratings of one product both land", async () => {
    for (let i = 0; i < 5; i++) {
      const productId = await seedProduct()
      const r1 = await seedRating(productId, 1)
      const r2 = await seedRating(productId, 1)
      signIn(adminId, "bomy_admin")
      const [a, b] = await Promise.all([
        adminSetRating(r1, 5, "race a"),
        adminSetRating(r2, 4, "race b"),
      ])
      expect(a.ok && b.ok).toBe(true)
      expect(await readAggregate(productId)).toEqual({ avg: "4.50", count: 2 })
    }
  })

  it("admin removal alongside a different buyer's write on the same product: both reflected", async () => {
    for (let i = 0; i < 5; i++) {
      const productId = await seedProduct()
      const removeId = await seedRating(productId, 1)
      const otherBuyer = await newBuyer()
      signIn(adminId, "bomy_admin")

      // Mirrors rateProduct's order: lock the product, then write product_ratings, then recompute.
      const buyerWrite = withAdmin(
        testDb.db,
        { userId: otherBuyer, reason: "buyer rateProduct" },
        async (tx) => {
          await tx.execute(sql`SELECT 1 FROM products WHERE id = ${productId} FOR UPDATE`)
          await tx.execute(sql`
            INSERT INTO product_ratings (product_id, user_id, stars)
            VALUES (${productId}, ${otherBuyer}, 4)
            ON CONFLICT (product_id, user_id) DO NOTHING
          `)
          return recomputeProductRating(tx, productId)
        },
      )
      const [removed] = await Promise.all([adminRemoveRating(removeId, "race"), buyerWrite])
      expect(removed.ok).toBe(true)
      expect(await readAggregate(productId)).toEqual({ avg: "4.00", count: 1 })
    }
  })

  // The deadlock the lock-order ruling prevents needs the SAME rating row in both transactions:
  // the buyer holds the product lock and then upserts their own row R; an admin that locked R
  // first would then wait on the product lock inside recomputeProductRating. The buyer sleeps
  // between its product lock and its upsert, and the admin call starts only once the buyer holds
  // the product lock, so without the admin's early product lock the two always deadlock.
  async function raceOwnBuyer(
    productId: string,
    buyer: string,
    adminCall: () => Promise<unknown>,
  ): Promise<PromiseSettledResult<unknown>[]> {
    let signalLocked!: () => void
    const productLocked = new Promise<void>((resolve) => (signalLocked = resolve))
    const buyerWrite = withAdmin(
      testDb.db,
      { userId: buyer, reason: "buyer rateProduct" },
      async (tx) => {
        await tx.execute(sql`SELECT 1 FROM products WHERE id = ${productId} FOR UPDATE`)
        signalLocked()
        await tx.execute(sql`SELECT pg_sleep(0.2)`)
        await tx.execute(sql`
          INSERT INTO product_ratings (product_id, user_id, stars)
          VALUES (${productId}, ${buyer}, 5)
          ON CONFLICT (product_id, user_id) DO UPDATE
             SET stars = excluded.stars, updated_at = now()
           WHERE product_ratings.removed_at IS NULL
        `)
        return recomputeProductRating(tx, productId)
      },
    )
    await productLocked
    const adminWrite = adminCall()
    return Promise.allSettled([buyerWrite, adminWrite])
  }

  function settledErrors(results: PromiseSettledResult<unknown>[]): string[] {
    return results.flatMap((r) => {
      if (r.status === "fulfilled") return []
      const e = r.reason as { code?: string; cause?: { code?: string }; message?: string }
      return [`${e.cause?.code ?? e.code ?? "?"} ${e.message ?? String(r.reason)}`]
    })
  }

  /** The aggregate as a fresh recompute from the rows would store it. */
  async function freshAggregate(productId: string) {
    return adminTx("fresh aggregate", async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT COALESCE(ROUND(AVG(stars)::numeric, 1), 0)::numeric(3,2)::text AS avg,
               COUNT(*)::int AS count
          FROM product_ratings
         WHERE product_id = ${productId} AND removed_at IS NULL
      `)) as unknown as Array<{ avg: string; count: number }>
      return { avg: rows[0]!.avg, count: Number(rows[0]!.count) }
    })
  }

  it("admin removal of R racing R's own buyer re-rating: no deadlock, consistent aggregate", async () => {
    for (let i = 0; i < 10; i++) {
      const productId = await seedProduct()
      const buyer = await newBuyer()
      const ratingId = await seedRating(productId, 1, buyer)
      await seedRating(productId, 3)
      signIn(adminId, "bomy_admin")

      const results = await raceOwnBuyer(productId, buyer, () =>
        adminRemoveRating(ratingId, `race ${i}`),
      )
      expect(settledErrors(results), `iteration ${i}`).toEqual([])
      const [, admin] = results as Array<PromiseFulfilledResult<unknown>>
      expect(admin?.value).toEqual({ ok: true, avg: "3.00", count: 1 })

      const row = await readRating(ratingId)
      expect(row?.removedAt).not.toBeNull()
      expect(await readAggregate(productId)).toEqual({ avg: "3.00", count: 1 })
      expect(await readAggregate(productId)).toEqual(await freshAggregate(productId))
    }
  }, 60_000)

  it("admin stars edit of R racing R's own buyer re-rating: no deadlock, consistent aggregate", async () => {
    for (let i = 0; i < 10; i++) {
      const productId = await seedProduct()
      const buyer = await newBuyer()
      const ratingId = await seedRating(productId, 1, buyer)
      await seedRating(productId, 3)
      signIn(adminId, "bomy_admin")

      const results = await raceOwnBuyer(productId, buyer, () =>
        adminSetRating(ratingId, 2, `race ${i}`),
      )
      expect(settledErrors(results), `iteration ${i}`).toEqual([])
      const [, admin] = results as Array<PromiseFulfilledResult<unknown>>
      // The buyer held the product lock first, so the admin's edit lands last.
      expect(admin?.value).toEqual({ ok: true, avg: "2.50", count: 2 })

      expect((await readRating(ratingId))?.stars).toBe(2)
      expect(await readAggregate(productId)).toEqual({ avg: "2.50", count: 2 })
      expect(await readAggregate(productId)).toEqual(await freshAggregate(productId))
    }
  }, 60_000)
})
