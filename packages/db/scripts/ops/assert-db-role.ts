#!/usr/bin/env tsx

import { makeDb } from "../../src/index.js"

/**
 * Operator-only assertion: prove that the DATABASE_URL configured in a given
 * environment actually connects as the limited `bomy_app` role.
 *
 * Why this exists: `makeDb()` falls back DATABASE_APP_URL -> DATABASE_URL, and
 * an owner-role URL reads exactly the same rows as `bomy_app` while RLS
 * silently does not fire. A successful data read therefore proves nothing.
 *
 * SCOPE — this is a ROLE-IDENTITY gate, not an RLS audit. It proves which role
 * the connection authenticates as. Whether RLS is actually enforced further
 * depends on role attributes (e.g. BYPASSRLS), table ownership, and the
 * policies themselves. Catching the owner-role-in-DATABASE_URL mistake is the
 * specific failure this is for; do not cite it as proof that RLS is on.
 *
 * This reads DATABASE_URL *explicitly* and does NOT fall back to
 * DATABASE_APP_URL — the point is to audit the one variable the deployed app
 * will use, not whichever happens to be set.
 *
 * Intended invocation (secrets stay off disk and off the command line):
 *
 *   vercel env pull --environment=production   # NOT this — writes to disk
 *   vercel env run -e production -- pnpm --filter @bomy/db ops:db-role:assert
 *
 * Prints only the role name. Never prints the connection string.
 */

const EXPECTED_ROLE = "bomy_app"

async function main(): Promise<number> {
  const url = process.env["DATABASE_URL"]
  if (!url) {
    process.stderr.write(
      "Error: DATABASE_URL is not set.\n" +
        "This script deliberately does NOT fall back to DATABASE_APP_URL — it audits\n" +
        "the exact variable the deployed app will use.\n",
    )
    return 1
  }

  let dbClient
  try {
    dbClient = makeDb({ url })
  } catch (err) {
    process.stderr.write(
      `Error: failed to construct DB client: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 2
  }

  try {
    const rows = await dbClient.sql<{ role: string }[]>`SELECT current_user::text AS role`
    const role = rows[0]?.role

    if (role === undefined) {
      process.stderr.write("Error: SELECT current_user returned no rows.\n")
      return 2
    }

    process.stdout.write(`current_user: ${role}\n`)

    if (role !== EXPECTED_ROLE) {
      process.stderr.write(
        `\nFAIL: role-identity gate failed — expected '${EXPECTED_ROLE}', got '${role}'.\n` +
          "This connection is not the limited role. Do not cut over.\n",
      )
      return 3
    }

    process.stdout.write(`OK: expected limited role confirmed; role-identity gate passed.\n`)
    return 0
  } catch (err) {
    process.stderr.write(
      `Error: query failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 2
  } finally {
    await dbClient.close()
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 2
  })
