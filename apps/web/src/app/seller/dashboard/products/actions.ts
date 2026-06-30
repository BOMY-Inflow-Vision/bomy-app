"use server"

import { and, asc, eq, isNull, max, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"
import type { Database } from "@bomy/db"

import { auth } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

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

// Normalizes raw form values into a valid fulfillment pair.
// "preorder" without positive lead days is downgraded to "backorder".
function normalizeFulfillment(
  modeRaw: string,
  leadDaysRaw: number,
): {
  fulfillmentMode: "normal" | "backorder" | "preorder"
  preorderLeadDays: number | null
} {
  const mode: "normal" | "backorder" | "preorder" =
    modeRaw === "backorder" || modeRaw === "preorder" ? modeRaw : "normal"
  if (mode === "preorder" && leadDaysRaw > 0) {
    return { fulfillmentMode: "preorder", preorderLeadDays: leadDaysRaw }
  }
  if (mode === "preorder") {
    return { fulfillmentMode: "backorder", preorderLeadDays: null }
  }
  return { fulfillmentMode: mode, preorderLeadDays: null }
}

async function resolveStore(tx: Database, userId: string): Promise<string> {
  const rows = await tx
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
    .limit(1)
  if (!rows[0]) throw new Error("No active store found for this seller")
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

      const currentCategoryId = products[0].categoryId

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
          .orderBy(
            asc(schema.productImages.sortOrder),
            asc(schema.productImages.createdAt),
            asc(schema.productImages.id),
          ),
        tx
          .select({
            id: schema.categories.id,
            name: schema.categories.name,
            isActive: schema.categories.isActive,
          })
          .from(schema.categories)
          .where(
            currentCategoryId
              ? or(
                  eq(schema.categories.isActive, true),
                  eq(schema.categories.id, currentCategoryId),
                )
              : eq(schema.categories.isActive, true),
          )
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
    fulfillmentMode: "normal" | "backorder" | "preorder"
    preorderLeadDays: number | null
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
    const vModeRaw = str(formData, `variant_fulfillment_mode_${i}`)
    const vLeadDaysRaw = parseInt(str(formData, `variant_preorder_lead_days_${i}`) || "0", 10)
    const { fulfillmentMode: vMode, preorderLeadDays: vLeadDays } = normalizeFulfillment(
      vModeRaw,
      vLeadDaysRaw,
    )
    variants.push({
      name: vName,
      priceMyrSen: vPrice,
      stockCount: vStock,
      sku: vSku,
      attributes: vAttrs,
      fulfillmentMode: vMode,
      preorderLeadDays: vLeadDays,
    })
  }

  const productId = await withTenant(
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
          fulfillmentMode: v.fulfillmentMode,
          preorderLeadDays: v.preorderLeadDays,
          sortOrder: i,
        })),
      )

      return product!.id
    },
  )

  revalidatePath("/seller/dashboard/products")
  redirect(`/seller/dashboard/products/${productId}/edit`)
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
    async (tx) => {
      const storeRows = await tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .innerJoin(schema.products, eq(schema.products.storeId, schema.stores.id))
        .where(
          and(
            eq(schema.products.id, productId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!storeRows[0]) throw new Error("Product not found or not authorized")

      return tx
        .update(schema.products)
        .set({ name, slug, categoryId, description, status, updatedAt: new Date() })
        .where(eq(schema.products.id, productId))
        .returning({ id: schema.products.id })
    },
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
    async (tx) => {
      const storeRows = await tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .innerJoin(schema.products, eq(schema.products.storeId, schema.stores.id))
        .where(
          and(
            eq(schema.products.id, productId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!storeRows[0]) throw new Error("Product not found or not authorized")

      return tx
        .update(schema.products)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(schema.products.id, productId))
        .returning({ id: schema.products.id })
    },
  )

  if (updated.length === 0) throw new Error("Product not found or not authorized")

  revalidatePath("/seller/dashboard/products")
  redirect("/seller/dashboard/products")
}

// ─── Variant mutations ─────────────────────────────────────────────────────

export async function addVariant(productId: string, formData: FormData): Promise<void> {
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
  const { fulfillmentMode, preorderLeadDays } = normalizeFulfillment(
    str(formData, "fulfillment_mode"),
    parseInt(str(formData, "preorder_lead_days") || "0", 10),
  )

  await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(
            eq(schema.products.id, productId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!rows[0]) throw new Error("Product not found or not authorized")

      await tx.insert(schema.productVariants).values({
        productId,
        name,
        sku,
        priceMyrSen,
        stockCount,
        attributes,
        fulfillmentMode,
        preorderLeadDays,
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
  const { fulfillmentMode, preorderLeadDays } = normalizeFulfillment(
    str(formData, "fulfillment_mode"),
    parseInt(str(formData, "preorder_lead_days") || "0", 10),
  )

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeCheck = await tx
        .select({ id: schema.stores.id })
        .from(schema.productVariants)
        .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(
            eq(schema.productVariants.id, variantId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!storeCheck[0]) throw new Error("Variant not found or not authorized")

      return tx
        .update(schema.productVariants)
        .set({
          name,
          sku,
          priceMyrSen,
          stockCount,
          attributes,
          fulfillmentMode,
          preorderLeadDays,
          updatedAt: new Date(),
        })
        .where(eq(schema.productVariants.id, variantId))
        .returning({ id: schema.productVariants.id, productId: schema.productVariants.productId })
    },
  )

  if (updated.length === 0) throw new Error("Variant not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${updated[0]!.productId}/edit`)
}

export async function reactivateVariant(variantId: string): Promise<void> {
  const session = await requireSeller()

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeCheck = await tx
        .select({ id: schema.stores.id })
        .from(schema.productVariants)
        .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(
            eq(schema.productVariants.id, variantId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!storeCheck[0]) throw new Error("Variant not found or not authorized")

      return tx
        .update(schema.productVariants)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(schema.productVariants.id, variantId))
        .returning({ id: schema.productVariants.id, productId: schema.productVariants.productId })
    },
  )

  if (updated.length === 0) throw new Error("Variant not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${updated[0]!.productId}/edit`)
}

export async function deactivateVariant(variantId: string): Promise<void> {
  const session = await requireSeller()

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeCheck = await tx
        .select({ id: schema.stores.id })
        .from(schema.productVariants)
        .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(
            eq(schema.productVariants.id, variantId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!storeCheck[0]) throw new Error("Variant not found or not authorized")

      return tx
        .update(schema.productVariants)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.productVariants.id, variantId))
        .returning({ id: schema.productVariants.id, productId: schema.productVariants.productId })
    },
  )

  if (updated.length === 0) throw new Error("Variant not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${updated[0]!.productId}/edit`)
}

// ─── Image mutations ───────────────────────────────────────────────────────

export async function addProductImage(
  productId: string,
  key: string,
  claim: string,
  altText?: string,
  sortOrder?: number,
): Promise<{ id: string; url: string; altText: string | null; sortOrder: number }> {
  const KEY_PATTERN =
    /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid image key")

  const { buildPublicUrl, verifyUploadClaim } = await import("@/lib/s3")
  const url = buildPublicUrl(key)

  const session = await requireSeller()
  if (!verifyUploadClaim(session.user.id, key, claim)) throw new Error("Invalid upload claim")

  const newImage = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(
            eq(schema.products.id, productId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
        .for("update", { of: schema.products })
      if (!rows[0]) throw new Error("Product not found or not authorized")

      const nextSortOrder =
        sortOrder !== undefined
          ? sortOrder
          : await (async () => {
              const [maxRow] = await tx
                .select({ maxOrder: max(schema.productImages.sortOrder) })
                .from(schema.productImages)
                .where(eq(schema.productImages.productId, productId))
              return (maxRow?.maxOrder ?? -1) + 1
            })()

      const [inserted] = await tx
        .insert(schema.productImages)
        .values({ productId, url, altText: altText ?? null, sortOrder: nextSortOrder })
        .returning({
          id: schema.productImages.id,
          url: schema.productImages.url,
          altText: schema.productImages.altText,
          sortOrder: schema.productImages.sortOrder,
        })

      await tx
        .update(schema.products)
        .set({ coverImageUrl: url })
        .where(and(eq(schema.products.id, productId), isNull(schema.products.coverImageUrl)))

      return inserted!
    },
  ).catch((err) => {
    if (isRlsViolation(err)) throw new Error("Product not found or not authorized")
    throw err
  })

  revalidatePath(`/seller/dashboard/products/${productId}/edit`)
  return newImage
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
          url: schema.productImages.url,
        })
        .from(schema.productImages)
        .innerJoin(schema.products, eq(schema.products.id, schema.productImages.productId))
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(
          and(
            eq(schema.productImages.id, imageId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1),
  )

  if (!imageRows[0]) throw new Error("Image not found or not authorized")

  const { keyFromPublicUrl, deleteObject } = await import("@/lib/s3")
  const key = keyFromPublicUrl(imageRows[0].url)
  if (key) {
    await deleteObject(key)
  }

  await withAdmin(db, { userId: session.user.id, reason: "seller image removal" }, async (tx) => {
    await tx.delete(schema.productImages).where(eq(schema.productImages.id, imageId))

    const removedUrl = imageRows[0]!.url
    const removedProductId = imageRows[0]!.productId
    const [prod] = await tx
      .select({ coverImageUrl: schema.products.coverImageUrl })
      .from(schema.products)
      .where(eq(schema.products.id, removedProductId))
      .limit(1)

    if (prod?.coverImageUrl === removedUrl) {
      const [next] = await tx
        .select({ url: schema.productImages.url })
        .from(schema.productImages)
        .where(eq(schema.productImages.productId, removedProductId))
        .orderBy(
          asc(schema.productImages.sortOrder),
          asc(schema.productImages.createdAt),
          asc(schema.productImages.id),
        )
        .limit(1)
      await tx
        .update(schema.products)
        .set({ coverImageUrl: next?.url ?? null })
        .where(eq(schema.products.id, removedProductId))
    }
  })

  revalidatePath(`/seller/dashboard/products/${imageRows[0].productId}/edit`)
}

// ─── Presigned upload URL ──────────────────────────────────────────────────

export async function getPresignedUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<{ url: string; key: string; claim: string } | { error: string }> {
  const session = await requireSeller()

  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return { error: "Unsupported image type" }
  }

  if (contentLength <= 0 || contentLength > 2 * 1024 * 1024) {
    return { error: "File must be between 1 byte and 2 MB" }
  }

  const storeCheck = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) =>
      tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
        .limit(1),
  )
  if (!storeCheck[0]) return { error: "Store is not active" }

  const { createPresignedPutUrl, signUploadClaim } = await import("@/lib/s3")
  const { url, key } = await createPresignedPutUrl(contentType, contentLength)
  const claim = signUploadClaim(session.user.id, key)
  return { url, key, claim }
}

// ─── Body HTML save ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function saveProductBody(
  productId: string,
  bodyHtml: string,
  revision: number,
): Promise<{ ok: true; revision: number; html: string | null } | { ok: false; error: string }> {
  const session = await requireSeller()
  const userId = session.user.id

  if (!Number.isSafeInteger(revision) || revision < 0) {
    return { ok: false, error: "invalid_revision" }
  }
  if (!UUID_RE.test(productId)) {
    return { ok: false, error: "invalid_product_id" }
  }

  const S3_PUBLIC_URL = process.env["S3_PUBLIC_URL"] ?? ""
  try {
    const u = new URL(S3_PUBLIC_URL)
    if (u.protocol !== "https:") throw new Error()
  } catch {
    return { ok: false, error: "misconfigured" }
  }
  const { normalizeBodyHtml } = await import("./body-sanitizer")
  const normalized = normalizeBodyHtml(bodyHtml, productId, S3_PUBLIC_URL)
  if (!normalized.ok) return normalized
  const { canonicalHtml } = normalized

  const txResult = await withTenant(getDb(), { userId, userRole: "seller_owner" }, async (tx) => {
    const [store] = await tx
      .select({ id: schema.stores.id, slug: schema.stores.slug })
      .from(schema.stores)
      .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
      .limit(1)
    if (!store) return { ok: false as const, error: "not_found" }

    const [existing] = await tx
      .select({
        bodyRevision: schema.products.bodyRevision,
        bodyHtml: schema.products.bodyHtml,
        productSlug: schema.products.slug,
      })
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.storeId, store.id)))
      .for("update", { of: schema.products })
      .limit(1)

    if (!existing) return { ok: false as const, error: "not_found" }
    if (existing.bodyRevision !== revision) return { ok: false as const, error: "conflict" }

    await tx
      .update(schema.products)
      .set({ bodyHtml: canonicalHtml, bodyRevision: revision + 1, updatedAt: new Date() })
      .where(eq(schema.products.id, productId))

    return {
      ok: true as const,
      storeSlug: store.slug,
      productSlug: existing.productSlug,
      oldBodyHtml: existing.bodyHtml,
    }
  })

  if (!txResult.ok) return txResult

  revalidatePath(`/seller/dashboard/products/${productId}/edit`)
  revalidatePath(`/products/${txResult.storeSlug}/${txResult.productSlug}`)

  // Delete orphaned body images after the response returns.
  // after() extends the Vercel invocation via waitUntil so the deletion isn't cut off.
  // The nightly cleanup job remains the safety net for any deletes that fail.
  if (txResult.oldBodyHtml) {
    const oldHtml = txResult.oldBodyHtml
    after(async () => {
      try {
        const { extractManagedBodyImageKeys } = await import("@bomy/shared")
        const { deleteObject } = await import("@/lib/s3")
        const oldKeys = extractManagedBodyImageKeys(oldHtml, productId, S3_PUBLIC_URL)
        const newKeys = extractManagedBodyImageKeys(canonicalHtml ?? "", productId, S3_PUBLIC_URL)
        // Re-read the live body to guard against a concurrent save re-referencing a key
        // between our commit and this task running.
        const [current] = await withAdmin(
          getDb(),
          { userId: SYSTEM_ACTOR, reason: "body-image-orphan-cleanup" },
          (tx) =>
            tx
              .select({ bodyHtml: schema.products.bodyHtml })
              .from(schema.products)
              .where(eq(schema.products.id, productId))
              .limit(1),
        )
        const currentKeys = extractManagedBodyImageKeys(
          current?.bodyHtml ?? "",
          productId,
          S3_PUBLIC_URL,
        )
        for (const key of oldKeys) {
          if (!newKeys.has(key) && !currentKeys.has(key)) {
            try {
              await deleteObject(key)
            } catch (err) {
              console.error(`[saveProductBody] R2 delete failed for key ${key}:`, err)
            }
          }
        }
      } catch (err) {
        console.error("[saveProductBody] Orphan image cleanup failed:", err)
      }
    })
  }

  return { ok: true, revision: revision + 1, html: canonicalHtml }
}

// ─── Body image upload URL ─────────────────────────────────────────────────

const BODY_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]
const BODY_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export async function getBodyImageUploadUrl(
  productId: string,
  contentType: string,
  contentLength: number,
): Promise<
  | { ok: true; uploadUrl: string; key: string; publicUrl: string; expiresAt: Date }
  | { ok: false; error: string }
> {
  const session = await requireSeller()
  const userId = session.user.id

  if (!BODY_IMAGE_ALLOWED_TYPES.includes(contentType)) {
    return { ok: false, error: "invalid_type" }
  }
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > 2 * 1024 * 1024
  ) {
    return { ok: false, error: "invalid_size" }
  }
  if (!UUID_RE.test(productId)) {
    return { ok: false, error: "invalid_product_id" }
  }

  const result = await withTenant(getDb(), { userId, userRole: "seller_owner" }, async (tx) => {
    const [store] = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
      .limit(1)
    if (!store) return { ok: false as const, error: "not_found" }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('body-img-sign:' || ${userId}))`)

    const [product] = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.storeId, store.id)))
      .for("update", { of: schema.products })
      .limit(1)
    if (!product) return { ok: false as const, error: "not_found" }

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bodyImageUploadLog)
      .where(
        and(
          eq(schema.bodyImageUploadLog.userId, userId),
          sql`${schema.bodyImageUploadLog.createdAt} > now() - interval '1 hour'`,
        ),
      )
    const count = countRows[0]?.count ?? 0
    if (count >= 20) return { ok: false as const, error: "rate_limited" }

    await tx.insert(schema.bodyImageUploadLog).values({ userId })
    return { ok: true as const }
  })

  if (!result.ok) return result

  const ext = BODY_MIME_TO_EXT[contentType]!
  const key = `body/${productId}/${randomUUID()}.${ext}`
  const { createBodyPresignedPutUrl, buildPublicUrl } = await import("@/lib/s3")
  const publicUrl = buildPublicUrl(key)
  const { url: uploadUrl, expiresAt } = await createBodyPresignedPutUrl(
    key,
    contentType,
    contentLength,
  )
  return { ok: true, uploadUrl, key, publicUrl, expiresAt }
}
