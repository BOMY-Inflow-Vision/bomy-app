"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"
import type { Database } from "@bomy/db"

import { auth } from "@/auth"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function parseMyrToSen(myr: string): bigint {
  const trimmed = myr.trim()
  const m = trimmed.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) throw new Error(`Invalid price: "${trimmed}"`)
  const sen = BigInt(m[1]!) * 100n + BigInt((m[2] ?? "0").padEnd(2, "0"))
  if (sen === 0n) throw new Error("Price must be greater than zero")
  return sen
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

function isRlsViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string" &&
    (err as { message: string }).message.includes("row-level security policy")
  )
}

async function requireSeller() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")
  return session
}

async function resolveStore(tx: Database, userId: string): Promise<string> {
  const rows = await tx
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(eq(schema.stores.ownerId, userId))
    .limit(1)
  if (!rows[0]) throw new Error("No store found for this seller")
  return rows[0].id
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getSellerProducts(statusFilter?: string) {
  const session = await requireSeller()

  return withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeId = await resolveStore(tx, session.user.id)

      const conditions = [eq(schema.products.storeId, storeId)]
      if (statusFilter && ["draft", "active", "archived"].includes(statusFilter)) {
        conditions.push(eq(schema.products.status, statusFilter as "draft" | "active" | "archived"))
      }

      return tx
        .select({
          id: schema.products.id,
          name: schema.products.name,
          slug: schema.products.slug,
          status: schema.products.status,
          coverImageUrl: schema.products.coverImageUrl,
          createdAt: schema.products.createdAt,
        })
        .from(schema.products)
        .where(
          conditions.length === 1
            ? conditions[0]!
            : and(
                ...(conditions as [
                  (typeof conditions)[0],
                  (typeof conditions)[0],
                  ...typeof conditions,
                ]),
              ),
        )
        .orderBy(schema.products.createdAt)
    },
  )
}

export async function getProductForEdit(productId: string) {
  const session = await requireSeller()

  return withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const products = await tx
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, productId))
        .limit(1)

      if (!products[0]) return null

      const [variants, images, categories] = await Promise.all([
        tx
          .select()
          .from(schema.productVariants)
          .where(eq(schema.productVariants.productId, productId))
          .orderBy(schema.productVariants.sortOrder),
        tx
          .select()
          .from(schema.productImages)
          .where(eq(schema.productImages.productId, productId))
          .orderBy(schema.productImages.sortOrder),
        tx
          .select({ id: schema.categories.id, name: schema.categories.name })
          .from(schema.categories)
          .where(eq(schema.categories.isActive, true))
          .orderBy(schema.categories.name),
      ])

      return { product: products[0], variants, images, categories }
    },
  )
}

export async function getCategories() {
  const session = await requireSeller()

  return withTenant(getDb(), { userId: session.user.id, userRole: session.user.role }, async (tx) =>
    tx
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.isActive, true))
      .orderBy(schema.categories.name),
  )
}

// ─── Product mutations ─────────────────────────────────────────────────────

export async function createProduct(formData: FormData): Promise<void> {
  const session = await requireSeller()

  const name = str(formData, "name").trim()
  if (!name) throw new Error("Product name is required")

  const rawSlug = str(formData, "slug").trim()
  const slug = rawSlug || slugify(name)
  if (!slug) throw new Error("Could not generate a valid slug from the product name")

  const categoryId = str(formData, "categoryId") || null
  const description = str(formData, "description").trim() || null
  const status = (str(formData, "status") || "draft") as "draft" | "active" | "archived"

  const variantCount = parseInt(str(formData, "variant_count") || "0", 10)
  if (variantCount < 1) throw new Error("At least one variant is required")

  const variants: Array<{
    name: string
    priceMyrSen: bigint
    stockCount: number
    sku: string | null
    attributes: Record<string, unknown>
  }> = []

  for (let i = 0; i < variantCount; i++) {
    const vName = str(formData, `variant_name_${i}`).trim()
    if (!vName) throw new Error(`Variant ${i + 1} name is required`)
    const vPrice = parseMyrToSen(str(formData, `variant_price_${i}`))
    const vStock = parseInt(str(formData, `variant_stock_${i}`) || "0", 10)
    if (vStock < 0) throw new Error(`Variant ${i + 1} stock cannot be negative`)
    const vSku = str(formData, `variant_sku_${i}`).trim() || null
    const vAttrsRaw = str(formData, `variant_attrs_${i}`).trim()
    let vAttrs: Record<string, unknown> = {}
    if (vAttrsRaw) {
      try {
        vAttrs = JSON.parse(vAttrsRaw) as Record<string, unknown>
      } catch {
        // non-JSON attrs silently ignored
      }
    }
    variants.push({
      name: vName,
      priceMyrSen: vPrice,
      stockCount: vStock,
      sku: vSku,
      attributes: vAttrs,
    })
  }

  await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeId = await resolveStore(tx, session.user.id)

      const [product] = await tx
        .insert(schema.products)
        .values({ storeId, name, slug, categoryId, description, status })
        .returning({ id: schema.products.id })

      await tx.insert(schema.productVariants).values(
        variants.map((v, i) => ({
          productId: product!.id,
          name: v.name,
          sku: v.sku,
          priceMyrSen: v.priceMyrSen,
          stockCount: v.stockCount,
          attributes: v.attributes,
          sortOrder: i,
        })),
      )
    },
  )

  revalidatePath("/seller/dashboard/products")
  redirect("/seller/dashboard/products")
}

export async function updateProduct(productId: string, formData: FormData): Promise<void> {
  const session = await requireSeller()

  const name = str(formData, "name").trim()
  if (!name) throw new Error("Product name is required")
  const slug = str(formData, "slug").trim() || slugify(name)
  if (!slug) throw new Error("Could not generate a valid slug from the product name")
  const categoryId = str(formData, "categoryId") || null
  const description = str(formData, "description").trim() || null
  const status = (str(formData, "status") || "draft") as "draft" | "active" | "archived"

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .update(schema.products)
        .set({ name, slug, categoryId, description, status, updatedAt: new Date() })
        .where(eq(schema.products.id, productId))
        .returning({ id: schema.products.id }),
  )

  if (updated.length === 0) throw new Error("Product not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${productId}/edit`)
  revalidatePath("/seller/dashboard/products")
}

export async function archiveProduct(productId: string): Promise<void> {
  const session = await requireSeller()

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .update(schema.products)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(schema.products.id, productId))
        .returning({ id: schema.products.id }),
  )

  if (updated.length === 0) throw new Error("Product not found or not authorized")

  revalidatePath("/seller/dashboard/products")
  redirect("/seller/dashboard/products")
}

// ─── Variant mutations ─────────────────────────────────────────────────────

export async function addVariant(productId: string, formData: FormData): Promise<void> {
  const session = await requireSeller()

  const ownedProductCheck = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(and(eq(schema.products.id, productId), eq(schema.stores.ownerId, session.user.id)))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!ownedProductCheck) throw new Error("Product not found or not authorized")

  const name = str(formData, "name").trim()
  if (!name) throw new Error("Variant name is required")
  const priceMyrSen = parseMyrToSen(str(formData, "price"))
  const stockCount = parseInt(str(formData, "stock") || "0", 10)
  if (stockCount < 0) throw new Error("Stock cannot be negative")
  const sku = str(formData, "sku").trim() || null
  const attrsRaw = str(formData, "attrs").trim()
  let attributes: Record<string, unknown> = {}
  if (attrsRaw) {
    try {
      attributes = JSON.parse(attrsRaw) as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }

  await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      await tx.insert(schema.productVariants).values({
        productId,
        name,
        sku,
        priceMyrSen,
        stockCount,
        attributes,
      })
    },
  ).catch((err) => {
    if (isRlsViolation(err)) throw new Error("Product not found or not authorized")
    throw err
  })

  revalidatePath(`/seller/dashboard/products/${productId}/edit`)
}

export async function updateVariant(variantId: string, formData: FormData): Promise<void> {
  const session = await requireSeller()

  const name = str(formData, "name").trim()
  if (!name) throw new Error("Variant name is required")
  const priceMyrSen = parseMyrToSen(str(formData, "price"))
  const stockCount = parseInt(str(formData, "stock") || "0", 10)
  if (stockCount < 0) throw new Error("Stock cannot be negative")
  const sku = str(formData, "sku").trim() || null
  const attrsRaw = str(formData, "attrs").trim()
  let attributes: Record<string, unknown> = {}
  if (attrsRaw) {
    try {
      attributes = JSON.parse(attrsRaw) as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .update(schema.productVariants)
        .set({ name, sku, priceMyrSen, stockCount, attributes, updatedAt: new Date() })
        .where(eq(schema.productVariants.id, variantId))
        .returning({ id: schema.productVariants.id, productId: schema.productVariants.productId }),
  )

  if (updated.length === 0) throw new Error("Variant not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${updated[0]!.productId}/edit`)
}

export async function deactivateVariant(variantId: string): Promise<void> {
  const session = await requireSeller()

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .update(schema.productVariants)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.productVariants.id, variantId))
        .returning({ id: schema.productVariants.id, productId: schema.productVariants.productId }),
  )

  if (updated.length === 0) throw new Error("Variant not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${updated[0]!.productId}/edit`)
}

// ─── Image mutations ───────────────────────────────────────────────────────

export async function addProductImage(
  productId: string,
  url: string,
  altText?: string,
  sortOrder?: number,
): Promise<void> {
  const session = await requireSeller()

  const ownedProductCheck = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(and(eq(schema.products.id, productId), eq(schema.stores.ownerId, session.user.id)))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!ownedProductCheck) throw new Error("Product not found or not authorized")

  await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      await tx.insert(schema.productImages).values({
        productId,
        url,
        altText: altText ?? null,
        sortOrder: sortOrder ?? 0,
      })
    },
  ).catch((err) => {
    if (isRlsViolation(err)) throw new Error("Product not found or not authorized")
    throw err
  })

  revalidatePath(`/seller/dashboard/products/${productId}/edit`)
}

export async function removeProductImage(imageId: string): Promise<void> {
  const session = await requireSeller()
  const db = getDb()

  const imageRows = await withTenant(
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({
          id: schema.productImages.id,
          productId: schema.productImages.productId,
        })
        .from(schema.productImages)
        .innerJoin(schema.products, eq(schema.products.id, schema.productImages.productId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(eq(schema.productImages.id, imageId), eq(schema.stores.ownerId, session.user.id)),
        )
        .limit(1),
  )

  if (!imageRows[0]) throw new Error("Image not found or not authorized")

  await withAdmin(db, { userId: session.user.id, reason: "seller image removal" }, async (tx) => {
    await tx.delete(schema.productImages).where(eq(schema.productImages.id, imageId))
  })

  revalidatePath(`/seller/dashboard/products/${imageRows[0].productId}/edit`)
}

// ─── Presigned upload URL ──────────────────────────────────────────────────

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
): Promise<{ url: string; key: string; publicUrl: string }> {
  await requireSeller()

  const { createPresignedPutUrl, buildPublicUrl } = await import("@/lib/s3")
  const { url, key } = await createPresignedPutUrl(filename, contentType)
  return { url, key, publicUrl: buildPublicUrl(key) }
}
