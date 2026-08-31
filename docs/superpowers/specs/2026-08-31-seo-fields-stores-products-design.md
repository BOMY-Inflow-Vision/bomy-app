# SEO fields for stores and products — design

**Status:** Approved with conditions (Bob review, 2026-08-31). Conditions incorporated below.
**Author:** Andy (Sonnet) — Bob confirmed staying on Sonnet is acceptable for this scope.

## Problem

Stores (brands) and products have no SEO metadata fields, and their public pages emit no
per-entity `<title>`/description/OG tags at all (only a static site-wide default in
`apps/web/src/app/layout.tsx`). Charlie wants seller and admin to both be able to view and edit
per-entity SEO metadata for their own scope (seller: own store/products; admin: any).

## Scope

**In scope:** `stores`, `products`.

**Explicitly out of scope:** `categories` (product taxonomy) and `store_categories` (brand tags).
Neither has an indexable public landing page today — `categories` is filtered via
`?category=<uuid>` on the shared `/products` page (no `/categories/[slug]` route, no sitemap);
`store_categories` is filtered via `?category=<uuid>` on the shared `/brands` page. Adding SEO
metadata fields with no page to render them on is dead weight. Revisit when a real category
landing page is built — add the SEO fields as part of that work, not ahead of it.

**Fields (both entities):** `metaTitle`, `metaDescription`, `ogImageUrl`. All optional. No meta
keywords (obsolete), no canonical-URL override (no current URL duplication to justify it), no new
image-upload pipeline for OG image — it's a plain URL text field.

## Schema

New nullable columns on `stores` and `products` (`packages/db/src/schema/stores.ts`,
`products.ts`):

```
meta_title        text   -- check char_length(meta_title) <= 70
meta_description  text   -- check char_length(meta_description) <= 160 (mirrors stores.excerpt)
og_image_url      text   -- check (see URL rule below)
```

**URL rule (exact):** empty string normalizes to `null` at the validator. Non-empty must parse as
an absolute URL with protocol `http:` or `https:`. DB check mirrors this as closely as Postgres
reasonably can:

```sql
CHECK (og_image_url IS NULL OR (char_length(og_image_url) <= 2048 AND og_image_url ~ '^https?://'))
```

## Migration

One hand-written migration (drizzle-kit generation is broken in this repo regardless of RLS need
— see `app/CLAUDE.md` gotchas). Plain `ALTER TABLE ... ADD COLUMN` + `CHECK` constraints on both
tables. **No RLS policy changes** — confirmed `stores_owner_update` (policies.sql:230) and
`products_seller_update` (policies.sql:646) already cover owner UPDATE on these new columns
(row-level policies, not column-level); admin writes go through the existing `withAdmin`
staff/admin policy path. The enforcement burden here is **action-level allowlisting**, not RLS —
especially for the first-ever admin product update action.

## Shared validator

New `packages/shared/src/seo.ts`:

```ts
validateSeoFields(raw: unknown): { ok: true; value: SeoFields } | { ok: false; errors: Record<string, string> }
```

Field-map pattern per `CLAUDE.md` (`apps/web/src/lib/shipping-address-schema.ts` is the reference
implementation), not the throw-based or single-`error`-string variants seen elsewhere in this
codebase. Enforces: `metaTitle` ≤ 70 chars, `metaDescription` ≤ 160 chars, `ogImageUrl` empty→null
or absolute `http(s)://` URL ≤ 2048 chars (via `new URL()` + protocol check, not just regex, on
the JS side — the DB check is the backstop, not the primary validation).

**Export:** add `"./seo": "./src/seo.ts"` to `packages/shared/package.json` `exports`, imported as
`@bomy/shared/seo` — matching the existing `@bomy/shared/youtube` subpath pattern already used in
`apps/web/src/app/seller/dashboard/settings/actions.ts`. **Do not** re-export from `src/index.ts`
— confirmed neither `youtube.ts` nor `body-sanitizer.ts` are in that barrel either (it only
exports `body-image-keys`); no app needs a root-import path for this.

## Server actions

**Seller store — `updateStoreSeo`, in `apps/web/src/app/seller/dashboard/settings/actions.ts`**
(corrected path). Mirrors `updateStoreSettings`'s exact active-store gate: both the `SELECT` and
the `UPDATE` filter on `ownerId = session.user.id AND status = 'active'` — a seller can only edit
SEO for their own **active** store; suspended/pending stays admin-only, same as every other field
in this file today. Returns `{ok:true}|{ok:false,error}`.

**Admin store — `updateStoreSeo`, in `apps/admin/src/app/stores/actions.ts`** (or a new
`apps/admin/src/app/stores/[id]/seo-actions.ts` if the existing file gets unwieldy — implementer's
call). `requireAdminId` + `withAdmin`, no status gate (admin manages SEO regardless of store
status — that's the point of the seller gate existing). Allowlisted to exactly `metaTitle`,
`metaDescription`, `ogImageUrl` — does not become a general `updateStore`.

**Seller product — extend existing `updateProduct`** in
`apps/web/src/app/seller/dashboard/products/actions.ts`. Add the 3 fields to the existing
form/action; no new action, since this doesn't expand authority beyond what `updateProduct`
already has (owner editing their own product). Not added to the product **create** form/action —
optional fields, fillable after creation, keeps the creation flow unchanged.

**Admin product — new `updateProductSeo`, in `apps/admin/src/app/products/actions.ts`** (new
file — first admin action ever to touch `products`). `requireAdminId` + `withAdmin`, allowlisted
to exactly the 3 fields, same discipline as the store admin action.

## New admin UI

Admin has no product routes and no store detail view today — both are net-new:

- `apps/admin/src/app/products/page.tsx` — searchable list (by product name and store name, a
  join query), links to detail.
- `apps/admin/src/app/products/[id]/page.tsx` — read-only core info (name, store, status) +
  editable SEO section.
- `apps/admin/src/app/stores/[id]/page.tsx` — new store detail page (first one), read-only core
  info + editable SEO section.
- Nav entry added for "Products."

Scoped deliberately narrow: SEO editing only, not general admin product/store management.

## Seller UI

- `apps/web/src/app/seller/dashboard/settings/settings-form.tsx` — add an SEO fields section (3
  inputs), wired to `updateStoreSeo`.
- `apps/web/src/app/seller/dashboard/products/[id]/edit/product-edit-form.tsx` — add the same SEO
  fields section, wired into the existing `updateProduct` form/action.

## Public metadata rendering

Add `generateMetadata` to both pages (neither has any today — confirmed no `generateMetadata`,
`export const metadata`, or per-entity `<title>` in either file; root `layout.tsx` has only a
static site-wide `title`/`description`, no `openGraph` block, no global default OG image asset).

**`apps/web/src/app/brands/[slug]/page.tsx`** (store has no cover/logo image column — corrected
from an earlier draft that wrongly assumed one):

```
title       = store.metaTitle ?? store.name
description = store.metaDescription ?? store.excerpt ?? store.description ?? undefined
openGraph.images = [store.ogImageUrl] if set, else omitted entirely (no global default asset exists)
```

**`apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`**:

```
title       = product.metaTitle ?? product.name
description = product.metaDescription ?? product.description ?? undefined
openGraph.images = [product.ogImageUrl] if set, else omitted entirely
```

When `description` resolves to `undefined`, omit the key from the returned `Metadata` object
rather than passing `null`/empty string — Next.js's metadata API inherits an unset field from the
nearest ancestor with one set, so it falls back to root `layout.tsx`'s static description
automatically. Don't hardcode a duplicate copy of that string here.

## Testing

- Unit tests for `validateSeoFields` (`packages/shared/src/seo.test.ts` or wherever shared tests
  live) — including the empty-string-normalizes-to-null case and the protocol check.
- Integration tests for all 4 action paths (seller store, admin store, seller product extension,
  admin product), covering: happy path, allowlist enforcement (admin actions reject any field
  outside the 3), RLS/ownership enforcement (a seller cannot edit another seller's store/product;
  a seller cannot edit SEO on their own non-active store; admin can edit any store/product
  regardless of status).
- Public metadata tests **must verify fallback behavior, not just custom SEO values** — e.g. a
  store/product with no `metaTitle` set still renders `store.name`/`product.name` as the page
  title, not `undefined` or empty.
- Live browser check of rendered `<meta>`/OG tags on both public pages post-implementation,
  matching this project's existing verification style (e.g. PR #127, PR #131).

## Suggested PR split

1. Schema + migration + shared validator + seller store/product SEO forms/actions.
2. Admin product/store SEO surfaces (new routes, new admin actions).
3. Public `generateMetadata` wiring + browser/meta verification.

## Model routing note

Confirmed at design time: no new tables, no new RLS policies (existing owner/admin UPDATE
policies already cover the new columns), well-precedented action/validator patterns to follow.
This is constrained scaffolding/migration/UI wiring, not a schema/RLS trade-off — Bob confirmed
staying on Sonnet is acceptable for this scope. Escalate to Opus only if scope later expands into
category landing-page architecture, canonical/indexing rules, upload/storage, or broader admin
product management.
