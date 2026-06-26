/**
 * Integration tests — seller product CRUD actions
 *
 * Requires live Postgres with bomy_app role and migrations 0000–0009 applied.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *   BOMY_RLS_READY=1 pnpm --filter @bomy/web test
 */
import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { auth } from "@/auth"
import {
  addProductImage,
  addVariant,
  archiveProduct,
  createProduct,
  deactivateVariant,
  getPresignedUploadUrl,
  getProductForEdit,
  removeProductImage,
  updateProduct,
  updateVariant,
} from "../../src/app/seller/dashboard/products/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

describe.skipIf(!shouldRun)("seller product actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let otherSellerId: string
  let storeId: string
  let otherStoreId: string
  let categoryId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    otherSellerId = randomUUID()
    storeId = randomUUID()
    otherStoreId = randomUUID()
    categoryId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner" },
        { id: otherSellerId, email: `${otherSellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values([
        {
          id: storeId,
          ownerId: sellerId,
          name: "Seller Store",
          slug: `seller-${storeId.slice(0, 8)}`,
          status: "active",
        },
        {
          id: otherStoreId,
          ownerId: otherSellerId,
          name: "Other Store",
          slug: `other-${otherStoreId.slice(0, 8)}`,
          status: "active",
        },
      ])
      await tx.insert(schema.categories).values({
        id: categoryId,
        name: "Test Category",
        slug: `test-cat-${categoryId.slice(0, 8)}`,
      })
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      for (const sid of [storeId, otherStoreId]) {
        const prods = await tx
          .select({ id: schema.products.id })
          .from(schema.products)
          .where(eq(schema.products.storeId, sid))
        for (const p of prods) {
          await tx.delete(schema.productImages).where(eq(schema.productImages.productId, p.id))
          await tx.delete(schema.productVariants).where(eq(schema.productVariants.productId, p.id))
          await tx.delete(schema.products).where(eq(schema.products.id, p.id))
        }
      }
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, otherStoreId))
      await tx.delete(schema.categories).where(eq(schema.categories.id, categoryId))
      await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
      await tx.delete(schema.users).where(eq(schema.users.id, otherSellerId))
    })
    await testDb.close()
  })

  // ─── createProduct ───────────────────────────────────────────────────────

  describe("createProduct", () => {
    it("creates product + variant under seller's own store", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await createProduct(
        fd({
          name: "Test Widget",
          slug: "",
          categoryId: "",
          description: "A widget",
          status: "draft",
          variant_count: "1",
          variant_name_0: "Default",
          variant_price_0: "25.00",
          variant_stock_0: "10",
          variant_sku_0: "",
          variant_attrs_0: "",
        }),
      ).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const products = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.products)
            .where(
              and(eq(schema.products.storeId, storeId), eq(schema.products.name, "Test Widget")),
            ),
      )
      expect(products).toHaveLength(1)
      expect(products[0]!.slug).toBe("test-widget")
      expect(products[0]!.status).toBe("draft")

      const variants = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.productVariants)
            .where(eq(schema.productVariants.productId, products[0]!.id)),
      )
      expect(variants).toHaveLength(1)
      expect(variants[0]!.name).toBe("Default")
      expect(variants[0]!.priceMyrSen).toBe(2500n)
      expect(variants[0]!.stockCount).toBe(10)
    })

    it("auto-generates slug from name when slug field is empty", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await createProduct(
        fd({
          name: "My Cool Product!",
          slug: "",
          categoryId: "",
          description: "",
          status: "draft",
          variant_count: "1",
          variant_name_0: "V1",
          variant_price_0: "10.00",
          variant_stock_0: "1",
          variant_sku_0: "",
          variant_attrs_0: "",
        }),
      ).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select({ slug: schema.products.slug })
            .from(schema.products)
            .where(
              and(
                eq(schema.products.storeId, storeId),
                eq(schema.products.name, "My Cool Product!"),
              ),
            ),
      )
      expect(row!.slug).toBe("my-cool-product")
    })
  })

  // ─── updateProduct ───────────────────────────────────────────────────────

  describe("updateProduct", () => {
    let productId: string

    beforeAll(async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      await createProduct(
        fd({
          name: "Updatable Product",
          slug: "",
          categoryId: "",
          description: "",
          status: "draft",
          variant_count: "1",
          variant_name_0: "V1",
          variant_price_0: "10.00",
          variant_stock_0: "5",
          variant_sku_0: "",
          variant_attrs_0: "",
        }),
      ).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test setup" },
        async (tx) =>
          tx
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(
              and(
                eq(schema.products.storeId, storeId),
                eq(schema.products.name, "Updatable Product"),
              ),
            ),
      )
      productId = row!.id
    })

    it("updates product name, description, and status", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await updateProduct(
        productId,
        fd({
          name: "Updated Product",
          slug: "updated-product",
          categoryId: "",
          description: "Updated desc",
          status: "active",
        }),
      )

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) => tx.select().from(schema.products).where(eq(schema.products.id, productId)),
      )
      expect(row!.name).toBe("Updated Product")
      expect(row!.description).toBe("Updated desc")
      expect(row!.status).toBe("active")
    })

    it("throws when product belongs to a different seller (RLS)", async () => {
      mockAuth.mockResolvedValue({
        user: { id: otherSellerId, role: "seller_owner", email: "other@test.bomy" },
      })

      await expect(
        updateProduct(
          productId,
          fd({ name: "Hacked", slug: "hacked", categoryId: "", description: "", status: "active" }),
        ),
      ).rejects.toThrow("Product not found or not authorized")
    })
  })

  // ─── archiveProduct ──────────────────────────────────────────────────────

  describe("archiveProduct", () => {
    let productId: string

    beforeAll(async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      await createProduct(
        fd({
          name: "Archivable Product",
          slug: "",
          categoryId: "",
          description: "",
          status: "active",
          variant_count: "1",
          variant_name_0: "V1",
          variant_price_0: "10.00",
          variant_stock_0: "1",
          variant_sku_0: "",
          variant_attrs_0: "",
        }),
      ).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test setup" },
        async (tx) =>
          tx
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(
              and(
                eq(schema.products.storeId, storeId),
                eq(schema.products.name, "Archivable Product"),
              ),
            ),
      )
      productId = row!.id
    })

    it("sets status to archived", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await archiveProduct(productId).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select({ status: schema.products.status })
            .from(schema.products)
            .where(eq(schema.products.id, productId)),
      )
      expect(row!.status).toBe("archived")
    })
  })

  // ─── variant actions ─────────────────────────────────────────────────────

  describe("variant actions", () => {
    let productId: string
    let variantId: string

    beforeAll(async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      await createProduct(
        fd({
          name: "Variant Test Product",
          slug: "",
          categoryId: "",
          description: "",
          status: "draft",
          variant_count: "1",
          variant_name_0: "Original",
          variant_price_0: "30.00",
          variant_stock_0: "20",
          variant_sku_0: "",
          variant_attrs_0: "",
        }),
      ).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const [prod] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test setup" },
        async (tx) =>
          tx
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(
              and(
                eq(schema.products.storeId, storeId),
                eq(schema.products.name, "Variant Test Product"),
              ),
            ),
      )
      productId = prod!.id

      const [vari] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test setup" },
        async (tx) =>
          tx
            .select({ id: schema.productVariants.id })
            .from(schema.productVariants)
            .where(eq(schema.productVariants.productId, productId)),
      )
      variantId = vari!.id
    })

    it("adds a new variant to own product", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await addVariant(
        productId,
        fd({ name: "Large", price: "35.00", stock: "15", sku: "", attrs: "" }),
      )

      const variants = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.productVariants)
            .where(eq(schema.productVariants.productId, productId)),
      )
      expect(variants).toHaveLength(2)
      const large = variants.find((v) => v.name === "Large")
      expect(large).toBeDefined()
      expect(large!.priceMyrSen).toBe(3500n)
    })

    it("rejects addVariant for another seller's product", async () => {
      mockAuth.mockResolvedValue({
        user: { id: otherSellerId, role: "seller_owner", email: "other@test.bomy" },
      })

      await expect(
        addVariant(
          productId,
          fd({ name: "Hacked", price: "1.00", stock: "1", sku: "", attrs: "" }),
        ),
      ).rejects.toThrow("Product not found or not authorized")
    })

    it("updates a variant", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await updateVariant(
        variantId,
        fd({ name: "Original v2", price: "32.00", stock: "25", sku: "", attrs: "" }),
      )

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
      )
      expect(row!.name).toBe("Original v2")
      expect(row!.priceMyrSen).toBe(3200n)
      expect(row!.stockCount).toBe(25)
    })

    it("deactivates a variant", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await deactivateVariant(variantId)

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select({ isActive: schema.productVariants.isActive })
            .from(schema.productVariants)
            .where(eq(schema.productVariants.id, variantId)),
      )
      expect(row!.isActive).toBe(false)
    })
  })

  // ─── image actions ───────────────────────────────────────────────────────

  describe("image actions", () => {
    let productId: string
    let imageId: string

    beforeAll(async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      await createProduct(
        fd({
          name: "Image Test Product",
          slug: "",
          categoryId: "",
          description: "",
          status: "draft",
          variant_count: "1",
          variant_name_0: "Default",
          variant_price_0: "20.00",
          variant_stock_0: "5",
          variant_sku_0: "",
          variant_attrs_0: "",
        }),
      ).catch((e: Error) => {
        if (!e.message.startsWith("REDIRECT:")) throw e
      })

      const [row] = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test setup" },
        async (tx) =>
          tx
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(
              and(
                eq(schema.products.storeId, storeId),
                eq(schema.products.name, "Image Test Product"),
              ),
            ),
      )
      productId = row!.id
    })

    it("adds an image to own product", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"

      const validKey = `products/00000000-0000-0000-0000-000000000002.jpg`
      await addProductImage(productId, validKey)

      const images = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, productId)),
      )
      expect(images).toHaveLength(1)
      expect(images[0]!.url).toBe(`https://cdn.example.com/${validKey}`)
      imageId = images[0]!.id
    })

    it("rejects addProductImage for another seller's product", async () => {
      mockAuth.mockResolvedValue({
        user: { id: otherSellerId, role: "seller_owner", email: "other@test.bomy" },
      })
      process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"

      await expect(
        addProductImage(productId, "products/00000000-0000-0000-0000-000000000003.jpg"),
      ).rejects.toThrow("Product not found or not authorized")
    })

    it("rejects removeProductImage for another seller's image", async () => {
      mockAuth.mockResolvedValue({
        user: { id: otherSellerId, role: "seller_owner", email: "other@test.bomy" },
      })

      await expect(removeProductImage(imageId)).rejects.toThrow("Image not found or not authorized")
    })

    it("removes own product image (audit row written)", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      await removeProductImage(imageId)

      const images = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select()
            .from(schema.productImages)
            .where(eq(schema.productImages.productId, productId)),
      )
      expect(images).toHaveLength(0)

      const auditRows = await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "verify audit" },
        (tx) =>
          tx
            .select()
            .from(schema.adminBypassAudit)
            .where(
              and(
                eq(schema.adminBypassAudit.actorUserId, sellerId),
                eq(schema.adminBypassAudit.reason, "seller image removal"),
              ),
            ),
      )
      expect(auditRows.length).toBeGreaterThan(0)
    })

    it("addProductImage rejects key not matching products/ pattern", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      await expect(addProductImage(productId, "https://cdn.evil.com/img.jpg")).rejects.toThrow(
        "Invalid image key",
      )
      await expect(addProductImage(productId, "../escape/path.jpg")).rejects.toThrow(
        "Invalid image key",
      )
    })
  })

  // ─── security: suspended store guard ────────────────────────────────────

  describe("suspended store guard", () => {
    let suspendedUserId: string
    let suspendedStoreId: string

    beforeAll(async () => {
      suspendedUserId = randomUUID()
      suspendedStoreId = randomUUID()
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
        await tx.insert(schema.users).values({
          id: suspendedUserId,
          email: `suspended-${suspendedUserId.slice(0, 8)}@test.bomy`,
          role: "seller_owner",
          name: "Suspended",
        })
        await tx.insert(schema.stores).values({
          id: suspendedStoreId,
          ownerId: suspendedUserId,
          name: "Suspended Store",
          slug: `suspended-${suspendedStoreId.slice(0, 8)}`,
          status: "suspended",
        })
      })
    })

    afterAll(async () => {
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.stores).where(eq(schema.stores.id, suspendedStoreId))
        await tx.delete(schema.users).where(eq(schema.users.id, suspendedUserId))
      })
    })

    it("createProduct rejects for suspended store", async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: suspendedUserId,
          role: "seller_owner",
          email: `suspended-${suspendedUserId.slice(0, 8)}@test.bomy`,
        },
      })
      const formData = new FormData()
      formData.set("name", "Test Product")
      formData.set("variant_count", "1")
      formData.set("variant_name_0", "Default")
      formData.set("variant_price_0", "10.00")
      formData.set("variant_stock_0", "5")
      await expect(createProduct(formData)).rejects.toThrow("No active store found for this seller")
    })

    it("updateVariant rejects for suspended store", async () => {
      const suspProductId = randomUUID()
      const suspVariantId = randomUUID()
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
        await tx.insert(schema.products).values({
          id: suspProductId,
          storeId: suspendedStoreId,
          name: "Susp Variant Product",
          slug: `susp-var-prod-${suspProductId.slice(0, 8)}`,
          status: "draft",
        })
        await tx.insert(schema.productVariants).values({
          id: suspVariantId,
          productId: suspProductId,
          name: "Susp Variant",
          priceMyrSen: 1000n,
          stockCount: 1,
        })
      })

      mockAuth.mockResolvedValue({
        user: {
          id: suspendedUserId,
          role: "seller_owner",
          email: `suspended-${suspendedUserId.slice(0, 8)}@test.bomy`,
        },
      })

      const formData = new FormData()
      formData.set("name", "Updated Name")
      formData.set("price", "10.00")
      formData.set("stock", "1")
      formData.set("sku", "")
      formData.set("attrs", "")

      await expect(updateVariant(suspVariantId, formData)).rejects.toThrow(
        "Variant not found or not authorized",
      )

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, suspVariantId))
        await tx.delete(schema.products).where(eq(schema.products.id, suspProductId))
      })
    })

    it("deactivateVariant rejects for suspended store", async () => {
      const suspProductId = randomUUID()
      const suspVariantId = randomUUID()
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
        await tx.insert(schema.products).values({
          id: suspProductId,
          storeId: suspendedStoreId,
          name: "Susp Deactivate Product",
          slug: `susp-deact-prod-${suspProductId.slice(0, 8)}`,
          status: "draft",
        })
        await tx.insert(schema.productVariants).values({
          id: suspVariantId,
          productId: suspProductId,
          name: "Susp Deactivate Variant",
          priceMyrSen: 1000n,
          stockCount: 1,
        })
      })

      mockAuth.mockResolvedValue({
        user: {
          id: suspendedUserId,
          role: "seller_owner",
          email: `suspended-${suspendedUserId.slice(0, 8)}@test.bomy`,
        },
      })

      await expect(deactivateVariant(suspVariantId)).rejects.toThrow(
        "Variant not found or not authorized",
      )

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.productVariants).where(eq(schema.productVariants.id, suspVariantId))
        await tx.delete(schema.products).where(eq(schema.products.id, suspProductId))
      })
    })

    it("removeProductImage rejects for suspended store", async () => {
      const suspProductId = randomUUID()
      const suspImageId = randomUUID()
      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
        await tx.insert(schema.products).values({
          id: suspProductId,
          storeId: suspendedStoreId,
          name: "Susp Image Product",
          slug: `susp-img-prod-${suspProductId.slice(0, 8)}`,
          status: "draft",
        })
        await tx.insert(schema.productImages).values({
          id: suspImageId,
          productId: suspProductId,
          url: "https://cdn.example.com/products/test.jpg",
          sortOrder: 0,
        })
      })

      mockAuth.mockResolvedValue({
        user: {
          id: suspendedUserId,
          role: "seller_owner",
          email: `suspended-${suspendedUserId.slice(0, 8)}@test.bomy`,
        },
      })

      await expect(removeProductImage(suspImageId)).rejects.toThrow(
        "Image not found or not authorized",
      )

      await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
        await tx.delete(schema.productImages).where(eq(schema.productImages.id, suspImageId))
        await tx.delete(schema.products).where(eq(schema.products.id, suspProductId))
      })
    })
  })

  // ─── getPresignedUploadUrl size enforcement ──────────────────────────────

  describe("getPresignedUploadUrl", () => {
    it("rejects contentLength over 5 MB", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })
      const result = await getPresignedUploadUrl("image/jpeg", 6 * 1024 * 1024)
      expect(result).toEqual({ error: "File must be between 1 byte and 5 MB" })
    })
  })

  // ─── getProductForEdit — inactive category regression ────────────────────

  describe("getProductForEdit", () => {
    let inactiveCatId: string
    let productWithInactiveCatId: string

    beforeAll(async () => {
      inactiveCatId = randomUUID()
      productWithInactiveCatId = randomUUID()

      await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test seed inactive category" },
        async (tx) => {
          await tx.insert(schema.categories).values({
            id: inactiveCatId,
            name: "Inactive Category",
            slug: `inactive-cat-${inactiveCatId.slice(0, 8)}`,
            isActive: false,
          })
          await tx.insert(schema.products).values({
            id: productWithInactiveCatId,
            storeId,
            categoryId: inactiveCatId,
            name: "Product With Inactive Cat",
            slug: `prod-inactive-cat-${productWithInactiveCatId.slice(0, 8)}`,
            status: "draft",
          })
          await tx.insert(schema.productVariants).values({
            productId: productWithInactiveCatId,
            name: "Default",
            priceMyrSen: 1000n,
            stockCount: 1,
          })
        },
      )
    })

    afterAll(async () => {
      await withAdmin(
        testDb.db,
        { userId: SYSTEM_ACTOR, reason: "test cleanup inactive category" },
        async (tx) => {
          await tx
            .delete(schema.productVariants)
            .where(eq(schema.productVariants.productId, productWithInactiveCatId))
          await tx.delete(schema.products).where(eq(schema.products.id, productWithInactiveCatId))
          await tx.delete(schema.categories).where(eq(schema.categories.id, inactiveCatId))
        },
      )
    })

    it("includes the product's current inactive category in the returned list", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      const result = await getProductForEdit(productWithInactiveCatId)
      expect(result).not.toBeNull()
      const ids = result!.categories.map((c) => c.id)
      expect(ids).toContain(inactiveCatId)
    })

    it("marks the inactive category as isActive=false", async () => {
      mockAuth.mockResolvedValue({
        user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
      })

      const result = await getProductForEdit(productWithInactiveCatId)
      const inactiveCat = result!.categories.find((c) => c.id === inactiveCatId)
      expect(inactiveCat?.isActive).toBe(false)
    })
  })
})
