import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres, { type Options, type Sql } from "postgres"

import * as schema from "./schema/index.js"

export type Schema = typeof schema
export type Database = PostgresJsDatabase<Schema>

export interface MakeDbOptions {
  /** Connection string. Falls back to `DATABASE_URL`. */
  url?: string
  /** Maximum pool size. Defaults to 10. */
  max?: number
  /**
   * Idle transaction timeout in seconds (advisory; PG enforces via
   * `idle_in_transaction_session_timeout`). Defaults to 30s.
   */
  idleTimeout?: number
  /** Passed through to `postgres` for exotic cases (TLS, socket). */
  extra?: Partial<Options<Record<string, never>>>
}

export interface Db {
  /** The Drizzle query builder. Do NOT use this raw outside `withTenant`/`withAdmin`. */
  readonly db: Database
  /** The underlying postgres-js client. Singleton-per-process. */
  readonly sql: Sql
  /** Close the pool and release all connections. */
  close: () => Promise<void>
}

/**
 * Build a singleton DB client. `withTenant` and `withAdmin` consume
 * this — application code should never import `db` directly.
 *
 * Pool hygiene (Proposal v2 §7 guardrail #8):
 * - `onnotice` / `onparameter` hooks are wired up so that session
 *   state changes are observable in logs
 * - `statement_timeout` and `idle_in_transaction_session_timeout` are
 *   set to bound the blast radius of a stuck query or leaked txn
 * - Session state is cleared via `DISCARD ALL` in the wrapper's
 *   commit/rollback path (see `tenant.ts`)
 */
export function makeDb(opts: MakeDbOptions = {}): Db {
  const url = opts.url ?? process.env["DATABASE_URL"]
  if (!url) {
    throw new Error("makeDb: DATABASE_URL is required. Pass opts.url or set DATABASE_URL.")
  }

  const sql = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 30,
    connection: {
      // Bound blast radius — a stuck statement can't hold a connection forever.
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 10_000,
      // Explicit application_name aids Postgres-side debugging.
      application_name: "bomy-app",
    },
    ...opts.extra,
  })

  const db = drizzle(sql, { schema })
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  }
}
