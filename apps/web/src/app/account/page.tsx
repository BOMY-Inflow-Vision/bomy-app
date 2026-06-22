import { eq } from "drizzle-orm"
import Image from "next/image"
import { redirect } from "next/navigation"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"
import { AccountTabs } from "./account-tabs"
import { NameEditor } from "./name-editor"
import { SignOutButton } from "./sign-out-button"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export default async function AccountPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")

  const { user } = session

  // Read the name from the DB (not the JWT) so edits reflect immediately and
  // survive a refresh — the JWT name stays stale until the next sign-in.
  const name = await withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    const [row] = await tx
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
    return row?.name ?? null
  })

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <AccountTabs active="profile" />
        <div className="flex items-center gap-4">
          {user.image ? (
            <Image
              src={user.image}
              alt={name ?? "Avatar"}
              width={64}
              height={64}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl font-semibold text-gray-600">
              {(name ?? user.email ?? "?")[0]?.toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <NameEditor name={name} />
            <p className="truncate text-sm text-gray-500">{user.email}</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-gray-100 text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">User ID</dt>
            <dd className="font-mono text-xs text-gray-700">{user.id}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Role</dt>
            <dd className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {user.role}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
