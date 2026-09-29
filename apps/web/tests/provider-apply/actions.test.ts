/**
 * Integration tests — submitProviderApplication server action.
 *
 * Requires a live Postgres with bomy_app role and applied migrations
 * (0031, 0032). @/auth and the notification functions are mocked.
 */
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { sendApplicantAckMock, sendOpsAlertMock } = vi.hoisted(() => ({
  sendApplicantAckMock: vi.fn(),
  sendOpsAlertMock: vi.fn(),
}))

vi.mock("@/notifications/service-provider-application", () => ({
  sendApplicantAck: sendApplicantAckMock,
  sendOpsAlert: sendOpsAlertMock,
}))

import { auth } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock

function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const fd = new FormData()
  fd.set("name", overrides["name"] ?? "Aisha")
  fd.set("contactEmail", overrides["contactEmail"] ?? "typed-contact@example.com")
  fd.set("contactNumber", overrides["contactNumber"] ?? "+60123456789")
  fd.set("companyName", overrides["companyName"] ?? "Aisha Studio")
  fd.set("serviceCategoryId", overrides["serviceCategoryId"] ?? "")
  fd.set("businessDescription", overrides["businessDescription"] ?? "I design brand identities.")
  return fd
}

describe.skipIf(!shouldRun)("submitProviderApplication — server action", () => {
  let testDb: ReturnType<typeof makeDb>
  // Owner-role client for seeding only: service_categories intentionally
  // grants bomy_app SELECT-only (migration 0031), so withAdmin's
  // app.bypass_rls flag can't get an INSERT past the table's own GRANT on
  // the bomy_app (DATABASE_APP_URL) connection. Mirrors the owner/app split
  // in tests/scripts/platform-config-flip-integration.test.ts and
  // packages/db/tests/service-categories.test.ts. Used only for the one
  // category-seeding insert below — every other seed/assertion in this file
  // uses `testDb` exactly as specified.
  let ownerDb: ReturnType<typeof makeDb>
  const createdUserIds: string[] = []

  // Every test seeds its OWN applicant — they must NOT share one. The table
  // allows only one open (pending/approved) application per account, so a
  // shared applicant across tests would make every test after the first
  // insert fail as a duplicate for a reason unrelated to what it's actually
  // testing (Charlie's review, 2026-09-29).
  async function seedApplicant(): Promise<{ userId: string; accountEmail: string }> {
    const userId = randomUUID()
    const accountEmail = `${userId}-real-account-email@test.bomy`
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values({ id: userId, email: accountEmail, role: "buyer" })
    })
    createdUserIds.push(userId)
    return { userId, accountEmail }
  }

  beforeAll(() => {
    // Capture the real owner-role URL BEFORE the line below overwrites
    // process.env["DATABASE_URL"] with the app-role URL (for the server
    // action's own getDb(), which calls makeDb() with no override).
    const ownerUrl = process.env["DATABASE_URL"] as string
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    ownerDb = makeDb({ url: ownerUrl })
  })

  afterAll(async () => {
    // Owner-role handle, not testDb: migration 0032 grants bomy_app only
    // SELECT, INSERT on service_provider_applications (no UPDATE/DELETE
    // policy this round — see rls/policies.sql), so a DELETE through the
    // app-role connection fails with "permission denied", independent of
    // withAdmin's RLS bypass — the same table-level-privilege fact the
    // category-seeding fix above addresses, just on the DELETE verb here.
    await withAdmin(ownerDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      for (const id of createdUserIds) {
        await tx
          .delete(schema.serviceProviderApplications)
          .where(eq(schema.serviceProviderApplications.applicantUserId, id))
      }
    })
    await testDb.close()
    await ownerDb.close()
  })

  beforeEach(() => {
    sendApplicantAckMock.mockReset().mockResolvedValue(undefined)
    sendOpsAlertMock.mockReset().mockResolvedValue(undefined)
    mockAuth.mockReset()
  })

  it("unauthenticated → returns a form error, inserts nothing", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue(null)
    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(makeFormData())
    expect(result.ok).toBe(false)

    // Read via withAdmin (bypasses RLS), not a raw app-role select. A raw
    // select with no tenant context set always returns zero rows under
    // default-deny RLS — whether or not a row secretly got inserted — so it
    // cannot actually prove "nothing was inserted" (Charlie's review,
    // 2026-09-29). This read can see the row if it's there, so a fail here
    // would be a real signal.
    const rows = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test verify no insert" },
      (tx) =>
        tx
          .select()
          .from(schema.serviceProviderApplications)
          .where(eq(schema.serviceProviderApplications.applicantUserId, userId)),
    )
    expect(rows).toHaveLength(0)
  })

  it("valid submission → inserts a row and sends the ack to the REAL account email, not the session's stale one or the typed contact email", async () => {
    const { userId, accountEmail } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(makeFormData())
    expect(result).toEqual({ ok: true })

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendApplicantAckMock.mock.calls[0]![1]).toMatchObject({ email: accountEmail })
  })

  it("a second submission from the same account is rejected with a friendly 'already applied' error, not a 500", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const first = await submitProviderApplication(makeFormData())
    // The first submission must actually succeed — otherwise the "duplicate
    // correctly blocked" assertion below would pass for the wrong reason
    // (there'd be nothing to duplicate against).
    expect(first).toEqual({ ok: true })

    const second = await submitProviderApplication(makeFormData())
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errors.form).toBeTruthy()
  })

  it("two CONCURRENT submissions from the same account — exactly one succeeds (genuine race, not sequential awaits)", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const [a, b] = await Promise.all([
      submitProviderApplication(makeFormData()),
      submitProviderApplication(makeFormData()),
    ])

    const oks = [a, b].filter((r) => r.ok)
    const fails = [a, b].filter((r) => !r.ok)
    expect(oks).toHaveLength(1)
    expect(fails).toHaveLength(1)
  })

  it("naming a deactivated category is rejected with a field-level error, not a 500", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const categoryId = randomUUID()
    await withAdmin(ownerDb.db, { userId, reason: "test seed inactive category" }, async (tx) => {
      await tx
        .insert(schema.serviceCategories)
        .values({ id: categoryId, name: "Retired", slug: `retired-${categoryId}`, isActive: false })
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(
      makeFormData({ serviceCategoryId: categoryId, businessDescription: "" }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.serviceCategoryId).toBeTruthy()
  })

  it("'Other' with no description returns a validator error, no DB call at all", async () => {
    const { userId } = await seedApplicant()
    mockAuth.mockResolvedValue({
      user: { id: userId, role: "buyer", email: "STALE-session-email@test.bomy" },
    })

    const { submitProviderApplication } = await import("../../src/app/provider/apply/actions.js")
    const result = await submitProviderApplication(
      makeFormData({ serviceCategoryId: "", businessDescription: "" }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.businessDescription).toBeTruthy()
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
  })
})
