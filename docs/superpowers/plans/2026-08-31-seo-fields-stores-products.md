# SEO Fields for Stores and Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `metaTitle`/`metaDescription`/`ogImageUrl` SEO fields to `stores` and `products`, editable by seller (their own store/products) and admin (any), and render them on the public store/product pages.

**Architecture:** Three nullable columns added to each of two existing tables via a hand-written migration (no RLS changes — existing owner/admin UPDATE policies already cover new columns on the same row). A shared field-map validator in `packages/shared` is reused by both apps. Seller edit paths extend two existing forms/actions; admin gets a first-ever product surface and first-ever store detail page, both scoped to SEO editing only. Public pages gain `generateMetadata` reading the new fields with fallback to existing name/excerpt/description.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Drizzle ORM, Postgres, Vitest, `@bomy/db` tenant wrappers.

**Spec:** `docs/superpowers/specs/2026-08-31-seo-fields-stores-products-design.md`

## Global Constraints

- Categories (`categories`, `store_categories`) are explicitly out of scope — do not touch either table or their admin UI.
- Every new/extended admin action that writes SEO fields must allowlist exactly `metaTitle`, `metaDescription`, `ogImageUrl` — never becomes a general `updateStore`/`updateProduct`.
- No new RLS policies. If any task's real behavior contradicts the "existing owner/admin UPDATE policies already cover new columns" assumption, stop and flag it — don't add a policy unilaterally.
- Field rules (enforced in `packages/shared/src/seo.ts`, mirrored as DB `CHECK` constraints): `metaTitle` ≤ 70 chars; `metaDescription` ≤ 160 chars; `ogImageUrl` empty string → `null`, otherwise must be an absolute URL with protocol `http:` or `https:`, ≤ 2048 chars.
- `ogImageUrl` is a plain URL text field — no upload pipeline, no image fetching/proxying.
- The seller store SEO action mirrors the existing active-store gate (`status = 'active'`) exactly — a seller cannot edit SEO on a suspended/pending store; admin has no such gate.

---

## PR 1: Schema + shared validator + seller UI

### Task 1: Add SEO columns to `stores` and `products`

**Files:**

- Modify: `packages/db/src/schema/stores.ts`
- Modify: `packages/db/src/schema/products.ts`
- Create: `packages/db/drizzle/0030_seo_fields.sql`
- Modify: `packages/db/scripts/migrate.mjs`

**Interfaces:**

- Produces: `schema.stores.metaTitle`, `schema.stores.metaDescription`, `schema.stores.ogImageUrl`, and the same three on `schema.products` — all `text`, nullable. Every later task in this plan reads/writes these via `schema.stores.metaTitle` etc.

- [ ] **Step 1: Add the three columns + checks to `stores.ts`**

Edit `packages/db/src/schema/stores.ts`. Insert after the `videoId` column (before `createdAt`):

```ts
    // SEO metadata (migration 0030) — all optional, seller/admin editable.
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImageUrl: text("og_image_url"),
```

And add three entries to the `(t) => ({ ... })` config object, after `videoIdChk`:

```ts
    metaTitleLengthChk: check(
      "stores_meta_title_length_chk",
      sql`${t.metaTitle} IS NULL OR length(${t.metaTitle}) <= 70`,
    ),
    metaDescriptionLengthChk: check(
      "stores_meta_description_length_chk",
      sql`${t.metaDescription} IS NULL OR length(${t.metaDescription}) <= 160`,
    ),
    ogImageUrlChk: check(
      "stores_og_image_url_chk",
      sql`${t.ogImageUrl} IS NULL OR (length(${t.ogImageUrl}) <= 2048 AND ${t.ogImageUrl} ~ '^https?://')`,
    ),
```

`check` and `sql` are already imported in this file — no import changes needed.

- [ ] **Step 2: Add the three columns + checks to `products.ts`**

Edit `packages/db/src/schema/products.ts`. First, update the import block at the top to add `check` and `sql`:

```ts
import { sql } from "drizzle-orm"
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
```

Insert the three columns after `bodyRevision` (before `createdAt`):

```ts
    // SEO metadata (migration 0030) — all optional, seller/admin editable.
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImageUrl: text("og_image_url"),
```

Add three entries to the `(t) => ({ ... })` config object, after `searchVectorGin`:

```ts
    metaTitleLengthChk: check(
      "products_meta_title_length_chk",
      sql`${t.metaTitle} IS NULL OR length(${t.metaTitle}) <= 70`,
    ),
    metaDescriptionLengthChk: check(
      "products_meta_description_length_chk",
      sql`${t.metaDescription} IS NULL OR length(${t.metaDescription}) <= 160`,
    ),
    ogImageUrlChk: check(
      "products_og_image_url_chk",
      sql`${t.ogImageUrl} IS NULL OR (length(${t.ogImageUrl}) <= 2048 AND ${t.ogImageUrl} ~ '^https?://')`,
    ),
```

- [ ] **Step 3: Write the migration SQL**

Create `packages/db/drizzle/0030_seo_fields.sql`:

```sql
-- Migration 0030: SEO fields (meta title/description/OG image) for stores and products.
-- Additive only. No RLS policy or bomy_app grant changes needed — existing row-level
-- policies (stores_owner_update, products_seller_update) and table-level grants already
-- cover any column, including new ones (same precedent as migration 0028).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS meta_title text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS meta_description text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS og_image_url text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_meta_title_length_chk
    CHECK (meta_title IS NULL OR length(meta_title) <= 70);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_meta_description_length_chk
    CHECK (meta_description IS NULL OR length(meta_description) <= 160);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_og_image_url_chk
    CHECK (og_image_url IS NULL OR (length(og_image_url) <= 2048 AND og_image_url ~ '^https?://'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title text;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description text;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS og_image_url text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_meta_title_length_chk
    CHECK (meta_title IS NULL OR length(meta_title) <= 70);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_meta_description_length_chk
    CHECK (meta_description IS NULL OR length(meta_description) <= 160);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_og_image_url_chk
    CHECK (og_image_url IS NULL OR (length(og_image_url) <= 2048 AND og_image_url ~ '^https?://'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Register the migration in `migrate.mjs`**

This repo's migration runner (`packages/db/scripts/migrate.mjs`) is NOT drizzle-kit — it's a hand-maintained `MIGRATIONS` array tracked in a `_bomy_migrations` table. Edit `packages/db/scripts/migrate.mjs`, adding a new entry after the `0029_categories_public_active_product_ref` entry (which ends around line 158):

```js
  {
    name: "0030_seo_fields",
    file: join(__dirname, "../drizzle/0030_seo_fields.sql"),
  },
```

- [ ] **Step 5: Apply the migration locally and verify**

Run: `docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d` (if not already running), then:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db migrate
```

Expected output includes `apply 0030_seo_fields ... done`. Verify columns exist:

```bash
docker exec -it $(docker compose -f infra/docker/compose.yml --env-file infra/docker/.env ps -q postgres) \
  psql -U bomy -d bomy -c "\d stores" -c "\d products"
```

Expected: `meta_title`, `meta_description`, `og_image_url` columns listed on both tables, with the three check constraints each.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck` — expect no errors (the new columns are additive, nothing references them yet).

```bash
git add packages/db/src/schema/stores.ts packages/db/src/schema/products.ts \
  packages/db/drizzle/0030_seo_fields.sql packages/db/scripts/migrate.mjs
git commit -m "feat(db): add SEO fields (meta title/description/OG image) to stores and products"
```

---

### Task 2: Shared SEO field validator

**Files:**

- Create: `packages/shared/src/seo.ts`
- Create: `packages/shared/src/seo.test.ts`
- Modify: `packages/shared/package.json`

**Interfaces:**

- Produces: `validateSeoFields(raw: unknown): { ok: true; value: SeoFieldsValue } | { ok: false; errors: SeoFieldsErrors }`, imported as `@bomy/shared/seo`. `SeoFieldsValue = { metaTitle: string | null; metaDescription: string | null; ogImageUrl: string | null }`. Every later task that writes these three columns imports and calls this function first.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/seo.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { validateSeoFields } from "./seo.js"

describe("validateSeoFields", () => {
  it("accepts all-empty input, normalizing to null", () => {
    const result = validateSeoFields({ metaTitle: "", metaDescription: "", ogImageUrl: "" })
    expect(result).toEqual({
      ok: true,
      value: { metaTitle: null, metaDescription: null, ogImageUrl: null },
    })
  })

  it("accepts valid non-empty values", () => {
    const result = validateSeoFields({
      metaTitle: "My Title",
      metaDescription: "A description",
      ogImageUrl: "https://cdn.example.com/og.png",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        metaTitle: "My Title",
        metaDescription: "A description",
        ogImageUrl: "https://cdn.example.com/og.png",
      },
    })
  })

  it("trims whitespace", () => {
    const result = validateSeoFields({ metaTitle: "  Hi  ", metaDescription: "", ogImageUrl: "" })
    expect(result).toEqual({
      ok: true,
      value: { metaTitle: "Hi", metaDescription: null, ogImageUrl: null },
    })
  })

  it("rejects metaTitle over 70 characters", () => {
    const result = validateSeoFields({
      metaTitle: "a".repeat(71),
      metaDescription: "",
      ogImageUrl: "",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.metaTitle).toMatch(/70/)
  })

  it("accepts metaTitle at exactly 70 characters", () => {
    const result = validateSeoFields({
      metaTitle: "a".repeat(70),
      metaDescription: "",
      ogImageUrl: "",
    })
    expect(result.ok).toBe(true)
  })

  it("rejects metaDescription over 160 characters", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "a".repeat(161),
      ogImageUrl: "",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.metaDescription).toMatch(/160/)
  })

  it("rejects a non-URL ogImageUrl", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "",
      ogImageUrl: "not a url",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ogImageUrl).toBeTruthy()
  })

  it("rejects a non-http(s) protocol", () => {
    const result = validateSeoFields({
      metaTitle: "",
      metaDescription: "",
      ogImageUrl: "ftp://example.com/img.png",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ogImageUrl).toMatch(/http/)
  })

  it("rejects ogImageUrl over 2048 characters", () => {
    const longUrl = `https://example.com/${"a".repeat(2048)}`
    const result = validateSeoFields({ metaTitle: "", metaDescription: "", ogImageUrl: longUrl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ogImageUrl).toMatch(/2048/)
  })

  it("ignores non-string field values instead of throwing", () => {
    const result = validateSeoFields({
      metaTitle: 123,
      metaDescription: null,
      ogImageUrl: undefined,
    })
    expect(result).toEqual({
      ok: true,
      value: { metaTitle: null, metaDescription: null, ogImageUrl: null },
    })
  })

  it("rejects non-object input", () => {
    const result = validateSeoFields(null)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bomy/shared test seo.test.ts --run`
Expected: FAIL — `Cannot find module './seo.js'` (or similar, since `seo.ts` doesn't exist yet).

- [ ] **Step 3: Implement the validator**

Create `packages/shared/src/seo.ts`:

```ts
/**
 * Shared SEO field validator (metaTitle/metaDescription/ogImageUrl), used by
 * both apps/web (seller) and apps/admin. Matches the codebase convention (no
 * Zod): manual validation returning `{ ok: true, value }` or
 * `{ ok: false, errors }`, mirroring apps/web/src/lib/shipping-address-schema.ts.
 */

export type SeoFieldsInput = {
  metaTitle?: unknown
  metaDescription?: unknown
  ogImageUrl?: unknown
}

export type SeoFieldsValue = {
  metaTitle: string | null
  metaDescription: string | null
  ogImageUrl: string | null
}

export type SeoFieldsErrors = Partial<Record<keyof SeoFieldsValue, string>>

export type SeoFieldsValidation =
  | { ok: true; value: SeoFieldsValue }
  | { ok: false; errors: SeoFieldsErrors }

const META_TITLE_MAX = 70
const META_DESCRIPTION_MAX = 160
const OG_IMAGE_URL_MAX = 2048

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

export function validateSeoFields(raw: unknown): SeoFieldsValidation {
  const errors: SeoFieldsErrors = {}
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: { metaTitle: "Invalid input" } }
  }
  const o = raw as Record<string, unknown>

  const metaTitle = str(o["metaTitle"])
  if (metaTitle.length > META_TITLE_MAX) {
    errors.metaTitle = `Meta title must be ${META_TITLE_MAX} characters or fewer`
  }

  const metaDescription = str(o["metaDescription"])
  if (metaDescription.length > META_DESCRIPTION_MAX) {
    errors.metaDescription = `Meta description must be ${META_DESCRIPTION_MAX} characters or fewer`
  }

  const ogImageUrlRaw = str(o["ogImageUrl"])
  let ogImageUrl: string | null = null
  if (ogImageUrlRaw.length > 0) {
    if (ogImageUrlRaw.length > OG_IMAGE_URL_MAX) {
      errors.ogImageUrl = `OG image URL must be ${OG_IMAGE_URL_MAX} characters or fewer`
    } else {
      try {
        const u = new URL(ogImageUrlRaw)
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          errors.ogImageUrl = "OG image URL must start with http:// or https://"
        } else {
          ogImageUrl = ogImageUrlRaw
        }
      } catch {
        errors.ogImageUrl = "OG image URL must be a valid absolute URL"
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      metaTitle: metaTitle.length > 0 ? metaTitle : null,
      metaDescription: metaDescription.length > 0 ? metaDescription : null,
      ogImageUrl,
    },
  }
}
```

- [ ] **Step 4: Add the package export**

Edit `packages/shared/package.json`, adding `"./seo"` to `exports` (after `"./body-sanitizer"`):

```json
  "exports": {
    ".": "./src/index.ts",
    "./youtube": "./src/youtube.ts",
    "./body-sanitizer": "./src/body-sanitizer.ts",
    "./seo": "./src/seo.ts"
  },
```

Do **not** re-export from `src/index.ts` — `youtube.ts` and `body-sanitizer.ts` aren't in that barrel either (it only exports `body-image-keys`); no app needs a root-import path for this.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bomy/shared test seo.test.ts --run`
Expected: PASS, all 12 tests green.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @bomy/shared typecheck`

```bash
git add packages/shared/src/seo.ts packages/shared/src/seo.test.ts packages/shared/package.json
git commit -m "feat(shared): add validateSeoFields validator"
```

---

### Task 3: Seller store SEO action

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/settings/actions.ts`
- Modify: `apps/web/tests/seller-settings/actions.test.ts`

**Interfaces:**

- Consumes: `validateSeoFields` from `@bomy/shared/seo` (Task 2); `schema.stores.metaTitle/metaDescription/ogImageUrl` (Task 1).
- Produces: `updateStoreSeo(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`, exported from `apps/web/src/app/seller/dashboard/settings/actions.ts`. Task 4 (UI) calls this directly.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/seller-settings/actions.test.ts`. First, extend the import line:

```ts
import {
  updateStoreSeo,
  updateStoreSettings,
  updateStoreVideo,
} from "../../src/app/seller/dashboard/settings/actions"
```

Then add a new `describe` block after the `updateStoreSettings action` block (before `updateStoreVideo action`):

```ts
describe.skipIf(!shouldRun)("updateStoreSeo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let buyerId: string
  let storeId: string
  let suspendedStoreId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()
    buyerId = randomUUID()

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seo test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: sellerId, email: `${sellerId}@test.bomy`, role: "seller_owner", name: "SEO Seller" },
        { id: buyerId, email: `${buyerId}@test.bomy`, role: "buyer", name: "SEO Buyer" },
      ])

      const [active] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "SEO Test Store",
          slug: `seo-store-${randomUUID().slice(0, 8)}`,
          status: "active",
        })
        .returning({ id: schema.stores.id })
      storeId = active!.id

      const [suspended] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "SEO Suspended Store",
          slug: `seo-susp-${randomUUID().slice(0, 8)}`,
          status: "suspended",
        })
        .returning({ id: schema.stores.id })
      suspendedStoreId = suspended!.id
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "seo test cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, suspendedStoreId))
    })
    await testDb.close()
  })

  it("saves SEO fields on the active store", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(
      fd({
        metaTitle: "Custom Title",
        metaDescription: "Custom description",
        ogImageUrl: "https://cdn.example.com/og.png",
      }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({
          metaTitle: schema.stores.metaTitle,
          metaDescription: schema.stores.metaDescription,
          ogImageUrl: schema.stores.ogImageUrl,
        })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.metaTitle).toBe("Custom Title")
    expect(row?.metaDescription).toBe("Custom description")
    expect(row?.ogImageUrl).toBe("https://cdn.example.com/og.png")
  })

  it("clears fields to NULL when empty strings submitted", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "y", ogImageUrl: "" }))

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(fd({ metaTitle: "", metaDescription: "", ogImageUrl: "" }))
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ metaTitle: schema.stores.metaTitle, ogImageUrl: schema.stores.ogImageUrl })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.metaTitle).toBeNull()
    expect(row?.ogImageUrl).toBeNull()
  })

  it("rejects an invalid ogImageUrl without writing anything", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(
      fd({ metaTitle: "", metaDescription: "", ogImageUrl: "not-a-url" }),
    )
    expect(result.ok).toBe(false)
  })

  it("rejects unauthenticated request", async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })

  it("rejects non-seller request", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: buyerId, role: "buyer" } })
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })

  it("rejects when the seller's only store is suspended", async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test" }, (tx) =>
      tx.update(schema.stores).set({ status: "suspended" }).where(eq(schema.stores.id, storeId)),
    )

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/active store/i)

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "restore" }, (tx) =>
      tx.update(schema.stores).set({ status: "active" }).where(eq(schema.stores.id, storeId)),
    )
  })

  it("revalidates both the settings page and the public storefront on success", async () => {
    mockRevalidatePath.mockClear()
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreSeo(fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }))
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/seller/dashboard/settings")

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ slug: schema.stores.slug })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/brands/${row!.slug}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/web test seller-settings/actions.test.ts --run
```

Expected: FAIL — `updateStoreSeo is not exported` (or a TypeScript error at import time).

- [ ] **Step 3: Implement `updateStoreSeo`**

Edit `apps/web/src/app/seller/dashboard/settings/actions.ts`. Add the import:

```ts
import { validateSeoFields } from "@bomy/shared/seo"
```

Add the function (place after `updateStoreSettings`, before `updateStoreCategories`):

```ts
export async function updateStoreSeo(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    return { ok: false, error: "Unauthorized" }
  }

  const validated = validateSeoFields({
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  })
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0]
    return { ok: false, error: firstError ?? "Invalid input." }
  }
  const { metaTitle, metaDescription, ogImageUrl } = validated.value

  let result: { ok: true; storeSlug: string } | { ok: false; error: string }

  try {
    result = await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const [store] = await tx
          .select({ id: schema.stores.id, slug: schema.stores.slug })
          .from(schema.stores)
          .where(
            and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")),
          )
          .limit(1)

        if (!store) {
          return { ok: false as const, error: "No active store found." }
        }

        const updated = await tx
          .update(schema.stores)
          .set({ metaTitle, metaDescription, ogImageUrl, updatedAt: new Date() })
          .where(
            and(
              eq(schema.stores.id, store.id),
              eq(schema.stores.ownerId, session.user.id),
              eq(schema.stores.status, "active"),
            ),
          )
          .returning({ id: schema.stores.id })

        if (updated.length === 0) {
          return { ok: false as const, error: "Update failed." }
        }

        return { ok: true as const, storeSlug: store.slug }
      },
    )
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." }
  }

  if (!result.ok) return result

  revalidatePath("/seller/dashboard/settings")
  revalidatePath(`/brands/${result.storeSlug}`)

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command as Step 2. Expected: PASS, all new tests green, existing tests in the file unaffected.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @bomy/web typecheck`

```bash
git add apps/web/src/app/seller/dashboard/settings/actions.ts apps/web/tests/seller-settings/actions.test.ts
git commit -m "feat(web): add seller updateStoreSeo action"
```

---

### Task 4: Seller store SEO UI

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/settings/settings-form.tsx`
- Modify: `apps/web/src/app/seller/dashboard/settings/page.tsx`

**Interfaces:**

- Consumes: `updateStoreSeo` (Task 3).

- [ ] **Step 1: Pass the new fields from the page into the form**

Edit `apps/web/src/app/seller/dashboard/settings/page.tsx`. Add the three columns to the `storeRow` select:

```ts
const [store] = await tx
  .select({
    id: schema.stores.id,
    excerpt: schema.stores.excerpt,
    bodyHtml: schema.stores.bodyHtml,
    bodyRevision: schema.stores.bodyRevision,
    videoId: schema.stores.videoId,
    metaTitle: schema.stores.metaTitle,
    metaDescription: schema.stores.metaDescription,
    ogImageUrl: schema.stores.ogImageUrl,
  })
  .from(schema.stores)
  .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
  .limit(1)
return store ?? null
```

Pass them to `<SettingsForm>`:

```tsx
<SettingsForm
  currentExcerpt={storeRow.excerpt ?? ""}
  currentBodyHtml={storeRow.bodyHtml}
  currentBodyRevision={storeRow.bodyRevision}
  currentVideoId={storeRow.videoId}
  currentMetaTitle={storeRow.metaTitle ?? ""}
  currentMetaDescription={storeRow.metaDescription ?? ""}
  currentOgImageUrl={storeRow.ogImageUrl ?? ""}
  allCategories={allCategories}
  assignedCategoryIds={[...assignedIds]}
/>
```

- [ ] **Step 2: Add the SEO section to `SettingsForm`**

Edit `apps/web/src/app/seller/dashboard/settings/settings-form.tsx`. Update the import:

```tsx
import {
  updateStoreCategories,
  updateStoreSeo,
  updateStoreSettings,
  updateStoreVideo,
} from "./actions"
```

Update the props type and destructuring:

```tsx
export function SettingsForm({
  currentExcerpt,
  currentBodyHtml,
  currentBodyRevision,
  currentVideoId,
  currentMetaTitle,
  currentMetaDescription,
  currentOgImageUrl,
  allCategories,
  assignedCategoryIds,
}: {
  currentExcerpt: string
  currentBodyHtml: string | null
  currentBodyRevision: number
  currentVideoId: string | null
  currentMetaTitle: string
  currentMetaDescription: string
  currentOgImageUrl: string
  allCategories: { id: string; name: string }[]
  assignedCategoryIds: string[]
}) {
```

Add a new `useActionState` hook alongside `excerptState`/`videoState` (inside the component body, after `videoState`):

```tsx
const [seoState, seoAction, seoPending] = useActionState(
  (_prev: State, formData: FormData) => updateStoreSeo(formData),
  null,
)
```

Add a new Card section (place it after the "Video" Card, before "Brand Story"):

```tsx
{
  /* SEO */
}
;<Card>
  <CardContent className="p-6">
    <h2 className="mb-4 text-sm font-semibold text-foreground">SEO</h2>
    <form action={seoAction} className="space-y-4">
      {seoState && !seoState.ok && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {seoState.error}
        </div>
      )}
      {seoState?.ok && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          SEO settings saved.
        </div>
      )}
      <div>
        <Label htmlFor="metaTitle" className="mb-1 block text-sm font-medium">
          Meta title{" "}
          <span className="font-normal text-muted-foreground">
            (overrides the page title shown in search results)
          </span>
        </Label>
        <Input id="metaTitle" name="metaTitle" maxLength={70} defaultValue={currentMetaTitle} />
      </div>
      <div>
        <Label htmlFor="metaDescription" className="mb-1 block text-sm font-medium">
          Meta description
        </Label>
        <Textarea
          id="metaDescription"
          name="metaDescription"
          rows={3}
          maxLength={160}
          defaultValue={currentMetaDescription}
        />
      </div>
      <div>
        <Label htmlFor="ogImageUrl" className="mb-1 block text-sm font-medium">
          OG image URL{" "}
          <span className="font-normal text-muted-foreground">
            (shown when your storefront is shared on social media)
          </span>
        </Label>
        <Input
          id="ogImageUrl"
          name="ogImageUrl"
          type="url"
          defaultValue={currentOgImageUrl}
          placeholder="https://…"
        />
      </div>
      <Button type="submit" disabled={seoPending}>
        {seoPending ? "Saving…" : "Save"}
      </Button>
    </form>
  </CardContent>
</Card>
```

- [ ] **Step 3: Typecheck and manually verify**

Run: `pnpm --filter @bomy/web typecheck`

Run: `pnpm dev` (or the already-running dev server), sign in as a seller with an active store, go to `/seller/dashboard/settings`, confirm the new "SEO" card renders between "Storefront Video" and "Brand Story", fill in all three fields, submit, confirm the success message appears and the values persist on reload.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/seller/dashboard/settings/settings-form.tsx apps/web/src/app/seller/dashboard/settings/page.tsx
git commit -m "feat(web): add SEO fields section to seller store settings"
```

---

### Task 5: Extend seller `updateProduct` with SEO fields

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/products/actions.ts`
- Modify: `apps/web/tests/seller-products/actions.test.ts`

**Interfaces:**

- Consumes: `validateSeoFields` from `@bomy/shared/seo` (Task 2).
- Produces: `updateProduct` (existing export, `apps/web/src/app/seller/dashboard/products/actions.ts`) now also accepts and persists `metaTitle`/`metaDescription`/`ogImageUrl` form fields.

- [ ] **Step 1: Write the failing test**

Edit `apps/web/tests/seller-products/actions.test.ts`. Inside the existing `describe("updateProduct", ...)` block (starting at line 252), add a new `it` after the existing `"updates product name, description, and status"` test and before `"throws when product belongs to a different seller (RLS)"`:

```ts
it("saves SEO fields alongside the other product fields", async () => {
  mockAuth.mockResolvedValue({
    user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
  })

  await updateProduct(
    productId,
    fd({
      name: "Updated Product",
      slug: "updated-product",
      categoryId: "",
      description: "Updated desc",
      status: "active",
      metaTitle: "Product Meta Title",
      metaDescription: "Product meta description",
      ogImageUrl: "https://cdn.example.com/product-og.png",
    }),
  )

  const [row] = await withAdmin(
    testDb.db,
    { userId: SYSTEM_ACTOR, reason: "test assert" },
    async (tx) => tx.select().from(schema.products).where(eq(schema.products.id, productId)),
  )
  expect(row!.metaTitle).toBe("Product Meta Title")
  expect(row!.metaDescription).toBe("Product meta description")
  expect(row!.ogImageUrl).toBe("https://cdn.example.com/product-og.png")
})

it("rejects an invalid ogImageUrl without writing anything", async () => {
  mockAuth.mockResolvedValue({
    user: { id: sellerId, role: "seller_owner", email: "seller@test.bomy" },
  })

  await expect(
    updateProduct(
      productId,
      fd({
        name: "Updated Product",
        slug: "updated-product",
        categoryId: "",
        description: "",
        status: "active",
        metaTitle: "",
        metaDescription: "",
        ogImageUrl: "not-a-url",
      }),
    ),
  ).rejects.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/web test seller-products/actions.test.ts --run
```

Expected: FAIL — the two new assertions fail because `updateProduct` doesn't read or persist the SEO fields yet (`row!.metaTitle` is `undefined`/`null` when a value was expected, and the invalid-URL case doesn't throw).

- [ ] **Step 3: Extend `updateProduct`**

Edit `apps/web/src/app/seller/dashboard/products/actions.ts`. Add the import at the top:

```ts
import { validateSeoFields } from "@bomy/shared/seo"
```

Replace the `updateProduct` function body:

```ts
export async function updateProduct(productId: string, formData: FormData): Promise<void> {
  const session = await requireSeller()

  const name = str(formData, "name").trim()
  if (!name) throw new Error("Product name is required")
  const slug = str(formData, "slug").trim() || slugify(name)
  if (!slug) throw new Error("Could not generate a valid slug from the product name")
  const categoryId = str(formData, "categoryId") || null
  const description = str(formData, "description").trim() || null
  const status = (str(formData, "status") || "draft") as "draft" | "active" | "archived"

  const seoValidated = validateSeoFields({
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  })
  if (!seoValidated.ok) {
    throw new Error(Object.values(seoValidated.errors)[0] ?? "Invalid SEO input")
  }
  const { metaTitle, metaDescription, ogImageUrl } = seoValidated.value

  const updated = await withTenant(
    getDb(),
    { userId: session.user.id, userRole: session.user.role },
    async (tx) => {
      const storeRows = await tx
        .select({ id: schema.stores.id })
        .from(schema.stores)
        .innerJoin(schema.products, eq(schema.products.storeId, schema.stores.id))
        .where(
          and(
            eq(schema.products.id, productId),
            eq(schema.stores.ownerId, session.user.id),
            eq(schema.stores.status, "active"),
          ),
        )
        .limit(1)
      if (!storeRows[0]) throw new Error("Product not found or not authorized")

      return tx
        .update(schema.products)
        .set({
          name,
          slug,
          categoryId,
          description,
          status,
          metaTitle,
          metaDescription,
          ogImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.products.id, productId))
        .returning({ id: schema.products.id })
    },
  )

  if (updated.length === 0) throw new Error("Product not found or not authorized")

  revalidatePath(`/seller/dashboard/products/${productId}/edit`)
  revalidatePath("/seller/dashboard/products")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command as Step 2. Expected: PASS, all tests in the file green (including the two new ones and the pre-existing `updateProduct` tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @bomy/web typecheck`

```bash
git add apps/web/src/app/seller/dashboard/products/actions.ts apps/web/tests/seller-products/actions.test.ts
git commit -m "feat(web): extend seller updateProduct with SEO fields"
```

---

### Task 6: Seller product SEO UI

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/products/[id]/edit/product-edit-form.tsx`

**Interfaces:**

- Consumes: `updateProduct` (extended in Task 5). No change needed to `apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx` or `getProductForEdit` — `getProductForEdit` already does a bare `tx.select().from(schema.products)` (all columns), so `product.metaTitle`/`metaDescription`/`ogImageUrl` are already present in the data it returns once Task 1's columns exist.

- [ ] **Step 1: Add the fields to the `Product` type and render the SEO inputs**

Edit `apps/web/src/app/seller/dashboard/products/[id]/edit/product-edit-form.tsx`. Update the `Product` type near the top:

```tsx
type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  categoryId: string | null
  status: "draft" | "active" | "archived"
  metaTitle: string | null
  metaDescription: string | null
  ogImageUrl: string | null
}
```

Inside the "Product Details" form (the one bound to `updateProduct.bind(null, product.id)`), add a new fields block right after the existing `<div className="col-span-2">` (Description) block, still inside the same `<div className="grid grid-cols-2 gap-4">`:

```tsx
              <div className="col-span-2">
                <Label
                  htmlFor="metaTitle"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Meta title{" "}
                  <span className="font-normal">(overrides the page title in search results)</span>
                </Label>
                <Input
                  id="metaTitle"
                  name="metaTitle"
                  maxLength={70}
                  defaultValue={product.metaTitle ?? ""}
                />
              </div>
              <div className="col-span-2">
                <Label
                  htmlFor="metaDescription"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Meta description
                </Label>
                <Textarea
                  id="metaDescription"
                  name="metaDescription"
                  rows={3}
                  maxLength={160}
                  defaultValue={product.metaDescription ?? ""}
                />
              </div>
              <div className="col-span-2">
                <Label
                  htmlFor="ogImageUrl"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  OG image URL{" "}
                  <span className="font-normal">(shown when this product is shared on social media)</span>
                </Label>
                <Input
                  id="ogImageUrl"
                  name="ogImageUrl"
                  type="url"
                  defaultValue={product.ogImageUrl ?? ""}
                  placeholder="https://…"
                />
              </div>
```

- [ ] **Step 2: Typecheck and manually verify**

Run: `pnpm --filter @bomy/web typecheck`

Run the dev server, sign in as a seller, go to an existing product's edit page (`/seller/dashboard/products/[id]/edit`), confirm the three new fields render inside "Product Details" below Description, fill them in, click "Save Changes", reload, confirm they persisted.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/seller/dashboard/products/[id]/edit/product-edit-form.tsx
git commit -m "feat(web): add SEO fields to seller product edit form"
```

---

### Task 6b: DB CHECK constraint tests for the SEO columns (added post-PR1, Charlie's request)

**Why:** Task 1 added `CHECK` constraints (length + URL-protocol) as a schema-level backstop behind the
action-level `validateSeoFields` validation. No test exercised those constraints directly. This project's
convention (e.g. `stores.excerpt`'s own "DB CHECK rejects excerpt > 160 chars via direct insert" test) treats
schema constraints as a first-class, separately-tested contract, not merely duplicate action validation —
added at Charlie's explicit request during the PR1 review gate.

**Files:**

- Modify: `packages/db/tests/catalog.test.ts` (add 4 new `it()` blocks inside the existing
  `describe("products", ...)` block, reusing its `activeProductId` fixture)
- Create: `packages/db/tests/stores.test.ts` (no existing DB-level test file covers the `stores` table at
  all — `packages/db/tests/rls.test.ts` is a generic `withTenant` argument-validation file, not per-table;
  `catalog.test.ts` is products/categories/variants/images domain, not stores)

- [ ] **Step 1: Add products CHECK tests to `catalog.test.ts`**

Insert these 4 tests inside the existing `describe("products", ...)` block (`packages/db/tests/catalog.test.ts`),
right after the `"seller A cannot UPDATE seller B's product"` test and before that describe block's closing
`})` (around line 317), reusing the block's own `activeProductId` fixture:

```ts
it("CHECK constraint rejects meta_title over 70 characters", async () => {
  await expect(
    withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
      tx
        .update(products)
        .set({ metaTitle: "a".repeat(71) })
        .where(eq(products.id, activeProductId)),
    ),
  ).rejects.toThrow()
})

it("CHECK constraint rejects meta_description over 160 characters", async () => {
  await expect(
    withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
      tx
        .update(products)
        .set({ metaDescription: "a".repeat(161) })
        .where(eq(products.id, activeProductId)),
    ),
  ).rejects.toThrow()
})

it("CHECK constraint rejects a non-http(s) og_image_url", async () => {
  await expect(
    withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
      tx
        .update(products)
        .set({ ogImageUrl: "ftp://example.com/image.png" })
        .where(eq(products.id, activeProductId)),
    ),
  ).rejects.toThrow()
})

it("accepts a valid https og_image_url", async () => {
  await expect(
    withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
      tx
        .update(products)
        .set({ ogImageUrl: "https://cdn.example.com/og.png" })
        .where(eq(products.id, activeProductId)),
    ),
  ).resolves.not.toThrow()
})
```

No new imports needed — `products`, `withAdmin`, `SYSTEM_ACTOR`, `eq` are all already imported/defined in
this file.

- [ ] **Step 2: Create `packages/db/tests/stores.test.ts`**

```ts
/**
 * Store schema — SEO field CHECK constraint tests (migration 0030).
 *
 * Requires a live Postgres with the bomy_app role and applied migrations.
 *
 *   docker compose -f infra/docker/compose.yml up -d postgres
 *   pnpm --filter @bomy/db migrate
 *   DATABASE_APP_URL=... BOMY_RLS_READY=1 pnpm --filter @bomy/db test
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeDb, type Db } from "../src/client.js"
import { stores, users } from "../src/schema/index.js"
import { withAdmin } from "../src/tenant.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const RLS_READY = process.env["BOMY_RLS_READY"] === "1"
const shouldRun = Boolean(DATABASE_URL) && RLS_READY

describe.skipIf(!shouldRun)("stores SEO field CHECK constraints", () => {
  let handle: Db
  let ownerId: string
  let storeId: string

  beforeAll(async () => {
    handle = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    storeId = randomUUID()

    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "stores check test seed" },
      async (tx) => {
        await tx
          .insert(users)
          .values({ id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" })
        await tx.insert(stores).values({
          id: storeId,
          ownerId,
          name: "Check Constraint Test Store",
          slug: `check-store-${storeId.slice(0, 8)}`,
          status: "active",
        })
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      handle.db,
      { userId: SYSTEM_ACTOR, reason: "stores check test cleanup" },
      async (tx) => {
        await tx.delete(stores).where(eq(stores.id, storeId))
        await tx.delete(users).where(eq(users.id, ownerId))
      },
    )
    await handle.close()
  })

  it("CHECK constraint rejects meta_title over 70 characters", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ metaTitle: "a".repeat(71) })
          .where(eq(stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })

  it("CHECK constraint rejects meta_description over 160 characters", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ metaDescription: "a".repeat(161) })
          .where(eq(stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })

  it("CHECK constraint rejects a non-http(s) og_image_url", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ ogImageUrl: "ftp://example.com/image.png" })
          .where(eq(stores.id, storeId)),
      ),
    ).rejects.toThrow()
  })

  it("accepts a valid https og_image_url", async () => {
    await expect(
      withAdmin(handle.db, { userId: SYSTEM_ACTOR, reason: "test check constraint" }, async (tx) =>
        tx
          .update(stores)
          .set({ ogImageUrl: "https://cdn.example.com/og.png" })
          .where(eq(stores.id, storeId)),
      ),
    ).resolves.not.toThrow()
  })
})
```

Check `packages/db/src/schema/index.ts` actually re-exports `stores` and `users` (it does — every other
test file in this directory imports them the same way).

- [ ] **Step 3: Run both test files**

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/db test catalog.test.ts stores.test.ts --run
```

Expected: PASS, all tests green — including the 4 new tests in `catalog.test.ts` and all 4 new tests in the
new `stores.test.ts` file.

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm --filter @bomy/db typecheck`

```bash
git add packages/db/tests/catalog.test.ts packages/db/tests/stores.test.ts
git commit -m "test(db): add CHECK constraint tests for SEO fields on stores and products"
```

---

## PR 2: Admin store/product SEO surfaces

### Task 7: Admin store SEO action

**Files:**

- Modify: `apps/admin/src/app/stores/actions.ts`
- Modify: `apps/admin/tests/stores/actions.test.ts`

**Interfaces:**

- Consumes: `validateSeoFields` from `@bomy/shared/seo` (Task 2).
- Produces: `updateStoreSeo(storeId: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`, exported from `apps/admin/src/app/stores/actions.ts`. Task 8 (UI) calls this directly.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `apps/admin/tests/stores/actions.test.ts`, after the existing `createStore one-store guard` block. First extend the import:

```ts
import { createStore, updateStoreSeo } from "../../src/app/stores/actions"
```

```ts
describe.skipIf(!shouldRun)("updateStoreSeo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let sellerId: string
  let storeId: string
  let storeSlug: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    sellerId = randomUUID()
    storeSlug = `admin-seo-${randomUUID().slice(0, 8)}`

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: sellerId, email: `seller-${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      const [store] = await tx
        .insert(schema.stores)
        .values({ ownerId: sellerId, name: "Admin SEO Store", slug: storeSlug, status: "pending" })
        .returning({ id: schema.stores.id })
      storeId = store!.id
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await testDb.close()
  })

  function seoFd(fields: Record<string, string>): FormData {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.append(k, v)
    return f
  }

  it("saves SEO fields regardless of store status (pending here)", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateStoreSeo(
      storeId,
      seoFd({
        metaTitle: "Admin Title",
        metaDescription: "Admin description",
        ogImageUrl: "https://cdn.example.com/admin-og.png",
      }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({
          metaTitle: schema.stores.metaTitle,
          metaDescription: schema.stores.metaDescription,
          ogImageUrl: schema.stores.ogImageUrl,
        })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.metaTitle).toBe("Admin Title")
    expect(row?.metaDescription).toBe("Admin description")
    expect(row?.ogImageUrl).toBe("https://cdn.example.com/admin-og.png")
  })

  it("rejects an invalid ogImageUrl without writing anything", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateStoreSeo(
      storeId,
      seoFd({ metaTitle: "", metaDescription: "", ogImageUrl: "not-a-url" }),
    )
    expect(result.ok).toBe(false)
  })

  it("revalidates the admin store detail page and the public storefront", async () => {
    mockRevalidatePath.mockClear()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateStoreSeo(
      storeId,
      seoFd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }),
    )
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/stores/${storeId}`)
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/brands/${storeSlug}`)
  })
})
```

This requires `mockRevalidatePath` to exist in this test file. Check the top of `apps/admin/tests/stores/actions.test.ts` (Step 1 of this task) — if `vi.mock("next/cache", ...)` and a captured `mockRevalidatePath` const aren't already present, add them:

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
```

and, in the imports section:

```ts
import { revalidatePath } from "next/cache"
```

with `const mockRevalidatePath = revalidatePath as unknown as Mock` declared alongside `const mockAuth = ...`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/admin test stores/actions.test.ts --run
```

Expected: FAIL — `updateStoreSeo is not exported`.

- [ ] **Step 3: Implement `updateStoreSeo`**

Edit `apps/admin/src/app/stores/actions.ts`. Add imports:

```ts
import { validateSeoFields } from "@bomy/shared/seo"
```

Add the function (place after `createStore`, at the end of the file):

```ts
export async function updateStoreSeo(
  storeId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminId = await requireAdminId()

  const validated = validateSeoFields({
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  })
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0]
    return { ok: false, error: firstError ?? "Invalid input." }
  }
  const { metaTitle, metaDescription, ogImageUrl } = validated.value

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin update store SEO" },
    async (tx) => {
      const [row] = await tx
        .update(schema.stores)
        .set({ metaTitle, metaDescription, ogImageUrl, updatedAt: new Date() })
        .where(eq(schema.stores.id, storeId))
        .returning({ slug: schema.stores.slug })
      if (!row) return { ok: false as const, error: "Store not found" }
      return { ok: true as const, slug: row.slug }
    },
  )

  if (!result.ok) return result

  revalidatePath(`/stores/${storeId}`)
  revalidatePath(`/brands/${result.slug}`)

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command as Step 2. Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @bomy/admin typecheck`

```bash
git add apps/admin/src/app/stores/actions.ts apps/admin/tests/stores/actions.test.ts
git commit -m "feat(admin): add updateStoreSeo action"
```

---

### Task 8: Admin store detail page

**Files:**

- Create: `apps/admin/src/app/stores/[id]/page.tsx`
- Create: `apps/admin/src/app/stores/[id]/store-seo-form.tsx`
- Modify: `apps/admin/src/app/stores/page.tsx`

**Interfaces:**

- Consumes: `updateStoreSeo` (Task 7).

- [ ] **Step 1: Create the SEO form client component**

Create `apps/admin/src/app/stores/[id]/store-seo-form.tsx`:

```tsx
"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { updateStoreSeo } from "../actions"

type State = { ok: true } | { ok: false; error: string } | null

export function StoreSeoForm({
  storeId,
  currentMetaTitle,
  currentMetaDescription,
  currentOgImageUrl,
}: {
  storeId: string
  currentMetaTitle: string
  currentMetaDescription: string
  currentOgImageUrl: string
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: State, formData: FormData) => updateStoreSeo(storeId, formData),
    null,
  )

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">SEO</h2>
        <form action={formAction} className="max-w-xl space-y-4">
          {state && !state.ok && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}
          {state?.ok && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              Saved.
            </div>
          )}
          <div>
            <Label htmlFor="metaTitle" className="mb-1 block text-sm font-medium">
              Meta title
            </Label>
            <Input id="metaTitle" name="metaTitle" maxLength={70} defaultValue={currentMetaTitle} />
          </div>
          <div>
            <Label htmlFor="metaDescription" className="mb-1 block text-sm font-medium">
              Meta description
            </Label>
            <Textarea
              id="metaDescription"
              name="metaDescription"
              rows={3}
              maxLength={160}
              defaultValue={currentMetaDescription}
            />
          </div>
          <div>
            <Label htmlFor="ogImageUrl" className="mb-1 block text-sm font-medium">
              OG image URL
            </Label>
            <Input
              id="ogImageUrl"
              name="ogImageUrl"
              type="url"
              defaultValue={currentOgImageUrl}
              placeholder="https://…"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create the store detail page**

Create `apps/admin/src/app/stores/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { StoreSeoForm } from "./store-seo-form"

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdminId()
  const { id } = await params

  const store = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin view store detail" },
    async (tx) => {
      const [row] = await tx
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          slug: schema.stores.slug,
          status: schema.stores.status,
          ownerEmail: schema.users.email,
          metaTitle: schema.stores.metaTitle,
          metaDescription: schema.stores.metaDescription,
          ogImageUrl: schema.stores.ogImageUrl,
        })
        .from(schema.stores)
        .innerJoin(schema.users, eq(schema.users.id, schema.stores.ownerId))
        .where(eq(schema.stores.id, id))
        .limit(1)
      return row ?? null
    },
  )

  if (!store) notFound()

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">{store.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {store.slug} · {store.ownerEmail} · {store.status}
      </p>
      <StoreSeoForm
        storeId={store.id}
        currentMetaTitle={store.metaTitle ?? ""}
        currentMetaDescription={store.metaDescription ?? ""}
        currentOgImageUrl={store.ogImageUrl ?? ""}
      />
    </div>
  )
}
```

- [ ] **Step 3: Link to the detail page from the stores list**

Edit `apps/admin/src/app/stores/page.tsx`. Replace the store-name cell:

```tsx
<td className="px-4 py-3">
  <div className="font-medium text-foreground">{row.name}</div>
  <div className="font-mono text-xs text-muted-foreground">{row.slug}</div>
  <CopyId id={row.id} />
</td>
```

with:

```tsx
<td className="px-4 py-3">
  <Link href={`/stores/${row.id}`} className="font-medium text-foreground hover:underline">
    {row.name}
  </Link>
  <div className="font-mono text-xs text-muted-foreground">{row.slug}</div>
  <CopyId id={row.id} />
</td>
```

`Link` is already imported at the top of this file — no import change needed.

- [ ] **Step 4: Typecheck and manually verify**

Run: `pnpm --filter @bomy/admin typecheck`

Run the admin dev server, sign in as admin, go to `/stores`, click a store name, confirm the detail page renders with the SEO form, save a value, reload, confirm it persisted.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/stores/[id]/page.tsx apps/admin/src/app/stores/[id]/store-seo-form.tsx apps/admin/src/app/stores/page.tsx
git commit -m "feat(admin): add store detail page with SEO editing"
```

---

### Task 9: Admin product SEO action

**Files:**

- Create: `apps/admin/src/app/products/actions.ts`
- Create: `apps/admin/tests/products/actions.test.ts`

**Interfaces:**

- Consumes: `validateSeoFields` from `@bomy/shared/seo` (Task 2).
- Produces: `updateProductSeo(productId: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`, exported from `apps/admin/src/app/products/actions.ts` — the first-ever admin action touching `products`. Task 10 (UI) calls this directly.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/tests/products/actions.test.ts`:

```ts
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest"

import { makeDb, schema, withAdmin } from "@bomy/db"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { updateProductSeo } from "../../src/app/products/actions"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"
const mockAuth = auth as unknown as Mock
const mockRevalidatePath = revalidatePath as unknown as Mock

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

describe.skipIf(!shouldRun)("updateProductSeo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let adminId: string
  let sellerId: string
  let storeId: string
  let storeSlug: string
  let productId: string
  let productSlug: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    adminId = randomUUID()
    sellerId = randomUUID()
    storeSlug = `admin-prod-seo-${randomUUID().slice(0, 8)}`
    productSlug = `admin-prod-seo-item-${randomUUID().slice(0, 8)}`

    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: adminId, email: `admin-${adminId}@test.bomy`, role: "bomy_admin" },
        { id: sellerId, email: `seller-${sellerId}@test.bomy`, role: "seller_owner" },
      ])
      const [store] = await tx
        .insert(schema.stores)
        .values({
          ownerId: sellerId,
          name: "Admin Product SEO Store",
          slug: storeSlug,
          status: "active",
        })
        .returning({ id: schema.stores.id })
      storeId = store!.id

      const [product] = await tx
        .insert(schema.products)
        .values({ storeId, name: "Admin SEO Product", slug: productSlug })
        .returning({ id: schema.products.id })
      productId = product!.id
    })
  })

  afterAll(async () => {
    await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test cleanup" }, async (tx) => {
      await tx.delete(schema.products).where(eq(schema.products.id, productId))
      await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
    })
    await testDb.close()
  })

  it("saves SEO fields on the product", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({
        metaTitle: "Admin Product Title",
        metaDescription: "Admin product description",
        ogImageUrl: "https://cdn.example.com/product-og.png",
      }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({
          metaTitle: schema.products.metaTitle,
          metaDescription: schema.products.metaDescription,
          ogImageUrl: schema.products.ogImageUrl,
        })
        .from(schema.products)
        .where(eq(schema.products.id, productId)),
    )
    expect(row?.metaTitle).toBe("Admin Product Title")
    expect(row?.metaDescription).toBe("Admin product description")
    expect(row?.ogImageUrl).toBe("https://cdn.example.com/product-og.png")
  })

  it("rejects an invalid ogImageUrl without writing anything", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({ metaTitle: "", metaDescription: "", ogImageUrl: "not-a-url" }),
    )
    expect(result.ok).toBe(false)
  })

  it("returns an error for a nonexistent product", async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      randomUUID(),
      fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }),
    )
    expect(result).toEqual({ ok: false, error: "Product not found" })
  })

  it("revalidates the admin product page and the public product page", async () => {
    mockRevalidatePath.mockClear()
    mockAuth.mockResolvedValue({ user: { id: adminId, role: "bomy_admin" } })
    const result = await updateProductSeo(
      productId,
      fd({ metaTitle: "x", metaDescription: "", ogImageUrl: "" }),
    )
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/products/${productId}`)
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/products/${storeSlug}/${productSlug}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/admin test products/actions.test.ts --run
```

Expected: FAIL — `Cannot find module '../../src/app/products/actions'`.

- [ ] **Step 3: Implement `updateProductSeo`**

Create `apps/admin/src/app/products/actions.ts`:

```ts
"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { validateSeoFields } from "@bomy/shared/seo"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"

export async function updateProductSeo(
  productId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminId = await requireAdminId()

  const validated = validateSeoFields({
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  })
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0]
    return { ok: false, error: firstError ?? "Invalid input." }
  }
  const { metaTitle, metaDescription, ogImageUrl } = validated.value

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin update product SEO" },
    async (tx) => {
      const [row] = await tx
        .select({ productSlug: schema.products.slug, storeSlug: schema.stores.slug })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(eq(schema.products.id, productId))
        .limit(1)
      if (!row) return { ok: false as const, error: "Product not found" }

      await tx
        .update(schema.products)
        .set({ metaTitle, metaDescription, ogImageUrl, updatedAt: new Date() })
        .where(eq(schema.products.id, productId))

      return { ok: true as const, storeSlug: row.storeSlug, productSlug: row.productSlug }
    },
  )

  if (!result.ok) return result

  revalidatePath(`/products/${productId}`)
  revalidatePath(`/products/${result.storeSlug}/${result.productSlug}`)

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command as Step 2. Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @bomy/admin typecheck`

```bash
git add apps/admin/src/app/products/actions.ts apps/admin/tests/products/actions.test.ts
git commit -m "feat(admin): add updateProductSeo action (first admin product surface)"
```

---

### Task 10: Admin products list + detail pages + nav entry

**Files:**

- Create: `apps/admin/src/app/products/page.tsx`
- Create: `apps/admin/src/app/products/[id]/page.tsx`
- Create: `apps/admin/src/app/products/[id]/product-seo-form.tsx`
- Modify: `apps/admin/src/components/sidebar.tsx`

**Interfaces:**

- Consumes: `updateProductSeo` (Task 9).

- [ ] **Step 1: Create the products list page**

Create `apps/admin/src/app/products/page.tsx`:

```tsx
import Link from "next/link"
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { id: adminId } = await requireAdmin()
  const { q } = await searchParams

  const rows = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin list products" },
    async (tx) => {
      const filters: SQL[] = []
      if (q && q.trim()) {
        const like = `%${q.trim()}%`
        const search = or(ilike(schema.products.name, like), ilike(schema.stores.name, like))
        if (search) filters.push(search)
      }
      return tx
        .select({
          id: schema.products.id,
          name: schema.products.name,
          status: schema.products.status,
          storeName: schema.stores.name,
        })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(asc(schema.stores.name), asc(schema.products.name))
    },
  )

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Products</h1>
        <form method="get" className="flex items-center gap-1">
          <label htmlFor="products-search" className="sr-only">
            Search products
          </label>
          <Input
            id="products-search"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by product or store…"
            className="h-8 w-64 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/products/${row.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.storeName}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{row.status}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Create the SEO form client component**

Create `apps/admin/src/app/products/[id]/product-seo-form.tsx`:

```tsx
"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { updateProductSeo } from "../actions"

type State = { ok: true } | { ok: false; error: string } | null

export function ProductSeoForm({
  productId,
  currentMetaTitle,
  currentMetaDescription,
  currentOgImageUrl,
}: {
  productId: string
  currentMetaTitle: string
  currentMetaDescription: string
  currentOgImageUrl: string
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: State, formData: FormData) => updateProductSeo(productId, formData),
    null,
  )

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">SEO</h2>
        <form action={formAction} className="max-w-xl space-y-4">
          {state && !state.ok && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}
          {state?.ok && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              Saved.
            </div>
          )}
          <div>
            <Label htmlFor="metaTitle" className="mb-1 block text-sm font-medium">
              Meta title
            </Label>
            <Input id="metaTitle" name="metaTitle" maxLength={70} defaultValue={currentMetaTitle} />
          </div>
          <div>
            <Label htmlFor="metaDescription" className="mb-1 block text-sm font-medium">
              Meta description
            </Label>
            <Textarea
              id="metaDescription"
              name="metaDescription"
              rows={3}
              maxLength={160}
              defaultValue={currentMetaDescription}
            />
          </div>
          <div>
            <Label htmlFor="ogImageUrl" className="mb-1 block text-sm font-medium">
              OG image URL
            </Label>
            <Input
              id="ogImageUrl"
              name="ogImageUrl"
              type="url"
              defaultValue={currentOgImageUrl}
              placeholder="https://…"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create the product detail page**

Create `apps/admin/src/app/products/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { ProductSeoForm } from "./product-seo-form"

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdminId()
  const { id } = await params

  const product = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin view product detail" },
    async (tx) => {
      const [row] = await tx
        .select({
          id: schema.products.id,
          name: schema.products.name,
          status: schema.products.status,
          storeName: schema.stores.name,
          metaTitle: schema.products.metaTitle,
          metaDescription: schema.products.metaDescription,
          ogImageUrl: schema.products.ogImageUrl,
        })
        .from(schema.products)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
        .where(eq(schema.products.id, id))
        .limit(1)
      return row ?? null
    },
  )

  if (!product) notFound()

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">{product.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {product.storeName} · {product.status}
      </p>
      <ProductSeoForm
        productId={product.id}
        currentMetaTitle={product.metaTitle ?? ""}
        currentMetaDescription={product.metaDescription ?? ""}
        currentOgImageUrl={product.ogImageUrl ?? ""}
      />
    </div>
  )
}
```

- [ ] **Step 4: Add the nav entry**

Edit `apps/admin/src/components/sidebar.tsx`. Add a `"Products"` entry to the `NAV` array, right after `"Stores"`:

```ts
const NAV = [
  { href: "/stores", label: "Stores" },
  { href: "/products", label: "Products" },
  { href: "/users", label: "Users" },
  { href: "/seller-inquiries", label: "Seller Inquiries" },
  { href: "/categories", label: "Product Cats" },
  { href: "/store-categories", label: "Store Cats" },
  { href: "/memberships", label: "Memberships" },
  { href: "/brand-subscriptions", label: "Brand Subs" },
  { href: "/brand-plans", label: "Brand Plans" },
  { href: "/goodie-box", label: "Goodie Box" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/checkout-sessions", label: "Sessions" },
  { href: "/orders", label: "Orders" },
  { href: "/payouts", label: "Payouts" },
  { href: "/config", label: "Config" },
]
```

- [ ] **Step 5: Typecheck and manually verify**

Run: `pnpm --filter @bomy/admin typecheck`

Run the admin dev server, sign in as admin, confirm "Products" appears in the sidebar, click it, confirm the list renders and search works, click a product, confirm the detail page renders with the SEO form, save a value, reload, confirm it persisted.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/products/page.tsx apps/admin/src/app/products/[id]/page.tsx \
  apps/admin/src/app/products/[id]/product-seo-form.tsx apps/admin/src/components/sidebar.tsx
git commit -m "feat(admin): add products list, detail, and nav entry"
```

---

## PR 3: Public metadata wiring

### Task 11: `generateMetadata` for `/brands/[slug]`

**Files:**

- Modify: `apps/web/src/app/brands/[slug]/queries.ts`
- Modify: `apps/web/src/app/brands/[slug]/page.tsx`
- Create: `apps/web/tests/storefront/brand-metadata.test.ts`

**Interfaces:**

- Produces: `generateMetadata`, a named export from `apps/web/src/app/brands/[slug]/page.tsx` matching Next.js's `generateMetadata({ params }: Props): Promise<Metadata>` convention.

- [ ] **Step 1: Add the fields to `getStorePage`'s select and wrap it in `cache()`**

Edit `apps/web/src/app/brands/[slug]/queries.ts`. `generateMetadata` and the page component will both call `getStorePage` for the same request — wrapping in React's `cache()` dedupes that into one DB round trip, per Next.js's documented pattern for this exact case. Add the import:

```ts
import { cache } from "react"
```

Change the function declaration from `export async function getStorePage(slug: string) {` to:

```ts
export const getStorePage = cache(async (slug: string) => {
```

(and change the closing `}` at the end of the function to `})` — the function becomes an arrow function passed to `cache`).

Add `excerpt`, `metaTitle`, `metaDescription`, `ogImageUrl` to the store select:

```ts
const [store] = await db
  .select({
    id: schema.stores.id,
    name: schema.stores.name,
    slug: schema.stores.slug,
    description: schema.stores.description,
    excerpt: schema.stores.excerpt,
    bodyHtml: schema.stores.bodyHtml,
    videoId: schema.stores.videoId,
    metaTitle: schema.stores.metaTitle,
    metaDescription: schema.stores.metaDescription,
    ogImageUrl: schema.stores.ogImageUrl,
  })
  .from(schema.stores)
  .where(and(eq(schema.stores.slug, slug), eq(schema.stores.status, "active")))
  .limit(1)
```

And add them to the returned `store` object at the bottom of the function:

```ts
return {
  store: {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    excerpt: store.excerpt,
    bodyHtml: store.bodyHtml,
    videoId: store.videoId,
    metaTitle: store.metaTitle,
    metaDescription: store.metaDescription,
    ogImageUrl: store.ogImageUrl,
  },
  categorySections,
  uncategorized: {
    products: uncategorizedProducts.slice(0, CATEGORY_PREVIEW_CAP),
    hasMore: uncategorizedProducts.length > CATEGORY_PREVIEW_CAP,
  },
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/tests/storefront/brand-metadata.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/app/brands/[slug]/queries", () => ({ getStorePage: vi.fn() }))

import { generateMetadata } from "../../src/app/brands/[slug]/page"
import { getStorePage } from "../../src/app/brands/[slug]/queries"

const mockGetStorePage = getStorePage as unknown as ReturnType<typeof vi.fn>

function storeData(
  overrides: Partial<{
    name: string
    excerpt: string | null
    description: string | null
    metaTitle: string | null
    metaDescription: string | null
    ogImageUrl: string | null
  }> = {},
) {
  return {
    store: {
      id: "s1",
      name: "Acme",
      slug: "acme",
      description: null,
      excerpt: null,
      bodyHtml: null,
      videoId: null,
      metaTitle: null,
      metaDescription: null,
      ogImageUrl: null,
      ...overrides,
    },
    categorySections: [],
    uncategorized: { products: [], hasMore: false },
  }
}

describe("brands/[slug] generateMetadata", () => {
  it("uses explicit SEO fields when set", async () => {
    mockGetStorePage.mockResolvedValueOnce(
      storeData({
        metaTitle: "Custom Title",
        metaDescription: "Custom description",
        ogImageUrl: "https://cdn.example.com/og.png",
      }),
    )
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.title).toBe("Custom Title")
    expect(metadata.description).toBe("Custom description")
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/og.png"])
  })

  it("falls back to name/excerpt and omits images with no ogImageUrl", async () => {
    mockGetStorePage.mockResolvedValueOnce(storeData({ excerpt: "Brief intro" }))
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.title).toBe("Acme")
    expect(metadata.description).toBe("Brief intro")
    expect(metadata.openGraph?.images).toBeUndefined()
  })

  it("falls back to description when excerpt is empty", async () => {
    mockGetStorePage.mockResolvedValueOnce(storeData({ description: "Full description" }))
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.description).toBe("Full description")
  })

  it("omits description entirely when metaDescription/excerpt/description are all empty", async () => {
    mockGetStorePage.mockResolvedValueOnce(storeData())
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "acme" }) })
    expect(metadata.description).toBeUndefined()
  })

  it("returns an empty metadata object when the store is not found", async () => {
    mockGetStorePage.mockResolvedValueOnce(null)
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "missing" }) })
    expect(metadata).toEqual({})
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bomy/web test brand-metadata.test.ts --run`
Expected: FAIL — `generateMetadata is not exported` from `page.tsx`.

- [ ] **Step 4: Implement `generateMetadata`**

Edit `apps/web/src/app/brands/[slug]/page.tsx`. Add the import:

```tsx
import type { Metadata } from "next"
```

Add the function (place it right after the `interface Props` declaration, before `ProductCard`):

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getStorePage(slug)
  if (!data) return {}

  const { store } = data
  const title = store.metaTitle ?? store.name
  const description = store.metaDescription ?? store.excerpt ?? store.description ?? undefined

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      ...(store.ogImageUrl ? { images: [store.ogImageUrl] } : {}),
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bomy/web test brand-metadata.test.ts --run`
Expected: PASS, all 5 tests green.

- [ ] **Step 6: Run the full web integration suite and typecheck**

Run:

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/web test --run
```

Expected: PASS, no regressions (confirms the `cache()` wrapping and select changes didn't break `getStorePage`'s existing callers/tests).

Run: `pnpm --filter @bomy/web typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/brands/[slug]/queries.ts apps/web/src/app/brands/[slug]/page.tsx \
  apps/web/tests/storefront/brand-metadata.test.ts
git commit -m "feat(web): add generateMetadata to the public store page"
```

---

### Task 12: `generateMetadata` for `/products/[storeSlug]/[productSlug]`

**Files:**

- Modify: `apps/web/src/app/products/queries.ts`
- Modify: `apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`
- Create: `apps/web/tests/products/product-metadata.test.ts`

**Interfaces:**

- Produces: `generateMetadata`, a named export from `apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`.

- [ ] **Step 1: Add the fields to `getProductBySlug`'s select and wrap it in `cache()`**

Edit `apps/web/src/app/products/queries.ts`. Add the import at the top of the file (alongside the existing `drizzle-orm`/`@bomy/db` imports):

```ts
import { cache } from "react"
```

Change the function declaration from `export async function getProductBySlug(storeSlug: string, productSlug: string) {` to:

```ts
export const getProductBySlug = cache(async (storeSlug: string, productSlug: string) => {
```

(and change the closing `}` at the end of the function to `})`).

Add `metaTitle`, `metaDescription`, `ogImageUrl` to the product select:

```ts
const [product] = await db
  .select({
    id: schema.products.id,
    name: schema.products.name,
    slug: schema.products.slug,
    description: schema.products.description,
    coverImageUrl: schema.products.coverImageUrl,
    bodyHtml: schema.products.bodyHtml,
    metaTitle: schema.products.metaTitle,
    metaDescription: schema.products.metaDescription,
    ogImageUrl: schema.products.ogImageUrl,
    storeId: schema.stores.id,
    storeName: schema.stores.name,
    storeSlug: schema.stores.slug,
    categoryId: schema.products.categoryId,
  })
  .from(schema.products)
  .innerJoin(
    schema.stores,
    and(
      eq(schema.stores.id, schema.products.storeId),
      eq(schema.stores.slug, storeSlug),
      eq(schema.stores.status, "active"),
    ),
  )
  .where(and(eq(schema.products.slug, productSlug), eq(schema.products.status, "active")))
  .limit(1)
```

(`metaTitle`, `metaDescription`, `ogImageUrl` are already present on `product` after this — the function returns `product` merged with `variants`/`images` further down; no other change needed there since it spreads/returns the full row.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/tests/products/product-metadata.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/app/products/queries", () => ({ getProductBySlug: vi.fn() }))

import { generateMetadata } from "../../src/app/products/[storeSlug]/[productSlug]/page"
import { getProductBySlug } from "../../src/app/products/queries"

const mockGetProductBySlug = getProductBySlug as unknown as ReturnType<typeof vi.fn>

function productData(
  overrides: Partial<{
    name: string
    description: string | null
    metaTitle: string | null
    metaDescription: string | null
    ogImageUrl: string | null
  }> = {},
) {
  return {
    id: "p1",
    name: "Widget",
    slug: "widget",
    description: null,
    coverImageUrl: null,
    bodyHtml: null,
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
    storeId: "s1",
    storeName: "Acme",
    storeSlug: "acme",
    categoryId: null,
    variants: [],
    images: [],
    ...overrides,
  }
}

describe("products/[storeSlug]/[productSlug] generateMetadata", () => {
  it("uses explicit SEO fields when set", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(
      productData({
        metaTitle: "Custom Product Title",
        metaDescription: "Custom product description",
        ogImageUrl: "https://cdn.example.com/product-og.png",
      }),
    )
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.title).toBe("Custom Product Title")
    expect(metadata.description).toBe("Custom product description")
    expect(metadata.openGraph?.images).toEqual(["https://cdn.example.com/product-og.png"])
  })

  it("falls back to name/description and omits images with no ogImageUrl", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(productData({ description: "A fine widget" }))
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.title).toBe("Widget")
    expect(metadata.description).toBe("A fine widget")
    expect(metadata.openGraph?.images).toBeUndefined()
  })

  it("omits description entirely when metaDescription/description are both empty", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(productData())
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "widget" }),
    })
    expect(metadata.description).toBeUndefined()
  })

  it("returns an empty metadata object when the product is not found", async () => {
    mockGetProductBySlug.mockResolvedValueOnce(null)
    const metadata = await generateMetadata({
      params: Promise.resolve({ storeSlug: "acme", productSlug: "missing" }),
    })
    expect(metadata).toEqual({})
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bomy/web test product-metadata.test.ts --run`
Expected: FAIL — `generateMetadata is not exported` from `page.tsx`.

- [ ] **Step 4: Implement `generateMetadata`**

Edit `apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`. Add the import:

```tsx
import type { Metadata } from "next"
```

Add the function (place it right after the `interface Props` declaration, before `ProductDetailPage`):

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug, productSlug } = await params
  const product = await getProductBySlug(storeSlug, productSlug)
  if (!product) return {}

  const title = product.metaTitle ?? product.name
  const description = product.metaDescription ?? product.description ?? undefined

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      ...(product.ogImageUrl ? { images: [product.ogImageUrl] } : {}),
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bomy/web test product-metadata.test.ts --run`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Run the full web integration suite and typecheck**

Run:

```bash
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/web test --run
```

Expected: PASS, no regressions.

Run: `pnpm --filter @bomy/web typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/products/queries.ts apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx \
  apps/web/tests/products/product-metadata.test.ts
git commit -m "feat(web): add generateMetadata to the public product page"
```

---

### Task 13: Live browser verification

**Files:** none (manual verification, no code changes).

- [ ] **Step 1: Start the full stack**

Run: `pnpm dev` (web on :3000, api on :3001, admin on :3002), with Docker infra already up.

- [ ] **Step 2: Verify store metadata end-to-end**

As a seller with an active store: set meta title/description/OG image via `/seller/dashboard/settings`. Visit the store's public page (`/brands/[slug]`) and view page source (or DevTools → Elements → `<head>`) — confirm `<title>` matches the meta title, `<meta name="description">` matches the meta description, and `<meta property="og:image">` matches the OG image URL. Then clear all three fields via the same form, reload the public page, confirm `<title>` falls back to the store name and `<meta name="description">` falls back to the excerpt (or is absent if excerpt is also empty).

- [ ] **Step 3: Verify product metadata end-to-end**

Repeat Step 2 for a product: set fields via `/seller/dashboard/products/[id]/edit`, verify on `/products/[storeSlug]/[productSlug]`, clear and verify fallback to product name/description.

- [ ] **Step 4: Verify admin edit paths**

As admin: edit the same store's SEO fields via `/stores/[id]` and the same product's via `/products/[id]`, confirm changes are reflected on the public pages after a reload (revalidatePath should make this immediate, no redeploy needed).

- [ ] **Step 5: Report results**

No commit for this task — report the verification outcome (pass/fail per page, with a screenshot or copied `<head>` snippet for at least one explicit-values case and one fallback case) before considering PR 3 done.

---

## Self-Review Notes

- **Spec coverage:** every spec section has a task — schema/migration (Task 1), validator + `packages/shared` export (Task 2), seller store action/UI (Tasks 3–4), seller product extension/UI (Tasks 5–6), admin store action/UI (Tasks 7–8), admin product action/UI (Tasks 9–10), public metadata with fallback coverage (Tasks 11–12), live verification (Task 13).
- **Migration registration:** confirmed this repo's migration runner is a hand-maintained array in `packages/db/scripts/migrate.mjs` (not drizzle-kit) — Task 1 Step 4 registers the new migration there, which would otherwise silently never apply.
- **`cache()` wrapping:** added to both public query functions (Tasks 11–12) since `generateMetadata` and the page component now both call them per request — otherwise this doubles DB load on every store/product page view.
- **Type consistency:** `updateStoreSeo`/`updateProductSeo` return `{ ok: true } | { ok: false; error: string }` everywhere (seller store, admin store, admin product) — consistent with `updateStoreSettings`/`updateCategory`. `updateProduct`'s extension stays throw-based, matching its own existing convention (not converted to the `{ok,error}` shape, since that would be an unrelated refactor of the whole function).
