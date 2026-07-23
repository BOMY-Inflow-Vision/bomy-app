"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { checkActionRateLimit, makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { ACTION_RATE_LIMITS, RATE_LIMIT_USER_MESSAGE } from "@/lib/rate-limits"

import { validateDisplayName } from "./profile-schema"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function updateDisplayName(
  rawName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  const userId = session.user.id

  const limit = await checkActionRateLimit(
    getDb(),
    { userId, userRole: session.user.role },
    "profile_edit",
    ACTION_RATE_LIMITS.profileEdit,
  )
  if (!limit.allowed) return { ok: false, error: RATE_LIMIT_USER_MESSAGE }

  const parsed = validateDisplayName(rawName)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  await withTenant(getDb(), { userId, userRole: session.user.role }, (tx) =>
    // Only `name` is ever written here — never role/email — so a user can't
    // self-escalate through the users_self_update RLS policy.
    tx
      .update(schema.users)
      .set({ name: parsed.value, updatedAt: new Date() })
      .where(eq(schema.users.id, userId)),
  )

  revalidatePath("/account")
  return { ok: true }
}
