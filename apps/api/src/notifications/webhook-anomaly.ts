import type { FastifyInstance } from "fastify"

import { parseOpsEmails } from "../lib/mailer.js"

/**
 * Ops alerts for HitPay webhook events we received but could not attribute to
 * anything in our database (GAPS #11). These paths previously logged a warning
 * and returned 200 — money may have moved with no durable record on our side,
 * and nobody was told. The order path already parks anomalies for review; the
 * membership / brand-subscription / malformed-event paths predate it, so they
 * get an ops email instead.
 *
 * Deliberately separate from `notifications/order.ts` — that module is
 * order-domain-specific (its `NotificationDescriptor` union describes orders),
 * while these are subscription/transport-level anomalies.
 */

/**
 * Never throws: a failed ops email must not break the webhook's 200 response.
 * Logs the failure without the body text (bodies can carry payload details).
 */
async function send(
  app: FastifyInstance,
  opts: { to: string | string[]; subject: string; text: string },
  meta: { type: string },
): Promise<void> {
  try {
    await app.mailer.sendMail(opts)
  } catch (err) {
    app.log.error({ err, type: meta.type }, "email_notification_failed")
  }
}

export interface WebhookAnomalyAlert {
  /** Stable identifier for the anomaly kind — used for log correlation only. */
  type: string
  /** Rendered as `[BOMY Ops] ${subject}`. */
  subject: string
  /** Rendered one `key: value` line per entry as the plain-text body. */
  details: Record<string, string>
}

export async function dispatchWebhookAnomalyAlert(
  app: FastifyInstance,
  alert: WebhookAnomalyAlert,
): Promise<void> {
  const opsEmails = parseOpsEmails(process.env)

  if (opsEmails.length === 0) {
    app.log.info(
      { type: alert.type, reason: "missing_ops_recipients" },
      "email_notification_skipped",
    )
    return
  }

  const text = Object.entries(alert.details)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")

  await send(
    app,
    { to: opsEmails, subject: `[BOMY Ops] ${alert.subject}`, text },
    { type: alert.type },
  )
}
