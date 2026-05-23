import { describe, expect, it, vi } from "vitest"
import type { FastifyInstance } from "fastify"
import {
  joinUrl,
  parseOpsEmails,
  dispatchOrderNotifications,
} from "../../src/notifications/order.js"
import type { NotificationDescriptor } from "../../src/notifications/types.js"

describe("parseOpsEmails", () => {
  it("splits comma-separated addresses and trims whitespace", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "ops@bomy.my, finance@bomy.my , " })).toEqual([
      "ops@bomy.my",
      "finance@bomy.my",
    ])
  })

  it("returns empty array when OPS_ALERT_EMAILS is unset", () => {
    expect(parseOpsEmails({})).toEqual([])
  })

  it("returns empty array when OPS_ALERT_EMAILS is empty string", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "" })).toEqual([])
  })
})

describe("joinUrl", () => {
  it("strips trailing slash from base", () => {
    expect(joinUrl("https://app.bomy.my/", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })

  it("handles base without trailing slash", () => {
    expect(joinUrl("https://app.bomy.my", "/account/orders")).toBe(
      "https://app.bomy.my/account/orders",
    )
  })
})

describe("dispatchOrderNotifications", () => {
  it("order_review: logs email_notification_skipped when OPS_ALERT_EMAILS is unset", async () => {
    const infoLog = vi.fn()
    const app = {
      mailer: { sendMail: vi.fn(), close: vi.fn() },
      log: { error: vi.fn(), info: infoLog },
      db: { db: {} },
    } as unknown as FastifyInstance

    const saved = process.env["OPS_ALERT_EMAILS"]
    delete process.env["OPS_ALERT_EMAILS"]

    const descriptor: NotificationDescriptor = {
      type: "order_review",
      sessionId: "sess-1",
      reason: "amount_mismatch",
    }
    await dispatchOrderNotifications([descriptor], app)

    expect(infoLog).toHaveBeenCalledOnce()
    const logObj = infoLog.mock.calls[0]![0] as Record<string, unknown>
    const logMsg = infoLog.mock.calls[0]![1] as string
    expect(logMsg).toBe("email_notification_skipped")
    expect(logObj["reason"]).toBe("missing_ops_recipients")

    if (saved !== undefined) process.env["OPS_ALERT_EMAILS"] = saved
  })

  it("voucher_claim_failed: logs email_notification_skipped when OPS_ALERT_EMAILS is unset", async () => {
    const infoLog = vi.fn()
    const app = {
      mailer: { sendMail: vi.fn(), close: vi.fn() },
      log: { error: vi.fn(), info: infoLog },
      db: { db: {} },
    } as unknown as FastifyInstance

    const saved = process.env["OPS_ALERT_EMAILS"]
    delete process.env["OPS_ALERT_EMAILS"]

    const descriptor: NotificationDescriptor = {
      type: "voucher_claim_failed",
      sessionId: "sess-2",
      voucherId: "v-1",
    }
    await dispatchOrderNotifications([descriptor], app)

    expect(infoLog).toHaveBeenCalledOnce()
    expect(infoLog.mock.calls[0]![1]).toBe("email_notification_skipped")

    if (saved !== undefined) process.env["OPS_ALERT_EMAILS"] = saved
  })

  it("per-send failure isolation: one sendMail throw logs email_notification_failed and continues", async () => {
    const errorLog = vi.fn()
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValue(undefined)

    const savedOps = process.env["OPS_ALERT_EMAILS"]
    const savedAdmin = process.env["ADMIN_URL"]
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"

    const app = {
      mailer: { sendMail, close: vi.fn() },
      log: { error: errorLog, info: vi.fn() },
      db: { db: {} },
    } as unknown as FastifyInstance

    const descriptors: NotificationDescriptor[] = [
      { type: "order_review", sessionId: "sess-a", reason: "amount_mismatch" },
      { type: "order_review", sessionId: "sess-b", reason: "invalid_commission_config" },
    ]
    await dispatchOrderNotifications(descriptors, app)

    // Both sends were attempted
    expect(sendMail).toHaveBeenCalledTimes(2)

    // First failure was logged
    expect(errorLog).toHaveBeenCalledOnce()
    const logObj = errorLog.mock.calls[0]![0] as Record<string, unknown>
    const logMsg = errorLog.mock.calls[0]![1] as string
    expect(logMsg).toBe("email_notification_failed")
    expect(logObj["type"]).toBe("order_review")
    expect(logObj["sessionId"]).toBe("sess-a")
    // Body text MUST NOT appear in the log
    expect(JSON.stringify(logObj)).not.toContain("admin.bomy.my")

    if (savedOps !== undefined) process.env["OPS_ALERT_EMAILS"] = savedOps
    else delete process.env["OPS_ALERT_EMAILS"]
    if (savedAdmin !== undefined) process.env["ADMIN_URL"] = savedAdmin
    else delete process.env["ADMIN_URL"]
  })

  it("order_review: sends ops alert with correct subject when OPS_ALERT_EMAILS is set", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined)

    const savedOps = process.env["OPS_ALERT_EMAILS"]
    const savedAdmin = process.env["ADMIN_URL"]
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"

    const app = {
      mailer: { sendMail, close: vi.fn() },
      log: { error: vi.fn(), info: vi.fn() },
      db: { db: {} },
    } as unknown as FastifyInstance

    const descriptor: NotificationDescriptor = {
      type: "order_review",
      sessionId: "sess-x",
      reason: "amount_mismatch",
    }
    await dispatchOrderNotifications([descriptor], app)

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0] as { to: unknown; subject: string; text: string }
    expect(call.to).toEqual(["ops@bomy.my"])
    expect(call.subject).toContain("amount_mismatch")
    expect(call.subject).toContain("[BOMY Ops]")

    if (savedOps !== undefined) process.env["OPS_ALERT_EMAILS"] = savedOps
    else delete process.env["OPS_ALERT_EMAILS"]
    if (savedAdmin !== undefined) process.env["ADMIN_URL"] = savedAdmin
    else delete process.env["ADMIN_URL"]
  })
})
