/**
 * Integration tests — setActivePsp (Stripe design PR 3, §3.4 / §13 decision 6).
 *
 * Real Postgres with the bomy_app role. Only active_psp is written; it is snapshotted before the
 * suite and restored exactly (value, updated_by, updated_at to the microsecond) afterwards.
 *
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/admin test config/actions --run
 */
import { randomUUID } from "node:crypto"

import { and, eq, inArray, sql } from "drizzle-orm"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { resetProviders, setProviderOverride, type PaymentProvider } from "@bomy/psp"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/flash-toast-server", () => ({ flashToast: vi.fn() }))

import { auth } from "@/auth"
import { flashToast } from "@/lib/flash-toast-server"
import { setActivePsp } from "../../src/app/config/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const mockAuth = auth as unknown as Mock
const mockFlash = flashToast as unknown as Mock

const configuredStripe = { id: "stripe", isConfigured: () => true } as unknown as PaymentProvider

function form(value: string | null): FormData {
  const fd = new FormData()
  if (value !== null) fd.set("activePsp", value)
  return fd
}

describe.skipIf(!shouldRun)("setActivePsp", () => {
  let testDb: ReturnType<typeof makeDb>
  const ids = {
    admin: randomUUID(),
    finance: randomUUID(),
    ops: randomUUID(),
    buyer: randomUUID(),
    demoted: randomUUID(),
  }
  type Snapshot = { value: unknown; updatedBy: string | null; updatedAt: Date }
  const snapshots = new Map<string, Snapshot>()
  // updated_at as text: a JS Date drops Postgres microseconds, so restore from the exact string.
  let activeUpdatedAtText = ""

  const sys = <T>(fn: Parameters<typeof withAdmin<T>>[2]) =>
    withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test setActivePsp" }, fn)

  async function readRow(key: string): Promise<Snapshot | undefined> {
    const [row] = await sys((tx) =>
      tx
        .select({
          value: schema.platformConfig.value,
          updatedBy: schema.platformConfig.updatedBy,
          updatedAt: schema.platformConfig.updatedAt,
        })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, key)),
    )
    return row
  }

  async function setValue(value: unknown) {
    await sys((tx) =>
      tx
        .update(schema.platformConfig)
        .set({ value })
        .where(eq(schema.platformConfig.key, "active_psp")),
    )
  }

  async function auditRowsBy(actors: string[]) {
    return sys((tx) =>
      tx
        .select({
          key: schema.platformConfigAudit.key,
          oldValue: schema.platformConfigAudit.oldValue,
          newValue: schema.platformConfigAudit.newValue,
          changedBy: schema.platformConfigAudit.changedBy,
          configId: schema.platformConfigAudit.configId,
        })
        .from(schema.platformConfigAudit)
        .where(inArray(schema.platformConfigAudit.changedBy, actors))
        .orderBy(schema.platformConfigAudit.changedAt),
    )
  }

  function as(id: string, role: string) {
    mockAuth.mockResolvedValue({ user: { id, role } })
  }

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    await sys((tx) =>
      tx.insert(schema.users).values([
        { id: ids.admin, email: `${ids.admin}@test.bomy`, role: "bomy_admin" },
        { id: ids.finance, email: `${ids.finance}@test.bomy`, role: "bomy_finance" },
        { id: ids.ops, email: `${ids.ops}@test.bomy`, role: "bomy_ops" },
        { id: ids.buyer, email: `${ids.buyer}@test.bomy`, role: "buyer" },
        // Demoted in the DB, but the session (JWT) still says bomy_admin.
        { id: ids.demoted, email: `${ids.demoted}@test.bomy`, role: "bomy_ops" },
      ]),
    )
    for (const key of ["active_psp", "checkout_enabled", "subscriptions_enabled"]) {
      const row = await readRow(key)
      if (!row) throw new Error(`${key} must be seeded (migration 0039 / 0018) for this suite`)
      snapshots.set(key, row)
    }
    const [ts] = await sys((tx) =>
      tx
        .select({ t: sql<string>`${schema.platformConfig.updatedAt}::text` })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "active_psp")),
    )
    activeUpdatedAtText = ts!.t
  })

  beforeEach(async () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    await setValue("hitpay")
  })

  afterEach(() => {
    resetProviders()
    mockAuth.mockReset()
    mockFlash.mockReset()
  })

  afterAll(async () => {
    const snap = snapshots.get("active_psp")
    if (snap) {
      await sys((tx) =>
        tx
          .update(schema.platformConfig)
          .set({
            value: snap.value,
            updatedBy: snap.updatedBy,
            updatedAt: sql`${activeUpdatedAtText}::timestamptz`,
          })
          .where(eq(schema.platformConfig.key, "active_psp")),
      )
    }
    await testDb.close()
  })

  // ── Role gate ────────────────────────────────────────────────────────────

  it.each([
    ["bomy_ops", "ops"],
    ["buyer", "buyer"],
  ] as const)("%s is refused before any write", async (role, who) => {
    setProviderOverride("stripe", configuredStripe)
    as(ids[who], role)
    await setActivePsp(form("stripe"))
    expect(mockFlash).toHaveBeenCalledWith("error", "You don't have permission to do that.")
    expect((await readRow("active_psp"))?.value).toBe("hitpay")
    expect(await auditRowsBy([ids[who]])).toHaveLength(0)
  })

  it("unauthenticated is refused", async () => {
    mockAuth.mockResolvedValue(null)
    await setActivePsp(form("hitpay"))
    expect(mockFlash).toHaveBeenCalledWith("error", "Your session has ended. Please sign in again.")
  })

  it("a stale JWT role is re-checked against the DB inside the transaction", async () => {
    setProviderOverride("stripe", configuredStripe)
    as(ids.demoted, "bomy_admin") // session says admin; users.role says bomy_ops
    await setActivePsp(form("stripe"))
    expect(mockFlash).toHaveBeenCalledWith("error", "You don't have permission to do that.")
    expect((await readRow("active_psp"))?.value).toBe("hitpay")
    expect(await auditRowsBy([ids.demoted])).toHaveLength(0)
  })

  // ── Validation / fail closed ────────────────────────────────────────────

  it.each([["paypal"], ["HitPay"], [""], [null]])("rejects value %j", async (value) => {
    as(ids.admin, "bomy_admin")
    await setActivePsp(form(value))
    expect(mockFlash).toHaveBeenCalledWith("error", "Choose HitPay or Stripe.")
    expect((await readRow("active_psp"))?.value).toBe("hitpay")
  })

  it("refuses Stripe while it is the not-configured PR 3 placeholder", async () => {
    as(ids.admin, "bomy_admin")
    await setActivePsp(form("stripe"))
    expect(mockFlash).toHaveBeenCalledWith(
      "error",
      "Stripe isn't available on this server yet, so it can't be selected.",
    )
    expect((await readRow("active_psp"))?.value).toBe("hitpay")
    expect(await auditRowsBy([ids.admin])).toHaveLength(0)
  })

  it("refuses HitPay when HitPay is not configured on admin", async () => {
    await setValue("stripe")
    delete process.env["HITPAY_API_KEY"]
    as(ids.admin, "bomy_admin")
    await setActivePsp(form("hitpay"))
    expect(mockFlash).toHaveBeenCalledWith(
      "error",
      "HitPay isn't available on this server yet, so it can't be selected.",
    )
    expect((await readRow("active_psp"))?.value).toBe("stripe")
  })

  it("same value is a no-op: no config audit row", async () => {
    as(ids.admin, "bomy_admin")
    await setActivePsp(form("hitpay"))
    expect(mockFlash).toHaveBeenCalledWith("info", "HitPay is already the payment provider.")
    expect(await auditRowsBy([ids.admin])).toHaveLength(0)
  })

  // ── Happy path + audit ───────────────────────────────────────────────────

  it("admin and finance switch it; each change writes one old→new audit row; nothing else moves", async () => {
    setProviderOverride("stripe", configuredStripe)
    const checkoutBefore = await readRow("checkout_enabled")
    const subsBefore = await readRow("subscriptions_enabled")

    as(ids.admin, "bomy_admin")
    await setActivePsp(form("stripe"))
    expect(mockFlash).toHaveBeenLastCalledWith(
      "success",
      "New payments now use Stripe (was HitPay). Existing payments stay on their own provider.",
    )
    const afterAdmin = await readRow("active_psp")
    expect(afterAdmin?.value).toBe("stripe")
    expect(afterAdmin?.updatedBy).toBe(ids.admin)

    as(ids.finance, "bomy_finance")
    await setActivePsp(form("hitpay"))
    expect((await readRow("active_psp"))?.value).toBe("hitpay")

    const audit = await auditRowsBy([ids.admin, ids.finance])
    expect(audit).toHaveLength(2)
    const [configRow] = await sys((tx) =>
      tx
        .select({ id: schema.platformConfig.id })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "active_psp")),
    )
    expect(audit[0]).toEqual({
      key: "active_psp",
      oldValue: "hitpay",
      newValue: "stripe",
      changedBy: ids.admin,
      configId: configRow!.id,
    })
    expect(audit[1]).toMatchObject({
      oldValue: "stripe",
      newValue: "hitpay",
      changedBy: ids.finance,
    })

    // checkout_enabled / subscriptions_enabled are never written by the switch.
    expect(await readRow("checkout_enabled")).toEqual(checkoutBefore)
    expect(await readRow("subscriptions_enabled")).toEqual(subsBefore)
    const otherAudit = await sys((tx) =>
      tx
        .select({ key: schema.platformConfigAudit.key })
        .from(schema.platformConfigAudit)
        .where(
          and(
            inArray(schema.platformConfigAudit.changedBy, [ids.admin, ids.finance]),
            inArray(schema.platformConfigAudit.key, ["checkout_enabled", "subscriptions_enabled"]),
          ),
        ),
    )
    expect(otherAudit).toHaveLength(0)
  })

  it("records an unknown old value as-is when repairing a corrupt active_psp", async () => {
    await setValue("paypal")
    as(ids.finance, "bomy_finance")
    await setActivePsp(form("hitpay"))
    expect(mockFlash).toHaveBeenLastCalledWith(
      "success",
      "New payments now use HitPay (was an unknown value). Existing payments stay on their own provider.",
    )
    const audit = await auditRowsBy([ids.finance])
    expect(audit.at(-1)).toMatchObject({ oldValue: "paypal", newValue: "hitpay" })
  })
})
