import { randomUUID } from "node:crypto"

import { schema, withAdmin } from "@bomy/db"
import type { makeDb } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"

// saveStoreBody calls redirect() (via requireSeller) and revalidatePath() on success —
// mocked here matching the exact convention already established in the sibling
// tests/seller-settings/actions.test.ts and tests/seller-products/actions.test.ts files.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
// getStoreBodyImageUploadUrl calls createBodyPresignedPutUrl, a real AWS-SDK signing call that
// needs S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET — mocked here matching the exact
// convention already established in tests/seller-products/actions.test.ts. buildPublicUrl is
// left as the real implementation (pure string concat off S3_PUBLIC_URL, no network/creds needed).
vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    createBodyPresignedPutUrl: vi.fn().mockResolvedValue({
      url: "https://signed.r2.example.com/upload",
      expiresAt: new Date(Date.now() + 300_000),
    }),
  }
})

import { createBodyPresignedPutUrl } from "@/lib/s3"

describe.skipIf(!shouldRun)("saveStoreBody — ownership", () => {
  let db: ReturnType<typeof makeDb>
  let ownerId: string
  let otherUserId: string
  let storeId: string

  beforeAll(async () => {
    const { makeDb } = await import("@bomy/db")
    process.env["DATABASE_URL"] = DATABASE_URL as string
    db = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    otherUserId = randomUUID()
    storeId = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" },
        { id: otherUserId, email: `${otherUserId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId,
        name: "Body Actions Test Store",
        slug: `body-actions-${storeId}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    // bomy_app has no DELETE grant on users (INSERT/SELECT/UPDATE only — confirmed via
    // information_schema.role_table_grants), so seeded user rows are left behind here,
    // matching every sibling cleanup in this codebase (updateStoreSettings/updateStoreVideo
    // in tests/seller-settings/actions.test.ts, saveProductBody/getBodyImageUploadUrl in
    // tests/seller-products/actions.test.ts — none of them delete schema.users either).
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await db.close()
  })

  it("rejects a caller who does not own the target store", async () => {
    const { auth } = await import("@/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: otherUserId, role: "seller_owner" },
    } as never)
    // saveStoreBody requires a valid https S3_PUBLIC_URL before it will proceed
    // (misconfigured guard, mirroring saveProductBody) — set it here per the
    // established convention in tests/seller-products/actions.test.ts.
    process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"

    const { saveStoreBody } = await import("../../src/app/seller/dashboard/settings/body-actions")
    const result = await saveStoreBody("<p>hello</p>", 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("not_found")

    // The store's body_html must be unchanged.
    const [row] = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ bodyHtml: schema.stores.bodyHtml })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.bodyHtml).toBeNull()
  })

  it("allows the store owner to save body html", async () => {
    const { auth } = await import("@/auth")
    vi.mocked(auth).mockResolvedValue({ user: { id: ownerId, role: "seller_owner" } } as never)
    process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"

    const { saveStoreBody } = await import("../../src/app/seller/dashboard/settings/body-actions")
    const result = await saveStoreBody("<p>Our brand story.</p>", 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.revision).toBe(1)
      expect(result.html).toContain("Our brand story.")
    }
  })
})

describe.skipIf(!shouldRun)("getStoreBodyImageUploadUrl", () => {
  let db: ReturnType<typeof makeDb>
  let ownerId: string
  let otherUserId: string
  let storeId: string

  beforeAll(async () => {
    const { makeDb } = await import("@bomy/db")
    process.env["DATABASE_URL"] = DATABASE_URL as string
    db = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    otherUserId = randomUUID()
    storeId = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" },
        { id: otherUserId, email: `${otherUserId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId,
        name: "Body Upload Test Store",
        slug: `body-upload-${storeId}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    // bomy_app has no DELETE grant on users (INSERT/SELECT/UPDATE only — confirmed via
    // information_schema.role_table_grants), so seeded user rows are left behind here,
    // matching every sibling cleanup in this codebase (updateStoreSettings/updateStoreVideo
    // in tests/seller-settings/actions.test.ts, saveProductBody/getBodyImageUploadUrl in
    // tests/seller-products/actions.test.ts — none of them delete schema.users either).
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await db.close()
  })

  beforeEach(() => {
    process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"
    vi.mocked(createBodyPresignedPutUrl).mockResolvedValue({
      url: "https://signed.r2.example.com/upload",
      expiresAt: new Date(Date.now() + 300_000),
    })
  })

  it("rejects a caller who does not own the target store", async () => {
    const { auth } = await import("@/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: otherUserId, role: "seller_owner" },
    } as never)

    const { getStoreBodyImageUploadUrl } =
      await import("../../src/app/seller/dashboard/settings/body-actions")
    const result = await getStoreBodyImageUploadUrl("image/jpeg", 1024)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("not_found")
  })

  it("returns a presigned upload URL shaped as body/stores/<storeId>/<uuid>.<ext> for the store owner", async () => {
    const { auth } = await import("@/auth")
    vi.mocked(auth).mockResolvedValue({ user: { id: ownerId, role: "seller_owner" } } as never)

    const { getStoreBodyImageUploadUrl } =
      await import("../../src/app/seller/dashboard/settings/body-actions")
    const result = await getStoreBodyImageUploadUrl("image/jpeg", 1024)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.key).toMatch(
        new RegExp(
          `^body/stores/${storeId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
        ),
      )
      expect(result.publicUrl).toBe(`https://cdn.example.com/${result.key}`)
      expect(result.uploadUrl).toBe("https://signed.r2.example.com/upload")
      expect(result.expiresAt).toBeInstanceOf(Date)
    }
  })
})
