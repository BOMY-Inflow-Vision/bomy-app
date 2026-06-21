# Admin `/users` name + email edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `bomy_admin` edit a user's name + email on the admin `/users` page, and close the privilege-escalation hole by gating role edits to `bomy_admin` too.

**Architecture:** Shared no-Zod validator + a `withAdmin`-audited server action (`updateUserProfile`) with case-insensitive email dedupe; an inline Edit-toggle client component; `page.tsx` gates both the editor and the existing `RoleSelector` to `bomy_admin`. `updateUserRole` gains the same server-side `bomy_admin` gate.

**Tech Stack:** Next.js 15 App Router (admin), React 19 client component, Drizzle ORM, `withAdmin` RLS-bypass wrapper, Vitest (DB-backed integration + pure unit).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-21-admin-users-edit-design.md` is the source of truth.
- **Permission:** `updateUserProfile` AND `updateUserRole` are **`bomy_admin` only**, server-enforced (`throw new Error("Forbidden")` when `session.user.role !== "bomy_admin"`). UI hides controls for non-admins; the server gate is the real one.
- **Email:** `trim().toLowerCase()`, required, must match `EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/`. Dedupe is **case-insensitive** via `lower(email)`; the `users_email_unique_idx` (case-sensitive) is only a `23505` backstop.
- **`emailVerified` is left unchanged** on email edits (trusted admin edit) — assert it in a test.
- **All writes via `withAdmin`** (auto-writes `admin_bypass_audit`); reason `"admin update user profile"`.
- **Branch:** continue on `feat/admin-users-edit` (spec already committed there).
- **Validator return shape:** `{ ok: true; value } | { ok: false; errors }` (no Zod).

---

### Task 1: Profile validator (pure)

**Files:**

- Create: `apps/admin/src/app/users/user-profile-schema.ts`
- Test: `apps/admin/tests/users/user-profile-schema.test.ts`

**Interfaces:**

- Produces: `validateUserProfile(input: { name: string; email: string }): { ok: true; value: { name: string | null; email: string } } | { ok: false; errors: { name?: string; email?: string } }`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/tests/users/user-profile-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { validateUserProfile } from "../../src/app/users/user-profile-schema"

describe("validateUserProfile", () => {
  it("trims + lowercases email and nulls an empty name", () => {
    const r = validateUserProfile({ name: "   ", email: "  USER@Example.COM " })
    expect(r).toEqual({ ok: true, value: { name: null, email: "user@example.com" } })
  })

  it("keeps a trimmed name", () => {
    const r = validateUserProfile({ name: "  Aisyah ", email: "a@b.com" })
    expect(r.ok && r.value.name).toBe("Aisyah")
  })

  it("rejects an empty email", () => {
    expect(validateUserProfile({ name: "x", email: "   " })).toEqual({
      ok: false,
      errors: { email: "Email is required" },
    })
  })

  it("rejects a malformed email", () => {
    const r = validateUserProfile({ name: "x", email: "not-an-email" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.email).toMatch(/valid email/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bomy/admin test tests/users/user-profile-schema.test.ts --run`
Expected: FAIL — cannot resolve `../../src/app/users/user-profile-schema`.

- [ ] **Step 3: Write the validator**

Create `apps/admin/src/app/users/user-profile-schema.ts`:

```ts
const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/

export type UserProfileInput = { name: string; email: string }

export type UserProfileResult =
  | { ok: true; value: { name: string | null; email: string } }
  | { ok: false; errors: { name?: string; email?: string } }

export function validateUserProfile(input: UserProfileInput): UserProfileResult {
  const errors: { name?: string; email?: string } = {}

  const email = input.email.trim().toLowerCase()
  if (email === "") errors.email = "Email is required"
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address"

  const name = input.name.trim()

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name: name === "" ? null : name, email } }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bomy/admin test tests/users/user-profile-schema.test.ts --run`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/users/user-profile-schema.ts apps/admin/tests/users/user-profile-schema.test.ts
git commit -m "feat(admin): user profile validator (name + email)"
```

---

### Task 2: Server actions — `updateUserProfile` + gate `updateUserRole`

**Files:**

- Modify: `apps/admin/src/app/users/actions.ts`
- Test: `apps/admin/tests/users/actions.test.ts`

**Interfaces:**

- Consumes: `validateUserProfile` (Task 1).
- Produces:
  - `updateUserProfile(userId: string, input: { name: string; email: string }): Promise<{ ok: true } | { ok: false; errors: { name?: string; email?: string } }>`
  - `updateUserRole(userId: string, role: UserRole): Promise<void>` (now `bomy_admin`-gated)

- [ ] **Step 1: Write the failing integration test**

Create `apps/admin/tests/users/actions.test.ts`:

```ts
import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { updateUserProfile, updateUserRole } from "../../src/app/users/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

describe.skipIf(!shouldRun)("admin user actions", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let targetId: string
  let dupId: string
  const verifiedAt = new Date("2026-01-01T00:00:00.000Z")

  beforeAll(() => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    targetId = randomUUID()
    dupId = randomUUID()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test reset" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
      await tx.delete(schema.users).where(eq(schema.users.id, targetId))
      await tx.delete(schema.users).where(eq(schema.users.id, dupId))
      await tx.insert(schema.users).values([
        { id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" },
        {
          id: targetId,
          email: `target-${targetId}@test.bomy`,
          name: "Old Name",
          role: "buyer",
          emailVerified: verifiedAt,
        },
        { id: dupId, email: `Dup-${dupId}@Example.com`, role: "buyer" },
      ])
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx
        .delete(schema.adminBypassAudit)
        .where(eq(schema.adminBypassAudit.actorUserId, adminId))
      await tx.delete(schema.users).where(eq(schema.users.id, adminId))
      await tx.delete(schema.users).where(eq(schema.users.id, targetId))
      await tx.delete(schema.users).where(eq(schema.users.id, dupId))
    })
  })

  async function readUser(id: string) {
    return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read" }, async (tx) => {
      const [row] = await tx
        .select({
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
          emailVerified: schema.users.emailVerified,
        })
        .from(schema.users)
        .where(eq(schema.users.id, id))
      return row
    })
  }

  it("bomy_admin updates name + email, writes audit, leaves emailVerified unchanged", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })

    const res = await updateUserProfile(targetId, { name: "  New Name ", email: "NEW@Example.com" })
    expect(res).toEqual({ ok: true })

    const after = await readUser(targetId)
    expect(after?.name).toBe("New Name")
    expect(after?.email).toBe("new@example.com")
    expect(after?.emailVerified?.getTime()).toBe(verifiedAt.getTime())

    const audit = await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "test read audit" },
      (tx) =>
        tx
          .select({ id: schema.adminBypassAudit.id })
          .from(schema.adminBypassAudit)
          .where(
            and(
              eq(schema.adminBypassAudit.actorUserId, adminId),
              eq(schema.adminBypassAudit.reason, "admin update user profile"),
            ),
          ),
    )
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it("rejects a non-bomy_admin from updateUserProfile (Forbidden, no write)", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_ops" } })
    await expect(updateUserProfile(targetId, { name: "x", email: "x@y.com" })).rejects.toThrow(
      /Forbidden/,
    )
    expect((await readUser(targetId))?.name).toBe("Old Name")
  })

  it("blocks a non-bomy_admin from self-promoting via updateUserRole (Forbidden, no write)", async () => {
    // bomy_ops / bomy_finance must not be able to grant themselves bomy_admin.
    for (const role of ["bomy_ops", "bomy_finance"] as const) {
      mockAuth.mockResolvedValue({ user: { id: adminId, role } })
      await expect(updateUserRole(targetId, "bomy_admin")).rejects.toThrow(/Forbidden/)
      expect((await readUser(targetId))?.role).toBe("buyer")
    }
  })

  it("rejects a mixed-case duplicate email and leaves the target unchanged", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    // dupId already holds `Dup-...@Example.com`; updating target to the lowercased
    // variant must be rejected by the case-insensitive pre-check.
    const res = await updateUserProfile(targetId, {
      name: "Whatever",
      email: `dup-${dupId}@example.com`,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.email).toMatch(/already in use/i)

    const after = await readUser(targetId)
    expect(after?.name).toBe("Old Name")
    expect(after?.email).toBe(`target-${targetId}@test.bomy`)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/admin test tests/users/actions.test.ts --run`
Expected: FAIL — `updateUserProfile` is not exported / role gate missing.

- [ ] **Step 3: Implement the actions**

Replace the entire contents of `apps/admin/src/app/users/actions.ts` with:

```ts
"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin, type UserRole, USER_ROLES } from "@bomy/db"

import { auth } from "@/auth"
import { getDb } from "@/lib/db"
import { validateUserProfile } from "./user-profile-schema"

async function requireAdmin() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  if (session.user.role !== "bomy_admin") throw new Error("Forbidden")
  return session
}

export async function updateUserRole(userId: string, role: UserRole) {
  if (!USER_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`)
  const session = await requireAdmin()

  await withAdmin(
    getDb(),
    { userId: session.user.id, reason: "admin update user role" },
    async (tx) => {
      await tx
        .update(schema.users)
        .set({ role, updatedAt: new Date() })
        .where(eq(schema.users.id, userId))
    },
  )
  revalidatePath("/users")
}

export async function updateUserProfile(
  userId: string,
  input: { name: string; email: string },
): Promise<{ ok: true } | { ok: false; errors: { name?: string; email?: string } }> {
  const session = await requireAdmin()

  const parsed = validateUserProfile(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const { name, email } = parsed.value

  let result: { ok: true } | { ok: false; errors: { email?: string } }
  try {
    result = await withAdmin(
      getDb(),
      { userId: session.user.id, reason: "admin update user profile" },
      async (tx) => {
        const dup = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(and(sql`lower(${schema.users.email}) = ${email}`, ne(schema.users.id, userId)))
          .limit(1)
        if (dup.length > 0) return { ok: false, errors: { email: "Email already in use" } } as const

        await tx
          .update(schema.users)
          .set({ name, email, updatedAt: new Date() })
          .where(eq(schema.users.id, userId))
        return { ok: true } as const
      },
    )
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") {
      return { ok: false, errors: { email: "Email already in use" } }
    }
    throw e
  }

  if (result.ok) revalidatePath("/users")
  return result
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/admin test tests/users/actions.test.ts --run`
Expected: PASS (4/4).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @bomy/admin exec tsc --noEmit && pnpm --filter @bomy/admin exec eslint src/app/users/actions.ts tests/users/actions.test.ts --max-warnings 0`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/users/actions.ts apps/admin/tests/users/actions.test.ts
git commit -m "feat(admin): updateUserProfile + bomy_admin gate on role edits"
```

---

### Task 3: UI — inline editor + gate the page controls

**Files:**

- Create: `apps/admin/src/app/users/user-editor.tsx`
- Modify: `apps/admin/src/app/users/page.tsx`

**Interfaces:**

- Consumes: `updateUserProfile` (Task 2).
- Produces: `<UserEditor userId email name />` client component.

- [ ] **Step 1: Create the editor component**

Create `apps/admin/src/app/users/user-editor.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"

import { updateUserProfile } from "./actions"

export function UserEditor({
  userId,
  name,
  email,
}: {
  userId: string
  name: string | null
  email: string
}) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(name ?? "")
  const [emailVal, setEmailVal] = useState(email)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div>
        <div className="font-medium text-gray-900">{name ?? "—"}</div>
        <div className="text-xs text-gray-400">{email}</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 text-xs text-indigo-600 hover:underline"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={nameVal}
        onChange={(e) => setNameVal(e.target.value)}
        placeholder="Name"
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      />
      {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
      <input
        value={emailVal}
        onChange={(e) => setEmailVal(e.target.value)}
        placeholder="Email"
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      />
      {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErrors({})
            startTransition(async () => {
              const res = await updateUserProfile(userId, { name: nameVal, email: emailVal })
              if (res.ok) setEditing(false)
              else setErrors(res.errors)
            })
          }}
          className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setNameVal(name ?? "")
            setEmailVal(email)
            setErrors({})
          }}
          className="text-xs text-gray-500 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the page (gate to bomy_admin)**

In `apps/admin/src/app/users/page.tsx`, add the import near the existing `RoleSelector` import:

```tsx
import { UserEditor } from "./user-editor"
```

After `if (!session) return null`, add:

```tsx
const canEdit = session.user.role === "bomy_admin"
```

Replace the "User" cell block:

```tsx
<td className="px-4 py-3">
  <div className="font-medium text-gray-900">{row.name ?? "—"}</div>
  <div className="text-xs text-gray-400">{row.email}</div>
</td>
```

with:

```tsx
<td className="px-4 py-3">
  {canEdit ? (
    <UserEditor userId={row.id} name={row.name} email={row.email} />
  ) : (
    <>
      <div className="font-medium text-gray-900">{row.name ?? "—"}</div>
      <div className="text-xs text-gray-400">{row.email}</div>
    </>
  )}
</td>
```

Replace the "Change Role" cell block:

```tsx
<td className="px-4 py-3">
  <RoleSelector userId={row.id} currentRole={row.role} />
</td>
```

with:

```tsx
<td className="px-4 py-3">
  {canEdit ? (
    <RoleSelector userId={row.id} currentRole={row.role} />
  ) : (
    <span className="text-xs text-gray-300">—</span>
  )}
</td>
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @bomy/admin exec tsc --noEmit && pnpm --filter @bomy/admin exec eslint src/app/users/user-editor.tsx src/app/users/page.tsx --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/users/user-editor.tsx apps/admin/src/app/users/page.tsx
git commit -m "feat(admin): inline name/email editor on /users, gated to bomy_admin"
```

---

### Task 4: Full verification + PR

- [ ] **Step 1: Full admin suite + typecheck + lint**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/admin test --run`
Then: `pnpm --filter @bomy/admin exec tsc --noEmit && pnpm --filter @bomy/admin lint`
Expected: all green, 0 warnings.

- [ ] **Step 2: Visual smoke (optional but recommended)**

Start admin dev (`next dev -p 3002` with the local env block from `MACHINE_PICKUP.md`), sign in as a `bomy_admin`, open `/users`: Edit a row → change name + email → Save persists; bad email shows inline error; duplicate email shows "Email already in use". (A non-admin role sees read-only name/email and no role selector — verifiable by temporarily setting your role to `bomy_ops`.)

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/admin-users-edit
gh pr create --base main --head feat/admin-users-edit \
  --title "feat(admin): edit user name + email on /users (bomy_admin)" \
  --body "Adds bomy_admin-only inline name/email editing on /users (validator + withAdmin-audited action + Edit-toggle UI), and closes the escalation hole by gating updateUserRole to bomy_admin + hiding RoleSelector for non-admins. Case-insensitive email dedupe; emailVerified left unchanged. Spec/plan under docs/superpowers/. Model: Opus 4.8."
```

Expected: PR opens; CI green. Andy does not self-merge.

---

## Notes for the implementer

- `getDb()` is the lazy singleton from `@/lib/db`; the action uses it, the tests seed via a separate `makeDb({ url })` against the same DB.
- `withAdmin` auto-writes the `admin_bypass_audit` row; never write it by hand.
- The `lower(email)` pre-check is the real case-insensitive dedupe guard; the `23505` catch is only a race backstop.
- Buttons in the client component are `type="button"` (no surrounding form) to avoid accidental submits.
