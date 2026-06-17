"use server"

import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

import { auth, signOut, unstable_update } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function acceptConsent(): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/sign-in")

  const userId = session.user.id
  const userRole = session.user.role
  const db = getDb()

  // Read current tos_version (platform_config has staff-only RLS → withAdmin)
  const rows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read tos_version for consent gate" },
    async (tx) =>
      tx
        .select({ value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, "tos_version"))
        .limit(1),
  )
  const version = typeof rows[0]?.value === "string" ? rows[0].value : null
  if (!version) throw new Error("tos_version not found in platform_config")

  // Write two consent rows (tos + privacy) as the authenticated user (withTenant)
  await withTenant(db, { userId, userRole }, async (tx) => {
    await tx
      .insert(schema.userConsents)
      .values([
        { userId, document: "tos", version },
        { userId, document: "privacy", version },
      ])
      .onConflictDoNothing()
  })

  // Re-issue the JWT so the edge middleware sees the updated consentVersion
  // without requiring a sign-out. trigger="update" fires the jwt() callback
  // in auth.ts which stamps the new version.
  await unstable_update({ consentVersion: version } as Parameters<typeof unstable_update>[0])

  redirect("/")
}

export async function declineConsent(): Promise<void> {
  await signOut({ redirectTo: "/auth/sign-in?consent=declined" })
}
