import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { createStore } from "../../src/app/stores/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock
const VALID_BODY_HTML =
  "<p>We started making handcrafted candles in a small Penang kitchen in 2019, and today we still hand-pour every single batch ourselves.</p>"
const VALID_VIDEO_URL = "https://youtu.be/dQw4w9WgXcQ"

describe.skipIf(!shouldRun)("createStore one-store guard", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let ownerId: string
  let ownerEmail: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    adminId = randomUUID()
    ownerId = randomUUID()
    ownerEmail = `owner-${ownerId}@test.bomy`
    // createStore requires a valid https S3_PUBLIC_URL before it will proceed
    // (misconfigured guard, mirroring approveInquiry) — set it here per the established
    // convention in apps/admin/tests/seller-inquiries/actions.test.ts.
    process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: ownerId, email: ownerEmail, role: "buyer" },
      ])
    })
  })

  afterEach(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.ownerId, ownerId))
    })
  })

  function fd(slug: string): FormData {
    const f = new FormData()
    f.set("ownerEmail", ownerEmail)
    f.set("name", "Test Store")
    f.set("slug", slug)
    f.set("bodyHtml", VALID_BODY_HTML)
    f.set("videoUrl", VALID_VIDEO_URL)
    return f
  }

  async function readStores() {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read" }, async (tx) => {
      return tx
        .select({
          id: schema.stores.id,
          bodyHtml: schema.stores.bodyHtml,
          videoId: schema.stores.videoId,
        })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, ownerId))
    })
  }

  it("happy path: creates a store for an owner with none, with Brand Story + Video set", async () => {
    await createStore(fd(`fresh-${ownerId}`))
    const stores = await readStores()
    expect(stores).toHaveLength(1)
    expect(stores[0]!.bodyHtml).toContain("handcrafted candles")
    expect(stores[0]!.videoId).toBe("dQw4w9WgXcQ")
  })

  it("blocks a second store for an owner who already has one", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed store" }, async (tx) => {
      await tx
        .insert(schema.stores)
        .values({ ownerId, name: "First", slug: `first-${ownerId}`, status: "active" })
    })
    await expect(createStore(fd(`second-${ownerId}`))).rejects.toThrow("Owner already has a store")
    expect(await readStores()).toHaveLength(1)
  })

  it("empty Brand Story: throws, creates no store", async () => {
    const f = fd(`empty-story-${ownerId}`)
    f.set("bodyHtml", "<p></p>")
    await expect(createStore(f)).rejects.toThrow("Brand Story is required.")
    expect(await readStores()).toHaveLength(0)
  })

  it("Brand Story under the 20-char text floor: throws, creates no store", async () => {
    const f = fd(`short-story-${ownerId}`)
    f.set("bodyHtml", "<p>Hi!</p>")
    await expect(createStore(f)).rejects.toThrow(/at least 20 characters/)
    expect(await readStores()).toHaveLength(0)
  })

  it("missing Video URL: throws, creates no store", async () => {
    const f = fd(`no-video-${ownerId}`)
    f.set("videoUrl", "")
    await expect(createStore(f)).rejects.toThrow("A valid YouTube video URL is required.")
    expect(await readStores()).toHaveLength(0)
  })
})
