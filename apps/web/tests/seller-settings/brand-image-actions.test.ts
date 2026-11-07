import { createHmac, randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const afterCallbacks: Array<() => void | Promise<void>> = []
vi.mock("next/server", () => ({
  after: vi.fn((fn: () => void | Promise<void>) => {
    afterCallbacks.push(fn)
  }),
}))
async function flushAfter() {
  const fns = afterCallbacks.splice(0)
  await Promise.all(fns.map((fn) => Promise.resolve(fn())))
}
vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), deleteObject: vi.fn().mockResolvedValue(undefined) }
})

import { auth } from "@/auth"
import { deleteObject } from "@/lib/s3"
import {
  getBrandImageUploadUrl,
  removeBrandImage,
  saveBrandImage,
  setBrandImageFocus,
} from "../../src/app/seller/dashboard/settings/brand-image-actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const mockDelete = deleteObject as unknown as Mock
const SECRET = "test-secret"
const claim = (userId: string, key: string) =>
  createHmac("sha256", SECRET).update(`${userId}:${key}`).digest("hex")
const newKey = (ext = "jpg") => `brands/${randomUUID()}.${ext}`
const CDN = "https://cdn.example.com"

describe.skipIf(!shouldRun)("brand image actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let otherId: string
  let storeId: string

  const asSeller = (id: string) =>
    mockAuth.mockResolvedValue({ user: { id, role: "seller_owner" } })
  const readStore = async () => {
    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx.select().from(schema.stores).where(eq(schema.stores.id, storeId)),
    )
    return row!
  }
  const upload = async (key = newKey()) => {
    asSeller(sellerId)
    return { key, result: await saveBrandImage(key, claim(sellerId, key)) }
  }

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    process.env["S3_PUBLIC_URL"] = CDN
    process.env["AUTH_SECRET"] = SECRET
    testDb = makeDb({ url: DATABASE_URL as string })
    // bomy_app has no DELETE on users, so a fixture user could never be cleaned up. Reuse the seeded
    // SYSTEM_ACTOR as the store owner (its session is mocked as seller_owner), and use a random,
    // never-inserted id for the seller who has no store. Only the store row is created, and removed.
    sellerId = SYSTEM_ACTOR
    otherId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "brand image seed" }, async (tx) => {
      const [s] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "Brand Image Store",
          slug: `brand-img-${randomUUID().slice(0, 8)}`,
          status: "active",
        })
        .returning({ id: schema.stores.id })
      storeId = s!.id
    })
  })

  beforeEach(async () => {
    afterCallbacks.length = 0
    mockDelete.mockClear()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "reset" }, (tx) =>
      tx
        .update(schema.stores)
        .set({ imageUrl: null, imageFocalX: 50, imageFocalY: 50 })
        .where(eq(schema.stores.id, storeId)),
    )
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await testDb.close()
  })

  it("a new picture is saved centred", async () => {
    const { key, result } = await upload()
    expect(result).toEqual({ ok: true, imageUrl: `${CDN}/${key}`, focalX: 50, focalY: 50 })
    const s = await readStore()
    expect([s.imageUrl, s.imageFocalX, s.imageFocalY]).toEqual([`${CDN}/${key}`, 50, 50])
  })

  it("rejects a bad key, a claim for another user, and a key from another prefix", async () => {
    asSeller(sellerId)
    const good = newKey()
    expect(await saveBrandImage("brands/../x.jpg", claim(sellerId, good))).toEqual({
      ok: false,
      error: "Invalid image key",
    })
    expect(await saveBrandImage(`products/${randomUUID()}.jpg`, "x")).toEqual({
      ok: false,
      error: "Invalid image key",
    })
    expect(await saveBrandImage(good, claim(otherId, good))).toEqual({
      ok: false,
      error: "Invalid upload claim",
    })
    expect((await readStore()).imageUrl).toBeNull()
  })

  it("replacing resets the point to the centre and deletes the old object after the response", async () => {
    const first = await upload()
    await setBrandImageFocus(10, 90)
    const second = await upload()
    const s = await readStore()
    expect([s.imageUrl, s.imageFocalX, s.imageFocalY]).toEqual([`${CDN}/${second.key}`, 50, 50])
    expect(mockDelete).not.toHaveBeenCalled()
    await flushAfter()
    expect(mockDelete).toHaveBeenCalledWith(first.key)
  })

  it("removing clears the picture and the point and deletes the object", async () => {
    const { key } = await upload()
    await setBrandImageFocus(20, 20)
    asSeller(sellerId)
    expect(await removeBrandImage()).toEqual({ ok: true, imageUrl: null, focalX: 50, focalY: 50 })
    const s = await readStore()
    expect([s.imageUrl, s.imageFocalX, s.imageFocalY]).toEqual([null, 50, 50])
    await flushAfter()
    expect(mockDelete).toHaveBeenCalledWith(key)
  })

  it("setBrandImageFocus rounds, clamps and refuses non-numbers", async () => {
    await upload()
    expect(await setBrandImageFocus(33.4, 66.6)).toMatchObject({ ok: true, focalX: 33, focalY: 67 })
    expect(await setBrandImageFocus(130, -5)).toMatchObject({ ok: true, focalX: 100, focalY: 0 })
    for (const [x, y] of [
      [Number.NaN, 50],
      [50, Number.POSITIVE_INFINITY],
      ["10" as unknown as number, 50],
    ] as const) {
      expect(await setBrandImageFocus(x, y)).toEqual({ ok: false, error: "Invalid focus point" })
    }
    const s = await readStore()
    expect([s.imageFocalX, s.imageFocalY]).toEqual([100, 0])
  })

  it("setBrandImageFocus needs a picture first", async () => {
    asSeller(sellerId)
    expect(await setBrandImageFocus(10, 10)).toEqual({
      ok: false,
      error: "Upload a brand picture first",
    })
  })

  it("a seller with no active store cannot save, move or remove", async () => {
    asSeller(otherId)
    const key = newKey()
    const store = { ok: false, error: "Store not found or not authorized" }
    expect(await saveBrandImage(key, claim(otherId, key))).toEqual(store)
    expect(await removeBrandImage()).toEqual(store)
    expect(await setBrandImageFocus(1, 1)).toEqual({
      ok: false,
      error: "Upload a brand picture first",
    })
    expect(await getBrandImageUploadUrl("image/png", 100)).toEqual({ error: "Store is not active" })
  })

  it("presign refuses an unsupported type and an oversize file", async () => {
    asSeller(sellerId)
    expect(await getBrandImageUploadUrl("image/svg+xml", 100)).toEqual({
      error: "Unsupported image type",
    })
    expect(await getBrandImageUploadUrl("image/png", 3 * 1024 * 1024)).toEqual({
      error: "File must be between 1 byte and 2 MB",
    })
  })

  it("the database refuses a non-http picture URL and an out-of-range point", async () => {
    await expect(
      withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "constraint" }, (tx) =>
        tx
          .update(schema.stores)
          .set({ imageUrl: "javascript:alert(1)" })
          .where(eq(schema.stores.id, storeId)),
      ),
    ).rejects.toThrow()
    await expect(
      withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "constraint" }, (tx) =>
        tx.update(schema.stores).set({ imageFocalX: 101 }).where(eq(schema.stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })
})
