import { and, eq, gt, isNotNull, lt } from "drizzle-orm"
import type { Redis } from "ioredis"
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3"

import { schema, withAdmin, type Database } from "@bomy/db"
import { extractManagedBodyImageKeys } from "@bomy/shared"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const
const PAGE_SIZE = 100
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
const SEVENTY_TWO_HOURS_S = 72 * 60 * 60 // seconds — used as Redis TTL for quarantine markers
const QUARANTINE_TTL_SECONDS = SEVENTY_TWO_HOURS_S
const KEY_RE = /^body\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i

interface Logger {
  info: (msg: string) => void
  error: (obj: object, msg: string) => void
}

let _s3: S3Client | null = null

// Exported for testing — allows tests to inject a mock S3Client instance.
export function _setS3ForTesting(client: S3Client | null): void {
  _s3 = client
}

function getS3(): S3Client {
  if (!_s3) {
    const endpoint = process.env["S3_ENDPOINT"]
    const accessKeyId = process.env["S3_ACCESS_KEY"]
    const secretAccessKey = process.env["S3_SECRET_KEY"]
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY are required")
    }
    _s3 = new S3Client({
      endpoint,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    })
  }
  return _s3
}

async function buildReferenceSet(db: Database): Promise<Set<string> | null> {
  const publicOrigin = process.env["S3_PUBLIC_URL"] ?? ""
  const referenced = new Set<string>()
  let lastSeenId: string | null = null

  while (true) {
    let rows: Array<{ id: string; bodyHtml: string | null }>

    try {
      rows = await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "body-image-cleanup" }, (tx) =>
        tx
          .select({ id: schema.products.id, bodyHtml: schema.products.bodyHtml })
          .from(schema.products)
          .where(
            and(
              isNotNull(schema.products.bodyHtml),
              lastSeenId ? gt(schema.products.id, lastSeenId) : undefined,
            ),
          )
          .orderBy(schema.products.id)
          .limit(PAGE_SIZE),
      )
    } catch {
      return null
    }

    for (const row of rows) {
      try {
        const keys = extractManagedBodyImageKeys(row.bodyHtml ?? "", row.id, publicOrigin)
        for (const key of keys) referenced.add(key)
      } catch {
        return null
      }
    }

    if (rows.length < PAGE_SIZE) break
    lastSeenId = rows[rows.length - 1]!.id
  }

  return referenced
}

async function listAllR2Objects(
  bucket: string,
  logger: Logger,
): Promise<Array<{ key: string; lastModified: Date }> | null> {
  const objects: Array<{ key: string; lastModified: Date }> = []
  let continuationToken: string | undefined

  while (true) {
    try {
      const resp = await getS3().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "body/",
          ContinuationToken: continuationToken,
        }),
      )
      for (const obj of (resp as { Contents?: Array<{ Key?: string; LastModified?: Date }> })
        .Contents ?? []) {
        if (!obj.Key || !obj.LastModified) {
          if (obj.Key)
            logger.error({ key: obj.Key }, "body-image-cleanup: missing LastModified, skipping")
          continue
        }
        objects.push({ key: obj.Key, lastModified: obj.LastModified })
      }
      const r = resp as { IsTruncated?: boolean; NextContinuationToken?: string }
      if (!r.IsTruncated) break
      continuationToken = r.NextContinuationToken
    } catch (err) {
      logger.error({ err }, "body-image-cleanup: R2 listing page failed — aborting before deletion")
      return null
    }
  }

  return objects
}

export async function runBodyImageCleanup(
  db: Database,
  redis: Redis,
  logger: Logger,
): Promise<void> {
  const bucket = process.env["S3_BUCKET"]
  if (!bucket) {
    logger.error({}, "body-image-cleanup: S3_BUCKET not set — skipping")
    return
  }

  const now = Date.now()
  const stats = {
    scanned: 0,
    skippedRecent: 0,
    skippedReferenced: 0,
    quarantinedNew: 0,
    quarantinedPending: 0,
    finalCheckSaved: 0,
    deleted: 0,
    failed: 0,
    uploadLogPruned: 0,
  }

  // Phase 1: Build reference set — keyset-paginate all products with body_html
  const referenced = await buildReferenceSet(db)
  if (!referenced) {
    throw new Error("body-image-cleanup: Phase 1 failed — aborting")
  }

  // Phase 1b: DEL Redis candidate markers for any key now in the reference set
  for (const key of referenced) {
    try {
      await redis.del(`body-img-candidate:${key}`)
    } catch {
      logger.error({ key }, "body-image-cleanup: Redis DEL for referenced key failed")
    }
  }

  // Phase 2: Collect ALL R2 objects before any deletion (abort if any page fails)
  const objects = await listAllR2Objects(bucket, logger)
  if (!objects) throw new Error("body-image-cleanup: R2 listing failed — aborting before deletion")

  stats.scanned = objects.length

  for (const { key, lastModified } of objects) {
    if (referenced.has(key)) {
      stats.skippedReferenced++
      continue
    }

    // Skip objects younger than 48 hours
    if (now - lastModified.getTime() < FORTY_EIGHT_HOURS) {
      stats.skippedRecent++
      continue
    }

    const markerKey = `body-img-candidate:${key}`
    let firstSeenAt: string | null

    try {
      firstSeenAt = await redis.get(markerKey)
    } catch (err) {
      logger.error(
        { err, key },
        "body-image-cleanup: Redis GET failed — skipping object (fail-safe)",
      )
      continue
    }

    if (!firstSeenAt) {
      // First encounter: write quarantine marker with 72h TTL
      try {
        await redis.set(markerKey, new Date(now).toISOString(), "EX", QUARANTINE_TTL_SECONDS)
        stats.quarantinedNew++
      } catch (err) {
        logger.error(
          { err, key },
          "body-image-cleanup: Redis SET failed — skipping object (fail-safe)",
        )
      }
      continue
    }

    // Marker exists — check quarantine age
    const markerTimestamp = Date.parse(firstSeenAt)
    if (isNaN(markerTimestamp)) {
      logger.error(
        { key },
        "body-image-cleanup: invalid Redis marker — resetting with current timestamp",
      )
      try {
        await redis.set(markerKey, new Date().toISOString(), "EX", SEVENTY_TWO_HOURS_S)
        stats.quarantinedNew++
      } catch (setErr) {
        logger.error(
          { key, err: setErr },
          "body-image-cleanup: failed to reset invalid Redis marker — skipping",
        )
        stats.quarantinedPending++
      }
      continue
    }
    const markerAge = now - markerTimestamp
    if (markerAge < TWENTY_FOUR_HOURS) {
      stats.quarantinedPending++
      continue
    }

    // Quarantine has elapsed — do a final DB re-check before deleting
    const productIdMatch = KEY_RE.exec(key)
    if (productIdMatch) {
      const pid = productIdMatch[1]!
      try {
        const rows = await withAdmin(
          db,
          { userId: SYSTEM_ACTOR, reason: "body-image-cleanup-final-check" },
          (tx) =>
            tx
              .select({ bodyHtml: schema.products.bodyHtml })
              .from(schema.products)
              .where(eq(schema.products.id, pid))
              .limit(1),
        )
        const html = rows[0]?.bodyHtml
        if (html) {
          const publicOrigin = process.env["S3_PUBLIC_URL"] ?? ""
          const liveKeys = extractManagedBodyImageKeys(html, pid, publicOrigin)
          if (liveKeys.has(key)) {
            try {
              await redis.del(markerKey)
            } catch {
              logger.error({ key }, "body-image-cleanup: Redis DEL after final-check rescue failed")
            }
            stats.finalCheckSaved++
            continue
          }
        }
      } catch (err) {
        logger.error({ err, key }, "body-image-cleanup: final-check DB query failed — skipping")
        continue
      }
    }
    // Non-conforming keys (no product UUID in path) are treated as plain orphans:
    // we cannot derive a product ID to re-check, so no final DB check is performed.

    // Serialize final check + delete: eliminate the window between collection and deletion.
    // Delete immediately after confirming not referenced.
    try {
      // TOCTOU acceptance: the withAdmin SELECT transaction ends before the S3 DeleteObjectCommand
      // HTTP call begins. A concurrent seller save could theoretically re-reference this key in
      // that ~100ms window, producing a broken image URL until the seller re-uploads.
      // Risk accepted because: (1) the two-run 72h quarantine makes simultaneous re-reference
      // extremely unlikely in practice, (2) the consequence is recoverable (re-upload), and
      // (3) a cross-system lock/registry would require Redis access in apps/web, adding
      // significant complexity for a near-zero-probability event.
      await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      stats.deleted++
      // Clear Redis marker only on successful delete
      try {
        await redis.del(markerKey)
      } catch (delErr) {
        logger.error(
          { key, err: delErr },
          "body-image-cleanup: Redis DEL post-delete failed — marker left (will retry next run)",
        )
      }
    } catch (deleteErr) {
      logger.error({ key, err: deleteErr }, "body-image-cleanup: R2 delete failed")
      stats.failed++
    }
  }

  // Upload-log housekeeping: remove rows older than 2 hours
  try {
    const cutoff = new Date(now - 2 * 60 * 60 * 1000)
    const pruned = await withAdmin(
      db,
      { userId: SYSTEM_ACTOR, reason: "body-image-cleanup-log-housekeeping" },
      (tx) =>
        tx
          .delete(schema.bodyImageUploadLog)
          .where(lt(schema.bodyImageUploadLog.createdAt, cutoff))
          .returning({ id: schema.bodyImageUploadLog.id }),
    )
    stats.uploadLogPruned = pruned.length
  } catch (err) {
    logger.error({ err }, "body-image-cleanup: upload-log housekeeping failed")
  }

  logger.info(
    `body-image-cleanup: scanned=${stats.scanned} skipped_recent=${stats.skippedRecent} skipped_referenced=${stats.skippedReferenced} quarantined_new=${stats.quarantinedNew} quarantined_pending=${stats.quarantinedPending} final_check_saved=${stats.finalCheckSaved} deleted=${stats.deleted} failed=${stats.failed} upload_log_pruned=${stats.uploadLogPruned}`,
  )
}
