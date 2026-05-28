const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class UsageError extends Error {
  override readonly name = "UsageError"
}

export class ActorError extends Error {
  override readonly name = "ActorError"
}

export class KeyMissingError extends Error {
  override readonly name = "KeyMissingError"
}

export class DbError extends Error {
  override readonly name = "DbError"
}

export interface Args {
  key: string
  value: string
  actor: string
  reason: string
}

const KNOWN_FLAGS = new Set(["--key", "--value", "--actor", "--reason"])

export function parseArgs(argv: readonly string[]): Args {
  const out: Partial<Args> = {}

  let i = 0
  while (i < argv.length) {
    const token = argv[i]!
    if (!KNOWN_FLAGS.has(token)) {
      throw new UsageError(`unknown argument '${token}'.`)
    }
    const fieldName = token.slice(2) as keyof Args
    if (out[fieldName] !== undefined) {
      throw new UsageError(`duplicate argument ${token}.`)
    }
    const value = argv[i + 1]
    if (value === undefined) {
      throw new UsageError(`missing value for ${token}.`)
    }
    // Reject any token starting with `--` as a value (catches `--reason --foo`
    // and the like — flag-shaped tokens should never be argument values).
    if (value.startsWith("--")) {
      throw new UsageError(`missing value for ${token}: next token '${value}' looks like a flag.`)
    }
    out[fieldName] = value
    i += 2
  }

  for (const flag of KNOWN_FLAGS) {
    const field = flag.slice(2) as keyof Args
    if (out[field] === undefined) {
      throw new UsageError(`missing required ${flag}.`)
    }
  }

  return out as Args
}

export function parseValue(input: string): unknown {
  if (input.length === 0) {
    throw new UsageError(`--value '' is not valid JSON.`)
  }
  try {
    return JSON.parse(input)
  } catch {
    throw new UsageError(`--value '${input}' is not valid JSON.`)
  }
}

export function validateUuidShape(s: string): boolean {
  return UUID_RE.test(s)
}
