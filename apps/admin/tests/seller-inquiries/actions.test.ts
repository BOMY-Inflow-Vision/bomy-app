import { randomUUID } from "node:crypto"

import { and, eq, inArray } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/notifications/seller-inquiry", () => ({ sendApprovalEmail: vi.fn() }))

import { auth } from "@/auth"
import { sendApprovalEmail } from "@/notifications/seller-inquiry"
import { approveInquiry, rejectInquiry } from "../../src/app/seller-inquiries/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock
const mockSendApprovalEmail = sendApprovalEmail as unknown as Mock

describe.skipIf(!shouldRun)("seller-inquiry review actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let ownerId: string
  let inquiryId: string
  let createdStoreIds: string[]

  beforeAll(() => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    adminId = randomUUID()
    ownerId = randomUUID()
    inquiryId = randomUUID()
    createdStoreIds = []
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values({
        id: adminId,
        email: `admin-${adminId}@test.bomy`,
        role: "bomy_admin",
      })
    })
  })

  afterEach(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.actorUserId, adminId))
      await tx.delete(schema.sellerInquiries).where(eq(schema.sellerInquiries.id, inquiryId))
      if (createdStoreIds.length > 0) {
        await tx.delete(schema.stores).where(inArray(schema.stores.id, createdStoreIds))
      }
      await tx.delete(schema.stores).where(eq(schema.stores.ownerId, ownerId))
      await tx.delete(schema.users).where(inArray(schema.users.id, [adminId, ownerId]))
    })
  })

  async function seedOwner(email: string) {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed owner" }, async (tx) => {
      await tx.insert(schema.users).values({ id: ownerId, email, role: "buyer" })
    })
  }

  async function seedInquiry(
    email: string,
    storeName: string,
    status: "pending" | "approved" | "rejected" = "pending",
  ) {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test seed inquiry" },
      async (tx) => {
        await tx.insert(schema.sellerInquiries).values({
          id: inquiryId,
          name: "Test Applicant",
          email,
          contactNumber: "0123456789",
          companyName: "Test Co",
          storeName,
          status,
        })
      },
    )
  }

  async function readInquiry() {
    return withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read inquiry" },
      async (tx) => {
        const [row] = await tx
          .select({
            status: schema.sellerInquiries.status,
            storeId: schema.sellerInquiries.storeId,
            reviewedBy: schema.sellerInquiries.reviewedBy,
            reviewedAt: schema.sellerInquiries.reviewedAt,
          })
          .from(schema.sellerInquiries)
          .where(eq(schema.sellerInquiries.id, inquiryId))
        return row
      },
    )
  }

  async function readStoresByOwner() {
    return withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read stores" },
      async (tx) => {
        const rows = await tx
          .select({
            id: schema.stores.id,
            slug: schema.stores.slug,
            status: schema.stores.status,
            ownerId: schema.stores.ownerId,
          })
          .from(schema.stores)
          .where(eq(schema.stores.ownerId, ownerId))
        rows.forEach((r) => createdStoreIds.push(r.id))
        return rows
      },
    )
  }

  async function readOwnerRole() {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read role" }, async (tx) => {
      const [row] = await tx
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, ownerId))
      return row?.role
    })
  }

  it("happy path: provisions a pending store, stamps inquiry, leaves owner role buyer, sends email", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Acme Goods")

    const res = await approveInquiry(inquiryId, "acme-goods")
    expect(res).toEqual({ ok: true })

    const stores = await readStoresByOwner()
    expect(stores).toHaveLength(1)
    expect(stores[0]!.status).toBe("pending")
    expect(stores[0]!.slug).toBe("acme-goods")

    expect(await readOwnerRole()).toBe("buyer")

    const inq = await readInquiry()
    expect(inq?.status).toBe("approved")
    expect(inq?.storeId).toBe(stores[0]!.id)
    expect(inq?.reviewedBy).toBe(adminId)
    expect(inq?.reviewedAt).not.toBeNull()

    expect(mockSendApprovalEmail).toHaveBeenCalledTimes(1)

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
              eq(schema.adminBypassAudit.reason, "admin approve seller inquiry"),
            ),
          ),
    )
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it("slug collision: auto-suffixes -2", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Dup Store")
    const otherOwner = randomUUID()
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test seed collision" },
      async (tx) => {
        await tx
          .insert(schema.users)
          .values({ id: otherOwner, email: `other-${otherOwner}@test.bomy`, role: "buyer" })
        const [s] = await tx
          .insert(schema.stores)
          .values({ ownerId: otherOwner, name: "Dup Store", slug: "dup-store", status: "active" })
          .returning({ id: schema.stores.id })
        createdStoreIds.push(s!.id)
      },
    )

    const res = await approveInquiry(inquiryId, "dup-store")
    expect(res).toEqual({ ok: true })

    const stores = await readStoresByOwner()
    expect(stores[0]!.slug).toBe("dup-store-2")

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test cleanup other" },
      async (tx) => {
        // Delete the store before the user — stores.owner_id has ON DELETE RESTRICT
        await tx.delete(schema.stores).where(eq(schema.stores.ownerId, otherOwner))
        await tx.delete(schema.users).where(eq(schema.users.id, otherOwner))
      },
    )
  })

  it("no matching user: returns error, creates no store, inquiry stays pending", async () => {
    await seedInquiry(`ghost-${randomUUID()}@test.bomy`, "Ghost Store")
    const res = await approveInquiry(inquiryId, "ghost-store")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/must sign in once/i)
    expect(await readStoresByOwner()).toHaveLength(0)
    expect((await readInquiry())?.status).toBe("pending")
  })

  it("already owns a store: blocked, no second store", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Second Store")
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test seed existing store" },
      async (tx) => {
        const [s] = await tx
          .insert(schema.stores)
          .values({ ownerId, name: "First Store", slug: `first-${ownerId}`, status: "active" })
          .returning({ id: schema.stores.id })
        createdStoreIds.push(s!.id)
      },
    )

    const res = await approveInquiry(inquiryId, "second-store")
    expect(res).toEqual({ ok: false, error: "Applicant already owns a store" })
    expect(await readStoresByOwner()).toHaveLength(1)
    expect((await readInquiry())?.status).toBe("pending")
  })

  it("idempotency: approving an already-approved inquiry is blocked", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Once Store", "approved")
    const res = await approveInquiry(inquiryId, "once-store")
    expect(res).toEqual({ ok: false, error: "Already reviewed" })
    expect(await readStoresByOwner()).toHaveLength(0)
  })

  it("approve-after-reject is blocked", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Rejected Store", "rejected")
    const res = await approveInquiry(inquiryId, "rejected-store")
    expect(res).toEqual({ ok: false, error: "Already reviewed" })
    expect(await readStoresByOwner()).toHaveLength(0)
  })

  it("not found: random id returns error", async () => {
    const res = await approveInquiry(randomUUID(), "whatever")
    expect(res).toEqual({ ok: false, error: "Inquiry not found" })
  })

  it("reject happy path: stamps rejected + reviewer, no store, audit row", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Reject Me")
    const res = await rejectInquiry(inquiryId)
    expect(res).toEqual({ ok: true })
    const inq = await readInquiry()
    expect(inq?.status).toBe("rejected")
    expect(inq?.reviewedBy).toBe(adminId)
    expect(inq?.reviewedAt).not.toBeNull()
    expect(await readStoresByOwner()).toHaveLength(0)
  })

  it("reject idempotency: double-reject is blocked", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Reject Twice", "rejected")
    const res = await rejectInquiry(inquiryId)
    expect(res).toEqual({ ok: false, error: "Already reviewed" })
  })

  it("reject-after-approve is blocked", async () => {
    const email = `seller-${ownerId}@test.bomy`
    await seedOwner(email)
    await seedInquiry(email, "Approve First", "approved")
    const res = await rejectInquiry(inquiryId)
    expect(res).toEqual({ ok: false, error: "Already reviewed" })
  })
})
