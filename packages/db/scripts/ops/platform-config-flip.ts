#!/usr/bin/env tsx

import { makeDb } from "../../src/index.js"

import {
  ActorError,
  DbError,
  KeyMissingError,
  UsageError,
  parseArgs,
} from "./platform-config-flip-args.js"
import { runPlatformConfigFlip } from "./platform-config-flip-core.js"

const USAGE = `Usage: pnpm ops:platform-config:set \\
  --key <existing platform_config key> \\
  --value <JSON value: true | false | "..." | 123 | {...}> \\
  --actor <admin user UUID> \\
  --reason "<short human-readable reason>"

All four arguments are required. The actor must exist and have role
in bomy_ops / bomy_admin / bomy_finance. The key must already exist
in platform_config — this script does not create new keys.`

async function main(): Promise<number> {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`Error: ${err.message}\n\n${USAGE}\n`)
      return 1
    }
    throw err
  }

  let dbClient
  try {
    dbClient = makeDb()
  } catch (err) {
    process.stderr.write(
      `Error: failed to construct DB client: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 2
  }

  try {
    const hostHint = process.env["DATABASE_URL"]?.replace(/:[^@/]+@/, ":***@") ?? "<unset>"
    process.stdout.write(`Connecting to ${hostHint}...\n`)

    const result = await runPlatformConfigFlip(dbClient.db, args)

    process.stdout.write(
      `Resolved actor: ${result.actor.email} (${result.actor.role}, uuid: ${result.actor.id})\n`,
    )
    process.stdout.write(`Key '${result.key}':\n`)
    process.stdout.write(`  before: ${JSON.stringify(result.oldValue)}\n`)
    process.stdout.write(`  after:  ${JSON.stringify(result.newValue)}\n`)
    process.stdout.write(
      `Platform config audit row: ${result.platformConfigAuditId} @ ${result.changedAt.toISOString()}\n`,
    )
    process.stdout.write(
      `Admin bypass audit: written by withAdmin for actor ${result.actor.id} reason "${args.reason}"\n`,
    )
    return 0
  } catch (err) {
    if (err instanceof UsageError || err instanceof ActorError || err instanceof KeyMissingError) {
      process.stderr.write(`Error: ${err.message}\n`)
      return 1
    }
    if (err instanceof DbError) {
      process.stderr.write(`Error: ${err.message}\n`)
      return 2
    }
    process.stderr.write(
      `Error: unexpected failure: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 2
  } finally {
    await dbClient.close()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(
      `Fatal: ${err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err)}\n`,
    )
    process.exit(2)
  })
