# Individual seller storefront redesign

**Status:** design, not yet implemented. Route/data model corrections from Charlie's review folded
in below (body-image scoping, video-ID validation, route semantics, testing, R2 dependency).

## Summary

Redesign the existing public seller page (`/brands/[slug]`) into a richer storefront: shop name
centered at top; a two-column intro section (rich-text brand story left, YouTube video + Subscribe
button right); and the seller's products grouped into per-category sections with a "View all"
link to a new category-filtered listing route.

## 1. Data model

New migration `0028_store_body_video.sql`, additive only:

```sql
ALTER TABLE stores ADD COLUMN body_html text;
ALTER TABLE stores ADD COLUMN body_revision integer NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN video_id text;
ALTER TABLE stores ADD CONSTRAINT stores_video_id_chk
  CHECK (video_id IS NULL OR video_id ~ '^[A-Za-z0-9_-]{11}$');
```

No RLS policy or `bomy_app` grant changes needed — `stores`' existing row-level policies
(`stores_owner_read`/`_update`, `stores_staff_all`) and its table-level grant already cover any
column, including new ones (this is a direct benefit of GAPS #16's grant work: grants and RLS
policies are table-scoped, not column-scoped).

`body_html`/`body_revision` mirror `products.body_html`/`products.body_revision` exactly,
including the optimistic-concurrency/orphan-cleanup machinery described in §3. `video_id` stores
only the bare 11-character YouTube ID — never a full URL — enforced at the DB layer by the CHECK
constraint above, not just application code. Empty input is normalized to `NULL` on save (matching
the existing convention in `updateStoreSettings`: `excerpt: excerpt || null`).

## 2. Centralized YouTube-ID handling

**Current state has five separate, inconsistent regexes** for what should be one rule (Bob R1
review caught the fourth of these — `body-renderer.tsx` — during spec review; a final pre-plan
grep for every `VIDEO_ID_RE` definition turned up a fifth, `youtube-embed-extension.ts`, that both
the first pass and Bob's review missed — worth stating plainly rather than quietly fixing, since
it's exactly the kind of thing a scoped grep catches and a manual file-by-file read doesn't):

- `VideoEmbed`'s own validator (`/^[a-zA-Z0-9_-]{1,11}$/` — wrongly permits 1–10 chars).
- `body-sanitizer.ts`'s inline-video validator (same loose pattern) — used at _save_ time, inside
  `normalizeBodyHtml`.
- `body-renderer.tsx`'s figure-case validator (same loose pattern, line 7/96) — used at _render_
  time, deciding whether a `<figure data-video-provider>` in already-saved body HTML gets rendered
  as a video at all.
- `youtube-embed-extension.ts`'s TipTap command validator (same loose pattern, line 3) — used at
  _insert-command_ time, gating `insertYoutubeEmbed` before it accepts an ID into the editor.
- `product-body-editor.tsx`'s URL-extraction regex (correctly strict, exactly 11 chars, but not
  shared) — used at _extraction_ time, in the editor's embed button, immediately before it calls
  the command above.

This is worth fixing regardless of this feature — a malformed short ID could pass four of these
five checks and silently render nothing, or worse, render inconsistently between save-time
validation and render-time display.

**Fix:** one canonical, client-safe module — see §3.1 for exactly where it lives and why that
location matters:

- `YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/` — the single source of truth, exactly 11 chars.
- `extractYoutubeVideoId(input: string): string | null` — handles the same URL shapes already
  supported (`?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, or a bare ID), reusing the exact
  extraction logic currently inlined in `EmbedYouTubeButton`.

**Six call sites import from here** (five existing regexes replaced, one new): `VideoEmbed`'s
validation, `body-sanitizer.ts`'s inline `<figure>` check, `body-renderer.tsx`'s figure-case
check, `youtube-embed-extension.ts`'s command guard, `EmbedYouTubeButton`'s extraction, and the
new store settings action's save-time validation.

## 3. Body-image scoping (product + store share one pipeline)

### 3.1 `@bomy/shared` client/server boundary (Bob R1 finding — pins an open question)

The first pass of this spec left the sanitizer's relocation target open, listing `@bomy/shared`
as one candidate. That's wrong and worth pinning explicitly now: `VideoEmbed` is a `"use client"`
component that needs `YOUTUBE_VIDEO_ID_RE`/`extractYoutubeVideoId` at render time, so that code
must be safe to end up in a client bundle. `body-sanitizer.ts` is the opposite — it starts with
`import "server-only"` (hard build failure if ever pulled into a client bundle) and depends on
`sanitize-html`, a Node-oriented package with no place in the browser. Today `@bomy/shared` has a
single root barrel (`"exports": {".": "./src/index.ts"}` — no subpaths), so anything added there
is reachable through one shared import path.

**Fix:** add explicit subpath exports rather than relying on tree-shaking to keep the two apart:

- `@bomy/shared/youtube` — new file, the YouTube ID constant + extractor from §2. Pure
  string/regex logic, zero dependencies, safe for any bundle.
- `@bomy/shared` (root, unchanged) — keeps `classifyImageUrl`/`extractManagedBodyImageKeys`
  (`body-image-keys.ts`). These aren't `server-only`-guarded today, but nothing client-side needs
  them, so the root barrel staying server-oriented-by-convention is fine as long as nothing forces
  the issue.
- The sanitizer (`normalizeBodyHtml`) does **not** move to `@bomy/shared` at all — it relocates to
  `apps/web/src/lib/body-sanitizer.ts` (web-app-local, `server-only`-guarded, no cross-package
  boundary to police), generalized to accept the same `BodyImageScope` as `classifyImageUrl`. Only
  `apps/web` server actions ever needed it; there's no cross-app sharing requirement that would
  justify putting it somewhere a client bundle could reach.

### 3.2 Scoped keys and signatures

The current pipeline is hardcoded to products: keys are `body/<productId>/<uuid>.<ext>`, and both
`classifyImageUrl`/`extractManagedBodyImageKeys` (`@bomy/shared`) take a bare `productId: string`
and compare it against the key's UUID segment. Reusing this for stores needs a real scope
parameter, not a rename.

**New key shape for stores:** `body/stores/<storeId>/<uuid>.<ext>` — the extra `stores/` segment
keeps the two namespaces visually and structurally distinct in the bucket, and makes cross-scope
confusion a parseable, testable condition rather than an assumption.

**New shared type and signatures** (`@bomy/shared`):

```ts
type BodyImageScope = { kind: "product"; id: string } | { kind: "store"; id: string }

function classifyImageUrl(
  url: string,
  scope: BodyImageScope,
  publicOrigin: string,
): "managed" | "external" | "invalid"
function extractManagedBodyImageKeys(
  html: string,
  scope: BodyImageScope,
  publicOrigin: string,
): Set<string>
```

The key regex becomes scope-aware: an optional `stores/` prefix segment determines `kind`, and a
key only "matches" a given scope if both the `kind` _and_ the `id` agree. A product-scoped key
(`body/<productId>/...`) must never be classified as `managed` when checked against a store scope,
and vice versa — this is the specific behavior GAPS-style testing should assert (§8).

**Existing call sites to update** (breaking change to an internal package, contained to this
repo): `products/actions.ts`'s three call sites move from `productId` to
`{ kind: "product", id: productId }`. `body-sanitizer.ts`'s `normalizeBodyHtml` — currently local
to `apps/web/src/app/seller/dashboard/products/` — takes the same scope parameter and relocates to
`apps/web/src/lib/body-sanitizer.ts` per §3.1.

**New store-side actions** (new file, e.g. `apps/web/src/app/seller/dashboard/settings/body-actions.ts`),
mirroring `products/actions.ts`'s `saveProductBody`/`getBodyImageUploadUrl` structurally:

- `saveStoreBody(bodyHtml, revision)` — `requireSeller()` → validate revision/HTML size →
  `normalizeBodyHtml(bodyHtml, { kind: "store", id: storeId }, S3_PUBLIC_URL)` → `withTenant`,
  direct ownership check (`stores.ownerId = userId AND status = 'active'`, no product-in-store
  nesting needed since the store _is_ the direct target) → row-locked revision-conflict check →
  update `body_html`/`body_revision` → `revalidatePath` → `after()`-hook orphan cleanup using the
  same triple-comparison (old/new/re-read-current) race guard as `saveProductBody`, scoped to
  `{ kind: "store", id: storeId }`.
- `getStoreBodyImageUploadUrl(contentType, contentLength)` — `requireSeller()` → direct store
  ownership check → same `pg_advisory_xact_lock(hashtext('body-img-sign:' || userId))` the product
  flow already takes before counting rate-limit rows (line 915 of `products/actions.ts`) — same
  lock key, not a new scoped one, so product and store upload-signing for one seller serialize
  against each other rather than racing independently → shares the _same_ `bodyImageUploadLog`
  rate-limit table and 20/hour-per-user threshold as product uploads (one counter per user across
  both surfaces — no new dimension, no schema change) → key =
  `body/stores/${storeId}/${randomUUID()}.${ext}`.

Upload signing verifies seller-owns-store before ever calling `createBodyPresignedPutUrl` —
same shape as the existing product flow, just one hop shorter (no product-belongs-to-store check).

## 4. Settings page additions

Two new pieces on `/seller/dashboard/settings`, alongside the existing excerpt/categories cards:
a **"Brand Story"** WYSIWYG editor (the product body editor component, generalized to accept a
target scope instead of being product-hardcoded — reuses the same toolbar, image upload, and
YouTube-embed-within-body-text capability already built), and a plain **"Video URL"** text input
using `extractYoutubeVideoId` for both a live client-side preview and the server-side save
validation (never trust client parsing alone — the action re-validates and the DB CHECK constraint
backstops both).

## 5. Storefront redesign (`/brands/[slug]`, same route)

Shop name centered at top. Section 1, two columns: left renders sanitized `body_html` (renders
nothing if empty — most sellers won't have written one immediately, this is not an error state);
right renders `VideoEmbed` (relocated from `apps/web/src/app/products/[storeSlug]/[productSlug]/`
to a shared component location since both product pages and this page now use it) if `video_id` is
set, with the Subscribe button directly beneath it — moved from its current position at the top of
the page, not duplicated.

Section 2: query groups the seller's _active_ products by `category_id`, joins `categories.name`
and `categories.slug`, one section per category with ≥1 active product. **Deterministic ordering**
throughout, not bare `sort_order` (ties are possible and must resolve the same way every render):
categories ordered by `sort_order ASC, name ASC`; products within each category ordered by
`created_at ASC, id ASC`. Each section shows a capped preview (8 products) plus a **"View all in
[category]"** link to the route in §6.

**Uncategorized products (Bob R1 finding).** `products.category_id` is genuinely optional today —
the seller product form has an explicit "No category" option
(`seller/dashboard/products/new/product-form.tsx:129`), so grouping by category alone would
silently drop any active product a seller chose to leave uncategorized from their own storefront.
Fix: add a final **"Uncategorized"** section (last, after all named categories) covering active
products with `category_id IS NULL`, using the same cap/ordering/view-all treatment as a named
category — see §6 for how "view all" links there without a real category slug to key on.

## 6. New route: `/brands/[slug]/products`

`?category=<category-slug>` — **the slug, never the category ID** (matches how `/brands/[slug]`
itself is already slug-keyed, keeps URLs stable and readable). `?category=__uncategorized` is a
reserved sentinel value meaning `category_id IS NULL`, giving the Uncategorized section in §5 the
same "view all" link shape as every named category. **Not just "uncategorized" by convention**
(Bob R2 finding): `categories.slug` has a unique index (`packages/db/drizzle/0009_catalog_schema.sql:19`)
but no reserved-word check, so a plain `"uncategorized"` sentinel could theoretically collide with
a future admin-created category slug. The double-underscore prefix is structurally outside normal
slug generation (category slugs are derived from human-entered names, which don't naturally
produce a leading `__`), so this is a real guard, not just an assumption — no additional
category-creation validation needed elsewhere to keep it collision-free.

Two independent lookups with different failure semantics:

1. **Store lookup** (by the `[slug]` path segment) — unknown/inactive store → existing
   `notFound()` behavior, unchanged from today.
2. **Category filter** (by the `?category=` query param) — if present but matches no category (or
   matches a category with zero of this seller's active products), the page renders normally with
   an **empty result state** ("No products found in this category"), not a 404. The store itself
   is valid; only the filter didn't match anything. The `uncategorized` sentinel and an absent
   param never collide with real category slugs, so this can't misfire. If the param is absent
   entirely, the page shows _all_ the seller's active products (both categorized and
   uncategorized), unfiltered — a natural zero-extra-cost extension of the same query (one less
   `WHERE` clause) that also gives a genuine "view all products" page.

No pagination in v1 — a single cap of 60 products on this listing page. The query-param
approach (vs. a path-segment route) was chosen specifically because it composes cleanly with
pagination/search added later without a route-shape change.

## 7. Operational dependency: R2

`saveStoreBody` — like the existing `saveProductBody` — depends on `S3_PUBLIC_URL` being
configured **unconditionally**, even for a text-only save with zero images: `normalizeBodyHtml`
calls `classifyImageUrl` during validation, which requires a public origin to classify `<img>`
tags by. This is true today for products already; extending the same pattern to stores inherits
the same dependency, not a new one.

By contrast, `video_id` has **zero R2 dependency** — it's a plain string column, validated by
regex and a DB CHECK constraint, never touching S3/R2 at any point. A seller can set their video
even in a hypothetical environment where R2 is unavailable; they cannot save brand-story text
(with or without images) in that scenario, because the sanitizer's classification step needs a
valid public origin to run at all.

R2 is confirmed live in production as of 2026-07-30 (GAPS-adjacent verification, real upload
tested working), so this isn't a current blocker — documented here as the dependency contract
regardless, since it's a real architectural coupling worth being explicit about.

## 8. Testing

- **Query tests** (real Postgres, this project's standard integration pattern): category grouping
  correctness, the capped-preview count, deterministic ordering under tie conditions (two
  categories with equal `sort_order`, two products with equal `created_at`), the filtered-route
  query with a present/absent/unknown category param.
- **Settings-form tests**: new brand-story + video fields; `extractYoutubeVideoId` edge cases (all
  supported URL shapes, bare ID, non-YouTube URLs, too-short/too-long IDs — exactly-11 now
  enforced, not 1–11).
- **Shared body-image scope tests** (new bucket, `@bomy/shared`): a product-scoped key must be
  rejected when checked against a store scope, and a store-scoped key must be rejected when
  checked against a product scope, even when the numeric/UUID portion happens to match — this is
  the direct regression test for the scoping design in §3, not just a restatement of existing
  per-ID matching. **`@bomy/shared`'s `package.json` currently only has `lint`/`typecheck` scripts
  (Bob R1 finding) — it needs a real `test` script added** (`vitest` is already a devDependency,
  just unused today) wired into the standard root `pnpm test` orchestration the same way every
  sibling package (`@bomy/db`, `@bomy/hitpay`, `@bomy/mailer`) already is, not left to run only
  via `apps/web`'s suite.
- **Ownership tests**: `saveStoreBody`/`getStoreBodyImageUploadUrl` reject a caller who doesn't
  own the target store (session user ≠ `stores.owner_id`), mirroring the existing product-action
  tests' shape. No new RLS policy tests needed — `stores`' existing policies already cover the new
  columns, and these are application-layer ownership checks on top of that, same as today's
  product actions.

## Note on the original proposal

`20260419_andy_bomy_proposal_v2.md` lists "Video storage | Cloudinary (seller homepage videos)" in
its tech-stack table. Charlie's choice of a YouTube-link-paste embed for this v1 slice (§ approach
decision, no direct upload) intentionally supersedes that original direction — no Cloudinary
integration, no direct video file storage, for this feature as scoped here.

## Out of scope for v1 (explicitly deferred, not forgotten)

- Direct video file upload (link-paste only, per the earlier approach decision).
- Pagination/search on the new products-listing route.
- A store logo/avatar image (not requested; current header is text-only and stays that way).
