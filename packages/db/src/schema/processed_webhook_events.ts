import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { pspProviderEnum } from "./enums.js"

// Idempotency gate for inbound HitPay webhooks. The unique index on
// (psp_provider, psp_event_id) — defined in migration 0012 — is what
// claimEvent races on via INSERT ... ON CONFLICT DO NOTHING RETURNING id.
// Append-only by RLS (admin SELECT + admin INSERT only; no UPDATE/DELETE
// policies). payloadHash is SHA-256 of the raw signed request body so a
// duplicate psp_event_id with a different payload can be detected and
// alerted (event: webhook_event_id_collision; see spec §3.2).
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pspProvider: pspProviderEnum("psp_provider").notNull(),
  pspEventId: text("psp_event_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
})
