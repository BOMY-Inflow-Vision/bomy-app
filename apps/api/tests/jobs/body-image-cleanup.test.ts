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

  it("R2 listing second-page failure → zero deletions (all-or-nothing guarantee)", async () => {
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

    await runBodyImageCleanup(db, redis as unknown as Redis, logger)

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
})
