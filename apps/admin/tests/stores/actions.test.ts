import { randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
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
      await tx
        .delete(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.actorUserId, adminId))
      await tx.delete(schema.stores).where(eq(schema.stores.ownerId, ownerId))
      await tx.delete(schema.users).where(inArray(schema.users.id, [adminId, ownerId]))
    })
  })

  function fd(slug: string): FormData {
    const f = new FormData()
    f.set("ownerEmail", ownerEmail)
    f.set("name", "Test Store")
    f.set("slug", slug)
    return f
  }

  async function countStores() {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test count" }, async (tx) => {
      const rows = await tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, ownerId))
      return rows.length
    })
  }

  it("happy path: creates a store for an owner with none", async () => {
    await createStore(fd(`fresh-${ownerId}`))
    expect(await countStores()).toBe(1)
  })

  it("blocks a second store for an owner who already has one", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed store" }, async (tx) => {
      await tx
        .insert(schema.stores)
        .values({ ownerId, name: "First", slug: `first-${ownerId}`, status: "active" })
    })
    await expect(createStore(fd(`second-${ownerId}`))).rejects.toThrow("Owner already has a store")
    expect(await countStores()).toBe(1)
  })
})
