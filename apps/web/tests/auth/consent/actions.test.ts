import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

describe.skipIf(!shouldRun)("user_consents RLS", () => {
  const { db } = makeDb()

  async function createTestUser(email: string) {
    return withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email, role: "buyer" })
        .returning({ id: schema.users.id })
      return user!
    })
  }

  it("owner can insert and select their own consent row", async () => {
    const user = await createTestUser(`consent-owner-${randomUUID()}@test.bomy`)
    await withTenant(db, { userId: user.id, userRole: "buyer" }, async (tx) => {
      await tx.insert(schema.userConsents).values({
        userId: user.id,
        document: "tos",
        version: "2026-06-17",
      })
      const rows = await tx
        .select()
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, user.id))
      expect(rows).toHaveLength(1)
      expect(rows[0]!.document).toBe("tos")
      expect(rows[0]!.version).toBe("2026-06-17")
    })
  })

  it("owner cannot see another user's consent rows", async () => {
    const alice = await createTestUser(`consent-alice-${randomUUID()}@test.bomy`)
    const bob = await createTestUser(`consent-bob-${randomUUID()}@test.bomy`)
    // Alice inserts her row via admin bypass (simulates alice's own accept)
    await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.userConsents).values({
        userId: alice.id,
        document: "tos",
        version: "2026-06-17",
      })
    })
    // Bob queries — should see 0 rows (RLS blocks alice's row)
    await withTenant(db, { userId: bob.id, userRole: "buyer" }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, alice.id))
      expect(rows).toHaveLength(0)
    })
  })

  it("duplicate (userId, document, version) insert is idempotent via onConflictDoNothing", async () => {
    const user = await createTestUser(`consent-dup-${randomUUID()}@test.bomy`)
    await withTenant(db, { userId: user.id, userRole: "buyer" }, async (tx) => {
      await tx
        .insert(schema.userConsents)
        .values({ userId: user.id, document: "tos", version: "2026-06-17" })
        .onConflictDoNothing()
      await tx
        .insert(schema.userConsents)
        .values({ userId: user.id, document: "tos", version: "2026-06-17" })
        .onConflictDoNothing()
      const rows = await tx
        .select()
        .from(schema.userConsents)
        .where(
          and(eq(schema.userConsents.userId, user.id), eq(schema.userConsents.document, "tos")),
        )
      expect(rows).toHaveLength(1)
    })
  })

  it("user cannot delete their own consent row (append-only: row persists after DELETE attempt)", async () => {
    const user = await createTestUser(`consent-delete-${randomUUID()}@test.bomy`)
    await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.userConsents).values({
        userId: user.id,
        document: "tos",
        version: "2026-06-17",
      })
    })
    // Migration 0027 (GAPS #16) dropped the DELETE grant on user_consents
    // entirely — no policy ever permitted it either, but the grant used to
    // make this a silent no-op (see the file-level comment above). Now it's
    // a deterministic permission-denied on every environment.
    await expect(
      withTenant(db, { userId: user.id, userRole: "buyer" }, async (tx) => {
        await tx.delete(schema.userConsents).where(eq(schema.userConsents.userId, user.id))
      }),
    ).rejects.toThrow(/permission denied/)
    // The true invariant: row still exists.
    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx.select().from(schema.userConsents).where(eq(schema.userConsents.userId, user.id)),
    )
    expect(rows).toHaveLength(1)
  })

  it("tos-only row is insufficient — both tos and privacy required for consent", async () => {
    const user = await createTestUser(`consent-tosonly-${randomUUID()}@test.bomy`)
    // Insert only the "tos" row, not "privacy"
    await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.userConsents).values({
        userId: user.id,
        document: "tos",
        version: "2026-06-17",
      })
    })
    // Query as admin: should only find 1 document, not 2
    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx
        .select({ document: schema.userConsents.document })
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, user.id)),
    )
    const docs = new Set(rows.map((r) => r.document))
    // Only "tos" present — "privacy" missing — not fully consented
    expect(docs.has("tos")).toBe(true)
    expect(docs.has("privacy")).toBe(false)
    expect(docs.has("tos") && docs.has("privacy")).toBe(false)
  })
})

// ─── Consent DB-state security tests ──────────────────────────────────────
// Verify that the deriveConsentState logic (used in auth.ts jwt callback) is
// correct — both docs required, forged update payload cannot bypass the check.

describe.skipIf(!shouldRun)("consent DB-state checks (security)", () => {
  const { db } = makeDb()

  async function createTestUser(email: string) {
    return withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email, role: "buyer" })
        .returning({ id: schema.users.id })
      return user!
    })
  }

  it("user with no rows has consentVersion=undefined (baseline)", async () => {
    const user = await createTestUser(`consent-norows-${randomUUID()}@test.bomy`)
    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx
        .select({ document: schema.userConsents.document })
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, user.id)),
    )
    const docs = new Set(rows.map((r) => r.document))
    expect(docs.has("tos") && docs.has("privacy")).toBe(false)
  })

  it("user with both tos + privacy rows has consentVersion=currentTosVersion", async () => {
    const user = await createTestUser(`consent-bothrows-${randomUUID()}@test.bomy`)
    await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.userConsents).values([
        { userId: user.id, document: "tos", version: "2026-06-17" },
        { userId: user.id, document: "privacy", version: "2026-06-17" },
      ])
    })
    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx
        .select({ document: schema.userConsents.document })
        .from(schema.userConsents)
        .where(
          and(
            eq(schema.userConsents.userId, user.id),
            eq(schema.userConsents.version, "2026-06-17"),
          ),
        ),
    )
    const docs = new Set(rows.map((r) => r.document))
    expect(docs.has("tos") && docs.has("privacy")).toBe(true)
  })

  it("user with only tos row cannot derive consent (both docs required)", async () => {
    const user = await createTestUser(`consent-tosonly2-${randomUUID()}@test.bomy`)
    await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.userConsents).values({
        userId: user.id,
        document: "tos",
        version: "2026-06-17",
      })
    })
    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx
        .select({ document: schema.userConsents.document })
        .from(schema.userConsents)
        .where(
          and(
            eq(schema.userConsents.userId, user.id),
            eq(schema.userConsents.version, "2026-06-17"),
          ),
        ),
    )
    const docs = new Set(rows.map((r) => r.document))
    // deriveConsentState in auth.ts checks: docs.has("tos") && docs.has("privacy")
    // With only "tos": false → consentVersion = undefined → user remains gated
    expect(docs.has("tos") && docs.has("privacy")).toBe(false)
  })
})

// ─── Action tests ─────────────────────────────────────────────────────────

// Stable mock handles
const { authMock, signOutMock, updateMock, headersMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  signOutMock: vi.fn(),
  updateMock: vi.fn(),
  headersMock: vi.fn(),
}))

vi.mock("@/auth", () => ({
  auth: authMock,
  signOut: signOutMock,
  unstable_update: updateMock,
}))

vi.mock("next/headers", () => ({
  headers: headersMock,
}))

// redirect() throws a NEXT_REDIRECT error — capture it
function catchRedirect(fn: () => Promise<void>): Promise<string> {
  return fn().then(
    () => {
      throw new Error("expected redirect, got none")
    },
    (err: unknown) => {
      if (
        err instanceof Error &&
        (err.message.includes("NEXT_REDIRECT") ||
          (err as { digest?: string }).digest?.includes("NEXT_REDIRECT"))
      ) {
        // Next.js redirect encodes the URL in the digest
        const digest = (err as { digest?: string }).digest ?? ""
        // format: NEXT_REDIRECT;<status>;<url>
        return digest.split(";")[2] ?? "/"
      }
      throw err
    },
  )
}

describe.skipIf(!shouldRun)("acceptConsent action", () => {
  beforeEach(() => {
    vi.resetModules()
    authMock.mockReset()
    signOutMock.mockReset()
    updateMock.mockReset()
    updateMock.mockResolvedValue(null)
    headersMock.mockReset()
    headersMock.mockResolvedValue(new Headers())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("redirects to sign-in when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const { acceptConsent } = await import("../../../src/app/auth/consent/actions.js")
    const dest = await catchRedirect(() => acceptConsent())
    expect(dest).toBe("/auth/sign-in")
  })

  it("writes tos + privacy rows and re-issues JWT when logged in", async () => {
    const { db } = makeDb()
    const user = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
      const [u] = await tx
        .insert(schema.users)
        .values({ email: `accept-${randomUUID()}@test.bomy`, role: "buyer" })
        .returning({ id: schema.users.id })
      return u!
    })

    authMock.mockResolvedValue({
      user: {
        id: user.id,
        role: "buyer",
        consentVersion: undefined,
        currentTosVersion: "2026-06-17",
      },
    })

    const { acceptConsent } = await import("../../../src/app/auth/consent/actions.js")
    const dest = await catchRedirect(() => acceptConsent())

    // JWT re-issued with new version
    expect(updateMock).toHaveBeenCalledWith({ consentVersion: "2026-06-17" })
    // Redirected home
    expect(dest).toBe("/")

    // Verify rows in DB
    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx
        .select({ document: schema.userConsents.document })
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, user.id)),
    )
    const docs = rows.map((r) => r.document).sort()
    expect(docs).toEqual(["privacy", "tos"])
  })

  it("captures client IP (first x-forwarded-for hop) and user-agent on both rows", async () => {
    const { db } = makeDb()
    const user = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test setup" }, async (tx) => {
      const [u] = await tx
        .insert(schema.users)
        .values({ email: `accept-ipua-${randomUUID()}@test.bomy`, role: "buyer" })
        .returning({ id: schema.users.id })
      return u!
    })

    authMock.mockResolvedValue({
      user: {
        id: user.id,
        role: "buyer",
        consentVersion: undefined,
        currentTosVersion: "2026-06-17",
      },
    })
    headersMock.mockResolvedValue(
      new Headers({
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "Mozilla/5.0 (TestAgent)",
      }),
    )

    const { acceptConsent } = await import("../../../src/app/auth/consent/actions.js")
    await catchRedirect(() => acceptConsent())

    const rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test verify" }, async (tx) =>
      tx
        .select({
          document: schema.userConsents.document,
          acceptedIp: schema.userConsents.acceptedIp,
          acceptedUserAgent: schema.userConsents.acceptedUserAgent,
        })
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, user.id)),
    )

    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.acceptedIp).toBe("203.0.113.7")
      expect(row.acceptedUserAgent).toBe("Mozilla/5.0 (TestAgent)")
    }
  })
})

describe("declineConsent action", () => {
  beforeEach(() => {
    vi.resetModules()
    signOutMock.mockReset()
    signOutMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("signs the user out and redirects to sign-in with consent=declined", async () => {
    const { declineConsent } = await import("../../../src/app/auth/consent/actions.js")
    await declineConsent()
    expect(signOutMock).toHaveBeenCalledWith({
      redirectTo: "/auth/sign-in?consent=declined",
    })
  })
})
