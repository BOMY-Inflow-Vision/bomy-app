import { makeDb } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null

// Lazy singleton — defers DB connection to first call so modules importing
// this file can be loaded without DATABASE_URL set (e.g. during test collection).
export function getDb(): ReturnType<typeof makeDb>["db"] {
  if (!_client) _client = makeDb()
  return _client.db
}
