import cookie from "@fastify/cookie"
import sensible from "@fastify/sensible"
import Fastify from "fastify"

import { dbPlugin } from "./plugins/db.js"
import { expireCancelledMemberships } from "./jobs/expire-cancelled-memberships.js"
import { loggingPlugin } from "./plugins/logging.js"
import { mailerPlugin } from "./plugins/mailer.js"
import { sessionPlugin } from "./plugins/session.js"
import { healthRoutes } from "./routes/health.js"
import { internalJobRoutes } from "./routes/internal/jobs.js"
import { meRoutes } from "./routes/me.js"
import { readyRoutes } from "./routes/ready.js"
import { hitpayWebhookRoutes } from "./routes/webhooks/hitpay.js"
import { createScheduler, type Scheduler } from "./scheduler.js"

export async function createApp(opts: { enableJobs?: boolean } = {}) {
  // Default: run background jobs in production/development, disable in tests
  // to prevent the expiry sweep from racing with job integration tests.
  const { enableJobs = process.env["NODE_ENV"] !== "test" } = opts
  const isDev = process.env["NODE_ENV"] !== "production"

  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      ...(isDev && {
        transport: { target: "pino-pretty", options: { colorize: true } },
      }),
    },
  })

  await app.register(sensible)
  await app.register(cookie)
  await app.register(loggingPlugin)
  await app.register(dbPlugin)
  await app.register(sessionPlugin)
  await app.register(mailerPlugin)

  await app.register(healthRoutes)
  await app.register(readyRoutes)
  await app.register(meRoutes)
  await app.register(hitpayWebhookRoutes)

  if (enableJobs) {
    // Deterministic membership expiry: runs once at startup then every 24 hours.
    // Closes the gap where a cancelled membership could stay 'active' indefinitely
    // after period_end without a follow-up HitPay event.
    const EXPIRY_MS = 24 * 60 * 60 * 1000
    let expiryIntervalId: ReturnType<typeof setInterval> | undefined
    let scheduler: Scheduler | undefined

    app.addHook("onReady", async () => {
      const db = app.db.db
      const runExpiry = () => {
        void expireCancelledMemberships(db)
          .then((n) => {
            if (n > 0)
              app.log.info({ expired: n }, "jobs: expired cancelled memberships past period_end")
          })
          .catch((err: unknown) => {
            app.log.error({ err }, "jobs: expire-cancelled-memberships failed")
          })
      }
      runExpiry()
      expiryIntervalId = setInterval(runExpiry, EXPIRY_MS)

      // BullMQ scheduler — registers cron jobs and starts workers.
      scheduler = await createScheduler(db, {
        info: (msg) => app.log.info(msg),
        error: (obj, msg) => app.log.error(obj, msg),
      })
    })

    app.addHook("onClose", async () => {
      if (expiryIntervalId !== undefined) clearInterval(expiryIntervalId)
      await scheduler?.close()
    })
  }

  // Internal trigger endpoint (e.g. "Issue Now" from admin). Always registered
  // so the route exists even when enableJobs=false (returns 503 gracefully).
  await app.register(internalJobRoutes)

  return app
}
