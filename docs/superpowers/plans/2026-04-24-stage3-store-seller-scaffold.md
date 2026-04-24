# Stage 3 — Store / Seller Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three PRs: DB schema for stores/seller-inquiries (#15), an internal `apps/admin` Next.js ops tool (#14), and seller-facing pages in `apps/web` (#15).

**Architecture:** Both `apps/admin` and `apps/web` access `@bomy/db` directly via server actions — no new `apps/api` endpoints. `apps/admin` is a standalone Next.js 15 app on port 3002 with its own NextAuth instance (same session DB, `bomy_*` roles only). Seller inquiry form is a public page in `apps/web`; seller dashboard is gated to `seller_owner` role.

**Tech Stack:** Next.js 15, NextAuth v5, Drizzle ORM, Tailwind CSS, PostgreSQL 16, vitest (DB tests only)

---

## File Map

### PR #15 — `feat/store-schema` (packages/db only)

| Action | Path                                               |
| ------ | -------------------------------------------------- |
| Create | `packages/db/src/schema/seller_inquiries.ts`       |
| Modify | `packages/db/src/schema/stores.ts`                 |
| Modify | `packages/db/src/schema/index.ts`                  |
| Create | `packages/db/drizzle/0002_store_and_inquiries.sql` |
| Modify | `packages/db/scripts/migrate.mjs`                  |
| Modify | `packages/db/tests/rls.test.ts`                    |

### PR #14 — `feat/admin-scaffold` (new app)

| Action | Path                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| Create | `apps/admin/package.json`                                                    |
| Create | `apps/admin/tsconfig.json`                                                   |
| Create | `apps/admin/next.config.ts`                                                  |
| Create | `apps/admin/tailwind.config.ts`                                              |
| Create | `apps/admin/postcss.config.js`                                               |
| Create | `apps/admin/src/app/globals.css`                                             |
| Create | `apps/admin/src/auth.config.ts`                                              |
| Create | `apps/admin/src/auth.ts`                                                     |
| Create | `apps/admin/src/middleware.ts`                                               |
| Create | `apps/admin/src/lib/db.ts`                                                   |
| Create | `apps/admin/src/components/sidebar.tsx`                                      |
| Create | `apps/admin/src/app/layout.tsx`                                              |
| Create | `apps/admin/src/app/page.tsx`                                                |
| Create | `apps/admin/src/app/auth/sign-in/page.tsx`                                   |
| Create | `apps/admin/src/app/unauthorized/page.tsx`                                   |
| Create | `apps/admin/src/app/stores/page.tsx`                                         |
| Create | `apps/admin/src/app/stores/actions.ts`                                       |
| Create | `apps/admin/src/app/stores/new/page.tsx`                                     |
| Create | `apps/admin/src/app/users/page.tsx`                                          |
| Create | `apps/admin/src/app/users/role-selector.tsx`                                 |
| Create | `apps/admin/src/app/users/actions.ts`                                        |
| Create | `apps/admin/src/app/seller-inquiries/page.tsx`                               |
| Create | `apps/admin/src/app/seller-inquiries/actions.ts`                             |
| Create | `apps/admin/src/app/config/page.tsx`                                         |
| Create | `apps/admin/.env.local.example`                                              |
| Create | `apps/admin/.gitignore`                                                      |
| Modify | `pnpm-workspace.yaml` (already includes `apps/*`, no change needed — verify) |
| Modify | `turbo.json` (verify admin is included in pipeline)                          |

### PR #16 — `feat/store-web` (apps/web)

| Action | Path                                           |
| ------ | ---------------------------------------------- |
| Create | `apps/web/src/app/seller/apply/page.tsx`       |
| Create | `apps/web/src/app/seller/apply/actions.ts`     |
| Create | `apps/web/src/app/seller/dashboard/layout.tsx` |
| Create | `apps/web/src/app/seller/dashboard/page.tsx`   |
| Modify | `apps/web/src/auth.config.ts`                  |

---

## PR #15 — `feat/store-schema`

---

### Task 1: seller_inquiries schema + stores.description

**Files:**

- Create: `packages/db/src/schema/seller_inquiries.ts`
- Modify: `packages/db/src/schema/stores.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create seller_inquiries schema**

```typescript
// packages/db/src/schema/seller_inquiries.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

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

- [ ] **Step 2: Add description to stores schema**

In `packages/db/src/schema/stores.ts`, add `description` after `slug`:

```typescript
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { storeStatusEnum } from "./enums.js"
import { users } from "./users.js"

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: storeStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("stores_slug_unique_idx").on(t.slug),
    ownerIdx: index("stores_owner_idx").on(t.ownerId),
  }),
)
```

- [ ] **Step 3: Export sellerInquiries from schema index**

In `packages/db/src/schema/index.ts`, add the export:

```typescript
export * from "./auth.js"
export * from "./enums.js"
export * from "./ledger_entries.js"
export * from "./platform_config.js"
export * from "./seller_inquiries.js"
export * from "./stores.js"
export * from "./users.js"
```

---

### Task 2: Migration file + migrate.mjs entry

**Files:**

- Create: `packages/db/drizzle/0002_store_and_inquiries.sql`
- Modify: `packages/db/scripts/migrate.mjs`

- [ ] **Step 1: Create migration SQL**

```sql
-- packages/db/drizzle/0002_store_and_inquiries.sql
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

- [ ] **Step 2: Register migration in migrate.mjs**

Open `packages/db/scripts/migrate.mjs`. Find the `MIGRATIONS` array and add the new entry:

```javascript
const MIGRATIONS = [
  { name: "0000_initial_schema", file: join(__dirname, "../drizzle/0000_initial_schema.sql") },
  { name: "0001_auth_tables", file: join(__dirname, "../drizzle/0001_auth_tables.sql") },
  {
    name: "0002_store_and_inquiries",
    file: join(__dirname, "../drizzle/0002_store_and_inquiries.sql"),
  },
]
```

- [ ] **Step 3: Run typecheck to catch any import errors**

```bash
pnpm --filter @bomy/db typecheck
```

Expected: no errors.

---

### Task 3: Integration tests for new schema

**Files:**

- Modify: `packages/db/tests/rls.test.ts`

- [ ] **Step 1: Add `sellerInquiries` to the imports at the top of the test file**

In `packages/db/tests/rls.test.ts`, find the existing import line:

```typescript
import { stores, users } from "../src/schema/index.js"
```

Replace it with:

```typescript
import { sellerInquiries, stores, users } from "../src/schema/index.js"
```

- [ ] **Step 2: Append Stage 3 describe block at the bottom of the test file**

Add after the existing `describe("withTenant argument validation", ...)` block:

```typescript
describe.skipIf(!shouldRun)("Stage 3 schema", () => {
  let handle: Db

  beforeAll(() => {
    handle = makeDb({ url: DATABASE_URL as string })
  })

  afterAll(async () => {
    await handle.close()
  })

  it("inserts a seller inquiry and reads it back via withAdmin", async () => {
    const adminId = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "test seed user" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: adminId, email: `${adminId}@test.bomy`, role: "bomy_admin" })
    })

    const inquiryId = randomUUID()
    await withAdmin(handle.db, { userId: adminId, reason: "test insert inquiry" }, async (tx) => {
      await tx.insert(sellerInquiries).values({
        id: inquiryId,
        name: "Test Seller",
        email: "seller@test.bomy",
        contactNumber: "+60123456789",
        companyName: "Test Sdn Bhd",
        storeName: "Test Store",
      })
    })

    const rows = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read inquiry" },
      async (tx) =>
        tx
          .select()
          .from(sellerInquiries)
          .where(sql`${sellerInquiries.id} = ${inquiryId}`),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.storeName).toBe("Test Store")
    expect(rows[0]!.message).toBeNull()
  })

  it("creates a store with description and approves it, updating user role atomically", async () => {
    const adminId = randomUUID()
    const buyerId = randomUUID()
    const storeId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: buyerId, email: `buyer-${buyerId}@test.bomy`, role: "buyer" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: buyerId,
        name: "Desc Store",
        slug: `desc-${storeId}`,
        description: "A store with a description",
        status: "pending",
      })
    })

    // Verify description saved
    const [before] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read" },
      async (tx) =>
        tx
          .select({ description: stores.description, status: stores.status })
          .from(stores)
          .where(sql`${stores.id} = ${storeId}`),
    )
    expect(before!.description).toBe("A store with a description")
    expect(before!.status).toBe("pending")

    // Approve: update store status + user role atomically
    await withAdmin(handle.db, { userId: adminId, reason: "test approve store" }, async (tx) => {
      await tx
        .update(stores)
        .set({ status: "active", updatedAt: new Date() })
        .where(sql`${stores.id} = ${storeId}`)
      await tx
        .update(users)
        .set({ role: "seller_owner", updatedAt: new Date() })
        .where(sql`${users.id} = ${buyerId}`)
    })

    const [afterStore] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read after approve" },
      async (tx) =>
        tx
          .select({ status: stores.status })
          .from(stores)
          .where(sql`${stores.id} = ${storeId}`),
    )
    const [afterUser] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read user after approve" },
      async (tx) =>
        tx
          .select({ role: users.role })
          .from(users)
          .where(sql`${users.id} = ${buyerId}`),
    )
    expect(afterStore!.status).toBe("active")
    expect(afterUser!.role).toBe("seller_owner")
  })

  it("suspending a store does not change the user role", async () => {
    const adminId = randomUUID()
    const sellerId = randomUUID()
    const storeId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "test seed" }, async (tx) => {
      await tx.insert(users).values([
        { id: adminId, email: `admin2-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: sellerId, email: `seller-${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(stores).values({
        id: storeId,
        ownerId: sellerId,
        name: "Suspend Store",
        slug: `susp-${storeId}`,
        status: "active",
      })
    })

    await withAdmin(handle.db, { userId: adminId, reason: "test suspend" }, async (tx) => {
      await tx
        .update(stores)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(sql`${stores.id} = ${storeId}`)
    })

    const [afterUser] = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test read after suspend" },
      async (tx) =>
        tx
          .select({ role: users.role })
          .from(users)
          .where(sql`${users.id} = ${sellerId}`),
    )
    expect(afterUser!.role).toBe("seller_owner")
  })

  it("hard-deletes a seller inquiry", async () => {
    const adminId = randomUUID()
    const inquiryId = randomUUID()

    await withAdmin(handle.db, { userId: adminId, reason: "test seed admin" }, async (tx) => {
      await tx
        .insert(users)
        .values({ id: adminId, email: `admin3-${adminId}@test.bomy`, role: "bomy_admin" })
    })

    await withAdmin(handle.db, { userId: adminId, reason: "test insert" }, async (tx) => {
      await tx.insert(sellerInquiries).values({
        id: inquiryId,
        name: "Del Seller",
        email: "del@test.bomy",
        contactNumber: "+601",
        companyName: "Del Co",
        storeName: "Del Store",
      })
    })

    await withAdmin(handle.db, { userId: adminId, reason: "test delete" }, async (tx) => {
      await tx.delete(sellerInquiries).where(sql`${sellerInquiries.id} = ${inquiryId}`)
    })

    const rows = await withAdmin(
      handle.db,
      { userId: adminId, reason: "test confirm deleted" },
      async (tx) =>
        tx
          .select()
          .from(sellerInquiries)
          .where(sql`${sellerInquiries.id} = ${inquiryId}`),
    )
    expect(rows).toHaveLength(0)
  })
})
```

---

### Task 4: Run migration + verify tests + commit PR #15

- [ ] **Step 1: Run the migration**

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy node packages/db/scripts/migrate.mjs
```

Expected output: `[migrate] Applied: 0002_store_and_inquiries` (or similar — 0000 and 0001 are already applied).

- [ ] **Step 2: Run the tests**

```bash
BOMY_RLS_READY=1 DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db test
```

Expected: All tests pass (Stage 3 schema tests + existing RLS tests).

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/seller_inquiries.ts \
        packages/db/src/schema/stores.ts \
        packages/db/src/schema/index.ts \
        packages/db/drizzle/0002_store_and_inquiries.sql \
        packages/db/scripts/migrate.mjs \
        packages/db/tests/rls.test.ts
git commit -m "feat: add seller_inquiries table + stores.description (Stage 3 schema)"
```

---

## PR #14 — `feat/admin-scaffold`

---

### Task 5: Scaffold apps/admin package files

**Files:**

- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/next.config.ts`
- Create: `apps/admin/tailwind.config.ts`
- Create: `apps/admin/postcss.config.js`
- Create: `apps/admin/src/app/globals.css`
- Create: `apps/admin/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@bomy/admin",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "lint": "eslint src --max-warnings 0",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@auth/drizzle-adapter": "^1.7.4",
    "@bomy/db": "workspace:*",
    "clsx": "^2.1.1",
    "lucide-react": "^0.511.0",
    "next": "^15.3.1",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwind-merge": "^3.3.0"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/node": "^20.17.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "preserve",
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "allowJs": true,
    "incremental": true
  },
  "include": ["next-env.d.ts", "*.mjs", "*.js", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from "next"

const config: NextConfig = {
  output: "standalone",
}

export default config
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Create postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create globals.css**

```css
/* apps/admin/src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create .gitignore**

```
.next/
node_modules/
.env.local
*.tsbuildinfo
```

---

### Task 6: Auth wiring for apps/admin

**Files:**

- Create: `apps/admin/src/auth.config.ts`
- Create: `apps/admin/src/auth.ts`
- Create: `apps/admin/src/middleware.ts`
- Create: `apps/admin/.env.local.example`

- [ ] **Step 1: Create auth.config.ts**

Admin only supports Google sign-in. The `authorized` callback gates all routes to `bomy_*` roles.

```typescript
// apps/admin/src/auth.config.ts
import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

const BOMY_ROLES: UserRole[] = ["bomy_ops", "bomy_admin", "bomy_finance"]

export const authConfig = {
  providers: [Google],
  pages: { signIn: "/auth/sign-in" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (!auth?.user) return false
      const role = (auth.user as typeof auth.user & { role?: UserRole }).role
      if (!role || !BOMY_ROLES.includes(role)) {
        return Response.redirect(new URL("/unauthorized", nextUrl.origin))
      }
      return true
    },
  },
} satisfies NextAuthConfig
```

- [ ] **Step 2: Create auth.ts**

```typescript
// apps/admin/src/auth.ts
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import type { DefaultSession } from "next-auth"

import { makeAuthDb, schema, type UserRole } from "@bomy/db"

import { authConfig } from "./auth.config"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
    } & DefaultSession["user"]
  }
}

const { db } = makeAuthDb()

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  callbacks: {
    ...authConfig.callbacks,
    session({ session, user }) {
      const dbUser = user as typeof user & { role?: UserRole }
      session.user.id = user.id
      session.user.role = dbUser.role ?? "buyer"
      return session
    },
  },
})
```

- [ ] **Step 3: Create middleware.ts**

```typescript
// apps/admin/src/middleware.ts
import NextAuth from "next-auth"

import { authConfig } from "./auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
}
```

- [ ] **Step 4: Create route handler for NextAuth**

Create `apps/admin/src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

- [ ] **Step 5: Create .env.local.example**

```
AUTH_SECRET=<run: openssl rand -base64 32>
AUTH_GOOGLE_ID=<from Google Cloud Console — same OAuth app as apps/web>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy
```

---

### Task 7: Shared DB instance + sidebar component

**Files:**

- Create: `apps/admin/src/lib/db.ts`
- Create: `apps/admin/src/components/sidebar.tsx`

- [ ] **Step 1: Create shared DB instance**

```typescript
// apps/admin/src/lib/db.ts
import { makeDb } from "@bomy/db"

// Module-level singleton — one pool per process, shared across server actions.
export const { db } = makeDb()
```

- [ ] **Step 2: Create sidebar component**

The sidebar uses `usePathname()` for active-link highlighting, so it needs `"use client"`.

```typescript
// apps/admin/src/components/sidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV = [
  { href: "/stores", label: "Stores" },
  { href: "/users", label: "Users" },
  { href: "/seller-inquiries", label: "Seller Inquiries" },
  { href: "/config", label: "Config" },
]

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-44 flex-col bg-slate-800 text-sm text-slate-400">
      <div className="border-b border-slate-700 px-4 py-4 text-sm font-bold text-slate-100">
        BOMY Admin
      </div>
      <nav className="flex flex-1 flex-col py-2">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "border-l-2 border-indigo-500 bg-slate-700 px-4 py-2 text-slate-100"
                  : "px-4 py-2 hover:bg-slate-700 hover:text-slate-100"
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="truncate border-t border-slate-700 px-4 py-3 text-xs text-slate-500">
        {email}
      </div>
    </aside>
  )
}
```

---

### Task 8: Root layout + shell pages

**Files:**

- Create: `apps/admin/src/app/layout.tsx`
- Create: `apps/admin/src/app/page.tsx`
- Create: `apps/admin/src/app/auth/sign-in/page.tsx`
- Create: `apps/admin/src/app/unauthorized/page.tsx`

- [ ] **Step 1: Create root layout**

```typescript
// apps/admin/src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"

import { auth } from "@/auth"
import { Sidebar } from "@/components/sidebar"

export const metadata: Metadata = { title: "BOMY Admin" }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en">
      <body className="flex min-h-screen">
        {session?.user && <Sidebar email={session.user.email ?? ""} />}
        <main className="flex-1 bg-slate-50">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create root page (redirect to /stores)**

```typescript
// apps/admin/src/app/page.tsx
import { redirect } from "next/navigation"

export default function RootPage() {
  redirect("/stores")
}
```

- [ ] **Step 3: Create sign-in page**

```typescript
// apps/admin/src/app/auth/sign-in/page.tsx
import { signIn } from "@/auth"

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">BOMY Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in with your BOMY Google account</p>
        </div>
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/stores" })
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Create unauthorized page**

```typescript
// apps/admin/src/app/unauthorized/page.tsx
import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Access Denied</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your account does not have admin access to BOMY.
        </p>
        <Link href="/auth/sign-in" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Sign in with a different account
        </Link>
      </div>
    </main>
  )
}
```

---

### Task 9: Stores page + server actions

**Files:**

- Create: `apps/admin/src/app/stores/page.tsx`
- Create: `apps/admin/src/app/stores/actions.ts`
- Create: `apps/admin/src/app/stores/new/page.tsx`

- [ ] **Step 1: Create store server actions**

```typescript
// apps/admin/src/app/stores/actions.ts
"use server"

import { eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

async function getAdminId() {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  return session.user.id
}

export async function approveStore(storeId: string) {
  const adminId = await getAdminId()
  await withAdmin(db, { userId: adminId, reason: "admin approve store" }, async (tx) => {
    const [store] = await tx
      .select({ ownerId: schema.stores.ownerId })
      .from(schema.stores)
      .where(eq(schema.stores.id, storeId))
      .limit(1)
    if (!store) throw new Error("Store not found")
    await tx
      .update(schema.stores)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(schema.stores.id, storeId))
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, store.ownerId))
  })
  revalidatePath("/stores")
}

export async function suspendStore(storeId: string) {
  const adminId = await getAdminId()
  await withAdmin(db, { userId: adminId, reason: "admin suspend store" }, async (tx) => {
    await tx
      .update(schema.stores)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(schema.stores.id, storeId))
  })
  revalidatePath("/stores")
}

export async function createStore(formData: FormData) {
  const adminId = await getAdminId()
  const ownerEmail = formData.get("ownerEmail") as string
  const name = formData.get("name") as string
  const slug = formData.get("slug") as string
  const description = (formData.get("description") as string) || null

  if (!ownerEmail || !name || !slug) throw new Error("Missing required fields")

  await withAdmin(db, { userId: adminId, reason: "admin create store" }, async (tx) => {
    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail))
      .limit(1)
    if (!owner) throw new Error(`No user found with email: ${ownerEmail}`)

    await tx.insert(schema.stores).values({
      ownerId: owner.id,
      name,
      slug,
      description,
      status: "active",
    })
    // Promote user to seller_owner
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id))
  })
  revalidatePath("/stores")
}
```

- [ ] **Step 2: Create stores list page**

```typescript
// apps/admin/src/app/stores/page.tsx
import Link from "next/link"

import { schema, withAdmin } from "@bomy/db"
import { eq, sql } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { approveStore, suspendStore } from "./actions"

const STATUS_COLORS = {
  pending: "text-amber-600",
  active: "text-green-600",
  suspended: "text-red-600",
}

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session) return null
  const { status } = await searchParams

  const rows = await withAdmin(db, { userId: session.user.id, reason: "admin list stores" }, async (tx) => {
    const q = tx
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        slug: schema.stores.slug,
        status: schema.stores.status,
        ownerEmail: schema.users.email,
        ownerName: schema.users.name,
        createdAt: schema.stores.createdAt,
      })
      .from(schema.stores)
      .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
      .orderBy(sql`${schema.stores.createdAt} desc`)

    if (status && ["pending", "active", "suspended"].includes(status)) {
      return q.where(eq(schema.stores.status, status as "pending" | "active" | "suspended"))
    }
    return q
  })

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Stores</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 text-sm">
            {["", "pending", "active", "suspended"].map((s) => (
              <Link
                key={s}
                href={s ? `/stores?status=${s}` : "/stores"}
                className={`rounded px-3 py-1 ${status === s || (!status && !s) ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {s || "All"}
              </Link>
            ))}
          </div>
          <Link
            href="/stores/new"
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Create Store
          </Link>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.name}</div>
                  <div className="font-mono text-xs text-gray-400">{row.slug}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {row.ownerName ?? row.ownerEmail}
                </td>
                <td className={`px-4 py-3 font-medium ${STATUS_COLORS[row.status]}`}>
                  {row.status}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {row.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {row.status === "pending" && (
                    <form action={approveStore.bind(null, row.id)}>
                      <button type="submit" className="text-indigo-600 hover:underline">
                        Approve
                      </button>
                    </form>
                  )}
                  {row.status === "active" && (
                    <form action={suspendStore.bind(null, row.id)}>
                      <button type="submit" className="text-red-600 hover:underline">
                        Suspend
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No stores found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create stores/new page**

```typescript
// apps/admin/src/app/stores/new/page.tsx
import { redirect } from "next/navigation"

import { createStore } from "../actions"

export default function NewStorePage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Create Store</h1>
      <form
        action={async (formData) => {
          "use server"
          await createStore(formData)
          redirect("/stores")
        }}
        className="max-w-md space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Owner Email *
          </label>
          <input
            name="ownerEmail"
            type="email"
            required
            placeholder="seller@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">User must already exist in the system</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Store Name *</label>
          <input
            name="name"
            required
            placeholder="Kedai Maju"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Slug *</label>
          <input
            name="slug"
            required
            placeholder="kedai-maju"
            pattern="[a-z0-9-]{3,50}"
            title="Lowercase letters, numbers, hyphens only. 3–50 characters."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Brief description of the store"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Store
          </button>
          <a
            href="/stores"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
```

---

### Task 10: Users page + server actions

**Files:**

- Create: `apps/admin/src/app/users/page.tsx`
- Create: `apps/admin/src/app/users/actions.ts`

- [ ] **Step 1: Create user server actions**

```typescript
// apps/admin/src/app/users/actions.ts
"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin, type UserRole, USER_ROLES } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function updateUserRole(userId: string, role: UserRole) {
  if (!USER_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`)
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await withAdmin(db, { userId: session.user.id, reason: "admin update user role" }, async (tx) => {
    await tx
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
  })
  revalidatePath("/users")
}
```

- [ ] **Step 2: Create users list page**

```typescript
// apps/admin/src/app/users/page.tsx
import { schema, withAdmin, USER_ROLES } from "@bomy/db"
import { sql } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { RoleSelector } from "./role-selector"

const ROLE_COLORS: Record<string, string> = {
  buyer: "bg-gray-100 text-gray-700",
  seller_owner: "bg-green-100 text-green-700",
  seller_staff: "bg-emerald-100 text-emerald-700",
  bomy_ops: "bg-blue-100 text-blue-700",
  bomy_admin: "bg-indigo-100 text-indigo-700",
  bomy_finance: "bg-purple-100 text-purple-700",
}

export default async function UsersPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(db, { userId: session.user.id, reason: "admin list users" }, async (tx) =>
    tx
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(sql`${schema.users.createdAt} desc`)
  )

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Users</h1>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Change Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.name ?? "—"}</div>
                  <div className="text-xs text-gray-400">{row.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[row.role] ?? "bg-gray-100 text-gray-700"}`}>
                    {row.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {row.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <RoleSelector userId={row.id} currentRole={row.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create RoleSelector client component**

```typescript
// apps/admin/src/app/users/role-selector.tsx
"use client"

import { USER_ROLES, type UserRole } from "@bomy/db"
import { updateUserRole } from "./actions"

export function RoleSelector({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  return (
    <form
      action={async (formData) => {
        const role = formData.get("role") as UserRole
        await updateUserRole(userId, role)
      }}
      className="flex items-center gap-2"
    >
      <select
        name="role"
        defaultValue={currentRole}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      >
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <button type="submit" className="text-xs text-indigo-600 hover:underline">
        Save
      </button>
    </form>
  )
}
```

---

### Task 11: Seller inquiries page + server action

**Files:**

- Create: `apps/admin/src/app/seller-inquiries/page.tsx`
- Create: `apps/admin/src/app/seller-inquiries/actions.ts`

- [ ] **Step 1: Create delete server action**

```typescript
// apps/admin/src/app/seller-inquiries/actions.ts
"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function deleteInquiry(inquiryId: string) {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await withAdmin(
    db,
    { userId: session.user.id, reason: "admin delete seller inquiry" },
    async (tx) => {
      await tx.delete(schema.sellerInquiries).where(eq(schema.sellerInquiries.id, inquiryId))
    },
  )
  revalidatePath("/seller-inquiries")
}
```

- [ ] **Step 2: Create seller inquiries page**

```typescript
// apps/admin/src/app/seller-inquiries/page.tsx
import { schema, withAdmin } from "@bomy/db"
import { sql } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { deleteInquiry } from "./actions"

export default async function SellerInquiriesPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(db, { userId: session.user.id, reason: "admin list inquiries" }, async (tx) =>
    tx
      .select()
      .from(schema.sellerInquiries)
      .orderBy(sql`${schema.sellerInquiries.createdAt} desc`)
  )

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">
        Seller Inquiries
        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-sm font-normal text-gray-500">
          {rows.length}
        </span>
      </h1>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{row.name}</span>
                  <span className="text-sm text-gray-500">{row.email}</span>
                  <span className="text-sm text-gray-500">{row.contactNumber}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Company:</span> {row.companyName} ·{" "}
                  <span className="font-medium">Store:</span> {row.storeName}
                </div>
                {row.message && (
                  <div className="text-sm text-gray-500">{row.message}</div>
                )}
                <div className="text-xs text-gray-400">
                  {row.createdAt.toLocaleString()}
                </div>
              </div>
              <form action={deleteInquiry.bind(null, row.id)}>
                <button
                  type="submit"
                  className="text-sm text-red-500 hover:underline"
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-12 text-center text-gray-400">No inquiries yet.</div>
        )}
      </div>
    </div>
  )
}
```

---

### Task 12: Config page (read-only)

**Files:**

- Create: `apps/admin/src/app/config/page.tsx`

- [ ] **Step 1: Create config page**

```typescript
// apps/admin/src/app/config/page.tsx
import { schema, withAdmin } from "@bomy/db"
import { sql } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export default async function ConfigPage() {
  const session = await auth()
  if (!session) return null

  const rows = await withAdmin(db, { userId: session.user.id, reason: "admin view config" }, async (tx) =>
    tx
      .select({
        key: schema.platformConfig.key,
        value: schema.platformConfig.value,
        description: schema.platformConfig.description,
        updatedAt: schema.platformConfig.updatedAt,
      })
      .from(schema.platformConfig)
      .orderBy(sql`${schema.platformConfig.key} asc`)
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-lg font-semibold text-gray-900">Platform Config</h1>
        <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          Read-only
        </span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.key}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-900">
                  {JSON.stringify(row.value)}
                </td>
                <td className="px-4 py-3 text-gray-500">{row.description ?? "—"}</td>
                <td className="px-4 py-3 text-gray-400">
                  {row.updatedAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No config entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

### Task 13: Install deps + typecheck + commit PR #14

- [ ] **Step 1: Install dependencies**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && node ~/.cache/node/corepack/v1/pnpm/10.33.0/bin/pnpm.cjs install --frozen-lockfile=false
```

- [ ] **Step 2: Run typecheck on admin**

```bash
pnpm --filter @bomy/admin typecheck
```

Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 3: Verify dev server starts**

```bash
pnpm --filter @bomy/admin dev
```

Open http://localhost:3002. Should redirect to `/auth/sign-in`. Verify the Google sign-in button renders. Stop the server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: apps/admin scaffold — stores, users, inquiries, config (Stage 3)"
```

---

## PR #16 — `feat/store-web`

---

### Task 14: Seller apply page + server action

**Files:**

- Create: `apps/web/src/app/seller/apply/page.tsx`
- Create: `apps/web/src/app/seller/apply/actions.ts`

- [ ] **Step 1: Create server action for inquiry submission**

```typescript
// apps/web/src/app/seller/apply/actions.ts
"use server"

import { makeDb, schema } from "@bomy/db"

const { db } = makeDb()

export async function submitSellerInquiry(formData: FormData) {
  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim()
  const contactNumber = (formData.get("contactNumber") as string)?.trim()
  const companyName = (formData.get("companyName") as string)?.trim()
  const storeName = (formData.get("storeName") as string)?.trim()
  const message = ((formData.get("message") as string) ?? "").trim() || null

  if (!name || !email || !contactNumber || !companyName || !storeName) {
    throw new Error("All required fields must be filled in.")
  }

  await db.insert(schema.sellerInquiries).values({
    name,
    email,
    contactNumber,
    companyName,
    storeName,
    message,
  })

  // Email stub: log for now, wire SendGrid here when ready.
  console.log(`[seller-inquiry] New inquiry from ${name} <${email}> — store: ${storeName}`)
}
```

- [ ] **Step 2: Create apply page**

```typescript
// apps/web/src/app/seller/apply/page.tsx
"use client"

import { useActionState } from "react"
import { submitSellerInquiry } from "./actions"

const INITIAL_STATE = { success: false, error: "" }

function formAction(
  _prev: typeof INITIAL_STATE,
  formData: FormData,
): Promise<typeof INITIAL_STATE> {
  return submitSellerInquiry(formData)
    .then(() => ({ success: true, error: "" }))
    .catch((e: Error) => ({ success: false, error: e.message }))
}

export default function SellerApplyPage() {
  const [state, action, pending] = useActionState(formAction, INITIAL_STATE)

  if (state.success) {
    return (
      <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-16">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h1 className="text-lg font-semibold text-gray-900">Application Submitted!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Our team will review your application and contact you within 3–5 business days.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 pt-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Become a Seller</h1>
        <p className="mb-6 text-sm text-gray-500">
          Interested in selling on BOMY? Fill in the form and our team will be in touch.
        </p>

        {state.error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={action} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Full Name *</label>
            <input
              name="name"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contact Number *</label>
            <input
              name="contactNumber"
              type="tel"
              required
              placeholder="+60 12-345 6789"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Company Name *</label>
            <input
              name="companyName"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Store Name *</label>
            <input
              name="storeName"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Message <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              name="message"
              rows={3}
              placeholder="Tell us a bit about your products..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit Application"}
          </button>
        </form>
      </div>
    </main>
  )
}
```

---

### Task 15: Seller dashboard layout + page

**Files:**

- Create: `apps/web/src/app/seller/dashboard/layout.tsx`
- Create: `apps/web/src/app/seller/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard layout with sidebar nav**

```typescript
// apps/web/src/app/seller/dashboard/layout.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV = [
  { href: "/seller/dashboard", label: "Overview", exact: true },
  { href: "/seller/dashboard/products", label: "Products" },
  { href: "/seller/dashboard/orders", label: "Orders" },
  { href: "/seller/dashboard/settings", label: "Settings" },
]

export default function SellerDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 flex-col bg-slate-800 text-sm text-slate-400">
        <div className="border-b border-slate-700 px-5 py-4 text-sm font-bold text-slate-100">
          My Store
        </div>
        <nav className="flex flex-1 flex-col py-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const isComingSoon = item.href !== "/seller/dashboard"
            return (
              <Link
                key={item.href}
                href={isComingSoon ? "#" : item.href}
                className={
                  active
                    ? "border-l-2 border-indigo-500 bg-slate-700 px-5 py-2 text-slate-100"
                    : isComingSoon
                      ? "cursor-default px-5 py-2 text-slate-600"
                      : "px-5 py-2 hover:bg-slate-700 hover:text-slate-100"
                }
                onClick={isComingSoon ? (e) => e.preventDefault() : undefined}
              >
                {item.label}
                {isComingSoon && (
                  <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-indigo-400">
                    soon
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 bg-slate-50">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create dashboard overview page**

```typescript
// apps/web/src/app/seller/dashboard/page.tsx
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"

const { db } = makeDb()

export default async function SellerDashboardPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const store = await withTenant(
    db,
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const rows = await tx
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          status: schema.stores.status,
          description: schema.stores.description,
          createdAt: schema.stores.createdAt,
        })
        .from(schema.stores)
        .where(eq(schema.stores.ownerId, session.user.id))
        .limit(1)
      return rows[0] ?? null
    },
  )

  if (!store) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">No store found. Contact BOMY support.</p>
      </div>
    )
  }

  const STATUS_COLORS = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    suspended: "bg-red-100 text-red-700",
  }

  return (
    <div className="p-8">
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{store.name}</h1>
            <p className="mt-0.5 font-mono text-sm text-gray-400">/{store.slug}</p>
            {store.description && (
              <p className="mt-2 text-sm text-gray-600">{store.description}</p>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[store.status]}`}>
            {store.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Products", value: "—", note: "Coming soon" },
          { label: "Orders", value: "—", note: "Coming soon" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div className="text-3xl font-bold text-slate-300">{card.value}</div>
            <div className="mt-1 text-sm text-gray-500">{card.label}</div>
            <div className="mt-1 text-xs text-indigo-400">{card.note}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### Task 16: Update apps/web middleware for seller_owner gate

**Files:**

- Modify: `apps/web/src/auth.config.ts`

- [ ] **Step 1: Update the authorized callback**

Replace the entire `authConfig` in `apps/web/src/auth.config.ts`:

```typescript
import type { NextAuthConfig } from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

import type { UserRole } from "@bomy/db"

// Edge-safe config: no DB imports. Used by both middleware and the full auth.ts.
export const authConfig = {
  providers: [Google, Facebook],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const role = (auth?.user as (typeof auth.user & { role?: UserRole }) | undefined)?.role

      // Routes that require any login
      const requiresLogin =
        nextUrl.pathname.startsWith("/account") || nextUrl.pathname.startsWith("/dashboard")
      if (requiresLogin && !isLoggedIn) return false

      // Seller dashboard requires seller_owner role
      if (nextUrl.pathname.startsWith("/seller/dashboard")) {
        if (!isLoggedIn) return false
        if (role !== "seller_owner") {
          return Response.redirect(new URL("/account", nextUrl.origin))
        }
      }

      return true
    },
  },
} satisfies NextAuthConfig
```

---

### Task 17: Typecheck + verify + commit PR #16

- [ ] **Step 1: Typecheck apps/web**

```bash
pnpm --filter @bomy/web typecheck
```

Expected: no errors.

- [ ] **Step 2: Verify /seller/apply loads**

Start apps/web: `pnpm --filter @bomy/web dev`

Open http://localhost:3000/seller/apply. Verify the 6-field form renders without errors. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/seller/ \
        apps/web/src/auth.config.ts
git commit -m "feat: seller apply form + dashboard shell (Stage 3 seller web)"
```

---

## Session Log

After all three PRs are merged, write the Stage 3 session log to:
`log/2026-04-24_PR14-PR16_stage3-store-seller-scaffold.md`

Follow the same format as `log/2026-04-24_PR11-PR13_stage2-authentication.md`.

---

## Quick Reference — Run Commands

```bash
# Migrate DB (run once before starting PR #14 / #16 work)
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy node packages/db/scripts/migrate.mjs

# Run DB tests
BOMY_RLS_READY=1 DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db test

# Typecheck all packages
pnpm typecheck

# Dev servers
pnpm --filter @bomy/web dev       # http://localhost:3000
pnpm --filter @bomy/admin dev     # http://localhost:3002
pnpm --filter @bomy/api dev       # http://localhost:3001
```
