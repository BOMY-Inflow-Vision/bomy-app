import { describe, expect, it, vi } from "vitest"

import {
  INV_EXPIRY_DEFAULT_CRON,
  registerInvExpirySchedule,
  resolveInvExpiryCron,
} from "../../src/scheduler.js"

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

describe("registerInvExpirySchedule", () => {
  const makeLogger = () => ({ info: vi.fn(), error: vi.fn() })

  it("registers the configured pattern under the old scheduler id and logs it", async () => {
    const queue = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) }
    const logger = makeLogger()
    const applied = await registerInvExpirySchedule(queue as never, logger, {
      INVENTORY_EXPIRY_CRON: "0 */6 * * *",
    })
    expect(applied).toBe("0 */6 * * *")
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1)
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      "every-10min-inv-expiry",
      { pattern: "0 */6 * * *", tz: "Asia/Kuala_Lumpur" },
      { name: "expire-reservations" },
    )
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('schedule "0 */6 * * *"'))
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("falls back to the default for an invalid pattern, and logs the pattern that is running", async () => {
    const queue = {
      upsertJobScheduler: vi
        .fn()
        .mockRejectedValueOnce(new Error("Invalid cron"))
        .mockResolvedValueOnce(undefined),
    }
    const logger = makeLogger()
    const applied = await registerInvExpirySchedule(queue as never, logger, {
      INVENTORY_EXPIRY_CRON: "every six hours",
    })
    expect(applied).toBe(INV_EXPIRY_DEFAULT_CRON)
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2)
    expect(queue.upsertJobScheduler).toHaveBeenLastCalledWith(
      "every-10min-inv-expiry",
      { pattern: "*/10 * * * *", tz: "Asia/Kuala_Lumpur" },
      { name: "expire-reservations" },
    )
    expect(logger.error).toHaveBeenCalledTimes(1)
    // The info line must show what is really scheduled, not the typo.
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('schedule "*/10 * * * *"'))
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("every six hours"))
  })
})
