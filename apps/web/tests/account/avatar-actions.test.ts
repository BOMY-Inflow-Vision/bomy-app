/**
 * Integration tests — account avatar upload actions
 *
 * Requires live Postgres with bomy_app role and migrations applied.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
 *   BOMY_RLS_READY=1 pnpm --filter @bomy/web test
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    createBodyPresignedPutUrl: vi.fn().mockResolvedValue({
      url: "https://signed.r2.example.com/upload",
      expiresAt: new Date(Date.now() + 300_000),
    }),
  }
})

import { auth } from "@/auth"
import { deleteObject } from "@/lib/s3"
import { getAvatarUploadUrl, updateAvatarImage } from "@/app/account/avatar-actions"

const mockAuth = auth as unknown as Mock
const mockDeleteObject = deleteObject as unknown as Mock

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("avatar upload actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let userId: string
  let otherUserId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    process.env["S3_PUBLIC_URL"] = "https://cdn.example.com"
    process.env["AUTH_SECRET"] = "test-secret"
    testDb = makeDb({ url: DATABASE_URL as string })

    userId = randomUUID()
    otherUserId = randomUUID()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: userId, email: `${userId}@test.bomy`, role: "buyer", name: "Ann" },
        { id: otherUserId, email: `${otherUserId}@test.bomy`, role: "buyer", name: "Bea" },
      ])
    })
  })

  afterAll(async () => {
    // users has no DELETE grant for bomy_app (see migration 0027) — left behind, matching
    // every other test file's convention.
    await testDb.close()
  })

  it("getAvatarUploadUrl rejects an unsupported content type", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
    const result = await getAvatarUploadUrl("application/pdf", 1000)
    expect(result).toEqual({
      ok: false,
      error: "Only JPEG, PNG, WebP, GIF, or AVIF images are allowed",
    })
  })

  it("getAvatarUploadUrl rejects an oversized file", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
    const result = await getAvatarUploadUrl("image/png", 3 * 1024 * 1024)
    expect(result).toEqual({ ok: false, error: "Image must be smaller than 2 MB" })
  })

  it("getAvatarUploadUrl returns a key + claim for an allowed upload", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
    const result = await getAvatarUploadUrl("image/png", 1000)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.key).toMatch(/^avatars\/[0-9a-f-]{36}\.png$/)
    expect(result.claim).toBeTruthy()
  })

  it("updateAvatarImage rejects a claim signed for a different user (cross-user key guess)", async () => {
    mockAuth.mockResolvedValue({ user: { id: otherUserId, role: "buyer" } })
    const presign = await getAvatarUploadUrl("image/png", 1000)
    if (!presign.ok) throw new Error("setup failed")

    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
    const result = await updateAvatarImage(presign.key, presign.claim)
    expect(result).toEqual({ ok: false, error: "Invalid upload claim" })
  })

  it("updateAvatarImage succeeds with a matching claim and persists users.image", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
    const presign = await getAvatarUploadUrl("image/png", 1000)
    if (!presign.ok) throw new Error("setup failed")

    const result = await updateAvatarImage(presign.key, presign.claim)
    expect(result).toEqual({ ok: true, image: `https://cdn.example.com/${presign.key}` })

    const [row] = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test assert" },
      (tx) =>
        tx
          .select({ image: schema.users.image })
          .from(schema.users)
          .where(eq(schema.users.id, userId)),
    )
    expect(row?.image).toBe(`https://cdn.example.com/${presign.key}`)
  })

  it("updateAvatarImage deletes the previous avatar object once replaced", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId, role: "buyer" } })
    const first = await getAvatarUploadUrl("image/png", 1000)
    if (!first.ok) throw new Error("setup failed")
    await updateAvatarImage(first.key, first.claim)

    mockDeleteObject.mockClear()
    const second = await getAvatarUploadUrl("image/jpeg", 1000)
    if (!second.ok) throw new Error("setup failed")
    await updateAvatarImage(second.key, second.claim)

    expect(mockDeleteObject).toHaveBeenCalledWith(first.key)
  })
})
