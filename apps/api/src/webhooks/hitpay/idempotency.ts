/**
 * HitPay webhook idempotency primitives (PR #32 spec §3.2).
 *
 * The unique index `processed_webhook_events_unique` on
 * `(psp_provider, psp_event_id)` is the gate. `claimEvent` races on
 * INSERT … ON CONFLICT DO NOTHING; the first transaction to commit
 * wins, every subsequent delivery with the same psp_event_id sees
 * `owned: false` and the existing row's `payload_hash + event_type`
 * so the caller can detect the Bob R5 collision case.
 */
import { createHash } from "node:crypto"

import { schema, type Database } from "@bomy/db"
import { and, eq } from "drizzle-orm"

export interface EventIdentity {
  /** Fixed to "hitpay" in PR #32; the enum value seam stays for future PSPs. */
  pspProvider: "hitpay"
  /** From the `Hitpay-Event-Id` header, or `derived:<sha256>` fallback. */
  pspEventId: string
  /** From the `Hitpay-Event-Type` header; "unknown" if absent. */
  eventType: string
  /** SHA-256 hex digest of the raw signed request body. */
  payloadHash: string
}

/**
 * Derive a stable identity for an inbound webhook. The `Hitpay-Event-Id`
 * header is the primary key; when HitPay omits it (rare but observed in
 * older sandbox builds) we fall back to `derived:<sha256-of-body>` so
 * retries of the same payload still collapse on the unique index.
 *
 * Pure function: no DB, no time, deterministic for identical inputs.
 */
export function deriveEventIdentity(
  rawBody: string,
  headers: Record<string, string | undefined>,
): EventIdentity {
  const payloadHash = createHash("sha256").update(rawBody).digest("hex")
  const headerEventId = headers["hitpay-event-id"]
  // Fallback: when Hitpay-Event-Id is missing, the payload hash collapses
  // retries on the same body. The "derived:" prefix is intentional so the
  // synthetic id can never collide with a real HitPay event id.
  const pspEventId =
    typeof headerEventId === "string" && headerEventId.length > 0
      ? headerEventId
      : `derived:${payloadHash}`
  return {
    pspProvider: "hitpay",
    pspEventId,
    eventType: headers["hitpay-event-type"] ?? "unknown",
    payloadHash,
  }
}

/**
 * Result of {@link claimEvent}. Discriminated union: `owned: true` means
 * this transaction created the row (fan-out should proceed); `owned: false`
 * means a prior delivery already claimed it (caller runs consistency check
 * and the §3.2 collision check on `existing`).
 */
export type ClaimResult =
  | { owned: true }
  | { owned: false; existing: { payloadHash: string; eventType: string } }

/**
 * Claim the inbound event for this transaction.
 *
 * Behaviour:
 * - `INSERT … ON CONFLICT (psp_provider, psp_event_id) DO NOTHING RETURNING id`
 *   — single round trip when the event is new.
 * - On 0 rows returned: another transaction already owns the event. Read
 *   the existing row's payload_hash + event_type so the caller can compare
 *   against the new event's hash + type and emit
 *   `event: webhook_event_id_collision` at `level: error` on mismatch
 *   (spec §3.2 Bob R5).
 *
 * The "race lost but no row found" throw is a Postgres invariant violation
 * (the unique conflict means a row MUST exist); we throw rather than
 * silently return `owned: false` so a corrupted state surfaces immediately
 * instead of triggering wrong consistency checks downstream.
 *
 * Caller contract: must commit the surrounding withAdmin transaction
 * regardless of `owned`. The 200-always envelope for the webhook depends
 * on this — see spec §1 hard constraint.
 */
export async function claimEvent(tx: Database, identity: EventIdentity): Promise<ClaimResult> {
  const inserted = await tx
    .insert(schema.processedWebhookEvents)
    .values(identity)
    .onConflictDoNothing({
      target: [schema.processedWebhookEvents.pspProvider, schema.processedWebhookEvents.pspEventId],
    })
    .returning({ id: schema.processedWebhookEvents.id })

  if (inserted.length === 1) return { owned: true }

  // Conflict: read the existing row so the caller can detect collisions.
  // One extra round-trip only on the rare lost-race path.
  const existing = await tx
    .select({
      payloadHash: schema.processedWebhookEvents.payloadHash,
      eventType: schema.processedWebhookEvents.eventType,
    })
    .from(schema.processedWebhookEvents)
    .where(
      and(
        eq(schema.processedWebhookEvents.pspProvider, identity.pspProvider),
        eq(schema.processedWebhookEvents.pspEventId, identity.pspEventId),
      ),
    )
    .limit(1)

  if (!existing[0]) {
    throw new Error(`claimEvent: race lost but no row found for ${identity.pspEventId}`)
  }
  return { owned: false, existing: existing[0] }
}
