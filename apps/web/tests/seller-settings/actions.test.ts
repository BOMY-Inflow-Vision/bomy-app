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

import { auth } from "@/auth"
import { updateStoreSettings } from "../../src/app/seller/dashboard/settings/actions"

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
        await tx.delete(schema.users).where(eq(schema.users.id, sellerId))
        await tx.delete(schema.users).where(eq(schema.users.id, buyerId))
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
