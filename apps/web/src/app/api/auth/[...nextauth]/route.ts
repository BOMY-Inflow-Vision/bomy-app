import { handlers } from "@/auth"

// Auth routes must never be statically generated — they handle CSRF tokens,
// OAuth callbacks and DB queries that only make sense at request time.
export const dynamic = "force-dynamic"

export const { GET, POST } = handlers
