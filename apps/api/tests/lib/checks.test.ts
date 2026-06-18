import { describe, expect, it } from "vitest"

import { resolvePostgresEndpoint, resolveRedisEndpoint } from "../../src/lib/checks.js"

describe("readiness endpoint resolution", () => {
  it("derives Postgres host and port from DATABASE_APP_URL", () => {
    expect(
      resolvePostgresEndpoint({
        DATABASE_APP_URL: "postgresql://user:pass@neon.example.com:5433/bomy?sslmode=require",
      }),
    ).toEqual({ host: "neon.example.com", port: 5433 })
  })

  it("falls back to DATABASE_URL for Postgres and default port", () => {
    expect(
      resolvePostgresEndpoint({
        DATABASE_URL: "postgresql://user:pass@neon.example.com/bomy?sslmode=require",
      }),
    ).toEqual({ host: "neon.example.com", port: 5432 })
  })

  it("derives Redis host and port from REDIS_URL", () => {
    expect(
      resolveRedisEndpoint({
        REDIS_URL: "redis://default:secret@redis.railway.internal:6380",
      }),
    ).toEqual({ host: "redis.railway.internal", port: 6380 })
  })

  it("preserves host env fallback for local probes", () => {
    expect(
      resolveRedisEndpoint({
        REDIS_HOST: "localhost",
        REDIS_PORT: "6378",
      }),
    ).toEqual({ host: "localhost", port: 6378 })
  })
})
