import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import type { UserRole } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

import { auth } from "@/auth"
import { requireAdmin, requireAdminId } from "@/lib/auth"

const mockAuth = auth as unknown as Mock

function session(role: UserRole | undefined, extra: Record<string, unknown> = {}) {
  return { user: { id: "u1", role }, ...extra }
}

beforeEach(() => vi.clearAllMocks())

describe("requireAdmin (pages)", () => {
  it("returns id + role for a valid BOMY role", async () => {
    mockAuth.mockResolvedValue(session("bomy_admin"))
    await expect(requireAdmin()).resolves.toEqual({ id: "u1", role: "bomy_admin" })
  })

  it("redirects to /unauthorized when signed out", async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/unauthorized")
  })

  it("redirects a non-BOMY role", async () => {
    mockAuth.mockResolvedValue(session("buyer"))
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/unauthorized")
  })

  it("redirects when roleRefreshFailed is set (fail closed)", async () => {
    mockAuth.mockResolvedValue(session("bomy_admin", { roleRefreshFailed: true }))
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/unauthorized")
  })

  it("enforces a narrower roles list", async () => {
    mockAuth.mockResolvedValue(session("bomy_ops"))
    await expect(requireAdmin({ roles: ["bomy_admin"] })).rejects.toThrow("REDIRECT:/unauthorized")
  })
})

describe("requireAdminId (actions)", () => {
  it("returns the id for a valid BOMY role", async () => {
    mockAuth.mockResolvedValue(session("bomy_finance"))
    await expect(requireAdminId()).resolves.toBe("u1")
  })

  it("throws UNAUTHENTICATED when signed out", async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireAdminId()).rejects.toThrow("UNAUTHENTICATED")
  })

  it("throws FORBIDDEN for a non-BOMY role", async () => {
    mockAuth.mockResolvedValue(session("seller_owner"))
    await expect(requireAdminId()).rejects.toThrow("FORBIDDEN")
  })

  it("throws FORBIDDEN when roleRefreshFailed is set", async () => {
    mockAuth.mockResolvedValue(session("bomy_admin", { roleRefreshFailed: true }))
    await expect(requireAdminId()).rejects.toThrow("FORBIDDEN")
  })

  it("enforces a narrower roles list", async () => {
    mockAuth.mockResolvedValue(session("bomy_ops"))
    await expect(requireAdminId({ roles: ["bomy_admin", "bomy_finance"] })).rejects.toThrow(
      "FORBIDDEN",
    )
  })
})
