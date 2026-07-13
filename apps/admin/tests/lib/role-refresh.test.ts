import { describe, expect, it, vi } from "vitest"

import type { UserRole } from "@bomy/db"

import { refreshRole, STALE_MS, type RoleToken } from "@/lib/role-refresh"

const NOW = 1_700_000_000_000
const lookup = (role: UserRole | null) => vi.fn(() => Promise.resolve(role))

describe("refreshRole", () => {
  it("no-ops (no DB call) when the token is fresh", async () => {
    const look = lookup("bomy_admin")
    const token: RoleToken = { id: "u1", role: "bomy_admin", roleCheckedAt: NOW - 1000 }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(look).not.toHaveBeenCalled()
    expect(out.role).toBe("bomy_admin")
    expect(out.roleRefreshFailed).toBe(false)
  })

  it("refreshes role and advances roleCheckedAt when stale", async () => {
    const look = lookup("bomy_finance")
    const token: RoleToken = { id: "u1", role: "bomy_admin", roleCheckedAt: NOW - STALE_MS - 1 }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(look).toHaveBeenCalledWith("u1")
    expect(out.role).toBe("bomy_finance")
    expect(out.roleCheckedAt).toBe(NOW)
  })

  it("treats a missing roleCheckedAt (legacy token) as stale", async () => {
    const look = lookup("bomy_ops")
    const out = await refreshRole({ id: "u1", role: "bomy_admin" }, { now: NOW, lookupRole: look })
    expect(look).toHaveBeenCalledWith("u1")
    expect(out.role).toBe("bomy_ops")
    expect(out.roleCheckedAt).toBe(NOW)
  })

  it("demotes to buyer when the user row is gone (durable)", async () => {
    const look = lookup(null)
    const token: RoleToken = { id: "u1", role: "bomy_admin", roleCheckedAt: NOW - STALE_MS - 1 }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(out.role).toBe("buyer")
    expect(out.roleCheckedAt).toBe(NOW)
  })

  it("persists a returned non-BOMY role as-is", async () => {
    const look = lookup("seller_owner")
    const token: RoleToken = { id: "u1", role: "bomy_admin", roleCheckedAt: NOW - STALE_MS - 1 }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(out.role).toBe("seller_owner")
  })

  it("looks up by sub when the custom id claim is absent", async () => {
    const look = lookup("bomy_finance")
    const token: RoleToken = { sub: "u1", role: "bomy_admin", roleCheckedAt: NOW - STALE_MS - 1 }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(look).toHaveBeenCalledWith("u1")
    expect(out.role).toBe("bomy_finance")
    expect(out.roleCheckedAt).toBe(NOW)
  })

  it("fails closed on transient error: role + roleCheckedAt untouched, marker set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const look = vi.fn(() => Promise.reject(new Error("db down")))
    const checkedAt = NOW - STALE_MS - 1
    const token: RoleToken = { id: "u1", role: "bomy_admin", roleCheckedAt: checkedAt }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(out.role).toBe("bomy_admin")
    expect(out.roleCheckedAt).toBe(checkedAt)
    expect(out.roleRefreshFailed).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it("clears a stale roleRefreshFailed marker on a successful refresh", async () => {
    const look = lookup("bomy_admin")
    const token: RoleToken = {
      id: "u1",
      role: "bomy_admin",
      roleCheckedAt: NOW - STALE_MS - 1,
      roleRefreshFailed: true,
    }
    const out = await refreshRole(token, { now: NOW, lookupRole: look })
    expect(out.roleRefreshFailed).toBe(false)
  })

  it("returns the token untouched when it has neither id nor sub", async () => {
    const look = lookup("bomy_admin")
    const out = await refreshRole({}, { now: NOW, lookupRole: look })
    expect(look).not.toHaveBeenCalled()
    expect(out.role).toBeUndefined()
  })
})
