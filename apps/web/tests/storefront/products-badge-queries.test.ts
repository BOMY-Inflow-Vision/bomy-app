// R4 Task 5 (D2a): the active/in-stock variant counts that drive the "Sold out" and "New" badges,
// read through the real getProducts under public read. Required gate: this file must RUN (not be
// skipped) before the badge work closes.
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getProducts } from "@/app/products/queries"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("getProducts badge counts (public read)", () => {
  let testDb: ReturnType<typeof makeDb>
  const ownerId = randomUUID()
  let storeId: string
  const ids: Record<string, string> = {}
  const PROBE = "zzbadgeprobe"

  const variant = (productId: string, name: string, stock: number, isActive: boolean) => ({
    productId,
    name,
    priceMyrSen: 1000n,
    stockCount: stock,
    isActive,
  })

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "products badge test seed" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: ownerId,
          email: `${ownerId}@test.bomy`,
          role: "seller_owner",
          name: "Badge Test Seller",
        })
        const [store] = await tx
          .insert(schema.stores)
          .values({
            ownerId,
            name: "Badge Test Store",
            slug: `badge-test-${randomUUID().slice(0, 8)}`,
            status: "active",
          })
          .returning({ id: schema.stores.id })
        storeId = store!.id

        const names = ["A", "B", "C", "D", "E", "F"]
        const rows = await tx
          .insert(schema.products)
          .values(
            names.map((n) => ({
              storeId,
              name: `${PROBE} ${n}`,
              slug: `${PROBE}-${n.toLowerCase()}-${randomUUID().slice(0, 6)}`,
              status: "active" as const,
            })),
          )
          .returning({ id: schema.products.id, name: schema.products.name })
        for (const r of rows) ids[r.name.slice(-1)] = r.id

        await tx.insert(schema.productVariants).values([
          variant(ids["A"]!, "A1", 5, true), // active, in stock
          variant(ids["B"]!, "B1", 0, true), // active, zero stock
          // C: no variants
          variant(ids["D"]!, "D1", 5, false), // inactive with stock: never counts
          variant(ids["D"]!, "D2", 0, true), // active, zero stock
          variant(ids["E"]!, "E1", 9, false), // inactive only
          variant(ids["E"]!, "E2", 0, false),
          variant(ids["F"]!, "F1", 0, true), // two active: one empty, one stocked
          variant(ids["F"]!, "F2", 3, true),
        ])
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "products badge test cleanup" },
      async (tx) => {
        const pids = Object.values(ids)
        if (pids.length) {
          await tx
            .delete(schema.productVariants)
            .where(inArray(schema.productVariants.productId, pids))
          await tx.delete(schema.products).where(inArray(schema.products.id, pids))
        }
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        // The bomy_app role cannot delete users (other storefront tests leave theirs too).
      },
    )
    await testDb.close()
  })

  async function row(key: string) {
    const result = await getProducts({ query: PROBE })
    return { result, found: result.products.find((p) => p.id === ids[key])! }
  }

  it.each([
    ["A", 1, 1],
    ["B", 1, 0],
    ["C", 0, 0],
    ["D", 1, 0],
    ["E", 0, 0],
    ["F", 2, 1],
  ])("product %s: %i active variants, %i in stock", async (key, active, inStock) => {
    const { found } = await row(key)
    expect(found).toBeDefined()
    expect(found.activeVariantCount).toBe(active)
    expect(found.inStockVariantCount).toBe(inStock)
  })

  it("returns createdAt, keeps min price and counts each product once", async () => {
    const { result, found } = await row("A")
    expect(found.createdAt).toBeInstanceOf(Date)
    expect(found.minPriceSen).toBe(1000)
    expect(result.total).toBe(6)
    expect(result.products.filter((p) => p.name.startsWith(PROBE))).toHaveLength(6)
  })

  it("C (no variants) and E (inactive only) have no price", async () => {
    expect((await row("C")).found.minPriceSen).toBeNull()
    expect((await row("E")).found.minPriceSen).toBeNull()
  })
})
