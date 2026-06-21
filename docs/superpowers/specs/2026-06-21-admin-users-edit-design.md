# Design — Admin `/users` name + email edit

**Date:** 2026-06-21
**Author:** Andy (Opus 4.8)
**Status:** Awaiting Charlie's review before implementation plan

## Overview

Add the ability for admins to edit a user's **name** and **email** on the admin
`/users` page (`apps/admin`). Today the page lists users and can change their
role (`RoleSelector` + `updateUserRole`) but exposes no way to edit name/email.
First item in the function-by-function admin pass.

## Decisions (locked during brainstorming)

1. **Fields:** edit `name` + `email`. (Not role — already exists; not image/password.)
2. **Email handling:** edit allowed, **validate format + dedupe** against the
   `users_email_unique_idx`. No re-verification (`emailVerified` left as-is).
   OAuth re-login is unaffected — Google links by `accounts` row (provider +
   providerAccountId), not by `users.email`.
3. **Permission:** **`bomy_admin` only** (server-enforced). Note: the existing
   `updateUserRole` has no per-role gate (any BOMY console role can change
   roles); this feature is intentionally stricter. Aligning role-edit permission
   is **out of scope** (possible follow-up).
4. **UI:** inline **Edit toggle** in the "User" cell — text by default; reveals
   name/email inputs + Save/Cancel for admins. Read-only for non-admin BOMY roles.

## Data / constraints

- `users.name` — `text`, nullable.
- `users.email` — `text NOT NULL`, **UNIQUE** (`users_email_unique_idx`).
- Writes go through `withAdmin` (auto-writes `admin_bypass_audit` row).

## Components

### 1. Validator — `apps/admin/src/app/users/user-profile-schema.ts`

Follows the codebase no-Zod convention (`{ ok: true, value } | { ok: false, errors }`),
imported by both the action and the client editor so messages stay in sync.

```
validateUserProfile({ name, email }):
  { ok: true; value: { name: string | null; email: string } }
  | { ok: false; errors: { name?: string; email?: string } }
```

- `email`: `trim().toLowerCase()`; required (non-empty); must match
  `EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/` (same as web).
- `name`: `trim()`; empty string → `null`.

### 2. Server action — `apps/admin/src/app/users/actions.ts` → `updateUserProfile`

```
updateUserProfile(userId: string, input: { name: string; email: string }):
  Promise<{ ok: true } | { ok: false; errors: { name?: string; email?: string } }>
```

- `const session = await auth()`; if `!session` throw `"Unauthorized"`.
- If `session.user.role !== "bomy_admin"` throw `"Forbidden"` (server gate — not just UI).
- `validateUserProfile(input)`; on failure return `{ ok: false, errors }`.
- `withAdmin(getDb(), { userId: session.user.id, reason: "admin update user profile" }, tx => …)`:
  - Pre-check: `SELECT id FROM users WHERE email = <new> AND id <> <userId>` → if found,
    return `{ ok: false, errors: { email: "Email already in use" } }`.
  - `UPDATE users SET name, email, updatedAt = now() WHERE id = userId`.
  - The `users_email_unique_idx` is the backstop: catch a unique violation
    (Postgres `23505`) and return the same `email` error rather than a 500.
- `revalidatePath("/users")`; return `{ ok: true }`.

### 3. UI — `apps/admin/src/app/users/user-editor.tsx` (client)

- Props: `{ userId, name, email }`. Local `useState` for edit-mode toggle + field values + error.
- Default: render name + email as text with a small **Edit** link.
- Edit mode: name input + email input + **Save**/**Cancel**; Save calls
  `updateUserProfile`, shows pending state, renders field errors from the result,
  collapses to text on `{ ok: true }`.
- `page.tsx`: compute `canEdit = session.user.role === "bomy_admin"`; render
  `<UserEditor …>` when `canEdit`, else the existing read-only name/email block.

## Testing

- **Validator unit tests** (`tests/users/user-profile-schema.test.ts`): valid input
  trims+lowercases email and nulls empty name; rejects empty email, bad format.
- **Action integration tests** (`tests/users/actions.test.ts`, DB env): `bomy_admin`
  updates name+email (row changes; `admin_bypass_audit` row written); non-`bomy_admin`
  session → throws Forbidden, no write; duplicate email → `{ ok: false, errors.email }`,
  no write. Mirrors existing admin action-test patterns.
- `pnpm --filter @bomy/admin typecheck` + `lint` clean.

## Out of scope

- Editing role (exists), avatar/image, password (OAuth-only).
- Aligning `updateUserRole` permission to `bomy_admin`.
- Bulk edit, search/pagination on `/users`.
