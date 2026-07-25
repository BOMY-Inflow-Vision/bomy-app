/**
 * Unit test: makeDb / makeAuthDb URL resolution order.
 *
 * Resolution rule (highest-priority first):
 *   1. opts.url
 *   2. DATABASE_APP_URL
 *   3. DATABASE_URL
 *   4. throws when all three are absent
 *
 * The postgres-js import is mocked so no live DB is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const capturedUrls: string[] = []

vi.mock("postgres", () => {
  const mockSql = {
    end: vi.fn(() => Promise.resolve()),
  }
  const factory = vi.fn((url: string) => {
    capturedUrls.push(url)
    return mockSql
  })
  return { default: factory }
})

// drizzle-orm/postgres-js also needs to be mocked so makeDb can return
// without a real connection object.
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({})),
}))

import { makeAuthDb, makeDb } from "../src/client.js"

describe("makeDb — URL resolution", () => {
  let savedAppUrl: string | undefined
  let savedUrl: string | undefined

  beforeEach(() => {
    savedAppUrl = process.env["DATABASE_APP_URL"]
    savedUrl = process.env["DATABASE_URL"]
    delete process.env["DATABASE_APP_URL"]
    delete process.env["DATABASE_URL"]
    capturedUrls.length = 0
  })

  afterEach(() => {
    if (savedAppUrl !== undefined) {
      process.env["DATABASE_APP_URL"] = savedAppUrl
    } else {
      delete process.env["DATABASE_APP_URL"]
    }
    if (savedUrl !== undefined) {
      process.env["DATABASE_URL"] = savedUrl
    } else {
      delete process.env["DATABASE_URL"]
    }
  })

  it("opts.url wins over both env vars", () => {
    process.env["DATABASE_APP_URL"] = "postgres://app-env/db"
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeDb({ url: "postgres://explicit/db" })
    expect(capturedUrls[0]).toBe("postgres://explicit/db")
  })

  it("DATABASE_APP_URL is used when opts.url is absent", () => {
    process.env["DATABASE_APP_URL"] = "postgres://app-env/db"
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeDb()
    expect(capturedUrls[0]).toBe("postgres://app-env/db")
  })

  it("DATABASE_URL is used when only it is set", () => {
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeDb()
    expect(capturedUrls[0]).toBe("postgres://owner-env/db")
  })

  it("throws when all three are absent", () => {
    expect(() => makeDb()).toThrow(
      /makeDb: a database URL is required\. Pass opts\.url or set DATABASE_APP_URL or DATABASE_URL\./,
    )
  })
})

describe("makeDb — owner-role fallback warning", () => {
  let savedAppUrl: string | undefined
  let savedUrl: string | undefined
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    savedAppUrl = process.env["DATABASE_APP_URL"]
    savedUrl = process.env["DATABASE_URL"]
    delete process.env["DATABASE_APP_URL"]
    delete process.env["DATABASE_URL"]
    capturedUrls.length = 0
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    if (savedAppUrl !== undefined) {
      process.env["DATABASE_APP_URL"] = savedAppUrl
    } else {
      delete process.env["DATABASE_APP_URL"]
    }
    if (savedUrl !== undefined) {
      process.env["DATABASE_URL"] = savedUrl
    } else {
      delete process.env["DATABASE_URL"]
    }
    warnSpy.mockRestore()
  })

  it("warns when falling back to DATABASE_URL (owner role)", () => {
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeDb()
    expect(warnSpy).toHaveBeenCalledWith(
      "makeDb: DATABASE_APP_URL unset — RLS may not be enforced under the owner role",
    )
  })

  it("does not warn when DATABASE_APP_URL is set", () => {
    process.env["DATABASE_APP_URL"] = "postgres://app-env/db"
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeDb()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("does not warn when opts.url is passed explicitly", () => {
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeDb({ url: "postgres://explicit/db" })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe("makeAuthDb — URL resolution", () => {
  let savedAppUrl: string | undefined
  let savedUrl: string | undefined

  beforeEach(() => {
    savedAppUrl = process.env["DATABASE_APP_URL"]
    savedUrl = process.env["DATABASE_URL"]
    delete process.env["DATABASE_APP_URL"]
    delete process.env["DATABASE_URL"]
    capturedUrls.length = 0
  })

  afterEach(() => {
    if (savedAppUrl !== undefined) {
      process.env["DATABASE_APP_URL"] = savedAppUrl
    } else {
      delete process.env["DATABASE_APP_URL"]
    }
    if (savedUrl !== undefined) {
      process.env["DATABASE_URL"] = savedUrl
    } else {
      delete process.env["DATABASE_URL"]
    }
  })

  it("opts.url wins over both env vars", () => {
    process.env["DATABASE_APP_URL"] = "postgres://app-env/db"
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeAuthDb({ url: "postgres://explicit/db" })
    expect(capturedUrls[0]).toBe("postgres://explicit/db")
  })

  it("DATABASE_APP_URL is used when opts.url is absent", () => {
    process.env["DATABASE_APP_URL"] = "postgres://app-env/db"
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeAuthDb()
    expect(capturedUrls[0]).toBe("postgres://app-env/db")
  })

  it("DATABASE_URL is used when only it is set", () => {
    process.env["DATABASE_URL"] = "postgres://owner-env/db"
    makeAuthDb()
    expect(capturedUrls[0]).toBe("postgres://owner-env/db")
  })

  it("throws when all three are absent", () => {
    expect(() => makeAuthDb()).toThrow(
      /makeAuthDb: a database URL is required\. Pass opts\.url or set DATABASE_APP_URL or DATABASE_URL\./,
    )
  })
})
