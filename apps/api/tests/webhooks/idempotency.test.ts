/**
 * Tests for apps/api/src/webhooks/hitpay/idempotency.ts (PR #32 Task 7).
 *
 * - `deriveEventIdentity`: pure-function unit tests; always run.
 * - `claimEvent`: integration tests against real Postgres. Skip when
 *   `DATABASE_URL` is unset, matching the existing webhook test pattern.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
 *     BOMY_RLS_READY=1 \
 *     pnpm --filter @bomy/api test idempotency.test.ts --run
 */
import { createHash, randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  claimEvent,
  deriveEventIdentity,
  type EventIdentity,
} from "../../src/webhooks/hitpay/idempotency.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL)

// ─── deriveEventIdentity — pure-function unit tests ───────────────────

describe("deriveEventIdentity", () => {
  it("uses Hitpay-Event-Id header when present", () => {
    const id = deriveEventIdentity('{"a":1}', {
      "hitpay-event-id": "evt_abc",
      "hitpay-event-type": "payment_request.completed",
    })
    expect(id.pspEventId).toBe("evt_abc")
    expect(id.eventType).toBe("payment_request.completed")
    expect(id.pspProvider).toBe("hitpay")
    expect(id.payloadHash).toBe(createHash("sha256").update('{"a":1}').digest("hex"))
  })

  it("falls back to derived:<sha256> when Hitpay-Event-Id is absent", () => {
    const body = '{"raw":"body"}'
    const expectedHash = createHash("sha256").update(body).digest("hex")
    const id = deriveEventIdentity(body, {
      "hitpay-event-type": "payment_request.failed",
    })
    expect(id.pspEventId).toBe(`derived:${expectedHash}`)
    expect(id.payloadHash).toBe(expectedHash)
  })

  it("falls back to derived:<sha256> when Hitpay-Event-Id is empty string", () => {
    const id = deriveEventIdentity('{"b":2}', {
      "hitpay-event-id": "",
      "hitpay-event-type": "x",
    })
    expect(id.pspEventId.startsWith("derived:")).toBe(true)
  })

  it("eventType defaults to 'unknown' when Hitpay-Event-Type header is absent", () => {
    const id = deriveEventIdentity("{}", { "hitpay-event-id": "evt_x" })
    expect(id.eventType).toBe("unknown")
  })

  it("identical body + headers produce identical identity (deterministic)", () => {
    const headers = { "hitpay-event-id": "evt_z", "hitpay-event-type": "x" }
    const a = deriveEventIdentity("hello", headers)
    const b = deriveEventIdentity("hello", headers)
    expect(a).toEqual(b)
  })

  it("different bodies produce different payload hashes", () => {
    const headers = { "hitpay-event-id": "evt_y", "hitpay-event-type": "x" }
    const a = deriveEventIdentity("body-1", headers)
    const b = deriveEventIdentity("body-2", headers)
    expect(a.payloadHash).not.toBe(b.payloadHash)
  })

  it("derived fallback differs across different bodies (so retries-only collapse)", () => {
    const a = deriveEventIdentity("body-1", { "hitpay-event-type": "x" })
    const b = deriveEventIdentity("body-2", { "hitpay-event-type": "x" })
    expect(a.pspEventId).not.toBe(b.pspEventId)
  })
})

// ─── claimEvent — integration tests against real Postgres ─────────────

describe.skipIf(!shouldRun)("claimEvent (integration)", () => {
  let handle: ReturnType<typeof makeDb>

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  beforeEach(async () => {
    // Clear the table between tests so each test owns its own rows.
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "claimEvent test reset" },
      async (tx) => {
        await tx.delete(schema.processedWebhookEvents)
      },
    )
  })

  function identity(eventId: string, body = "body"): EventIdentity {
    return {
      pspProvider: "hitpay",
      pspEventId: eventId,
      eventType: "payment_request.completed",
      payloadHash: createHash("sha256").update(body).digest("hex"),
    }
  }

  it("first call with a fresh event_id returns { owned: true } and inserts a row", async () => {
    const id = identity(`evt-${randomUUID()}`)
    const result = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "claim 1" },
      async (tx) => claimEvent(tx, id),
    )
    expect(result.owned).toBe(true)

    const rows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "verify insert" },
      async (tx) =>
        tx
          .select({
            pspEventId: schema.processedWebhookEvents.pspEventId,
            payloadHash: schema.processedWebhookEvents.payloadHash,
            eventType: schema.processedWebhookEvents.eventType,
          })
          .from(schema.processedWebhookEvents)
          .where(eq(schema.processedWebhookEvents.pspEventId, id.pspEventId)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.payloadHash).toBe(id.payloadHash)
    expect(rows[0]?.eventType).toBe(id.eventType)
  })

  it("second call with same event_id + same payload returns { owned: false, existing } matching the first", async () => {
    const id = identity(`evt-${randomUUID()}`)
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "first" }, async (tx) =>
      claimEvent(tx, id),
    )
    const result = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "retry" },
      async (tx) => claimEvent(tx, id),
    )
    expect(result.owned).toBe(false)
    if (!result.owned) {
      expect(result.existing.payloadHash).toBe(id.payloadHash)
      expect(result.existing.eventType).toBe(id.eventType)
    }
  })

  it("second call with same event_id but DIFFERENT payload exposes existing.payloadHash for collision detection (Bob R5)", async () => {
    const eventId = `evt-${randomUUID()}`
    const first = identity(eventId, "original body")
    await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "first" }, async (tx) =>
      claimEvent(tx, first),
    )
    // Same event_id, different body → different payloadHash.
    const second: EventIdentity = {
      ...identity(eventId, "DIFFERENT body"),
      eventType: "payment_request.failed", // also different type
    }
    expect(second.payloadHash).not.toBe(first.payloadHash)

    const result = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "collision" },
      async (tx) => claimEvent(tx, second),
    )
    expect(result.owned).toBe(false)
    if (!result.owned) {
      // The returned `existing` reflects the FIRST insert, not the second
      // call's identity — this is what lets the caller detect the
      // collision by comparing the two.
      expect(result.existing.payloadHash).toBe(first.payloadHash)
      expect(result.existing.eventType).toBe(first.eventType)
      // And confirm the second call's identity does NOT match (collision):
      expect(result.existing.payloadHash).not.toBe(second.payloadHash)
      expect(result.existing.eventType).not.toBe(second.eventType)
    }
  })

  it("different event_ids both succeed independently", async () => {
    const a = identity(`evt-${randomUUID()}`)
    const b = identity(`evt-${randomUUID()}`)
    const resA = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "a" }, async (tx) =>
      claimEvent(tx, a),
    )
    const resB = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "b" }, async (tx) =>
      claimEvent(tx, b),
    )
    expect(resA.owned).toBe(true)
    expect(resB.owned).toBe(true)

    const count = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "count" },
      async (tx) =>
        tx
          .select({ id: schema.processedWebhookEvents.id })
          .from(schema.processedWebhookEvents)
          .where(
            and(
              eq(schema.processedWebhookEvents.pspProvider, "hitpay"),
              // Two seeds with random ids; this filter just counts rows we wrote.
              eq(schema.processedWebhookEvents.eventType, a.eventType),
            ),
          ),
    )
    expect(count.length).toBeGreaterThanOrEqual(2)
  })

  it("derived: prefix coexists with header-based event ids on the same unique index", async () => {
    // A real event_id and a derived one based on the same body must not
    // collide — they should be treated as distinct identities.
    const realId = identity(`evt-${randomUUID()}`)
    const derivedId: EventIdentity = {
      ...realId,
      pspEventId: `derived:${realId.payloadHash}`,
    }
    const r1 = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "real" }, async (tx) =>
      claimEvent(tx, realId),
    )
    const r2 = await withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "derived" }, async (tx) =>
      claimEvent(tx, derivedId),
    )
    expect(r1.owned).toBe(true)
    expect(r2.owned).toBe(true)
  })

  it("concurrent claims for the same event_id (two transactions, one connection pool) — exactly one wins", async () => {
    // Two separate withAdmin tx run concurrently on different pool
    // connections. The unique index on (psp_provider, psp_event_id) is the
    // arbiter; ON CONFLICT DO NOTHING ensures the loser returns 0 rows.
    // One pool, two transactions: postgres-js will use two distinct
    // connections from the pool, so the conflict materialises at INSERT
    // time, not at COMMIT.
    const id = identity(`evt-${randomUUID()}`)
    const [resA, resB] = await Promise.all([
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "concurrent-a" }, async (tx) =>
        claimEvent(tx, id),
      ),
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "concurrent-b" }, async (tx) =>
        claimEvent(tx, id),
      ),
    ])
    const owned = [resA.owned, resB.owned]
    // Exactly one of the two transactions owns the event.
    expect(owned.filter((o) => o === true)).toHaveLength(1)
    expect(owned.filter((o) => o === false)).toHaveLength(1)

    // The loser's `existing` matches the winner's identity.
    const loser = resA.owned ? resB : resA
    expect(loser.owned).toBe(false)
    if (!loser.owned) {
      expect(loser.existing.payloadHash).toBe(id.payloadHash)
      expect(loser.existing.eventType).toBe(id.eventType)
    }

    // Exactly one row in processed_webhook_events for that event_id.
    const rows = await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "verify single row" },
      async (tx) =>
        tx
          .select({ id: schema.processedWebhookEvents.id })
          .from(schema.processedWebhookEvents)
          .where(eq(schema.processedWebhookEvents.pspEventId, id.pspEventId)),
    )
    expect(rows).toHaveLength(1)
  })
})
