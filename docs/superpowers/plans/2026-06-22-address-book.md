# Saved Address Book — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let buyers save multiple MY shipping addresses (`/account/addresses`) and pick one at checkout instead of retyping, without changing the per-order address snapshot.

**Architecture:** New RLS owner-scoped `user_addresses` table; account CRUD via `withTenant` server actions guarded by a per-user advisory lock; checkout loads saved addresses and offers a selector; the chosen address still flows through `validateShippingAddress` into the existing `orders.shippingAddress` jsonb snapshot.

**Tech Stack:** Drizzle + Postgres RLS, Next.js 15 App Router (apps/web), `withTenant`, Vitest (DB-backed integration + unit).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-22-address-book-design.md` is the source of truth.
- **Invariant:** `orders.shippingAddress` stays a per-order jsonb snapshot written at checkout exactly as today — editing/deleting a saved address never alters historical orders. Do **not** change `initiateCheckout`'s contract.
- **MY-only:** reuse `validateShippingAddress` (`apps/web/src/lib/shipping-address-schema.ts`); `country = "MY"`, state ∈ `MY_STATES`.
- **One default per user:** partial unique index `(user_id) WHERE is_default`; `setDefault` validates the target (owner-scoped) **before** clearing defaults (no writes if absent).
- **Race safety:** every mutating action takes `pg_advisory_xact_lock(hashtext('address_book:' || <userId>::text))` first (mirrors checkout's buyer lock).
- **RLS:** `app.current_user_id()` helper, RESTRICTIVE default-deny + per-operation owner policies with `WITH CHECK` for INSERT/UPDATE; `GRANT SELECT, INSERT, UPDATE, DELETE ON user_addresses TO bomy_app`.
- **Cap:** max 20 saved addresses per user.
- **Branch:** continue on `feat/address-book` (spec already committed).

---

### Task 1: Schema + migration + RLS

**Files:**

- Create: `packages/db/src/schema/user_addresses.ts`
- Modify: `packages/db/src/schema/index.ts` (add `export * from "./user_addresses.js"`)
- Generate + edit: `packages/db/drizzle/0015_user_addresses.sql`
- Test: `apps/web/tests/account/addresses-rls.test.ts`

**Interfaces:**

- Produces: `schema.userAddresses` table with columns `id, userId, label, recipientName, phone, line1, line2, city, postcode, state, country, isDefault, createdAt, updatedAt`.

- [ ] **Step 1: Write the schema file**

Create `packages/db/src/schema/user_addresses.ts`:

```ts
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    postcode: text("postcode").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull().default("MY"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_addresses_user_idx").on(t.userId),
    oneDefault: uniqueIndex("user_addresses_one_default_idx")
      .on(t.userId)
      .where(sql`${t.isDefault}`),
  }),
)
```

Add the import at the top: `import { sql } from "drizzle-orm"`.

- [ ] **Step 2: Export from the schema index**

In `packages/db/src/schema/index.ts`, add (keep alphabetical-ish with the others):

```ts
export * from "./user_addresses.js"
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @bomy/db db:generate`
Expected: creates `packages/db/drizzle/0015_user_addresses.sql` with the `CREATE TABLE` + the two indexes.

- [ ] **Step 4: Append RLS + grants to the migration**

Edit `packages/db/drizzle/0015_user_addresses.sql`, append at the end (mirrors `0014_tos_consent.sql`):

```sql
ALTER TABLE "user_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_addresses" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY user_addresses_default_deny ON user_addresses
    AS RESTRICTIVE FOR ALL
    USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY user_addresses_self_select ON user_addresses
    FOR SELECT USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY user_addresses_self_insert ON user_addresses
    FOR INSERT WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY user_addresses_self_update ON user_addresses
    FOR UPDATE
    USING (user_id = app.current_user_id() OR app.is_admin_bypass())
    WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY user_addresses_self_delete ON user_addresses
    FOR DELETE USING (user_id = app.current_user_id() OR app.is_admin_bypass());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "user_addresses" TO bomy_app';
  END IF;
END $$;
```

- [ ] **Step 5: Apply locally + typecheck @bomy/db**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db migrate`
Then: `pnpm --filter @bomy/db exec tsc --noEmit`
Expected: migration applies clean; typecheck passes.

- [ ] **Step 6: Write the RLS test**

Create `apps/web/tests/account/addresses-rls.test.ts`:

```ts
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DB = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DB) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("user_addresses RLS", () => {
  let db: ReturnType<typeof makeDb>
  let alice: string
  let bob: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DB as string
    db = makeDb({ url: DB as string })
  })

  afterEach(async () => {
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, alice))
      await tx.delete(schema.users).where(eq(schema.users.id, bob))
    })
  })

  it("a user can only read their own addresses", async () => {
    alice = randomUUID()
    bob = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: alice, email: `alice-${alice}@test.bomy`, role: "buyer" },
        { id: bob, email: `bob-${bob}@test.bomy`, role: "buyer" },
      ])
      await tx.insert(schema.userAddresses).values({
        userId: bob,
        recipientName: "Bob",
        phone: "+60123456789",
        line1: "1 Jalan",
        city: "George Town",
        postcode: "10000",
        state: "Pulau Pinang",
      })
    })

    const rows = await withTenant(db.db, { userId: alice, userRole: "buyer" }, async (tx) =>
      tx.select().from(schema.userAddresses),
    )
    expect(rows).toHaveLength(0) // alice cannot see bob's address
  })
})
```

- [ ] **Step 7: Run the RLS test**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test tests/account/addresses-rls.test.ts --run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/user_addresses.ts packages/db/src/schema/index.ts packages/db/drizzle/0015_user_addresses.sql apps/web/tests/account/addresses-rls.test.ts
git commit -m "feat(db): user_addresses table + RLS (address book)"
```

---

### Task 2: Address-book validator wrapper

**Files:**

- Create: `apps/web/src/app/account/addresses/address-schema.ts`
- Test: `apps/web/tests/account/address-schema.test.ts`

**Interfaces:**

- Consumes: `validateShippingAddress`, `ShippingAddressInput` from `@/lib/shipping-address-schema`.
- Produces: `validateAddressBookEntry(input): { ok: true; value: AddressBookValue } | { ok: false; errors: AddressBookErrors }` where `AddressBookValue = ShippingAddressInput & { label: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/account/address-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { validateAddressBookEntry } from "../../src/app/account/addresses/address-schema"

const base = {
  name: "Aisyah",
  phone: "+60123456789",
  line1: "1 Jalan",
  line2: "",
  city: "George Town",
  postcode: "10000",
  state: "Pulau Pinang",
  country: "MY" as const,
}

describe("validateAddressBookEntry", () => {
  it("accepts a valid entry and trims an empty label to null", () => {
    const r = validateAddressBookEntry({ ...base, label: "  " })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.label).toBeNull()
  })

  it("keeps a trimmed label", () => {
    const r = validateAddressBookEntry({ ...base, label: "  Home " })
    expect(r.ok && r.value.label).toBe("Home")
  })

  it("rejects a too-long label", () => {
    const r = validateAddressBookEntry({ ...base, label: "x".repeat(41) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.label).toBeTruthy()
  })

  it("propagates address validation errors", () => {
    const r = validateAddressBookEntry({ ...base, label: null, postcode: "abc" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.postcode).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bomy/web test tests/account/address-schema.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the validator**

Create `apps/web/src/app/account/addresses/address-schema.ts`:

```ts
import {
  validateShippingAddress,
  type ShippingAddressErrors,
  type ShippingAddressInput,
} from "@/lib/shipping-address-schema"

export type AddressBookInput = { label: string | null } & ShippingAddressInput
export type AddressBookValue = { label: string | null } & ShippingAddressInput
export type AddressBookErrors = ShippingAddressErrors & { label?: string }

export type AddressBookResult =
  | { ok: true; value: AddressBookValue }
  | { ok: false; errors: AddressBookErrors }

const MAX_LABEL = 40

export function validateAddressBookEntry(input: AddressBookInput): AddressBookResult {
  const errors: AddressBookErrors = {}

  const label = (input.label ?? "").trim()
  if (label.length > MAX_LABEL) errors.label = `Label must be ${MAX_LABEL} characters or fewer`

  const address = validateShippingAddress(input)
  if (!address.ok) Object.assign(errors, address.errors)

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { ...(address.ok ? address.value : input), label: label === "" ? null : label },
  }
}
```

> Note: `address.ok` is true here (no errors), so `address.value` is defined; the ternary keeps TS happy.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bomy/web test tests/account/address-schema.test.ts --run`
Expected: PASS (4/4).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web exec eslint src/app/account/addresses/address-schema.ts tests/account/address-schema.test.ts --max-warnings 0`

```bash
git add apps/web/src/app/account/addresses/address-schema.ts apps/web/tests/account/address-schema.test.ts
git commit -m "feat(web): address-book validator (reuses shipping validator + label)"
```

---

### Task 3: Account actions (advisory-locked CRUD)

**Files:**

- Create: `apps/web/src/app/account/addresses/actions.ts`
- Test: `apps/web/tests/account/addresses-actions.test.ts`

**Interfaces:**

- Consumes: `validateAddressBookEntry` (Task 2), `schema.userAddresses` (Task 1).
- Produces (all `Promise<{ ok: true } | { ok: false; errors: AddressBookErrors & { form?: string } }>` except read):
  - `listAddresses(): Promise<Address[]>`
  - `addAddress(input: AddressBookInput)`
  - `updateAddress(addressId: string, input: AddressBookInput)`
  - `deleteAddress(addressId: string): Promise<{ ok: true }>`
  - `setDefault(addressId: string)`

- [ ] **Step 1: Write the failing integration test**

Create `apps/web/tests/account/addresses-actions.test.ts`:

```ts
import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import {
  addAddress,
  deleteAddress,
  listAddresses,
  setDefault,
} from "../../src/app/account/addresses/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DB = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DB) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock

const base = {
  name: "Aisyah",
  phone: "+60123456789",
  line1: "1 Jalan",
  line2: "",
  city: "George Town",
  postcode: "10000",
  state: "Pulau Pinang",
  country: "MY" as const,
}

describe.skipIf(!shouldRun)("address book actions", () => {
  let db: ReturnType<typeof makeDb>
  let alice: string
  let bob: string

  beforeAll(() => {
    process.env["DATABASE_URL"] = DB as string
    db = makeDb({ url: DB as string })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    alice = randomUUID()
    bob = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: alice, email: `alice-${alice}@test.bomy`, role: "buyer" },
        { id: bob, email: `bob-${bob}@test.bomy`, role: "buyer" },
      ])
    })
    mockAuth.mockResolvedValue({ user: { id: alice, role: "buyer" } })
  })

  afterEach(async () => {
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "cleanup" }, async (tx) => {
      await tx.delete(schema.users).where(eq(schema.users.id, alice))
      await tx.delete(schema.users).where(eq(schema.users.id, bob))
    })
  })

  it("first address auto-becomes default; second does not", async () => {
    expect(await addAddress({ ...base, label: "Home" })).toEqual({ ok: true })
    expect(await addAddress({ ...base, label: "Office", line1: "2 Jalan" })).toEqual({ ok: true })
    const rows = await listAddresses()
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1)
    expect(rows.find((r) => r.isDefault)?.label).toBe("Home")
  })

  it("enforces the 20-address cap", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await addAddress({ ...base, label: `A${i}`, line1: `${i} Jalan` })).toEqual({
        ok: true,
      })
    }
    const over = await addAddress({ ...base, label: "Too many", line1: "21 Jalan" })
    expect(over.ok).toBe(false)
  })

  it("setDefault on a nonexistent/other-user id does NOT clear the caller's default", async () => {
    await addAddress({ ...base, label: "Home" }) // becomes default
    // seed an address owned by bob
    const bobAddr = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "seed bob" }, async (tx) => {
      await tx.insert(schema.userAddresses).values({
        id: bobAddr,
        userId: bob,
        recipientName: "Bob",
        phone: "+60123456789",
        line1: "9 Jalan",
        city: "George Town",
        postcode: "10000",
        state: "Pulau Pinang",
      })
    })
    const res = await setDefault(bobAddr) // alice tries to default bob's row
    expect(res.ok).toBe(false)
    const rows = await listAddresses()
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1) // alice's default intact
    expect(rows.find((r) => r.isDefault)?.label).toBe("Home")
  })

  it("setDefault moves the default and keeps exactly one", async () => {
    await addAddress({ ...base, label: "Home" })
    await addAddress({ ...base, label: "Office", line1: "2 Jalan" })
    const rows = await listAddresses()
    const office = rows.find((r) => r.label === "Office")!
    expect(await setDefault(office.id)).toEqual({ ok: true })
    const after = await listAddresses()
    expect(after.filter((r) => r.isDefault)).toHaveLength(1)
    expect(after.find((r) => r.isDefault)?.label).toBe("Office")
  })

  it("deleting the default leaves no default", async () => {
    await addAddress({ ...base, label: "Home" })
    const [row] = await listAddresses()
    expect(await deleteAddress(row.id)).toEqual({ ok: true })
    expect(await listAddresses()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test tests/account/addresses-actions.test.ts --run`
Expected: FAIL — module/exports missing.

> Session is read via `auth()` from `@/auth` (matches `apps/web/src/app/checkout/actions.ts`); the test mocks `@/auth` and resolves `{ user: { id, role } }`.

- [ ] **Step 3: Write the actions**

Create `apps/web/src/app/account/addresses/actions.ts`:

```ts
"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"

import {
  validateAddressBookEntry,
  type AddressBookErrors,
  type AddressBookInput,
} from "./address-schema"

const MAX_ADDRESSES = 20
const PATH = "/account/addresses"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

type Result = { ok: true } | { ok: false; errors: AddressBookErrors & { form?: string } }
type Tx = Parameters<Parameters<typeof withTenant>[2]>[0]

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  return { id: session.user.id, role: session.user.role }
}

async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('address_book:' || ${userId}::text))`)
}

export async function listAddresses() {
  const user = await requireUser().catch(() => null)
  if (!user) return []
  return withTenant(getDb(), { userId: user.id, userRole: user.role }, (tx) =>
    tx
      .select()
      .from(schema.userAddresses)
      .where(eq(schema.userAddresses.userId, user.id))
      .orderBy(
        sql`${schema.userAddresses.isDefault} desc`,
        sql`${schema.userAddresses.updatedAt} desc`,
      ),
  )
}

export async function addAddress(input: AddressBookInput): Promise<Result> {
  const user = await requireUser()
  const parsed = validateAddressBookEntry(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const v = parsed.value

  return withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    const existing = await tx
      .select({ id: schema.userAddresses.id })
      .from(schema.userAddresses)
      .where(eq(schema.userAddresses.userId, user.id))
    if (existing.length >= MAX_ADDRESSES) {
      return { ok: false, errors: { form: `You can save up to ${MAX_ADDRESSES} addresses.` } }
    }
    await tx.insert(schema.userAddresses).values({
      userId: user.id,
      label: v.label,
      recipientName: v.name,
      phone: v.phone,
      line1: v.line1,
      line2: v.line2 ?? null,
      city: v.city,
      postcode: v.postcode,
      state: v.state,
      country: "MY",
      isDefault: existing.length === 0,
    })
    revalidatePath(PATH)
    return { ok: true }
  })
}

export async function updateAddress(addressId: string, input: AddressBookInput): Promise<Result> {
  const user = await requireUser()
  const parsed = validateAddressBookEntry(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const v = parsed.value

  return withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    const res = await tx
      .update(schema.userAddresses)
      .set({
        label: v.label,
        recipientName: v.name,
        phone: v.phone,
        line1: v.line1,
        line2: v.line2 ?? null,
        city: v.city,
        postcode: v.postcode,
        state: v.state,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.userAddresses.id, addressId), eq(schema.userAddresses.userId, user.id)))
      .returning({ id: schema.userAddresses.id })
    if (res.length === 0) return { ok: false, errors: { form: "Address not found" } }
    revalidatePath(PATH)
    return { ok: true }
  })
}

export async function deleteAddress(addressId: string): Promise<{ ok: true }> {
  const user = await requireUser()
  await withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    await tx
      .delete(schema.userAddresses)
      .where(and(eq(schema.userAddresses.id, addressId), eq(schema.userAddresses.userId, user.id)))
  })
  revalidatePath(PATH)
  return { ok: true }
}

export async function setDefault(addressId: string): Promise<Result> {
  const user = await requireUser()
  return withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    const [target] = await tx
      .select({ id: schema.userAddresses.id })
      .from(schema.userAddresses)
      .where(and(eq(schema.userAddresses.id, addressId), eq(schema.userAddresses.userId, user.id)))
    if (!target) return { ok: false, errors: { form: "Address not found" } }

    await tx
      .update(schema.userAddresses)
      .set({ isDefault: false })
      .where(and(eq(schema.userAddresses.userId, user.id), ne(schema.userAddresses.id, addressId)))
    await tx
      .update(schema.userAddresses)
      .set({ isDefault: true })
      .where(eq(schema.userAddresses.id, addressId))
    revalidatePath(PATH)
    return { ok: true }
  })
}
```

> Matches the existing web pattern exactly: `auth()` from `@/auth` + a per-file lazy `getDb()` (same as `apps/web/src/app/checkout/actions.ts`); `withTenant` ctx is `{ userId: session.user.id, userRole: session.user.role }`.

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test tests/account/addresses-actions.test.ts --run`
Expected: PASS (6/6).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web exec eslint src/app/account/addresses/actions.ts tests/account/addresses-actions.test.ts --max-warnings 0`

```bash
git add apps/web/src/app/account/addresses/actions.ts apps/web/tests/account/addresses-actions.test.ts
git commit -m "feat(web): advisory-locked address-book actions (CRUD + setDefault)"
```

---

### Task 4: Account UI — `/account/addresses` + tab

**Files:**

- Create: `apps/web/src/app/account/addresses/page.tsx`
- Create: `apps/web/src/app/account/addresses/address-manager.tsx` (client)
- Modify: `apps/web/src/app/account/account-tabs.tsx` (add `addresses` to the union + nav link)

**Interfaces:**

- Consumes: `listAddresses`, `addAddress`, `updateAddress`, `deleteAddress`, `setDefault` (Task 3).

- [ ] **Step 1: Add the tab**

In `apps/web/src/app/account/account-tabs.tsx`: change the `active` union to
`"profile" | "subscriptions" | "orders" | "addresses"` and add, after the Orders `<Link>`:

```tsx
<Link href="/account/addresses" className={active === "addresses" ? activeClass : inactiveClass}>
  Addresses
</Link>
```

- [ ] **Step 2: Build the page (server)**

Create `apps/web/src/app/account/addresses/page.tsx`:

```tsx
import { AccountTabs } from "../account-tabs"
import { listAddresses } from "./actions"
import { AddressManager } from "./address-manager"

export default async function AddressesPage() {
  const addresses = await listAddresses()
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <AccountTabs active="addresses" />
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Saved addresses</h1>
      <AddressManager
        initial={addresses.map((a) => ({
          id: a.id,
          label: a.label,
          name: a.recipientName,
          phone: a.phone,
          line1: a.line1,
          line2: a.line2 ?? "",
          city: a.city,
          postcode: a.postcode,
          state: a.state,
          isDefault: a.isDefault,
        }))}
      />
    </div>
  )
}
```

> Confirm the surrounding layout/padding matches the other account pages (open `apps/web/src/app/account/orders/page.tsx` and mirror its container classes) — adjust the wrapper `div` if they differ.

- [ ] **Step 3: Build the manager (client)**

Create `apps/web/src/app/account/addresses/address-manager.tsx` — a list of saved
addresses (label + formatted lines + "Default" badge), each with **Set default** /
**Delete** buttons, plus an **Add address** form that posts to `addAddress`. Use the
same field set as the checkout form (name, phone, line1, line2, city, postcode,
`MY_STATES` select) + a label input, and render `validateAddressBookEntry` /
server `errors` inline. Reuse `useState` + `useTransition` (mirror
`apps/admin/src/app/users/user-editor.tsx` for the toggle/pending/error pattern).

```tsx
"use client"

import { useState, useTransition } from "react"

import { MY_STATES } from "@/lib/shipping-address-schema"

import { addAddress, deleteAddress, setDefault } from "./actions"
import type { AddressBookErrors } from "./address-schema"

type Row = {
  id: string
  label: string | null
  name: string
  phone: string
  line1: string
  line2: string
  city: string
  postcode: string
  state: string
  isDefault: boolean
}

const EMPTY = {
  label: "",
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  state: "",
}

export function AddressManager({ initial }: { initial: Row[] }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<AddressBookErrors & { form?: string }>({})
  const [pending, startTransition] = useTransition()

  function field(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }))
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {initial.map((a) => (
          <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <div className="flex items-start justify-between">
              <div>
                {a.label && <div className="font-medium text-gray-900">{a.label}</div>}
                <div className="text-gray-700">
                  {a.name} · {a.phone}
                </div>
                <div className="text-gray-500">
                  {[a.line1, a.line2, a.city, a.postcode, a.state].filter(Boolean).join(", ")}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {a.isDefault ? (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    Default
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await setDefault(a.id)
                      })
                    }
                    className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                  >
                    Set default
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteAddress(a.id)
                    })
                  }
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {initial.length === 0 && <li className="text-sm text-gray-500">No saved addresses yet.</li>}
      </ul>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Add address
        </button>
      ) : (
        <form
          className="space-y-3 rounded-lg border border-gray-200 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            setErrors({})
            startTransition(async () => {
              const res = await addAddress({
                label: form.label,
                name: form.name,
                phone: form.phone,
                line1: form.line1,
                line2: form.line2,
                city: form.city,
                postcode: form.postcode,
                state: form.state,
                country: "MY",
              })
              if (res.ok) {
                setForm(EMPTY)
                setAdding(false)
              } else {
                setErrors(res.errors)
              }
            })
          }}
        >
          {errors.form && <p className="text-xs text-red-600">{errors.form}</p>}
          <Input
            placeholder="Label (e.g. Home)"
            value={form.label}
            onChange={field("label")}
            err={errors.label}
          />
          <Input
            placeholder="Full name"
            value={form.name}
            onChange={field("name")}
            err={errors.name}
          />
          <Input
            placeholder="Phone (+60…)"
            value={form.phone}
            onChange={field("phone")}
            err={errors.phone}
          />
          <Input
            placeholder="Address line 1"
            value={form.line1}
            onChange={field("line1")}
            err={errors.line1}
          />
          <Input
            placeholder="Address line 2 (optional)"
            value={form.line2}
            onChange={field("line2")}
            err={errors.line2}
          />
          <Input placeholder="City" value={form.city} onChange={field("city")} err={errors.city} />
          <Input
            placeholder="Postcode"
            value={form.postcode}
            onChange={field("postcode")}
            err={errors.postcode}
          />
          <select
            value={form.state}
            onChange={field("state")}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select state…</option>
            {MY_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {errors.state && <p className="text-xs text-red-600">{errors.state}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save address"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAdding(false)
                setErrors({})
                setForm(EMPTY)
              }}
              className="text-sm text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Input({ err, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { err?: string }) {
  return (
    <div>
      <input {...props} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}
```

> Scope note: edit-existing-address is deferred to keep this task focused on list + add + set-default + delete (the spec lists `updateAddress`, which ships in the action layer and is covered by tests; wiring an edit form into the manager is a small follow-up). If you prefer it now, add an edit toggle mirroring the add form.

- [ ] **Step 4: Typecheck + lint + commit**

Run: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web exec eslint src/app/account/addresses/page.tsx src/app/account/addresses/address-manager.tsx src/app/account/account-tabs.tsx --max-warnings 0`

```bash
git add apps/web/src/app/account/addresses/page.tsx apps/web/src/app/account/addresses/address-manager.tsx apps/web/src/app/account/account-tabs.tsx
git commit -m "feat(web): /account/addresses manager + nav tab"
```

---

### Task 5: Checkout integration — saved-address selector

**Files:**

- Modify: `apps/web/src/app/checkout/page.tsx` (load saved addresses, pass to form)
- Modify: `apps/web/src/app/checkout/_form.tsx` (selector + save-this-address)

**Interfaces:**

- Consumes: `listAddresses` (Task 3).

- [ ] **Step 1: Load saved addresses in the checkout page**

In `apps/web/src/app/checkout/page.tsx`, import `listAddresses` from
`../account/addresses/actions`, call it, and pass to the form:
`<CheckoutForm savedAddresses={await listAddresses()} />`. (Confirm the page is a
server component; it is — `_form.tsx` is the client island.)

- [ ] **Step 2: Add the selector + save toggle to `_form.tsx`**

Change `CheckoutForm` to accept a prop:

```tsx
type SavedAddress = {
  id: string
  label: string | null
  recipientName: string
  phone: string
  line1: string
  line2: string | null
  city: string
  postcode: string
  state: string
  isDefault: boolean
}

export function CheckoutForm({ savedAddresses = [] }: { savedAddresses?: SavedAddress[] }) {
```

Add state, defaulting the selection to the user's default address and prefilling
`address` from it:

```tsx
const defaultAddr = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0]
const [selectedId, setSelectedId] = useState<string>(defaultAddr?.id ?? "new")
const [saveToBook, setSaveToBook] = useState(false)

// prefill address state from a saved address on mount / selection change
useEffect(() => {
  if (selectedId === "new") return
  const a = savedAddresses.find((x) => x.id === selectedId)
  if (a) {
    setAddress({
      name: a.recipientName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? "",
      city: a.city,
      postcode: a.postcode,
      state: a.state,
      country: "MY",
    })
  }
}, [selectedId])
```

Render the selector above the manual fields (only when `savedAddresses.length > 0`):
a `<select>` listing each saved address (label or `line1`) plus a `"new"` →
"Use a new address" option. When `selectedId === "new"`, show the existing manual
fields and a **"Save this address to my book"** checkbox bound to `saveToBook`.

In `handleSubmit`, before `initiateCheckout`, when `selectedId === "new" && saveToBook`,
call `addAddress` first and block on failure (Bob R3):

```tsx
startTransition(async () => {
  if (selectedId === "new" && saveToBook) {
    const saved = await addAddress({ label: null, ...v.value })
    if (!saved.ok) {
      setTopError(saved.errors.form ?? "Couldn't save the address. Uncheck 'save' to continue.")
      return
    }
  }
  const r = await initiateCheckout({
    /* …unchanged… */
  })
  // …unchanged redirect / error handling…
})
```

Import `addAddress` from `../account/addresses/actions`. The `initiateCheckout`
call and its result handling stay **exactly as today** — `orders.shippingAddress`
is still the snapshot of `v.value`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web exec eslint src/app/checkout/_form.tsx src/app/checkout/page.tsx --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/checkout/_form.tsx apps/web/src/app/checkout/page.tsx
git commit -m "feat(web): checkout saved-address selector + save-this-address"
```

---

### Task 6: Full verification + PR

- [ ] **Step 1: Full web suite + typecheck + lint**

Run: `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test --run`
Then: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web lint`
Expected: all green, 0 warnings.

- [ ] **Step 2: Visual smoke**

Start web dev; sign in; `/account/addresses`: add two addresses (first is Default), set the other default, delete one. `/checkout` with items: the selector pre-selects the default and prefills; "use a new address" + "save this address" persists a new entry; completing checkout still writes the order address snapshot.

- [ ] **Step 3: Push + open PR (quiet queue — only after #64/#67 are merged)**

```bash
git push -u origin feat/address-book
gh pr create --base main --head feat/address-book \
  --title "feat(web): saved address book (account + checkout)" \
  --body "New user_addresses table (RLS owner-scoped, one-default partial unique index), advisory-locked CRUD actions, /account/addresses manager + tab, and a checkout saved-address selector. orders.shippingAddress snapshot unchanged. Spec/plan under docs/superpowers/. Model: Opus 4.8."
```

Expected: PR opens; CI green. Andy does not self-merge.

---

## Notes for the implementer

- **DB migration is real** — `0015_user_addresses.sql` must be applied to local Postgres (Step 1.5) before the integration tests pass, and to **prod Neon** (`pnpm --filter @bomy/db migrate`) at deploy time.
- Session + DB access follow `apps/web/src/app/checkout/actions.ts`: `auth()` from `@/auth` and a per-file lazy `getDb()` (there is no shared `@/lib/db` in `apps/web`).
- Keep `initiateCheckout` untouched. The address book is a convenience source only.
- The local test DB is polluted with leaked `@test.bomy` rows — use fresh per-test random ids (already done in the test fixtures).
