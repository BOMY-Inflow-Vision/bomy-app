import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@bomy/db", () => ({
  makeDb: vi.fn(),
}))

import { makeDb } from "@bomy/db"
import { GET } from "../../../src/app/api/ops/db-identity/route"

const TOKEN = "test-token-abc123"

describe("/api/ops/db-identity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"]
  })

  afterEach(() => {
    delete process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"]
  })

  it("(a) returns 404 with empty body when BOMY_OPS_DIAGNOSTIC_TOKEN is unset — and never invokes makeDb", async () => {
    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": "anything" },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(b) returns 404 with empty body when header is missing — and never invokes makeDb", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    const req = new Request("http://localhost/api/ops/db-identity")
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(c) returns 404 with empty body when header mismatches — and never invokes makeDb", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": "wrong-token" },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(c2) returns 404 for a same-length wrong token — exercises timingSafeEqual, not just the length check", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    const wrongSameLength = "x".repeat(TOKEN.length)
    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": wrongSameLength },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(d) returns 200 with { currentUser } when token matches", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    // postgres-js execute() returns a RowList that is iterable as rows directly
    // (not wrapped in { rows }). Mock the bare-array shape.
    const mockExecute = vi.fn().mockResolvedValue([{ user: "bomy_app" }])
    ;(makeDb as unknown as Mock).mockReturnValue({
      db: { execute: mockExecute },
      close: vi.fn(),
    })

    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": TOKEN },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ currentUser: "bomy_app" })
    expect(makeDb).toHaveBeenCalledTimes(1)
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })
})
