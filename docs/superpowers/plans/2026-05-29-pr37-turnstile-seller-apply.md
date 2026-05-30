# PR #37 — Turnstile on `/seller/apply` + restored applicant ack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the public `/seller/apply` form with Cloudflare Turnstile and restore the applicant ack alongside the existing ops alert. The submitted email becomes safe to use as an outbound `to:` because every submission passes a verified human-presence challenge before any mail dispatch.

**Architecture:** New server-only helper `apps/web/src/lib/turnstile.ts` that POSTs to Cloudflare's `/siteverify` and fails closed on every documented failure mode. Server action runs Turnstile verify FIRST (before required-field or email-shape validation), then existing DB insert, then dispatches applicant ack + ops alert with per-recipient try/catch isolation. Client component renders the widget via `next/script` (`?render=explicit`), tracks the token in React state mirrored to a hidden `cf-turnstile-response` input, and auto-resets the widget on any submit failure.

**Tech Stack:** Next.js 15 App Router, React 19, vitest 2.1, TypeScript (NodeNext modules in shared packages, default Next module resolution in apps/web), Cloudflare Turnstile, server-only marker package.

**Spec:** `docs/superpowers/specs/2026-05-29-pr37-turnstile-seller-apply-design.md`

---

## File structure

### New files

| Path                                   | Purpose                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/turnstile.ts`        | `verifyTurnstile(token, remoteIp?)` helper. Server-only (`import "server-only"`). Fails closed on every documented failure mode. ~60 LOC. |
| `apps/web/tests/lib/turnstile.test.ts` | 12 unit tests for `verifyTurnstile` (mocked `fetch`).                                                                                     |
| `apps/web/tests/stubs/server-only.ts`  | One-line `export {}` stub. Aliased by vitest so `import "server-only"` resolves in tests.                                                 |

### Modified files

| Path                                                  | Change                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/package.json`                               | Add `server-only` (`^0.0.1`) to `dependencies`.                                                                                                                                                                                                                                |
| `apps/web/vitest.config.ts`                           | Add `server-only` alias entry mapping to `tests/stubs/server-only.ts`.                                                                                                                                                                                                         |
| `apps/web/.env.local.example`                         | Add `NEXT_PUBLIC_TURNSTILE_SITEKEY` + `TURNSTILE_SECRET_KEY` with Cloudflare's documented always-pass test keys, under a new "Turnstile (Stage 5 PR #37)" block.                                                                                                               |
| `.env.example` (root)                                 | Same vars under the `apps/web` section.                                                                                                                                                                                                                                        |
| `apps/web/src/notifications/seller-inquiry.ts`        | Restore the `sendApplicantAck` export removed in PR #35 commit `9003a72`.                                                                                                                                                                                                      |
| `apps/web/tests/notifications/seller-inquiry.test.ts` | Restore the 2 `sendApplicantAck` template tests removed in PR #35.                                                                                                                                                                                                             |
| `apps/web/src/app/seller/apply/actions.ts`            | Add `readFormString` helper; add Turnstile verify gate (first step); restore applicant ack dispatch alongside ops alert with per-recipient try/catch isolation.                                                                                                                |
| `apps/web/tests/seller-inquiries/actions.test.ts`     | `vi.hoisted` mock pattern for `@/lib/turnstile` + `@/notifications/seller-inquiry`; default `makeFormData()` sets `cf-turnstile-response`; delete 1 PR #35 test superseded by new test 5; rewrite 1 to assert dual-dispatch contract; add 7 new verify-gate + isolation tests. |
| `apps/web/src/app/seller/apply/page.tsx`              | Render Turnstile widget via `next/script` (with `?render=explicit`); track token in React state mirrored to hidden `cf-turnstile-response` input; auto-reset on any `state` change (per Bob R0 F1); cleanup via `turnstile.remove(widgetId)` on unmount.                       |

### Total: 3 new files, 8 modified files.

---

## Conventions used throughout

- Commits use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`). One commit per task.
- Co-author trailer on every commit: `Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>`.
- Tests use vitest's `describe`/`it`/`expect`. DB-gated tests guard with `describe.skipIf(!shouldRun)`.
- Per-test unique emails via `randomUUID()` for any "no DB insert" assertion (PR #36 pattern; see [[feedback-audit-chain-for-update]] context — same collision-proofing idea).
- `apps/web` does NOT use NodeNext ESM extensions in imports — it uses Next's default bundler resolution. So imports are `from "@/lib/turnstile"` (no `.js` extension), NOT `from "./turnstile.js"`. This is different from `packages/db` / `apps/api` which DO use NodeNext.
- `import "server-only"` at the top of server-only modules is the convention (PR #35 established `apps/web/src/lib/mailer.ts` without it; PR #37 introduces it for `turnstile.ts` and the test alias machinery is set up in Task 1).

---

## Task 1: Toolchain prep — env vars, server-only dep, vitest alias

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/vitest.config.ts`
- Modify: `apps/web/.env.local.example`
- Modify: `.env.example` (root)
- Create: `apps/web/tests/stubs/server-only.ts`

- [ ] **Step 1.1: Add `server-only` to `apps/web/package.json` dependencies**

Open `apps/web/package.json`. Add `"server-only": "^0.0.1"` to `dependencies`, in alphabetical order (between `react-dom` and `tailwind-merge`):

```json
{
  "dependencies": {
    "@auth/drizzle-adapter": "^1.7.4",
    "@aws-sdk/client-s3": "^3.1046.0",
    "@aws-sdk/s3-request-presigner": "^3.1046.0",
    "@bomy/db": "workspace:*",
    "@bomy/hitpay": "workspace:*",
    "@bomy/mailer": "workspace:*",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.36.4",
    "lucide-react": "^0.511.0",
    "next": "^15.3.1",
    "next-auth": "^5.0.0-beta.25",
    "next-intl": "^3.26.3",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "server-only": "^0.0.1",
    "tailwind-merge": "^3.3.0"
  }
}
```

- [ ] **Step 1.2: Create the vitest stub**

Create `apps/web/tests/stubs/server-only.ts`:

```ts
export {}
```

(The real `server-only` package throws at runtime to enforce its server boundary; the stub is a no-op for tests.)

- [ ] **Step 1.3: Wire the vitest alias**

Open `apps/web/vitest.config.ts`. Update the `resolve.alias` block:

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
    fileParallelism: false,
  },
})
```

(The existing `@` alias entry stays; only `server-only` is added.)

- [ ] **Step 1.4: Add Turnstile vars to `apps/web/.env.local.example`**

Append to `apps/web/.env.local.example` (after the email block):

```
# ── Turnstile (Stage 5 PR #37) ──────────────────────────────────────────────
# Gate on the public /seller/apply form. Cloudflare's documented always-pass
# test keys are committed here so local dev works without a Cloudflare account.
# Production/staging replace these with real keys per the prod-cutover runbook.
# Other test keys (always-fail, invisible, duplicate-token, forced-interactive):
# https://developers.cloudflare.com/turnstile/troubleshooting/testing/
NEXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

- [ ] **Step 1.5: Add the same vars to root `.env.example`**

Find the `apps/web` section in root `.env.example`. Append the same Turnstile block (same content as Step 1.4) under that section, between the existing email vars and the next section.

- [ ] **Step 1.6: Install + verify**

```bash
pnpm install
pnpm --filter @bomy/web lint
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web test --run
```

Expected: `pnpm install` adds `server-only` under `apps/web/node_modules`. All three checks exit 0. `pnpm test --run` shows the existing 183 tests pass (no new tests yet).

- [ ] **Step 1.7: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/.env.local.example .env.example apps/web/tests/stubs/server-only.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(web): prep for Turnstile — server-only dep, vitest alias, env vars

Adds the server-only marker package to apps/web deps, aliases it
in vitest.config.ts to a no-op stub so tests can resolve
`import "server-only"`, and seeds Cloudflare's documented always-pass
Turnstile test keys in both env example files.

Prep for PR #37 verifyTurnstile + applicant ack restoration.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `verifyTurnstile` helper — TDD

**Files:**

- Create: `apps/web/src/lib/turnstile.ts`
- Create: `apps/web/tests/lib/turnstile.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `apps/web/tests/lib/turnstile.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { verifyTurnstile } from "@/lib/turnstile"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

function mockFetchResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

describe("verifyTurnstile", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    process.env.TURNSTILE_SECRET_KEY = "test-secret"
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TURNSTILE_SECRET_KEY
    vi.restoreAllMocks()
  })

  it("returns missing-secret when TURNSTILE_SECRET_KEY is unset; logs misconfigured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const result = await verifyTurnstile("any-token")
    expect(result).toEqual({ success: false, reason: "missing-secret" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith({ event: "turnstile_misconfigured" })
  })

  it("returns invalid-response when token is null; no fetch, no log", async () => {
    const result = await verifyTurnstile(null)
    expect(result).toEqual({ success: false, reason: "invalid-response" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it("returns invalid-response when token is empty string; no fetch, no log", async () => {
    const result = await verifyTurnstile("")
    expect(result).toEqual({ success: false, reason: "invalid-response" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it("POSTs to Cloudflare /siteverify with form-urlencoded body", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(SITEVERIFY_URL)
    expect(init.method).toBe("POST")
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded")
  })

  it("includes secret and response in POST body when no remoteIp", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc")
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toBe("secret=test-secret&response=token-abc")
  })

  it("includes remoteip in POST body when remoteIp arg passed", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc", "1.2.3.4")
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toBe("secret=test-secret&response=token-abc&remoteip=1.2.3.4")
  })

  it("uses AbortSignal.timeout(5000)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc")
    expect(timeoutSpy).toHaveBeenCalledWith(5000)
  })

  it("returns network-error on fetch throw; logs message", async () => {
    fetchMock.mockRejectedValue(new Error("boom"))
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "network-error" })
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "turnstile_network_error",
      message: "boom",
    })
  })

  it("returns network-error on non-200; log payload includes status", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(503, {}))
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "network-error" })
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "turnstile_network_error",
      status: 503,
    })
  })

  it("returns network-error on JSON parse failure", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token")
      },
    } as unknown as Response)
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "network-error" })
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "turnstile_network_error",
      message: "json-parse-failed",
    })
  })

  it("returns success:true when Cloudflare body has success:true", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: true })
  })

  it("returns invalid-response when Cloudflare body has success:false; log captures errorCodes", async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse(200, {
        success: false,
        "error-codes": ["timeout-or-duplicate", "invalid-input-response"],
      }),
    )
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "invalid-response" })
    expect(consoleInfoSpy).toHaveBeenCalledWith({
      event: "turnstile_rejected",
      errorCodes: ["timeout-or-duplicate", "invalid-input-response"],
    })
  })
})
```

- [ ] **Step 2.2: Run the tests to verify they fail**

```bash
pnpm --filter @bomy/web test --run tests/lib/turnstile.test.ts
```

Expected: FAIL with `Failed to load url @/lib/turnstile` (module not found).

- [ ] **Step 2.3: Write the implementation**

Create `apps/web/src/lib/turnstile.ts`:

```ts
import "server-only"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TIMEOUT_MS = 5000

export type TurnstileVerifyResult =
  | { success: true }
  | { success: false; reason: "missing-secret" | "invalid-response" | "network-error" }

export async function verifyTurnstile(
  token: string | null,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  const secret = process.env["TURNSTILE_SECRET_KEY"]
  if (!secret) {
    console.error({ event: "turnstile_misconfigured" })
    return { success: false, reason: "missing-secret" }
  }

  if (!token) {
    return { success: false, reason: "invalid-response" }
  }

  const params = new URLSearchParams({ secret, response: token })
  if (remoteIp) params.set("remoteip", remoteIp)

  let response: Response
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error({
      event: "turnstile_network_error",
      message: err instanceof Error ? err.message : String(err),
    })
    return { success: false, reason: "network-error" }
  }

  if (response.status !== 200) {
    console.error({ event: "turnstile_network_error", status: response.status })
    return { success: false, reason: "network-error" }
  }

  let body: { success?: boolean; "error-codes"?: string[] }
  try {
    body = (await response.json()) as typeof body
  } catch {
    console.error({ event: "turnstile_network_error", message: "json-parse-failed" })
    return { success: false, reason: "network-error" }
  }

  if (body.success === true) {
    return { success: true }
  }

  console.info({ event: "turnstile_rejected", errorCodes: body["error-codes"] ?? [] })
  return { success: false, reason: "invalid-response" }
}
```

- [ ] **Step 2.4: Run the tests to verify they pass**

```bash
pnpm --filter @bomy/web test --run tests/lib/turnstile.test.ts
```

Expected: 12 tests passed.

- [ ] **Step 2.5: Lint + typecheck**

```bash
pnpm --filter @bomy/web lint && pnpm --filter @bomy/web typecheck
```

Expected: both exit 0.

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/src/lib/turnstile.ts apps/web/tests/lib/turnstile.test.ts
git commit -m "$(cat <<'EOF'
feat(web): verifyTurnstile helper — server-only Cloudflare /siteverify

Fail-closed wrapper around Cloudflare's Turnstile /siteverify
endpoint. Returns a normalized TurnstileVerifyResult union; never
throws. Documented failure modes:

- missing-secret: TURNSTILE_SECRET_KEY env unset; logs
  turnstile_misconfigured (no fetch).
- invalid-response: token is null/empty before fetch (no log), OR
  Cloudflare returned success:false (logs turnstile_rejected with
  errorCodes).
- network-error: fetch throw / non-200 / JSON parse failure (logs
  turnstile_network_error with message or status).

5-second timeout via AbortSignal.timeout. Includes remoteip only
when caller passes it. No hostname/action/cdata pinning in this
PR.

12 unit tests mock global.fetch via vi.stubGlobal; cover every
branch including timeout signal usage and log payload shapes.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Restore `sendApplicantAck` template — TDD

**Files:**

- Modify: `apps/web/src/notifications/seller-inquiry.ts`
- Modify: `apps/web/tests/notifications/seller-inquiry.test.ts`

- [ ] **Step 3.1: Add the 2 failing template tests**

Open `apps/web/tests/notifications/seller-inquiry.test.ts`. Update the import line to add `sendApplicantAck`, and insert a new `describe("sendApplicantAck", ...)` block ABOVE the existing `describe("sendOpsAlert", ...)` block.

Replace the import line:

```ts
import { sendApplicantAck, sendOpsAlert } from "../../src/notifications/seller-inquiry.js"
```

Add ABOVE the `describe("sendOpsAlert", ...)` block:

```ts
describe("sendApplicantAck", () => {
  it("addresses the applicant by submitted email and mentions the store name", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, {
      name: "Aisyah",
      email: "aisyah@example.com",
      storeName: "Kedai Aisyah",
    })
    const args = sendMail.mock.calls[0]![0]
    expect(args.to).toBe("aisyah@example.com")
    expect(args.subject).toContain("seller application")
    expect(args.text).toContain("Aisyah")
    expect(args.text).toContain("Kedai Aisyah")
  })

  it("does not promise a specific SLA in the body", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, {
      name: "Aisyah",
      email: "aisyah@example.com",
      storeName: "Kedai Aisyah",
    })
    const body = sendMail.mock.calls[0]![0].text
    expect(body.toLowerCase()).not.toMatch(/business days?/i)
    expect(body.toLowerCase()).not.toMatch(/within \d+ (hour|day)/i)
  })
})
```

- [ ] **Step 3.2: Run the tests to verify they fail**

```bash
pnpm --filter @bomy/web test --run tests/notifications/seller-inquiry.test.ts
```

Expected: FAIL with `sendApplicantAck is not exported from "../../src/notifications/seller-inquiry"`.

- [ ] **Step 3.3: Restore the function**

Open `apps/web/src/notifications/seller-inquiry.ts`. Add the `sendApplicantAck` export ABOVE the existing `sendOpsAlert` export:

```ts
import { joinUrl, type Mailer } from "@bomy/mailer"

export async function sendApplicantAck(
  mailer: Mailer,
  inquiry: { name: string; email: string; storeName: string },
): Promise<void> {
  await mailer.sendMail({
    to: inquiry.email,
    subject: "We received your BOMY seller application",
    text:
      `Hi ${inquiry.name},\n\n` +
      `We've received your application for ${inquiry.storeName}. ` +
      `Our team will review it and contact you soon.\n\n` +
      `BOMY Team`,
  })
}

export async function sendOpsAlert(
  // ... existing function unchanged ...
```

(The body of `sendOpsAlert` stays exactly as-is; only `sendApplicantAck` is added above it.)

- [ ] **Step 3.4: Run the tests to verify they pass**

```bash
pnpm --filter @bomy/web test --run tests/notifications/seller-inquiry.test.ts
```

Expected: 4 tests passed (2 new `sendApplicantAck` + 2 existing `sendOpsAlert`).

- [ ] **Step 3.5: Lint + typecheck**

```bash
pnpm --filter @bomy/web lint && pnpm --filter @bomy/web typecheck
```

Expected: both exit 0.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/notifications/seller-inquiry.ts apps/web/tests/notifications/seller-inquiry.test.ts
git commit -m "$(cat <<'EOF'
feat(web): restore sendApplicantAck template (PR #35 deferred)

Re-exports the applicant-ack template that PR #35 commit 9003a72
deleted as part of dropping the no-auth applicant-recipient path.
With Turnstile gating landing in this PR (PR #37), the submitted
email becomes safe to use as an outbound `to:` again.

Template content is verbatim from the pre-PR-#35 state preserved
in PR #35 spec §4.1. Two tests restored from the same commit.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Server action — Turnstile verify gate + dual dispatch (TDD)

**Files:**

- Modify: `apps/web/tests/seller-inquiries/actions.test.ts`
- Modify: `apps/web/src/app/seller/apply/actions.ts`

This task is large because it ships the test restructure (mock pattern, deleted/rewritten/added cases) AND the action implementation in one TDD cycle. Steps go: update test file → run to confirm new tests fail in expected ways → update action → re-run → commit both together.

### 4A: Test file restructure

- [ ] **Step 4.1: Rewrite the test file**

Replace the contents of `apps/web/tests/seller-inquiries/actions.test.ts` with:

```ts
import { randomUUID } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

// Hoisted mock handles — stable across vi.resetModules() so dynamically-imported
// actions.ts resolves the same mock instances we configure in beforeEach.
const { verifyTurnstileMock, sendApplicantAckMock, sendOpsAlertMock } = vi.hoisted(() => ({
  verifyTurnstileMock: vi.fn(),
  sendApplicantAckMock: vi.fn(),
  sendOpsAlertMock: vi.fn(),
}))

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: verifyTurnstileMock,
}))

vi.mock("@/notifications/seller-inquiry", () => ({
  sendApplicantAck: sendApplicantAckMock,
  sendOpsAlert: sendOpsAlertMock,
}))

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

function makeUniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.bomy`
}

describe.skipIf(!shouldRun)("submitSellerInquiry — server action", () => {
  beforeEach(async () => {
    vi.resetModules()
    verifyTurnstileMock.mockReset()
    verifyTurnstileMock.mockResolvedValue({ success: true })
    sendApplicantAckMock.mockReset()
    sendApplicantAckMock.mockResolvedValue(undefined)
    sendOpsAlertMock.mockReset()
    sendOpsAlertMock.mockResolvedValue(undefined)
    const mailerMod = await import("../../src/lib/mailer.js")
    mailerMod.resetMailerForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env["OPS_ALERT_EMAILS"]
    delete process.env["ADMIN_URL"]
  })

  function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
    const fd = new FormData()
    fd.set("name", overrides["name"] ?? "Aisyah")
    fd.set("email", overrides["email"] ?? "aisyah@example.com")
    fd.set("contactNumber", overrides["contactNumber"] ?? "012-3456789")
    fd.set("companyName", overrides["companyName"] ?? "Aisyah Sdn Bhd")
    fd.set("storeName", overrides["storeName"] ?? "Kedai Aisyah")
    fd.set("message", overrides["message"] ?? "Looking forward.")
    // Default: verify-passes via the mock; token value is arbitrary.
    if (!("cf-turnstile-response" in overrides)) {
      fd.set("cf-turnstile-response", "test-token")
    } else if (overrides["cf-turnstile-response"]) {
      fd.set("cf-turnstile-response", overrides["cf-turnstile-response"])
    }
    return fd
  }

  it("verify-failure (invalid-response): throws generic error; no DB insert; no email", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "invalid-response" })
    const uniqueEmail = makeUniqueEmail("verify-fail-invalid")
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: uniqueEmail }))).rejects.toThrow(
      /Verification failed/,
    )
    const { makeDb, schema } = await import("@bomy/db")
    const { db } = makeDb()
    const rows = await db
      .select()
      .from(schema.sellerInquiries)
      .where(eq(schema.sellerInquiries.email, uniqueEmail))
    expect(rows).toHaveLength(0)
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("verify-failure (missing-secret): identical generic error", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "missing-secret" })
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).rejects.toThrow(
      /Verification failed\. Please try the challenge again\./,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("verify-failure (network-error): identical generic error", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "network-error" })
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).rejects.toThrow(
      /Verification failed\. Please try the challenge again\./,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("missing cf-turnstile-response reaches verify as null and rejects", async () => {
    verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "invalid-response" })
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    const fd = makeFormData()
    fd.delete("cf-turnstile-response")
    await expect(submitSellerInquiry(fd)).rejects.toThrow(/Verification failed/)
    expect(verifyTurnstileMock).toHaveBeenCalledWith(null)
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()
  })

  it("verify passes → inserts row + dispatches BOTH applicant ack and ops alert", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    process.env["ADMIN_URL"] = "https://admin.bomy.my"
    const uniqueEmail = makeUniqueEmail("happy")
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: uniqueEmail }))).resolves.toBeUndefined()

    const { makeDb, schema } = await import("@bomy/db")
    const { db } = makeDb()
    const rows = await db
      .select()
      .from(schema.sellerInquiries)
      .where(eq(schema.sellerInquiries.email, uniqueEmail))
    expect(rows).toHaveLength(1)

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendApplicantAckMock.mock.calls[0]![1]).toMatchObject({
      name: "Aisyah",
      email: uniqueEmail,
      storeName: "Kedai Aisyah",
    })
    expect(sendOpsAlertMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock.mock.calls[0]![2]).toMatchObject({
      opsEmails: ["ops@bomy.my"],
    })
  })

  it("OPS_ALERT_EMAILS empty: logs skip; sends ONLY applicant ack", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await submitSellerInquiry(makeFormData())

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock).not.toHaveBeenCalled()

    const skipCall = infoSpy.mock.calls.find((c) => {
      const arg = c[0] as { event?: string }
      return arg?.event === "email_notification_skipped"
    })
    expect(skipCall).toBeDefined()
    const arg = skipCall![0] as { reason?: string }
    expect(arg.reason).toBe("missing_ops_recipients")
  })

  it("applicant send throws → ops alert still attempted; action resolves", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    sendApplicantAckMock.mockRejectedValueOnce(new Error("smtp boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock).toHaveBeenCalledOnce()

    const failCall = errorSpy.mock.calls.find((c) => {
      const arg = c[0] as { event?: string; recipientType?: string }
      return arg?.event === "email_notification_failed" && arg.recipientType === "applicant"
    })
    expect(failCall).toBeDefined()
  })

  it("ops alert throws → applicant ack already attempted; action resolves", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@bomy.my"
    sendOpsAlertMock.mockRejectedValueOnce(new Error("smtp boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    expect(sendApplicantAckMock).toHaveBeenCalledOnce()
    expect(sendOpsAlertMock).toHaveBeenCalledOnce()

    const failCall = errorSpy.mock.calls.find((c) => {
      const arg = c[0] as { event?: string; recipientType?: string }
      return arg?.event === "email_notification_failed" && arg.recipientType === "ops"
    })
    expect(failCall).toBeDefined()
  })

  it("rejects when a required field is missing", async () => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ name: "" }))).rejects.toThrow(
      /All required fields/,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
  })

  it.each([
    "aisyah@example.com, attacker@evil.com",
    "aisyah@example.com;attacker@evil.com",
    "Aisyah <aisyah@example.com>",
    "aisyah aisyah@example.com",
    "not-an-email",
    "double@@example.com",
    '"quoted"@example.com',
  ])("rejects invalid/multi-recipient email shape: %s", async (badEmail) => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ email: badEmail }))).rejects.toThrow(
      /valid email/,
    )
    expect(sendApplicantAckMock).not.toHaveBeenCalled()
  })
})
```

(Total: 16 tests — 7 new verify/dispatch + 1 rewritten ops-empty + 1 required-field + 7 invalid-email rejection = 16. The PR #35 "ops-attempted; never sends to submitted email" test is superseded by the new happy-path test.)

### 4B: Run failing tests to confirm

- [ ] **Step 4.2: Run the test file to verify it fails**

Requires Docker stack up (Postgres on :5432).

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/web test --run tests/seller-inquiries/actions.test.ts
```

Expected: multiple FAIL. The verify-failure tests (1, 2, 3, 4) fail because PR #35's action doesn't call `verifyTurnstile` — the action just proceeds and inserts, then the test's "does not throw" assertion + mock-not-called assertions fail. The dual-dispatch tests (5, 6, 7) fail because PR #35's action doesn't call `sendApplicantAck`. The rewritten ops-empty test (8) fails because `sendApplicantAckMock` is never called. The required-field (15) and invalid-email (16-22) tests should mostly pass already, but the `expect(sendApplicantAckMock).not.toHaveBeenCalled()` extra assertions may pass trivially.

### 4C: Update the action

- [ ] **Step 4.3: Rewrite the action**

Replace the contents of `apps/web/src/app/seller/apply/actions.ts` with:

```ts
"use server"

import { parseOpsEmails } from "@bomy/mailer"
import { makeDb, schema } from "@bomy/db"

import { getMailer } from "@/lib/mailer"
import { verifyTurnstile } from "@/lib/turnstile"
import { sendApplicantAck, sendOpsAlert } from "@/notifications/seller-inquiry"

const { db } = makeDb()

const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

export async function submitSellerInquiry(formData: FormData) {
  // 1. Turnstile verify FIRST — before any field validation, DB insert,
  //    or mail dispatch. Failure → generic form-level error; no side effects.
  const rawToken = formData.get("cf-turnstile-response")
  const token = typeof rawToken === "string" && rawToken.length > 0 ? rawToken : null
  const verify = await verifyTurnstile(token)
  if (!verify.success) {
    throw new Error("Verification failed. Please try the challenge again.")
  }

  // 2. Required-field validation.
  const name = readFormString(formData, "name")
  const email = readFormString(formData, "email")
  const contactNumber = readFormString(formData, "contactNumber")
  const companyName = readFormString(formData, "companyName")
  const storeName = readFormString(formData, "storeName")
  const message = readFormString(formData, "message") || null

  if (!name || !email || !contactNumber || !companyName || !storeName) {
    throw new Error("All required fields must be filled in.")
  }

  // 3. Single-address email shape validation (defense in depth on top of Turnstile).
  if (!EMAIL_RE.test(email)) {
    throw new Error("Please provide a valid email address.")
  }

  // 4. DB insert.
  const [inserted] = await db
    .insert(schema.sellerInquiries)
    .values({ name, email, contactNumber, companyName, storeName, message })
    .returning({ id: schema.sellerInquiries.id })
  const inquiryId = inserted!.id

  // 5. Dispatch BOTH emails with per-recipient try/catch isolation.
  //    Applicant fail → ops still tried. Ops fail → applicant already attempted.
  const mailer = getMailer()

  try {
    await sendApplicantAck(mailer, { name, email, storeName })
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      recipientType: "applicant",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  const opsEmails = parseOpsEmails(process.env)
  if (opsEmails.length === 0) {
    console.info({
      event: "email_notification_skipped",
      reason: "missing_ops_recipients",
      inquiryId,
    })
    return
  }

  try {
    await sendOpsAlert(
      mailer,
      { inquiryId, name, email, contactNumber, companyName, storeName, message },
      { adminUrl: process.env["ADMIN_URL"] ?? "", opsEmails },
    )
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      recipientType: "ops",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
```

### 4D: Re-run + commit

- [ ] **Step 4.4: Run the test file to verify it passes**

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/web test --run tests/seller-inquiries/actions.test.ts
```

Expected: 16 tests passed.

- [ ] **Step 4.5: Lint + typecheck**

```bash
pnpm --filter @bomy/web lint && pnpm --filter @bomy/web typecheck
```

Expected: both exit 0.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/src/app/seller/apply/actions.ts apps/web/tests/seller-inquiries/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(web): Turnstile gate + restored applicant ack in submitSellerInquiry

submitSellerInquiry now:
1. Verifies the cf-turnstile-response token via verifyTurnstile()
   BEFORE any required-field or email-shape validation, BEFORE the
   DB insert, BEFORE any mail dispatch. Failure → generic "Verification
   failed" error, no side effects.
2. Inserts the seller_inquiries row (unchanged).
3. Dispatches applicant ack AND ops alert with per-recipient try/catch
   isolation. Either failure logs email_notification_failed and does
   not block the other dispatch. Action resolves normally on either
   or both email failures.

readFormString helper replaces the unsafe (formData.get(X) as string)
casts from PR #35 (Bob R0 catch).

Action tests use vi.hoisted mock handles for @/lib/turnstile AND
@/notifications/seller-inquiry so vi.resetModules() + dynamic action
import work correctly. Per-test unique emails via randomUUID() for
the no-DB-insert assertions. Net: -1 PR #35 test superseded, +1
rewritten ops-empty assertion, +7 new verify/dispatch tests.

Closes PR #35 deferred work — applicant ack is back, now safe to
ship because every submission passes Turnstile first.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Client widget integration — page.tsx

**Files:**

- Modify: `apps/web/src/app/seller/apply/page.tsx`

No new tests for this task — the spec defers client widget behavior to manual smoke (§11), matching the existing `apps/web/tests/` pattern (no React component tests).

- [ ] **Step 5.1: Rewrite page.tsx**

Replace the contents of `apps/web/src/app/seller/apply/page.tsx` with:

```tsx
"use client"

import Script from "next/script"
import { useActionState, useEffect, useRef, useState } from "react"

import { submitSellerInquiry } from "./actions"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          "expired-callback"?: () => void
          "error-callback"?: () => void
          theme?: "light" | "dark" | "auto"
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? ""

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [token, setToken] = useState("")
  const [scriptReady, setScriptReady] = useState(false)

  // Render the widget once the script is ready AND the container is in the DOM.
  useEffect(() => {
    if (!scriptReady || !containerRef.current || widgetIdRef.current) return
    if (!SITEKEY) return
    if (!window.turnstile) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITEKEY,
      callback: (t) => setToken(t),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    })
  }, [scriptReady])

  // Reset the widget on ANY action failure.
  // Depend on `state` (the whole object), not `state.error` — useActionState
  // returns a fresh object reference per invocation, but the error string can
  // be value-equal across consecutive failures (e.g. two verify rejections
  // both produce "Verification failed..."). [state.error] would not re-fire;
  // [state] does because the reference changes each time.
  useEffect(() => {
    if (state.error && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      setToken("")
    }
  }, [state])

  // Cleanup on unmount — avoids duplicate widgets if the page remounts.
  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [])

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
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />

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

          {/* Turnstile widget container + hidden token mirror for FormData. */}
          <div ref={containerRef} />
          <input type="hidden" name="cf-turnstile-response" value={token} />

          {!SITEKEY && (
            <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Form temporarily unavailable. Please try again later.
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !token || !SITEKEY}
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

- [ ] **Step 5.2: Lint + typecheck**

```bash
pnpm --filter @bomy/web lint && pnpm --filter @bomy/web typecheck
```

Expected: both exit 0. `eslint-plugin-react-hooks` correctly recognizes refs as stable identifiers and won't flag the missing `containerRef` / `widgetIdRef` from the `[scriptReady]` and `[state]` dep arrays. The `[]` empty deps for the unmount cleanup is correct (runs once on mount + once on unmount).

- [ ] **Step 5.3: Manual smoke — quick visual check**

This step is for the implementer to confirm the widget renders. Full smoke is in Task 6 Step 6.3.

```bash
pnpm dev
```

Navigate to `http://localhost:3000/seller/apply`. Verify:

- Page renders.
- Turnstile widget appears (test-mode visible checkbox under "I'm not a robot" with Cloudflare branding).
- Submit button is disabled until the checkbox is clicked.
- Clicking the checkbox enables submit.

Stop the dev server.

- [ ] **Step 5.4: Commit**

```bash
git add apps/web/src/app/seller/apply/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): render Turnstile widget on /seller/apply

Uses next/script with ?render=explicit (required when calling
turnstile.render manually — without it, Cloudflare's script
auto-renders any cf-turnstile class divs). onReady (not onLoad)
handles client-nav remounts where the script is already cached.

Token flow: widget callback stores in React state AND mirrors to
a hidden cf-turnstile-response input so FormData carries it to
the server action.

Submit button is disabled until token exists or if sitekey is
missing (graceful misconfig). expired-callback and error-callback
clear the stored token.

Auto-reset on any state change (Bob R0 F1) — depends on `state`
not `state.error` because the error string can be value-equal
across consecutive failures while the state object reference
changes per invocation.

turnstile.remove(widgetId) on unmount cleans up to avoid duplicate
widgets in dev remounts.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verify + manual smoke + push + PR

**Files:** none committed (verification + git ops only; manual smoke against local Docker).

- [ ] **Step 6.1: Full root lint + typecheck**

```bash
pnpm lint
pnpm typecheck
```

Expected: 6 packages, all green, zero warnings.

- [ ] **Step 6.2: Full root test suite**

Docker stack must be up.

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm test
```

Expected: 642 tests passed across 6 packages. Pre-PR-#37 was 622; delta is +20 (12 turnstile + 2 sendApplicantAck restored + 6 net actions = +20). `apps/web` test count: 183 → 203.

- [ ] **Step 6.3: Manual smoke against local Docker + Mailhog**

Prerequisite env in `apps/web/.env.local` (copy from `.env.local.example` and set the additional values):

```
NEXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
EMAIL_DELIVERY_ENABLED=true
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
MAIL_FROM="BOMY <noreply@bomy.my>"
OPS_ALERT_EMAILS=ops@bomy.my
ADMIN_URL=http://localhost:3002
```

Mailhog runs at `http://localhost:8025`. Docker stack is already up from Step 6.2.

**Smoke 1 — happy path:**

1. `pnpm dev` → navigate to `http://localhost:3000/seller/apply`.
2. Widget renders the test-mode visible checkbox.
3. Submit button stays disabled until the checkbox is clicked.
4. Click checkbox → callback fires, token populates → submit enables.
5. Fill the form with a unique applicant email (e.g. `smoke-<timestamp>@example.com`) and valid other fields.
6. Submit → success screen renders.
7. Open `http://localhost:8025`. Verify **TWO** messages: applicant ack to the unique email, ops alert to `ops@bomy.my`.

**Smoke 2 — verify failure:**

1. Edit `apps/web/.env.local`: change `TURNSTILE_SECRET_KEY` to `2x0000000000000000000000000000000AA` (Cloudflare always-fail). Keep the sitekey as-is.
2. The Next.js dev server should auto-restart. If it doesn't, stop + restart `pnpm dev`.
3. Navigate back to `/seller/apply` (refresh).
4. Use a NEW unique applicant email (different from Smoke 1).
5. Click the checkbox, fill the form, submit.
6. Action returns the generic `"Verification failed. Please try the challenge again."` error.
7. Widget auto-resets (fresh checkbox state).
8. Verify NO row in `seller_inquiries` for this Smoke 2 email:
   ```bash
   docker exec bomy_postgres psql -U bomy bomy -c \
     "SELECT count(*) FROM seller_inquiries WHERE email = 'smoke-NN@example.com';"
   ```
   (Substitute the actual Smoke 2 email.) Expected: 0.
9. Verify no new messages in Mailhog beyond the two from Smoke 1.

After Smoke 2, revert `TURNSTILE_SECRET_KEY` to `1x0000000000000000000000000000000AA`.

**Smoke 3 — missing sitekey:**

1. Edit `apps/web/.env.local`: comment out or remove `NEXT_PUBLIC_TURNSTILE_SITEKEY`. Restart `pnpm dev`.
2. Navigate to `/seller/apply`.
3. Yellow "Form temporarily unavailable" banner renders.
4. Submit button is disabled.

Restore the sitekey afterwards.

**Smoke 4 — client navigation widget remount:**

1. With dev server running and sitekey restored, navigate to `/seller/apply` → widget renders.
2. Click a link to another route (e.g. `/`), then click a link back to `/seller/apply` (client-side nav, not full reload).
3. Widget re-renders cleanly. No duplicate widgets stack up. `onReady` fires and the container ref repopulates correctly.

Stop the dev server when done.

- [ ] **Step 6.4: Verify clean git status**

```bash
git status
```

Expected: nothing staged; clean working tree except for the standing carry-forwards (`.andy/handoff.md`, root `CLAUDE.md`, `.claude/`, stale plans). Five new commits from Tasks 1–5 are in.

- [ ] **Step 6.5: Push the branch**

```bash
git push -u origin feat/turnstile-seller-apply
```

Expected: branch tracks `origin/feat/turnstile-seller-apply`.

- [ ] **Step 6.6: Draft the PR body**

```bash
mkdir -p .andy
cat > .andy/pr37-description.md <<'EOF'
# PR #37 — Turnstile on `/seller/apply` + restored applicant ack

**Branch:** `feat/turnstile-seller-apply` → `main`
**Spec:** `docs/superpowers/specs/2026-05-29-pr37-turnstile-seller-apply-design.md`
**Plan:** `docs/superpowers/plans/2026-05-29-pr37-turnstile-seller-apply.md`
**Closes:** PR #35 deferred work (applicant ack on `/seller/apply` was dropped pending abuse protection).

## Summary

Gates the public `/seller/apply` form with Cloudflare Turnstile, then restores the applicant ack alongside the existing ops alert. The submitted email becomes safe to use as an outbound `to:` because every submission passes a verified human-presence challenge before any mail dispatch.

- **`verifyTurnstile(token, remoteIp?)` helper** at `apps/web/src/lib/turnstile.ts`. Server-only. Fails closed on every documented mode (`missing-secret` / `invalid-response` / `network-error`). 5s timeout via `AbortSignal.timeout`. No throws — all failures resolve to `{ success: false, ... }`.
- **Server action `submitSellerInquiry`** runs Turnstile verify FIRST (before required-field or email-shape validation, before DB insert, before any mail). Verify failure → generic `"Verification failed. Please try the challenge again."` error, no side effects. On success: DB insert, then applicant ack AND ops alert with per-recipient try/catch isolation.
- **Client widget** rendered via `next/script` with `?render=explicit`; `onReady` (not `onLoad`) handles client-nav remounts. Token mirrors React state to a hidden `cf-turnstile-response` input for FormData. Submit disabled until token exists. **Auto-resets the widget on any submit failure** — verify consumes the token on success, so a later step failing leaves the form in a "token already burned" state that needs a fresh challenge.

## What is NOT in this PR (per spec §3)

- Per-IP / per-session rate limiting beyond Turnstile's own throttling.
- Production / staging Cloudflare key issuance. Operational step; lands when prod/staging exist (named dependency in the prod-cutover runbook from PR #36).
- Turnstile on other forms.
- Server-side `remoteIp` plumbing.
- Hostname / action / cdata pinning.
- React component tests for the widget — manual smoke covers it.
- Standalone runbook for Turnstile secret rotation.

## Toolchain

- Added `server-only` (`^0.0.1`) to `apps/web` dependencies.
- `apps/web/vitest.config.ts` aliases `server-only` to `tests/stubs/server-only.ts` (no-op export `{}`) so vitest can resolve the import.
- Cloudflare's documented always-pass test keys (`1x...AA` sitekey, `1x...AA` secret) seeded in `apps/web/.env.local.example` + root `.env.example` under a new "Turnstile (Stage 5 PR #37)" block.

## Automated verification

- **Tests:** 642/642 passing across 6 workspaces (+20 vs main: 12 verifyTurnstile unit tests + 2 restored `sendApplicantAck` template tests + 6 net actions).
  - `@bomy/web`: 183 → 203.
  - Other packages unchanged.
- **Lint:** `pnpm lint` zero warnings.
- **Typecheck:** `pnpm typecheck` clean across all 6 packages.

## Manual smoke (2026-MM-DD against local Docker + Mailhog)

- Happy path: widget renders, token populates on click, submit enables, form submits, **two** Mailhog messages (applicant ack + ops alert).
- Verify failure (Cloudflare always-fail secret): generic error, widget auto-resets, NO row in `seller_inquiries` for the unique smoke email, NO new Mailhog message.
- Missing sitekey: yellow "Form temporarily unavailable" banner; submit disabled.
- Client-nav remount: widget re-renders cleanly; no duplicates.

(Implementer: substitute actual smoke date in the final PR body.)

## Test plan

- [x] `pnpm lint` (zero warnings)
- [x] `pnpm typecheck` (clean)
- [x] `pnpm test` (642/642 green)
- [x] Manual smoke (4 scenarios)

## Reviewer checks

- Confirm verify is the FIRST step in `submitSellerInquiry` — before required-field validation, before email-shape regex, before DB insert.
- Confirm no DB insert on verify failure (test 1 asserts zero rows for unique email).
- Confirm per-recipient isolation in BOTH directions (tests 6 and 7).
- Confirm reset effect depends on `state` (not `state.error`) — value-equal error strings across consecutive failures would skip the reset otherwise.
- Confirm Script src includes `?render=explicit` — required for manual `turnstile.render()`.
- Confirm `cf-turnstile-response` is the canonical hidden-input name (matches the server action's `formData.get` key).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF

gh pr create --base main --head feat/turnstile-seller-apply \
  --title "feat(web): Turnstile on /seller/apply + restored applicant ack" \
  --body "$(cat .andy/pr37-description.md)"
```

Expected: PR URL printed. Capture for the handoff update.

- [ ] **Step 6.7: Update handoff for in-flight PR**

Edit `.andy/handoff.md` per the cross-window protocol. Include the 9 items from init_andy.md §"Handoff protocol": branch, status, committed-vs-uncommitted, what just finished, next step, open questions, decisions made, model recommendation, files-touched-not-committed.

- [ ] **Step 6.8: No final commit needed**

All code/doc changes are committed in Tasks 1–5. Push happened in Step 6.5. Handoff edit (Step 6.7) stays uncommitted per the carry-forward rule.

---

## Out-of-scope reminders (referenced from spec §3 — do not slide into this PR)

- Do NOT add a `TURNSTILE_ENABLED` flag or any other escape hatch. One production-shaped code path; no risk of accidentally shipping a "captcha disabled" mode.
- Do NOT plumb `remoteIp` through the server action. Deferred.
- Do NOT add Playwright / RTL component tests. Manual smoke covers the widget behavior; no existing precedent in `apps/web/tests/`.
- Do NOT commit any per-flip or per-submission evidence file (this PR doesn't introduce a runbook).
- Do NOT issue real Cloudflare keys as part of this PR.

---

## Risk + verification notes

- **Action tests use `vi.hoisted` mocks for `@/lib/turnstile` AND `@/notifications/seller-inquiry`** because `vi.resetModules()` + dynamic `await import(actions.js)` would otherwise leave the test file holding stale references. Hoisted handles are stable across module resets.
- **The reset effect depends on `state` (full object), not `state.error` (string).** `useActionState` returns a fresh object reference per invocation; the error string can be value-equal across consecutive failures. `[state.error]` would not re-fire; `[state]` does.
- **Default `verifyTurnstileMock` resolves with `{ success: true }`** so existing tests that just need the action to proceed past verify don't have to set it up explicitly. Verify-failure tests use `.mockResolvedValueOnce({ success: false, ... })` for that single call.
- **Per-test unique emails** are required for any "no DB insert" assertion because the test DB persists between runs (PR #36 pattern: `__test_flip_<uuid>`; here: `<prefix>-<uuid>@test.bomy`).
- **Manual smoke is the only verification for client widget behavior.** The cleanup-on-unmount, auto-reset, and disabled-until-token logic don't have vitest coverage; rely on Smoke 4 (client nav) and Smoke 1 (happy path) to catch regressions during local development.
- **Cloudflare test keys are public.** Committing them in `.env.local.example` is intentional and documented in the file's comment block. Real keys never enter the repo.
