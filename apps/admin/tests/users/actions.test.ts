import { randomUUID } from "node:crypto"

import { and, eq, inArray } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { updateUserProfile, updateUserRole } from "../../src/app/users/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("admin user actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let targetId: string
  let dupId: string
  const verifiedAt = new Date("2026-01-01T00:00:00.000Z")

  beforeAll(() => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  // Fresh ids + emails per test so a polluted local DB (leaked @test.bomy rows
  // from prior runs) can never collide with our fixtures.
  beforeEach(async () => {
    vi.clearAllMocks()
    adminId = randomUUID()
    targetId = randomUUID()
    dupId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        {
          id: targetId,
          email: `target-${targetId}@test.bomy`,
          name: "Old Name",
          role: "buyer",
          emailVerified: verifiedAt,
        },
        { id: dupId, email: `Dup-${dupId}@Example.com`, role: "buyer" },
      ])
    })
  })

  afterEach(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.actorUserId, adminId))
      await tx.delete(schema.users).where(inArray(schema.users.id, [adminId, targetId, dupId]))
    })
  })

  async function readUser(id: string) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read" }, async (tx) => {
      const [row] = await tx
        .select({
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
          emailVerified: schema.users.emailVerified,
        })
        .from(schema.users)
        .where(eq(schema.users.id, id))
      return row
    })
  }

  it("bomy_admin updates name + email, writes audit, leaves emailVerified unchanged", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const newEmail = `New-${targetId}@Example.com`
    const res = await updateUserProfile(targetId, { name: "  New Name ", email: newEmail })
    expect(res).toEqual({ ok: true })

    const after = await readUser(targetId)
    expect(after?.name).toBe("New Name")
    expect(after?.email).toBe(newEmail.toLowerCase())
    expect(after?.emailVerified?.getTime()).toBe(verifiedAt.getTime())

    const audit = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read audit" },
      (tx) =>
        tx
          .select({ id: schema.adminBypassAudit.id })
          .from(schema.adminBypassAudit)
          .where(
            and(
              eq(schema.adminBypassAudit.actorUserId, adminId),
              eq(schema.adminBypassAudit.reason, "admin update user profile"),
            ),
          ),
    )
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it("rejects a non-bomy_admin from updateUserProfile (FORBIDDEN, no write)", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_ops" } })
    await expect(updateUserProfile(targetId, { name: "x", email: "x@y.com" })).rejects.toThrow(
      /FORBIDDEN/,
    )
    expect((await readUser(targetId))?.name).toBe("Old Name")
  })

  it("blocks a non-bomy_admin from self-promoting via updateUserRole (FORBIDDEN, no write)", async () => {
    for (const role of ["bomy_ops", "bomy_finance"] as const) {
      mockAuth.mockResolvedValue({ user: { id: adminId, role } })
      await expect(updateUserRole(targetId, "bomy_admin")).rejects.toThrow(/FORBIDDEN/)
      expect((await readUser(targetId))?.role).toBe("buyer")
    }
  })

  it("rejects a mixed-case duplicate email and leaves the target unchanged", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const res = await updateUserProfile(targetId, {
      name: "Whatever",
      email: `dup-${dupId}@example.com`,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.email).toMatch(/already in use/i)

    const after = await readUser(targetId)
    expect(after?.name).toBe("Old Name")
    expect(after?.email).toBe(`target-${targetId}@test.bomy`)
  })
})
