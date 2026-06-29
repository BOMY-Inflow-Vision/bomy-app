import type { S3Client } from "@aws-sdk/client-s3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Redis } from "ioredis"

import { runBodyImageCleanup, _setS3ForTesting } from "../../src/jobs/body-image-cleanup.js"

// All S3 and Redis calls are mocked — this is a unit test of the algorithm.
// DB interactions use a minimal stub returning empty arrays.

function makeS3Mock(pages: Array<Array<{ Key: string; LastModified: Date }>>) {
  let callCount = 0
  const send = vi.fn().mockImplementation((cmd: unknown) => {
    if ((cmd as { constructor: { name: string } }).constructor.name === "ListObjectsV2Command") {
      const page = pages[callCount++]
      if (!page) throw new Error("Unexpected ListObjectsV2 call")
      return Promise.resolve({
        Contents: page,
        IsTruncated: callCount < pages.length,
        NextContinuationToken: callCount < pages.length ? "token" : undefined,
      })
    }
    // DeleteObjectCommand
    return Promise.resolve({})
  })
  return { send } as { send: typeof send } & Partial<S3Client>
}

function makeRedisMock({
  getResult = null as string | null,
  setFails = false,
  getFails = false,
} = {}) {
  const get = vi
    .fn()
    .mockImplementation(() =>
      getFails ? Promise.reject(new Error("Redis GET fail")) : Promise.resolve(getResult),
    )
  const set = vi
    .fn()
    .mockImplementation(() =>
      setFails ? Promise.reject(new Error("Redis SET fail")) : Promise.resolve("OK"),
    )
  const del = vi.fn().mockResolvedValue(1)
  return { get, set, del, _mocks: { get, set, del } }
}

function makeLogger() {
  const info = vi.fn()
  const error = vi.fn()
  return { info, error, _mocks: { info, error } }
}

function makeDb() {
  // The limit mock needs to be accessible both via .orderBy().limit() (phase 1 pagination)
  // and via .where().limit() (final-check query that has no orderBy).
  const limitMock = vi.fn().mockResolvedValue([])
  const stub = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: limitMock }),
          limit: limitMock,
        }),
      }),
    }),
    // withAdmin calls db.transaction — the callback receives the same stub as `tx`
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(stub)
    }),
    // withAdmin also calls tx.execute for SET CONFIG and tx.insert for audit row
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  }
  return stub as unknown as Parameters<typeof runBodyImageCleanup>[0]
}

const OLD_DATE = new Date(Date.now() - 72 * 60 * 60 * 1000) // 72h ago
const RECENT_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h ago (too recent)
const PID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const UUID_KEY = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const MANAGED_KEY = `body/${PID}/${UUID_KEY}.jpg`

// Set a fake S3_BUCKET so the function doesn't bail out early.
// Inject the mock S3 client via the exported test hook.
beforeEach(() => {
  process.env["S3_BUCKET"] = "test-bucket"
})

afterEach(() => {
  delete process.env["S3_BUCKET"]
  _setS3ForTesting(null)
})

// Note: runBodyImageCleanup's withAdmin calls are tested here with a DB stub.
// The withAdmin wrapper itself is integration-tested in packages/db and apps/web.
// A full RLS integration test for the cleanup job would require a live Postgres
// instance with the bomy_app role — deferred to a dedicated ops/integration test suite.

describe("runBodyImageCleanup (unit — mocked S3 + Redis)", () => {
  it("skips objects younger than 48h — no Redis marker written", async () => {
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: RECENT_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock()
    const logger = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    expect(redisMocks.set).not.toHaveBeenCalled()
    expect(s3.send).toHaveBeenCalledTimes(1) // Only ListObjectsV2
  })

  it("writes quarantine marker on first encounter of old unreferenced object — no delete", async () => {
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getResult: null }) // no prior marker
    const logger = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    expect(redisMocks.set).toHaveBeenCalledWith(
      `body-img-candidate:${MANAGED_KEY}`,
      expect.any(String),
      "EX",
      259200,
    )
    // No delete
    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)
  })

  it("deletes object when quarantine period has elapsed (marker > 24h old)", async () => {
    const firstSeenAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getResult: firstSeenAt })
    const logger = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(1)
    expect(redisMocks.del).toHaveBeenCalledWith(`body-img-candidate:${MANAGED_KEY}`)
  })

  it("R2 listing second-page failure → throws (BullMQ retry eligible), zero deletions", async () => {
    const page1Objects = [
      { Key: MANAGED_KEY, LastModified: OLD_DATE },
      { Key: `body/${PID}/${UUID_KEY}.png`, LastModified: OLD_DATE },
    ]
    // Second page throws
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: page1Objects,
        IsTruncated: true,
        NextContinuationToken: "token",
      })
      .mockRejectedValueOnce(new Error("S3 listing page 2 failed"))
    const s3 = { send }
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock()
    const { _mocks: logMocks, ...logger } = makeLogger()
    const db = makeDb()

    // Phase 2 listing failure now throws so BullMQ can retry the job
    await expect(runBodyImageCleanup(db, redis as unknown as Redis, logger)).rejects.toThrow(
      "R2 listing failed",
    )

    const deleteCalls = send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)
    expect(logMocks.error).toHaveBeenCalled()
    // Redis del should not have been called for non-referenced keys during listing failure
    void redisMocks // referenced to avoid unused-var lint
  })

  it("Redis GET failure → skip object (fail-safe), no deletion", async () => {
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getFails: true })
    const { _mocks: logMocks, ...logger } = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)
    expect(logMocks.error).toHaveBeenCalled()
    void redisMocks // referenced to avoid unused-var lint
  })

  it("S3 delete failure → Redis marker NOT cleared for that key", async () => {
    const firstSeenAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    // DeleteObjectCommand rejects for this key
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: MANAGED_KEY, LastModified: OLD_DATE }],
        IsTruncated: false,
      })
      .mockRejectedValueOnce(new Error("S3 delete failed"))
    const s3 = { send }
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getResult: firstSeenAt })
    const { _mocks: logMocks, ...logger } = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    const deleteCalls = send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(1)
    // Redis marker must NOT be cleared — the object wasn't actually deleted
    expect(redisMocks.del).not.toHaveBeenCalledWith(`body-img-candidate:${MANAGED_KEY}`)
    expect(logMocks.error).toHaveBeenCalled()
  })

  it("Redis SET failure on first-seen write → object skipped (no marker, no delete)", async () => {
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)
    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getResult: null, setFails: true })
    const { _mocks: logMocks, ...logger } = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)
    expect(logMocks.error).toHaveBeenCalled()
    void redisMocks // referenced to avoid unused-var lint
  })

  // ── 4a: Phase 1b — referenced-marker clearing ────────────────────────────

  it("clears Redis marker for referenced keys in Phase 1b", async () => {
    // DB returns a product whose body_html references MANAGED_KEY
    // Override: limitMock returns a row with bodyHtml that includes the managed key
    const S3_PUBLIC_URL = "https://r2.test"
    process.env["S3_PUBLIC_URL"] = S3_PUBLIC_URL
    const bodyHtml = `<img src="${S3_PUBLIC_URL}/${MANAGED_KEY}" alt="x" />`
    const rowWithRef = [{ id: PID, bodyHtml }]

    // The select chain for phase 1 pagination returns one page with a product referencing MANAGED_KEY,
    // then an empty page to end the loop. Re-wire limit to return rows then empty.
    const limitMock = vi.fn().mockResolvedValueOnce(rowWithRef).mockResolvedValue([])
    const stub = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit: limitMock }),
            limit: limitMock,
          }),
        }),
      }),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(stub)
      }),
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    }
    const refDb = stub as unknown as Parameters<typeof runBodyImageCleanup>[0]

    // S3 returns MANAGED_KEY as old enough
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)

    // Redis already has a marker for MANAGED_KEY
    const { _mocks: redisMocks, ...redis } = makeRedisMock({
      getResult: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    })
    const logger = makeLogger()

    await runBodyImageCleanup(refDb, redis as unknown as Redis, logger)

    // Phase 1b: should DEL the marker for the referenced key
    expect(redisMocks.del).toHaveBeenCalledWith(`body-img-candidate:${MANAGED_KEY}`)
    // Key is referenced → should NOT be deleted
    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)

    delete process.env["S3_PUBLIC_URL"]
  })

  // ── 4b: Final-reference rescue (finalCheckSaved path) ────────────────────

  it("rescues key from deletion when final DB check shows still referenced", async () => {
    const firstSeenAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const S3_PUBLIC_URL = "https://r2.test"
    process.env["S3_PUBLIC_URL"] = S3_PUBLIC_URL
    const bodyHtml = `<img src="${S3_PUBLIC_URL}/${MANAGED_KEY}" alt="x" />`

    // Phase 1 pagination returns empty (key not in referenced set initially)
    // Final-check DB query returns bodyHtml that references the key
    const limitMock = vi
      .fn()
      .mockResolvedValueOnce([]) // phase 1 pagination: empty page → reference set is empty
      .mockResolvedValueOnce([{ bodyHtml }]) // final-check query for the product
    const stub = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit: limitMock }),
            limit: limitMock,
          }),
        }),
      }),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(stub)
      }),
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    }
    const refDb = stub as unknown as Parameters<typeof runBodyImageCleanup>[0]

    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)

    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getResult: firstSeenAt })
    const { _mocks: logMocks, ...logger } = makeLogger()

    await runBodyImageCleanup(refDb, redis as unknown as Redis, logger)

    // Key should NOT be deleted — final check rescued it
    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)
    // No errors expected
    expect(logMocks.error).not.toHaveBeenCalled()
    void redisMocks // referenced to avoid unused-var lint

    delete process.env["S3_PUBLIC_URL"]
  })

  // ── 4c: Redis DEL failure after deletion ──────────────────────────────────

  it("logs error but continues when Redis DEL fails after successful delete", async () => {
    const firstSeenAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)

    // Redis: get returns old marker, del throws on post-delete cleanup
    const get = vi.fn().mockResolvedValue(firstSeenAt)
    const set = vi.fn().mockResolvedValue("OK")
    const del = vi.fn().mockRejectedValue(new Error("Redis DEL fail"))
    const redis = { get, set, del }

    const { _mocks: logMocks, ...logger } = makeLogger()
    const db = makeDb()

    // Should NOT throw even though redis.del fails
    await expect(
      runBodyImageCleanup(db, redis as unknown as Redis, logger),
    ).resolves.toBeUndefined()
    expect(logMocks.error).toHaveBeenCalled()
  })

  // ── 4d: Upload-log housekeeping ───────────────────────────────────────────

  it("prunes upload log rows older than 2 hours", async () => {
    // S3 returns no objects so the loop is a no-op; we only care about the housekeeping delete
    const s3 = makeS3Mock([[]])
    _setS3ForTesting(s3 as unknown as S3Client)

    const { ...redis } = makeRedisMock()
    const logger = makeLogger()

    const deleteMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    })
    const stub = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(stub)
      }),
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      delete: deleteMock,
    }
    const db = stub as unknown as Parameters<typeof runBodyImageCleanup>[0]

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    expect(deleteMock).toHaveBeenCalled()
  })

  // ── 4e: NaN timestamp — marker is RESET with fresh timestamp ────────────────

  it("resets NaN Redis marker with fresh timestamp and skips deletion (safe)", async () => {
    const s3 = makeS3Mock([[{ Key: MANAGED_KEY, LastModified: OLD_DATE }]])
    _setS3ForTesting(s3 as unknown as S3Client)

    // Redis returns a corrupted (non-ISO) marker value
    const { _mocks: redisMocks, ...redis } = makeRedisMock({ getResult: "not-a-number" })
    const { _mocks: logMocks, ...logger } = makeLogger()
    const db = makeDb()

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

    // Key must NOT be deleted — marker is reset and the key re-enters quarantine
    const deleteCalls = s3.send.mock.calls.filter(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand",
    )
    expect(deleteCalls).toHaveLength(0)
    // Should log an error about the invalid marker
    expect(logMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ key: MANAGED_KEY }),
      expect.stringContaining("invalid Redis marker"),
    )
    // Marker must be RESET via redis.set with the 72h TTL
    expect(redisMocks.set).toHaveBeenCalledWith(
      `body-img-candidate:${MANAGED_KEY}`,
      expect.any(String),
      "EX",
      72 * 60 * 60,
    )
  })
})
