import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { deleteCategory, updateCategory } from "../../src/app/categories/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("category actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    adminId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, (tx) =>
      tx.insert(schema.users).values({
        id: adminId,
        email: `admin-${adminId}@test.bomy`,
        role: "bomy_admin",
      }),
    )
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
  })

  afterEach(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, (tx) =>
      tx.delete(schema.users).where(eq(schema.users.id, adminId)),
    )
  })

  // ─── updateCategory ───────────────────────────────────────────────────────

  describe("updateCategory", () => {
    let catId: string

    beforeEach(async () => {
      catId = randomUUID()
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, (tx) =>
        tx.insert(schema.categories).values({
          id: catId,
          name: "Original Name",
          slug: `orig-cat-${catId.slice(0, 8)}`,
          sortOrder: 10,
        }),
      )
    })

    afterEach(async () => {
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, (tx) =>
        tx.delete(schema.categories).where(eq(schema.categories.id, catId)),
      )
    })

    it("updates name and sortOrder", async () => {
      const result = await updateCategory(catId, "New Name", 20)
      expect(result).toEqual({ ok: true })

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        (tx) =>
          tx
            .select({ name: schema.categories.name, sortOrder: schema.categories.sortOrder })
            .from(schema.categories)
            .where(eq(schema.categories.id, catId)),
      )
      expect(row!.name).toBe("New Name")
      expect(row!.sortOrder).toBe(20)
    })

    it("rejects empty name", async () => {
      const result = await updateCategory(catId, "  ", 10)
      expect(result).toEqual({ ok: false, error: "Name is required" })
    })

    it("rejects a decimal sort order", async () => {
      const result = await updateCategory(catId, "Valid Name", 1.5)
      expect(result).toMatchObject({ ok: false })
      expect((result as { ok: false; error: string }).error).toMatch(/whole number/)
    })

    it("rejects a negative sort order", async () => {
      const result = await updateCategory(catId, "Valid Name", -1)
      expect(result).toMatchObject({ ok: false })
      expect((result as { ok: false; error: string }).error).toMatch(/whole number/)
    })
  })

  // ─── deleteCategory ───────────────────────────────────────────────────────

  describe("deleteCategory", () => {
    it("deletes a category with no associated products", async () => {
      const catId = randomUUID()
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, (tx) =>
        tx.insert(schema.categories).values({
          id: catId,
          name: "Deletable",
          slug: `del-cat-${catId.slice(0, 8)}`,
          sortOrder: 999,
        }),
      )

      const result = await deleteCategory(catId)
      expect(result).toEqual({ ok: true })

      const rows = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        (tx) => tx.select().from(schema.categories).where(eq(schema.categories.id, catId)),
      )
      expect(rows).toHaveLength(0)
    })

    it("returns IN_USE error when products reference the category", async () => {
      const catId = randomUUID()
      const ownerId = randomUUID()
      const storeId = randomUUID()
      const productId = randomUUID()

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
        await tx.insert(schema.categories).values({
          id: catId,
          name: "In-Use Category",
          slug: `inuse-cat-${catId.slice(0, 8)}`,
          sortOrder: 998,
        })
        await tx.insert(schema.users).values({
          id: ownerId,
          email: `owner-${ownerId}@test.bomy`,
          role: "seller_owner",
        })
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId,
          name: "Test Store",
          slug: `store-${storeId.slice(0, 8)}`,
          status: "active",
        })
        await tx.insert(schema.products).values({
          id: productId,
          storeId,
          categoryId: catId,
          name: "Product In Category",
          slug: `prod-incat-${productId.slice(0, 8)}`,
          status: "active",
        })
      })

      const result = await deleteCategory(catId)
      expect(result).toMatchObject({ ok: false })
      expect((result as { ok: false; error: string }).error).toMatch(/Cannot delete/)

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.products).where(eq(schema.products.id, productId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, ownerId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, catId))
      })
    })
  })
})
