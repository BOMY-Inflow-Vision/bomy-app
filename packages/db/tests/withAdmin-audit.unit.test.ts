/**
 * Unit test: withAdmin must insert one admin_bypass_audit row inside
 * its own transaction, after bypass_rls is set, before the user
 * callback runs.
 *
 * This test uses a stub transaction object — no DB required. The
 * cross-tier "real DB" integration test lives in admin-bypass-audit.test.ts.
 */
import { describe, expect, it, vi } from "vitest"

import { withAdmin } from "../src/tenant.js"

interface CallRecord {
  kind: "execute" | "insert" | "callback"
  detail: string
}

interface StubTx {
  execute: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
}

function makeStubDb(records: CallRecord[]) {
  const tx: StubTx = {
    execute: vi.fn((q: unknown) => {
      const repr = JSON.stringify(q).slice(0, 200)
      records.push({ kind: "execute", detail: repr })
      return Promise.resolve([] as unknown)
    }),
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        records.push({ kind: "insert", detail: JSON.stringify(v) })
        return Promise.resolve([] as unknown)
      }),
    })),
  }
  const db = {
    transaction: <T>(fn: (innerTx: StubTx) => Promise<T>): Promise<T> => fn(tx),
  } as unknown as Parameters<typeof withAdmin>[0]
  return { db, tx }
}

describe("withAdmin — audit row insertion", () => {
  it("inserts exactly one audit row per call, with the actor + reason", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await withAdmin(
      db,
      { userId: "11111111-1111-1111-1111-111111111111", reason: "unit-test reason" },
      () => {
        records.push({ kind: "callback", detail: "ran" })
        return Promise.resolve()
      },
    )

    const inserts = records.filter((r) => r.kind === "insert")
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.detail).toContain("11111111-1111-1111-1111-111111111111")
    expect(inserts[0]?.detail).toContain("unit-test reason")
  })

  it("inserts the audit row before invoking the callback", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await withAdmin(
      db,
      { userId: "22222222-2222-2222-2222-222222222222", reason: "ordering check" },
      () => {
        records.push({ kind: "callback", detail: "ran" })
        return Promise.resolve()
      },
    )

    const insertIdx = records.findIndex((r) => r.kind === "insert")
    const callbackIdx = records.findIndex((r) => r.kind === "callback")
    expect(insertIdx).toBeGreaterThan(-1)
    expect(callbackIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeLessThan(callbackIdx)
  })

  it("inserts the audit row after bypass_rls is set", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await withAdmin(
      db,
      { userId: "33333333-3333-3333-3333-333333333333", reason: "bypass ordering" },
      () => Promise.resolve(),
    )

    const bypassIdx = records.findIndex(
      (r) => r.kind === "execute" && r.detail.includes("bypass_rls"),
    )
    const insertIdx = records.findIndex((r) => r.kind === "insert")
    expect(bypassIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(bypassIdx)
  })

  it("still rejects empty/whitespace reason (existing contract preserved)", async () => {
    const records: CallRecord[] = []
    const { db } = makeStubDb(records)

    await expect(
      withAdmin(db, { userId: "44444444-4444-4444-4444-444444444444", reason: "" }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow(/reason is required/i)

    await expect(
      withAdmin(db, { userId: "55555555-5555-5555-5555-555555555555", reason: "   " }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow(/reason is required/i)

    expect(records.filter((r) => r.kind === "insert")).toHaveLength(0)
  })
})
