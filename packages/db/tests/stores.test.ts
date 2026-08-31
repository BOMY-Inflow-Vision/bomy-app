/**
 * Store schema — SEO field CHECK constraint tests (migration 0030).
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/db test
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { stores, users } from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("stores SEO field CHECK constraints", () => {
  let handle: Db
  let ownerId: string
  let storeId: string

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    storeId = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "stores check test seed" },
      async (tx) => {
        await tx
          .insert(users)
          .values({ id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" })
        await tx.insert(stores).values({
          id: storeId,
          ownerId,
          name: "Check Constraint Test Store",
          slug: `check-store-${storeId.slice(0, 8)}`,
          status: "active",
        })
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "stores check test cleanup" },
      async (tx) => {
        await tx.delete(stores).where(eq(stores.id, storeId))
      },
    )
    await handle.close()
  })

  it("CHECK constraint rejects meta_title over 70 characters", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ metaTitle: "a".repeat(71) })
          .where(eq(stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })

  it("CHECK constraint rejects meta_description over 160 characters", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ metaDescription: "a".repeat(161) })
          .where(eq(stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })

  it("CHECK constraint rejects a non-http(s) og_image_url", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ ogImageUrl: "ftp://example.com/image.png" })
          .where(eq(stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })

  it("accepts a valid https og_image_url", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ ogImageUrl: "https://cdn.example.com/og.png" })
          .where(eq(stores.id, storeId)),
      ),
    ).resolves.not.toThrow()
  })
})
