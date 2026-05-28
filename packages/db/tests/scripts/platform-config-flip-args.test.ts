import { describe, expect, it } from "vitest"

import {
  parseArgs,
  parseValue,
  validateUuidShape,
  UsageError,
} from "../../scripts/ops/platform-config-flip-args.js"

describe("parseArgs", () => {
  const baseArgv = [
    "--key",
    "checkout_enabled",
    "--value",
    "true",
    "--actor",
    "11111111-1111-1111-1111-111111111111",
    "--reason",
    "smoke test",
  ]

  it("returns all four args when all are present", () => {
    expect(parseArgs(baseArgv)).toEqual({
      key: "checkout_enabled",
      value: "true",
      actor: "11111111-1111-1111-1111-111111111111",
      reason: "smoke test",
    })
  })

  it.each([
    ["--key", baseArgv.filter((_, i) => i !== 0 && i !== 1)],
    ["--value", baseArgv.filter((_, i) => i !== 2 && i !== 3)],
    ["--actor", baseArgv.filter((_, i) => i !== 4 && i !== 5)],
    ["--reason", baseArgv.filter((_, i) => i !== 6 && i !== 7)],
  ])("rejects when %s is missing", (missingArg, argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError)
    expect(() => parseArgs(argv)).toThrow(new RegExp(missingArg))
  })

  it("rejects unknown --flag arguments", () => {
    expect(() => parseArgs([...baseArgv, "--foo", "bar"])).toThrow(UsageError)
    expect(() => parseArgs([...baseArgv, "--foo", "bar"])).toThrow(/unknown argument '--foo'/)
  })

  it("rejects bare positional arguments", () => {
    expect(() => parseArgs([...baseArgv, "extra"])).toThrow(UsageError)
    expect(() => parseArgs([...baseArgv, "extra"])).toThrow(/unknown argument 'extra'/)
  })

  it("rejects duplicate flag (overwrite-silently bug)", () => {
    expect(() =>
      parseArgs([
        "--key",
        "checkout_enabled",
        "--key",
        "other_key",
        "--value",
        "true",
        "--actor",
        "11111111-1111-1111-1111-111111111111",
        "--reason",
        "smoke",
      ]),
    ).toThrow(UsageError)
    expect(() =>
      parseArgs([
        "--key",
        "checkout_enabled",
        "--key",
        "other_key",
        "--value",
        "true",
        "--actor",
        "11111111-1111-1111-1111-111111111111",
        "--reason",
        "smoke",
      ]),
    ).toThrow(/duplicate argument --key/)
  })

  it("rejects flag-shaped tokens used as values (--reason --foo bug)", () => {
    expect(() =>
      parseArgs([
        "--key",
        "checkout_enabled",
        "--value",
        "true",
        "--actor",
        "11111111-1111-1111-1111-111111111111",
        "--reason",
        "--dry-run",
      ]),
    ).toThrow(UsageError)
    expect(() =>
      parseArgs([
        "--key",
        "checkout_enabled",
        "--value",
        "true",
        "--actor",
        "11111111-1111-1111-1111-111111111111",
        "--reason",
        "--dry-run",
      ]),
    ).toThrow(/looks like a flag/)
  })
})

describe("parseValue", () => {
  it.each([
    ["true", true],
    ["false", false],
    ['"hello"', "hello"],
    ["123", 123],
    ['{"a":1}', { a: 1 }],
    ["null", null],
  ])("parses %s as valid JSON", (input, expected) => {
    expect(parseValue(input)).toEqual(expected)
  })

  it.each([["truee"], ["bare-string"], [""], ["{a:1}"]])("rejects %s as invalid JSON", (input) => {
    expect(() => parseValue(input)).toThrow(UsageError)
    expect(() => parseValue(input)).toThrow(/not valid JSON/)
  })
})

describe("validateUuidShape", () => {
  it.each([
    "11111111-1111-1111-1111-111111111111",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "00000000-0000-0000-0000-000000000001",
  ])("accepts %s", (uuid) => {
    expect(validateUuidShape(uuid)).toBe(true)
  })

  it.each(["abc", "11111111-1111-1111-1111", "not-a-uuid", "12345678901234567890", ""])(
    "rejects %s",
    (s) => {
      expect(validateUuidShape(s)).toBe(false)
    },
  )
})
