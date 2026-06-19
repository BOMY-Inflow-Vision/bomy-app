import { makeDb } from "@bomy/db"

// Lazy singleton — makeDb() throws if DATABASE_URL is absent.
// Next.js evaluates page modules during `next build` to analyse routes;
// deferring to first use prevents build-time failures when DATABASE_URL is
// a runtime-only env var (Railway/Docker or cold Vercel builds).
let _client: ReturnType<typeof makeDb> | null = null

export function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}
