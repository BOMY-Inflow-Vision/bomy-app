# Mandatory Brand Story + Video at Admin Store Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both admin store-creation paths (seller-inquiry approval, direct manual creation) require a
real Brand Story and Video before a store can be provisioned, so every seller launches with content
already on their public storefront and Settings page instead of a blank one.

**Architecture:** A shared, server-only HTML sanitizer (relocated from `apps/web` into `@bomy/shared`)
backs a new admin-only Tiptap rich-text field component (no upload capability — admin never has a
store ID to key an upload to). Both admin server actions validate Brand Story + Video _before_
opening any DB transaction, pre-generate the new store's UUID, and perform one atomic `INSERT`
carrying `id`/`body_html`/`video_id` together — never insert-then-update — because `withAdmin` only
rolls back on a thrown error, not a returned `{ ok: false }`.

**Tech Stack:** Next.js 15 (Turborepo monorepo), Drizzle ORM, Tiptap 3 (`@tiptap/react` +
`@tiptap/starter-kit` + `@tiptap/extension-table`), `sanitize-html`, `node-html-parser`, Vitest.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-08-01-mandatory-brand-story-video-design.md` — every
  task below implements a section of it; consult it for the full "why" behind each decision.
- **No new DB migration.** `stores.body_html`/`stores.body_revision`/`stores.video_id` already exist
  via migration `0028_store_body_video.sql`. Task 8 verifies/applies it to prod as a pre-flight step —
  do not skip it before this feature ships.
- **Never insert a `stores` row before all validation (Brand Story, Video) has already passed.**
  `withAdmin` (`packages/db/src/tenant.ts`) commits on any normal return, only rolls back on throw.
- The relocated sanitizer (`@bomy/shared/body-sanitizer`) is exposed **only** via that subpath — never
  re-exported from `@bomy/shared`'s root `index.ts`.
- `BRAND_STORY_MIN_CHARS = 20` (plain-text floor after entity decoding + Unicode-format-char removal)
  is enforced **only** in `apps/admin` — never inside the shared sanitizer, which stays the same bar
  (`canonicalHtml !== null`) for products and for a seller's own later Settings-page edits.
- `createStore` (`apps/admin/src/app/stores/actions.ts`) stays **throw-based** on validation failure —
  do not convert it to typed `{ ok, error }` results; `/stores/new/page.tsx` stays a plain
  server-action form with no client-side disabled-button state.
- Every new/changed dependency version must match what's already pinned elsewhere in the monorepo
  (Tiptap `3.27.1`, `sanitize-html ^2.17.5`, `server-only ^0.0.1`, `node-html-parser ^6.1.13`) — do
  not introduce a second version of any of these.
- Commands run from `app/` (the monorepo root) unless a task says otherwise.

---

### Task 1: Relocate the HTML sanitizer into `@bomy/shared`, server-only, subpath-only

**Files:**

- Create: `packages/shared/src/body-sanitizer.ts`
- Create: `packages/shared/tests/stubs/server-only.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/vitest.config.ts`
- Move: `apps/web/tests/seller-products/body-sanitizer.test.ts` → `packages/shared/tests/body-sanitizer.test.ts`
- Modify: `apps/web/src/app/seller/dashboard/settings/body-actions.ts`
- Modify: `apps/web/src/app/seller/dashboard/products/actions.ts:774`
- Delete: `apps/web/src/lib/body-sanitizer.ts`

**Interfaces:**

- Produces: `normalizeBodyHtml(raw: string, scope: BodyImageScope, publicOrigin: string): { ok: true; canonicalHtml: string | null } | { ok: false; error: string }`, importable only as `import { normalizeBodyHtml } from "@bomy/shared/body-sanitizer"`. `BodyImageScope` (`{ kind: "product" | "store"; id: string }`) already exists as a `@bomy/shared` root export — unchanged.

- [ ] **Step 1: Add the new dependency versions to `packages/shared/package.json`**

Current file:

```json
{
  "name": "@bomy/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./youtube": "./src/youtube.ts"
  },
  "dependencies": {
    "node-html-parser": "^6.1.13"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/node": "^20.17.0",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1",
    "vitest": "^2.1.9"
  },
  "scripts": {
    "lint": "eslint src --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Replace with:

```json
{
  "name": "@bomy/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./youtube": "./src/youtube.ts",
    "./body-sanitizer": "./src/body-sanitizer.ts"
  },
  "dependencies": {
    "node-html-parser": "^6.1.13",
    "sanitize-html": "^2.17.5",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/node": "^20.17.0",
    "@types/sanitize-html": "^2.16.1",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1",
    "vitest": "^2.1.9"
  },
  "scripts": {
    "lint": "eslint src --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Run: `pnpm install` (from `app/`)
Expected: lockfile updates, no errors.

- [ ] **Step 2: Create `packages/shared/src/body-sanitizer.ts`**

Identical logic to `apps/web/src/lib/body-sanitizer.ts`, with its two `@bomy/shared` imports changed
to relative intra-package specifiers (this file now lives _inside_ that package):

```ts
import "server-only"

import sanitizeHtml from "sanitize-html"
import { parse } from "node-html-parser"

import { classifyImageUrl } from "./body-image-keys.js"
import type { BodyImageScope } from "./body-image-keys.js"
import { YOUTUBE_VIDEO_ID_RE } from "./youtube.js"

// sanitize-html is the security boundary — it uses a spec-compliant HTML parser
// (parse5) so its tree matches what browsers build. node-html-parser is used
// only for structural post-processing (image/video validation) after sanitization.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h3",
    "h4",
    "strong",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "a",
    "blockquote",
    "hr",
    "code",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "figure",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt", "width", "height", "loading", "decoding", "referrerpolicy"],
    figure: ["data-video-provider", "data-video-id", "data-video-title"],
    table: ["data-bordered"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["https", "http"],
  allowedSchemesByTag: {
    img: ["https"],
  },
  // Enforce rel on every link — prevents reverse tabnabbing
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow ugc",
      },
    }),
  },
}

function hasMeaningfulContent(html: string): boolean {
  // Only count <img> tags that retained a src after sanitization (src-less imgs are noise)
  if (/<img[^>]*\bsrc=/i.test(html)) return true
  if (/<figure[\s>]/i.test(html)) return true
  return html.replace(/<[^>]*>/g, "").trim().length > 0
}

export function normalizeBodyHtml(
  raw: string,
  scope: BodyImageScope,
  publicOrigin: string,
): { ok: true; canonicalHtml: string | null } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_input" }
  }
  const RAW_LIMIT = 400 * 1024
  if (Buffer.byteLength(raw, "utf8") > RAW_LIMIT) {
    return { ok: false, error: "too_large" }
  }

  const sanitized = sanitizeHtml(raw, SANITIZE_OPTIONS)

  if (Buffer.byteLength(sanitized, "utf8") > 200 * 1024) {
    return { ok: false, error: "too_large" }
  }

  const canonicalHtml = hasMeaningfulContent(sanitized) ? sanitized : null

  // Use node-html-parser for structural validation only (image/video rules).
  // Security sanitization is already done above by sanitize-html.
  const root = parse(sanitized)

  const imgs = root.querySelectorAll("img")
  let srcImgCount = 0
  for (const img of imgs) {
    const src = img.getAttribute("src") ?? ""
    if (!src) continue // src stripped by sanitizer (e.g., data: URI) — not a real image
    srcImgCount++
    const cls = classifyImageUrl(src, scope, publicOrigin)
    if (cls === "invalid") return { ok: false, error: "invalid_image_url" }
  }
  if (srcImgCount > 10) return { ok: false, error: "too_many_images" }

  for (const fig of root.querySelectorAll("figure")) {
    const provider = fig.getAttribute("data-video-provider")
    const videoId = fig.getAttribute("data-video-id")
    if (provider !== "youtube") return { ok: false, error: "invalid_video" }
    if (!videoId || !YOUTUBE_VIDEO_ID_RE.test(videoId)) return { ok: false, error: "invalid_video" }
  }

  return { ok: true, canonicalHtml }
}
```

- [ ] **Step 3: Add the `server-only` test stub and vitest alias for `packages/shared`**

Create `packages/shared/tests/stubs/server-only.ts`:

```ts
export {}
```

Current `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
```

Replace with:

```ts
import path from "node:path"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Move the sanitizer test file into `packages/shared`**

Create `packages/shared/tests/body-sanitizer.test.ts` with the exact content of
`apps/web/tests/seller-products/body-sanitizer.test.ts`, changing only the import line:

```ts
import { describe, expect, it } from "vitest"

import { normalizeBodyHtml } from "../src/body-sanitizer"

const R2 = "https://pub.r2.example.com"
const PID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

describe("normalizeBodyHtml", () => {
  it("strips <script> tags", () => {
    const r = normalizeBodyHtml(
      "<p>Hello</p><script>alert(1)</script>",
      { kind: "product", id: PID },
      R2,
    )
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain("script")
  })

  it("strips on* event attributes", () => {
    const r = normalizeBodyHtml('<p onclick="evil()">text</p>', { kind: "product", id: PID }, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain("onclick")
  })

  it("strips javascript: hrefs", () => {
    const r = normalizeBodyHtml(
      '<a href="javascript:alert(1)">click</a>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain(
      "javascript:",
    )
  })

  it("strips data: URIs from img src", () => {
    const r = normalizeBodyHtml(
      '<img src="data:image/png;base64,abc" />',
      { kind: "product", id: PID },
      R2,
    )
    // sanitize-html strips data: src (not in allowedSchemes) → <img> with no src
    // hasMeaningfulContent only counts imgs with src, so canonicalHtml is null
    expect(r.ok).toBe(true)
    const html = (r as { ok: true; canonicalHtml: string | null }).canonicalHtml
    expect(html).toBeNull()
  })

  it("strips <iframe> elements", () => {
    const r = normalizeBodyHtml(
      '<iframe src="https://evil.com"></iframe>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r.ok).toBe(true)
    // canonicalHtml is null (no meaningful content) — iframe was stripped entirely
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).toBeNull()
  })

  it("strips style attributes", () => {
    const r = normalizeBodyHtml('<p style="color:red">text</p>', { kind: "product", id: PID }, R2)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toContain("style=")
  })

  it("preserves allowlisted elements and attributes", () => {
    const src = `${R2}/body/${PID}/${UUID}.jpg`
    const raw = `<h3>Title</h3><p>Text <strong>bold</strong></p><img src="${src}" alt="test" />`
    const r = normalizeBodyHtml(raw, { kind: "product", id: PID }, R2)
    expect(r.ok).toBe(true)
    const html = (r as { ok: true; canonicalHtml: string }).canonicalHtml
    expect(html).toContain("<h3>")
    expect(html).toContain("<strong>")
    expect(html).toContain(`src="${src}"`)
  })

  it("normalises links with rel=noopener noreferrer nofollow ugc", () => {
    const r = normalizeBodyHtml(
      '<a href="https://example.com">link</a>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r.ok).toBe(true)
    const html = (r as { ok: true; canonicalHtml: string }).canonicalHtml
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"')
  })

  it("rejects sanitized output exceeding 200 KB", () => {
    const big = "<p>" + "a".repeat(210 * 1024) + "</p>"
    const r = normalizeBodyHtml(big, { kind: "product", id: PID }, R2)
    expect(r).toMatchObject({ ok: false, error: "too_large" })
  })

  it("<p></p> alone → canonicalHtml null", () => {
    const r = normalizeBodyHtml("<p></p>", { kind: "product", id: PID }, R2)
    expect(r).toMatchObject({ ok: true, canonicalHtml: null })
  })

  it("<p>   </p> whitespace-only → canonicalHtml null", () => {
    const r = normalizeBodyHtml("<p>   </p>", { kind: "product", id: PID }, R2)
    expect(r).toMatchObject({ ok: true, canonicalHtml: null })
  })

  it("multiple empty paragraphs → canonicalHtml null", () => {
    const r = normalizeBodyHtml("<p></p><p></p>", { kind: "product", id: PID }, R2)
    expect(r).toMatchObject({ ok: true, canonicalHtml: null })
  })

  it("<p></p> plus one img → canonicalHtml not null", () => {
    const src = `${R2}/body/${PID}/${UUID}.jpg`
    const r = normalizeBodyHtml(
      `<p></p><img src="${src}" alt="x" />`,
      { kind: "product", id: PID },
      R2,
    )
    expect(r).toMatchObject({ ok: true })
    expect((r as { ok: true; canonicalHtml: string | null }).canonicalHtml).not.toBeNull()
  })

  it("rejects body with > 10 img tags (all counted)", () => {
    const src = `${R2}/body/${PID}/${UUID}.jpg`
    const imgs = Array.from({ length: 11 }, () => `<img src="${src}" alt="x" />`).join("")
    const r = normalizeBodyHtml(`<p>text</p>${imgs}`, { kind: "product", id: PID }, R2)
    expect(r).toMatchObject({ ok: false, error: "too_many_images" })
  })

  it("rejects a cross-product R2 image (invalid classification)", () => {
    const src = `${R2}/body/11111111-2222-3333-4444-555555555555/${UUID}.jpg`
    const r = normalizeBodyHtml(
      `<p>x</p><img src="${src}" alt="a" />`,
      { kind: "product", id: PID },
      R2,
    )
    expect(r).toMatchObject({ ok: false, error: "invalid_image_url" })
  })

  it("rejects figure with invalid YouTube video ID", () => {
    const r = normalizeBodyHtml(
      '<figure data-video-provider="youtube" data-video-id="not valid!!"></figure>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r).toMatchObject({ ok: false, error: "invalid_video" })
  })

  it("accepts figure with valid YouTube video ID", () => {
    const r = normalizeBodyHtml(
      '<figure data-video-provider="youtube" data-video-id="dQw4w9WgXcQ"></figure>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r).toMatchObject({ ok: true })
  })

  it("rejects raw input exceeding 400 KB before sanitization", () => {
    const huge = "<p>" + "a".repeat(401 * 1024) + "</p>"
    const r = normalizeBodyHtml(huge, { kind: "product", id: PID }, R2)
    expect(r).toMatchObject({ ok: false, error: "too_large" })
  })

  it("strips href from <p> elements (not an allowed attr for p)", () => {
    const r = normalizeBodyHtml(
      '<p href="https://example.com">text</p>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string }).canonicalHtml).not.toContain("href=")
  })

  it("strips src from <a> elements (not an allowed attr for a)", () => {
    const r = normalizeBodyHtml(
      '<a src="https://example.com/img.jpg" href="https://example.com">link</a>',
      { kind: "product", id: PID },
      R2,
    )
    expect(r.ok).toBe(true)
    expect((r as { ok: true; canonicalHtml: string }).canonicalHtml).not.toContain("src=")
  })
})
```

Delete `apps/web/tests/seller-products/body-sanitizer.test.ts`.

- [ ] **Step 5: Run the relocated test suite**

Run: `pnpm --filter @bomy/shared test --run`
Expected: all 18 tests pass.

- [ ] **Step 6: Repoint both live call sites at the new subpath**

`apps/web/src/app/seller/dashboard/settings/body-actions.ts` — find:

```ts
const { normalizeBodyHtml } = await import("@/lib/body-sanitizer")
```

Replace with:

```ts
const { normalizeBodyHtml } = await import("@bomy/shared/body-sanitizer")
```

`apps/web/src/app/seller/dashboard/products/actions.ts:774` — find:

```ts
const { normalizeBodyHtml } = await import("@/lib/body-sanitizer")
```

Replace with:

```ts
const { normalizeBodyHtml } = await import("@bomy/shared/body-sanitizer")
```

- [ ] **Step 7: Delete the old sanitizer file**

Delete `apps/web/src/lib/body-sanitizer.ts` — safe now, both call sites updated in Step 6 and the
test moved in Step 4.

- [ ] **Step 8: Verify nothing in `apps/web` broke**

Run (from `app/`):

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/web test --run
```

Expected: full suite passes (459 tests per the last recorded baseline in `.andy/handoff.md` — a
different number without a clear reason means something broke, not that the codebase moved on).

Run: `pnpm --filter @bomy/web typecheck && pnpm --filter @bomy/web lint`
Expected: both clean — confirms no other file still imports the deleted `@/lib/body-sanitizer` path.

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/web/src/app/seller/dashboard/settings/body-actions.ts \
  apps/web/src/app/seller/dashboard/products/actions.ts \
  apps/web/src/lib/body-sanitizer.ts apps/web/tests/seller-products/body-sanitizer.test.ts
git commit -m "refactor(shared): relocate body-sanitizer from apps/web to @bomy/shared

Both apps/web call sites (product body, store brand story) and apps/admin's
upcoming mandatory-field validation need the identical sanitizer — one
security boundary, not two independently-maintained copies. Exported only
via the @bomy/shared/body-sanitizer subpath, not the root barrel.

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 2: Admin Brand Story text-content validator

**Files:**

- Create: `apps/admin/src/lib/brand-story-validation.ts`
- Create: `apps/admin/tests/lib/brand-story-validation.test.ts`
- Modify: `apps/admin/package.json`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `export const BRAND_STORY_MIN_CHARS = 20`, `export function extractPlainText(html: string): string` — used by Task 3 and Task 4 to gate the mandatory Brand Story field on real text content, not just markup/media.

- [ ] **Step 1: Add `node-html-parser` to `apps/admin/package.json`**

Current `dependencies` block:

```json
  "dependencies": {
    "@auth/drizzle-adapter": "^1.7.4",
    "@bomy/db": "workspace:*",
    "@bomy/hitpay": "workspace:*",
    "@bomy/mailer": "workspace:*",
    "drizzle-orm": "^0.36.4",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.511.0",
    "next": "^15.3.1",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwind-merge": "^3.3.0"
  },
```

Replace with:

```json
  "dependencies": {
    "@auth/drizzle-adapter": "^1.7.4",
    "@bomy/db": "workspace:*",
    "@bomy/hitpay": "workspace:*",
    "@bomy/mailer": "workspace:*",
    "drizzle-orm": "^0.36.4",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.511.0",
    "next": "^15.3.1",
    "next-auth": "^5.0.0-beta.25",
    "node-html-parser": "^6.1.13",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwind-merge": "^3.3.0"
  },
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Write the failing tests**

Create `apps/admin/tests/lib/brand-story-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { BRAND_STORY_MIN_CHARS, extractPlainText } from "../../src/lib/brand-story-validation"

describe("extractPlainText", () => {
  it("returns plain text unchanged (minus surrounding whitespace)", () => {
    const text = extractPlainText("<p>Founded in Penang in 2019, hand-poured every batch.</p>")
    expect(text).toBe("Founded in Penang in 2019, hand-poured every batch.")
  })

  it("strips tags across multiple elements and collapses inter-tag whitespace", () => {
    const text = extractPlainText("<h3>Our Story</h3><p>We started small.</p>")
    expect(text).toBe("Our Story We started small.")
  })

  it("decodes HTML entities via node-html-parser (regex tag-stripping would not)", () => {
    const text = extractPlainText("<p>Salt &amp; pepper, est. 2019</p>")
    expect(text).toBe("Salt & pepper, est. 2019")
  })

  it("entity-only body (&nbsp; padding) collapses to empty", () => {
    const text = extractPlainText("<p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</p>")
    expect(text).toBe("")
  })

  it("zero-width-space-only body collapses to empty", () => {
    const padding = String.fromCodePoint(0x200b).repeat(30)
    const text = extractPlainText(`<p>${padding}</p>`)
    expect(text).toBe("")
  })

  it("byte-order-mark-only body collapses to empty", () => {
    const padding = String.fromCodePoint(0xfeff).repeat(30)
    const text = extractPlainText(`<p>${padding}</p>`)
    expect(text).toBe("")
  })

  it("image-only body (no readable text) collapses to empty", () => {
    const text = extractPlainText('<img src="https://example.com/a.jpg" alt="a brand photo" />')
    expect(text).toBe("")
  })

  it("real text mixed with zero-width padding keeps only the real text", () => {
    const padding = String.fromCodePoint(0x200b).repeat(10)
    const text = extractPlainText(`<p>${padding}Real story text here.${padding}</p>`)
    expect(text).toBe("Real story text here.")
  })
})

describe("BRAND_STORY_MIN_CHARS gate (as used by callers)", () => {
  it("is 20", () => {
    expect(BRAND_STORY_MIN_CHARS).toBe(20)
  })

  it("a real sentence clears the bar", () => {
    const text = extractPlainText("<p>We started making candles in a small kitchen.</p>")
    expect(text.length).toBeGreaterThanOrEqual(BRAND_STORY_MIN_CHARS)
  })

  it("a short greeting does not clear the bar", () => {
    const text = extractPlainText("<p>Hi there!</p>")
    expect(text.length).toBeLessThan(BRAND_STORY_MIN_CHARS)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @bomy/admin test brand-story-validation --run`
Expected: FAIL — `Cannot find module '../../src/lib/brand-story-validation'`.

- [ ] **Step 4: Implement `apps/admin/src/lib/brand-story-validation.ts`**

```ts
import { parse } from "node-html-parser"

// Minimum plain-text length (after entity decoding, tag stripping, and Unicode
// format-character removal) required for a Brand Story to count as "real text" —
// an admin-provisioning-only quality gate. Deliberately not part of the shared
// sanitizer: product bodies and a seller's own later Settings-page edits should
// not inherit this stricter, admin-only business rule.
export const BRAND_STORY_MIN_CHARS = 20

// Matches every Unicode "format" codepoint (category Cf — zero-width spaces/joiners,
// bidi embedding/override controls, BOM, etc.) via a Unicode property escape rather
// than hand-enumerating codepoint ranges — correct for the whole category, not just
// the handful of characters someone happens to remember, and can't regress into a
// literal invisible character accidentally pasted into source.
const FORMAT_CHAR_RE = /\p{Cf}/gu

/**
 * Extracts readable plain text from sanitized HTML for the mandatory-content check.
 * Uses node-html-parser's textContent (which decodes entities, e.g. &nbsp; -> U+00A0)
 * rather than a regex tag-strip, then removes invisible Unicode format characters and
 * collapses whitespace (including U+00A0, which JS's \s matches).
 */
export function extractPlainText(html: string): string {
  const decoded = parse(html).textContent
  return decoded.replace(FORMAT_CHAR_RE, "").replace(/\s+/g, " ").trim()
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @bomy/admin test brand-story-validation --run`
Expected: PASS, all 11 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/package.json apps/admin/src/lib/brand-story-validation.ts \
  apps/admin/tests/lib/brand-story-validation.test.ts
git commit -m "feat(admin): add Brand Story plain-text validator

Entity-decoding + Unicode-format-character-aware text extraction, so an
admin can't satisfy the upcoming mandatory Brand Story field with
&nbsp;-only or zero-width-only padding, or an image/video with no prose.

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 3: `approveInquiry` — mandatory Brand Story + Video, atomic insert

**Files:**

- Modify: `apps/admin/package.json`
- Modify: `apps/admin/next.config.ts`
- Modify: `apps/admin/.env.example`
- Modify: `app/.env.example` (root — separate `apps/admin` section)
- Create: `apps/admin/tests/stubs/server-only.ts`
- Modify: `apps/admin/vitest.config.ts`
- Modify: `apps/admin/src/app/seller-inquiries/actions.ts`
- Modify: `apps/admin/tests/seller-inquiries/actions.test.ts`

**Interfaces:**

- Consumes: `normalizeBodyHtml` from `@bomy/shared/body-sanitizer` (Task 1), `extractYoutubeVideoId` from `@bomy/shared/youtube` (pre-existing), `extractPlainText`/`BRAND_STORY_MIN_CHARS` from `../../lib/brand-story-validation` (Task 2).
- Produces: `approveInquiry(inquiryId: string, slug: string, bodyHtml: string, videoUrl: string): Promise<{ ok: true } | { ok: false; error: string }>` — new 4-arg signature. Task 6's UI calls this shape.

- [ ] **Step 1: Add `@bomy/shared` as an admin dependency and to `transpilePackages`**

`apps/admin/package.json` `dependencies` — add `"@bomy/shared": "workspace:*"` (alphabetical, after
`@bomy/mailer`):

```json
    "@bomy/mailer": "workspace:*",
    "@bomy/shared": "workspace:*",
    "drizzle-orm": "^0.36.4",
```

`apps/admin/next.config.ts` — find:

```ts
  transpilePackages: ["@bomy/db", "@bomy/mailer", "@bomy/hitpay"],
```

Replace with:

```ts
  transpilePackages: ["@bomy/db", "@bomy/mailer", "@bomy/hitpay", "@bomy/shared"],
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Add `S3_PUBLIC_URL` to both admin env-example files**

`apps/admin/.env.example` — append a new section at the end of the file:

```
# ── Optional (Brand Story provisioning) ─────────────────────────────────────

# Public URL of the R2 bucket (must match apps/web's S3_PUBLIC_URL) — used only to
# classify pasted image URLs in the Brand Story editor as same-origin vs external.
# No upload signing happens in admin, so no other S3_* vars are needed here.
# S3_PUBLIC_URL=https://media.brandsofmalaysia.com
```

Root `app/.env.example` — in the `apps/admin` section (starts at the
`# apps/admin — Internal ops console` banner), after the existing `EMAIL_DELIVERY_ENABLED`/SMTP
block for that section, add:

```
# Brand Story provisioning (mandatory Brand Story + Video at seller-inquiry approval and
# direct store creation) — must match apps/web's S3_PUBLIC_URL. Used only for read-only
# origin classification (never fetched), so for local dev this only needs to be a
# syntactically valid https:// URL — it does not need to actually resolve to anything.
# The guard in approveInquiry/createStore requires https: specifically (matching
# apps/web's own saveStoreBody guard). Note this repo's apps/web section above uses a
# plain http://localhost:9000 MinIO URL for its own S3_PUBLIC_URL — that value would
# trip this same https-only guard if reused here, so admin needs its own https
# placeholder rather than copying that one.
# S3_PUBLIC_URL=https://media.brandsofmalaysia.com
```

Kept commented-out (like the app-local `.env.example` entry) rather than given an active default,
since — unlike `apps/web`, which needs a _working_ local MinIO URL to actually sign uploads — admin
has no correct universal local default to offer: any syntactically-valid `https://` URL satisfies the
guard, so there's no single "right" value to uncomment for everyone.

- [ ] **Step 3: Add the admin `server-only` test stub and vitest alias**

Create `apps/admin/tests/stubs/server-only.ts`:

```ts
export {}
```

Current `apps/admin/vitest.config.ts`:

```ts
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
})
```

Replace with:

```ts
import path from "node:path"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
})
```

- [ ] **Step 4: Update the test file's existing calls and add new failing tests**

`apps/admin/tests/seller-inquiries/actions.test.ts` — add two fixture constants right after the
existing top-level constants (after the `mockSendApprovalEmail` line):

```ts
const VALID_BODY_HTML =
  "<p>We started making handcrafted candles in a small Penang kitchen in 2019, and today we still hand-pour every single batch ourselves.</p>"
const VALID_VIDEO_URL = "https://youtu.be/dQw4w9WgXcQ"
```

Update every existing `approveInquiry` call to pass the two new required arguments — these seven
call sites all change from 2 args to 4:

| Old                                           | New                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `approveInquiry(inquiryId, "acme-goods")`     | `approveInquiry(inquiryId, "acme-goods", VALID_BODY_HTML, VALID_VIDEO_URL)`     |
| `approveInquiry(inquiryId, "dup-store")`      | `approveInquiry(inquiryId, "dup-store", VALID_BODY_HTML, VALID_VIDEO_URL)`      |
| `approveInquiry(inquiryId, "ghost-store")`    | `approveInquiry(inquiryId, "ghost-store", VALID_BODY_HTML, VALID_VIDEO_URL)`    |
| `approveInquiry(inquiryId, "second-store")`   | `approveInquiry(inquiryId, "second-store", VALID_BODY_HTML, VALID_VIDEO_URL)`   |
| `approveInquiry(inquiryId, "once-store")`     | `approveInquiry(inquiryId, "once-store", VALID_BODY_HTML, VALID_VIDEO_URL)`     |
| `approveInquiry(inquiryId, "rejected-store")` | `approveInquiry(inquiryId, "rejected-store", VALID_BODY_HTML, VALID_VIDEO_URL)` |
| `approveInquiry(randomUUID(), "whatever")`    | `approveInquiry(randomUUID(), "whatever", VALID_BODY_HTML, VALID_VIDEO_URL)`    |

Also update the happy-path assertion to check the new columns — find:

```ts
const stores = await readStoresByOwner()
expect(stores).toHaveLength(1)
expect(stores[0]!.status).toBe("pending")
expect(stores[0]!.slug).toBe("acme-goods")
```

Replace with:

```ts
const stores = await readStoresByOwner()
expect(stores).toHaveLength(1)
expect(stores[0]!.status).toBe("pending")
expect(stores[0]!.slug).toBe("acme-goods")
expect(stores[0]!.bodyHtml).toContain("handcrafted candles")
expect(stores[0]!.videoId).toBe("dQw4w9WgXcQ")
```

which requires widening `readStoresByOwner`'s selected columns — find:

```ts
async function readStoresByOwner() {
  return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read stores" }, async (tx) => {
    const rows = await tx
      .select({
        id: schema.stores.id,
        slug: schema.stores.slug,
        status: schema.stores.status,
        ownerId: schema.stores.ownerId,
      })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, ownerId))
    rows.forEach((r) => createdStoreIds.push(r.id))
    return rows
  })
}
```

Replace with:

```ts
async function readStoresByOwner() {
  return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read stores" }, async (tx) => {
    const rows = await tx
      .select({
        id: schema.stores.id,
        slug: schema.stores.slug,
        status: schema.stores.status,
        ownerId: schema.stores.ownerId,
        bodyHtml: schema.stores.bodyHtml,
        videoId: schema.stores.videoId,
      })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, ownerId))
    rows.forEach((r) => createdStoreIds.push(r.id))
    return rows
  })
}
```

Add four new `it()` blocks at the end of the `describe` block, immediately before the closing `})`
that ends `describe.skipIf(!shouldRun)("seller-inquiry review actions", ...)`:

```ts
it("empty Brand Story: rejected before any DB write, no store created", async () => {
  const email = `seller-${ownerId}@test.bomy`
  await seedOwner(email)
  await seedInquiry(email, "Empty Story Co")
  const res = await approveInquiry(inquiryId, "empty-story-co", "<p></p>", VALID_VIDEO_URL)
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toBe("Brand Story is required.")
  expect(await readStoresByOwner()).toHaveLength(0)
  expect((await readInquiry())?.status).toBe("pending")
})

it("Brand Story under the 20-char text floor (image-only): rejected, no store created", async () => {
  const email = `seller-${ownerId}@test.bomy`
  await seedOwner(email)
  await seedInquiry(email, "Image Only Co")
  const imageOnlyHtml = `<img src="https://pub.r2.example.com/body/stores/${randomUUID()}/${randomUUID()}.jpg" alt="a photo" />`
  const res = await approveInquiry(inquiryId, "image-only-co", imageOnlyHtml, VALID_VIDEO_URL)
  expect(res.ok).toBe(false)
  if (!res.ok) expect(res.error).toMatch(/at least 20 characters/)
  expect(await readStoresByOwner()).toHaveLength(0)
  expect((await readInquiry())?.status).toBe("pending")
})

it("missing Video URL: rejected before any DB write, no store created", async () => {
  const email = `seller-${ownerId}@test.bomy`
  await seedOwner(email)
  await seedInquiry(email, "No Video Co")
  const res = await approveInquiry(inquiryId, "no-video-co", VALID_BODY_HTML, "")
  expect(res).toEqual({ ok: false, error: "A valid YouTube video URL is required." })
  expect(await readStoresByOwner()).toHaveLength(0)
  expect((await readInquiry())?.status).toBe("pending")
})

it("invalid Video URL (non-YouTube host): rejected, no store created", async () => {
  const email = `seller-${ownerId}@test.bomy`
  await seedOwner(email)
  await seedInquiry(email, "Bad Video Co")
  const res = await approveInquiry(
    inquiryId,
    "bad-video-co",
    VALID_BODY_HTML,
    "https://example.com/watch?v=dQw4w9WgXcQ",
  )
  expect(res).toEqual({ ok: false, error: "A valid YouTube video URL is required." })
  expect(await readStoresByOwner()).toHaveLength(0)
  expect((await readInquiry())?.status).toBe("pending")
})
```

- [ ] **Step 5: Run the tests to verify the new ones fail and existing ones fail on arity**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/admin test seller-inquiries --run
```

Expected: FAIL — TypeScript will refuse to compile (`approveInquiry` still only accepts 2 params) or,
if the old implementation type-erases, the new assertions on `stores[0]!.bodyHtml` fail since the
column is currently never set.

- [ ] **Step 6: Implement the new `approveInquiry` signature and atomic insert**

`apps/admin/src/app/seller-inquiries/actions.ts` — current top of file:

```ts
"use server"

import { eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getMailer } from "@/lib/mailer"
import { sendApprovalEmail } from "@/notifications/seller-inquiry"
```

Replace with:

```ts
"use server"

import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getMailer } from "@/lib/mailer"
import { BRAND_STORY_MIN_CHARS, extractPlainText } from "@/lib/brand-story-validation"
import { sendApprovalEmail } from "@/notifications/seller-inquiry"
```

Find the existing `approveInquiry` function signature and its opening line:

```ts
export async function approveInquiry(inquiryId: string, slug: string): Promise<ReviewResult> {
  const adminId = await requireAdminId()

  let result: ReviewResult | ApprovePayload
  try {
    result = await withAdmin(
      getDb(),
      { userId: adminId, reason: "admin approve seller inquiry" },
      async (tx): Promise<ReviewResult | ApprovePayload> => {
```

Replace with:

```ts
export async function approveInquiry(
  inquiryId: string,
  slug: string,
  bodyHtml: string,
  videoUrl: string,
): Promise<ReviewResult> {
  const adminId = await requireAdminId()

  // Pure validation first — no DB, no transaction, fails fast on bad input.
  // withAdmin only rolls back on a THROWN error, not a returned { ok: false } — so
  // everything that can reject this request must happen before any INSERT, never after.
  const videoId = extractYoutubeVideoId(videoUrl.trim())
  if (!videoId) {
    return { ok: false, error: "A valid YouTube video URL is required." }
  }

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
  if (!sanitized.ok) {
    return { ok: false, error: `Brand Story: ${sanitized.error}` }
  }
  if (sanitized.canonicalHtml === null) {
    return { ok: false, error: "Brand Story is required." }
  }
  if (extractPlainText(sanitized.canonicalHtml).length < BRAND_STORY_MIN_CHARS) {
    return {
      ok: false,
      error: `Brand Story needs at least ${BRAND_STORY_MIN_CHARS} characters of actual text.`,
    }
  }
  const finalBodyHtml = sanitized.canonicalHtml

  let result: ReviewResult | ApprovePayload
  try {
    result = await withAdmin(
      getDb(),
      { userId: adminId, reason: "admin approve seller inquiry" },
      async (tx): Promise<ReviewResult | ApprovePayload> => {
```

This guard is intentionally identical to `apps/web`'s (`https:` only) — see Step 2 above for the
corresponding local-dev env-var guidance (a placeholder `https://` URL, not the plain-`http://`
MinIO value `apps/web`'s own section of the root `.env.example` uses for itself).

Find the existing insert (step 5 of the original function, unchanged validation steps 1-4 above it
in the file stay exactly as they are):

```ts
// 5. Insert store (status=pending; no role flip here — that happens at /stores approveStore).
const [newStore] = await tx
  .insert(schema.stores)
  .values({
    ownerId: owner.id,
    name: inquiry.storeName,
    slug: finalSlug,
    status: "pending",
  })
  .returning({ id: schema.stores.id })
```

Replace with:

```ts
// 5. Insert store (status=pending; no role flip here — that happens at /stores approveStore).
// id/bodyHtml/videoId supplied together in one INSERT — never insert first and update
// after, since a bad partial store would otherwise commit if this transaction returned
// early instead of throwing.
const [newStore] = await tx
  .insert(schema.stores)
  .values({
    id: storeId,
    ownerId: owner.id,
    name: inquiry.storeName,
    slug: finalSlug,
    status: "pending",
    bodyHtml: finalBodyHtml,
    videoId,
  })
  .returning({ id: schema.stores.id })
```

Everything else in the file (`rejectInquiry`, `deleteInquiry`, the `slugify` helper, the email-send
block after the transaction) is unchanged.

- [ ] **Step 7: Run the tests to verify they pass**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/admin test seller-inquiries --run
```

Expected: PASS, all 15 tests (11 original + 4 new).

Run: `pnpm --filter @bomy/admin typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/package.json apps/admin/next.config.ts apps/admin/.env.example \
  apps/admin/tests/stubs/server-only.ts apps/admin/vitest.config.ts \
  apps/admin/src/app/seller-inquiries/actions.ts apps/admin/tests/seller-inquiries/actions.test.ts
git add app/.env.example
git commit -m "feat(admin): require Brand Story + Video on seller-inquiry approval

Validates both fields (sanitized non-empty HTML with a real 20+ char text
floor; a resolvable YouTube video ID) before opening any transaction, and
inserts the new store row with id/bodyHtml/videoId together in one
statement — withAdmin only rolls back on throw, so validating after a
partial insert would risk committing a bad row.

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 4: `createStore` — mandatory Brand Story + Video, atomic insert

**Files:**

- Modify: `apps/admin/src/app/stores/actions.ts`
- Modify: `apps/admin/tests/stores/actions.test.ts`

**Interfaces:**

- Consumes: same three imports as Task 3 (`normalizeBodyHtml`, `extractYoutubeVideoId`,
  `extractPlainText`/`BRAND_STORY_MIN_CHARS`).
- Produces: `createStore(formData: FormData)` now reads `bodyHtml`/`videoUrl` fields and throws
  (unchanged style) on missing/invalid values. Task 7's UI form submits these two new fields.

- [ ] **Step 1: Update the test file's FormData helper and add new failing tests**

`apps/admin/tests/stores/actions.test.ts` — add fixture constants after the existing top-level
constants (after `const mockAuth = ...`):

```ts
const VALID_BODY_HTML =
  "<p>We started making handcrafted candles in a small Penang kitchen in 2019, and today we still hand-pour every single batch ourselves.</p>"
const VALID_VIDEO_URL = "https://youtu.be/dQw4w9WgXcQ"
```

Find:

```ts
function fd(slug: string): FormData {
  const f = new FormData()
  f.set("ownerEmail", ownerEmail)
  f.set("name", "Test Store")
  f.set("slug", slug)
  return f
}
```

Replace with:

```ts
function fd(slug: string): FormData {
  const f = new FormData()
  f.set("ownerEmail", ownerEmail)
  f.set("name", "Test Store")
  f.set("slug", slug)
  f.set("bodyHtml", VALID_BODY_HTML)
  f.set("videoUrl", VALID_VIDEO_URL)
  return f
}
```

Widen `countStores` to also read the new columns so the happy-path test can assert on them — find:

```ts
async function countStores() {
  return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test count" }, async (tx) => {
    const rows = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, ownerId))
    return rows.length
  })
}
```

Replace with:

```ts
async function readStores() {
  return withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test read" }, async (tx) => {
    return tx
      .select({
        id: schema.stores.id,
        bodyHtml: schema.stores.bodyHtml,
        videoId: schema.stores.videoId,
      })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, ownerId))
  })
}
```

Update both existing tests to use the renamed helper — find:

```ts
it("happy path: creates a store for an owner with none", async () => {
  await createStore(fd(`fresh-${ownerId}`))
  expect(await countStores()).toBe(1)
})

it("blocks a second store for an owner who already has one", async () => {
  await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed store" }, async (tx) => {
    await tx
      .insert(schema.stores)
      .values({ ownerId, name: "First", slug: `first-${ownerId}`, status: "active" })
  })
  await expect(createStore(fd(`second-${ownerId}`))).rejects.toThrow("Owner already has a store")
  expect(await countStores()).toBe(1)
})
```

Replace with:

```ts
it("happy path: creates a store for an owner with none, with Brand Story + Video set", async () => {
  await createStore(fd(`fresh-${ownerId}`))
  const stores = await readStores()
  expect(stores).toHaveLength(1)
  expect(stores[0]!.bodyHtml).toContain("handcrafted candles")
  expect(stores[0]!.videoId).toBe("dQw4w9WgXcQ")
})

it("blocks a second store for an owner who already has one", async () => {
  await withAdmin(testDb.db, { userId: SYSTEM_ACTOR, reason: "test seed store" }, async (tx) => {
    await tx
      .insert(schema.stores)
      .values({ ownerId, name: "First", slug: `first-${ownerId}`, status: "active" })
  })
  await expect(createStore(fd(`second-${ownerId}`))).rejects.toThrow("Owner already has a store")
  expect(await readStores()).toHaveLength(1)
})
```

Add three new `it()` blocks at the end of the `describe` block:

```ts
it("empty Brand Story: throws, creates no store", async () => {
  const f = fd(`empty-story-${ownerId}`)
  f.set("bodyHtml", "<p></p>")
  await expect(createStore(f)).rejects.toThrow("Brand Story is required.")
  expect(await readStores()).toHaveLength(0)
})

it("Brand Story under the 20-char text floor: throws, creates no store", async () => {
  const f = fd(`short-story-${ownerId}`)
  f.set("bodyHtml", "<p>Hi!</p>")
  await expect(createStore(f)).rejects.toThrow(/at least 20 characters/)
  expect(await readStores()).toHaveLength(0)
})

it("missing Video URL: throws, creates no store", async () => {
  const f = fd(`no-video-${ownerId}`)
  f.set("videoUrl", "")
  await expect(createStore(f)).rejects.toThrow("A valid YouTube video URL is required.")
  expect(await readStores()).toHaveLength(0)
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/admin test stores --run
```

Expected: FAIL — `bodyHtml`/`videoId` are never set by the current `createStore`, so the happy-path
assertions fail; the three new rejection tests fail because nothing currently throws for them.

- [ ] **Step 3: Implement the new `createStore` validation and atomic insert**

`apps/admin/src/app/stores/actions.ts` — current top of file:

```ts
"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
```

Replace with:

```ts
"use server"

import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"
import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { requireAdminId } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { BRAND_STORY_MIN_CHARS, extractPlainText } from "@/lib/brand-story-validation"
```

Find the existing `createStore` function:

```ts
export async function createStore(formData: FormData) {
  const adminId = await requireAdminId()
  const ownerEmail = formData.get("ownerEmail") as string
  const name = formData.get("name") as string
  const slug = formData.get("slug") as string
  const description = (formData.get("description") as string) || null

  if (!ownerEmail || !name || !slug) throw new Error("Missing required fields")

  await withAdmin(getDb(), { userId: adminId, reason: "admin create store" }, async (tx) => {
    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail))
      .for("update")
      .limit(1)
    if (!owner) throw new Error(`No user found with email: ${ownerEmail}`)

    const existingStore = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, owner.id))
      .limit(1)
    if (existingStore.length > 0) throw new Error("Owner already has a store")

    await tx.insert(schema.stores).values({
      ownerId: owner.id,
      name,
      slug,
      description,
      status: "active",
    })
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id))
  })
  revalidatePath("/stores")
}
```

Replace with:

```ts
export async function createStore(formData: FormData) {
  const adminId = await requireAdminId()
  const ownerEmail = formData.get("ownerEmail") as string
  const name = formData.get("name") as string
  const slug = formData.get("slug") as string
  const description = (formData.get("description") as string) || null
  const bodyHtml = formData.get("bodyHtml") as string
  const videoUrl = formData.get("videoUrl") as string

  if (!ownerEmail || !name || !slug) throw new Error("Missing required fields")

  // Pure validation before any DB write — withAdmin only rolls back on throw, so every check
  // that can reject this request must run before the INSERT, never after (see approveInquiry
  // for the same pattern and its full rationale).
  const videoId = extractYoutubeVideoId((videoUrl ?? "").trim())
  if (!videoId) throw new Error("A valid YouTube video URL is required.")

  const S3_PUBLIC_URL = process.env["S3_PUBLIC_URL"] ?? ""
  try {
    const u = new URL(S3_PUBLIC_URL)
    if (u.protocol !== "https:") throw new Error()
  } catch {
    throw new Error("Server misconfigured: S3_PUBLIC_URL.")
  }

  const storeId = randomUUID()
  const { normalizeBodyHtml } = await import("@bomy/shared/body-sanitizer")
  const sanitized = normalizeBodyHtml(bodyHtml ?? "", { kind: "store", id: storeId }, S3_PUBLIC_URL)
  if (!sanitized.ok) throw new Error(`Brand Story: ${sanitized.error}`)
  if (sanitized.canonicalHtml === null) throw new Error("Brand Story is required.")
  if (extractPlainText(sanitized.canonicalHtml).length < BRAND_STORY_MIN_CHARS) {
    throw new Error(
      `Brand Story needs at least ${BRAND_STORY_MIN_CHARS} characters of actual text.`,
    )
  }
  const finalBodyHtml = sanitized.canonicalHtml

  await withAdmin(getDb(), { userId: adminId, reason: "admin create store" }, async (tx) => {
    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ownerEmail))
      .for("update")
      .limit(1)
    if (!owner) throw new Error(`No user found with email: ${ownerEmail}`)

    const existingStore = await tx
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.ownerId, owner.id))
      .limit(1)
    if (existingStore.length > 0) throw new Error("Owner already has a store")

    // id/bodyHtml/videoId supplied together in one INSERT — never insert first and update
    // after (same partial-commit hazard as approveInquiry).
    await tx.insert(schema.stores).values({
      id: storeId,
      ownerId: owner.id,
      name,
      slug,
      description,
      status: "active",
      bodyHtml: finalBodyHtml,
      videoId,
    })
    await tx
      .update(schema.users)
      .set({ role: "seller_owner", updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id))
  })
  revalidatePath("/stores")
}
```

`suspendStore` below it in the same file is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/admin test stores --run
```

Expected: PASS, all 5 tests (2 original, renamed/updated + 3 new).

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/stores/actions.ts apps/admin/tests/stores/actions.test.ts
git commit -m "feat(admin): require Brand Story + Video on direct store creation

Same validate-before-transaction + atomic-insert pattern as approveInquiry
(Task 3), applied to the second admin path that can create a stores row
without going through a seller inquiry. Stays throw-based, matching this
function's existing style for every other required-field check.

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 5: Admin Tiptap field component (no upload capability)

**Files:**

- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/components/static-image-node.ts`
- Create: `apps/admin/src/components/youtube-embed-extension.ts`
- Create: `apps/admin/src/components/brand-story-field.tsx`

**Interfaces:**

- Consumes: `@bomy/shared/youtube`'s `YOUTUBE_VIDEO_ID_RE` (pre-existing), `extractYoutubeVideoId`
  (pre-existing, used by the embed-YouTube toolbar button's prompt flow).
- Produces: `<BrandStoryField value={string | null} onChange={(html: string) => void} ariaLabel={string} />` — a controlled field with no internal form/save button. Task 6 and Task 7 mount this.

- [ ] **Step 1: Add Tiptap dependencies to `apps/admin/package.json`**

Add to `dependencies` (alphabetical, before `class-variance-authority`):

```json
    "@radix-ui/react-slot": "^1.1.0",
    "@tiptap/core": "3.27.1",
    "@tiptap/extension-table": "3.27.1",
    "@tiptap/react": "3.27.1",
    "@tiptap/starter-kit": "3.27.1",
    "class-variance-authority": "^0.7.1",
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Create `apps/admin/src/components/static-image-node.ts`**

```ts
import { Node, mergeAttributes } from "@tiptap/core"

// Same node schema (name/attrs/parseHTML/renderHTML) as apps/web's ImageUploadExtension,
// but with no addCommands — admin never uploads a file (no store ID exists to key an R2
// object to until the store row is actually created). "Insert image by URL" still needs
// this node TYPE registered (it calls editor.chain().insertContent({ type: "imageUpload",
// ... }) directly, bypassing any command), so the node stays even with upload removed.
export const StaticImageNode = Node.create({
  name: "imageUpload",
  group: "block",
  inline: false,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: "img[src]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)]
  },
})
```

- [ ] **Step 3: Create `apps/admin/src/components/youtube-embed-extension.ts`**

Exact duplicate of `apps/web/src/components/youtube-embed-extension.ts` (no server dependency, only
`@tiptap/core` + `@bomy/shared/youtube`, nothing to adapt for admin):

```ts
import { Node, mergeAttributes } from "@tiptap/core"

import { YOUTUBE_VIDEO_ID_RE } from "@bomy/shared/youtube"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      insertYoutubeEmbed: (attrs: { videoId: string; title: string }) => ReturnType
    }
  }
}

export const YoutubeEmbedExtension = Node.create({
  name: "youtubeEmbed",
  group: "block",
  inline: false,
  draggable: true,
  addAttributes() {
    return {
      "data-video-provider": { default: "youtube" },
      "data-video-id": { default: null },
      "data-video-title": { default: null },
    }
  },
  parseHTML() {
    return [{ tag: "figure[data-video-provider]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes)]
  },
  addNodeView() {
    return ({ node }) => {
      const title = node.attrs["data-video-title"] as string | null
      const videoId = node.attrs["data-video-id"] as string | null

      const dom = document.createElement("div")
      dom.className =
        "relative flex aspect-video w-full cursor-default items-center justify-center rounded bg-gray-900 text-white"

      const inner = document.createElement("div")
      inner.className = "text-center"

      const icon = document.createElement("div")
      icon.className = "text-2xl"
      icon.textContent = "▶"

      const label = document.createElement("div")
      label.className = "mt-1 text-sm"
      label.textContent = title ?? "YouTube video"

      inner.appendChild(icon)
      inner.appendChild(label)

      if (videoId) {
        const idEl = document.createElement("div")
        idEl.className = "mt-1 text-xs opacity-60"
        idEl.textContent = videoId
        inner.appendChild(idEl)
      }

      dom.appendChild(inner)
      return { dom }
    }
  },
  addCommands() {
    return {
      insertYoutubeEmbed:
        ({ videoId, title }) =>
        ({ commands }) => {
          if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return false
          return commands.insertContent({
            type: "youtubeEmbed",
            attrs: {
              "data-video-provider": "youtube",
              "data-video-id": videoId,
              "data-video-title": title || null,
            },
          })
        },
    }
  },
})
```

- [ ] **Step 4: Create `apps/admin/src/components/brand-story-field.tsx`**

A controlled field — mounts the editor, reports HTML changes via `onChange`, owns no form/save
button/revision state (unlike `apps/web`'s `BodyEditor`, which owns all of that):

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"
import { Table as TiptapTable } from "@tiptap/extension-table/table"
import {
  Bold,
  Code,
  Heading3,
  Heading4,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Strikethrough,
  Table,
  Underline as UnderlineIcon,
  Youtube,
} from "lucide-react"

import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StaticImageNode } from "./static-image-node"
import { YoutubeEmbedExtension } from "./youtube-embed-extension"

const BorderedTable = TiptapTable.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-bordered": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-bordered") ?? null,
        renderHTML: (attrs) =>
          attrs["data-bordered"] ? { "data-bordered": String(attrs["data-bordered"]) } : {},
      },
    }
  },
})

interface Props {
  value: string | null
  onChange: (html: string) => void
  ariaLabel: string
}

export function BrandStoryField({ value, onChange, ariaLabel }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        link: { openOnClick: false, defaultProtocol: "https" },
        codeBlock: false,
      }),
      TableKit.configure({ table: false }),
      BorderedTable,
      StaticImageNode,
      YoutubeEmbedExtension,
    ],
    content: value ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  })

  return (
    <div className="space-y-2">
      <div
        role="toolbar"
        aria-label="Brand story editor toolbar"
        className="flex flex-wrap gap-1 rounded border border-border bg-muted p-1"
      >
        <ToolbarButton
          action={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive("heading", { level: 3 }) ?? false}
          label="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}
          active={editor?.isActive("heading", { level: 4 }) ?? false}
          label="Heading 4"
        >
          <Heading4 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold") ?? false}
          label="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic") ?? false}
          label="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive("underline") ?? false}
          label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive("strike") ?? false}
          label="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <LinkButton editor={editor} />
        <ToolbarButton
          action={() => editor?.chain().focus().toggleCode().run()}
          active={editor?.isActive("code") ?? false}
          label="Inline code"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList") ?? false}
          label="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList") ?? false}
          label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive("blockquote") ?? false}
          label="Blockquote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().setHorizontalRule().run()}
          active={false}
          label="Horizontal rule"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <InsertTableButton editor={editor} />
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <InsertImageUrlButton editor={editor} />
        <EmbedYouTubeButton editor={editor} />
      </div>

      {editor?.isActive("table") && (
        <div
          role="toolbar"
          aria-label="Table controls"
          className="flex flex-wrap items-center gap-1 rounded border border-blue-100 bg-blue-50 p-1"
        >
          <span className="px-1 text-xs font-medium text-blue-600">Table:</span>
          <TableControlButton
            action={() => editor.chain().focus().addRowAfter().run()}
            label="Add row"
            icon={<Plus className="h-3 w-3" />}
          />
          <TableControlButton
            action={() => editor.chain().focus().deleteRow().run()}
            label="Delete row"
            icon={<Minus className="h-3 w-3" />}
          />
          <span
            role="separator"
            aria-orientation="vertical"
            className="mx-1 h-4 w-px bg-blue-200"
          />
          <TableControlButton
            action={() => editor.chain().focus().addColumnAfter().run()}
            label="Add column"
            icon={<Plus className="h-3 w-3" />}
          />
          <TableControlButton
            action={() => editor.chain().focus().deleteColumn().run()}
            label="Delete column"
            icon={<Minus className="h-3 w-3" />}
          />
          <span
            role="separator"
            aria-orientation="vertical"
            className="mx-1 h-4 w-px bg-blue-200"
          />
          <TableControlButton
            action={() => editor.chain().focus().deleteTable().run()}
            label="Delete table"
            icon={<Minus className="h-3 w-3" />}
            danger
          />
        </div>
      )}

      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:prose [&_.ProseMirror]:max-w-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:rounded [&_.ProseMirror]:border [&_.ProseMirror]:border-border [&_.ProseMirror]:p-3 [&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:focus:ring-2 [&_.ProseMirror]:focus:ring-ring"
      />
    </div>
  )
}

function ToolbarButton({
  action,
  active,
  label,
  children,
}: {
  action: () => void
  active: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => action()}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`min-h-[44px] min-w-[44px] rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active ? "bg-accent text-accent-foreground" : "bg-background text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )
}

function LinkButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (editor?.isActive("link")) {
          editor.chain().focus().unsetLink().run()
        } else {
          const url = prompt("URL (e.g. https://example.com):")
          if (!url) return
          const href =
            url.startsWith("https://") || url.startsWith("http://") ? url : `https://${url}`
          editor?.chain().focus().setLink({ href }).run()
        }
      }}
      aria-label="Set or unset link"
      aria-pressed={editor?.isActive("link") ?? false}
      title="Link"
      className={`min-h-[44px] min-w-[44px] rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        (editor?.isActive("link") ?? false)
          ? "bg-accent text-accent-foreground"
          : "bg-background text-foreground hover:bg-muted"
      }`}
    >
      <Link2 className="h-4 w-4" />
    </button>
  )
}

function InsertImageUrlButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = prompt("Image URL (must be https://):")
        if (!url || !url.startsWith("https://")) return
        const altResult = prompt("Alt text (describe the image — or leave empty for decorative):")
        if (altResult === null) return
        const alt = altResult
        const img = new window.Image()
        img.onload = () => {
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: "imageUpload",
              attrs: {
                src: url,
                alt,
                width: img.naturalWidth || null,
                height: img.naturalHeight || null,
              },
            })
            .run()
        }
        img.onerror = () => {
          editor
            ?.chain()
            .focus()
            .insertContent({ type: "imageUpload", attrs: { src: url, alt } })
            .run()
        }
        img.src = url
      }}
      aria-label="Insert image by URL"
      title="Insert image by URL"
      className="min-h-[44px] min-w-[44px] rounded bg-background px-2 text-sm text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ImageIcon className="h-4 w-4" />
    </button>
  )
}

function InsertTableButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(3)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Insert table"
        aria-expanded={open}
        title="Insert table"
        className={`min-h-[44px] min-w-[44px] rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${open ? "bg-accent text-accent-foreground" : "bg-background text-foreground hover:bg-muted"}`}
      >
        <Table className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-background p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-foreground">Insert table</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="table-rows" className="mb-0.5 block text-xs text-muted-foreground">
                Rows
              </Label>
              <Input
                id="table-rows"
                type="number"
                min={1}
                max={20}
                value={rows}
                onChange={(e) => setRows(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="w-full text-sm"
              />
            </div>
            <div>
              <Label htmlFor="table-cols" className="mb-0.5 block text-xs text-muted-foreground">
                Columns
              </Label>
              <Input
                id="table-cols"
                type="number"
                min={1}
                max={10}
                value={cols}
                onChange={(e) => setCols(Math.min(10, Math.max(1, Number(e.target.value))))}
                className="w-full text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
              setOpen(false)
            }}
            className="mt-2 w-full rounded bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Insert {rows} × {cols} table
          </button>
        </div>
      )}
    </div>
  )
}

function TableControlButton({
  action,
  label,
  icon,
  danger = false,
}: {
  action: () => void
  label: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => action()}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${danger ? "text-red-600 hover:bg-red-100" : "text-blue-700 hover:bg-blue-100"}`}
    >
      {icon}
      {label}
    </button>
  )
}

function EmbedYouTubeButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onClick={() => {
        const input = prompt("YouTube video URL or ID:")
        if (!input) return
        const videoId = extractYoutubeVideoId(input)
        if (!videoId) {
          alert("Could not extract a valid YouTube video ID.")
          return
        }
        const title = prompt("Video title (for accessibility):") ?? ""
        editor?.commands.insertYoutubeEmbed({ videoId, title })
      }}
      aria-label="Embed YouTube video"
      title="Embed YouTube video"
      className="min-h-[44px] min-w-[44px] rounded bg-background px-2 text-sm text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Youtube className="h-4 w-4" />
    </button>
  )
}
```

- [ ] **Step 5: Verify it typechecks and lints**

Run: `pnpm --filter @bomy/admin typecheck`
Expected: clean. If `TableKit`/`@tiptap/extension-table/table` types don't resolve, confirm
`@tiptap/extension-table` landed at exactly `3.27.1` in `apps/admin/package.json` (Step 1) — a
mismatched Tiptap version across packages is a common cause of type errors here.

Run: `pnpm --filter @bomy/admin lint`
Expected: clean.

There is no component-testing infrastructure in this repo (no `@testing-library/react` in any app) —
this component's behavior is verified in the browser in Task 6/7, not by an automated test here.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/package.json apps/admin/src/components/static-image-node.ts \
  apps/admin/src/components/youtube-embed-extension.ts apps/admin/src/components/brand-story-field.tsx
git commit -m "feat(admin): add BrandStoryField rich-text component

New admin-owned Tiptap field (not a copy of apps/web's form-owning
BodyEditor) — same formatting toolbar, no file-upload button (no store ID
exists yet to key an R2 upload to), 'insert image by URL' kept via a
stripped static image node with no upload command.

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 6: Wire the field into seller-inquiry approval UI

**Files:**

- Modify: `apps/admin/src/app/seller-inquiries/[id]/approve-form.tsx`

**Interfaces:**

- Consumes: `BrandStoryField` (Task 5), `approveInquiry` (Task 3, now 4-arg).

- [ ] **Step 1: Update `approve-form.tsx`**

Current file:

```tsx
"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { approveInquiry, rejectInquiry } from "../actions"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function ApproveForm({
  inquiryId,
  defaultSlug,
}: {
  inquiryId: string
  defaultSlug: string
}) {
  const [slug, setSlug] = useState(slugify(defaultSlug))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div>
        <Label htmlFor="store-slug" className="mb-1 block">
          Store slug
        </Label>
        <Input
          id="store-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="font-mono"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await approveInquiry(inquiryId, slug)
              if (!res.ok) setError(res.error)
            })
          }
        >
          {pending ? "Working…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await rejectInquiry(inquiryId)
              if (!res.ok) setError(res.error)
            })
          }
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          Reject
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

Replace with:

```tsx
"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandStoryField } from "@/components/brand-story-field"
import { approveInquiry, rejectInquiry } from "../actions"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function ApproveForm({
  inquiryId,
  defaultSlug,
}: {
  inquiryId: string
  defaultSlug: string
}) {
  const [slug, setSlug] = useState(slugify(defaultSlug))
  const [bodyHtml, setBodyHtml] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Client-side gate is UX only — approveInquiry re-validates authoritatively.
  const canApprove = bodyHtml.trim().length > 0 && videoUrl.trim().length > 0 && !pending

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div>
        <Label htmlFor="store-slug" className="mb-1 block">
          Store slug
        </Label>
        <Input
          id="store-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="font-mono"
        />
      </div>
      <div>
        <Label className="mb-1 block">Brand Story *</Label>
        <BrandStoryField value={bodyHtml} onChange={setBodyHtml} ariaLabel="Brand story editor" />
      </div>
      <div>
        <Label htmlFor="video-url" className="mb-1 block">
          Video URL *
        </Label>
        <Input
          id="video-url"
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!canApprove}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await approveInquiry(inquiryId, slug, bodyHtml, videoUrl)
              if (!res.ok) setError(res.error)
            })
          }
        >
          {pending ? "Working…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await rejectInquiry(inquiryId)
              if (!res.ok) setError(res.error)
            })
          }
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          Reject
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint`
Expected: both clean.

- [ ] **Step 3: Manual browser verification**

Start local infra + dev servers per `app/CLAUDE.md` (`docker compose ... up -d`, `pnpm dev`), sign in
to admin as a `bomy_admin`/`bomy_ops` user, navigate to a pending seller inquiry
(`/seller-inquiries/[id]`), and confirm:

- The Approve button is disabled until both Brand Story and Video URL have content.
- Typing in the Brand Story editor (bold, a heading, "insert image by URL" with any https image URL,
  embedding a YouTube video) all work; there is no upload/file-picker button in the toolbar.
- Submitting with a short Brand Story (e.g. "Hi!") shows the "at least 20 characters" server error
  inline, and does **not** create a store — refresh `/stores` and confirm no ghost row.
- Submitting with valid values approves the inquiry and creates a `pending` store.

Report back: does the manual check pass? If not, note exactly what broke before continuing.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/seller-inquiries/\[id\]/approve-form.tsx
git commit -m "feat(admin): wire mandatory Brand Story + Video into inquiry approval UI

Approve button gates on both fields having content (UX only — the server
action is the real, authoritative gate).

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 7: Wire the field into direct store-creation UI

**Files:**

- Create: `apps/admin/src/app/stores/new/store-body-field.tsx`
- Modify: `apps/admin/src/app/stores/new/page.tsx`

**Interfaces:**

- Consumes: `BrandStoryField` (Task 5), `createStore` (Task 4, now reads `bodyHtml`/`videoUrl` from
  `FormData`).

- [ ] **Step 1: Create the client island that mirrors editor state into a hidden form input**

`apps/admin/src/app/stores/new/store-body-field.tsx`:

```tsx
"use client"

import { useState } from "react"

import { BrandStoryField } from "@/components/brand-story-field"

export function StoreBodyField() {
  const [html, setHtml] = useState("")
  return (
    <div>
      <input type="hidden" name="bodyHtml" value={html} readOnly />
      <BrandStoryField value={html} onChange={setHtml} ariaLabel="Brand story editor" />
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `/stores/new/page.tsx`**

Current file:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"

import { requireAdmin } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createStore } from "../actions"

export default async function NewStorePage() {
  await requireAdmin()

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create Store</h1>
      <form
        action={async (formData) => {
          "use server"
          await createStore(formData)
          redirect("/stores")
        }}
        className="max-w-md space-y-4"
      >
        <div>
          <Label htmlFor="ownerEmail" className="mb-1 block">
            Owner Email *
          </Label>
          <Input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            required
            placeholder="seller@example.com"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            User must already exist in the system
          </p>
        </div>
        <div>
          <Label htmlFor="name" className="mb-1 block">
            Store Name *
          </Label>
          <Input id="name" name="name" required placeholder="Kedai Maju" />
        </div>
        <div>
          <Label htmlFor="slug" className="mb-1 block">
            Slug *
          </Label>
          <Input
            id="slug"
            name="slug"
            required
            placeholder="kedai-maju"
            pattern="[a-z0-9-]{3,50}"
            title="Lowercase letters, numbers, hyphens only. 3–50 characters."
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="description" className="mb-1 block">
            Description (optional)
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Brief description of the store"
          />
        </div>
        <div className="flex gap-3">
          <Button type="submit">Create Store</Button>
          <Button variant="outline" asChild>
            <Link href="/stores">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
```

Replace with:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"

import { requireAdmin } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createStore } from "../actions"
import { StoreBodyField } from "./store-body-field"

export default async function NewStorePage() {
  await requireAdmin()

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create Store</h1>
      <form
        action={async (formData) => {
          "use server"
          await createStore(formData)
          redirect("/stores")
        }}
        className="max-w-md space-y-4"
      >
        <div>
          <Label htmlFor="ownerEmail" className="mb-1 block">
            Owner Email *
          </Label>
          <Input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            required
            placeholder="seller@example.com"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            User must already exist in the system
          </p>
        </div>
        <div>
          <Label htmlFor="name" className="mb-1 block">
            Store Name *
          </Label>
          <Input id="name" name="name" required placeholder="Kedai Maju" />
        </div>
        <div>
          <Label htmlFor="slug" className="mb-1 block">
            Slug *
          </Label>
          <Input
            id="slug"
            name="slug"
            required
            placeholder="kedai-maju"
            pattern="[a-z0-9-]{3,50}"
            title="Lowercase letters, numbers, hyphens only. 3–50 characters."
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="description" className="mb-1 block">
            Description (optional)
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Brief description of the store"
          />
        </div>
        <div>
          <Label className="mb-1 block">Brand Story *</Label>
          <StoreBodyField />
        </div>
        <div>
          <Label htmlFor="videoUrl" className="mb-1 block">
            Video URL *
          </Label>
          <Input
            id="videoUrl"
            name="videoUrl"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
        <div className="flex gap-3">
          <Button type="submit">Create Store</Button>
          <Button variant="outline" asChild>
            <Link href="/stores">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
```

Note: no client-side disabled-submit-button state here, deliberately — this page keeps its existing
plain native-submit behavior for every field (`name`/`slug` already rely on `required`/`pattern`
alone). `createStore` throwing on an invalid Brand Story/Video is the real, authoritative gate,
consistent with every other validation this function already has.

- [ ] **Step 3: Verify typecheck/lint**

Run: `pnpm --filter @bomy/admin typecheck && pnpm --filter @bomy/admin lint`
Expected: both clean.

- [ ] **Step 4: Manual browser verification**

With dev servers running, navigate to `/stores/new` as an admin and confirm:

- The Brand Story editor renders and accepts input; the hidden `bodyHtml` input updates as you type
  (inspect via browser devtools if needed).
- Submitting with an existing user's email, a fresh slug, a short Brand Story (e.g. "Hi!"), and a
  valid video URL results in Next's default error page (expected — this path throws, not a nice
  inline error) and **no** store row is created.
- Submitting with valid values for every field creates an `active` store with the given Brand Story
  and Video visible on `/stores`.

Report back: does the manual check pass?

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/stores/new/store-body-field.tsx apps/admin/src/app/stores/new/page.tsx
git commit -m "feat(admin): wire mandatory Brand Story + Video into direct store creation

No client-side disabled-button state, deliberately — matches this page's
existing plain-native-submit style for every other field; createStore
throwing is the real gate.

Co-Authored-By: Claude <claude-sonnet-5> <noreply@anthropic.com>"
```

---

### Task 8: Pre-flight — verify/apply migration 0028 on prod, set Vercel env

**This is an operator task, run by Charlie — not code.** Per this project's standing convention
(`app/.andy/handoff.md`, `docs/runbooks/public-deployment-cutover.md` step 3: "Operator shell only.
Do NOT run migrations from Vercel build hooks"), prod DB credentials never enter an agent-driven
session. Andy prepares the exact commands; Charlie runs them.

**Files:**

- Modify: `app/.andy/handoff.md` (update with real evidence once verified — not committed to git,
  this file is gitignored per repo convention).

- [ ] **Step 1: Verify migration 0028 status on prod**

Charlie runs, in his own terminal, against the prod Neon connection (owner role):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'stores' AND column_name IN ('body_html', 'video_id');
SELECT conname FROM pg_constraint WHERE conname = 'stores_video_id_chk';
```

Expected: 2 rows from the first query, 1 row from the second — migration 0028 adds the CHECK
constraint alongside the columns, and `video_id` now flows straight from `extractYoutubeVideoId`
into that column on both admin store-creation paths, so it's worth confirming the constraint
actually exists too, not just the columns (added per the final whole-branch review's sanity check
on this step — cheap to check, low likelihood of being missing since it's one migration file, but
free). If both come back as expected, migration 0028 is already applied — skip to Step 3.

- [ ] **Step 2: If not applied, apply it (and 0029) via the operator-shell pattern**

Only if Step 1 returned 0 rows. Charlie runs, in his own terminal:

```sh
DATABASE_URL='<owner-direct-unpooled-connection-string>' \
  pnpm --filter @bomy/db migrate
```

Expected: migration log shows `0028_store_body_video: apply ... done` and (if also pending)
`0029_categories_public_active_product_ref: apply ... done`, no errors. Re-run Step 1's queries to
confirm they now come back as expected.

- [ ] **Step 3: Add `S3_PUBLIC_URL` to the `bomy-app-admin` Vercel project — pre-deploy gate, not a post-implementation checklist item**

**This step must land before or with the admin app's deploy of this feature, not after.** Following
the final whole-branch review: `S3_PUBLIC_URL` is now a hard precondition for _both_ admin
store-creation paths (`approveInquiry` and `createStore` each throw `"Server misconfigured:
S3_PUBLIC_URL."` without it) — previously neither path needed any `S3_*` var at all, so this is a
new failure mode for a feature that otherwise works. If the admin app deploys before this var is
set, every seller-inquiry approval and every direct store creation breaks immediately in that
environment.

Charlie (or Andy via the Vercel MCP tool, with Charlie's go-ahead) sets `S3_PUBLIC_URL` for the
`bomy-app-admin` project, Preview + Production environments, to the **same origin** as `apps/web`'s
own `S3_PUBLIC_URL` (tightened from "same value" — the code does an origin comparison
(`new URL(publicOrigin).origin`) via `classifyImageUrl`, so a trailing-path difference between the
two apps' values is harmless, but a _host_ difference would silently change which pasted image URLs
each app accepts as "managed," and the two apps would disagree with each other about the same
images). The repo default committed in both `.env.example` files is
`https://media.brandsofmalaysia.com` — use that exact origin unless the real R2 public URL differs.

- [ ] **Step 4: Update `.andy/handoff.md` with real evidence**

Replace the current line (`"# Andy Handoff — 2026-07-31 (PR #108 seller storefront redesign merged;
migrations 0028/0029 NOT yet on prod)"` and the `⚠️` bullet under §1 referencing "NOT yet applied to
prod Neon") with the actual verification-query output or migration-log output from Step 1/2, dated
today — so this stops being an open, re-litigated question in future sessions. This file is
gitignored; editing it does not require a commit.

- [ ] **Step 5: Full-suite regression check before considering this feature done**

Run (from `app/`):

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm test
```

Expected: every workspace's suite passes, run from the root command (not a `--filter`-scoped one —
`feedback_turborepo_env_passthrough` memory: Turbo strips undeclared env vars, and only the root
command exercises the real `turbo.json` env allowlist).

Run: `pnpm typecheck && pnpm lint`
Expected: both clean across the whole monorepo.

No commit for this task — it's verification + an ops/doc update, not a code change.
