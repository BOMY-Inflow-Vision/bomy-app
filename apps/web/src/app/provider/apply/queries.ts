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
): Promise<{ status: "pending" | "approved" } | null> {
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
  // The inArray filter above guarantees only "pending"/"approved" rows come
  // back at runtime, but Drizzle's select() infers the column's full
  // inquiry_status enum ("pending" | "approved" | "rejected") regardless of
  // the WHERE clause — the type system can't see through the runtime filter,
  // so this assertion just makes the (already-true) narrowing explicit.
  return (rows[0] as { status: "pending" | "approved" } | undefined) ?? null
}
