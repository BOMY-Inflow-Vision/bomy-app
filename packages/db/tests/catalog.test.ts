/**
 * Stage 5 PR #28 — Catalog schema RLS integration tests.
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/db test
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import {
  categories,
  productImages,
  productVariants,
  products,
  stores,
  users,
} from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("catalog RLS", () => {
  let handle: Db

  // Shared fixtures — seeded once in beforeAll, cleaned up in afterAll.
  let sellerAId: string
  let sellerBId: string
  let storeAId: string
  let storeBId: string
  let categoryId: string
  let inactiveCategoryId: string

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })

    sellerAId = randomUUID()
    sellerBId = randomUUID()
    storeAId = randomUUID()
    storeBId = randomUUID()
    categoryId = randomUUID()
    inactiveCategoryId = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "catalog test seed" },
      async (tx) => {
        await tx.insert(users).values([
          { id: sellerAId, email: `${sellerAId}@test.bomy`, role: "seller_owner" },
          { id: sellerBId, email: `${sellerBId}@test.bomy`, role: "seller_owner" },
        ])
        await tx.insert(stores).values([
          {
            id: storeAId,
            ownerId: sellerAId,
            name: "Store A",
            slug: `a-${sellerAId}`,
            status: "active",
          },
          {
            id: storeBId,
            ownerId: sellerBId,
            name: "Store B",
            slug: `b-${sellerBId}`,
            status: "active",
          },
        ])
        await tx.insert(categories).values([
          { id: categoryId, name: "Apparel", slug: `apparel-${categoryId}`, isActive: true },
          {
            id: inactiveCategoryId,
            name: "Hidden",
            slug: `hidden-${inactiveCategoryId}`,
            isActive: false,
          },
        ])
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "catalog test cleanup" },
      async (tx) => {
        await tx.delete(products).where(eq(products.storeId, storeAId))
        await tx.delete(products).where(eq(products.storeId, storeBId))
        await tx.delete(stores).where(eq(stores.id, storeAId))
        await tx.delete(stores).where(eq(stores.id, storeBId))
        await tx.delete(categories).where(eq(categories.id, categoryId))
        await tx.delete(categories).where(eq(categories.id, inactiveCategoryId))
        await tx.delete(users).where(eq(users.id, sellerAId))
        await tx.delete(users).where(eq(users.id, sellerBId))
      },
    )
    await handle.close()
  })

  // ── categories ──────────────────────────────────────────────────────────

  describe("categories", () => {
    it("authenticated user reads active categories", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerAId, userRole: "seller_owner" },
        async (tx) =>
          tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)),
      )
      expect(rows).toHaveLength(1)
    })

    it("authenticated user cannot read inactive categories", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerAId, userRole: "seller_owner" },
        async (tx) =>
          tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, inactiveCategoryId)),
      )
      expect(rows).toHaveLength(0)
    })

    it("bomy_admin reads inactive categories via withAdmin", async () => {
      const rows = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "test assert" },
        async (tx) =>
          tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, inactiveCategoryId)),
      )
      expect(rows).toHaveLength(1)
    })
  })

  // ── products ────────────────────────────────────────────────────────────

  describe("products", () => {
    let activeProductId: string
    let draftProductId: string

    beforeAll(async () => {
      activeProductId = randomUUID()
      draftProductId = randomUUID()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "product test seed" },
        async (tx) => {
          await tx.insert(products).values([
            {
              id: activeProductId,
              storeId: storeAId,
              name: "Active Tee",
              slug: `active-tee-${activeProductId}`,
              status: "active",
            },
            {
              id: draftProductId,
              storeId: storeAId,
              name: "Draft Tee",
              slug: `draft-tee-${draftProductId}`,
              status: "draft",
            },
          ])
        },
      )
    })

    afterAll(async () => {
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "product test cleanup" },
        async (tx) => {
          await tx.delete(productVariants).where(eq(productVariants.productId, activeProductId))
          await tx.delete(productVariants).where(eq(productVariants.productId, draftProductId))
          await tx.delete(productImages).where(eq(productImages.productId, activeProductId))
          await tx.delete(productImages).where(eq(productImages.productId, draftProductId))
          await tx.delete(products).where(eq(products.id, activeProductId))
          await tx.delete(products).where(eq(products.id, draftProductId))
        },
      )
    })

    it("authenticated user reads active products", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerBId, userRole: "seller_owner" },
        async (tx) =>
          tx.select({ id: products.id }).from(products).where(eq(products.id, activeProductId)),
      )
      expect(rows).toHaveLength(1)
    })

    it("authenticated non-owner cannot read draft products", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerBId, userRole: "seller_owner" },
        async (tx) =>
          tx.select({ id: products.id }).from(products).where(eq(products.id, draftProductId)),
      )
      expect(rows).toHaveLength(0)
    })

    it("seller_owner reads their own draft products", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerAId, userRole: "seller_owner" },
        async (tx) =>
          tx.select({ id: products.id }).from(products).where(eq(products.id, draftProductId)),
      )
      expect(rows).toHaveLength(1)
    })

    it("seller_owner can INSERT a product in their own store", async () => {
      const newId = randomUUID()
      await expect(
        withTenant(handle.db, { userId: sellerAId, userRole: "seller_owner" }, async (tx) =>
          tx.insert(products).values({
            id: newId,
            storeId: storeAId,
            name: "New via tenant",
            slug: `new-${newId}`,
            status: "draft",
          }),
        ),
      ).resolves.not.toThrow()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup inserted product" },
        async (tx) => {
          await tx.delete(products).where(eq(products.id, newId))
        },
      )
    })

    it("seller A cannot INSERT a product into seller B's store", async () => {
      await expect(
        withTenant(handle.db, { userId: sellerAId, userRole: "seller_owner" }, async (tx) =>
          tx.insert(products).values({
            id: randomUUID(),
            storeId: storeBId,
            name: "Hijack attempt",
            slug: `hijack-${randomUUID()}`,
            status: "draft",
          }),
        ),
      ).rejects.toThrow()
    })

    it("seller_owner cannot DELETE their own product", async () => {
      // RLS has no DELETE policy so the row is invisible to the tenant;
      // Postgres silently returns 0 affected rows rather than throwing.
      const result = await withTenant(
        handle.db,
        { userId: sellerAId, userRole: "seller_owner" },
        async (tx) => tx.delete(products).where(eq(products.id, activeProductId)),
      )
      expect(result).toMatchObject([]) // 0 rows deleted

      // Verify product still exists
      const [row] = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "verify product not deleted" },
        async (tx) =>
          tx.select({ id: products.id }).from(products).where(eq(products.id, activeProductId)),
      )
      expect(row?.id).toBe(activeProductId)
    })

    it("seller A cannot UPDATE seller B's product", async () => {
      // Insert product in store B under admin
      const bProductId = randomUUID()
      await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "seed B product" }, async (tx) => {
        await tx.insert(products).values({
          id: bProductId,
          storeId: storeBId,
          name: "B's Product",
          slug: `b-product-${bProductId}`,
          status: "draft",
        })
      })

      await expect(
        withTenant(handle.db, { userId: sellerAId, userRole: "seller_owner" }, async (tx) =>
          tx.update(products).set({ name: "Hijacked" }).where(eq(products.id, bProductId)),
        ),
      ).resolves.toMatchObject([]) // UPDATE returns 0 rows — RLS silently blocks

      // Verify name unchanged
      const [row] = await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "verify" },
        async (tx) =>
          tx.select({ name: products.name }).from(products).where(eq(products.id, bProductId)),
      )
      expect(row?.name).toBe("B's Product")

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup B product" },
        async (tx) => {
          await tx.delete(products).where(eq(products.id, bProductId))
        },
      )
    })
  })

  // ── product_variants ────────────────────────────────────────────────────

  describe("product_variants", () => {
    let activeProductId: string
    let draftProductId: string
    let activeVariantId: string

    beforeAll(async () => {
      activeProductId = randomUUID()
      draftProductId = randomUUID()
      activeVariantId = randomUUID()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "variant test seed" },
        async (tx) => {
          await tx.insert(products).values([
            {
              id: activeProductId,
              storeId: storeAId,
              name: "Active P",
              slug: `ap-${activeProductId}`,
              status: "active",
            },
            {
              id: draftProductId,
              storeId: storeAId,
              name: "Draft P",
              slug: `dp-${draftProductId}`,
              status: "draft",
            },
          ])
          await tx.insert(productVariants).values({
            id: activeVariantId,
            productId: activeProductId,
            name: "One Size",
            priceMyrSen: 2999n,
            stockCount: 10,
          })
        },
      )
    })

    afterAll(async () => {
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "variant test cleanup" },
        async (tx) => {
          await tx.delete(productVariants).where(eq(productVariants.productId, activeProductId))
          await tx.delete(productVariants).where(eq(productVariants.productId, draftProductId))
          await tx.delete(products).where(eq(products.id, activeProductId))
          await tx.delete(products).where(eq(products.id, draftProductId))
        },
      )
    })

    it("authenticated user reads active variants of active products", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerBId, userRole: "seller_owner" },
        async (tx) =>
          tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.id, activeVariantId)),
      )
      expect(rows).toHaveLength(1)
    })

    it("authenticated non-owner cannot read variants of draft products", async () => {
      const draftVariantId = randomUUID()
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "seed draft variant" },
        async (tx) => {
          await tx.insert(productVariants).values({
            id: draftVariantId,
            productId: draftProductId,
            name: "M",
            priceMyrSen: 1999n,
            stockCount: 5,
          })
        },
      )

      const rows = await withTenant(
        handle.db,
        { userId: sellerBId, userRole: "seller_owner" },
        async (tx) =>
          tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.id, draftVariantId)),
      )
      expect(rows).toHaveLength(0)

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup draft variant" },
        async (tx) => {
          await tx.delete(productVariants).where(eq(productVariants.id, draftVariantId))
        },
      )
    })

    it("seller_owner can INSERT a variant into their own product", async () => {
      const newVariantId = randomUUID()
      await expect(
        withTenant(handle.db, { userId: sellerAId, userRole: "seller_owner" }, async (tx) =>
          tx.insert(productVariants).values({
            id: newVariantId,
            productId: activeProductId,
            name: "XL",
            priceMyrSen: 3499n,
            stockCount: 3,
          }),
        ),
      ).resolves.not.toThrow()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup new variant" },
        async (tx) => {
          await tx.delete(productVariants).where(eq(productVariants.id, newVariantId))
        },
      )
    })

    it("seller A cannot INSERT a variant into seller B's product", async () => {
      const bProductId = randomUUID()
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "seed B product for variant test" },
        async (tx) => {
          await tx.insert(products).values({
            id: bProductId,
            storeId: storeBId,
            name: "B Variant Product",
            slug: `bvp-${bProductId}`,
            status: "active",
          })
        },
      )

      await expect(
        withTenant(handle.db, { userId: sellerAId, userRole: "seller_owner" }, async (tx) =>
          tx.insert(productVariants).values({
            id: randomUUID(),
            productId: bProductId,
            name: "Hijack Variant",
            priceMyrSen: 1999n,
            stockCount: 1,
          }),
        ),
      ).rejects.toThrow()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup B variant product" },
        async (tx) => {
          await tx.delete(products).where(eq(products.id, bProductId))
        },
      )
    })

    it("CHECK constraint rejects price_myr_sen = 0", async () => {
      await expect(
        withAdmin(
          handle.db,
          { userId: SYSTEM_ACTOR, reason: "test check constraint" },
          async (tx) =>
            tx.insert(productVariants).values({
              id: randomUUID(),
              productId: activeProductId,
              name: "Free",
              priceMyrSen: 0n,
              stockCount: 1,
            }),
        ),
      ).rejects.toThrow()
    })

    it("CHECK constraint rejects stock_count < 0", async () => {
      await expect(
        withAdmin(
          handle.db,
          { userId: SYSTEM_ACTOR, reason: "test check constraint" },
          async (tx) =>
            tx.insert(productVariants).values({
              id: randomUUID(),
              productId: activeProductId,
              name: "Negative",
              priceMyrSen: 999n,
              stockCount: -1,
            }),
        ),
      ).rejects.toThrow()
    })
  })

  // ── product_images ──────────────────────────────────────────────────────

  describe("product_images", () => {
    let activeProductId: string
    let draftProductId: string
    let activeImageId: string

    beforeAll(async () => {
      activeProductId = randomUUID()
      draftProductId = randomUUID()
      activeImageId = randomUUID()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "image test seed" },
        async (tx) => {
          await tx.insert(products).values([
            {
              id: activeProductId,
              storeId: storeAId,
              name: "Active Img P",
              slug: `aip-${activeProductId}`,
              status: "active",
            },
            {
              id: draftProductId,
              storeId: storeAId,
              name: "Draft Img P",
              slug: `dip-${draftProductId}`,
              status: "draft",
            },
          ])
          await tx.insert(productImages).values({
            id: activeImageId,
            productId: activeProductId,
            url: "https://cdn.bomy.com/test.jpg",
          })
        },
      )
    })

    afterAll(async () => {
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "image test cleanup" },
        async (tx) => {
          await tx.delete(productImages).where(eq(productImages.productId, activeProductId))
          await tx.delete(productImages).where(eq(productImages.productId, draftProductId))
          await tx.delete(products).where(eq(products.id, activeProductId))
          await tx.delete(products).where(eq(products.id, draftProductId))
        },
      )
    })

    it("authenticated user reads images of active products", async () => {
      const rows = await withTenant(
        handle.db,
        { userId: sellerBId, userRole: "seller_owner" },
        async (tx) =>
          tx
            .select({ id: productImages.id })
            .from(productImages)
            .where(eq(productImages.id, activeImageId)),
      )
      expect(rows).toHaveLength(1)
    })

    it("authenticated non-owner cannot read images of draft products", async () => {
      const draftImageId = randomUUID()
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "seed draft image" },
        async (tx) => {
          await tx.insert(productImages).values({
            id: draftImageId,
            productId: draftProductId,
            url: "https://cdn.bomy.com/draft.jpg",
          })
        },
      )

      const rows = await withTenant(
        handle.db,
        { userId: sellerBId, userRole: "seller_owner" },
        async (tx) =>
          tx
            .select({ id: productImages.id })
            .from(productImages)
            .where(eq(productImages.id, draftImageId)),
      )
      expect(rows).toHaveLength(0)

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup draft image" },
        async (tx) => {
          await tx.delete(productImages).where(eq(productImages.id, draftImageId))
        },
      )
    })

    it("seller A cannot INSERT an image for seller B's product", async () => {
      const bProductId = randomUUID()
      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "seed B product for images" },
        async (tx) => {
          await tx.insert(products).values({
            id: bProductId,
            storeId: storeBId,
            name: "B Image Product",
            slug: `bip-${bProductId}`,
            status: "active",
          })
        },
      )

      await expect(
        withTenant(handle.db, { userId: sellerAId, userRole: "seller_owner" }, async (tx) =>
          tx.insert(productImages).values({
            id: randomUUID(),
            productId: bProductId,
            url: "https://cdn.bomy.com/hijack.jpg",
          }),
        ),
      ).rejects.toThrow()

      await withAdmin(
        handle.db,
        { userId: SYSTEM_ACTOR, reason: "cleanup B image product" },
        async (tx) => {
          await tx.delete(products).where(eq(products.id, bProductId))
        },
      )
    })
  })
})
