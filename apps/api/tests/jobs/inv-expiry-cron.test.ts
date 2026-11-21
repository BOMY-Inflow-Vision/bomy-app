import { describe, expect, it } from "vitest"

import { INV_EXPIRY_DEFAULT_CRON, resolveInvExpiryCron } from "../../src/scheduler.js"

describe("resolveInvExpiryCron", () => {
  it("defaults to every 10 minutes", () => {
    expect(INV_EXPIRY_DEFAULT_CRON).toBe("*/10 * * * *")
    expect(resolveInvExpiryCron({})).toBe("*/10 * * * *")
  })

  it("uses INVENTORY_EXPIRY_CRON when set, trimmed", () => {
    expect(resolveInvExpiryCron({ INVENTORY_EXPIRY_CRON: " 0 */6 * * * " })).toBe("0 */6 * * *")
  })

  it("treats an empty or blank value as unset", () => {
    expect(resolveInvExpiryCron({ INVENTORY_EXPIRY_CRON: "" })).toBe("*/10 * * * *")
    expect(resolveInvExpiryCron({ INVENTORY_EXPIRY_CRON: "   " })).toBe("*/10 * * * *")
  })
})
