# PR #37 — Turnstile on `/seller/apply` + restored applicant ack

**Status:** Design locked
**Date:** 2026-05-29
**Author model:** Opus 4.7
**Brainstorm partner:** Charlie
**Closes:** PR #35 deferred work — applicant ack on `/seller/apply` was dropped pending abuse protection ([[feedback-public-mailer-abuse]] memory).

---

## 1. Goal

Gate the public `/seller/apply` form with Cloudflare Turnstile, then restore the applicant ack alongside the existing ops alert. The submitted email becomes safe to use as an outbound `to:` because every submission now passes a verified human-presence challenge before any mail dispatch.

This PR closes the only known abuse vector flagged on the seller-apply surface (PR #35 R1 F1) and re-enables the user-facing applicant ack that was dropped in commit `9003a72`.

---

## 2. In scope (artifacts shipped)

| Artifact                                                       | Purpose                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/turnstile.ts` (new)                          | `verifyTurnstile(token, remoteIp?)` helper. Server-only (`import "server-only"`). Fails closed on every documented failure mode.                                                                                                                         |
| `apps/web/src/notifications/seller-inquiry.ts` (modify)        | Restore `sendApplicantAck(mailer, { name, email, storeName })` export (was deleted in PR #35).                                                                                                                                                           |
| `apps/web/src/app/seller/apply/actions.ts` (modify)            | `submitSellerInquiry` runs Turnstile verify FIRST, then existing required-field + email-shape validation + DB insert, then applicant ack + ops alert with per-recipient try/catch isolation.                                                             |
| `apps/web/src/app/seller/apply/page.tsx` (modify)              | Render Turnstile widget via `next/script` + container div + `turnstile.render`. Hidden input `cf-turnstile-response` carries the token to FormData. Auto-reset on any submit failure.                                                                    |
| `apps/web/package.json` (modify)                               | Add `server-only` dependency.                                                                                                                                                                                                                            |
| `apps/web/vitest.config.ts` (modify)                           | Alias `server-only` to `tests/stubs/server-only.ts` (no-op) so vitest can resolve it.                                                                                                                                                                    |
| `apps/web/tests/stubs/server-only.ts` (new)                    | One-line `export {}` stub.                                                                                                                                                                                                                               |
| `apps/web/tests/lib/turnstile.test.ts` (new)                   | 12 unit tests for `verifyTurnstile` (mocked `fetch`).                                                                                                                                                                                                    |
| `apps/web/tests/notifications/seller-inquiry.test.ts` (modify) | Restore 2 `sendApplicantAck` template tests deleted in PR #35.                                                                                                                                                                                           |
| `apps/web/tests/seller-inquiries/actions.test.ts` (modify)     | Add 7 verify-gate cases (verify mocked via `vi.hoisted`); delete 1 PR #35 test superseded by new happy-path coverage; rewrite 1 PR #35 test to assert new dual-dispatch contract; update remaining 8 to set `cf-turnstile-response` in `makeFormData()`. |
| `apps/web/.env.local.example` (modify)                         | Add `NEXT_PUBLIC_TURNSTILE_SITEKEY` + `TURNSTILE_SECRET_KEY` with Cloudflare's documented always-pass test keys.                                                                                                                                         |
| `.env.example` (root, modify)                                  | Same vars under the `apps/web` section.                                                                                                                                                                                                                  |

---

## 3. Out of scope (explicit boundary)

- **Per-IP / per-session rate limiting** beyond Turnstile's own throttling. Adding rate limiting is YAGNI until we see real spam.
- **Production / staging Cloudflare key issuance.** Operational step — register an account, create a Turnstile site per domain, copy real keys into deploy env. Lands when prod/staging stand up; will be named as a dependency in the prod-cutover runbook from PR #36.
- **Turnstile on other forms.** `/auth/sign-in`, `/checkout`, etc. are either auth-gated or have no user-submitted-recipient surface. Only `/seller/apply` is the abuse vector. Other forms can adopt the same pattern later if needed.
- **Server-side `remoteIp` plumbing** to `verifyTurnstile`. The helper accepts the parameter; the action won't pass it in this PR. Next.js server actions don't expose IP cleanly without request-context plumbing, and Cloudflare's scoring works without it. Reserved for future hardening.
- **Hostname / action / cdata pinning** in the Cloudflare verify response. Trust the secret↔token correlation. Hostname pinning is a future hardening pass if we ever ship multiple seller-apply variants.
- **React component (Playwright / RTL) tests** for the client widget. Manual smoke covers it; no existing `apps/web/tests/` precedent for component tests.
- **Standalone runbook for Turnstile secret rotation.** Lands alongside the prod-cutover runbook (PR #36 deferred follow-up).
- **Removing the existing `EMAIL_RE` email-shape regex** from `submitSellerInquiry`. Single-address validation stays — it's defense in depth (Q1 contract: "Applicant email still gets single-address validation server-side").

---

## 4. Brainstorm Q&A — locked decisions

| #   | Question                                                         | Decision                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Scope: Turnstile only, or Turnstile + applicant ack restoration? | Both. PR closes PR #35 deferred work in one coherent change. Contract: verify before any dispatch; single-address email validation; ops recipients server-controlled; per-recipient isolation; verify failure → no DB insert and no emails.                     |
| Q2  | Local-dev + test posture for the gate                            | Local uses Cloudflare's documented always-pass test keys. Vitest mocks `verifyTurnstile`. Form always renders the widget; server always calls `/siteverify`. No `TURNSTILE_ENABLED` escape-hatch flag.                                                          |
| Q3  | Failure UX when Turnstile verify fails server-side               | Single generic message `"Verification failed. Please try the challenge again."` for every failure mode. Client auto-resets the widget via `turnstile.reset(widgetId)` on any action-error response. Detailed cause stays in server logs + test assertions only. |
| Q4  | Where does the verify helper live?                               | `apps/web/src/lib/turnstile.ts` — local module mirroring the `apps/web/src/lib/mailer.ts` convention. No new shared package until a second app needs it.                                                                                                        |

---

## 5. `verifyTurnstile` helper contract

**File:** `apps/web/src/lib/turnstile.ts`. Top of file: `import "server-only"`.

### 5.1 Signature

```ts
export type TurnstileVerifyResult =
  | { success: true }
  | { success: false; reason: "missing-secret" | "invalid-response" | "network-error" }

export async function verifyTurnstile(
  token: string | null,
  remoteIp?: string,
): Promise<TurnstileVerifyResult>
```

### 5.2 Behavior (fail-closed at every branch)

1. Read `process.env["TURNSTILE_SECRET_KEY"]`. If missing/empty: log `console.error({ event: "turnstile_misconfigured" })` and return `{ success: false, reason: "missing-secret" }`. No fetch.
2. If `token` is `null` or empty string: return `{ success: false, reason: "invalid-response" }` with **no log** (this fires on every page-load with empty FormData; too noisy).
3. POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `Content-Type: application/x-www-form-urlencoded`. Body: `secret=<env>&response=<token>` (+ `&remoteip=<ip>` only if `remoteIp` was passed).
4. Wrap the fetch in `AbortSignal.timeout(5000)`. Any thrown error (including `AbortError` from timeout, DNS failure, TLS error): log `console.error({ event: "turnstile_network_error", message: err?.message })` and return `{ success: false, reason: "network-error" }`.
5. If response status is not 200: log `console.error({ event: "turnstile_network_error", status: response.status })` and return `{ success: false, reason: "network-error" }`. Do not bother parsing.
6. Parse JSON. If parse throws: log `console.error({ event: "turnstile_network_error", message: "json-parse-failed" })` and return `{ success: false, reason: "network-error" }`.
7. If parsed body's `success` field is exactly `true`: return `{ success: true }`.
8. Otherwise: log `console.info({ event: "turnstile_rejected", errorCodes: body["error-codes"] ?? [] })` and return `{ success: false, reason: "invalid-response" }`.

### 5.3 Contract surface

- **Does not throw.** All failure modes resolve to `{ success: false, ... }`.
- **Does not validate hostname / action / cdata.** Out of scope per §3.
- **Does not cache.** Tokens are single-use by Cloudflare design.
- **Does not export Cloudflare's `error-codes`** to callers. They live in logs only (Q3 no-info-leakage rule).
- **5-second timeout** matches a reasonable user-perceptible upper bound; Cloudflare's verify endpoint typically responds in <200ms.

---

## 6. Server action change — `submitSellerInquiry`

**File:** `apps/web/src/app/seller/apply/actions.ts`. Top-of-file imports gain `verifyTurnstile` from `@/lib/turnstile`.

### 6.1 `readFormString` helper

Defensive against non-string FormData values (per Bob R0):

```ts
function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}
```

Used for `name`, `email`, `contactNumber`, `companyName`, `storeName`, `message`. Replaces the `(formData.get("X") as string)?.trim()` casts from PR #35.

### 6.2 Validation order

```ts
export async function submitSellerInquiry(formData: FormData) {
  // 1. Turnstile verify FIRST — before required-field or email-shape validation,
  //    before DB insert, before any mail. Q1 contract.
  const rawToken = formData.get("cf-turnstile-response")
  const token = typeof rawToken === "string" && rawToken.length > 0 ? rawToken : null
  const verify = await verifyTurnstile(token)
  if (!verify.success) {
    throw new Error("Verification failed. Please try the challenge again.")
  }

  // 2. Required-field validation (unchanged from PR #35; uses readFormString now).
  const name = readFormString(formData, "name")
  const email = readFormString(formData, "email")
  const contactNumber = readFormString(formData, "contactNumber")
  const companyName = readFormString(formData, "companyName")
  const storeName = readFormString(formData, "storeName")
  const message = readFormString(formData, "message") || null

  if (!name || !email || !contactNumber || !companyName || !storeName) {
    throw new Error("All required fields must be filled in.")
  }

  // 3. Single-address email shape validation (unchanged from PR #35).
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
    // Do not throw — ops alert still attempted below.
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

### 6.3 Locked contracts

- **Verify before anything else.** No "field missing" feedback to bots that haven't proved presence.
- **No DB insert on verify failure.** Zero rows in `seller_inquiries` from failed challenges — the abuse mitigation depends on no persisted side effect.
- **Per-recipient isolation in both directions.** Applicant fail → ops still tried. Ops fail → applicant was already attempted. Action resolves normally on either or both email failures. Matches PR #34 dispatch axis (server action = `await` + per-recipient try/catch — see [[feedback-email-dispatch-axis]]).
- **Generic error message** — same string regardless of which `verifyTurnstile` reason fired (Q3).
- **Existing `OPS_ALERT_EMAILS` empty path** unchanged: log skip, return. Applicant ack already attempted before this check.
- **Action throws `Error` on failure** — `page.tsx`'s `formAction` already wraps via `.catch((e: Error) => ({ success: false, error: e.message }))`. No new return shape.

---

## 7. Client widget integration — `page.tsx`

**File:** `apps/web/src/app/seller/apply/page.tsx`. Already a client component (`"use client"`).

### 7.1 Window type declaration

Top of file, outside the component:

```tsx
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
      ) => string // returns widgetId
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}
```

No third-party type package; local ambient declaration covers exactly the surface used.

### 7.2 Component changes

```tsx
const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? ""

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

  // Reset the widget on ANY action failure — verify consumes the token even
  // when a later step (field validation, DB insert) throws.
  // Depend on `state` (the whole object), not `state.error` — useActionState
  // returns a fresh object reference per invocation, but the error string can
  // be value-equal across consecutive failures (e.g. two verify rejections
  // in a row both produce "Verification failed..."). `[state.error]` would
  // not re-fire; `[state]` does because the reference changes each time.
  useEffect(() => {
    if (state.error && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      setToken("")
    }
  }, [state])

  // Cleanup on unmount — avoids duplicate widgets in dev remounts.
  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [])

  // ... existing success-screen return unchanged ...

  return (
    <main className="...">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />

      <div className="...">
        {/* heading + error banner unchanged */}

        <form action={action} className="space-y-4">
          {/* existing inputs unchanged */}

          {/* Turnstile widget container + hidden token input */}
          <div ref={containerRef} />
          <input type="hidden" name="cf-turnstile-response" value={token} />

          {!SITEKEY && (
            <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Form temporarily unavailable. Please try again later.
            </div>
          )}

          <button type="submit" disabled={pending || !token || !SITEKEY} className="...">
            {pending ? "Submitting…" : "Submit Application"}
          </button>
        </form>
      </div>
    </main>
  )
}
```

### 7.3 Locked contracts

- **`next/script` with `strategy="afterInteractive"` and `onReady`** — not `onLoad`. `onReady` fires on client-nav remounts where the script is already cached.
- **Script URL includes `?render=explicit`** — required when calling `turnstile.render()` manually. Without it, Cloudflare's script auto-renders any `cf-turnstile`-class divs on the page; we want only the explicit render we control.
- **Dot access for the public env var** — `process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY`, NOT `process.env["NEXT_PUBLIC_..."]`. Next reliably inlines direct property access; bracket access can break inlining.
- **Submit disabled until token exists** — `disabled={pending || !token || !SITEKEY}`. Happy path never reaches the no-token server-side rejection.
- **Hidden input is the canonical name `cf-turnstile-response`** — matches what the action reads from FormData. React state mirrors it.
- **Auto-reset on ANY `state.error`** — covers verify-failed, validation-failed, DB-insert-failed, anything else. Generic to "any error" because verify consumes the token at the moment it succeeds (Bob R0 catch).
- **Missing sitekey graceful path** — yellow "Form temporarily unavailable" banner + submit disabled. Mirrors server-side fail-closed posture.
- **`expired-callback` + `error-callback` clear the stored token** — token expires after a few minutes; we don't want stale tokens submitted.
- **`turnstile.remove(widgetId)` on unmount** — small cleanup to avoid duplicate widgets in dev remounts.

---

## 8. Env contract

Two new vars, both `apps/web`-only:

| Var                             | Side             | Source                            |
| ------------------------------- | ---------------- | --------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | client (inlined) | Cloudflare dashboard, public-safe |
| `TURNSTILE_SECRET_KEY`          | server-only      | Cloudflare dashboard, secret      |

`apps/api` and `apps/admin` do not read either. The public key is client-inlined by Next; the secret is read only by the web server action / `verifyTurnstile`.

**`.env.local.example` content** (apps/web + root `apps/web` section):

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

**`infra/docker/.env.example`** — unchanged (infra-only). **`apps/api/.env.local.example`** — unchanged. **`apps/admin/.env.local.example`** — unchanged.

---

## 9. Tests

Three test surfaces. All vitest, no Playwright. Client widget behavior is verified by manual smoke (§11).

### 9.1 New: `apps/web/tests/lib/turnstile.test.ts` (+12 unit tests)

All mock `global.fetch` via `vi.stubGlobal("fetch", vi.fn())`. Cases:

1. Returns `{ success: false, reason: "missing-secret" }` when `TURNSTILE_SECRET_KEY` env unset; **does** log `turnstile_misconfigured`.
2. Returns `{ success: false, reason: "invalid-response" }` when token is `null`; **no log**.
3. Returns `{ success: false, reason: "invalid-response" }` when token is empty string; **no log**.
4. POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `Content-Type: application/x-www-form-urlencoded`.
5. POST body contains `secret=<env>` and `response=<token>` when no `remoteIp` arg.
6. POST body includes `remoteip=<ip>` when `remoteIp` arg is passed.
7. Uses `AbortSignal.timeout(5000)` (assert via mocked `AbortSignal.timeout`).
8. Returns `{ success: false, reason: "network-error" }` on fetch throw.
9. Returns `{ success: false, reason: "network-error" }` on non-200; log payload includes `status`.
10. Returns `{ success: false, reason: "network-error" }` on JSON parse failure.
11. Returns `{ success: true }` when body `{ success: true }`.
12. Returns `{ success: false, reason: "invalid-response" }` when body `{ success: false, "error-codes": [...] }`; log captures `errorCodes`.

Setup/teardown:

```ts
beforeEach(() => {
  vi.resetAllMocks()
  process.env.TURNSTILE_SECRET_KEY = "test-secret"
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TURNSTILE_SECRET_KEY
})
```

### 9.2 Modify: `apps/web/tests/notifications/seller-inquiry.test.ts` (+2 tests restored)

Restore the two `sendApplicantAck` template tests that PR #35 commit `9003a72` deleted (the function is being re-exported). Verbatim from the pre-PR-#35 state preserved in PR #35 spec §4.1:

- "addresses the applicant by submitted email and mentions the store name" — asserts `args.to === "aisyah@example.com"`, subject contains `"seller application"`, body contains the name + store name.
- "does not promise a specific SLA in the body" — asserts no match for `/business days?/i` or `/within \d+ (hour|day)/i` in the body.

Existing 2 `sendOpsAlert` tests stay unchanged.

### 9.3 Modify: `apps/web/tests/seller-inquiries/actions.test.ts` (+7 new, 1 deleted, 1 rewritten, 8 updated)

DB-gated integration tests. The PR #35 file currently has 10 tests (1 ops-attempted, 1 ops-empty-skip, 1 required-field-missing, 7 parameterised invalid-email rejections).

**Mock pattern** at the top of the file. The combination of `vi.resetModules()` + dynamic `await import(actions.js)` requires hoisted mock handles — a static `import { verifyTurnstile } from "@/lib/turnstile"` would bind to the original mock instance, but after `resetModules` the dynamically-imported actions.ts resolves a fresh instance, leaving `vi.mocked(verifyTurnstile)` configuring the wrong one. `vi.hoisted` runs before any imports and gives us a stable handle across module resets.

```ts
import { randomUUID } from "node:crypto"

// Hoisted mock handles — stable across vi.resetModules().
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

function makeUniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.bomy`
}

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
```

The notification mocks are needed for tests 6 and 7 (per-recipient isolation), which need to make `sendApplicantAck` or `sendOpsAlert` throw on demand. Hoisting both means the same handle is configured per-test and consumed by the dynamically-imported `actions.ts`. The non-isolation tests still work because the default `mockResolvedValue(undefined)` simulates a successful (no-op) dispatch — which means tests 1, 4, 5 that previously relied on the disabled-mode mailer's skip-log assertion will need to switch their assertion to "the mock was called with the right `to`".

**Existing 10 tests updated:**

- All 10 — `makeFormData()` gains a default `fd.set("cf-turnstile-response", "test-token")` so the action's verify step passes via the default `verifyTurnstileMock` (returns `{ success: true }`).
- Tests 3–10 (1 required-field + 7 parameterised invalid-email) — no further changes; they still throw before reaching dispatch.
- **Tests 1–2 need substantive rewrites** to match the new dual-dispatch contract:
  - PR #35 test 1 (`"inserts the row and attempts ops alert when OPS_ALERT_EMAILS is set; never sends to the submitted email"`) — was an ops-only assertion. Becomes superseded by new test 5 below (covers applicant + ops dispatch under happy path); delete the PR #35 test 1 to avoid redundancy.
  - PR #35 test 2 (`"logs missing_ops_recipients and sends nothing when OPS_ALERT_EMAILS is empty"`) — becomes `"logs missing_ops_recipients and sends ONLY applicant ack when OPS_ALERT_EMAILS is empty"`. Assertion changes to: `sendApplicantAckMock` called once; `sendOpsAlertMock` NOT called; info log fires with `reason: "missing_ops_recipients"`.

So the net change to existing tests: **delete 1 (PR #35 test 1), rewrite 1 (PR #35 test 2), update 8 (FormData token only)**. With the +7 new tests, the test file goes from 10 → 16 (not 17 as originally stated — superseding PR #35 test 1 removes one).

**New tests (7):**

1. **Verify-failure rejects with generic message; no DB insert; no email.** Per-test unique email via `makeUniqueEmail("verify-fail-invalid")`. `verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "invalid-response" })`. Action throws `/Verification failed/`. Assert: zero rows in `seller_inquiries` for the unique email; `sendApplicantAckMock` NOT called; `sendOpsAlertMock` NOT called.

2. **Verify reason `missing-secret` produces same generic error.** `verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "missing-secret" })`. Per-test unique email. Action throws `/Verification failed/`. Error message is identical to test 1 (no leaked internal detail). Dispatcher mocks NOT called.

3. **Verify reason `network-error` produces same generic error.** `verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "network-error" })`. Per-test unique email. Action throws `/Verification failed/`. Dispatcher mocks NOT called.

4. **Empty / missing `cf-turnstile-response` reaches verify as `null` and rejects.** `makeFormData()` override that deletes the token field. Because the default `verifyTurnstileMock` resolves with `{ success: true }`, this test must override it to simulate what the real helper would do for `null` input per §5.2 step 2: `verifyTurnstileMock.mockResolvedValueOnce({ success: false, reason: "invalid-response" })`. Action throws `/Verification failed/`. Assert: `verifyTurnstileMock` was called with first arg `null` (not `""`, not `undefined`). Dispatcher mocks NOT called.

5. **Verify passes → inserts row + dispatches BOTH applicant ack AND ops alert.** Default verify mock (success). `OPS_ALERT_EMAILS=ops@bomy.my`. Per-test unique applicant email via `makeUniqueEmail("happy")`. Assert: row inserted for the unique email; `sendApplicantAckMock` called exactly once with `{ name, email: <unique>, storeName }`; `sendOpsAlertMock` called exactly once with the inquiry payload + `opsEmails: ["ops@bomy.my"]`.

6. **Per-recipient isolation: applicant send throws → ops alert still attempted.** Default verify mock. `sendApplicantAckMock.mockRejectedValueOnce(new Error("smtp boom"))`. Assert: action resolves normally; `email_notification_failed` log with `recipientType: "applicant"` fires; `sendOpsAlertMock` was still called (ops not blocked by applicant failure).

7. **Per-recipient isolation: ops alert throws → applicant ack was already attempted; action resolves.** Default verify mock. `sendOpsAlertMock.mockRejectedValueOnce(new Error("smtp boom"))`. `OPS_ALERT_EMAILS=ops@bomy.my`. Assert: `sendApplicantAckMock` was called (applicant attempted first); `email_notification_failed` log with `recipientType: "ops"` fires; action resolves normally.

### 9.4 Toolchain — vitest config + stub

`apps/web/package.json` adds `server-only` to dependencies (Next-supplied marker package; `^0.0.1`).

`apps/web/tests/stubs/server-only.ts` (new):

```ts
export {}
```

`apps/web/vitest.config.ts` adds an alias entry:

```ts
resolve: {
  alias: [
    // ... existing aliases ...
    {
      find: "server-only",
      replacement: fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  ],
},
```

Without this, vitest fails to resolve `import "server-only"` inside `turnstile.ts` and the test suite breaks at module load.

### 9.5 Test delta summary

| File                                         | Existing | After | Delta                                      |
| -------------------------------------------- | -------- | ----- | ------------------------------------------ |
| `tests/lib/turnstile.test.ts`                | 0        | 12    | +12                                        |
| `tests/notifications/seller-inquiry.test.ts` | 2        | 4     | +2 (restored)                              |
| `tests/seller-inquiries/actions.test.ts`     | 10       | 16    | +6 (delete 1 superseded, rewrite 1, add 7) |

**Total delta:** +20 tests. Expected post-PR-#37 suite: 622 + 20 = **642**. `apps/web` test count was 183 → 203 after.

---

## 10. Key invariants enforced by this design

- **No email is sent unless Turnstile verify succeeds.** Closes the PR #35 R1 F1 abuse vector — a bot submission produces zero side effects.
- **No DB insert unless verify succeeds.** No persisted artifact from failed challenges.
- **Single-address email validation remains** as defense in depth on top of Turnstile — both must pass.
- **Ops recipients stay server-controlled.** Only the applicant email is user-submitted; ops alert always goes to `OPS_ALERT_EMAILS`.
- **Per-recipient isolation in both directions.** Either email failure logs but does not block the other; action returns normally.
- **No `TURNSTILE_ENABLED` flag / escape hatch.** One production-shaped code path; no risk of accidentally shipping a "captcha disabled" mode.
- **Generic user-facing error.** No info leakage about which failure mode fired; detailed cause in server logs / test assertions only.
- **Widget resets on any action error.** Token consumed at verify succeeds → widget must reset even on later failures, otherwise retries hit `timeout-or-duplicate`.

---

## 11. Manual smoke (must pass before merge)

Local-only — no integration env exists yet.

### 11.1 Happy path (verify + both emails delivered)

**Prerequisite env** (`.env.local`):

- `NEXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA` (the always-pass test key from `.env.local.example`).
- `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`.
- `OPS_ALERT_EMAILS=ops@bomy.my` (any test value; required for the ops alert to dispatch instead of skip-log).
- `EMAIL_DELIVERY_ENABLED=true SMTP_HOST=localhost SMTP_PORT=1025 SMTP_SECURE=false MAIL_FROM="BOMY <noreply@bomy.my>"` (Mailhog transport).
- Docker stack up (`docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d`).

**Steps:**

1. `pnpm dev` → navigate to `http://localhost:3000/seller/apply`.
2. Turnstile widget renders the test-mode visible checkbox.
3. Submit button stays disabled until the checkbox is clicked.
4. Click checkbox → callback fires, token populates → submit enables.
5. Submit the form with valid fields → success screen renders.
6. Mailhog UI (`http://localhost:8025`) shows **TWO** messages: applicant ack to the submitted email; ops alert to `OPS_ALERT_EMAILS`.

### 11.2 Verify-failure path

**Setup:** temporarily swap `TURNSTILE_SECRET_KEY` in `.env.local` to Cloudflare's always-fail test secret `2x0000000000000000000000000000000AA` (sitekey unchanged).

**Steps:**

1. Use a per-run unique applicant email (e.g. `manual-smoke-<timestamp>@example.com`).
2. Submit the form with valid fields.
3. Action returns the generic `"Verification failed. Please try the challenge again."` error.
4. Widget auto-resets (fresh checkbox state).
5. Verify NO row in `seller_inquiries` for the specific unique email (via `psql` or admin console), AND no message in Mailhog.

After the smoke, revert `TURNSTILE_SECRET_KEY` to the always-pass value.

### 11.3 Missing sitekey graceful path

**Setup:** unset `NEXT_PUBLIC_TURNSTILE_SITEKEY` in `.env.local`.

**Steps:**

1. `pnpm dev` → navigate to `/seller/apply`.
2. Page renders with the yellow "Form temporarily unavailable" banner.
3. Submit button is disabled.

Restore the sitekey afterwards.

### 11.4 Client navigation widget remount

**Steps:**

1. With dev server running, navigate to `/seller/apply` → widget renders.
2. Navigate to another route (`/`) via client-side link, then back to `/seller/apply` via client-side link.
3. Widget re-renders cleanly (no duplicate widget; `onReady` fires; container ref repopulates).

---

## 12. Next step

Invoke `superpowers:writing-plans` to produce the implementation plan for PR #37. The plan will sequence:

1. Toolchain prep: add `server-only` to `apps/web/package.json`; add `tests/stubs/server-only.ts`; wire the alias in `apps/web/vitest.config.ts`; add Turnstile env vars to both `.env.local.example` files.
2. `verifyTurnstile` helper (TDD): write unit tests first, then implementation.
3. Restore `sendApplicantAck` export (TDD): write the 2 template tests, then restore the template.
4. Server action change (TDD): write the 7 new action tests + update the existing 10 with `cf-turnstile-response`; then update `actions.ts` (`readFormString`, verify call, restored applicant ack dispatch, ops isolation).
5. Client widget integration: update `page.tsx` (window declaration, `next/script` + `onReady`, container ref, hidden input, reset effects, unmount cleanup).
6. Verify: `pnpm lint`, `pnpm typecheck`, scoped tests, full root tests.
7. Manual smoke (§11) on local Docker + Mailhog.
8. Push, open PR, await Bob review.

`/seller/apply` stays JS-required, gated by Turnstile, with the applicant ack restored. No production keys are issued by this PR — that's an operational step before public traffic.
