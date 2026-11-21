import { Queue, Worker } from "bullmq"
import { Redis } from "ioredis"

import type { Database } from "@bomy/db"

import type { Mailer } from "./lib/mailer.js"

import { expireSubscriptions } from "./jobs/brand-subscription-expiry.js"
import { runBodyImageCleanup } from "./jobs/body-image-cleanup.js"
import { runInventoryReservationExpiryJob } from "./jobs/inventory-reservation-expiry.js"
import { notifyRenewalsDue } from "./jobs/membership-renewal-notification.js"
import { expireMemberSubscriptions } from "./jobs/member-subscription-expiry.js"
import { ORDER_AUTO_COMPLETE_CRON, runOrderAutoCompleteJob } from "./jobs/order-auto-complete.js"
import { issueMonthlyVouchers } from "./jobs/voucher-issuance.js"
import type { JobLogger } from "./notifications/voucher.js"

// MYT = UTC+8. Cron expressions use tz: 'Asia/Kuala_Lumpur' so times are
// stated in MYT without converting to UTC offsets manually.
const VOUCHER_ISSUANCE_CRON = "0 8 1 * *" // 08:00 MYT on 1st of month
const RENEWAL_NOTIFICATION_CRON = "0 9 * * *" // 09:00 MYT daily
const BRAND_EXPIRY_CRON = "5 0 * * *" // 00:05 MYT daily
const MEMBER_EXPIRY_CRON = "10 0 * * *" // 00:10 MYT daily
export const INV_EXPIRY_DEFAULT_CRON = "*/10 * * * *" // every 10 minutes MYT

/**
 * The reservation-expiry schedule. Every run opens a database transaction, which wakes a scale-to-zero
 * Neon compute (it then stays up for its idle timeout), so a 10-minute cadence keeps the database
 * awake around the clock. While checkout is off nothing reserves stock, so production can set
 * INVENTORY_EXPIRY_CRON to something slower. The default stays every 10 minutes: unset = unchanged
 * behaviour. Set it back (or unset it) BEFORE flipping `checkout_enabled` (see the runbook).
 */
export function resolveInvExpiryCron(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env["INVENTORY_EXPIRY_CRON"]?.trim()
  return raw ? raw : INV_EXPIRY_DEFAULT_CRON
}
const BODY_IMAGE_CLEANUP_CRON = "0 2 * * *" // 02:00 MYT daily

const TZ = "Asia/Kuala_Lumpur"

export const VOUCHER_QUEUE_NAME = "voucher-issuance"

const INV_EXPIRY_SCHEDULER_ID = "every-10min-inv-expiry"

/**
 * Register the reservation-expiry schedule and return the pattern that is ACTUALLY running (the
 * configured one, or the default if the configured one is not a valid cron pattern). The scheduler
 * id keeps its old name on purpose: upserting the same id replaces the pattern in place, while a new
 * id would leave the old every-10-minutes schedule running in Redis as well.
 */
export async function registerInvExpirySchedule(
  queue: Pick<Queue, "upsertJobScheduler">,
  logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void },
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const configured = resolveInvExpiryCron(env)
  let applied = configured
  try {
    await queue.upsertJobScheduler(
      INV_EXPIRY_SCHEDULER_ID,
      { pattern: configured, tz: TZ },
      { name: "expire-reservations" },
    )
  } catch (err) {
    // A typo in the env var must not stop the API (it also receives the payment webhooks).
    logger.error(
      { err, configured },
      `jobs: INVENTORY_EXPIRY_CRON "${configured}" is not a valid cron pattern; using the default`,
    )
    applied = INV_EXPIRY_DEFAULT_CRON
    await queue.upsertJobScheduler(
      INV_EXPIRY_SCHEDULER_ID,
      { pattern: applied, tz: TZ },
      { name: "expire-reservations" },
    )
  }
  logger.info(`jobs: inventory-reservation-expiry schedule "${applied}" (${TZ})`)
  return applied
}

export interface Scheduler {
  /** Trigger VoucherIssuanceJob immediately (used by the "Issue Now" admin trigger). */
  triggerVoucherIssuance(): Promise<void>
  /** Gracefully close all workers and queues. */
  close(): Promise<void>
}

export async function createScheduler(
  db: Database,
  deps: {
    mailer: Mailer
    appLog: JobLogger
    logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void }
  },
): Promise<Scheduler> {
  const redisUrl = process.env["REDIS_URL"]
  if (!redisUrl) throw new Error("REDIS_URL is required for the BullMQ scheduler")

  // Let ioredis parse the URL — more robust than manual new URL() splitting,
  // handles rediss:// TLS, IPv6, encoded passwords, etc.
  // maxRetriesPerRequest: null is required by BullMQ workers.
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false })

  // --- Queues ---
  const voucherQueue = new Queue(VOUCHER_QUEUE_NAME, { connection })
  const renewalQueue = new Queue("membership-renewal-notification", { connection })
  const expiryQueue = new Queue("brand-subscription-expiry", { connection })
  const memberExpiryQueue = new Queue("member-subscription-expiry", { connection })
  const invExpiryQueue = new Queue("inventory-reservation-expiry", { connection })
  const orderAutoCompleteQueue = new Queue("order-auto-complete", { connection })
  const bodyImageCleanupQueue = new Queue("body-image-cleanup", { connection })

  // --- Register repeatable cron jobs ---
  await voucherQueue.upsertJobScheduler(
    "monthly-voucher-issuance",
    { pattern: VOUCHER_ISSUANCE_CRON, tz: TZ },
    { name: "issue-vouchers" },
  )
  await renewalQueue.upsertJobScheduler(
    "daily-renewal-notification",
    { pattern: RENEWAL_NOTIFICATION_CRON, tz: TZ },
    { name: "notify-renewals" },
  )
  await expiryQueue.upsertJobScheduler(
    "daily-brand-expiry",
    { pattern: BRAND_EXPIRY_CRON, tz: TZ },
    { name: "expire-subscriptions" },
  )
  await memberExpiryQueue.upsertJobScheduler(
    "daily-member-expiry",
    { pattern: MEMBER_EXPIRY_CRON, tz: TZ },
    { name: "expire-member-subscriptions" },
  )
  await registerInvExpirySchedule(invExpiryQueue, deps.logger)
  await orderAutoCompleteQueue.upsertJobScheduler(
    "daily-order-auto-complete",
    { pattern: ORDER_AUTO_COMPLETE_CRON, tz: TZ },
    { name: "order-auto-complete" },
  )
  await bodyImageCleanupQueue.upsertJobScheduler(
    "nightly-body-image-cleanup",
    { pattern: BODY_IMAGE_CLEANUP_CRON, tz: TZ },
    {
      name: "body-image-cleanup",
      opts: { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
    },
  )

  // --- Workers ---
  const voucherWorker = new Worker(
    VOUCHER_QUEUE_NAME,
    async () => {
      const n = await issueMonthlyVouchers(db, deps.mailer, deps.appLog)
      deps.logger.info(`jobs: voucher-issuance issued ${n} vouchers`)
    },
    { connection },
  )

  const renewalWorker = new Worker(
    "membership-renewal-notification",
    async () => {
      const n = await notifyRenewalsDue(db, deps.mailer)
      deps.logger.info(`jobs: membership-renewal-notification sent ${n} notifications`)
    },
    { connection },
  )

  const expiryWorker = new Worker(
    "brand-subscription-expiry",
    async () => {
      const { brandCount, memberCount } = await expireSubscriptions(db)
      deps.logger.info(
        `jobs: brand-subscription-expiry expired ${brandCount} brand, ${memberCount} member subscriptions`,
      )
    },
    { connection },
  )

  const memberExpiryWorker = new Worker(
    "member-subscription-expiry",
    async () => {
      const { cancelledCount, abandonedCount } = await expireMemberSubscriptions(db)
      deps.logger.info(
        `jobs: member-subscription-expiry expired ${cancelledCount} cancelled, ${abandonedCount} abandoned pending`,
      )
    },
    { connection },
  )

  const invExpiryWorker = new Worker(
    "inventory-reservation-expiry",
    async () => {
      await runInventoryReservationExpiryJob({
        db,
        log: {
          info: (obj, msg) => deps.logger.info(`${msg} ${JSON.stringify(obj)}`),
        },
      })
    },
    { connection },
  )

  const orderAutoCompleteWorker = new Worker(
    "order-auto-complete",
    async () => {
      await runOrderAutoCompleteJob(db)
      deps.logger.info("jobs: order-auto-complete pass 1 + pass 2 done")
    },
    { connection },
  )

  const bodyImageCleanupWorker = new Worker(
    "body-image-cleanup",
    async () => {
      await runBodyImageCleanup(db, connection, deps.logger)
    },
    { connection },
  )

  for (const worker of [
    voucherWorker,
    renewalWorker,
    expiryWorker,
    memberExpiryWorker,
    invExpiryWorker,
    orderAutoCompleteWorker,
    bodyImageCleanupWorker,
  ]) {
    worker.on("failed", (job, err) => {
      deps.logger.error({ err, jobId: job?.id }, `jobs: worker failed — ${job?.name ?? "unknown"}`)
    })
  }

  return {
    async triggerVoucherIssuance() {
      await voucherQueue.add("manual-trigger", {})
    },

    async close() {
      await Promise.all([
        voucherWorker.close(),
        renewalWorker.close(),
        expiryWorker.close(),
        memberExpiryWorker.close(),
        invExpiryWorker.close(),
        orderAutoCompleteWorker.close(),
        bodyImageCleanupWorker.close(),
        voucherQueue.close(),
        renewalQueue.close(),
        expiryQueue.close(),
        memberExpiryQueue.close(),
        invExpiryQueue.close(),
        orderAutoCompleteQueue.close(),
        bodyImageCleanupQueue.close(),
      ])
      // BullMQ does not close a shared connection it was handed — quit it here
      // so Railway redeploys/shutdowns don't leak the Redis handle.
      await connection.quit()
    },
  }
}
