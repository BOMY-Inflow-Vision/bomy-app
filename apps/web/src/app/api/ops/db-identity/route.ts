import { sql } from "drizzle-orm"
import type { NextRequest } from "next/server"

import { makeDb } from "@bomy/db"

// Never cached, never statically optimized. The route exists to prove the
// LIVE runtime DB connection identity — caching would defeat the purpose.
export const dynamic = "force-dynamic"

// Lazy singleton — initialized ONLY after the token check passes, so a
// missing or bad DATABASE_URL never turns an unauthorized request into
// a 500. The 404 contract holds even when the DB env is misconfigured.
let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function GET(req: NextRequest): Promise<Response> {
  // (1) env-check FIRST — if the gating env is unset the route is disabled
  const expected = process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"]
  if (!expected) return new Response(null, { status: 404 })

  // (2) header-match BEFORE any DB work
  const provided = req.headers.get("x-bomy-ops-token")
  if (!provided || provided !== expected) return new Response(null, { status: 404 })

  // (3) ONLY AFTER auth — lazy DB + identity query.
  // postgres-js execute() returns a RowList that is iterable as the rows
  // directly (not wrapped in { rows }). Cast at the boundary.
  const result = await getDb().execute(sql`SELECT current_user::text AS "user"`)
  const rows = result as unknown as Array<{ user: string }>
  return Response.json({ currentUser: rows[0]?.user ?? "" })
}
