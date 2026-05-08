import { Queue, Worker } from "bullmq"

import type { Database } from "@bomy/db"

import { expireSubscriptions } from "./jobs/brand-subscription-expiry.js"
import { notifyRenewalsDue } from "./jobs/membership-renewal-notification.js"
import { issueMonthlyVouchers } from "./jobs/voucher-issuance.js"

// MYT = UTC+8. Cron expressions use tz: 'Asia/Kuala_Lumpur' so times are
// stated in MYT without converting to UTC offsets manually.
const VOUCHER_ISSUANCE_CRON = "0 8 1 * *" // 08:00 MYT on 1st of month
const RENEWAL_NOTIFICATION_CRON = "0 9 * * *" // 09:00 MYT daily
const BRAND_EXPIRY_CRON = "5 0 * * *" // 00:05 MYT daily

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
  logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void },
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

  // --- Workers ---
  const voucherWorker = new Worker(
    VOUCHER_QUEUE_NAME,
    async () => {
      const n = await issueMonthlyVouchers(db)
      logger.info(`jobs: voucher-issuance issued ${n} vouchers`)
    },
    { connection },
  )

  const renewalWorker = new Worker(
    "membership-renewal-notification",
    async () => {
      const n = await notifyRenewalsDue(db)
      logger.info(`jobs: membership-renewal-notification sent ${n} stubs`)
    },
    { connection },
  )

  const expiryWorker = new Worker(
    "brand-subscription-expiry",
    async () => {
      const { brandCount, memberCount } = await expireSubscriptions(db)
      logger.info(
        `jobs: brand-subscription-expiry expired ${brandCount} brand, ${memberCount} member subscriptions`,
      )
    },
    { connection },
  )

  for (const worker of [voucherWorker, renewalWorker, expiryWorker]) {
    worker.on("failed", (job, err) => {
      logger.error({ err, jobId: job?.id }, `jobs: worker failed — ${job?.name ?? "unknown"}`)
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
        voucherQueue.close(),
        renewalQueue.close(),
        expiryQueue.close(),
      ])
    },
  }
}
