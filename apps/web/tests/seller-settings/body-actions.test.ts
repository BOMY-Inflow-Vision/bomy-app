import { randomUUID } from "node:crypto"

import { schema, withAdmin } from "@bomy/db"
import type { makeDb } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

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

describe.skipIf(!shouldRun)("saveStoreBody / getStoreBodyImageUploadUrl — ownership", () => {
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
