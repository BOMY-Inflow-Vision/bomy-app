# Product Rich Text Body — Design Specification

**Goal:** Add a WYSIWYG rich-text "Product Details" body to each product — editable by sellers in the edit dashboard, rendered below the gallery and add-to-cart section on the public product page.

**Architecture:** TipTap editor (client component inside `ProductEditForm`) stores sanitized HTML in a new `products.body_html` column. Inline images upload directly to R2 via server-generated presigned PUT URLs. On save, the action sanitizes, validates, and diffs old vs new R2 keys post-commit. A nightly BullMQ job in `apps/api` provides a two-run quarantine safety net for abandoned uploads.

**Tech Stack:** TipTap 3.x (all `@tiptap/*` packages pinned to the same version), `node-html-parser`, `isomorphic-dompurify`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (already in `apps/web`), `@tailwindcss/typography`, BullMQ + Redis (existing in `apps/api`).

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

-- Rate-limit log for body image upload signing (database-backed; no Redis needed in apps/web).
-- Rows older than 2 hours are cleaned up by the nightly cleanup job.
CREATE TABLE body_image_upload_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX body_image_upload_log_user_window_idx
  ON body_image_upload_log (user_id, created_at);
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
5. Generate R2 presigned PUT URL via `@aws-sdk/s3-request-presigner` + `PutObjectCommand` scoped to the exact key and content type. Include `ContentLength` in the command.
6. Return `{ uploadUrl, key, publicUrl: \`${S3_PUBLIC_URL}/${key}\`, expiresAt }`.

**The client never provides the key.** An application HMAC claim is unnecessary — the R2 presigned URL is already a bearer credential scoped to one operation and object.

**Rate limit — database-backed, race-safe:** Ownership validation, advisory lock, count, and insert all run inside one `withTenant` transaction. This serialises concurrent presign requests from the same user and prevents the race where all concurrent requests read a count below 20 before any insert commits:

```ts
const result = await withTenant(db, { userId, userRole: "seller_owner", sellerId }, async (tx) => {
  // Advisory lock serialises concurrent requests from the same seller.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('body-img-sign:' || ${userId}))`)

  const [product] = await tx
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.id, productId), eq(schema.products.storeId, sellerStoreId)))
    .limit(1)
  if (!product) return { ok: false as const, error: "not_found" }

  const since = new Date(Date.now() - 60 * 60 * 1000)
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.bodyImageUploadLog)
    .where(
      and(
        eq(schema.bodyImageUploadLog.userId, userId),
        gte(schema.bodyImageUploadLog.createdAt, since),
      ),
    )
  if (count >= 20) return { ok: false as const, error: "rate_limited" }

  await tx.insert(schema.bodyImageUploadLog).values({ userId })
  return { ok: true as const }
})
if (!result.ok) return result
// Generate presigned URL after the transaction commits.
```

`body_image_upload_log` schema requirements:

- `user_id` FK carries `ON DELETE CASCADE` so rows are removed when a user is deleted
- RLS `INSERT` policy: seller may only insert rows where `user_id = current_setting('app.current_user_id')::uuid`
- RLS `SELECT` policy: seller may only read their own rows
- `bomy_app` role granted `INSERT, SELECT, DELETE` on the table
- Concurrent-request regression test: fire 25 simultaneous presign calls for the same seller; assert exactly 20 succeed and 5 return `rate_limited`

Old rows (older than 2 hours) are pruned by the nightly cleanup job.

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

All `@tiptap/*` packages must be pinned to the **same TipTap 3.x version**. In v3, `Link` and `Underline` are bundled in `StarterKit` — do not register them separately.

| Extension               | Notes                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StarterKit`            | bold, italic, underline, strike, link, code, codeBlock, blockquote, bulletList, orderedList, horizontalRule, paragraph, hardBreak — configure `heading: { levels: [3, 4] }` inside StarterKit; H1 is the product name, H2 is "Product Details" |
| `Image` (custom)        | rejects `data:` URIs before upload; calls `getBodyImageUploadUrl`; uses XHR with progress; stores `width`, `height`, `alt`; see image upload flow below                                                                                        |
| `TableKit`              | `@tiptap/extension-table` bundle                                                                                                                                                                                                               |
| `YoutubeEmbed` (custom) | see YouTube section below                                                                                                                                                                                                                      |

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
- **Toolbar accessibility:** every toolbar button has `aria-label`. Toggle-state buttons (bold, italic, etc.) carry `aria-pressed={isActive}`.
- **Upload progress region:** a `<div role="status" aria-live="polite">` shows the current upload state: idle / "Uploading… {n}%" / "Upload failed: {message}" / "Saved".
- **Navigation warning:** use `addEventListener` with effect cleanup — `window.onbeforeunload` assignment does not clean up on unmount:
  ```ts
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])
  ```
  For in-app navigation (Next.js links), render a visible inline banner "You have unsaved changes" with a "Save now" button when dirty. App Router does not expose `beforePopState`; the banner is the in-app guard.
- **Toolbar touch targets:** minimum 44 × 44 px per button (WCAG 2.5.5).
- **Toolbar focus states:** all toolbar buttons must have a visible `focus-visible` outline.
- **Toolbar tooltips:** icon-only buttons must carry a `title` attribute (or `aria-describedby` tooltip) naming the action (e.g. "Bold", "Insert table", "Embed YouTube video").
- **Post-save canonical reset:** on `{ ok: true, revision, html }` response, update local `revision` state to the returned value, update the hidden `bodyRevision` input, set dirty to `false`, and replace the editor content with the returned `html` (the server-sanitized canonical form).
- **Conflict recovery:** on `{ ok: false, error: "conflict" }`, show: "Another tab or device saved this product. Copy your changes, then reload to get the latest version." with a "Reload page" button. Do **not** auto-reload — this would silently discard unsaved edits.

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
  → DOMPurify.sanitize(html, SANITIZE_CONFIG)                           // removes disallowed tags/attrs
  → parse with node-html-parser                                         // structural parse (needed for steps below)
  → normalise links                                                     // rel="noopener noreferrer nofollow ugc" (may add bytes)
  → re-serialize to HTML string                                         // canonical output after link normalization
  → Buffer.byteLength(serialized, "utf8") > 200 * 1024 → reject        // 200 KB limit AFTER normalization (not before)
  → hasmeaningfulContent(root) === false → normalise to null            // structural emptiness check (see below)
  → classify every img src                                              // see URL classification below
  → count all img nodes → reject if > 10                               // server-side image count limit
```

**Meaningful content check (`hasmeaningfulContent`):** TipTap commonly produces `<p></p>` when the editor is cleared, which survives `trim()`. A document is empty if it contains no `<img>`, no `<figure>`, and no element with non-whitespace text content. Implemented structurally via the parsed tree, not string matching:

```ts
function hasmeaningfulContent(root: HTMLElement): boolean {
  if (root.querySelectorAll("img, figure").length > 0) return true
  return root.textContent.trim().length > 0
}
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

**URL classification — use `isManagedBodyImageUrl` (strict) from the shared package:**

```
R2 origin + pathname matches /^\/body\/{productId}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|avif)$/i  → managed R2 image ✓
R2 origin + any other pathname                                                                        → REJECT (cross-product URL)
Different HTTPS origin                                                                                → external image ✓
http:, data:, blob:, javascript:, relative, or unparseable                                           → REJECT
```

Parse with `new URL(src)` inside a try/catch; a parse error is treated as REJECT. Compare `new URL(src).origin` to `new URL(S3_PUBLIC_URL).origin` for exact origin equality — do not use `startsWith`.

**Video figure validation:** `data-video-provider` must equal `"youtube"`. `data-video-id` must match `/^[a-zA-Z0-9_-]{1,11}$/`. Reject figures that fail validation.

**Shared functions:** Import from `packages/shared/src/body-image-keys.ts`:

- `classifyImageUrl(url, productId, publicOrigin): "managed" | "external" | "invalid"` — strict discriminated classification used by the save action. Returns `"managed"` only when origin matches R2 AND key exactly matches `body/{productId}/{uuid}.{ext}`. Returns `"external"` for valid HTTPS non-R2 URLs. Returns `"invalid"` for same-origin R2 URLs with a malformed path, `data:` URIs, `http:` URLs, relative paths, and unparseable strings. A boolean cannot distinguish `"invalid"` same-origin from `"external"`.
- `extractManagedBodyImageKeys(html, productId, publicOrigin): Set<string>` — tolerant extractor (parse errors skipped) used by the cleanup job and post-commit diff.

**Pre-transaction setup:** Before entering `withTenant`, resolve `sellerStoreId` from the authenticated session:

```ts
const session = await auth()
const userId = session?.user?.id
const userRole = session?.user?.role
if (!userId || userRole !== "seller_owner") return { ok: false, error: "unauthorized" }

// Fetch the seller's store ID — needed both for ownership check and withTenant context.
const store = await withPublicRead(db, (tx) =>
  tx
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(eq(schema.stores.ownerId, userId))
    .limit(1),
)
const sellerId = store[0]?.id
if (!sellerId) return { ok: false, error: "not_found" }
```

**DB write (inside `withTenant`):**

```ts
const txResult = await withTenant(
  db,
  { userId, userRole: "seller_owner", sellerId },
  async (tx) => {
    // Fetch existing row with ownership check, slugs for revalidation, and row lock.
    const [existing] = await tx
      .select({
        bodyHtml: schema.products.bodyHtml,
        bodyRevision: schema.products.bodyRevision,
        storeSlug: schema.stores.slug,
        productSlug: schema.products.slug,
      })
      .from(schema.products)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.products.storeId))
      .where(and(eq(schema.products.id, productId), eq(schema.products.storeId, sellerId)))
      .for("update")
      .limit(1)

    if (!existing) return { ok: false as const, error: "not_found" }
    if (existing.bodyRevision !== revision) return { ok: false as const, error: "conflict" }

    await tx
      .update(schema.products)
      .set({ bodyHtml: sanitized, bodyRevision: revision + 1, updatedAt: new Date() })
      .where(eq(schema.products.id, productId))

    // Return everything needed for post-commit work.
    return {
      ok: true as const,
      oldHtml: existing.bodyHtml,
      storeSlug: existing.storeSlug,
      productSlug: existing.productSlug,
    }
  },
)

if (!txResult.ok) return txResult
```

On conflict (`existing.bodyRevision !== revision`): return `{ ok: false, error: "conflict" }` — delete nothing.

**Post-commit R2 cleanup (only on success, using slugs returned from transaction):**

```ts
const oldKeys = extractManagedBodyImageKeys(txResult.oldHtml ?? "", productId, S3_PUBLIC_URL)
const newKeys = extractManagedBodyImageKeys(sanitized ?? "", productId, S3_PUBLIC_URL)
const orphaned = [...oldKeys].filter((k) => !newKeys.has(k))
await Promise.allSettled(orphaned.map((key) => deleteFromR2(key)))
// Log failures; do not surface them in the response
```

**Revalidation (using slugs from transaction return):**

```ts
revalidatePath(`/seller/dashboard/products/${productId}/edit`)
revalidatePath(`/products/${txResult.storeSlug}/${txResult.productSlug}`)
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

Job file: `apps/api/src/jobs/body-image-cleanup.ts`
Registration: `apps/api/src/scheduler.ts` (existing BullMQ scheduler file)

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

All DB reads in the cleanup job use `withAdmin(db, { userId: SYSTEM_ACTOR, reason: "body-image-cleanup" }, tx => ...)`. Without `withAdmin`, RLS (which applies to the `bomy_app` role) will hide products belonging to other sellers, causing valid referenced images to appear unreferenced and be deleted.

Keyset-paginate inside `withAdmin`:

```ts
await withAdmin(db, { userId: SYSTEM_ACTOR, reason: "body-image-cleanup" }, async (tx) => {
  // paginate: WHERE body_html IS NOT NULL AND id > lastSeenId ORDER BY id LIMIT 100
})
```

For each page: call `extractManagedBodyImageKeys(row.bodyHtml, row.id, S3_PUBLIC_URL)` and accumulate into a global `Set<string>` of all referenced R2 keys. After building the reference set, also `DEL body-img-candidate:{key}` in Redis for any key found to be referenced (explicit marker cleanup).

**Abort if any page fails** — do not proceed to deletion if reference set is incomplete.

Add an RLS regression test: run Phase 1 as `bomy_app` role without `withAdmin` and assert it returns zero rows for another seller's products; confirm `withAdmin` returns the full set.

**Phase 2 — Scan R2 and apply two-run quarantine:**

Paginated `ListObjectsV2` with `Prefix: "body/"`.

For each object:

- Skip if `LastModified` is missing → log and skip.
- Skip if `LastModified` is within 48 hours.
- Skip if key is in the reference set.
- Check Redis using a **per-object key** (not a shared hash): `GET body-img-candidate:{encodedKey}`.
  - If no entry: `SET body-img-candidate:{encodedKey} {ISO timestamp} EX 259200` (72-hour TTL) — mark candidate, do **not** delete. If the object later becomes referenced, the marker expires harmlessly or is cleared explicitly (see below).
  - If entry exists and `now() - firstSeenAt < 24h`: skip (quarantine period not elapsed).
  - If entry exists and elapsed ≥ 24h:
    1. **Final reference check:** parse `productId` from the validated key path, fetch that product's `body_html` using `withAdmin(db, { userId: SYSTEM_ACTOR, reason: "body-image-cleanup-final-check" }, ...)`, run `extractManagedBodyImageKeys`. If key is now referenced: `DEL body-img-candidate:{encodedKey}` — clear marker, skip.
    2. Delete from R2.
    3. On success: `DEL body-img-candidate:{encodedKey}`. On failure: log, continue (marker remains; next run will retry).
  - **Explicit marker cleanup when an object re-enters the reference set:** in Phase 1, after accumulating the reference set, issue `DEL body-img-candidate:{encodedKey}` for any key found in the reference set that has a candidate marker. This prevents a 24h false-positive window after a seller re-references an image.

**Complete listing before deletion:** collect all candidate keys across all `ListObjectsV2` pages into an in-memory set _before_ starting any R2 deletes. This makes the "R2 listing error aborts before deletion" guarantee unconditional — an error during page N of listing cannot leave partial deletion state.

**Bounded concurrency:** delete at most 5 objects concurrently (`Promise.allSettled` with batching).

**Redis failure semantics (fail-safe):** if a Redis `GET`, `SET`, or `DEL` call fails, treat the affected object as if it has no quarantine marker — skip it (do not delete). Log the Redis error. A Redis outage delays cleanup but never causes an unsafe deletion.

**Failure handling:**

| Failure                         | Action                                |
| ------------------------------- | ------------------------------------- |
| DB pagination error             | Abort before any deletion, log        |
| R2 listing page error           | Abort before any deletion, log        |
| Reference set build parse error | Abort before any deletion, log        |
| Redis read/write failure        | Skip affected object (fail-safe), log |
| Missing `LastModified`          | Skip object, log                      |
| Final-check DB query failure    | Skip object, log                      |
| Final-check parse failure       | Skip object, log                      |
| Individual R2 delete failure    | Log and continue; marker not cleared  |

**Upload-log housekeeping:** at the end of each run, delete rows from `body_image_upload_log` where `created_at < now() - interval '2 hours'`. Runs inside `withAdmin`.

**Logging at completion:**

```
body-image-cleanup: scanned={n} skipped_recent={n} skipped_referenced={n}
  quarantined_new={n} quarantined_pending={n} final_check_saved={n}
  deleted={n} failed={n} upload_log_pruned={n}
```

### Environment

`apps/api` needs these env vars on Railway (already named for R2 compatibility):

- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`

Add `@aws-sdk/client-s3` to `apps/api` dependencies (no presigner needed for list/delete).

---

## Shared Package

`packages/shared` does not currently exist and requires full scaffolding: `package.json` (name `@bomy/shared`, include `node-html-parser` as a dependency), `tsconfig.json` extending `../../tsconfig.base.json` (not `@bomy/config/...` — match the path used by existing packages), and entries in `apps/web/package.json` and `apps/api/package.json` workspace dependencies. See `packages/hitpay` for the scaffold pattern.

### `packages/shared/src/body-image-keys.ts`

```ts
import { parse } from "node-html-parser"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY_RE =
  /^body\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i

/** Strict discriminated classification — used by save action. */
export function classifyImageUrl(
  url: string,
  productId: string,
  publicOrigin: string,
): "managed" | "external" | "invalid" {
  try {
    const u = new URL(url)
    const r2Origin = new URL(publicOrigin).origin
    if (u.origin === r2Origin) {
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      return KEY_RE.test(path) && path.startsWith(`body/${productId}/`) ? "managed" : "invalid" // same-origin but wrong path — cross-product or malformed
    }
    return u.protocol === "https:" ? "external" : "invalid"
  } catch {
    return "invalid"
  }
}

/** Tolerant extractor — used by cleanup job and post-commit diff. Parse errors are skipped. */
export function extractManagedBodyImageKeys(
  html: string,
  productId: string,
  publicOrigin: string,
): Set<string> {
  if (!html) return new Set()
  const root = parse(html)
  const keys = new Set<string>()
  const r2Origin = new URL(publicOrigin).origin
  const expectedPrefix = `body/${productId}/`
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? ""
    try {
      const u = new URL(src)
      if (u.origin !== r2Origin) continue
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      if (path.startsWith(expectedPrefix) && KEY_RE.test(path)) {
        keys.add(path)
      }
    } catch {
      // skip unparseable URLs
    }
  }
  return keys
}
```

---

## Test Plan

Tests live alongside the code they cover. Integration tests follow the `describe.skipIf(!shouldRun)` pattern with `BOMY_RLS_READY=1`.

### Sanitizer / XSS (`apps/web/tests/seller-products/body-sanitizer.test.ts`)

- Strips `<script>` tags and `on*` event attributes
- Strips `javascript:` hrefs
- Strips `data:` URIs from `<img src>`
- Strips `<iframe>` elements
- Strips `style` attributes
- Preserves all allowlisted elements and attributes
- Normalises links with `rel="noopener noreferrer nofollow ugc"`
- Rejects sanitized output exceeding 200 KB (`Buffer.byteLength`)
- Normalises empty/whitespace-only content to `null`

### URL classification (`apps/web/tests/seller-products/body-image-keys.test.ts`)

- `isManagedBodyImageUrl`: accepts exact `body/{productId}/{uuid}.{ext}` at R2 origin
- `isManagedBodyImageUrl`: rejects cross-product R2 URL (different productId)
- `isManagedBodyImageUrl`: rejects R2 URL with nested path (`body/pid/subdir/uuid.jpg`)
- `isManagedBodyImageUrl`: rejects `data:` URI
- `isManagedBodyImageUrl`: rejects `http:` external URL
- `isManagedBodyImageUrl`: rejects relative URL
- `isManagedBodyImageUrl`: rejects unparseable string (try/catch returns false)
- `extractManagedBodyImageKeys`: returns only R2 keys for correct productId, skips external images and other products' R2 URLs

### Ownership + revision (`apps/web/tests/seller-products/actions.test.ts`)

- `saveProductBody` rejects if caller does not own the product (`not_found`)
- `saveProductBody` returns `conflict` when submitted revision differs from DB revision; DB row unchanged
- `saveProductBody` increments `bodyRevision` on success and returns new value
- `saveProductBody` rejects non-integer revision (negative, decimal, non-safe)

### Size and image limits

- `saveProductBody` rejects body with > 10 `<img>` tags (all images counted, not just R2)
- `saveProductBody` rejects body exceeding 200 KB after sanitization
- `getBodyImageUploadUrl` rejects `contentLength > 2 MB`
- `getBodyImageUploadUrl` rejects `contentLength <= 0`
- `getBodyImageUploadUrl` rejects disallowed MIME types (`image/svg+xml`, `text/html`)

### Upload rate limiting

- 20th request in 1-hour window succeeds; 21st returns `rate_limited`
- Rate limit is per-user (different seller is unaffected)
- Window resets after 1 hour

### Renderer allow-list (`apps/web/tests/products/body-renderer.test.ts`)

- Unknown tags are discarded; their children are preserved
- Disallowed attributes are stripped from known tags
- `<a href="javascript:...">` is rejected (href revalidated as HTTPS)
- `<img src="http://...">` is rejected (src revalidated as HTTPS)
- `<figure data-video-provider="youtube" data-video-id="abc123">` renders `<VideoEmbed>`
- `<figure>` with invalid video ID is discarded
- `<table>` is wrapped in `overflow-x-auto` container

### Cleanup quarantine (`apps/api/tests/jobs/body-image-cleanup.test.ts`)

- Object younger than 48h is skipped; no Redis marker written
- Object not in reference set and older than 48h: marker written on first run, not deleted
- Object still unreferenced on second run ≥ 24h later: deleted, marker cleared
- Object that re-enters reference set between runs: marker deleted in Phase 1 explicit cleanup, object skipped
- Final-reference check fires before deletion; if product now references key, delete is skipped
- Individual R2 delete failure: logged, job continues, marker not cleared (retry next run)
- Phase 1 DB pagination failure: job aborts before entering deletion phase

---

## Files Created / Modified

| File                                                                           | Action                                                                                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/db/drizzle/0021_product_body_html.sql`                               | Create — migration (adds `body_html`, `body_revision`, `body_image_upload_log`)                                         |
| `packages/db/scripts/migrate.mjs`                                              | Modify — register 0021                                                                                                  |
| `packages/db/src/schema/products.ts`                                           | Modify — add `bodyHtml`, `bodyRevision` columns                                                                         |
| `packages/db/src/schema/body-image-upload-log.ts`                              | Create — Drizzle schema for `body_image_upload_log`                                                                     |
| `packages/db/src/schema/index.ts`                                              | Modify — export `bodyImageUploadLog` schema                                                                             |
| `packages/db/src/rls/policies.sql`                                             | Modify — add RLS policies and grants for `body_image_upload_log`                                                        |
| `packages/shared/package.json`                                                 | Create — scaffold `@bomy/shared` (name `@bomy/shared`, exports, `node-html-parser` dep)                                 |
| `packages/shared/tsconfig.json`                                                | Create — extends `../../tsconfig.base.json` (matches existing packages pattern)                                         |
| `packages/shared/src/body-image-keys.ts`                                       | Create — `classifyImageUrl` (discriminated) + `extractManagedBodyImageKeys` (tolerant)                                  |
| `apps/web/src/app/seller/dashboard/products/actions.ts`                        | Modify — add `getBodyImageUploadUrl`, `saveProductBody`                                                                 |
| `apps/web/src/app/seller/dashboard/products/[id]/edit/product-body-editor.tsx` | Create — TipTap client component                                                                                        |
| `apps/web/src/app/seller/dashboard/products/[id]/edit/page.tsx`                | Modify — pass `bodyHtml`, `bodyRevision` to edit form                                                                   |
| `apps/web/src/app/products/queries.ts`                                         | Modify — add `bodyHtml` to `getProductBySlug` select                                                                    |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/page.tsx`                 | Modify — render body section                                                                                            |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/body-renderer.tsx`        | Create — AST-to-React renderer (server component)                                                                       |
| `apps/web/src/app/products/[storeSlug]/[productSlug]/video-embed.tsx`          | Create — click-to-load YouTube client component                                                                         |
| `apps/web/tailwind.config.ts`                                                  | Modify — register `@tailwindcss/typography` plugin                                                                      |
| `apps/web/package.json`                                                        | Modify — add TipTap 3.x packages, `isomorphic-dompurify`, `node-html-parser`, `@tailwindcss/typography`, `@bomy/shared` |
| `apps/api/src/jobs/body-image-cleanup.ts`                                      | Create — BullMQ cleanup job                                                                                             |
| `apps/api/src/scheduler.ts`                                                    | Modify — register `body-image-cleanup` job                                                                              |
| `apps/api/package.json`                                                        | Modify — add `@aws-sdk/client-s3`, `@bomy/shared`                                                                       |
