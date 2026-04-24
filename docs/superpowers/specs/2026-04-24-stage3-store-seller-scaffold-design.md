# Stage 3 — Store / Seller Scaffold Design Spec

**Date:** 2026-04-24
**Author:** Andy (Claude Sonnet 4.6)
**Status:** Approved

---

## Overview

Stage 3 builds the seller-facing side of BOMY. It introduces the seller inquiry flow (replacing any automated buyer→seller conversion), the `apps/admin` internal ops tool, and the seller dashboard shell. No automated role promotion — BOMY ops manually vets sellers and creates stores via the admin panel.

---

## Decisions Made During Brainstorming

| Decision                                                  | Detail                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No buyer→seller conversion in-app                         | Sellers apply via a contact form; BOMY team vets offline and contacts them                                                                                                     |
| `apps/admin` is a standalone Next.js app                  | Separate from `apps/web`, own NextAuth instance, same session DB                                                                                                               |
| Admin auth: shared session DB, own NextAuth instance      | Same `AUTH_SECRET` + `DATABASE_URL`, role check in middleware gates to `bomy_*` roles                                                                                          |
| Admin layout: dark sidebar                                | Four nav items: Stores, Users, Seller Inquiries, Config                                                                                                                        |
| Admin creates stores on behalf of sellers                 | Admin-created stores start `active` (skip pending queue)                                                                                                                       |
| Seller dashboard: nav shell with coming-soon placeholders | Gated to `seller_owner` role; Products/Orders greyed out                                                                                                                       |
| Seller inquiry table: hard delete                         | No soft delete — ops deletes when no longer needed                                                                                                                             |
| Email on inquiry: stub for Stage 3                        | Logged server-side; SendGrid wired when ready                                                                                                                                  |
| Store form extensibility                                  | `stores` table stays lean; new fields are nullable columns via migration                                                                                                       |
| PR order: #15 → #14 → #16                                 | DB schema first, then admin, then seller web — enables E2E test in single dev session                                                                                          |
| Data access pattern                                       | Both `apps/admin` and `apps/web` access `@bomy/db` directly via server actions — no HTTP calls to `apps/api`. Consistent with how `apps/web` already handles auth and session. |

---

## PR Plan

### PR #15 — `feat/store-schema`

**packages/db changes only** — no API changes in this PR. Both `apps/admin` and `apps/web` access the DB directly via server actions; `apps/api` is not involved in Stage 3 data flows.

- `src/schema/seller_inquiries.ts` — new table (see schema below)
- `src/schema/stores.ts` — add `description: text("description")` (nullable)
- `src/schema/index.ts` — export `seller_inquiries`
- `drizzle/0002_store_and_inquiries.sql` — migration (see below)
- `scripts/migrate.mjs` — add `0002_store_and_inquiries` entry

---

### PR #14 — `feat/admin-scaffold`

**New app: `apps/admin`**

- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`
- `src/auth.config.ts` — Edge-safe config, Google provider, sign-in page `/auth/sign-in`, authorized callback gates to `bomy_*` roles
- `src/auth.ts` — full NextAuth config with DrizzleAdapter (same session DB)
- `src/middleware.ts` — protects all routes, redirects non-`bomy_*` to `/unauthorized`
- `src/app/layout.tsx` — root layout with dark sidebar nav
- `src/app/page.tsx` — redirects to `/stores`
- `src/app/auth/sign-in/page.tsx` — Google sign-in button
- `src/app/unauthorized/page.tsx` — "You don't have access" page
- `src/app/stores/page.tsx` — store list with status filter, Approve/Suspend actions, Create Store modal
- `src/app/users/page.tsx` — user list with role badges, Edit Role per row
- `src/app/seller-inquiries/page.tsx` — inquiry list with all fields, Delete button per row
- `src/app/config/page.tsx` — read-only platform_config key/value table
- `.env.local.example` — `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`

**pnpm-workspace.yaml** — add `apps/admin`

---

### PR #16 — `feat/store-web`

**apps/web changes:**

- `src/app/seller/apply/page.tsx` — "Become a Seller" public form (6 fields + optional message)
- `src/app/seller/apply/actions.ts` — server action: `makeDb()` → direct INSERT into `seller_inquiries` (no RLS on this table)
- `src/app/seller/dashboard/page.tsx` — seller dashboard shell, gated to `seller_owner`
- `src/app/seller/dashboard/layout.tsx` — dark sidebar nav (Overview, Products, Orders, Settings)
- `src/middleware.ts` — add `/seller/dashboard/**` to protected paths; redirect non-`seller_owner` to `/account`

---

## Schema

### `seller_inquiries` table

```ts
export const sellerInquiries = pgTable("seller_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  contactNumber: text("contact_number").notNull(),
  companyName: text("company_name").notNull(),
  storeName: text("store_name").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

No RLS — accessed exclusively via `withAdmin`.

### `stores` table (updated)

Add one nullable column:

```ts
description: text("description"),
```

### Migration `0002_store_and_inquiries.sql`

```sql
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "description" text;

CREATE TABLE IF NOT EXISTS "seller_inquiries" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"           text        NOT NULL,
  "email"          text        NOT NULL,
  "contact_number" text        NOT NULL,
  "company_name"   text        NOT NULL,
  "store_name"     text        NOT NULL,
  "message"        text,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
```

---

## Data Access Pattern

No new `apps/api` endpoints in Stage 3. All data access goes through `@bomy/db` directly in server actions and server components — consistent with how `apps/web` already works.

| App                                             | Mechanism                                             | DB wrapper                   |
| ----------------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| `apps/admin` server actions                     | `auth()` → `withAdmin(db, { userId, reason }, fn)`    | Requires `bomy_*` session    |
| `apps/web` `/seller/apply` server action        | `makeDb()` → direct INSERT                            | No RLS on `seller_inquiries` |
| `apps/web` `/seller/dashboard` server component | `auth()` → `withTenant(db, { userId, userRole }, fn)` | Scoped to `seller_owner`     |

`apps/api` endpoints for stores/users/config will be added in a later stage when mobile or external integrations need them.

---

## apps/admin Auth Design

- Own `auth.config.ts` (Edge-safe, Google provider, sign-in page `/auth/sign-in`)
- Own `auth.ts` (DrizzleAdapter pointing at same Postgres DB + `AUTH_SECRET`)
- Middleware `authorized` callback: returns `false` (redirect to sign-in) if not authenticated; redirects to `/unauthorized` if authenticated but role is not `bomy_ops | bomy_admin | bomy_finance`
- Runs on port 3002 in local dev (`package.json` dev script: `next dev -p 3002`)

---

## apps/web Middleware Update

Add two protected paths to `src/middleware.ts` `authorized` callback:

- `/seller/dashboard/**` — requires `seller_owner` role; redirect others to `/account`
- `/seller/apply` stays **public** (no auth required)

---

## Error Handling

| Scenario                                         | Response                    |
| ------------------------------------------------ | --------------------------- |
| Missing required fields on inquiry form          | `422 Unprocessable Entity`  |
| Slug conflict on store creation                  | `409 Conflict`              |
| Store not found                                  | `404 Not Found`             |
| Invalid role value                               | `400 Bad Request`           |
| Unauthenticated visit to `apps/admin`            | Redirect to `/auth/sign-in` |
| Authenticated non-`bomy_*` visit to `apps/admin` | Redirect to `/unauthorized` |
| `seller_owner` page visited by non-seller        | Redirect to `/account`      |
| `apps/admin` visited by non-`bomy_*` user        | Redirect to `/unauthorized` |

---

## Testing

New vitest integration tests in `packages/db` (same pattern as existing RLS tests):

- `seller_inquiries` insert — happy path, verify row persists
- `stores` insert + description — happy path, verify nullable description
- Admin approve store — verify `stores.status = active` + `users.role = seller_owner` in same transaction
- Admin suspend store — verify role unchanged
- Admin update user role — happy path + invalid role rejected by DB enum

No E2E tests at Stage 3.

---

## Local Dev

```sh
# apps/admin runs on port 3002
cd apps/admin && pnpm dev   # or from root: pnpm --filter @bomy/admin dev

# apps/web still on 3000, apps/api on 3001
```

Set `apps/admin/.env.local`:

```
AUTH_SECRET=<same as apps/web>
AUTH_GOOGLE_ID=<same Google OAuth credentials>
AUTH_GOOGLE_SECRET=<same>
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy
```

---

## What's Next — Stage 4

Stage 4: Product catalogue — sellers can list products.

- Products schema (packages/db)
- Product CRUD in apps/api
- Product listing in apps/web + seller product management in apps/admin
