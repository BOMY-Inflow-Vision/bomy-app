import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const OWNER_DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("provider-apply queries", () => {
  let testDb: ReturnType<typeof makeDb>
  let ownerDb: ReturnType<typeof makeDb>
  let userId: string
  const createdCategoryIds: string[] = []
  const createdApplicantUserIds: string[] = []

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    ownerDb = makeDb({ url: OWNER_DATABASE_URL as string })
    userId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email: `${userId}@test.bomy`, role: "buyer" })
    })
  })

  afterAll(async () => {
    await withAdmin(ownerDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      for (const id of createdApplicantUserIds) {
        await tx
          .delete(schema.serviceProviderApplications)
          .where(sql`${schema.serviceProviderApplications.applicantUserId} = ${id}`)
      }
      for (const categoryId of createdCategoryIds) {
        await tx
          .delete(schema.serviceCategories)
          .where(sql`${schema.serviceCategories.id} = ${categoryId}`)
      }
    })
    await testDb.close()
    await ownerDb.close()
  })

  it("getActiveServiceCategories returns only active categories, ordered by sortOrder", async () => {
    const activeId = randomUUID()
    const inactiveId = randomUUID()
    await withAdmin(ownerDb.db, { userId, reason: "test seed categories" }, async (tx) => {
      await tx.insert(schema.serviceCategories).values([
        { id: activeId, name: "Active", slug: `active-${activeId}`, isActive: true, sortOrder: 10 },
        {
          id: inactiveId,
          name: "Inactive",
          slug: `inactive-${inactiveId}`,
          isActive: false,
          sortOrder: 5,
        },
      ])
    })
    createdCategoryIds.push(activeId, inactiveId)

    const { getActiveServiceCategories } = await import("../../src/app/provider/apply/queries.js")
    const rows = await getActiveServiceCategories(userId, "buyer")
    expect(rows.some((r) => r.id === activeId)).toBe(true)
    expect(rows.some((r) => r.id === inactiveId)).toBe(false)
  })

  it("getMyOpenApplication returns null when there is no application, then the row once one exists", async () => {
    const freshUserId = randomUUID()
    createdApplicantUserIds.push(freshUserId)
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: freshUserId, email: `${freshUserId}@test.bomy`, role: "buyer" })
    })

    const { getMyOpenApplication } = await import("../../src/app/provider/apply/queries.js")
    expect(await getMyOpenApplication(freshUserId, "buyer")).toBeNull()

    await withAdmin(
      testDb.db,
      { userId: freshUserId, reason: "test seed application" },
      async (tx) => {
        await tx.insert(schema.serviceProviderApplications).values({
          applicantUserId: freshUserId,
          name: "Aisha",
          contactEmail: "aisha@example.com",
          contactNumber: "+60123456789",
          companyName: "Aisha Studio",
          businessDescription: "I design brand identities.",
        })
      },
    )

    expect(await getMyOpenApplication(freshUserId, "buyer")).toEqual({ status: "pending" })
  })
})
