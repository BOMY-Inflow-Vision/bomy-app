import { eq } from "drizzle-orm"

import { makeDb, schema, withAdmin, type Database } from "@bomy/db"

import {
  E2E_CATEGORY_NAME,
  E2E_CATEGORY_SLUG,
  E2E_PRODUCT_NAME,
  E2E_PRODUCT_SLUG,
  E2E_SELLER_EMAIL,
  E2E_STORE_NAME,
  E2E_STORE_SLUG,
} from "./fixtures"
import { loadEnvLocal } from "./load-env-local"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

// Delete-by-natural-key, FK-safe order. Tolerant of partial/absent prior state
// so it's safe to run both before seeding (clears a stale run that crashed
// before teardown) and as the actual teardown.
async function cleanupFixtures(tx: Database): Promise<void> {
  const [product] = await tx
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.slug, E2E_PRODUCT_SLUG))
  if (product) {
    await tx.delete(schema.productVariants).where(eq(schema.productVariants.productId, product.id))
  }
  await tx.delete(schema.products).where(eq(schema.products.slug, E2E_PRODUCT_SLUG))
  await tx.delete(schema.categories).where(eq(schema.categories.slug, E2E_CATEGORY_SLUG))
  await tx.delete(schema.stores).where(eq(schema.stores.slug, E2E_STORE_SLUG))
  await tx.delete(schema.users).where(eq(schema.users.email, E2E_SELLER_EMAIL))
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  loadEnvLocal()
  const { db, close } = makeDb({ url: process.env["DATABASE_URL"] as string })

  await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "e2e smoke seed" }, async (tx) => {
    await cleanupFixtures(tx)

    const [user] = await tx
      .insert(schema.users)
      .values({ email: E2E_SELLER_EMAIL, role: "seller_owner", name: "E2E Smoke Seller" })
      .returning({ id: schema.users.id })
    const [store] = await tx
      .insert(schema.stores)
      .values({ ownerId: user!.id, name: E2E_STORE_NAME, slug: E2E_STORE_SLUG, status: "active" })
      .returning({ id: schema.stores.id })
    const [category] = await tx
      .insert(schema.categories)
      .values({ name: E2E_CATEGORY_NAME, slug: E2E_CATEGORY_SLUG, isActive: true })
      .returning({ id: schema.categories.id })
    const [product] = await tx
      .insert(schema.products)
      .values({
        storeId: store!.id,
        name: E2E_PRODUCT_NAME,
        slug: E2E_PRODUCT_SLUG,
        status: "active",
        categoryId: category!.id,
      })
      .returning({ id: schema.products.id })
    await tx
      .insert(schema.productVariants)
      .values({ productId: product!.id, name: "Default", priceMyrSen: 2999n, stockCount: 10 })
  })

  await close()

  return async () => {
    const { db: teardownDb, close: closeTeardown } = makeDb({
      url: process.env["DATABASE_URL"] as string,
    })
    await withAdmin(
      teardownDb,
      { userId: SYSTEM_ACTOR, reason: "e2e smoke cleanup" },
      cleanupFixtures,
    )
    await closeTeardown()
  }
}
