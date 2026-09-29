// packages/db/tests/service-provider-applications.test.ts
import { randomUUID } from "node:crypto"

import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { serviceCategories, serviceProviderApplications, users } from "../src/schema/index.js"
import { withAdmin, withTenant } from "../src/tenant.js"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

// Every fixture below includes a non-empty businessDescription by default, so
// the CHECK constraint (service_category_id IS NOT NULL OR description
// non-empty) is already satisfied regardless of whether a given test ALSO
// sets a category. Without this, a fixture naming neither would fail on the
// CHECK before the RLS/duplicate behavior under test ever runs — Charlie's
// review (2026-09-29) caught exactly this: the "rejects status='approved'"
// test could have passed because the CHECK fired first, not because the RLS
// policy's status check actually fired.
const BASE_FIELDS = {
  name: "Aisha",
  contactEmail: "aisha@example.com",
  contactNumber: "+60123456789",
  companyName: "Aisha Studio",
  businessDescription: "I design brand identities for local cafes.",
}

// Reads the Postgres SQLSTATE off a caught error, so a test can assert WHICH
// mechanism rejected an insert (42501 = RLS policy violation, 23514 = CHECK
// violation, 23505 = unique violation) instead of just "it threw" — the three
// are different bugs if the wrong one fires.
function pgErrorCode(err: unknown): string | undefined {
  return err !== null && typeof err === "object" && "code" in err
    ? (err as { code?: string }).code
    : undefined
}

async function seedUser(handle: Db, role: "buyer" | "bomy_finance" | "bomy_ops" = "buyer") {
  const userId = randomUUID()
  await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test seed user" }, async (tx) => {
    await tx.insert(users).values({ id: userId, email: `${userId}@test.bomy`, role })
  })
  return userId
}

// Seeds via the OWNER-role handle, not the bomy_app-role `handle` used for the
// actual service_provider_applications assertions under test.
// service_categories deliberately grants bomy_app SELECT-only (migration
// 0031; no admin CRUD yet) — app.is_admin_bypass() only affects which rows an
// RLS policy allows, it cannot grant a missing table-level privilege, so
// seeding categories through the bomy_app connection would fail with
// "permission denied for table service_categories" regardless of RLS.
// Mirrors tests/service-categories.test.ts and
// tests/scripts/platform-config-flip-integration.test.ts.
async function seedCategory(ownerHandle: Db, userId: string, isActive: boolean) {
  const id = randomUUID()
  await withAdmin(ownerHandle.db, { userId, reason: "test seed category" }, async (tx) => {
    await tx
      .insert(serviceCategories)
      .values({ id, name: "Test Cat", slug: `test-${id}`, isActive })
  })
  return id
}

describe.skipIf(!shouldRun)("service_provider_applications RLS", () => {
  let handle: Db
  let ownerHandle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
    ownerHandle = makeDb({ url: process.env["DATABASE_URL"] as string })
  })

  afterAll(async () => {
    await handle.close()
    await ownerHandle.close()
  })

  it("an applicant can insert their own pending application naming an active category", async () => {
    const userId = await seedUser(handle)
    const categoryId = await seedCategory(ownerHandle, userId, true)

    const rows = await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
      tx
        .insert(serviceProviderApplications)
        .values({ ...BASE_FIELDS, applicantUserId: userId, serviceCategoryId: categoryId })
        .returning({ id: serviceProviderApplications.id }),
    )
    expect(rows).toHaveLength(1)
  })

  it("rejects an insert naming a DEACTIVATED category — via RLS, not the CHECK constraint", async () => {
    const userId = await seedUser(handle)
    const inactiveCategoryId = await seedCategory(ownerHandle, userId, false)

    let caught: unknown
    try {
      await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({
          ...BASE_FIELDS,
          applicantUserId: userId,
          serviceCategoryId: inactiveCategoryId,
        }),
      )
    } catch (err) {
      caught = err
    }
    // 42501 = RLS policy violation. A 23514 here would mean the fixture is
    // malformed (missing category/description), not that the feature works.
    expect(pgErrorCode(caught)).toBe("42501")
  })

  it("rejects an insert trying to set status to 'approved' directly — via RLS, not the CHECK constraint", async () => {
    const userId = await seedUser(handle)

    let caught: unknown
    try {
      await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({
          ...BASE_FIELDS,
          applicantUserId: userId,
          status: "approved",
        }),
      )
    } catch (err) {
      caught = err
    }
    expect(pgErrorCode(caught)).toBe("42501")
  })

  it("rejects a second open application from the same account (race-safe duplicate prevention)", async () => {
    const userId = await seedUser(handle)

    const firstInsert = await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
      tx
        .insert(serviceProviderApplications)
        .values({ ...BASE_FIELDS, applicantUserId: userId })
        .returning({ id: serviceProviderApplications.id }),
    )
    // Assert the FIRST submission actually succeeded before asserting the
    // second is blocked — otherwise a silently-failed first insert would make
    // the "duplicate correctly blocked" assertion below pass for the wrong
    // reason (there'd be no prior row to duplicate against at all).
    expect(firstInsert).toHaveLength(1)

    let caught: unknown
    try {
      await withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: userId }),
      )
    } catch (err) {
      caught = err
    }
    expect(pgErrorCode(caught)).toBe("23505")
  })

  it("rejects TWO CONCURRENT submissions from the same account — exactly one wins (genuine race, not sequential)", async () => {
    const userId = await seedUser(handle)

    const results = await Promise.allSettled([
      withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: userId }),
      ),
      withTenant(handle.db, { userId, userRole: "buyer" }, (tx) =>
        tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: userId }),
      ),
    ])

    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(pgErrorCode(rejected[0]!.reason)).toBe("23505")
  })

  it("the CHECK constraint rejects NULL category + empty description, even under withAdmin", async () => {
    const userId = await seedUser(handle)

    let caught: unknown
    try {
      await withAdmin(handle.db, { userId, reason: "test constraint" }, (tx) =>
        tx.insert(serviceProviderApplications).values({
          applicantUserId: userId,
          name: "Aisha",
          contactEmail: "aisha@example.com",
          contactNumber: "+60123456789",
          companyName: "Aisha Studio",
          serviceCategoryId: null,
          businessDescription: null,
        }),
      )
    } catch (err) {
      caught = err
    }
    expect(pgErrorCode(caught)).toBe("23514")
  })

  it("an applicant cannot see another applicant's row", async () => {
    const ownerId = await seedUser(handle)
    const otherId = await seedUser(handle)

    await withTenant(handle.db, { userId: ownerId, userRole: "buyer" }, (tx) =>
      tx.insert(serviceProviderApplications).values({ ...BASE_FIELDS, applicantUserId: ownerId }),
    )

    const rows = await withTenant(handle.db, { userId: otherId, userRole: "buyer" }, (tx) =>
      tx
        .select()
        .from(serviceProviderApplications)
        .where(sql`${serviceProviderApplications.applicantUserId} = ${ownerId}`),
    )
    expect(rows).toHaveLength(0)
  })

  it("bomy_finance cannot see ANY application row; bomy_ops can see all", async () => {
    const applicantId = await seedUser(handle)
    const financeId = await seedUser(handle, "bomy_finance")
    const opsId = await seedUser(handle, "bomy_ops")

    await withTenant(handle.db, { userId: applicantId, userRole: "buyer" }, (tx) =>
      tx
        .insert(serviceProviderApplications)
        .values({ ...BASE_FIELDS, applicantUserId: applicantId }),
    )

    const financeRows = await withTenant(
      handle.db,
      { userId: financeId, userRole: "bomy_finance" },
      (tx) =>
        tx
          .select()
          .from(serviceProviderApplications)
          .where(sql`${serviceProviderApplications.applicantUserId} = ${applicantId}`),
    )
    expect(financeRows).toHaveLength(0)

    const opsRows = await withTenant(handle.db, { userId: opsId, userRole: "bomy_ops" }, (tx) =>
      tx
        .select()
        .from(serviceProviderApplications)
        .where(sql`${serviceProviderApplications.applicantUserId} = ${applicantId}`),
    )
    expect(opsRows).toHaveLength(1)
  })
})
