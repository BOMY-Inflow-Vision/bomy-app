import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import {
  createStoreCategory,
  deleteStoreCategory,
  toggleStoreCategory,
  updateStoreCategory,
} from "../../src/app/store-categories/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("store-categories admin actions", () => {
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
        name: "Test Admin",
      }),
    )
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
  })

  afterEach(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, (tx) =>
      tx.delete(schema.users).where(eq(schema.users.id, adminId)),
    )
  })

  // ─── createStoreCategory ──────────────────────────────────────────────────

  describe("createStoreCategory", () => {
    let createdId: string | null = null

    afterEach(async () => {
      if (createdId) {
        await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, (tx) =>
          tx.delete(schema.storeCategories).where(eq(schema.storeCategories.id, createdId!)),
        )
        createdId = null
      }
    })

    it("creates a category and assigns auto-incremented sortOrder", async () => {
      const name = `SC Create ${randomUUID().slice(0, 6)}`
      const fd = new FormData()
      fd.set("name", name)

      const result = await createStoreCategory(fd)
      expect(result).toEqual({ ok: true })

      const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "assert" }, (tx) =>
        tx
          .select({ id: schema.storeCategories.id, name: schema.storeCategories.name })
          .from(schema.storeCategories)
          .where(eq(schema.storeCategories.name, name)),
      )
      expect(row).toBeDefined()
      createdId = row!.id
    })

    it("rejects empty name", async () => {
      const fd = new FormData()
      fd.set("name", "  ")
      const result = await createStoreCategory(fd)
      expect(result).toMatchObject({ ok: false })
    })

    it("returns slug-conflict error on duplicate name", async () => {
      const name = `Dup SC ${randomUUID().slice(0, 6)}`
      const fd = new FormData()
      fd.set("name", name)
      const first = await createStoreCategory(fd)
      expect(first).toEqual({ ok: true })

      const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "assert" }, (tx) =>
        tx
          .select({ id: schema.storeCategories.id })
          .from(schema.storeCategories)
          .where(eq(schema.storeCategories.name, name)),
      )
      createdId = row!.id

      // Same name → same slug → unique-index conflict
      const fd2 = new FormData()
      fd2.set("name", name)
      const second = await createStoreCategory(fd2)
      expect(second).toMatchObject({ ok: false })
      expect((second as { ok: false; error: string }).error).toMatch(/already exists/)
    })
  })

  // ─── updateStoreCategory ──────────────────────────────────────────────────

  describe("updateStoreCategory", () => {
    let catId: string

    beforeEach(async () => {
      ;[catId] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "seed" },
        async (tx) => {
          const [row] = await tx
            .insert(schema.storeCategories)
            .values({
              name: `Update SC ${randomUUID().slice(0, 6)}`,
              slug: `update-sc-${randomUUID().slice(0, 8)}`,
              sortOrder: 10,
              isActive: true,
            })
            .returning({ id: schema.storeCategories.id })
          return [row!.id]
        },
      )
    })

    afterEach(async () => {
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, (tx) =>
        tx.delete(schema.storeCategories).where(eq(schema.storeCategories.id, catId)),
      )
    })

    it("updates name and sortOrder", async () => {
      const result = await updateStoreCategory(catId, "Renamed SC", 50)
      expect(result).toEqual({ ok: true })

      const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "assert" }, (tx) =>
        tx
          .select({
            name: schema.storeCategories.name,
            sortOrder: schema.storeCategories.sortOrder,
          })
          .from(schema.storeCategories)
          .where(eq(schema.storeCategories.id, catId)),
      )
      expect(row!.name).toBe("Renamed SC")
      expect(row!.sortOrder).toBe(50)
    })

    it("rejects empty name", async () => {
      const result = await updateStoreCategory(catId, "   ", 10)
      expect(result).toMatchObject({ ok: false, error: "Name is required" })
    })

    it("rejects decimal sort order", async () => {
      const result = await updateStoreCategory(catId, "Valid Name", 1.5)
      expect(result).toMatchObject({ ok: false })
      expect((result as { ok: false; error: string }).error).toMatch(/whole number/)
    })

    it("rejects negative sort order", async () => {
      const result = await updateStoreCategory(catId, "Valid Name", -1)
      expect(result).toMatchObject({ ok: false })
    })
  })

  // ─── toggleStoreCategory ──────────────────────────────────────────────────

  describe("toggleStoreCategory", () => {
    let catId: string

    beforeEach(async () => {
      ;[catId] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "seed" },
        async (tx) => {
          const [row] = await tx
            .insert(schema.storeCategories)
            .values({
              name: `Toggle SC ${randomUUID().slice(0, 6)}`,
              slug: `toggle-sc-${randomUUID().slice(0, 8)}`,
              isActive: true,
            })
            .returning({ id: schema.storeCategories.id })
          return [row!.id]
        },
      )
    })

    afterEach(async () => {
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, (tx) =>
        tx.delete(schema.storeCategories).where(eq(schema.storeCategories.id, catId)),
      )
    })

    it("deactivates an active category", async () => {
      await toggleStoreCategory(catId, false)
      const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "assert" }, (tx) =>
        tx
          .select({ isActive: schema.storeCategories.isActive })
          .from(schema.storeCategories)
          .where(eq(schema.storeCategories.id, catId)),
      )
      expect(row!.isActive).toBe(false)
    })

    it("reactivates an inactive category", async () => {
      await toggleStoreCategory(catId, false)
      await toggleStoreCategory(catId, true)
      const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "assert" }, (tx) =>
        tx
          .select({ isActive: schema.storeCategories.isActive })
          .from(schema.storeCategories)
          .where(eq(schema.storeCategories.id, catId)),
      )
      expect(row!.isActive).toBe(true)
    })
  })

  // ─── deleteStoreCategory ──────────────────────────────────────────────────

  describe("deleteStoreCategory", () => {
    it("deletes a category with no assignments", async () => {
      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "seed" },
        async (tx) => {
          const [r] = await tx
            .insert(schema.storeCategories)
            .values({
              name: `Del SC ${randomUUID().slice(0, 6)}`,
              slug: `del-sc-${randomUUID().slice(0, 8)}`,
            })
            .returning({ id: schema.storeCategories.id })
          return [r!.id]
        },
      )
      const catId = row

      const result = await deleteStoreCategory(catId)
      expect(result).toEqual({ ok: true })

      const remaining = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "assert" },
        (tx) =>
          tx.select().from(schema.storeCategories).where(eq(schema.storeCategories.id, catId)),
      )
      expect(remaining).toHaveLength(0)
    })

    it("returns in-use error when the category is assigned to a store", async () => {
      const sellerId = randomUUID()
      const storeId = randomUUID()
      let catId: string

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
        await tx.insert(schema.users).values({
          id: sellerId,
          email: `seller-${sellerId}@test.bomy`,
          role: "seller_owner",
          name: "Del Guard Seller",
        })
        await tx.insert(schema.stores).values({
          id: storeId,
          ownerId: sellerId,
          name: "Del Guard Store",
          slug: `del-guard-${randomUUID().slice(0, 8)}`,
          status: "active",
        })
        const [cat] = await tx
          .insert(schema.storeCategories)
          .values({
            name: `InUse SC ${randomUUID().slice(0, 6)}`,
            slug: `inuse-sc-${randomUUID().slice(0, 8)}`,
          })
          .returning({ id: schema.storeCategories.id })
        catId = cat!.id
        await tx.insert(schema.storeCategoryAssignments).values({ storeId, storeCategoryId: catId })
      })

      const result = await deleteStoreCategory(catId!)
      expect(result).toMatchObject({ ok: false })
      expect((result as { ok: false; error: string }).error).toMatch(/Cannot delete/)

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, async (tx) => {
        await tx
          .delete(schema.storeCategoryAssignments)
          .where(eq(schema.storeCategoryAssignments.storeId, storeId))
        await tx.delete(schema.storeCategories).where(eq(schema.storeCategories.id, catId!))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      })
    })
  })
})
