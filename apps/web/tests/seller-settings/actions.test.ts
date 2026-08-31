import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import {
  updateStoreSeo,
  updateStoreSettings,
  updateStoreVideo,
} from "../../src/app/seller/dashboard/settings/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const mockRevalidatePath = revalidatePath as unknown as Mock

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

describe.skipIf(!shouldRun)("updateStoreSettings action", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let buyerId: string
  let storeId: string
  let suspendedStoreId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    buyerId = randomUUID()

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "settings test seed" },
      async (tx) => {
        await tx.insert(schema.users).values([
          {
            id: sellerId,
            email: `${sellerId}@test.bomy`,
            role: "seller_owner",
            name: "Settings Seller",
          },
          { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer", name: "Settings Buyer" },
        ])

        const [active] = await tx
          .insert(schema.stores)
          .values({
            ownerId: sellerId,
            name: "Settings Test Store",
            slug: `settings-store-${randomUUID().slice(0, 8)}`,
            status: "active",
          })
          .returning({ id: schema.stores.id })
        storeId = active!.id

        const [suspended] = await tx
          .insert(schema.stores)
          .values({
            ownerId: sellerId,
            name: "Settings Suspended Store",
            slug: `settings-susp-${randomUUID().slice(0, 8)}`,
            status: "suspended",
          })
          .returning({ id: schema.stores.id })
        suspendedStoreId = suspended!.id
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "settings test cleanup" },
      async (tx) => {
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, suspendedStoreId))
      },
    )
    await testDb.close()
  })

  it("saves excerpt on the active store", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSettings(fd({ excerpt: "Hello world" }))
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ excerpt: schema.stores.excerpt })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.excerpt).toBe("Hello world")
  })

  it("clears excerpt to NULL when empty string submitted", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    await updateStoreSettings(fd({ excerpt: "Will be cleared" }))

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSettings(fd({ excerpt: "" }))
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ excerpt: schema.stores.excerpt })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.excerpt).toBeNull()
  })

  it("rejects excerpt over 160 characters", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSettings(fd({ excerpt: "a".repeat(161) }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/160/)
  })

  it("rejects unauthenticated request", async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await updateStoreSettings(fd({ excerpt: "test" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })

  it("rejects non-seller request", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: buyerId, role: "buyer" } })
    const result = await updateStoreSettings(fd({ excerpt: "test" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })

  it("rejects when seller has no active store (only suspended)", async () => {
    // Temporarily deactivate the active store so only the suspended one remains
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "suspended" }).where(eq(schema.stores.id, storeId)),
    )

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSettings(fd({ excerpt: "test" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/active store/i)

    // Restore
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "restore" }, (tx) =>
      tx.update(schema.stores).set({ status: "active" }).where(eq(schema.stores.id, storeId)),
    )
  })

  it("DB CHECK rejects excerpt > 160 chars via direct insert", async () => {
    await expect(
      withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
        tx
          .update(schema.stores)
          .set({ excerpt: "x".repeat(161) })
          .where(eq(schema.stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })
})

describe.skipIf(!shouldRun)("updateStoreSeo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let buyerId: string
  let storeId: string
  let suspendedStoreId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    buyerId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seo test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner", name: "SEO Seller" },
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer", name: "SEO Buyer" },
      ])

      const [active] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "SEO Test Store",
          slug: `seo-store-${randomUUID().slice(0, 8)}`,
          status: "active",
        })
        .returning({ id: schema.stores.id })
      storeId = active!.id

      const [suspended] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "SEO Suspended Store",
          slug: `seo-susp-${randomUUID().slice(0, 8)}`,
          status: "suspended",
        })
        .returning({ id: schema.stores.id })
      suspendedStoreId = suspended!.id
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seo test cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, suspendedStoreId))
    })
    await testDb.close()
  })

  it("saves SEO fields on the active store", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(
      fd({
        metaTitle: "Custom Title",
        metaDescription: "Custom description",
        ogImageUrl: "https://cdn.example.com/og.png",
      }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({
          metaTitle: schema.stores.metaTitle,
          metaDescription: schema.stores.metaDescription,
          ogImageUrl: schema.stores.ogImageUrl,
        })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.metaTitle).toBe("Custom Title")
    expect(row?.metaDescription).toBe("Custom description")
    expect(row?.ogImageUrl).toBe("https://cdn.example.com/og.png")
  })

  it("clears fields to NULL when empty strings submitted", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "y", ogImageUrl: "" }))

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(fd({ metaTitle: "", metaDescription: "", ogImageUrl: "" }))
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ metaTitle: schema.stores.metaTitle, ogImageUrl: schema.stores.ogImageUrl })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.metaTitle).toBeNull()
    expect(row?.ogImageUrl).toBeNull()
  })

  it("rejects an invalid ogImageUrl without writing anything", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(
      fd({ metaTitle: "", metaDescription: "", ogImageUrl: "not-a-url" }),
    )
    expect(result.ok).toBe(false)
  })

  it("rejects unauthenticated request", async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })

  it("rejects non-seller request", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: buyerId, role: "buyer" } })
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })

  it("rejects when the seller's only store is suspended", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "suspended" }).where(eq(schema.stores.id, storeId)),
    )

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/active store/i)

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "restore" }, (tx) =>
      tx.update(schema.stores).set({ status: "active" }).where(eq(schema.stores.id, storeId)),
    )
  })

  it("revalidates both the settings page and the public storefront on success", async () => {
    mockRevalidatePath.mockClear()
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/seller/dashboard/settings")

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ slug: schema.stores.slug })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/brands/${row!.slug}`)
  })
})

describe.skipIf(!shouldRun)("updateStoreVideo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let storeId: string
  let storeSlug: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    storeSlug = `video-settings-${randomUUID().slice(0, 8)}`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "video settings test seed" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: sellerId,
          email: `${sellerId}@test.bomy`,
          role: "seller_owner",
          name: "Video Settings Seller",
        })
        const [store] = await tx
          .insert(schema.stores)
          .values({
            ownerId: sellerId,
            name: "Video Settings Test Store",
            slug: storeSlug,
            status: "active",
          })
          .returning({ id: schema.stores.id })
        storeId = store!.id
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "video settings test cleanup" },
      async (tx) => {
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      },
    )
    await testDb.close()
  })

  it("extracts and saves a valid YouTube URL as a bare video ID", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(
      fd({ videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ videoId: schema.stores.videoId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.videoId).toBe("dQw4w9WgXcQ")
  })

  it("revalidates both the settings page and the public storefront on success", async () => {
    mockRevalidatePath.mockClear()
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(
      fd({ videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    )
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/seller/dashboard/settings")
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/brands/${storeSlug}`)
  })

  it("rejects an unparseable video URL without writing anything", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(fd({ videoUrl: "not a video url" }))
    expect(result.ok).toBe(false)
  })

  it("normalizes an empty submission to NULL (clearing a previously-set video)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    await updateStoreVideo(fd({ videoUrl: "https://youtu.be/dQw4w9WgXcQ" }))

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(fd({ videoUrl: "" }))
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ videoId: schema.stores.videoId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.videoId).toBeNull()
  })

  it("rejects unauthenticated request", async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await updateStoreVideo(fd({ videoUrl: "https://youtu.be/dQw4w9WgXcQ" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })
})
