# Seller Storefront Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public seller page (`/brands/[slug]`) into a richer storefront — centered
shop name, a two-column brand-story/video intro, and products grouped into per-category sections
with a "view all" link to a new filtered listing route.

**Architecture:** One additive migration adds `stores.body_html`/`body_revision`/`video_id`. A
generalized, scope-aware body-image pipeline (`{kind: "product"|"store", id}`) is shared between
products and stores rather than duplicated. Six pre-existing duplicate YouTube-ID regexes collapse
into one canonical, client-safe module. The WYSIWYG body editor becomes prop-injected (save/upload
functions passed in) instead of product-hardcoded, so both product and store pages can use it.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Drizzle ORM, TipTap (WYSIWYG), Vitest,
real Postgres integration tests (this project's standard — no mocked DB for RLS/ownership tests).

## Global Constraints

- Money/bigint conventions don't apply here (no monetary fields touched).
- Never write to the DB outside `withTenant`/`withAdmin`/`withPublicRead` (project-wide rule).
- Never edit an applied migration — this feature is migration `0028`, `0000`–`0027` are untouched.
- Lint is `--max-warnings 0`; run `pnpm format` before committing (huskey/lint-staged enforce this
  anyway, but don't rely on the hook alone — run it explicitly per task).
- `apps/web`'s lint script only covers `src`, not `tests` — unused imports in test files must be
  checked manually (grep for the identifier) after any refactor, per this session's own prior
  experience with exactly this gap.
- Integration tests require real Postgres with the `bomy_app` role:
  `DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm test`
- Spec: `docs/superpowers/specs/2026-07-30-seller-storefront-design.md` — read it before starting;
  every task below implements a specific section of it.

---

## File Structure

**New files:**

- `packages/db/drizzle/0028_store_body_video.sql` — migration
- `packages/shared/src/youtube.ts` — canonical YouTube-ID regex + extractor
- `packages/shared/tests/youtube.test.ts` — its tests
- `packages/shared/tests/body-image-keys.test.ts` — new scope-rejection tests
- `packages/shared/vitest.config.ts` — test runner config (package has none today)
- `apps/web/src/lib/body-sanitizer.ts` — relocated + scope-generalized sanitizer (from
  `apps/web/src/app/seller/dashboard/products/body-sanitizer.ts`)
- `apps/web/src/components/video-embed.tsx` — relocated from
  `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx`
- `apps/web/src/components/body-editor.tsx` — generalized from `product-body-editor.tsx`, renamed,
  prop-injected
- `apps/web/src/components/youtube-embed-extension.ts` — relocated (content already fixed) from
  `apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts`
- `apps/web/src/components/image-upload-extension.ts` — relocated + generalized (drops `productId`)
  from `apps/web/src/app/seller/dashboard/products/[id]/edit/image-upload-extension.ts`
- `apps/web/tests/products/body-renderer.test.ts` — figure video-ID render regression test
- `apps/web/src/app/seller/dashboard/settings/body-actions.ts` — `saveStoreBody`,
  `getStoreBodyImageUploadUrl`
- `apps/web/src/app/brands/[slug]/products/queries.ts` — new filtered-listing query
- `apps/web/src/app/brands/[slug]/products/page.tsx` — new route
- `apps/web/tests/storefront/brand-products-queries.test.ts` — its tests

**Modified files:**

- `packages/db/scripts/migrate.mjs` — register `0028`
- `packages/db/src/rls/policies.sql` — §6 comment note only (no grant/policy change needed; see
  spec §1)
- `packages/shared/package.json` — add `test`/`test:watch` scripts and the `"./youtube"` subpath
  export
- `packages/shared/src/body-image-keys.ts` — scope-aware `classifyImageUrl`/
  `extractManagedBodyImageKeys`
- `apps/web/src/app/seller/dashboard/products/actions.ts` — pass `{kind:"product",id}` scope at
  its 3 call sites; import relocated sanitizer
- `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx` — import canonical
  YouTube validator + relocated `VideoEmbed`
- `apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx` — import generalized `BodyEditor`
  from `@/components/body-editor` instead of the deleted local `product-body-editor.tsx`, bind
  product-specific `saveBody`/`getUploadUrl` props
- `apps/web/src/app/seller/dashboard/settings/actions.ts` — add `updateStoreVideo`
- `apps/web/src/app/seller/dashboard/settings/settings-form.tsx` — add Brand Story editor + Video
  URL field
- `apps/web/src/app/seller/dashboard/settings/page.tsx` — fetch new columns
- `apps/web/src/app/brands/[slug]/queries.ts` — fetch `body_html`/`video_id`, add category-grouped
  products query (full-file replacement of the current 41-line file)
- `apps/web/tests/storefront/queries.test.ts` — fix the now-incompatible `getStorePage` assertion,
  add category-grouping test coverage
- `apps/web/src/app/brands/[slug]/page.tsx` — full layout redesign (full-file replacement)
- `apps/web/tests/seller-products/body-sanitizer.test.ts` — update import path + `BodyImageScope`
  call signature
- `apps/web/tests/seller-settings/actions.test.ts` — add `updateStoreVideo` test coverage

**Deleted files:**

- `apps/web/src/app/seller/dashboard/products/body-sanitizer.ts` (moved to `apps/web/src/lib/`)
- `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx` (moved to
  `apps/web/src/components/`)
- `apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx` (replaced by
  `apps/web/src/components/body-editor.tsx`)
- `apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts` (moved to
  `apps/web/src/components/`)
- `apps/web/src/app/seller/dashboard/products/[id]/edit/image-upload-extension.ts` (moved +
  generalized to `apps/web/src/components/`)

---

## Task 1: Migration `0028` — new `stores` columns

**Files:**

- Create: `packages/db/drizzle/0028_store_body_video.sql`
- Modify: `packages/db/scripts/migrate.mjs`

**Interfaces:**

- Produces: `stores.body_html` (text, nullable), `stores.body_revision` (integer, default 0),
  `stores.video_id` (text, nullable, CHECK-constrained to exactly 11 chars from `[A-Za-z0-9_-]`).

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 0028: store brand-story body content + YouTube video ID.
-- Additive only. No RLS policy or bomy_app grant changes needed — stores'
-- existing row-level policies and table-level grant already cover any
-- column, including new ones (GAPS #16).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS body_html text;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS body_revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE stores ADD COLUMN IF NOT EXISTS video_id text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_video_id_chk
    CHECK (video_id IS NULL OR video_id ~ '^[A-Za-z0-9_-]{11}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 2: Register it in `migrate.mjs`**

Open `packages/db/scripts/migrate.mjs`, find the `MIGRATIONS` array's last entry (`0027`), add
immediately after it:

```js
  {
    name: "0028_store_body_video",
    file: join(__dirname, "../drizzle/0028_store_body_video.sql"),
  },
```

- [ ] **Step 3: Apply and verify against local dev Postgres**

Run: `cd packages/db && DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy node scripts/migrate.mjs`
Expected: `apply 0028_store_body_video ... done` (no errors). Every earlier migration should show
`skip` (already applied).

- [ ] **Step 4: Verify the CHECK constraint actually rejects bad input**

Run:

```sh
docker exec -i bomy_postgres psql -U bomy -d bomy -c "INSERT INTO stores (owner_id, name, slug, video_id) SELECT id, 'chk-test', 'chk-test-store', 'tooshort' FROM users LIMIT 1;"
```

Expected: `ERROR: new row for relation "stores" violates check constraint "stores_video_id_chk"`.
This is a manual verification, not an automated test — the automated coverage for this constraint
lives in Task 8's `saveStoreBody`/`updateStoreVideo` tests, which exercise it through the app.

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0028_store_body_video.sql packages/db/scripts/migrate.mjs
git commit -m "feat(db): add stores.body_html/body_revision/video_id (migration 0028)"
```

---

## Task 2: `@bomy/shared` YouTube-ID module + package test infra

**Files:**

- Create: `packages/shared/src/youtube.ts`
- Create: `packages/shared/tests/youtube.test.ts`
- Create: `packages/shared/vitest.config.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Produces: `YOUTUBE_VIDEO_ID_RE: RegExp`, `isValidYoutubeVideoId(id: string): boolean`,
  `extractYoutubeVideoId(input: string): string | null` — importable as
  `import { ... } from "@bomy/shared/youtube"`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/tests/youtube.test.ts
import { describe, expect, it } from "vitest"

import {
  extractYoutubeVideoId,
  isValidYoutubeVideoId,
  YOUTUBE_VIDEO_ID_RE,
} from "../src/youtube.js"

describe("YOUTUBE_VIDEO_ID_RE / isValidYoutubeVideoId", () => {
  it("accepts exactly 11 chars of the allowed alphabet", () => {
    expect(isValidYoutubeVideoId("dQw4w9WgXcQ")).toBe(true)
  })

  it("rejects fewer than 11 chars", () => {
    expect(isValidYoutubeVideoId("short")).toBe(false)
  })

  it("rejects more than 11 chars", () => {
    expect(isValidYoutubeVideoId("dQw4w9WgXcQextra")).toBe(false)
  })

  it("rejects characters outside [A-Za-z0-9_-]", () => {
    expect(isValidYoutubeVideoId("dQw4w9WgX@Q")).toBe(false)
  })

  it("accepts underscores and hyphens", () => {
    expect(isValidYoutubeVideoId("a_B-1_2-3c4")).toBe(true)
  })
})

describe("extractYoutubeVideoId", () => {
  it("extracts from a watch?v= URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from a youtu.be short URL", () => {
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from an /embed/ URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from a /shorts/ URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from a /live/ URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("accepts a bare 11-char ID with no URL wrapper", () => {
    expect(extractYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("trims surrounding whitespace before matching a bare ID", () => {
    expect(extractYoutubeVideoId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ")
  })

  it("returns null for a non-YouTube URL", () => {
    expect(extractYoutubeVideoId("https://vimeo.com/12345678")).toBeNull()
  })

  it("returns null for a too-short bare string", () => {
    expect(extractYoutubeVideoId("abc")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(extractYoutubeVideoId("")).toBeNull()
  })
})
```

- [ ] **Step 2: Add the package's test infrastructure so the test can even run**

Create `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
```

Edit `packages/shared/package.json` — add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

(Matches `@bomy/db`/`@bomy/hitpay`/`@bomy/mailer`'s exact convention — no other config needed,
`vitest` is already a devDependency.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/shared && pnpm test`
Expected: FAIL — `Cannot find module '../src/youtube.js'` (file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

```ts
// packages/shared/src/youtube.ts

/** Canonical YouTube video ID shape — exactly 11 characters. This is the
 * single source of truth; do not redefine this pattern elsewhere. */
export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function isValidYoutubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID_RE.test(id)
}

/** Extracts a canonical 11-char video ID from a pasted YouTube URL (any of
 * watch?v=, youtu.be/, /embed/, /shorts/, /live/) or a bare ID. Returns
 * null if no valid ID can be found. */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(
    /(?:v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/,
  )
  if (urlMatch) return urlMatch[1]!
  return YOUTUBE_VIDEO_ID_RE.test(trimmed) ? trimmed : null
}
```

Edit `packages/shared/package.json` — add a subpath export:

```json
  "exports": {
    ".": "./src/index.ts",
    "./youtube": "./src/youtube.ts"
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && pnpm test`
Expected: all 15 tests PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `cd packages/shared && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/youtube.ts packages/shared/tests/youtube.test.ts packages/shared/vitest.config.ts packages/shared/package.json
git commit -m "feat(shared): add canonical YouTube video-ID module with client-safe subpath export"
```

---

## Task 3: Scope-aware body-image key matching in `@bomy/shared`

**Files:**

- Modify: `packages/shared/src/body-image-keys.ts`
- Create: `packages/shared/tests/body-image-keys.test.ts`
- Modify: `apps/web/src/app/seller/dashboard/products/actions.ts` (3 call sites)

**Interfaces:**

- Consumes: nothing new.
- Produces: `type BodyImageScope = { kind: "product"; id: string } | { kind: "store"; id: string }`,
  `classifyImageUrl(url: string, scope: BodyImageScope, publicOrigin: string): "managed" | "external" | "invalid"`,
  `extractManagedBodyImageKeys(html: string, scope: BodyImageScope, publicOrigin: string): Set<string>`.
  **Breaking change** from the current `(url, productId: string, publicOrigin)` signature — every
  call site in this repo is updated in this same task.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/tests/body-image-keys.test.ts
import { describe, expect, it } from "vitest"

import { classifyImageUrl, extractManagedBodyImageKeys } from "../src/body-image-keys.js"

const ORIGIN = "https://cdn.brandsofmalaysia.com"
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111"
const STORE_ID = "22222222-2222-2222-2222-222222222222"
const IMG_UUID = "33333333-3333-3333-3333-333333333333"

describe("classifyImageUrl — scoped", () => {
  it("classifies a product-shaped key as managed under a matching product scope", () => {
    const url = `${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe("managed")
  })

  it("classifies a store-shaped key as managed under a matching store scope", () => {
    const url = `${ORIGIN}/body/stores/${STORE_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "store", id: STORE_ID }, ORIGIN)).toBe("managed")
  })

  it("rejects a product-shaped key when checked against a store scope with the same id (Bob R1)", () => {
    const url = `${ORIGIN}/body/${STORE_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "store", id: STORE_ID }, ORIGIN)).toBe("invalid")
  })

  it("rejects a store-shaped key when checked against a product scope with the same id (Bob R1)", () => {
    const url = `${ORIGIN}/body/stores/${PRODUCT_ID}/${IMG_UUID}.jpg`
    expect(classifyImageUrl(url, { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe("invalid")
  })

  it("rejects a product-shaped key belonging to a different product id", () => {
    const url = `${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.jpg`
    const otherProductId = "44444444-4444-4444-4444-444444444444"
    expect(classifyImageUrl(url, { kind: "product", id: otherProductId }, ORIGIN)).toBe("invalid")
  })

  it("classifies a different-origin https URL as external", () => {
    expect(
      classifyImageUrl(
        "https://example.com/photo.jpg",
        { kind: "product", id: PRODUCT_ID },
        ORIGIN,
      ),
    ).toBe("external")
  })

  it("classifies an unparseable URL as invalid", () => {
    expect(classifyImageUrl("not a url", { kind: "product", id: PRODUCT_ID }, ORIGIN)).toBe(
      "invalid",
    )
  })
})

describe("extractManagedBodyImageKeys — scoped", () => {
  it("extracts only keys matching the given product scope", () => {
    const html = `<img src="${ORIGIN}/body/${PRODUCT_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "product", id: PRODUCT_ID }, ORIGIN)
    expect(keys.has(`body/${PRODUCT_ID}/${IMG_UUID}.jpg`)).toBe(true)
  })

  it("extracts only keys matching the given store scope", () => {
    const html = `<img src="${ORIGIN}/body/stores/${STORE_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "store", id: STORE_ID }, ORIGIN)
    expect(keys.has(`body/stores/${STORE_ID}/${IMG_UUID}.jpg`)).toBe(true)
  })

  it("does not extract a product-scoped key when scanning under a store scope (Bob R1)", () => {
    const html = `<img src="${ORIGIN}/body/${STORE_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "store", id: STORE_ID }, ORIGIN)
    expect(keys.size).toBe(0)
  })

  it("does not extract a store-scoped key when scanning under a product scope (Bob R1)", () => {
    const html = `<img src="${ORIGIN}/body/stores/${PRODUCT_ID}/${IMG_UUID}.jpg">`
    const keys = extractManagedBodyImageKeys(html, { kind: "product", id: PRODUCT_ID }, ORIGIN)
    expect(keys.size).toBe(0)
  })

  it("returns an empty set for empty html", () => {
    expect(extractManagedBodyImageKeys("", { kind: "product", id: PRODUCT_ID }, ORIGIN).size).toBe(
      0,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && pnpm test`
Expected: FAIL — current functions take `productId: string` as arg 2, so passing an object either
type-errors (caught at `pnpm typecheck` too) or, since this is plain JS at runtime, produces wrong
`match[1].toLowerCase()` comparisons. Confirm the failure is because scoping isn't implemented, not
a typo — read the actual assertion failures before moving on.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/body-image-keys.ts
import { parse } from "node-html-parser"

export type BodyImageScope = { kind: "product"; id: string } | { kind: "store"; id: string }

// Matches body/<uuid>/<uuid>.<ext> (product) or body/stores/<uuid>/<uuid>.<ext> (store).
// Group 1 is the optional "stores/" marker; group 2 is the owning entity's id.
const KEY_RE =
  /^body\/(stores\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i

function matchesScope(path: string, scope: BodyImageScope): boolean {
  const match = KEY_RE.exec(path)
  if (!match) return false
  const isStoreShaped = Boolean(match[1])
  const scopeIsStore = scope.kind === "store"
  if (isStoreShaped !== scopeIsStore) return false
  return match[2]!.toLowerCase() === scope.id.toLowerCase()
}

export function classifyImageUrl(
  url: string,
  scope: BodyImageScope,
  publicOrigin: string,
): "managed" | "external" | "invalid" {
  try {
    const u = new URL(url)
    const r2Origin = new URL(publicOrigin).origin
    if (u.origin === r2Origin) {
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      return matchesScope(path, scope) ? "managed" : "invalid"
    }
    return u.protocol === "https:" ? "external" : "invalid"
  } catch {
    return "invalid"
  }
}

export function extractManagedBodyImageKeys(
  html: string,
  scope: BodyImageScope,
  publicOrigin: string,
): Set<string> {
  if (!html) return new Set()
  const root = parse(html)
  const keys = new Set<string>()
  const r2Origin = new URL(publicOrigin).origin
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? ""
    try {
      const u = new URL(src)
      if (u.origin !== r2Origin) continue
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      if (matchesScope(path, scope)) keys.add(path)
    } catch {
      // skip unparseable URLs
    }
  }
  return keys
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && pnpm test`
Expected: all tests in both `youtube.test.ts` and `body-image-keys.test.ts` PASS.

- [ ] **Step 5: Update the 3 existing call sites in `products/actions.ts`**

Open `apps/web/src/app/seller/dashboard/products/actions.ts`. Find the three
`extractManagedBodyImageKeys(..., productId, S3_PUBLIC_URL)` calls (around lines 828, 829, 842 in
the current file — search for `extractManagedBodyImageKeys` to find them precisely, line numbers
will have shifted from earlier reading). Replace each bare `productId` argument with
`{ kind: "product" as const, id: productId }`:

```ts
const oldKeys = extractManagedBodyImageKeys(
  oldHtml,
  { kind: "product", id: productId },
  S3_PUBLIC_URL,
)
const newKeys = extractManagedBodyImageKeys(
  canonicalHtml ?? "",
  { kind: "product", id: productId },
  S3_PUBLIC_URL,
)
// ...
const currentKeys = extractManagedBodyImageKeys(
  current?.bodyHtml ?? "",
  { kind: "product", id: productId },
  S3_PUBLIC_URL,
)
```

- [ ] **Step 6: Typecheck to confirm no other call sites were missed**

Run: `cd apps/web && pnpm typecheck`
Expected: clean. If this fails with a type error on `extractManagedBodyImageKeys`/`classifyImageUrl`
anywhere else, that's a call site this step missed — find it via
`grep -rn "extractManagedBodyImageKeys\|classifyImageUrl" apps/web/src` and fix it the same way.

- [ ] **Step 7: Run the full product test suite to confirm no regression**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test seller-products --run
```

Expected: all existing product body/image tests still pass (they exercise `normalizeBodyHtml`,
which will be updated in Task 4 to pass the new scope shape through — if this task is done before
Task 4, `body-sanitizer.ts` still calls the OLD bare-productId signature at this point, which now
type-errors. **Do Task 4 immediately after this one, in the same sitting, before running this
verification** — Tasks 3 and 4 are sequential, not independently mergeable, because `normalizeBodyHtml`
is the one remaining caller of the old signature shape.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/body-image-keys.ts packages/shared/tests/body-image-keys.test.ts apps/web/src/app/seller/dashboard/products/actions.ts
git commit -m "feat(shared): scope body-image key matching to product|store, reject cross-scope keys"
```

---

## Task 4: Relocate + scope-generalize the body sanitizer

**Files:**

- Create: `apps/web/src/lib/body-sanitizer.ts` (moved from
  `apps/web/src/app/seller/dashboard/products/body-sanitizer.ts`)
- Delete: `apps/web/src/app/seller/dashboard/products/body-sanitizer.ts`
- Modify: `apps/web/tests/seller-products/body-sanitizer.test.ts` (update import path + calls)
- Modify: `apps/web/src/app/seller/dashboard/products/actions.ts` (import path + call signature)

**Interfaces:**

- Consumes: `YOUTUBE_VIDEO_ID_RE` from `@bomy/shared/youtube` (Task 2), `classifyImageUrl` +
  `BodyImageScope` from `@bomy/shared` (Task 3).
- Produces: `normalizeBodyHtml(raw: string, scope: BodyImageScope, publicOrigin: string): { ok: true; canonicalHtml: string | null } | { ok: false; error: string }`
  at `apps/web/src/lib/body-sanitizer.ts` — same behavior as today, scope-parameterized instead of
  `productId`-parameterized.

- [ ] **Step 1: Read the current test file to know what's already covered**

Run: `cat apps/web/tests/seller-products/body-sanitizer.test.ts` — note every existing test case
(sizes, allowed tags, image classification, video figure validation) so nothing is dropped in the
move, only the import path and the scope argument shape change.

- [ ] **Step 2: Move the sanitizer file, updating its internal imports**

Create `apps/web/src/lib/body-sanitizer.ts` with the exact same content as the current
`apps/web/src/app/seller/dashboard/products/body-sanitizer.ts`, with three changes:

1. Its own local `VIDEO_ID_RE` constant is removed; import instead:
   ```ts
   import { YOUTUBE_VIDEO_ID_RE } from "@bomy/shared/youtube"
   ```
   and the figure-validation line changes from `!VIDEO_ID_RE.test(videoId)` to
   `!YOUTUBE_VIDEO_ID_RE.test(videoId)`.
2. `classifyImageUrl` import stays `from "@bomy/shared"` (root, unchanged per Task 3/spec §3.1),
   but its call site changes:
   ```ts
   export function normalizeBodyHtml(
     raw: string,
     scope: BodyImageScope,
     publicOrigin: string,
   ): { ok: true; canonicalHtml: string | null } | { ok: false; error: string } {
   ```
   and inside, `classifyImageUrl(src, productId, publicOrigin)` becomes
   `classifyImageUrl(src, scope, publicOrigin)`. Add
   `import type { BodyImageScope } from "@bomy/shared"` at the top.
3. `import "server-only"` stays as the first line — unchanged, this is exactly why it moves to
   `apps/web/src/lib/` and not `@bomy/shared` (spec §3.1).

Delete `apps/web/src/app/seller/dashboard/products/body-sanitizer.ts`.

- [ ] **Step 3: Update the test file's import and calls**

Edit `apps/web/tests/seller-products/body-sanitizer.test.ts`:

- Change the import from `../../src/app/seller/dashboard/products/body-sanitizer` (or whatever the
  current relative path is — check the actual current import line) to
  `../../src/lib/body-sanitizer`.
- Every `normalizeBodyHtml(raw, someProductId, origin)` call in the test file becomes
  `normalizeBodyHtml(raw, { kind: "product", id: someProductId }, origin)`.

- [ ] **Step 4: Update `products/actions.ts`'s import and call**

In `apps/web/src/app/seller/dashboard/products/actions.ts`:

```ts
const { normalizeBodyHtml } = await import("@/lib/body-sanitizer")
```

(was `await import("./body-sanitizer")`). And its call site:

```ts
const normalized = normalizeBodyHtml(bodyHtml, { kind: "product", id: productId }, S3_PUBLIC_URL)
```

- [ ] **Step 5: Run the sanitizer test suite**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test body-sanitizer --run
```

Expected: all tests pass, same count as before the move (confirm the count against what you read
in Step 1 — a dropped test would still show as fewer files/tests passing, not a failure).

- [ ] **Step 6: Run the full product test suite (deferred from Task 3 Step 7)**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test seller-products --run
```

Expected: all pass — this is the real regression check for Tasks 3+4 together.

- [ ] **Step 7: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/body-sanitizer.ts apps/web/tests/seller-products/body-sanitizer.test.ts apps/web/src/app/seller/dashboard/products/actions.ts
git rm apps/web/src/app/seller/dashboard/products/body-sanitizer.ts
git commit -m "refactor(web): relocate body sanitizer to lib/, generalize to BodyImageScope"
```

---

## Task 5: Collapse the six duplicate YouTube-ID regexes

**Files:**

- Modify: `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx`
- Modify: `apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts`
- (`video-embed.tsx` and `product-body-editor.tsx`'s copies are handled in Task 6/7, since those
  files relocate/generalize anyway — doing the regex swap here would be redundant churn.)

**Interfaces:**

- Consumes: `YOUTUBE_VIDEO_ID_RE` from `@bomy/shared/youtube` (Task 2).

- [ ] **Step 1: Update `body-renderer.tsx` (Bob R1's finding)**

Open `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx`. Remove the local
`const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/` (line 7). Add:

```ts
import { YOUTUBE_VIDEO_ID_RE } from "@bomy/shared/youtube"
```

Update the figure-case check (line 96) from `!VIDEO_ID_RE.test(videoId)` to
`!YOUTUBE_VIDEO_ID_RE.test(videoId)`.

- [ ] **Step 2: Update `youtube-embed-extension.ts` (the sixth location, found during plan-writing)**

Open `apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts`. Remove the
local `const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/` (line 3). Add:

```ts
import { YOUTUBE_VIDEO_ID_RE } from "@bomy/shared/youtube"
```

Update the command guard inside `addCommands` from `if (!VIDEO_ID_RE.test(videoId)) return false`
to `if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return false`.

- [ ] **Step 3: Write a regression test proving the tightened rule actually took effect**

There is no existing test file for `youtube-embed-extension.ts` or `body-renderer.tsx`'s figure
case specifically. Add one for the render-time path, since that's the one Bob's review caught and
it's easy to silently regress:

```ts
// apps/web/tests/products/body-renderer.test.ts
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { renderBodyHtml } from "@/app/products/[storeSlug]/[productSlug]/body-renderer"

describe("body-renderer figure video-ID validation", () => {
  it("does not render a figure whose data-video-id is fewer than 11 characters", () => {
    // A pre-existing bug: the old loose regex (1-10 chars) would have accepted this.
    const html =
      '<figure data-video-provider="youtube" data-video-id="short" data-video-title="x"></figure>'
    const markup = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(markup).not.toContain("short")
  })

  it("renders a figure with a valid 11-character data-video-id", () => {
    const html =
      '<figure data-video-provider="youtube" data-video-id="dQw4w9WgXcQ" data-video-title="x"></figure>'
    const markup = renderToStaticMarkup(renderBodyHtml(html) as React.ReactElement)
    expect(markup).toContain("dQw4w9WgXcQ")
  })
})
```

`renderBodyHtml` (confirmed at `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx:172`)
returns a `ReactNode`, not a string — `renderToStaticMarkup` converts it to an HTML string so
`.toContain()` assertions work. The `data-video-id` in the second test asserts the ID is _present_
in the rendered `<figure>`'s child text, since `VideoEmbed`'s not-yet-clicked state sets
`data-video-id={videoId}` on its button (`video-embed.tsx:27`).

- [ ] **Step 4: Run the test, confirm it passes**

Run: `pnpm --filter @bomy/web test body-renderer --run`
Expected: PASS (Steps 1-2 already applied the fix before this test was written, so this is
confirming correctness, not doing red-green-refactor in strict order for this particular file —
acceptable here since the fix is a one-line swap, not new logic). If this test had been written
_before_ Steps 1-2, it would have FAILED on the old `{1,11}` regex, since `"short"` (5 chars) would
have passed validation and rendered.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/products/\[storeSlug\]/\[productSlug\]/body-renderer.tsx apps/web/src/app/seller/dashboard/products/\[id\]/edit/youtube-embed-extension.ts apps/web/tests/products/body-renderer.test.ts
git commit -m "fix(web): use canonical exactly-11-char YouTube ID validation in renderer + editor extension"
```

---

## Task 6: Relocate `VideoEmbed` to a shared component location

**Files:**

- Create: `apps/web/src/components/video-embed.tsx` (moved from
  `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx`)
- Delete: `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx`
- Modify: `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx` (import path)
- Modify: wherever else imports `VideoEmbed` — check first.

**Interfaces:**

- Produces: `VideoEmbed({ videoId, title }: { videoId: string; title?: string | null })` at
  `apps/web/src/components/video-embed.tsx`, importable as `@/components/video-embed`.

- [ ] **Step 1: Find every current import of `VideoEmbed`**

Run: `grep -rn "from.*video-embed\|VideoEmbed" apps/web/src apps/web/tests`
Note every file that imports it — expect `body-renderer.tsx` at minimum; there may be a test file
too.

- [ ] **Step 2: Move the file, replacing its local regex with the shared one**

Create `apps/web/src/components/video-embed.tsx` with the same content as the current
`video-embed.tsx`, except:

- Remove `const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/`.
- Add `import { YOUTUBE_VIDEO_ID_RE } from "@bomy/shared/youtube"`.
- Change `if (!VIDEO_ID_RE.test(videoId)) return null` to
  `if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return null`.

Delete `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx`.

- [ ] **Step 3: Update every import found in Step 1**

Change each to `import { VideoEmbed } from "@/components/video-embed"`.

- [ ] **Step 4: Run the product page test suite**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test products --run
```

Expected: all pass, no import errors.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/video-embed.tsx
git rm "apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx"
git add -u
git commit -m "refactor(web): relocate VideoEmbed to shared components, use canonical ID validator"
```

---

## Task 7: Generalize the WYSIWYG body editor (prop-injected save/upload)

**Files:**

- Create: `apps/web/src/components/body-editor.tsx` (generalized from
  `apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx`)
- Delete: `apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx`
- Modify: `apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx`
- Modify: `apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts` (import
  path only, if it currently lives beside `product-body-editor.tsx` and is imported relatively —
  check; it can stay where it is if `body-editor.tsx` imports it with a relative path up to that
  directory, but the cleaner move is relocating it alongside, see Step 1)
- Modify: `apps/web/src/app/seller/dashboard/products/[id]/edit/image-upload-extension.ts` (same
  consideration as above — check its actual location and update the import path in the new file)

**Interfaces:**

- Consumes: nothing new from earlier tasks directly, but its two new props are exactly the return
  types of `saveProductBody`/`getBodyImageUploadUrl` (existing, in `products/actions.ts`) and, once
  Task 8 lands, `saveStoreBody`/`getStoreBodyImageUploadUrl`.
- Produces:

  ```ts
  interface BodyEditorProps {
    initialHtml: string | null
    initialRevision: number
    saveBody: (
      html: string,
      revision: number,
    ) => Promise<{ ok: true; revision: number; html: string | null } | { ok: false; error: string }>
    getUploadUrl: (
      contentType: string,
      contentLength: number,
    ) => Promise<
      | { ok: true; uploadUrl: string; key: string; publicUrl: string; expiresAt: Date }
      | { ok: false; error: string }
    >
    onDirtyChange?: (dirty: boolean) => void
    onUploadStateChange?: (uploading: boolean) => void
  }
  export function BodyEditor(props: BodyEditorProps): JSX.Element
  ```

  at `apps/web/src/components/body-editor.tsx`, importable as `@/components/body-editor`.

- [ ] **Step 1: Move `youtube-embed-extension.ts` (already fixed by Task 5) alongside
      `body-editor.tsx`**

These two extensions are TipTap plumbing with no product-specific logic in `youtube-embed-extension.ts`
(confirmed in Task 5 — it only validates an ID, doesn't know about products). Move it verbatim
(content already fixed by Task 5's regex swap) from
`apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts` to
`apps/web/src/components/youtube-embed-extension.ts`. `image-upload-extension.ts` is handled
separately in Step 2 below because, unlike the YouTube extension, it has a real product-specific
field (`productId`) that must be generalized, not just relocated.

- [ ] **Step 2: Generalize `image-upload-extension.ts` to accept an injected `getUploadUrl`, drop
      its `productId` option**

Today `ImageUploadOptions` (`apps/web/src/app/seller/dashboard/products/[id]/edit/image-upload-extension.ts:13-20`)
carries `productId: string` and `getUploadUrl: typeof getBodyImageUploadUrl` (a 3-arg function:
`(productId, contentType, contentLength)`), and its command calls
`options.getUploadUrl(options.productId, file.type, file.size)` (line 67). Once `getUploadUrl` is
injected pre-bound to a scope (product or store) by the parent `BodyEditor`, the extension no
longer needs to know `productId` at all — it just forwards `(contentType, contentLength)`.

Create `apps/web/src/components/image-upload-extension.ts` with the same content as the current
file, except:

```ts
// Before:
// import type { getBodyImageUploadUrl } from "../../actions"
// interface ImageUploadOptions {
//   productId: string
//   getUploadUrl: typeof getBodyImageUploadUrl
//   ...
// }
// options.getUploadUrl(options.productId, file.type, file.size)

// After:
interface ImageUploadOptions {
  getUploadUrl: (
    contentType: string,
    contentLength: number,
  ) => Promise<
    | { ok: true; uploadUrl: string; key: string; publicUrl: string; expiresAt: Date }
    | { ok: false; error: string }
  >
  onUploadStart: () => void
  onUploadProgress: (pct: number) => void
  onUploadComplete: () => void
  onUploadError: () => void
}
```

and the call site (still inside `addCommands` → `uploadBodyImage`) becomes:

```ts
options
  .getUploadUrl(file.type, file.size)
  .then((result) => {
    // ...unchanged from here
```

The `import type { getBodyImageUploadUrl } from "../../actions"` line is deleted entirely — the
extension no longer references that action at all, only the shape of its return value (inlined
above).

Delete `apps/web/src/app/seller/dashboard/products/[id]/edit/image-upload-extension.ts`.

- [ ] **Step 3: Create the generalized `BodyEditor` component**

Create `apps/web/src/components/body-editor.tsx` with the same content as the current
`product-body-editor.tsx`, with these changes:

- Rename the exported function from `ProductBodyEditor` to `BodyEditor`.
- Replace the `Props` interface's `productId: string` field with `saveBody` and `getUploadUrl`
  (typed exactly as in the Interfaces section above).
- Remove `import { getBodyImageUploadUrl, saveProductBody } from "../../actions"`.
- Replace every internal call to `saveProductBody(productId, html, revision)` with
  `saveBody(html, revision)`.
- Change the `ImageUploadExtension.configure({ ... })` call (currently passes `productId` and
  `getUploadUrl: getBodyImageUploadUrl`): drop the `productId:` line entirely, and change
  `getUploadUrl: getBodyImageUploadUrl` to `getUploadUrl` (the component's own injected prop,
  already scope-bound by whoever renders `<BodyEditor>` — Task 7 Step 5 shows the product page's
  binding).
- Update the relative imports for `YoutubeEmbedExtension`/`ImageUploadExtension` — unchanged as
  `"./youtube-embed-extension"`/`"./image-upload-extension"` specifiers, since both now live
  alongside `body-editor.tsx` in `apps/web/src/components/` per Steps 1–2.
- In `EmbedYouTubeButton` (the toolbar button component defined at the bottom of the file), replace
  its inline extraction logic:

  ```ts
  // Before:
  const idMatch =
    input.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/) ??
    input.match(/^([a-zA-Z0-9_-]{11})$/)
  const videoId = idMatch?.[1]

  // After:
  const videoId = extractYoutubeVideoId(input)
  ```

  and add `import { extractYoutubeVideoId } from "@bomy/shared/youtube"` at the top of the file.
  This is the sixth and final call site from spec §2's duplicate-regex inventory — the extraction
  logic here was already _correct_ (exactly 11 chars), but not shared, so a future edit to the
  canonical rule wouldn't have reached it.

Delete `apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx`.

- [ ] **Step 4: Update the product edit page to bind product-specific actions**

Open `apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx`. Change:

```ts
import { ProductBodyEditor } from "./product-body-editor"
```

to:

```ts
import { BodyEditor } from "@/components/body-editor"
import { getBodyImageUploadUrl, getProductForEdit, saveProductBody } from "../../actions"
```

(merge with the existing `getProductForEdit` import line rather than duplicating it — check the
current import statement first). Change the JSX usage from:

```tsx
<ProductBodyEditor
  productId={product.id}
  initialHtml={product.bodyHtml ?? null}
  initialRevision={product.bodyRevision}
/>
```

to:

```tsx
<BodyEditor
  initialHtml={product.bodyHtml ?? null}
  initialRevision={product.bodyRevision}
  saveBody={(html, revision) => saveProductBody(product.id, html, revision)}
  getUploadUrl={(contentType, contentLength) =>
    getBodyImageUploadUrl(product.id, contentType, contentLength)
  }
/>
```

- [ ] **Step 5: Run the product edit page test suite**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test seller-products --run
```

Expected: all pass — this is the real behavioral check that the prop-injection refactor didn't
change anything observable for the product editing flow.

- [ ] **Step 6: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/body-editor.tsx apps/web/src/components/youtube-embed-extension.ts apps/web/src/components/image-upload-extension.ts "apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx"
git rm "apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx" "apps/web/src/app/seller/dashboard/products/[id]/edit/youtube-embed-extension.ts" "apps/web/src/app/seller/dashboard/products/[id]/edit/image-upload-extension.ts"
git commit -m "refactor(web): generalize ProductBodyEditor to prop-injected BodyEditor"
```

---

## Task 8: Store body-save and body-image-upload server actions

**Files:**

- Create: `apps/web/src/app/seller/dashboard/settings/body-actions.ts`
- Test: `apps/web/tests/seller-settings/body-actions.test.ts`

**Interfaces:**

- Consumes: `normalizeBodyHtml` (Task 4), `extractManagedBodyImageKeys`/`BodyImageScope` (Task 3),
  `createBodyPresignedPutUrl`/`buildPublicUrl`/`deleteObject` (existing, `@/lib/s3`).
- Produces: `saveStoreBody(bodyHtml: string, revision: number)`,
  `getStoreBodyImageUploadUrl(contentType: string, contentLength: number)` — same return shapes as
  the product equivalents (see Task 7's Interfaces block), consumed by Task 9's settings-form.

- [ ] **Step 1: Write the failing ownership test**

```ts
// apps/web/tests/seller-settings/body-actions.test.ts
import { randomUUID } from "node:crypto"

import { schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

describe.skipIf(!shouldRun)("saveStoreBody / getStoreBodyImageUploadUrl — ownership", () => {
  let db: ReturnType<typeof import("@bomy/db").makeDb>
  let ownerId: string
  let otherUserId: string
  let storeId: string

  beforeAll(async () => {
    const { makeDb } = await import("@bomy/db")
    process.env["DATABASE_URL"] = DATABASE_URL as string
    db = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    otherUserId = randomUUID()
    storeId = randomUUID()
    await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "test seed" }, async (tx) => {
      await tx.insert(schema.users).values([
        { id: ownerId, email: `${ownerId}@test.bomy`, role: "seller_owner" },
        { id: otherUserId, email: `${otherUserId}@test.bomy`, role: "seller_owner" },
      ])
      await tx.insert(schema.stores).values({
        id: storeId,
        ownerId,
        name: "Body Actions Test Store",
        slug: `body-actions-${storeId}`,
        status: "active",
      })
    })
  })

  afterAll(async () => {
    await db.close()
  })

  it("rejects a caller who does not own the target store", async () => {
    const { auth } = await import("@/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: otherUserId, role: "seller_owner" },
    } as never)

    const { saveStoreBody } = await import("../../src/app/seller/dashboard/settings/body-actions")
    const result = await saveStoreBody("<p>hello</p>", 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("not_found")

    // The store's body_html must be unchanged.
    const [row] = await withAdmin(db.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ bodyHtml: schema.stores.bodyHtml })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.bodyHtml).toBeNull()
  })

  it("allows the store owner to save body html", async () => {
    const { auth } = await import("@/auth")
    vi.mocked(auth).mockResolvedValue({ user: { id: ownerId, role: "seller_owner" } } as never)

    const { saveStoreBody } = await import("../../src/app/seller/dashboard/settings/body-actions")
    const result = await saveStoreBody("<p>Our brand story.</p>", 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.revision).toBe(1)
      expect(result.html).toContain("Our brand story.")
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test body-actions --run
```

Expected: FAIL — `Cannot find module '../../src/app/seller/dashboard/settings/body-actions'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/app/seller/dashboard/settings/body-actions.ts
"use server"

import { randomUUID } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

import { auth } from "@/auth"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

async function requireSeller() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")
  return session
}

const BODY_IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]
const BODY_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export async function saveStoreBody(
  bodyHtml: string,
  revision: number,
): Promise<{ ok: true; revision: number; html: string | null } | { ok: false; error: string }> {
  const session = await requireSeller()
  const userId = session.user.id

  if (!Number.isSafeInteger(revision) || revision < 0) {
    return { ok: false, error: "invalid_revision" }
  }

  const S3_PUBLIC_URL = process.env["S3_PUBLIC_URL"] ?? ""
  try {
    const u = new URL(S3_PUBLIC_URL)
    if (u.protocol !== "https:") throw new Error()
  } catch {
    return { ok: false, error: "misconfigured" }
  }

  const txResult = await withTenant(getDb(), { userId, userRole: "seller_owner" }, async (tx) => {
    const [store] = await tx
      .select({
        id: schema.stores.id,
        slug: schema.stores.slug,
        bodyRevision: schema.stores.bodyRevision,
        bodyHtml: schema.stores.bodyHtml,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
      .for("update", { of: schema.stores })
      .limit(1)
    if (!store) return { ok: false as const, error: "not_found" }
    if (store.bodyRevision !== revision) return { ok: false as const, error: "conflict" }

    const { normalizeBodyHtml } = await import("@/lib/body-sanitizer")
    const normalized = normalizeBodyHtml(bodyHtml, { kind: "store", id: store.id }, S3_PUBLIC_URL)
    if (!normalized.ok) return normalized
    const { canonicalHtml } = normalized

    await tx
      .update(schema.stores)
      .set({ bodyHtml: canonicalHtml, bodyRevision: revision + 1, updatedAt: new Date() })
      .where(eq(schema.stores.id, store.id))

    return {
      ok: true as const,
      storeId: store.id,
      storeSlug: store.slug,
      canonicalHtml,
      oldBodyHtml: store.bodyHtml,
    }
  })

  if (!txResult.ok) return txResult

  const { storeId, storeSlug, canonicalHtml, oldBodyHtml } = txResult

  revalidatePath("/seller/dashboard/settings")
  revalidatePath(`/brands/${storeSlug}`)

  if (oldBodyHtml) {
    after(async () => {
      try {
        const { extractManagedBodyImageKeys } = await import("@bomy/shared")
        const { deleteObject } = await import("@/lib/s3")
        const scope = { kind: "store" as const, id: storeId }
        const oldKeys = extractManagedBodyImageKeys(oldBodyHtml, scope, S3_PUBLIC_URL)
        const newKeys = extractManagedBodyImageKeys(canonicalHtml ?? "", scope, S3_PUBLIC_URL)
        const [current] = await withAdmin(
          getDb(),
          { userId: SYSTEM_ACTOR, reason: "body-image-orphan-cleanup" },
          (tx) =>
            tx
              .select({ bodyHtml: schema.stores.bodyHtml })
              .from(schema.stores)
              .where(eq(schema.stores.id, storeId)),
        )
        const currentKeys = extractManagedBodyImageKeys(
          current?.bodyHtml ?? "",
          scope,
          S3_PUBLIC_URL,
        )
        for (const key of oldKeys) {
          if (!newKeys.has(key) && !currentKeys.has(key)) {
            try {
              await deleteObject(key)
            } catch (err) {
              console.error(`[saveStoreBody] R2 delete failed for key ${key}:`, err)
            }
          }
        }
      } catch (err) {
        console.error("[saveStoreBody] Orphan image cleanup failed:", err)
      }
    })
  }

  return { ok: true, revision: revision + 1, html: canonicalHtml }
}

export async function getStoreBodyImageUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<
  | { ok: true; uploadUrl: string; key: string; publicUrl: string; expiresAt: Date }
  | { ok: false; error: string }
> {
  const session = await requireSeller()
  const userId = session.user.id

  if (!BODY_IMAGE_ALLOWED_TYPES.includes(contentType)) {
    return { ok: false, error: "invalid_type" }
  }
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > 2 * 1024 * 1024
  ) {
    return { ok: false, error: "invalid_size" }
  }

  const result = await withTenant(getDb(), { userId, userRole: "seller_owner" }, async (tx) => {
    const [store] = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.ownerId, userId), eq(schema.stores.status, "active")))
      .for("update", { of: schema.stores })
      .limit(1)
    if (!store) return { ok: false as const, error: "not_found" }

    // Same lock key as the product upload flow (products/actions.ts) — deliberately not
    // scoped separately, so a seller's product-upload-signing and store-upload-signing
    // serialize against each other rather than racing independently.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('body-img-sign:' || ${userId}))`)

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bodyImageUploadLog)
      .where(
        and(
          eq(schema.bodyImageUploadLog.userId, userId),
          sql`${schema.bodyImageUploadLog.createdAt} > now() - interval '1 hour'`,
        ),
      )
    const count = countRows[0]?.count ?? 0
    if (count >= 20) return { ok: false as const, error: "rate_limited" }

    await tx.insert(schema.bodyImageUploadLog).values({ userId })
    return { ok: true as const, storeId: store.id }
  })

  if (!result.ok) return result

  const ext = BODY_MIME_TO_EXT[contentType]!
  const key = `body/stores/${result.storeId}/${randomUUID()}.${ext}`
  const { createBodyPresignedPutUrl, buildPublicUrl } = await import("@/lib/s3")
  const publicUrl = buildPublicUrl(key)
  const { url: uploadUrl, expiresAt } = await createBodyPresignedPutUrl(
    key,
    contentType,
    contentLength,
  )
  return { ok: true, uploadUrl, key, publicUrl, expiresAt }
}
```

`sql` is imported statically from `drizzle-orm` at the top of the file (Step 3's import block),
matching `products/actions.ts:3`'s exact convention (`import { and, asc, eq, isNull, max, or, sql } from "drizzle-orm"`)
rather than a dynamic per-call import.

- [ ] **Step 4: Run test to verify it passes**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test body-actions --run
```

Expected: both tests PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/seller/dashboard/settings/body-actions.ts apps/web/tests/seller-settings/body-actions.test.ts
git commit -m "feat(web): add saveStoreBody / getStoreBodyImageUploadUrl server actions"
```

---

## Task 9: Video URL save action

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/settings/actions.ts`
- Modify: `apps/web/tests/seller-settings/actions.test.ts` (existing file — append a new describe
  block; it already tests the sibling `updateStoreSettings` action in this same module)

**Interfaces:**

- Consumes: `extractYoutubeVideoId` from `@bomy/shared/youtube` (Task 2).
- Produces: `updateStoreVideo(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`.

`apps/web/tests/seller-settings/actions.test.ts` already exists and tests `updateStoreSettings`
from this exact file. It sets up its mocks at module scope (`vi.mock("next/navigation", ...)`,
`vi.mock("next/cache", ...)`, `vi.mock("@/auth", ...)`), imports `auth` and casts it to
`mockAuth`, and has a local `fd(fields: Record<string, string>): FormData` helper. The new test
below reuses all of that — it's appended as a second `describe` block in the same file, not a new
file, with its own `beforeAll`/`afterAll` seed (its own store, separate from `updateStoreSettings`'s
seed) matching the existing block's exact seeding style.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/seller-settings/actions.test.ts`, after the existing
`describe.skipIf(!shouldRun)("updateStoreSettings action", ...)` block (the file's existing
imports — `randomUUID`, `eq`, vitest helpers, `makeDb`/`schema`/`withAdmin`, `auth`, `mockAuth`,
`fd`, `SYSTEM_ACTOR`, `DATABASE_URL`, `shouldRun` — already cover everything needed; add one import
line for `updateStoreVideo` alongside the existing `updateStoreSettings` import):

```ts
import {
  updateStoreSettings,
  updateStoreVideo,
} from "../../src/app/seller/dashboard/settings/actions"
```

```ts
describe.skipIf(!shouldRun)("updateStoreVideo action", () => {
  let testDb: ReturnType<typeof makeDb>
  let sellerId: string
  let storeId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    sellerId = randomUUID()

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "video settings test seed" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: sellerId,
          email: `${sellerId}@test.bomy`,
          role: "seller_owner",
          name: "Video Settings Seller",
        })
        const [store] = await tx
          .insert(schema.stores)
          .values({
            ownerId: sellerId,
            name: "Video Settings Test Store",
            slug: `video-settings-${randomUUID().slice(0, 8)}`,
            status: "active",
          })
          .returning({ id: schema.stores.id })
        storeId = store!.id
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "video settings test cleanup" },
      async (tx) => {
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      },
    )
    await testDb.close()
  })

  it("extracts and saves a valid YouTube URL as a bare video ID", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(
      fd({ videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    )
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ videoId: schema.stores.videoId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.videoId).toBe("dQw4w9WgXcQ")
  })

  it("rejects an unparseable video URL without writing anything", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(fd({ videoUrl: "not a video url" }))
    expect(result.ok).toBe(false)
  })

  it("normalizes an empty submission to NULL (clearing a previously-set video)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    await updateStoreVideo(fd({ videoUrl: "https://youtu.be/dQw4w9WgXcQ" }))

    mockAuth.mockResolvedValueOnce({ user: { id: sellerId, role: "seller_owner" } })
    const result = await updateStoreVideo(fd({ videoUrl: "" }))
    expect(result).toEqual({ ok: true })

    const [row] = await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "verify" }, (tx) =>
      tx
        .select({ videoId: schema.stores.videoId })
        .from(schema.stores)
        .where(eq(schema.stores.id, storeId)),
    )
    expect(row?.videoId).toBeNull()
  })

  it("rejects unauthenticated request", async () => {
    mockAuth.mockResolvedValueOnce(null)
    const result = await updateStoreVideo(fd({ videoUrl: "https://youtu.be/dQw4w9WgXcQ" }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Unauthorized")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test seller-settings --run
```

Expected: FAIL — `updateStoreVideo` is not exported.

- [ ] **Step 3: Write the implementation**

Open `apps/web/src/app/seller/dashboard/settings/actions.ts`. Add, following the exact style of
the existing `updateStoreSettings` in the same file (`auth()` + inline role check, `withTenant`,
active-store-owned-by-user lookup — do not introduce `requireSeller()`/redirect-style auth here,
this file's own established convention is the return-typed-error style):

```ts
import { extractYoutubeVideoId } from "@bomy/shared/youtube"

export async function updateStoreVideo(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session || session.user.role !== "seller_owner") {
    return { ok: false, error: "Unauthorized" }
  }

  const rawUrl = formData.get("videoUrl")
  if (typeof rawUrl !== "string") {
    return { ok: false, error: "Invalid input." }
  }
  const trimmed = rawUrl.trim()

  let videoId: string | null = null
  if (trimmed.length > 0) {
    videoId = extractYoutubeVideoId(trimmed)
    if (!videoId) {
      return { ok: false, error: "Could not find a valid YouTube video in that URL." }
    }
  }

  let updateError: string | null = null

  try {
    await withTenant(
      getDb(),
      { userId: session.user.id, userRole: session.user.role },
      async (tx) => {
        const [store] = await tx
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(
            and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")),
          )
          .limit(1)

        if (!store) {
          updateError = "No active store found."
          return
        }

        await tx
          .update(schema.stores)
          .set({ videoId, updatedAt: new Date() })
          .where(
            and(
              eq(schema.stores.id, store.id),
              eq(schema.stores.ownerId, session.user.id),
              eq(schema.stores.status, "active"),
            ),
          )
      },
    )
  } catch {
    updateError = "Failed to save video URL."
  }

  if (updateError) return { ok: false, error: updateError }
  return { ok: true }
}
```

Check the existing imports at the top of `actions.ts` (`and`, `eq`, `schema`, `withTenant`,
`auth`, `getDb` should already be imported for `updateStoreSettings` — only
`extractYoutubeVideoId` is new).

- [ ] **Step 4: Run test to verify it passes**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test seller-settings --run
```

Expected: all pass, including the pre-existing `updateStoreSettings` tests (confirm no regression).

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/seller/dashboard/settings/actions.ts apps/web/tests/seller-settings/actions.test.ts
git commit -m "feat(web): add updateStoreVideo server action"
```

---

## Task 10: Settings page UI — Brand Story editor + Video URL field

**Files:**

- Modify: `apps/web/src/app/seller/dashboard/settings/settings-form.tsx`
- Modify: `apps/web/src/app/seller/dashboard/settings/page.tsx`

**Interfaces:**

- Consumes: `BodyEditor` (Task 7), `saveStoreBody`/`getStoreBodyImageUploadUrl` (Task 8),
  `updateStoreVideo` (Task 9).

- [ ] **Step 1: Fetch the new columns in `page.tsx`**

Edit `apps/web/src/app/seller/dashboard/settings/page.tsx` — add `bodyHtml`, `bodyRevision`,
`videoId` to the existing store-row `select`:

```ts
const [store] = await tx
  .select({
    id: schema.stores.id,
    excerpt: schema.stores.excerpt,
    bodyHtml: schema.stores.bodyHtml,
    bodyRevision: schema.stores.bodyRevision,
    videoId: schema.stores.videoId,
  })
  .from(schema.stores)
  .where(and(eq(schema.stores.ownerId, session.user.id), eq(schema.stores.status, "active")))
  .limit(1)
```

Pass the new fields to `<SettingsForm>`:

```tsx
<SettingsForm
  currentExcerpt={storeRow.excerpt ?? ""}
  currentBodyHtml={storeRow.bodyHtml}
  currentBodyRevision={storeRow.bodyRevision}
  currentVideoId={storeRow.videoId}
  allCategories={allCategories}
  assignedCategoryIds={[...assignedIds]}
/>
```

- [ ] **Step 2: Add the two new cards to `settings-form.tsx`**

Update the `SettingsForm` props interface:

```ts
export function SettingsForm({
  currentExcerpt,
  currentBodyHtml,
  currentBodyRevision,
  currentVideoId,
  allCategories,
  assignedCategoryIds,
}: {
  currentExcerpt: string
  currentBodyHtml: string | null
  currentBodyRevision: number
  currentVideoId: string | null
  allCategories: { id: string; name: string }[]
  assignedCategoryIds: string[]
}) {
```

Add imports:

```ts
import { BodyEditor } from "@/components/body-editor"
import { getStoreBodyImageUploadUrl, saveStoreBody } from "./body-actions"
import { updateStoreVideo } from "./actions"
```

Add a Video URL card, following the exact structural pattern of the existing "Store Introduction"
card (own `useActionState`, own error/success banners):

```tsx
const [videoState, videoAction, videoPending] = useActionState(
  (_prev: State, formData: FormData) => updateStoreVideo(formData),
  null,
)
```

```tsx
{
  /* Video */
}
;<Card>
  <CardContent className="p-6">
    <h2 className="mb-4 text-sm font-semibold text-foreground">Storefront Video</h2>
    <form action={videoAction} className="space-y-4">
      {videoState && !videoState.ok && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {videoState.error}
        </div>
      )}
      {videoState?.ok && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          Video saved.
        </div>
      )}
      <div>
        <Label htmlFor="videoUrl" className="mb-1 block text-sm font-medium">
          YouTube video URL{" "}
          <span className="font-normal text-muted-foreground">
            (shown on your storefront page — leave blank to remove)
          </span>
        </Label>
        <Input
          id="videoUrl"
          name="videoUrl"
          type="url"
          defaultValue={currentVideoId ? `https://youtu.be/${currentVideoId}` : ""}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <Button type="submit" disabled={videoPending}>
        {videoPending ? "Saving…" : "Save"}
      </Button>
    </form>
  </CardContent>
</Card>
```

Add the `Input` import if not already present: `import { Input } from "@/components/ui/input"`.

Add a Brand Story card using `BodyEditor`, bound to the store actions:

```tsx
{
  /* Brand Story */
}
;<Card>
  <CardContent className="p-6">
    <h2 className="mb-4 text-sm font-semibold text-foreground">Brand Story</h2>
    <p className="mb-4 text-xs text-muted-foreground">
      Shown on your storefront page. Supports formatting and inline images.
    </p>
    <BodyEditor
      initialHtml={currentBodyHtml}
      initialRevision={currentBodyRevision}
      saveBody={saveStoreBody}
      getUploadUrl={getStoreBodyImageUploadUrl}
    />
  </CardContent>
</Card>
```

- [ ] **Step 3: Manually verify in the dev server**

Run: `pnpm dev` (from `app/`), sign in as a seller, go to `/seller/dashboard/settings`. Confirm:
the Brand Story editor loads with formatting toolbar, saving text works, uploading an inline image
works (needs R2 configured — already live per this project's current state), the Video URL field
accepts a pasted YouTube link and shows a saved confirmation, and clearing it and saving removes
the video. Stop the dev server when done (`Ctrl+C` or kill the relevant port).

- [ ] **Step 4: Run the settings test suite**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test seller-settings --run
```

Expected: all pass.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/seller/dashboard/settings/settings-form.tsx apps/web/src/app/seller/dashboard/settings/page.tsx
git commit -m "feat(web): add Brand Story editor and Video URL field to seller settings"
```

---

## Task 11: Storefront queries — category-grouped products + brand story/video

**Files:**

- Modify: `apps/web/src/app/brands/[slug]/queries.ts`
- Modify: `apps/web/tests/storefront/queries.test.ts` (existing file — it already tests `getStorePage`
  with 3 tests at lines 175–196 that assume today's flat `products` array; one of those three breaks
  under the new shape and must be fixed in place, not left to fail. A new `describe` block is
  appended for the category-grouping behavior itself, reusing this file's existing seed conventions.)

**Interfaces:**

- Produces: `getStorePage(slug: string)` returns
  `{ store: { id, name, slug, bodyHtml, videoId }, categorySections: Array<{ category: { name: string; slug: string }; products: Array<{ id; name; slug; coverImageUrl }>; hasMore: boolean }>, uncategorized: { products: [...]; hasMore: boolean } } | null`
  — note the return shape changes from the current flat `products` array to grouped sections; this
  is a breaking change to `getStorePage`'s consumers, all within this same task/Task 12.

`apps/web/tests/storefront/queries.test.ts` already imports `getStorePage` from
`@/app/brands/[slug]/queries` and has three tests against it inside the file's first
`describe.skipIf(!shouldRun)("storefront queries", ...)` block: "returns store with active
products" (line ~175, asserts `data?.products.some(...)` — **this one breaks** under the new
grouped shape and must be rewritten), "returns null for unknown slug" (unaffected), "returns null
for suspended store" (unaffected). No new import is needed — `getStorePage` is already imported at
the top of the file.

- [ ] **Step 1: Fix the now-incompatible existing assertion**

In `apps/web/tests/storefront/queries.test.ts`, replace:

```ts
it("getStorePage returns store with active products", async () => {
  const data = await getStorePage(storeSlug)
  expect(data).not.toBeNull()
  expect(data?.store.name).toBe("Test Store")
  expect(data?.products.some((p) => p.id === productId)).toBe(true)
})
```

with:

```ts
it("getStorePage returns store with active products grouped by category", async () => {
  const data = await getStorePage(storeSlug)
  expect(data).not.toBeNull()
  expect(data?.store.name).toBe("Test Store")
  const section = data?.categorySections.find((s) => s.category.name === "Test Category")
  expect(section?.products.some((p) => p.id === productId)).toBe(true)
})
```

This block's existing seed (one store, one category, one product in that category — see the file's
`beforeAll` around line 38) already supports this without any seed changes. Leave the other two
`getStorePage` tests ("returns null for unknown slug", "returns null for suspended store")
untouched — they only assert `data === null` and don't touch the `products`/`categorySections`
shape.

- [ ] **Step 2: Write the failing tests for category grouping, ordering, and the uncategorized
      bucket**

Append a new `describe` block to the end of `apps/web/tests/storefront/queries.test.ts` (after the
file's existing blocks — `randomUUID`, `withAdmin`, `schema`, `getStorePage`, `SYSTEM_ACTOR`,
`DATABASE_URL`, `shouldRun` are all already imported/declared at the top of the file, no new
imports needed):

```ts
describe.skipIf(!shouldRun)("getStorePage — category grouping", () => {
  let testDb: ReturnType<typeof makeDb>
  let ownerId: string
  let storeId: string
  let storeSlug: string
  let catAId: string
  let catBId: string
  let catTieId: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    storeSlug = `grouping-test-${randomUUID().slice(0, 8)}`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "category grouping test seed" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: ownerId,
          email: `${ownerId}@test.bomy`,
          role: "seller_owner",
          name: "Grouping Test Seller",
        })
        const [store] = await tx
          .insert(schema.stores)
          .values({
            ownerId,
            name: "Grouping Test Store",
            slug: storeSlug,
            status: "active",
            bodyHtml: "<p>Our story</p>",
            videoId: "dQw4w9WgXcQ",
          })
          .returning({ id: schema.stores.id })
        storeId = store!.id

        // "Alpha" and "Beta" share sort_order=5 — the tie must resolve by name ASC.
        const [catA] = await tx
          .insert(schema.categories)
          .values({ name: "Alpha", slug: `alpha-${randomUUID().slice(0, 6)}`, sortOrder: 5 })
          .returning({ id: schema.categories.id })
        catAId = catA!.id
        const [catB] = await tx
          .insert(schema.categories)
          .values({ name: "Beta", slug: `beta-${randomUUID().slice(0, 6)}`, sortOrder: 5 })
          .returning({ id: schema.categories.id })
        catBId = catB!.id
        // "Zeta" sorts after both by sort_order, proving sort_order wins over name overall.
        const [catTie] = await tx
          .insert(schema.categories)
          .values({ name: "Zeta", slug: `zeta-${randomUUID().slice(0, 6)}`, sortOrder: 20 })
          .returning({ id: schema.categories.id })
        catTieId = catTie!.id

        // 9 active products in catTie (cap is 8) to prove hasMore + the cap itself.
        // 1 active product in catA, 1 in catB, 1 uncategorized, 1 inactive in catA (excluded).
        const now = Date.now()
        const rows = [
          ...Array.from({ length: 9 }, (_, i) => ({
            name: `Zeta Product ${i}`,
            categoryId: catTieId,
            status: "active" as const,
            createdAt: new Date(now + i * 1000),
          })),
          {
            name: "Alpha Product",
            categoryId: catAId,
            status: "active" as const,
            createdAt: new Date(now),
          },
          {
            name: "Beta Product",
            categoryId: catBId,
            status: "active" as const,
            createdAt: new Date(now),
          },
          {
            name: "No Category Item",
            categoryId: null,
            status: "active" as const,
            createdAt: new Date(now),
          },
          {
            name: "Draft Alpha",
            categoryId: catAId,
            status: "draft" as const,
            createdAt: new Date(now),
          },
        ]
        for (const r of rows) {
          await tx.insert(schema.products).values({
            storeId,
            categoryId: r.categoryId,
            name: r.name,
            slug: `${r.name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 6)}`,
            status: r.status,
            createdAt: r.createdAt,
          })
        }
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "category grouping test cleanup" },
      async (tx) => {
        await tx.delete(schema.products).where(eq(schema.products.storeId, storeId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, catAId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, catBId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, catTieId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      },
    )
    await testDb.close()
  })

  it("returns store body and video fields", async () => {
    const page = await getStorePage(storeSlug)
    expect(page?.store.bodyHtml).toBe("<p>Our story</p>")
    expect(page?.store.videoId).toBe("dQw4w9WgXcQ")
  })

  it("excludes draft products from their category section", async () => {
    const page = await getStorePage(storeSlug)
    const alpha = page?.categorySections.find((s) => s.category.name === "Alpha")
    expect(alpha?.products.map((p) => p.name)).not.toContain("Draft Alpha")
  })

  it("breaks equal sort_order ties by category name ASC (Alpha before Beta)", async () => {
    const page = await getStorePage(storeSlug)
    const names = page?.categorySections.map((s) => s.category.name)
    const alphaIdx = names?.indexOf("Alpha") ?? -1
    const betaIdx = names?.indexOf("Beta") ?? -1
    expect(alphaIdx).toBeGreaterThanOrEqual(0)
    expect(alphaIdx).toBeLessThan(betaIdx)
  })

  it("orders categories by sort_order overall (Zeta, sort_order=20, comes last)", async () => {
    const page = await getStorePage(storeSlug)
    const names = page?.categorySections.map((s) => s.category.name) ?? []
    expect(names.indexOf("Zeta")).toBe(names.length - 1)
  })

  it("caps a category's preview at 8 products and reports hasMore", async () => {
    const page = await getStorePage(storeSlug)
    const zeta = page?.categorySections.find((s) => s.category.name === "Zeta")
    expect(zeta?.products).toHaveLength(8)
    expect(zeta?.hasMore).toBe(true)
  })

  it("orders products within a category by created_at ASC (oldest first)", async () => {
    const page = await getStorePage(storeSlug)
    const zeta = page?.categorySections.find((s) => s.category.name === "Zeta")
    expect(zeta?.products[0]?.name).toBe("Zeta Product 0")
  })

  it("a category with only draft products (or no products) does not appear as a section", async () => {
    const page = await getStorePage(storeSlug)
    // Alpha has exactly one active product (seeded above) so it does appear; this asserts
    // the inverse never happens — no section exists with zero products.
    const empty = page?.categorySections.filter((s) => s.products.length === 0)
    expect(empty).toHaveLength(0)
  })

  it("includes an uncategorized bucket for products with no category", async () => {
    const page = await getStorePage(storeSlug)
    expect(page?.uncategorized.products.map((p) => p.name)).toContain("No Category Item")
  })

  it("returns null for an unknown slug", async () => {
    expect(await getStorePage("does-not-exist-slug")).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify the new block fails**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test storefront/queries --run
```

Expected: FAIL — current `getStorePage` returns a flat `products` array, not `categorySections`/
`uncategorized` (both the new block and the Step-1-fixed existing test fail against the old code).

- [ ] **Step 4: Write the implementation**

This replaces the entire current 41-line `apps/web/src/app/brands/[slug]/queries.ts` (today it has
one `getDb()` singleton and one `getStorePage` doing a flat `products` select with `.limit(24)`):

```ts
// apps/web/src/app/brands/[slug]/queries.ts
import { and, asc, eq, isNull } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

const CATEGORY_PREVIEW_CAP = 8

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

interface ProductCard {
  id: string
  name: string
  slug: string
  coverImageUrl: string | null
}

export async function getStorePage(slug: string) {
  return withPublicRead(getDb(), async (db) => {
    const [store] = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        slug: schema.stores.slug,
        description: schema.stores.description,
        bodyHtml: schema.stores.bodyHtml,
        videoId: schema.stores.videoId,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.slug, slug), eq(schema.stores.status, "active")))
      .limit(1)

    if (!store) return null

    const categories = await db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      })
      .from(schema.categories)
      .where(eq(schema.categories.isActive, true))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))

    const categorySections: Array<{
      category: { name: string; slug: string }
      products: ProductCard[]
      hasMore: boolean
    }> = []

    for (const category of categories) {
      const products = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          slug: schema.products.slug,
          coverImageUrl: schema.products.coverImageUrl,
        })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.storeId, store.id),
            eq(schema.products.status, "active"),
            eq(schema.products.categoryId, category.id),
          ),
        )
        .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
        .limit(CATEGORY_PREVIEW_CAP + 1)

      if (products.length === 0) continue

      categorySections.push({
        category: { name: category.name, slug: category.slug },
        products: products.slice(0, CATEGORY_PREVIEW_CAP),
        hasMore: products.length > CATEGORY_PREVIEW_CAP,
      })
    }

    const uncategorizedProducts = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        coverImageUrl: schema.products.coverImageUrl,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.storeId, store.id),
          eq(schema.products.status, "active"),
          isNull(schema.products.categoryId),
        ),
      )
      .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
      .limit(CATEGORY_PREVIEW_CAP + 1)

    return {
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        bodyHtml: store.bodyHtml,
        videoId: store.videoId,
      },
      categorySections,
      uncategorized: {
        products: uncategorizedProducts.slice(0, CATEGORY_PREVIEW_CAP),
        hasMore: uncategorizedProducts.length > CATEGORY_PREVIEW_CAP,
      },
    }
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test storefront/queries --run
```

Expected: all pass, including the Step-1-fixed test and every other pre-existing test in this file
(`getCategories`, `getProducts`, `getProductBySlug`, `getBrands`, `updateStoreCategories`, RLS
isolation — confirm no regression from the `getStorePage` shape change).

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: this will FAIL right now — `page.tsx` (Task 12) still consumes the old flat `products`
shape. That's expected; Task 12 fixes it. Do not attempt to make `apps/web` typecheck clean until
Task 12 is also done — these two tasks are sequential, same as Tasks 3+4.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/brands/\[slug\]/queries.ts apps/web/tests/storefront/queries.test.ts
git commit -m "feat(web): group storefront products by category, add uncategorized bucket"
```

---

## Task 12: Storefront page redesign

**Files:**

- Modify: `apps/web/src/app/brands/[slug]/page.tsx`

**Interfaces:**

- Consumes: `getStorePage` (Task 11), `VideoEmbed` (Task 6).

- [ ] **Step 1: Rewrite the page component**

```tsx
// apps/web/src/app/brands/[slug]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@/components/ui/button"
import { VideoEmbed } from "@/components/video-embed"

import { getStorePage } from "./queries"

interface Props {
  params: Promise<{ slug: string }>
}

function ProductCard({
  storeSlug,
  product,
}: {
  storeSlug: string
  product: { id: string; name: string; slug: string; coverImageUrl: string | null }
}) {
  return (
    <li key={product.id}>
      <Link
        href={`/products/${storeSlug}/${product.slug}`}
        className="group block overflow-hidden rounded-xl border border-border bg-background shadow-sm hover:shadow-md"
      >
        <div className="aspect-square bg-muted">
          {product.coverImageUrl ? (
            <img
              src={product.coverImageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl text-muted-foreground">
              📦
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
            {product.name}
          </p>
        </div>
      </Link>
    </li>
  )
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params
  const data = await getStorePage(slug)
  if (!data) notFound()

  const { store, categorySections, uncategorized } = data

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-8 text-center text-2xl font-bold text-foreground">{store.name}</h1>

      <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          {store.bodyHtml && (
            <div
              className="prose prose-sm max-w-none text-foreground"
              // Sanitized server-side by normalizeBodyHtml before storage — never raw user input.
              dangerouslySetInnerHTML={{ __html: store.bodyHtml }}
            />
          )}
        </div>
        <div className="flex flex-col gap-4">
          {store.videoId && <VideoEmbed videoId={store.videoId} title={`${store.name} video`} />}
          <Button asChild className="self-start">
            <Link href={`/brands/${store.slug}/subscribe`}>Subscribe</Link>
          </Button>
        </div>
      </div>

      {categorySections.length === 0 && uncategorized.products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No products yet.
        </p>
      ) : (
        <>
          {categorySections.map((section) => (
            <section key={section.category.slug} className="mb-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-foreground">{section.category.name}</h2>
                {section.hasMore && (
                  <Link
                    href={`/brands/${store.slug}/products?category=${section.category.slug}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View all in {section.category.name}
                  </Link>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {section.products.map((product) => (
                  <ProductCard key={product.id} storeSlug={store.slug} product={product} />
                ))}
              </ul>
            </section>
          ))}

          {uncategorized.products.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-foreground">Uncategorized</h2>
                {uncategorized.hasMore && (
                  <Link
                    href={`/brands/${store.slug}/products?category=__uncategorized`}
                    className="text-sm text-primary hover:underline"
                  >
                    View all
                  </Link>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {uncategorized.products.map((product) => (
                  <ProductCard key={product.id} storeSlug={store.slug} product={product} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Typecheck (this is the real completion check for Tasks 11+12 together)**

Run: `cd apps/web && pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Manually verify in the dev server**

Run: `pnpm dev`, visit `/brands/<a-known-active-store-slug>`. Confirm: shop name centered at top,
two-column intro (brand story left if set, video+subscribe right if video set), category sections
in order with capped previews and "View all" links only where `hasMore` is true, uncategorized
section last if present. Check a store with zero products still renders the empty state, not an
error. Stop the dev server when done.

- [ ] **Step 4: Run the full storefront test suite**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test storefront --run
```

Expected: all pass.

- [ ] **Step 5: Lint**

Run: `cd apps/web && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/brands/\[slug\]/page.tsx
git commit -m "feat(web): redesign storefront page — centered header, brand story/video, category sections"
```

---

## Task 13: New route — category-filtered seller products listing

**Files:**

- Create: `apps/web/src/app/brands/[slug]/products/queries.ts`
- Create: `apps/web/src/app/brands/[slug]/products/page.tsx`
- Test: `apps/web/tests/storefront/brand-products-queries.test.ts`

**Interfaces:**

- Produces: `getStoreProducts(storeSlug: string, categorySlug: string | undefined): Promise<{ store: { name: string; slug: string } } & { products: ProductCard[] } | null>`
  — `null` only for an unknown/inactive store; an unknown category slug yields an empty `products`
  array with a valid store, not `null`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/storefront/brand-products-queries.test.ts
import { randomUUID } from "node:crypto"

import { makeDb, schema, withAdmin } from "@bomy/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getStoreProducts } from "@/app/brands/[slug]/products/queries"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"
const DATABASE_URL = process.env["DATABASE_APP_URL"] ?? process.env["DATABASE_URL"]
const shouldRun = Boolean(DATABASE_URL) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("getStoreProducts", () => {
  let testDb: ReturnType<typeof makeDb>
  let ownerId: string
  let storeSlug: string
  let storeId: string
  let categoryId: string
  let categorySlug: string

  beforeAll(async () => {
    process.env["DATABASE_URL"] = DATABASE_URL as string
    testDb = makeDb({ url: DATABASE_URL as string })
    ownerId = randomUUID()
    storeSlug = `products-route-test-${randomUUID().slice(0, 8)}`
    categorySlug = `route-cat-${randomUUID().slice(0, 8)}`

    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "products route test seed" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: ownerId,
          email: `${ownerId}@test.bomy`,
          role: "seller_owner",
          name: "Products Route Test Seller",
        })
        const [store] = await tx
          .insert(schema.stores)
          .values({
            ownerId,
            name: "Products Route Test Store",
            slug: storeSlug,
            status: "active",
          })
          .returning({ id: schema.stores.id })
        storeId = store!.id

        const [category] = await tx
          .insert(schema.categories)
          .values({ name: "Route Cat", slug: categorySlug })
          .returning({ id: schema.categories.id })
        categoryId = category!.id

        await tx.insert(schema.products).values([
          {
            storeId,
            categoryId,
            name: "Categorized Item",
            slug: `categorized-item-${randomUUID().slice(0, 6)}`,
            status: "active",
          },
          {
            storeId,
            categoryId: null,
            name: "No Category Item",
            slug: `no-category-item-${randomUUID().slice(0, 6)}`,
            status: "active",
          },
        ])
      },
    )
  })

  afterAll(async () => {
    await withAdmin(
      testDb.db,
      { userId: SYSTEM_ACTOR, reason: "products route test cleanup" },
      async (tx) => {
        await tx.delete(schema.products).where(eq(schema.products.storeId, storeId))
        await tx.delete(schema.categories).where(eq(schema.categories.id, categoryId))
        await tx.delete(schema.stores).where(eq(schema.stores.id, storeId))
      },
    )
    await testDb.close()
  })

  it("returns null for an unknown store", async () => {
    expect(await getStoreProducts("no-such-store-slug", undefined)).toBeNull()
  })

  it("returns all active products when no category filter is given", async () => {
    const result = await getStoreProducts(storeSlug, undefined)
    expect(result?.products.map((p) => p.name).sort()).toEqual([
      "Categorized Item",
      "No Category Item",
    ])
  })

  it("filters to a real category slug", async () => {
    const result = await getStoreProducts(storeSlug, categorySlug)
    expect(result?.products.map((p) => p.name)).toEqual(["Categorized Item"])
  })

  it("filters to uncategorized via the __uncategorized sentinel", async () => {
    const result = await getStoreProducts(storeSlug, "__uncategorized")
    expect(result?.products.map((p) => p.name)).toEqual(["No Category Item"])
  })

  it("returns an empty product list (not null) for an unknown category slug", async () => {
    const result = await getStoreProducts(storeSlug, "does-not-exist")
    expect(result).not.toBeNull()
    expect(result?.products).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test brand-products-queries --run
```

Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the query implementation**

```ts
// apps/web/src/app/brands/[slug]/products/queries.ts
import { and, asc, eq, isNull } from "drizzle-orm"

import { makeDb, schema, withPublicRead } from "@bomy/db"

const LISTING_CAP = 60
const UNCATEGORIZED_SENTINEL = "__uncategorized"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function getStoreProducts(storeSlug: string, categorySlug: string | undefined) {
  return withPublicRead(getDb(), async (db) => {
    const [store] = await db
      .select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug })
      .from(schema.stores)
      .where(and(eq(schema.stores.slug, storeSlug), eq(schema.stores.status, "active")))
      .limit(1)

    if (!store) return null

    const conditions = [eq(schema.products.storeId, store.id), eq(schema.products.status, "active")]

    if (categorySlug === UNCATEGORIZED_SENTINEL) {
      conditions.push(isNull(schema.products.categoryId))
    } else if (categorySlug) {
      const [category] = await db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.slug, categorySlug))
        .limit(1)
      // Unknown category slug: return the valid store with zero products, not a 404 —
      // the store itself is fine, only the filter didn't match anything (spec §6).
      if (!category) {
        return { store: { name: store.name, slug: store.slug }, products: [] }
      }
      conditions.push(eq(schema.products.categoryId, category.id))
    }

    const products = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        slug: schema.products.slug,
        coverImageUrl: schema.products.coverImageUrl,
      })
      .from(schema.products)
      .where(and(...conditions))
      .orderBy(asc(schema.products.createdAt), asc(schema.products.id))
      .limit(LISTING_CAP)

    return { store: { name: store.name, slug: store.slug }, products }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 pnpm --filter @bomy/web test brand-products-queries --run
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Write the page component**

```tsx
// apps/web/src/app/brands/[slug]/products/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"

import { getStoreProducts } from "./queries"

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ category?: string }>
}

export default async function StoreProductsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { category } = await searchParams
  const data = await getStoreProducts(slug, category)
  if (!data) notFound()

  const { store, products } = data

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{store.name}</h1>
        <Link href={`/brands/${store.slug}`} className="text-sm text-primary hover:underline">
          Back to storefront
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No products found in this category.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products/${store.slug}/${p.slug}`}
                className="group block overflow-hidden rounded-xl border border-border bg-background shadow-sm hover:shadow-md"
              >
                <div className="aspect-square bg-muted">
                  {p.coverImageUrl ? (
                    <img
                      src={p.coverImageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-muted-foreground">
                      📦
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {p.name}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Manually verify in the dev server**

Run: `pnpm dev`. From a storefront page with a "View all in [category]" link showing (a category
with more than 8 active products — seed one locally if none exists), click through and confirm the
filtered list matches. Try an invalid `?category=nonsense` value directly in the URL bar and
confirm it shows the empty state, not a 404. Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/brands/\[slug\]/products apps/web/tests/storefront/brand-products-queries.test.ts
git commit -m "feat(web): add category-filtered seller products listing route"
```

---

## Task 14: Full regression pass

**Files:** none new — verification only.

- [ ] **Step 1: Full monorepo typecheck**

Run: `pnpm typecheck` (from `app/` root)
Expected: clean across all packages/apps.

- [ ] **Step 2: Full monorepo lint**

Run: `pnpm lint` (from `app/` root)
Expected: clean, `--max-warnings 0`.

- [ ] **Step 3: Full test suite against real Postgres, twice back-to-back**

Run (twice):

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy BOMY_RLS_READY=1 REDIS_URL='redis://:changeme_local@localhost:6379' pnpm test
```

Expected: all packages pass both times, deterministic (matches this project's established
verification standard for anything touching shared packages or RLS-adjacent tables).

- [ ] **Step 4: Confirm `@bomy/shared`'s new `test` script is picked up by the root orchestration**

Check the output of Step 3 includes a `@bomy/shared:test` line (not just `@bomy/shared:lint`/
`:typecheck`) — this is the direct confirmation that Bob's low-priority finding (missing test
script) is actually wired in, not just present in `package.json` but silently skipped by Turbo's
task graph.

- [ ] **Step 5: `pnpm format` and confirm no diff**

Run: `pnpm format` (from `app/` root), then `git status --short` — expect no changes (lint-staged
should have kept everything formatted already at each commit, this is a final confirmation).

- [ ] **Step 6: Manual end-to-end smoke**

Run `pnpm dev`, walk the full flow once: seller sets brand story + video in settings → storefront
page shows both in the right layout → click a "View all in [category]" link → filtered page shows
the right products → back-link returns to the storefront. Stop the dev server when done.
