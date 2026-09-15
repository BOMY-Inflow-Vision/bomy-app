import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAdminId: vi.fn() }))

import { requireAdminId } from "@/lib/auth"
import { authorizeAdminAction } from "@/lib/admin-action"

const mockRequireAdminId = requireAdminId as unknown as Mock

beforeEach(() => vi.clearAllMocks())

describe("authorizeAdminAction", () => {
  it("returns ok:true with the adminId on success", async () => {
    mockRequireAdminId.mockResolvedValue("admin-1")
    await expect(authorizeAdminAction()).resolves.toEqual({ ok: true, adminId: "admin-1" })
  })

  it("passes opts.roles through to requireAdminId", async () => {
    mockRequireAdminId.mockResolvedValue("admin-1")
    await authorizeAdminAction({ roles: ["bomy_admin"] })
    expect(mockRequireAdminId).toHaveBeenCalledWith({ roles: ["bomy_admin"] })
  })

  it("maps UNAUTHENTICATED to a specific, non-technical message", async () => {
    mockRequireAdminId.mockRejectedValue(new Error("UNAUTHENTICATED"))
    await expect(authorizeAdminAction()).resolves.toEqual({
      ok: false,
      error: "Your session has ended. Please sign in again.",
    })
  })

  it("maps FORBIDDEN to a specific, non-technical message", async () => {
    mockRequireAdminId.mockRejectedValue(new Error("FORBIDDEN"))
    await expect(authorizeAdminAction()).resolves.toEqual({
      ok: false,
      error: "You don't have permission to do that.",
    })
  })

  it("rethrows any other error unchanged", async () => {
    mockRequireAdminId.mockRejectedValue(new Error("BOOM"))
    await expect(authorizeAdminAction()).rejects.toThrow("BOOM")
  })

  it("rethrows a non-Error rejection unchanged", async () => {
    mockRequireAdminId.mockRejectedValue("weird")
    await expect(authorizeAdminAction()).rejects.toBe("weird")
  })
})
