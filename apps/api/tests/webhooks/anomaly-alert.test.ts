/**
 * Tests for GAPS #11 — unmatched HitPay webhooks now raise an ops alert
 * instead of being silently logged and dropped.
 *
 * - `dispatchWebhookAnomalyAlert`: pure-ish unit tests with a fake app; always run.
 * - Route wiring: integration tests against real Postgres (the route's handlers
 *   open real `withAdmin` transactions). Skip when DATABASE_URL is unset,
 *   matching the existing webhook test pattern.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test anomaly-alert.test.ts --run
 */
import { createHmac, randomUUID } from "node:crypto"

import type { FastifyInstance } from "fastify"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { dispatchWebhookAnomalyAlert } from "../../src/notifications/webhook-anomaly.js"
import { createApp } from "../../src/server.js"
import { nextTestClientIp } from "../helpers/client-ip.js"

const DATABASE_URL = process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

const TEST_SALT = "test-webhook-salt"
const OPS_EMAIL = "ops@brandsofmalaysia.com"

// ─── dispatchWebhookAnomalyAlert — unit tests ────────────────────────────────

describe("dispatchWebhookAnomalyAlert", () => {
  let savedOps: string | undefined

  beforeEach(() => {
    savedOps = process.env["OPS_ALERT_EMAILS"]
  })

  afterEach(() => {
    if (savedOps !== undefined) process.env["OPS_ALERT_EMAILS"] = savedOps
    else delete process.env["OPS_ALERT_EMAILS"]
  })

  it("sends to the ops list with the [BOMY Ops] subject prefix and key: value body", async () => {
    process.env["OPS_ALERT_EMAILS"] = `${OPS_EMAIL}, finance@brandsofmalaysia.com`
    const sendMail = vi.fn().mockResolvedValue(undefined)
    const app = {
      mailer: { sendMail, close: vi.fn() },
      log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    } as unknown as FastifyInstance

    await dispatchWebhookAnomalyAlert(app, {
      type: "webhook_unrecognised_event",
      subject: "Unrecognised HitPay webhook event",
      details: { eventType: "some.unknown", paymentId: "pay_1" },
    })

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0] as { to: unknown; subject: string; text: string }
    expect(call.to).toEqual([OPS_EMAIL, "finance@brandsofmalaysia.com"])
    expect(call.subject).toBe("[BOMY Ops] Unrecognised HitPay webhook event")
    expect(call.text).toBe("eventType: some.unknown\npaymentId: pay_1")
  })

  it("logs email_notification_skipped and sends nothing when OPS_ALERT_EMAILS is unset", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const infoLog = vi.fn()
    const sendMail = vi.fn().mockResolvedValue(undefined)
    const app = {
      mailer: { sendMail, close: vi.fn() },
      log: { error: vi.fn(), info: infoLog, warn: vi.fn() },
    } as unknown as FastifyInstance

    await dispatchWebhookAnomalyAlert(app, {
      type: "webhook_member_subscription_not_found",
      subject: "No member subscription found for recurring billing id",
      details: { recurringBillingId: "rb_1" },
    })

    expect(sendMail).not.toHaveBeenCalled()
    expect(infoLog).toHaveBeenCalledOnce()
    const logObj = infoLog.mock.calls[0]![0] as Record<string, unknown>
    expect(infoLog.mock.calls[0]![1]).toBe("email_notification_skipped")
    expect(logObj["reason"]).toBe("missing_ops_recipients")
    expect(logObj["type"]).toBe("webhook_member_subscription_not_found")
  })

  it("never throws when the mailer fails — logs email_notification_failed without the body", async () => {
    process.env["OPS_ALERT_EMAILS"] = OPS_EMAIL
    const errorLog = vi.fn()
    const app = {
      mailer: { sendMail: vi.fn().mockRejectedValue(new Error("SMTP down")), close: vi.fn() },
      log: { error: errorLog, info: vi.fn(), warn: vi.fn() },
    } as unknown as FastifyInstance

    await expect(
      dispatchWebhookAnomalyAlert(app, {
        type: "webhook_brand_subscription_not_found",
        subject: "No brand subscription found for payment request",
        details: { paymentRequestId: "pr_secret_value" },
      }),
    ).resolves.toBeUndefined()

    expect(errorLog).toHaveBeenCalledOnce()
    const logObj = errorLog.mock.calls[0]![0] as Record<string, unknown>
    expect(errorLog.mock.calls[0]![1]).toBe("email_notification_failed")
    expect(logObj["type"]).toBe("webhook_brand_subscription_not_found")
    expect(JSON.stringify(logObj)).not.toContain("pr_secret_value")
  })
})

// ─── Route wiring — the three unmatched branches ─────────────────────────────

describe.skipIf(!shouldRun)("POST /webhooks/hitpay — unmatched event ops alerts", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let savedOps: string | undefined

  function makeSignature(rawBody: string): string {
    return createHmac("sha256", TEST_SALT).update(rawBody).digest("hex")
  }

  function webhookInject(
    payload: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ) {
    const body = JSON.stringify(payload)
    return app.inject({
      method: "POST",
      url: "/webhooks/hitpay",
      headers: {
        "content-type": "application/json",
        "hitpay-signature": makeSignature(body),
        "x-forwarded-for": nextTestClientIp(),
        ...extraHeaders,
      },
      body,
    })
  }

  // The dispatch is fire-and-forget (`void ... .catch(...)`), so the 200 lands
  // before the mail attempt. Let the microtask/timer queue drain before asserting.
  async function settle(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 200))
  }

  beforeAll(async () => {
    process.env["HITPAY_SALT"] = TEST_SALT
    savedOps = process.env["OPS_ALERT_EMAILS"]
    app = await createApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    if (savedOps !== undefined) process.env["OPS_ALERT_EMAILS"] = savedOps
    else delete process.env["OPS_ALERT_EMAILS"]
  })

  beforeEach(() => {
    process.env["OPS_ALERT_EMAILS"] = OPS_EMAIL
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("unrecognised event shape: still 200, fires exactly one ops alert", async () => {
    const sendMail = vi.spyOn(app.mailer, "sendMail").mockResolvedValue(undefined)
    const paymentId = `pay_${randomUUID()}`

    const res = await webhookInject(
      { payment_id: paymentId, status: "succeeded", amount: "10.00" },
      { "hitpay-event-type": "totally.unknown.event" },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })

    await settle()

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toEqual([OPS_EMAIL])
    expect(call.subject).toBe("[BOMY Ops] Unrecognised HitPay webhook event")
    expect(call.text).toContain("eventType: totally.unknown.event")
    expect(call.text).toContain(`paymentId: ${paymentId}`)
  })

  it("no member_subscription found: still 200, fires exactly one ops alert", async () => {
    const sendMail = vi.spyOn(app.mailer, "sendMail").mockResolvedValue(undefined)
    const recurringBillingId = `rb_${randomUUID()}`
    const paymentId = `pay_${randomUUID()}`

    const res = await webhookInject(
      {
        recurring_billing_id: recurringBillingId,
        payment_id: paymentId,
        status: "succeeded",
        amount: "75.00",
      },
      { "hitpay-event-type": "charge.created" },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })

    await settle()

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toEqual([OPS_EMAIL])
    expect(call.subject).toBe("[BOMY Ops] No member subscription found for recurring billing id")
    expect(call.text).toContain(`recurringBillingId: ${recurringBillingId}`)
    expect(call.text).toContain(`paymentId: ${paymentId}`)
    expect(call.text).toContain("status: succeeded")
    expect(call.text).toContain("amount: 75.00")
  })

  it("no brand_subscription found: still 200, fires exactly one ops alert", async () => {
    const sendMail = vi.spyOn(app.mailer, "sendMail").mockResolvedValue(undefined)
    const paymentRequestId = `pr_${randomUUID()}`
    const paymentId = `pay_${randomUUID()}`

    const res = await webhookInject(
      {
        payment_request_id: paymentRequestId,
        payment_id: paymentId,
        status: "completed",
        amount: "500.00",
        fees: "9.50",
      },
      { "hitpay-event-type": "payment_request.completed" },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })

    await settle()

    expect(sendMail).toHaveBeenCalledOnce()
    const call = sendMail.mock.calls[0]![0]
    expect(call.to).toEqual([OPS_EMAIL])
    expect(call.subject).toBe("[BOMY Ops] No brand subscription found for payment request")
    expect(call.text).toContain(`paymentRequestId: ${paymentRequestId}`)
    expect(call.text).toContain(`paymentId: ${paymentId}`)
    expect(call.text).toContain("status: completed")
    expect(call.text).toContain("amount: 500.00")
  })

  it("OPS_ALERT_EMAILS unset: still 200, no mail sent (skipped-and-logged)", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const sendMail = vi.spyOn(app.mailer, "sendMail").mockResolvedValue(undefined)

    const unrecognised = await webhookInject(
      { payment_id: `pay_${randomUUID()}`, status: "succeeded", amount: "10.00" },
      { "hitpay-event-type": "totally.unknown.event" },
    )
    const membership = await webhookInject(
      {
        recurring_billing_id: `rb_${randomUUID()}`,
        payment_id: `pay_${randomUUID()}`,
        status: "succeeded",
        amount: "75.00",
      },
      { "hitpay-event-type": "charge.created" },
    )
    const brand = await webhookInject(
      {
        payment_request_id: `pr_${randomUUID()}`,
        payment_id: `pay_${randomUUID()}`,
        status: "completed",
        amount: "500.00",
        fees: "9.50",
      },
      { "hitpay-event-type": "payment_request.completed" },
    )

    expect(unrecognised.statusCode).toBe(200)
    expect(membership.statusCode).toBe(200)
    expect(brand.statusCode).toBe(200)

    await settle()

    expect(sendMail).not.toHaveBeenCalled()
  })

  it("a throwing mailer does not change the response — still 200", async () => {
    vi.spyOn(app.mailer, "sendMail").mockRejectedValue(new Error("SMTP down"))

    const res = await webhookInject(
      {
        recurring_billing_id: `rb_${randomUUID()}`,
        payment_id: `pay_${randomUUID()}`,
        status: "succeeded",
        amount: "75.00",
      },
      { "hitpay-event-type": "charge.created" },
    )

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })

    await settle()
  })

  it("bad signature on an otherwise-unrecognised event: 401 and no ops alert", async () => {
    const sendMail = vi.spyOn(app.mailer, "sendMail").mockResolvedValue(undefined)

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/hitpay",
      headers: {
        "content-type": "application/json",
        "hitpay-signature": "deadbeef",
        "hitpay-event-type": "totally.unknown.event",
        "x-forwarded-for": nextTestClientIp(),
      },
      body: JSON.stringify({ payment_id: `pay_${randomUUID()}`, status: "succeeded" }),
    })

    expect(res.statusCode).toBe(401)

    await settle()

    expect(sendMail).not.toHaveBeenCalled()
  })
})
