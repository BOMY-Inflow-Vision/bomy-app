import { makeDb } from "@bomy/db"

// Module-level singleton — one pool per process, shared across server actions.
export const { db } = makeDb()
