"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

import { auth, signOut, unstable_update } from "@/auth"
import { flashToast } from "@/lib/flash-toast-server"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export type AcceptConsentResult = { ok: false; error: string } | undefined

export async function acceptConsent(): Promise<AcceptConsentResult> {
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
  // Typed return instead of throwing: a Server Action's thrown-error message is
  // redacted in production, so the client would only ever see a generic crash.
  if (!version) {
    return {
      ok: false,
      error: "We couldn't record your consent. Please try again or contact support.",
    }
  }

  // Capture acceptance provenance for the PDPA audit trail. First x-forwarded-for
  // hop is the client; behind Vercel/Railway proxies the chain is appended right.
  const h = await headers()
  const acceptedIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null
  const acceptedUserAgent = h.get("user-agent") ?? null

  // Write two consent rows (tos + privacy) as the authenticated user (withTenant)
  await withTenant(db, { userId, userRole }, async (tx) => {
    await tx
      .insert(schema.userConsents)
      .values([
        { userId, document: "tos", version, acceptedIp, acceptedUserAgent },
        { userId, document: "privacy", version, acceptedIp, acceptedUserAgent },
      ])
      .onConflictDoNothing()
  })

  // Re-issue the JWT so the edge middleware sees the updated consentVersion
  // without requiring a sign-out. trigger="update" fires the jwt() callback
  // in auth.ts which stamps the new version.
  await unstable_update({ consentVersion: version } as Parameters<typeof unstable_update>[0])

  await flashToast("success", "Thanks — you're all set.")

  redirect("/")
}

export async function declineConsent(): Promise<void> {
  await signOut({ redirectTo: "/auth/sign-in?consent=declined" })
}
