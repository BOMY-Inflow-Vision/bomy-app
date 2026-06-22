import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { updateDisplayName } from "../../src/app/account/profile-actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DB = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DB) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("updateDisplayName", () => {
  let db: ReturnType<typeof makeDb>
  let userId: string
  let email: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DB as string
    db = makeDb({ url: DB as string })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    userId = randomUUID()
    email = `${userId}@test.bomy`
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, (tx) =>
      tx.insert(schema.users).values({ id: userId, email, name: "Old", role: "buyer" }),
    )
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
  })

  afterEach(async () => {
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, (tx) =>
      tx.delete(schema.users).where(eq(schema.users.id, userId)),
    )
  })

  function read() {
    return withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "read" }, async (tx) => {
      const [u] = await tx
        .select({
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
      return u
    })
  }

  it("updates only the name; role + email unchanged", async () => {
    expect(await updateDisplayName("  New Name  ")).toEqual({ ok: true })
    const u = await read()
    expect(u?.name).toBe("New Name")
    expect(u?.role).toBe("buyer")
    expect(u?.email).toBe(email)
  })

  it("clears the name to null on empty input", async () => {
    expect(await updateDisplayName("   ")).toEqual({ ok: true })
    expect((await read())?.name).toBeNull()
  })

  it("rejects an over-long name with no write", async () => {
    const res = await updateDisplayName("x".repeat(81))
    expect(res.ok).toBe(false)
    expect((await read())?.name).toBe("Old")
  })
})
