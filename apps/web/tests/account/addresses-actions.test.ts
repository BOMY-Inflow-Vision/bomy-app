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
  updateAddress,
} from "../../src/app/account/addresses/actions"
import { ACTION_RATE_LIMITS, RATE_LIMIT_USER_MESSAGE } from "../../src/lib/rate-limits"

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

  it("deleting the default leaves the remaining address WITHOUT auto-promotion", async () => {
    await addAddress({ ...base, label: "Home" }) // default
    await addAddress({ ...base, label: "Office", line1: "2 Jalan" })
    const home = (await listAddresses()).find((r) => r.label === "Home")!
    expect(home.isDefault).toBe(true)
    expect(await deleteAddress(home.id)).toEqual({ ok: true })
    const rows = await listAddresses()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.label).toBe("Office")
    expect(rows[0]!.isDefault).toBe(false) // no auto-promote
  })

  it("updateAddress edits fields and preserves isDefault", async () => {
    await addAddress({ ...base, label: "Home" }) // default
    const home = (await listAddresses())[0]!
    expect(home.isDefault).toBe(true)
    const res = await updateAddress(home.id, {
      ...base,
      label: "Home",
      name: "Updated",
      line1: "99 Jalan Baru",
    })
    expect(res).toEqual({ ok: true })
    const after = (await listAddresses()).find((r) => r.id === home.id)!
    expect(after.line1).toBe("99 Jalan Baru")
    expect(after.recipientName).toBe("Updated")
    expect(after.isDefault).toBe(true) // preserved
  })

  it("updateAddress rejects a nonexistent/other-user id (no write)", async () => {
    await addAddress({ ...base, label: "Home" })
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
    const res = await updateAddress(bobAddr, { ...base, label: "Hijack", line1: "evil" })
    expect(res.ok).toBe(false)
    const [bobRow] = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "read bob" }, (tx) =>
      tx
        .select({ line1: schema.userAddresses.line1 })
        .from(schema.userAddresses)
        .where(eq(schema.userAddresses.id, bobAddr)),
    )
    expect(bobRow!.line1).toBe("9 Jalan") // bob's row untouched
  })

  it("rate-limits repeated writes past ACTION_RATE_LIMITS.addressWrite.max", async () => {
    // setDefault never touches MAX_ADDRESSES, so this isolates the rate
    // limit itself rather than the (coincidentally equal) address cap.
    await addAddress({ ...base, label: "Home" })
    const { id: addressId } = (
      await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "read" }, (tx) =>
        tx
          .select({ id: schema.userAddresses.id })
          .from(schema.userAddresses)
          .where(eq(schema.userAddresses.userId, alice)),
      )
    )[0]!

    for (let i = 0; i < ACTION_RATE_LIMITS.addressWrite.max - 1; i++) {
      const res = await setDefault(addressId)
      expect(res.ok).toBe(true)
    }
    const over = await setDefault(addressId)
    expect(over).toEqual({ ok: false, errors: { form: RATE_LIMIT_USER_MESSAGE } })
  })
})
