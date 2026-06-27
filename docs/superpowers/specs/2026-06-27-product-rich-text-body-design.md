# Product Rich Text Body Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WYSIWYG rich-text "Product Details" body to each product — editable by sellers in the edit dashboard, rendered below the gallery and add-to-cart section on the public product page.

**Architecture:** TipTap editor (client component inside `ProductEditForm`) stores sanitized HTML in a new `products.body_html` column. Inline images upload directly to R2 via server-generated presigned PUT URLs. On save, the action sanitizes, validates, and diffs old vs new R2 keys post-commit. A nightly BullMQ job in `apps/api` provides a two-run quarantine safety net for abandoned uploads.

**Tech Stack:** TipTap 2.x, `@tiptap/extension-table` (TableKit), `node-html-parser`, `isomorphic-dompurify`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (web only), `@tailwindcss/typography`, BullMQ (existing in `apps/api`), Redis (existing).

---

## Global Constraints

- No Zod; validators return `{ ok: true; value: T } | { ok: false; errors: Record<string, string> }` or `{ ok: true } | { ok: false; error: string }`.
- All monetary amounts in bigint minor units (not relevant here but noted for context).
- Every DB write goes through `withTenant` or `withAdmin` — no raw `db` access.
- `SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"` defined per-file, not imported.
- No Zod, no comments explaining what code does, no multi-paragraph docstrings.
- Money columns use bigint; HTML columns use text.
- `@typescript-eslint/require-await` enforced — no async callbacks without await.
- R2 env vars on Railway use names: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`.
- `apps/api` must revalidate nothing — revalidation is `apps/web`'s concern.
- `checkout_enabled` stays `false` in committed code.

---

## Section 1 — Data Layer

### Migration `0021_product_body_html`

```sql
ALTER TABLE products
  ADD COLUMN body_html TEXT,
  ADD COLUMN body_revision INTEGER NOT NULL DEFAULT 0;
```

### R2 key convention

Body images use prefix `body/{productId}/{uuid}.{ext}` — distinct from gallery images (`products/{uuid}.{ext}`), so the cleanup job can scope its R2 listing to `body/` without touching gallery objects.

### Edit form scope

`body_html` is editable only from the product edit form (`/seller/dashboard/products/[id]/edit`). It is **not** on the new-product form — the productId does not exist when the seller is filling in the creation form, so image upload signing cannot be scoped correctly.

---

## Section 2 — Upload Action

### `getBodyImageUploadUrl(productId, contentType, contentLength)`

Location: `apps/web/src/app/seller/dashboard/products/actions.ts`

**Server responsibilities (in order):**

1. Authenticate caller as `seller_owner` who owns `productId` via `withTenant`.
2. Validate `contentType` against allow-list: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`. Reject `image/svg+xml` and any `data:` URI.
3. Validate `contentLength <= 2 * 1024 * 1024` (2 MB). Reject if missing or over limit.
4. Generate server-side: `const uuid = randomUUID(); const ext = mimeToExt[contentType]; const key = \`body/${productId}/${uuid}.${ext}\``.
5. Generate R2 presigned PUT URL via `@aws-sdk/client-s3-request-presigner` + `PutObjectCommand` scoped to the exact key and content type. Include `ContentLength` in the command.
6. Return `{ uploadUrl, key, publicUrl: \`${S3_PUBLIC_URL}/${key}\`, expiresAt }`.

**The client never provides the key.** An application HMAC claim is unnecessary — the R2 presigned URL is already a bearer credential scoped to one operation and object.

**Rate limit:** 20 presign requests per `seller_owner` per hour. Enforce with a Redis counter keyed to `body-img-sign:{userId}` with 1-hour TTL.

**Client upload contract:**

- `PUT uploadUrl` with `Content-Type: contentType` header only. `Content-Length` is set automatically by the browser's fetch/XHR.
- Use XHR (not `fetch`) to report upload progress in the editor UI.
- Reject `data:` URIs client-side as UX guard; the server sanitizer is authoritative.

---

## Section 3 — TipTap Editor Component

### File

`apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx` — `"use client"`

### Placement

Imported normally (not `dynamic`) inside `ProductEditForm` (which is already a client component). Set `immediatelyRender: false` on the `useEditor` hook to suppress SSR hydration mismatch.

### Extensions

| Extension               | Notes                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StarterKit`            | bold, italic, strike, code, codeBlock, blockquote, bulletList, orderedList, horizontalRule, paragraph, hardBreak                                        |
| `Underline`             | official `@tiptap/extension-underline`; `<u>` is in the sanitizer allowlist only because this extension is included                                     |
| `Heading`               | configured `levels: [3, 4]` — H1 is the product name, H2 is "Product Details"                                                                           |
| `Link`                  | `autolink: true`, `openOnClick: false`                                                                                                                  |
| `Image` (custom)        | rejects `data:` URIs before upload; calls `getBodyImageUploadUrl`; uses XHR with progress; stores `width`, `height`, `alt`; see image upload flow below |
| `TableKit`              | `@tiptap/extension-table` bundle (replaces four separate table extensions)                                                                              |
| `YoutubeEmbed` (custom) | see YouTube section below                                                                                                                               |

### Image upload flow (inside custom Image extension)

1. Count image nodes in ProseMirror document via `editor.state.doc.descendants` (not from HTML). If count ≥ 10, show inline error and abort.
2. Show an "alt text" prompt before uploading. Require non-empty text or explicit "decorative" checkbox.
3. Call `getBodyImageUploadUrl(productId, file.type, file.size)`.
4. XHR PUT to `uploadUrl` with progress events driving a progress bar.
5. On success: insert image node with `src: publicUrl`, `width`, `height`, `alt`.

Also provide an **"Insert Image URL"** toolbar button: prompts for a public HTTPS URL and alt text, then inserts the image node without any upload.

### YouTube custom node

Store in `body_html` as:

```html
<figure
  data-video-provider="youtube"
  data-video-id="abc123"
  data-video-title="Product demonstration"
></figure>
```

Never store an `<iframe>` in `body_html`. The TipTap YouTube extension is not used directly — build a custom node extension that:

- Validates the video ID on insert (alphanumeric + hyphens, 11 chars max).
- Renders a click-to-load placeholder in the editor (title + play button, no third-party resources loaded).
- Serialises to the `<figure data-video-*>` form.

### Submission contract

`ProductBodyEditor` receives its own `<form>` with a dedicated Save button — isolated from the main product form so revision conflicts and upload errors stay separate.

```tsx
// hidden inputs updated via refs in onChange
<input type="hidden" name="bodyHtml" ref={bodyHtmlRef} />
<input type="hidden" name="bodyRevision" value={revision} />
```

**Props:**

```ts
{
  productId: string
  initialHtml: string | null
  initialRevision: number
  onDirtyChange: (dirty: boolean) => void
  onUploadStateChange: (uploading: boolean) => void
}
```

- Disable the Save button while `onUploadStateChange(true)` is active.
- Use `beforeunload` + Next.js router guard to warn on navigation when dirty.

---

## Section 4 — Save Action

### `saveProductBody(productId, bodyHtml, revision)`

Location: `apps/web/src/app/seller/dashboard/products/actions.ts`

**Validation (before DB):**

1. Validate `revision` as a non-negative safe integer (`Number.isSafeInteger(revision) && revision >= 0`).
2. Validate `productId` is a valid UUID.

**Sanitize first, then extract:**

```
raw bodyHtml
  → DOMPurify.sanitize(html, SANITIZE_CONFIG)   // removes disallowed tags/attrs
  → check byte length ≤ 200 KB                   // reject if over
  → normalise empty string to null               // if no meaningful content
  → parse with node-html-parser                  // structural extraction
  → classify and count images                    // see URL classification below
  → validate image count ≤ 10                   // all img nodes, not just R2
  → normalise links                              // rel="noopener noreferrer nofollow ugc"
```

**DOMPurify allow-list (`SANITIZE_CONFIG`):**

Elements: `p, h3, h4, strong, em, u, s, ul, ol, li, a, blockquote, hr, code, pre, table, thead, tbody, tr, th, td, img, figure`

Attributes:

- `a`: `href`, `rel`, `target`
- `img`: `src`, `alt`, `width`, `height`, `loading`, `decoding`, `referrerpolicy`
- `figure`: `data-video-provider`, `data-video-id`, `data-video-title`
- `td`, `th`: `colspan`, `rowspan`, `scope`
- All others: no extra attributes

Strip: all `on*` event attributes, `javascript:` hrefs, `style` attributes, `script`, `style`, `iframe` elements.

**URL classification (using `new URL()`):**

```
parsed.origin === R2_ORIGIN && pathname starts with /body/{productId}/  → managed R2 image ✓
parsed.origin === R2_ORIGIN && any other pathname                        → REJECT (cross-product R2 URL)
different origin && protocol === "https:"                                → external image ✓
anything else (data:, http:, blob:, relative)                           → REJECT
```

**Video figure validation:** `data-video-provider` must equal `"youtube"`. `data-video-id` must match `/^[a-zA-Z0-9_-]{1,11}$/`. Reject figures that fail validation.

**Shared extractor:** Import `extractManagedBodyImageKeys(html, productId, publicOrigin): Set<string>` from `packages/shared/src/body-image-keys.ts`. Used by both save action and cleanup job.

**DB write (inside `withTenant`):**

```ts
// Fetch existing row with ownership check
const [existing] = await tx
  .select({ bodyHtml: schema.products.bodyHtml, bodyRevision: schema.products.bodyRevision })
  .from(schema.products)
  .where(and(eq(schema.products.id, productId), eq(schema.products.storeId, sellerStoreId)))
  .for("update")
  .limit(1)

if (!existing) return { ok: false, error: "not_found" }
if (existing.bodyRevision !== revision) return { ok: false, error: "conflict" }

await tx
  .update(schema.products)
  .set({ bodyHtml: sanitized, bodyRevision: revision + 1, updatedAt: new Date() })
  .where(eq(schema.products.id, productId))
```

On conflict (`existing.bodyRevision !== revision`): return `{ ok: false, error: "conflict" }` — delete nothing.

**Post-commit R2 cleanup (only on success):**

```ts
const oldKeys = extractManagedBodyImageKeys(existing.bodyHtml ?? "", productId, S3_PUBLIC_URL)
const newKeys = extractManagedBodyImageKeys(sanitized ?? "", productId, S3_PUBLIC_URL)
const orphaned = [...oldKeys].filter((k) => !newKeys.has(k))

await Promise.allSettled(orphaned.map((key) => deleteFromR2(key)))
// Log failures; do not surface them in the response
```

**Revalidation (after success):**

```ts
revalidatePath(`/seller/dashboard/products/${productId}/edit`)
revalidatePath(`/products/${storeSlug}/${productSlug}`)
```

**Return:** `{ ok: true, revision: revision + 1, html: sanitized }`

---

## Section 5 — Public Rendering

### `getProductBySlug` additions

Add to the select:

```ts
bodyHtml: schema.products.bodyHtml,
```

### AST-to-React renderer

Do **not** use `dangerouslySetInnerHTML`. Create `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx` — a server component that parses `body_html` and maps nodes to React elements through an approved-node walker:

| Node                                                                                           | React output                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p`, `h3`, `h4`, `strong`, `em`, `u`, `s`, `blockquote`, `hr`, `code`, `pre`, `ul`, `ol`, `li` | Matching React element                                                                                                                                |
| `a`                                                                                            | `<a>` with `href` revalidated (must be HTTPS), `rel="noopener noreferrer nofollow ugc"`, `target="_blank"`                                            |
| `img`                                                                                          | `<img>` with `src` revalidated (HTTPS), `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`, `width`, `height`, `alt` passed through |
| `table`                                                                                        | `<div className="overflow-x-auto"><table>…</table></div>`                                                                                             |
| `pre` / `code`                                                                                 | Wrapped to allow horizontal scroll                                                                                                                    |
| `figure[data-video-provider="youtube"]`                                                        | `<VideoEmbed videoId={…} title={…} />`                                                                                                                |
| Unknown tag or disallowed attribute                                                            | Discard node; recurse into children if any                                                                                                            |

### `VideoEmbed` client component

`apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx` — `"use client"`

- Renders a click-to-load placeholder: styled container with title and a visible play button. No third-party resources loaded until activation.
- On click: replaces placeholder with:
  ```html
  <iframe
    src="https://www.youtube-nocookie.com/embed/{validatedVideoId}"
    title={title ?? "Play YouTube video"}
    allowFullScreen
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  />
  ```
- Validates `videoId` matches `/^[a-zA-Z0-9_-]{1,11}$/` before rendering the iframe.

### Layout on product page

Add `@tailwindcss/typography` to `apps/web`. Below the gallery + add-to-cart region:

```tsx
{
  product.bodyHtml && (
    <section aria-labelledby="product-details-heading">
      <h2 id="product-details-heading">Product Details</h2>
      <div className="prose max-w-3xl">
        <BodyRenderer html={product.bodyHtml} />
      </div>
    </section>
  )
}
```

Omit the section entirely when `bodyHtml` is null or the renderer produces no meaningful nodes.

---

## Section 6 — Nightly Orphan Cleanup Job

### Registration

`apps/api/src/jobs/body-image-cleanup.ts`, registered in the existing BullMQ setup:

```ts
{ name: "body-image-cleanup", cron: "0 2 * * *", tz: "Asia/Kuala_Lumpur" }
```

BullMQ retries: exponential backoff, max 3 attempts.

### Shared extractor

`packages/shared/src/body-image-keys.ts`:

```ts
export function extractManagedBodyImageKeys(
  html: string,
  productId: string,
  publicOrigin: string,
): Set<string> // returns R2 keys (not full URLs) matching body/{productId}/
```

Used by both `apps/web` save action and `apps/api` cleanup job.

### Algorithm

**Phase 1 — Build reference set:**

Keyset-paginate through all products with non-null `body_html`:

```sql
SELECT id, body_html FROM products
WHERE body_html IS NOT NULL AND id > $lastSeenId
ORDER BY id
LIMIT 100
```

For each page: call `extractManagedBodyImageKeys(row.bodyHtml, row.id, S3_PUBLIC_URL)` and accumulate into a global `Set<string>` of all referenced R2 keys.

**Abort if any page fails** — do not proceed to deletion if reference set is incomplete.

**Phase 2 — Scan R2 and apply two-run quarantine:**

Paginated `ListObjectsV2` with `Prefix: "body/"`.

For each object:

- Skip if `LastModified` is missing → log and skip.
- Skip if `LastModified` is within 48 hours.
- Skip if key is in the reference set.
- Check Redis: `HGET body-img-candidates {key}` → `{ firstSeenAt: ISO string }`.
  - If no entry: `HSET body-img-candidates {key} {firstSeenAt: now()}` — mark candidate, do **not** delete.
  - If entry exists and `now() - firstSeenAt < 24h`: skip (quarantine period not elapsed).
  - If entry exists and elapsed ≥ 24h:
    1. **Final reference check:** parse `productId` from key (`body/{productId}/...`), fetch that product's `body_html` from DB, run `extractManagedBodyImageKeys`. If key is now referenced: `HDEL body-img-candidates {key}`, skip.
    2. Delete from R2.
    3. On success: `HDEL body-img-candidates {key}`. On failure: log, continue.
  - If key becomes referenced between runs: the Phase 1 set will contain it next run → `HDEL` marker then.

**Bounded concurrency:** delete at most 5 objects concurrently (`Promise.allSettled` with batching).

**Failure handling:**

| Failure                         | Action                         |
| ------------------------------- | ------------------------------ |
| DB pagination error             | Abort before any deletion, log |
| R2 listing error                | Abort before any deletion, log |
| Reference set build parse error | Abort before any deletion, log |
| Missing `LastModified`          | Skip object, log               |
| Final-check query failure       | Skip object, log               |
| Final-check parse failure       | Skip object, log               |
| Individual R2 delete failure    | Log and continue               |

**Logging at completion:**

```
body-image-cleanup: scanned={n} skipped_recent={n} skipped_referenced={n}
  quarantined_new={n} quarantined_pending={n} final_check_saved={n}
  deleted={n} failed={n}
```

### Environment

`apps/api` needs these env vars on Railway (already named for R2 compatibility):

- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`

Add `@aws-sdk/client-s3` to `apps/api` dependencies (no presigner needed for list/delete).

---

## Shared Package

### `packages/shared/src/body-image-keys.ts`

```ts
import { parse } from "node-html-parser"

export function extractManagedBodyImageKeys(
  html: string,
  productId: string,
  publicOrigin: string,
): Set<string> {
  if (!html) return new Set()
  const root = parse(html)
  const keys = new Set<string>()
  const origin = new URL(publicOrigin).origin
  const prefix = `/body/${productId}/`
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? ""
    try {
      const u = new URL(src)
      if (u.origin === origin && decodeURIComponent(u.pathname).startsWith(prefix)) {
        keys.add(decodeURIComponent(u.pathname).slice(1)) // strip leading /
      }
    } catch {
      // ignore unparseable URLs
    }
  }
  return keys
}
```

---

## Files Created / Modified

| File                                                                           | Action                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/drizzle/0021_product_body_html.sql`                               | Create — migration                                                                                                                                         |
| `packages/db/scripts/migrate.mjs`                                              | Modify — register 0021                                                                                                                                     |
| `packages/shared/src/body-image-keys.ts`                                       | Create — shared extractor                                                                                                                                  |
| `apps/web/src/app/seller/dashboard/products/actions.ts`                        | Modify — add `getBodyImageUploadUrl`, `saveProductBody`                                                                                                    |
| `apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx` | Create — TipTap client component                                                                                                                           |
| `apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx`                | Modify — pass `bodyHtml`, `bodyRevision` to edit form                                                                                                      |
| `apps/web/src/app/products/queries.ts`                                         | Modify — add `bodyHtml` to `getProductBySlug` select                                                                                                       |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`                 | Modify — render body section                                                                                                                               |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx`        | Create — AST-to-React renderer                                                                                                                             |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx`          | Create — click-to-load YouTube client component                                                                                                            |
| `apps/api/src/jobs/body-image-cleanup.ts`                                      | Create — BullMQ cleanup job                                                                                                                                |
| `apps/api/src/jobs/index.ts`                                                   | Modify — register cleanup job                                                                                                                              |
| `apps/web/package.json`                                                        | Modify — add TipTap packages, `isomorphic-dompurify`, `node-html-parser`, `@tailwindcss/typography`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| `apps/api/package.json`                                                        | Modify — add `@aws-sdk/client-s3` (no presigner needed for list/delete)                                                                                    |
| `packages/shared/package.json`                                                 | Modify — add `node-html-parser`                                                                                                                            |
