import { and, eq, inArray } from "drizzle-orm"

import { makeDb, schema, withTenant, type UserRole } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function getActiveServiceCategories(
  userId: string,
  userRole: UserRole,
): Promise<Array<{ id: string; name: string }>> {
  return withTenant(getDb(), { userId, userRole }, (tx) =>
    tx
      .select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name })
      .from(schema.serviceCategories)
      .where(eq(schema.serviceCategories.isActive, true))
      .orderBy(schema.serviceCategories.sortOrder),
  )
}

export async function getMyOpenApplication(
  userId: string,
  userRole: UserRole,
): Promise<{ status: "pending" | "approved" | "rejected" } | null> {
  const rows = await withTenant(getDb(), { userId, userRole }, (tx) =>
    tx
      .select({ status: schema.serviceProviderApplications.status })
      .from(schema.serviceProviderApplications)
      .where(
        and(
          eq(schema.serviceProviderApplications.applicantUserId, userId),
          inArray(schema.serviceProviderApplications.status, ["pending", "approved"]),
        ),
      )
      .limit(1),
  )
  return rows[0] ?? null
}
