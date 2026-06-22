import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import {
  addAddress,
  deleteAddress,
  listAddresses,
  setDefault,
} from "../../src/app/account/addresses/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DB = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DB) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

const base = {
  name: "Aisyah",
  phone: "+60123456789",
  line1: "1 Jalan",
  line2: "",
  city: "George Town",
  postcode: "10000",
  state: "Pulau Pinang" as const,
  country: "MY" as const,
}

describe.skipIf(!shouldRun)("address book actions", () => {
  let db: ReturnType<typeof makeDb>
  let alice: string
  let bob: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DB as string
    db = makeDb({ url: DB as string })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    alice = randomUUID()
    bob = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: alice, email: `alice-${alice}@test.bomy`, role: "buyer" },
        { id: bob, email: `bob-${bob}@test.bomy`, role: "buyer" },
      ])
    })
    mockAuth.mockResolvedValue({ user: { id: alice, role: "buyer" } })
  })

  afterEach(async () => {
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, alice))
      await tx.delete(schema.users).where(eq(schema.users.id, bob))
    })
  })

  it("first address auto-becomes default; second does not", async () => {
    expect(await addAddress({ ...base, label: "Home" })).toEqual({ ok: true })
    expect(await addAddress({ ...base, label: "Office", line1: "2 Jalan" })).toEqual({ ok: true })
    const rows = await listAddresses()
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1)
    expect(rows.find((r) => r.isDefault)?.label).toBe("Home")
  })

  it("enforces the 20-address cap", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await addAddress({ ...base, label: `A${i}`, line1: `${i} Jalan` })).toEqual({
        ok: true,
      })
    }
    const over = await addAddress({ ...base, label: "Too many", line1: "21 Jalan" })
    expect(over.ok).toBe(false)
  })

  it("setDefault on a nonexistent/other-user id does NOT clear the caller's default", async () => {
    await addAddress({ ...base, label: "Home" }) // becomes default
    const bobAddr = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed bob" }, async (tx) => {
      await tx.insert(schema.userAddresses).values({
        id: bobAddr,
        userId: bob,
        recipientName: "Bob",
        phone: "+60123456789",
        line1: "9 Jalan",
        city: "George Town",
        postcode: "10000",
        state: "Pulau Pinang",
      })
    })
    const res = await setDefault(bobAddr) // alice tries to default bob's row
    expect(res.ok).toBe(false)
    const rows = await listAddresses()
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1) // alice's default intact
    expect(rows.find((r) => r.isDefault)?.label).toBe("Home")
  })

  it("setDefault moves the default and keeps exactly one", async () => {
    await addAddress({ ...base, label: "Home" })
    await addAddress({ ...base, label: "Office", line1: "2 Jalan" })
    const office = (await listAddresses()).find((r) => r.label === "Office")!
    expect(await setDefault(office.id)).toEqual({ ok: true })
    const after = await listAddresses()
    expect(after.filter((r) => r.isDefault)).toHaveLength(1)
    expect(after.find((r) => r.isDefault)?.label).toBe("Office")
  })

  it("deleting the default leaves no default", async () => {
    await addAddress({ ...base, label: "Home" })
    const [row] = await listAddresses()
    expect(await deleteAddress(row!.id)).toEqual({ ok: true })
    expect(await listAddresses()).toHaveLength(0)
  })
})
