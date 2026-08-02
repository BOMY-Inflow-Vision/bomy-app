# Mandatory Brand Story + Video at admin store provisioning

**Status:** design, approved for spec review. Revised after a review pass that caught a
partial-commit bug in the original draft (see §3) — folded in below along with every other
finding from that pass.

> **Post-implementation note:** this document is the pre-implementation design as approved — kept
> as the accurate historical record, not retroactively rewritten to match the final shipped code.
> Two known divergences from what actually shipped, called out here so a future reader isn't misled:
> (1) §5's "no client-side gating on `/stores/new`" was the original decision, but the final
> whole-branch review (after this spec was approved) added a live client-side character-count/
> video-validity hint with a disabled submit button — server validation stayed the sole
> authoritative gate, this was UX-only; (2) the shipped file is
> `apps/admin/src/app/stores/new/store-provisioning-fields.tsx`, not `store-body-field.tsx` as
> referenced below — renamed during that same fix wave once it grew beyond "just the body field."
> Full detail on both: `log/2026-08-02_PR109_mandatory-brand-story-video.md`.

## Summary

Both admin paths that create a `stores` row — seller-inquiry approval
(`apps/admin/src/app/seller-inquiries/[id]`) and direct manual creation (`apps/admin/src/app/stores/new`)
— currently create a store with no `body_html`/`video_id`, leaving the seller's own Settings page
(`apps/web/src/app/seller/dashboard/settings`) blank until the seller fills it in themselves. This
adds a **mandatory Brand Story (rich text) and Video (YouTube URL) field to both admin creation
paths**, so every store is provisioned with real launch content. Once created, these fields behave
exactly like any other seller-owned Settings field — the seller can freely edit or clear them
afterward. This is a one-time data-entry quality gate at admin provisioning, not a permanent schema
invariant (see §7 for why, and what a stricter version would require).

No new migration: `stores.body_html`/`stores.body_revision`/`stores.video_id` already exist via
migration `0028_store_body_video.sql`, applied locally and in CI. **`.andy/handoff.md` still records
0028/0029 as not applied to prod Neon** — an earlier session's live debugging got `/seller/dashboard/settings`
working again in prod (which needs `body_html` to exist), which is evidence the migration likely ran,
but the handoff was never updated with that evidence, so this spec treats prod status as
**unconfirmed** and makes verifying/applying it an explicit pre-flight step (§8) — not an assumption.
**Post-implementation update:** resolved before this feature branched — both migrations are
confirmed applied to prod Neon, and `.andy/handoff.md` now reflects that. See §8's own
post-implementation note and the PR #109 log (`log/2026-08-02_PR109_mandatory-brand-story-video.md`)
for how. Left the original unconfirmed framing above intact as the accurate pre-implementation
snapshot — see this document's top-of-file status note.

## 1. Shared sanitizer relocation

`normalizeBodyHtml`/`SANITIZE_OPTIONS` currently live only in `apps/web/src/lib/body-sanitizer.ts`.
Both admin action files need to run the identical sanitizer against the same `stores.body_html`
column — two independently-maintained copies of a security boundary (HTML sanitization) is a real
risk (`allowedTags`/`allowedAttributes` drifting apart between web and admin over time).

**Move** `apps/web/src/lib/body-sanitizer.ts` → `packages/shared/src/body-sanitizer.ts` unchanged
(logic-for-logic), test file `apps/web/tests/seller-products/body-sanitizer.test.ts` →
`packages/shared/tests/body-sanitizer.test.ts`.

- `packages/shared/package.json`: add deps `sanitize-html`, `server-only`; add devDep
  `@types/sanitize-html`.
- `packages/shared/src/body-sanitizer.ts` keeps its `import "server-only"` line.
- **Export only via subpath**, not the root barrel: `packages/shared/package.json` `exports` gains
  `"./body-sanitizer": "./src/body-sanitizer.ts"`. `packages/shared/src/index.ts` does **not**
  re-export it — mirrors the existing `./youtube` subpath pattern and keeps this out of any
  accidental client-bundle path via the root import.
- **Both** live call sites move to the new path — `await import("@/lib/body-sanitizer")` →
  `await import("@bomy/shared/body-sanitizer")` in:
  - `apps/web/.../settings/body-actions.ts` (store brand story)
  - `apps/web/src/app/seller/dashboard/products/actions.ts:774` (product body — missed in the first
    draft of this spec; confirmed via `grep -rl "lib/body-sanitizer"` that these are the only two
    runtime call sites, so nothing else is missed)
- Delete the old `apps/web/src/lib/body-sanitizer.ts` and its old test location only after **both**
  call sites above are updated — deleting first breaks product body saves.

**Test infra fix required by the move:** `apps/web/vitest.config.ts` aliases `"server-only"` to a
one-line stub (`tests/stubs/server-only.ts`, `export {}`) so tests can import files that
`import "server-only"`. `packages/shared/vitest.config.ts` has no such alias today, and neither does
`apps/admin/vitest.config.ts` (which will now transitively need it — see §4). Add:

- `packages/shared/tests/stubs/server-only.ts` (`export {}`) + a `resolve.alias` block in
  `packages/shared/vitest.config.ts` pointing `"server-only"` at it.
- `apps/admin/tests/stubs/server-only.ts` (`export {}`) + the same alias added to
  `apps/admin/vitest.config.ts`'s existing `resolve.alias` block (currently only has `"@"`).

## 2. Admin rich-text field (new component, not a copy of web's)

`apps/web/src/components/body-editor.tsx` is not reusable as-is: it owns its own `<form>`, hidden
`bodyHtml`/`bodyRevision` inputs, save button, save-status/conflict-detection state, and an upload
pipeline. Admin needs a plain **field** — mount an editor, report HTML changes upward, nothing else.
Per this repo's existing convention (admin keeps its own UI copies rather than sharing a `packages/ui`
— see root `CLAUDE.md` Conventions), this is a new admin-owned component, not an import from web.

**New files under `apps/admin/src/components/`:**

- `brand-story-field.tsx` — Tiptap editor, `{ value: string | null; onChange: (html: string) => void }`
  props. Toolbar: headings (h3/h4), bold/italic/underline/strike, link, inline code, lists,
  blockquote, hr, table + table controls, **insert-image-by-URL**, embed-YouTube. No file-upload
  button, no upload-progress UI, no dirty-state banner, no save button — the parent form (approve
  form / create-store form) owns submission.
- `static-image-node.ts` — a minimal Tiptap `Node` extension with the **same schema** as web's
  `ImageUploadExtension` (name `imageUpload`, `src`/`alt`/`width`/`height` attrs, same
  `parseHTML`/`renderHTML`) but **no `addCommands`** (no `uploadBodyImage`, no upload options).
  Required because "insert image by URL" inserts this node type directly via
  `editor.chain().insertContent({ type: "imageUpload", ... })` — it needs the node _registered_, but
  never calls the upload command, so the command doesn't need to exist. This is why "insert by URL"
  still works with the file-upload button removed.
- `youtube-embed-extension.ts` — straight duplicate of web's (`@tiptap/core` + `@bomy/shared/youtube`
  only, no server dependency, nothing to adapt).

**Why no upload button:** the web upload flow signs an R2 PUT URL keyed by the store's own ID
(`body/stores/{storeId}/...`), which doesn't exist until the store row is actually created. That one
capability can't work pre-creation. "Insert image by URL" has no such dependency (any `https://`
URL) and stays available.

**New deps in `apps/admin/package.json`:** `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`,
`@tiptap/extension-table` (pinned to web's `3.27.1`), `@bomy/shared` (workspace dep, not present in
admin today). `apps/admin/next.config.ts` `transpilePackages` gains `"@bomy/shared"`.

## 3. Server actions — atomic insert, validate before any DB write

**Critical fix from review:** `withAdmin` (`packages/db/src/tenant.ts`) commits its transaction on
any normal return — it only rolls back if the callback _throws_. A callback that inserts a store row
and _then_ returns `{ ok: false, error: ... }` after a failed validation still **commits the
insert**, leaving a bad partial store behind. The existing `approveInquiry` avoids this today by
doing every validation check before its one `INSERT`. The new fields must follow the same rule, so:

- **Validate outside the transaction entirely**, before `withAdmin` is even called — `normalizeBodyHtml`
  and `extractYoutubeVideoId` are pure functions with no DB dependency, so there's no reason to open
  a transaction (and write an `admin_bypass_audit` row) for input that's about to fail anyway.
- **Pre-generate the store's UUID** (`randomUUID()`) so `normalizeBodyHtml`'s image-scope check
  (`{ kind: "store", id: storeId }`) has a real ID to validate against _before_ the row exists.
- Do **one INSERT** with `id`, `bodyHtml`, `videoId` all supplied together — never insert first and
  update after.

```ts
// apps/admin/src/app/seller-inquiries/actions.ts — approveInquiry, revised

export async function approveInquiry(
  inquiryId: string,
  slug: string,
  bodyHtml: string,
  videoUrl: string,
): Promise<ReviewResult> {
  const adminId = await requireAdminId()

  // Pure validation first — no DB, no transaction, fails fast on bad input.
  const videoId = extractYoutubeVideoId(videoUrl.trim())
  if (!videoId) return { ok: false, error: "A valid YouTube video URL is required." }

  const S3_PUBLIC_URL = process.env["S3_PUBLIC_URL"] ?? ""
  try {
    const u = new URL(S3_PUBLIC_URL)
    if (u.protocol !== "https:") throw new Error()
  } catch {
    return { ok: false, error: "Server misconfigured: S3_PUBLIC_URL." }
  }

  const storeId = randomUUID()
  const { normalizeBodyHtml } = await import("@bomy/shared/body-sanitizer")
  const sanitized = normalizeBodyHtml(bodyHtml, { kind: "store", id: storeId }, S3_PUBLIC_URL)
  if (!sanitized.ok) return { ok: false, error: `Brand Story: ${sanitized.error}` }
  if (sanitized.canonicalHtml === null) {
    return { ok: false, error: "Brand Story is required." }
  }
  if (extractPlainText(sanitized.canonicalHtml).length < BRAND_STORY_MIN_CHARS) {
    return {
      ok: false,
      error: `Brand Story needs at least ${BRAND_STORY_MIN_CHARS} characters of actual text.`,
    }
  }

  // ...existing withAdmin transaction: inquiry lookup + FOR UPDATE, status gate ("pending"),
  // owner resolution by email + FOR UPDATE, one-store-per-owner guard, slug collision loop —
  // all unchanged. Step 5's insert becomes:

  const [newStore] = await tx
    .insert(schema.stores)
    .values({
      id: storeId,
      ownerId: owner.id,
      name: inquiry.storeName,
      slug: finalSlug,
      status: "pending",
      bodyHtml: sanitized.canonicalHtml,
      videoId,
    })
    .returning({ id: schema.stores.id })

  // ...rest unchanged (stamp inquiry, carry email payload, send email after tx).
}
```

`apps/admin/src/app/stores/actions.ts` `createStore` gets the identical treatment: read
`bodyHtml`/`videoUrl` from `FormData`, run the same two checks before opening `withAdmin`, pre-generate
`storeId`, single `INSERT` with `id`/`bodyHtml`/`videoId` included (this path sets `status: "active"`
immediately, as it does today). **Stays throw-based** on validation failure (`throw new Error(...)`),
matching every other check already in this function (`"Missing required fields"`,
`"Owner already has a store"`) — converting it to typed `{ ok, error }` results would require
converting `/stores/new/page.tsx` from a plain server-action form into a client component with
`useActionState` just to display the error inline, which is an unrelated, larger refactor of a page
that already throws-and-shows-Next's-default-error-page for every other validation it has today. Out
of scope here; not a regression this feature introduces.

**`BRAND_STORY_MIN_CHARS = 20`** and `extractPlainText` live in a small new
`apps/admin/src/lib/brand-story-validation.ts`, imported by both action files. **Deliberately not**
added to the shared sanitizer — per review, product bodies and a seller's later edits from their own
Settings page should not inherit this stricter admin-only business rule; `canonicalHtml !== null` from
`normalizeBodyHtml` alone remains the bar everywhere else.

A naive regex tag-strip (`html.replace(/<[^>]*>/g, "")`) is **not enough**: it doesn't decode HTML
entities (`&nbsp;` stays as the literal 6 characters `&nbsp;` — passing the 20-char bar on pure
whitespace) and doesn't touch zero-width/formatting Unicode characters (U+200B zero-width space,
U+FEFF BOM, etc. — invisible but real characters that would also pass the bar with nothing readable
behind them). `extractPlainText` instead:

```ts
import { parse } from "node-html-parser"

// Matches every Unicode "format" codepoint (category Cf — zero-width spaces/joiners,
// bidi embedding/override controls, BOM, etc.) via a Unicode property escape rather than
// hand-enumerating codepoint ranges. Deliberate choice over listing individual \u escapes:
// property escapes can't silently regress into literal invisible characters getting pasted
// into source (which happened while drafting this spec — worth noting so the implementation
// doesn't repeat it), and Cf is the correct general category for exactly this class of
// hidden-padding character, not just the handful someone happens to remember.
const FORMAT_CHAR_RE = /\p{Cf}/gu

export function extractPlainText(html: string): string {
  // node-html-parser's textContent decodes entities (&nbsp; -> U+00A0) as part of parsing,
  // unlike a regex tag-strip.
  const decoded = parse(html).textContent
  return decoded
    .replace(FORMAT_CHAR_RE, "")
    .replace(/\s+/g, " ") // collapses runs of whitespace, including U+00A0 (JS \s matches NBSP)
    .trim()
}
```

Adds `node-html-parser` to `apps/admin/package.json` (already a dependency elsewhere in the
monorepo — `@bomy/shared`, `apps/web` — so this isn't a new pattern, just a new consumer).

**New test cases in §6's admin action tests**, both must be rejected by the 20-char gate:

- Entity-only body: `<p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>` (decodes to NBSPs, collapsed to nothing
  by the trim).
- Zero-width-only body: a paragraph built from `String.fromCodePoint(0x200b)` (zero-width space)
  repeated past 20 raw characters — a real string in the test file, not a literal invisible
  character pasted into source.

## 4. `S3_PUBLIC_URL` in admin

`normalizeBodyHtml`'s image-scope check classifies any pasted `<img>` URL as `managed` (must match
the given store-ID scope) or `external` (any other `https://` URL, allowed through) by comparing
against `S3_PUBLIC_URL`'s origin. Admin has never needed any `S3_*` var before this — it does no
upload signing, but it does need this one var, read-only, for that origin comparison.

- **Two files need this**, not one — `apps/admin/.env.example` and the root `app/.env.example`'s own
  `apps/admin` section (`.env.example:171`, `# apps/admin — Internal ops console`) are separate,
  independently-maintained documents; the root one already has admin's `DATABASE_URL`,
  `INTERNAL_API_SECRET`, mailer vars, etc. duplicated there and would silently drift out of sync if
  only the app-local file were updated. Add the same entry to both:
  ```
  # Public URL of the R2 bucket (must match apps/web's S3_PUBLIC_URL) — used only to classify
  # pasted image URLs in the Brand Story editor as same-origin vs external. No upload signing
  # happens in admin, so no other S3_* vars are needed here.
  # S3_PUBLIC_URL=https://cdn.brandsofmalaysia.com
  ```
- Vercel: add `S3_PUBLIC_URL` to the `bomy-app-admin` project's env (Preview + Production) — an ops
  step in the implementation plan, called out explicitly so it isn't missed at deploy time.
- Both action files validate it's a well-formed `https://` URL before calling the sanitizer (shown in
  §3's snippet), returning a clear "misconfigured" error rather than a confusing downstream failure.

## 5. UI

`apps/admin/src/app/seller-inquiries/[id]/approve-form.tsx` (already `"use client"`): add
`<BrandStoryField>` (state-held `bodyHtml`) and a `Video URL` `Input` (state-held `videoUrl`) above
the existing slug field. `Approve` button `disabled` also gates on both being non-empty — client-side
UX only; the server action above is the real, only trustworthy gate. Call becomes
`approveInquiry(inquiryId, slug, bodyHtml, videoUrl)`.

`apps/admin/src/app/stores/new/page.tsx` (server component, plain form action): add a small new
`"use client"` island (e.g. `store-body-field.tsx`) wrapping `<BrandStoryField>` + a hidden
`<input name="bodyHtml">` kept in sync via `onChange` — same composition pattern
`apps/web`'s `SettingsForm`/`BodyEditor` already uses (hidden input mirrors editor state so a native
`FormData` submit picks it up). Add a plain `<Input name="videoUrl" type="url" required>` — no client
JS needed for that one, matching the page's existing plain-input style for `slug`/`name`.

**No disabled-submit-button state on this page, deliberately** — `/stores/new` keeps its current
plain native-submit behavior for every field (`name`/`slug` already rely on `required`/`pattern`
alone, no JS-driven button state today). This is intentional, not an oversight: the server action is
the authoritative gate regardless (§3), and adding client-side button-disabling here would mean
converting this one field's parent to track more state than the rest of the page does, for a
cosmetic benefit only. `ApproveForm` gets the disabled-state treatment because it's already a client
component with `useTransition`/local state for the existing Approve/Reject buttons — this is the one
admin surface where that pattern already exists to extend.

## 6. Testing

- Relocated `packages/shared/tests/body-sanitizer.test.ts` — assertions unchanged, just moved.
- Extend `apps/admin/tests/seller-inquiries/actions.test.ts`: empty Brand Story → rejected; Brand
  Story under 20 chars of text (e.g. a lone image or YouTube embed with no prose) → rejected; missing
  or invalid Video URL → rejected; **and for every rejection case, assert no `stores` row was created**
  — this is the direct regression test for the partial-commit bug this spec fixes. Happy path asserts
  the created row's `bodyHtml`/`videoId` match what was submitted.
- Extend `apps/admin/tests/stores/actions.test.ts` (already exists) with the equivalent coverage for
  `createStore`.
- New stub files + vitest alias wiring per §1.

## 7. Scope boundary: provisioning-time gate only

Explicitly **not** in scope, and why:

- The seller's own `saveStoreBody`/`updateStoreVideo` actions (`apps/web/.../settings/*.ts`) are
  **unchanged** — a seller can still clear their video or shorten/rewrite their brand story to
  anything (including empty) after their store exists. This is a one-time quality gate at the admin
  handoff, not a permanent schema invariant.
- Stores that are already `pending`/`active` today with empty `body_html`/`video_id` are **not**
  retroactively touched or blocked — `approveStore` (`apps/admin/src/app/stores/actions.ts`, the
  separate pending→active promotion step) is unchanged and has no new field dependency.
- A future "published storefront must always have a non-empty story" invariant is a **separate**
  design — it would need backfill for existing stores, a grandfather rule, and new UI states on the
  seller's own Settings page, none of which this spec addresses.

## 8. Deployment note

> **Post-implementation update:** resolved. Both migrations were confirmed applied to prod Neon
> during this same working session, before this feature's implementation branch was even created —
> `.andy/handoff.md` now records this as closed, not open. The paragraph below is the original
> pre-implementation deployment gate as written; kept verbatim as the accurate historical record of
> what this spec required before shipping, not as a currently-open blocker.

This feature **depends on migration `0028`** (`stores.body_html`/`stores.video_id`) being applied to
prod Neon. `.andy/handoff.md` currently records 0028/0029 as **not applied to prod** — that is the
authoritative status until proven otherwise; this spec does not override it based on informal
evidence. The implementation plan's pre-flight step must verify with a direct query before this
feature can ship, and apply the migration first (operator-shell pattern, same as PR #107's prod
migration — `docs/runbooks/public-deployment-cutover.md` step 3) if it's still missing:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'stores' AND column_name IN ('body_html', 'video_id');
-- expect 2 rows. If 0, apply migration 0028 (and 0029) before proceeding with this feature at all.
```

Once verified (or applied), update `.andy/handoff.md` with the real evidence (query output or
migration log) so this stops being a recurring open question across sessions.
