import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DB = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DB) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("user_addresses RLS", () => {
  let db: ReturnType<typeof makeDb>
  let alice: string
  let bob: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DB as string
    db = makeDb({ url: DB as string })
  })

  afterEach(async () => {
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, alice))
      await tx.delete(schema.users).where(eq(schema.users.id, bob))
    })
  })

  it("a user can only read their own addresses", async () => {
    alice = randomUUID()
    bob = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: alice, email: `alice-${alice}@test.bomy`, role: "buyer" },
        { id: bob, email: `bob-${bob}@test.bomy`, role: "buyer" },
      ])
      await tx.insert(schema.userAddresses).values({
        userId: bob,
        recipientName: "Bob",
        phone: "+60123456789",
        line1: "1 Jalan",
        city: "George Town",
        postcode: "10000",
        state: "Pulau Pinang",
      })
    })

    const rows = await withTenant(db.db, { userId: alice, userRole: "buyer" }, async (tx) =>
      tx.select().from(schema.userAddresses),
    )
    expect(rows).toHaveLength(0) // alice cannot see bob's address
  })
})
