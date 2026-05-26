import { Queue, Worker } from "bullmq"

import type { Database } from "@bomy/db"

import type { Mailer } from "./lib/mailer.js"

import { expireSubscriptions } from "./jobs/brand-subscription-expiry.js"
import { runInventoryReservationExpiryJob } from "./jobs/inventory-reservation-expiry.js"
import { notifyRenewalsDue } from "./jobs/membership-renewal-notification.js"
import { ORDER_AUTO_COMPLETE_CRON, runOrderAutoCompleteJob } from "./jobs/order-auto-complete.js"
import { issueMonthlyVouchers } from "./jobs/voucher-issuance.js"
import type { JobLogger } from "./notifications/voucher.js"

// MYT = UTC+8. Cron expressions use tz: 'Asia/Kuala_Lumpur' so times are
// stated in MYT without converting to UTC offsets manually.
const VOUCHER_ISSUANCE_CRON = "0 8 1 * *" // 08:00 MYT on 1st of month
const RENEWAL_NOTIFICATION_CRON = "0 9 * * *" // 09:00 MYT daily
const BRAND_EXPIRY_CRON = "5 0 * * *" // 00:05 MYT daily
const INV_EXPIRY_CRON = "*/10 * * * *" // every 10 minutes MYT

const TZ = "Asia/Kuala_Lumpur"

export const VOUCHER_QUEUE_NAME = "voucher-issuance"

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
    logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void }
  },
): Promise<Scheduler> {
  const redisUrl = process.env["REDIS_URL"]
  if (!redisUrl) throw new Error("REDIS_URL is required for the BullMQ scheduler")

  // Parse Redis URL into BullMQ connection options.
  const parsed = new URL(redisUrl)
  const connection = {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  }

  // --- Queues ---
  const voucherQueue = new Queue(VOUCHER_QUEUE_NAME, { connection })
  const renewalQueue = new Queue("membership-renewal-notification", { connection })
  const expiryQueue = new Queue("brand-subscription-expiry", { connection })
  const invExpiryQueue = new Queue("inventory-reservation-expiry", { connection })
  const orderAutoCompleteQueue = new Queue("order-auto-complete", { connection })

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
  await invExpiryQueue.upsertJobScheduler(
    "every-10min-inv-expiry",
    { pattern: INV_EXPIRY_CRON, tz: TZ },
    { name: "expire-reservations" },
  )
  await orderAutoCompleteQueue.upsertJobScheduler(
    "daily-order-auto-complete",
    { pattern: ORDER_AUTO_COMPLETE_CRON, tz: TZ },
    { name: "order-auto-complete" },
  )

  // --- Workers ---
  const voucherWorker = new Worker(
    VOUCHER_QUEUE_NAME,
    async () => {
      // Temporary log adapter — Task 16 introduces deps.appLog and removes this.
      const tempLog: JobLogger = {
        info: (obj, msg) => deps.logger.info(`${msg} ${JSON.stringify(obj)}`),
        warn: (obj, msg) => deps.logger.info(`${msg} ${JSON.stringify(obj)}`),
        error: (obj, msg) => deps.logger.error(obj, msg),
      }
      const n = await issueMonthlyVouchers(db, deps.mailer, tempLog)
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

  for (const worker of [
    voucherWorker,
    renewalWorker,
    expiryWorker,
    invExpiryWorker,
    orderAutoCompleteWorker,
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
        invExpiryWorker.close(),
        orderAutoCompleteWorker.close(),
        voucherQueue.close(),
        renewalQueue.close(),
        expiryQueue.close(),
        invExpiryQueue.close(),
        orderAutoCompleteQueue.close(),
      ])
    },
  }
}
