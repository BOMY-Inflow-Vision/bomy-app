import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { updateProductSeo } from "../../src/app/products/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock
const mockRevalidatePath = revalidatePath as unknown as Mock

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

describe.skipIf(!shouldRun)("updateProductSeo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let sellerId: string
  let storeId: string
  let storeSlug: string
  let productId: string
  let productSlug: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    sellerId = randomUUID()
    storeSlug = `admin-prod-seo-${randomUUID().slice(0, 8)}`
    productSlug = `admin-prod-seo-item-${randomUUID().slice(0, 8)}`

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: sellerId, email: `seller-${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      const [store] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "Admin Product SEO Store",
          slug: storeSlug,
          status: "active",
        })
        .returning({ id: schema.stores.id })
      storeId = store!.id

      const [product] = await tx
        .insert(schema.products)
        .values({ storeId, name: "Admin SEO Product", slug: productSlug })
        .returning({ id: schema.products.id })
      productId = product!.id
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.products).where(eq(schema.products.id, productId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await testDb.close()
  })

  it("saves SEO fields on the product", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({
        metaTitle: "Admin Product Title",
        metaDescription: "Admin product description",
        ogImageUrl: "https://cdn.example.com/product-og.png",
      }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({
          metaTitle: schema.products.metaTitle,
          metaDescription: schema.products.metaDescription,
          ogImageUrl: schema.products.ogImageUrl,
        })
        .from(schema.products)
        .where(eq(schema.products.id, productId)),
    )
    expect(row?.metaTitle).toBe("Admin Product Title")
    expect(row?.metaDescription).toBe("Admin product description")
    expect(row?.ogImageUrl).toBe("https://cdn.example.com/product-og.png")
  })

  it("rejects an invalid ogImageUrl without writing anything", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({ metaTitle: "", metaDescription: "", ogImageUrl: "not-a-url" }),
    )
    expect(result.ok).toBe(false)
  })

  it("returns an error for a nonexistent product", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      randomUUID(),
      fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }),
    )
    expect(result).toEqual({ ok: false, error: "Product not found" })
  })

  it("rejects a non-admin caller (seller_owner) without writing anything", async () => {
    mockAuth.mockResolvedValue({ user: { id: sellerId, role: "seller_owner" } })
    await expect(
      updateProductSeo(
        productId,
        fd({ metaTitle: "Hijacked", metaDescription: "", ogImageUrl: "" }),
      ),
    ).rejects.toThrow("FORBIDDEN")

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ metaTitle: schema.products.metaTitle })
        .from(schema.products)
        .where(eq(schema.products.id, productId)),
    )
    expect(row?.metaTitle).not.toBe("Hijacked")
  })

  it("admin can edit SEO for a product owned by a different seller than the admin", async () => {
    expect(adminId).not.toBe(sellerId)
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({ metaTitle: "Cross-owner edit", metaDescription: "", ogImageUrl: "" }),
    )
    expect(result).toEqual({ ok: true })
  })

  it("revalidates the admin product page and the public product page", async () => {
    mockRevalidatePath.mockClear()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }),
    )
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/products/${productId}`)
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/products/${storeSlug}/${productSlug}`)
  })
})
