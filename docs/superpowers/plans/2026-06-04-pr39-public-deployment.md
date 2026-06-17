# PR #39 Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the code-side changes that PR #39 (public deployment of `apps/web` to `https://brandsofmalaysia.com`) needs before its operator-side runbook can be executed: a `paymentsEnabled()` helper that gates `/membership` + `/brands/[slug]/subscribe` CTAs while HitPay creds are unset, a secret-gated `/api/ops/db-identity` diagnostic route that proves the runtime DB role is `bomy_app`, and the full operator cutover runbook.

**Architecture:** All work lives in `apps/web` (Next.js 15 + React 19 + Drizzle + NextAuth v5). The helper is a pure env check; the CTA gating is server-component render-time + server-action `notFound()` guard (defence in depth); the diagnostic route is a `force-dynamic` GET handler that gates token-first and lazy-loads `makeDb()` only on authorized paths. No `@bomy/db`, `@bomy/hitpay`, or auth-wrapper code changes. No schema changes.

**Tech Stack:** Next.js 15 App Router (server components + route handlers), TypeScript 5.8, Drizzle ORM (`drizzle-orm`'s `sql` template + `execute()`), Vitest 2.1 with `vi.mock()` for unit isolation, `@bomy/db` workspace package.

---

## Pre-conditions before Task 1

These MUST be true before the first task runs:

1. Spec committed at `app/docs/superpowers/specs/2026-06-04-pr39-public-deployment-design.md` (commits `22bdcc1`, `e346b2b`, `aacfc03`, `7eab18c`). ✅
2. Branch is currently checked out (`git branch --show-current` returns `feat/public-deployment`).
3. `apps/web` builds + tests cleanly on the pre-PR-#39 baseline:
   - `pnpm --filter @bomy/web typecheck` → exit 0
   - `pnpm --filter @bomy/web lint` → exit 0
   - `pnpm --filter @bomy/web test --run` → exit 0 (85 passing / 133 DB-gated skipped as of PR #38 merge)
4. Existing files referenced in this plan exist at the cited paths:
   - `apps/web/src/app/(marketing)/membership/page.tsx`
   - `apps/web/src/app/(marketing)/membership/actions.ts`
   - `apps/web/src/app/brands/[slug]/subscribe/page.tsx`
   - `apps/web/src/app/brands/[slug]/subscribe/actions.ts`
   - `apps/web/tests/membership/actions.unit.test.ts`
   - `apps/web/tests/brand-subscription/actions.unit.test.ts`
   - `apps/web/.env.local.example`

If any pre-condition is missing, STOP and report which one.

---

## File Structure

| Path                                                     | Action      | Responsibility                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/payments-enabled.ts`                   | Create      | Pure server-only helper: `paymentsEnabled(): boolean` returns `true` iff `process.env["HITPAY_API_KEY"]` AND `process.env["HITPAY_API_URL"]` are both non-empty.                                                  |
| `apps/web/tests/lib/payments-enabled.test.ts`            | Create      | 6 unit cases. No DB needed.                                                                                                                                                                                       |
| `apps/web/src/app/(marketing)/membership/page.tsx`       | Modify      | Add `paymentsEnabled()` import + render-time gating: when `false`, replace the `{session ? <form> : <a>}` block with a single disabled-state element + soft copy.                                                 |
| `apps/web/src/app/(marketing)/membership/actions.ts`     | Modify      | Add `notFound` import + early-return guard `if (!paymentsEnabled()) notFound()` as the FIRST executable line of `joinMembership()`. Runs before `hitpayClient()` is ever constructed.                             |
| `apps/web/tests/membership/actions.unit.test.ts`         | Modify      | Add 1 case: `paymentsEnabled() === false` → `joinMembership()` throws `NOT_FOUND` AND `HitPayClient` constructor is NOT invoked.                                                                                  |
| `apps/web/src/app/brands/[slug]/subscribe/page.tsx`      | Modify      | Same gating pattern as membership page: compute `enabled = paymentsEnabled()` once, render the disabled-state element on each plan card when `!enabled`.                                                          |
| `apps/web/src/app/brands/[slug]/subscribe/actions.ts`    | Modify      | Add the same guard as membership: `if (!paymentsEnabled()) notFound()` as the FIRST executable line of `subscribeToBrand()`.                                                                                      |
| `apps/web/tests/brand-subscription/actions.unit.test.ts` | Modify      | Add 1 case: `paymentsEnabled() === false` → `subscribeToBrand()` throws `NOT_FOUND` AND `HitPayClient` constructor is NOT invoked.                                                                                |
| `apps/web/src/app/api/ops/db-identity/route.ts`          | Create      | Secret-gated diagnostic route. `export const dynamic = "force-dynamic"`. Auth-first ordering: env-check → header-match → ONLY THEN lazy `makeDb()` singleton. Missing/wrong returns empty-body 404.               |
| `apps/web/tests/api/ops/db-identity.test.ts`             | Create      | 4 cases including `vi.mock("@bomy/db")` spy asserting `makeDb` is NOT called on the 3 unauthorized paths.                                                                                                         |
| `apps/web/.env.local.example`                            | Modify      | Add `BOMY_OPS_DIAGNOSTIC_TOKEN=` section + a comment under `HITPAY_API_KEY=` explaining the `paymentsEnabled()` gating behaviour.                                                                                 |
| `docs/runbooks/public-deployment-cutover.md`             | Create      | Full operator runbook: pre-flight checklist, 19-step cutover sequence (mirrors spec §7), preview + production smoke checklists (mirrors spec §8), rollback procedures (mirrors spec §9), env-rotation procedures. |
| `vercel.json`                                            | Conditional | Only created in Task 4 if the default Vercel project-root build fails to resolve workspace packages from `apps/web`.                                                                                              |

---

## Task 1: paymentsEnabled() helper + membership + brand-subscribe CTA gating

This task maps 1:1 to spec §11 commit 1: `feat(web): add paymentsEnabled() helper + gate /membership and /brands/[slug]/subscribe CTAs`.

**Files:**

- Create: `apps/web/src/lib/payments-enabled.ts`
- Create: `apps/web/tests/lib/payments-enabled.test.ts`
- Modify: `apps/web/src/app/(marketing)/membership/page.tsx`
- Modify: `apps/web/src/app/(marketing)/membership/actions.ts`
- Modify: `apps/web/tests/membership/actions.unit.test.ts`
- Modify: `apps/web/src/app/brands/[slug]/subscribe/page.tsx`
- Modify: `apps/web/src/app/brands/[slug]/subscribe/actions.ts`
- Modify: `apps/web/tests/brand-subscription/actions.unit.test.ts`

### Sub-task 1A: paymentsEnabled() helper (TDD)

- [ ] **Step 1: Write the failing helper test**

Create `apps/web/tests/lib/payments-enabled.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { paymentsEnabled } from "@/lib/payments-enabled"

describe("paymentsEnabled()", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env["HITPAY_API_KEY"]
    delete process.env["HITPAY_API_URL"]
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns true when both HITPAY_API_KEY and HITPAY_API_URL are set", () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    expect(paymentsEnabled()).toBe(true)
  })

  it("returns false when HITPAY_API_KEY is unset", () => {
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when HITPAY_API_URL is unset", () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when HITPAY_API_KEY is the empty string", () => {
    process.env["HITPAY_API_KEY"] = ""
    process.env["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when HITPAY_API_URL is the empty string", () => {
    process.env["HITPAY_API_KEY"] = "test-key"
    process.env["HITPAY_API_URL"] = ""
    expect(paymentsEnabled()).toBe(false)
  })

  it("returns false when both are unset", () => {
    expect(paymentsEnabled()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```sh
pnpm --filter @bomy/web test payments-enabled.test.ts --run
```

Expected: FAIL with `Cannot find module '@/lib/payments-enabled'`.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/payments-enabled.ts` with:

```ts
/**
 * Single source of truth for "can we initiate a HitPay flow today?"
 * Server-only — relies on process.env that is not exposed to clients.
 *
 * Used by /membership and /brands/[slug]/subscribe page components to gate
 * payment CTAs, and by the corresponding server actions as a
 * defence-in-depth guard before any HitPayClient construction.
 *
 * When HitPay creds restoration lands, setting HITPAY_API_KEY and
 * HITPAY_API_URL in Vercel flips this back to true without any code change.
 */
export function paymentsEnabled(): boolean {
  const apiKey = process.env["HITPAY_API_KEY"]
  const apiUrl = process.env["HITPAY_API_URL"]
  return Boolean(apiKey && apiUrl)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```sh
pnpm --filter @bomy/web test payments-enabled.test.ts --run
```

Expected: PASS — 6 cases green.

### Sub-task 1B: Membership action guard (TDD)

- [ ] **Step 5: Add the failing guard test to membership actions.unit.test.ts**

Open `apps/web/tests/membership/actions.unit.test.ts`. Inside the existing top-level `describe(...)` block, append a new top-level `describe` block (after the existing one — keeps the existing compensation tests untouched):

```ts
describe("joinMembership — payments disabled guard (PR #39)", () => {
  beforeEach(() => {
    // Explicitly UNSET — overriding the outer beforeEach which sets them.
    delete process.env["HITPAY_API_KEY"]
    delete process.env["HITPAY_API_URL"]
    process.env["APP_URL"] = "http://localhost:3000"
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("calls notFound() and never constructs HitPayClient when payments are disabled", async () => {
    await expect(joinMembership()).rejects.toThrow("NOT_FOUND")
    expect(HitPayClient).not.toHaveBeenCalled()
  })
})
```

Note: this relies on the existing `vi.mock("@bomy/hitpay", () => ({ HitPayClient: vi.fn() }))` and the existing `vi.mock("next/navigation", ...)` mock that throws `NOT_FOUND` for `notFound()`. Both are already in the file.

But check — the existing `notFound` mock might not be present (only `redirect` is mocked in the existing file). If so, update the `vi.mock("next/navigation", ...)` block at the top of the file to:

```ts
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NOT_FOUND"), { name: "NotFoundError" })
  }),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { name: "RedirectError" })
  }),
}))
```

- [ ] **Step 6: Run the test to verify it fails**

```sh
pnpm --filter @bomy/web test membership/actions.unit.test.ts --run
```

Expected: FAIL — `joinMembership()` does NOT yet call `notFound()` when HITPAY env is unset. It will instead try to call `auth()` first, then `withAdmin()`, etc., and throw a different error (or succeed if mocks happen to align).

- [ ] **Step 7: Add the guard to joinMembership()**

Open `apps/web/src/app/(marketing)/membership/actions.ts`. Update the imports to include `notFound`:

```ts
import { notFound, redirect } from "next/navigation"
```

(The existing import is `import { redirect } from "next/navigation"`. Replace.)

Add the helper import alongside the existing imports:

```ts
import { paymentsEnabled } from "@/lib/payments-enabled"
```

Modify the `joinMembership` function so its FIRST executable line is the guard:

```ts
export async function joinMembership() {
  // PR #39 defence-in-depth guard: page-level CTA gating is primary; this
  // short-circuits direct invocation (stale page cache, manual curl, race)
  // BEFORE any HitPayClient construction or auth/DB work.
  if (!paymentsEnabled()) notFound()

  const session = await auth()
  // ...rest of the function unchanged
}
```

- [ ] **Step 8: Run the test to verify it passes**

```sh
pnpm --filter @bomy/web test membership/actions.unit.test.ts --run
```

Expected: PASS — both the new guard case AND every existing case in this file remain green. (If existing cases regress, the most likely cause is that the outer `beforeEach` no longer sets `HITPAY_API_KEY` correctly; double-check that the existing compensation tests' `beforeEach` still sets `HITPAY_API_KEY = "test-key"` and `HITPAY_API_URL = "https://api.sandbox.hit-pay.com"` so they pass the guard.)

### Sub-task 1C: Brand-subscribe action guard (TDD)

- [ ] **Step 9: Add the failing guard test to brand-subscription actions.unit.test.ts**

Open `apps/web/tests/brand-subscription/actions.unit.test.ts`. Append a new top-level `describe` block (same pattern as Sub-task 1B). The existing file already mocks `notFound`, so no mock changes needed:

```ts
describe("subscribeToBrand — payments disabled guard (PR #39)", () => {
  beforeEach(() => {
    delete process.env["HITPAY_API_KEY"]
    delete process.env["HITPAY_API_URL"]
    process.env["APP_URL"] = "http://localhost:3000"
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("calls notFound() and never constructs HitPayClient when payments are disabled", async () => {
    await expect(subscribeToBrand(PLAN_ID)).rejects.toThrow("NOT_FOUND")
    expect(HitPayClient).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 10: Run the test to verify it fails**

```sh
pnpm --filter @bomy/web test brand-subscription/actions.unit.test.ts --run
```

Expected: FAIL — same as Step 6 for membership.

- [ ] **Step 11: Add the guard to subscribeToBrand()**

Open `apps/web/src/app/brands/[slug]/subscribe/actions.ts`. The existing imports already include `notFound` from `next/navigation` — no import change there. Add the helper import:

```ts
import { paymentsEnabled } from "@/lib/payments-enabled"
```

Modify `subscribeToBrand` so its FIRST executable line is the guard:

```ts
// Bound via subscribeToBrand.bind(null, planId) on each plan card.
export async function subscribeToBrand(planId: string, _formData?: FormData) {
  // PR #39 defence-in-depth guard: page-level CTA gating is primary; this
  // short-circuits direct invocation BEFORE any HitPayClient construction
  // or auth/DB work.
  if (!paymentsEnabled()) notFound()

  const session = await auth()
  // ...rest unchanged
}
```

- [ ] **Step 12: Run the test to verify it passes**

```sh
pnpm --filter @bomy/web test brand-subscription/actions.unit.test.ts --run
```

Expected: PASS — both the new guard case AND every existing case remain green.

### Sub-task 1D: Membership page CTA gating

- [ ] **Step 13: Modify the membership page**

Open `apps/web/src/app/(marketing)/membership/page.tsx`. Add the helper import alongside existing imports:

```ts
import { paymentsEnabled } from "@/lib/payments-enabled"
```

Inside `MembershipPage()`, after the existing `priceSen` + `priceDisplay` lines, compute the flag:

```ts
const enabled = paymentsEnabled()
```

Locate the existing `{session ? <form>...</form> : <a>...</a>}` block (around lines 87–103 of the current file). Wrap it so the gated-state element renders when `!enabled`:

```tsx
{
  !enabled ? (
    <div
      role="status"
      className="w-full rounded-xl bg-gray-200 px-6 py-3 text-sm font-semibold text-gray-500 text-center cursor-not-allowed"
    >
      Memberships will reopen soon
    </div>
  ) : session ? (
    <form action={joinMembership}>
      <button
        type="submit"
        className="w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors"
      >
        Join now — {priceDisplay}
      </button>
    </form>
  ) : (
    <a
      href="/auth/sign-in?callbackUrl=/membership"
      className="block w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700 transition-colors text-center"
    >
      Sign in to join — {priceDisplay}
    </a>
  )
}
```

- [ ] **Step 14: Manual smoke (no automated test for page-level gating)**

Verify the gated state renders by starting `apps/web` dev with HITPAY envs unset:

```sh
HITPAY_API_KEY="" HITPAY_API_URL="" pnpm --filter @bomy/web dev
```

Open `http://localhost:3000/membership` — expect the gray "Memberships will reopen soon" pill in place of the "Join now" / "Sign in to join" button.

Then verify the enabled state still renders correctly:

```sh
HITPAY_API_KEY="dev-key" HITPAY_API_URL="https://api.sandbox.hit-pay.com" pnpm --filter @bomy/web dev
```

Open `http://localhost:3000/membership` — expect the amber "Sign in to join — RM75/yr" link (or the "Join now" button if signed in).

(Re-run only if `pnpm dev` is not already running; otherwise the env change requires a restart.)

### Sub-task 1E: Brand-subscribe page CTA gating

- [ ] **Step 15: Modify the brand-subscribe page**

Open `apps/web/src/app/brands/[slug]/subscribe/page.tsx`. Add the helper import:

```ts
import { paymentsEnabled } from "@/lib/payments-enabled"
```

Inside `BrandSubscribePage()`, compute the flag once before the `return`:

```ts
const enabled = paymentsEnabled()
```

Inside the `plans.map((plan) => { ... })` callback, locate the existing `{session ? <form>... : <a>...}` block (around lines 100–118 of the current file). Wrap it the same way as Sub-task 1D:

```tsx
{
  !enabled ? (
    <div
      role="status"
      className="w-full rounded-xl bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 text-center cursor-not-allowed"
    >
      Subscriptions will reopen soon
    </div>
  ) : session ? (
    <form action={action}>
      <button
        type="submit"
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
      >
        Subscribe — {priceDisplay}
      </button>
    </form>
  ) : (
    <a
      href={`/auth/sign-in?callbackUrl=/brands/${slug}/subscribe`}
      className="block w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800 transition-colors text-center"
    >
      Sign in to subscribe
    </a>
  )
}
```

- [ ] **Step 16: Manual smoke (optional — requires seeded brand subscription plan)**

If `pnpm --filter @bomy/db migrate` + a seeded store with at least one brand subscription plan already exists locally, navigate to `http://localhost:3000/brands/<seeded-slug>/subscribe` and confirm the gated state. If no seed exists, skip this step — the action-level guard test (Step 12) is the hard gate; deployed smoke is documented as opportunistic in spec §8.

### Sub-task 1F: Verify full web suite + commit

- [ ] **Step 17: Run full web test suite + typecheck + lint**

```sh
pnpm --filter @bomy/web test --run
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: all green. Test count should be 85 baseline + ~8 new (6 paymentsEnabled cases + 1 membership guard + 1 brand-subscribe guard) = ~93 passing.

- [ ] **Step 18: Commit**

```sh
git add \
  apps/web/src/lib/payments-enabled.ts \
  apps/web/tests/lib/payments-enabled.test.ts \
  apps/web/src/app/\(marketing\)/membership/page.tsx \
  apps/web/src/app/\(marketing\)/membership/actions.ts \
  apps/web/tests/membership/actions.unit.test.ts \
  apps/web/src/app/brands/\[slug\]/subscribe/page.tsx \
  apps/web/src/app/brands/\[slug\]/subscribe/actions.ts \
  apps/web/tests/brand-subscription/actions.unit.test.ts

git commit -m "$(cat <<'EOF'
feat(web): add paymentsEnabled() helper + gate /membership and /brands/[slug]/subscribe CTAs

paymentsEnabled() is a pure server-only env check that returns true iff
HITPAY_API_KEY and HITPAY_API_URL are both non-empty. Single source of
truth for "can we initiate a HitPay flow today?".

/membership and /brands/[slug]/subscribe pages now render a gated state
(disabled pill + "Memberships/Subscriptions will reopen soon") when the
helper returns false. joinMembership() and subscribeToBrand() server
actions short-circuit with notFound() at their first executable line
when the helper returns false — defence-in-depth against stale page
cache, manual curl, or any path where the CTA gating is bypassed.

Tests:
- 6 helper unit cases (both env states + blank-string edge cases).
- 1 membership-action guard case: notFound() thrown + HitPayClient
  constructor never invoked via vi.fn() spy.
- 1 brand-subscribe-action guard case: same shape.

No changes to @bomy/db, @bomy/hitpay, or auth wrappers. When HitPay
restoration lands, setting HITPAY_API_KEY + HITPAY_API_URL in Vercel
flips the gating off with no code change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Secret-gated DB identity diagnostic route + .env.local.example

This task maps 1:1 to spec §11 commit 2: `feat(web): add secret-gated DB identity diagnostic route`.

**Files:**

- Create: `apps/web/src/app/api/ops/db-identity/route.ts`
- Create: `apps/web/tests/api/ops/db-identity.test.ts`
- Modify: `apps/web/.env.local.example`

### Sub-task 2A: Diagnostic route (TDD)

- [ ] **Step 1: Write the failing route test**

Create `apps/web/tests/api/ops/db-identity.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

vi.mock("@bomy/db", () => ({
  makeDb: vi.fn(),
}))

import { makeDb } from "@bomy/db"
import { GET } from "../../../src/app/api/ops/db-identity/route"

const TOKEN = "test-token-abc123"

describe("/api/ops/db-identity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"]
  })

  afterEach(() => {
    delete process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"]
  })

  it("(a) returns 404 with empty body when BOMY_OPS_DIAGNOSTIC_TOKEN is unset — and never invokes makeDb", async () => {
    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": "anything" },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(b) returns 404 with empty body when header is missing — and never invokes makeDb", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    const req = new Request("http://localhost/api/ops/db-identity")
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(c) returns 404 with empty body when header mismatches — and never invokes makeDb", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": "wrong-token" },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
    expect(makeDb).not.toHaveBeenCalled()
  })

  it("(d) returns 200 with { currentUser } when token matches", async () => {
    process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"] = TOKEN
    const mockExecute = vi.fn().mockResolvedValue({ rows: [{ user: "bomy_app" }] })
    ;(makeDb as unknown as Mock).mockReturnValue({
      db: { execute: mockExecute },
      close: vi.fn(),
    })

    const req = new Request("http://localhost/api/ops/db-identity", {
      headers: { "x-bomy-ops-token": TOKEN },
    })
    const res = await GET(req as unknown as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ currentUser: "bomy_app" })
    expect(makeDb).toHaveBeenCalledTimes(1)
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```sh
pnpm --filter @bomy/web test db-identity.test.ts --run
```

Expected: FAIL with `Cannot find module '../../../src/app/api/ops/db-identity/route'`.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/ops/db-identity/route.ts` with:

```ts
import { sql } from "drizzle-orm"
import type { NextRequest } from "next/server"

import { makeDb } from "@bomy/db"

// Never cached, never statically optimized. The route exists to prove the
// LIVE runtime DB connection identity — caching would defeat the purpose.
export const dynamic = "force-dynamic"

// Lazy singleton — initialized ONLY after the token check passes, so a
// missing or bad DATABASE_URL never turns an unauthorized request into
// a 500. The 404 contract holds even when the DB env is misconfigured.
let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export async function GET(req: NextRequest): Promise<Response> {
  // (1) env-check FIRST — if the gating env is unset the route is disabled
  const expected = process.env["BOMY_OPS_DIAGNOSTIC_TOKEN"]
  if (!expected) return new Response(null, { status: 404 })

  // (2) header-match BEFORE any DB work
  const provided = req.headers.get("x-bomy-ops-token")
  if (!provided || provided !== expected) return new Response(null, { status: 404 })

  // (3) ONLY AFTER auth — lazy DB + identity query
  const result = await getDb().execute(sql`SELECT current_user::text AS "user"`)
  const row = (result.rows as Array<{ user: string }>)[0]
  return Response.json({ currentUser: row?.user ?? "" })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```sh
pnpm --filter @bomy/web test db-identity.test.ts --run
```

Expected: PASS — 4 cases green, including the `makeDb` non-invocation assertion on cases (a/b/c).

- [ ] **Step 5: Verify typecheck + lint**

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

### Sub-task 2B: .env.local.example updates

- [ ] **Step 6: Modify .env.local.example**

Open `apps/web/.env.local.example`. Add a new section at the bottom (after the existing Turnstile section):

```
# ── Ops diagnostics (Stage 5+ PR #39) ────────────────────────────────────────
# Gates /api/ops/db-identity, a secret-token route that returns the current
# Postgres role for runtime DB-identity proof. Unset = route disabled (404).
# Set to a one-time random value for prod cutover smoke; rotate/unset after.
# Generate: openssl rand -hex 32
BOMY_OPS_DIAGNOSTIC_TOKEN=
```

Also add a comment line directly above the existing `HITPAY_API_KEY=` line (lookup target: `# API key from HitPay Dashboard → Settings → API Keys`). Replace that line with:

```
# API key from HitPay Dashboard → Settings → API Keys.
# PR #39: when this env (or HITPAY_API_URL) is unset, paymentsEnabled() returns
# false and the /membership + /brands/[slug]/subscribe CTAs render disabled.
```

- [ ] **Step 7: Commit Task 2**

```sh
git add \
  apps/web/src/app/api/ops/db-identity/route.ts \
  apps/web/tests/api/ops/db-identity.test.ts \
  apps/web/.env.local.example

git commit -m "$(cat <<'EOF'
feat(web): add secret-gated DB identity diagnostic route

GET /api/ops/db-identity returns { currentUser: "<role>" } when the
caller supplies x-bomy-ops-token matching BOMY_OPS_DIAGNOSTIC_TOKEN
env. Any other state — env unset, header missing, header mismatch —
returns an empty-body 404 with no role/route/env details leaked.

Auth-first ordering: env-check → header-match → lazy makeDb() singleton.
A missing or bad DATABASE_URL therefore never turns an unauthorized
request into a 500 — the 404 contract holds even when DB env is broken.

export const dynamic = "force-dynamic" prevents Next from caching or
statically optimizing the route; the LIVE runtime identity is the whole
point.

Used by the PR #39 cutover runbook as a hard smoke gate proving the
Vercel runtime DATABASE_URL points to the bomy_app role (not the Neon
owner role injected by the Marketplace default).

Tests: 4 cases via vi.mock("@bomy/db") spy. Cases (a/b/c) additionally
assert makeDb is NOT invoked on unauthorized paths.

.env.local.example: new BOMY_OPS_DIAGNOSTIC_TOKEN section + a comment
under HITPAY_API_KEY noting the paymentsEnabled() gating behaviour
from PR #39 commit 1.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Public deployment cutover runbook

This task maps 1:1 to spec §11 commit 4: `docs(runbooks): public deployment cutover for brandsofmalaysia.com`.

**Files:**

- Create: `docs/runbooks/public-deployment-cutover.md`

The content is a faithful operator translation of spec §1 (locked decisions), §5 (env contract), §7 (cutover sequence — all 19 steps), §8 (smoke checklists — preview + production), and §9 (rollback procedures). No new policy decisions in this task — every value comes from the spec.

- [ ] **Step 1: Create the runbook with the full content**

Create `docs/runbooks/public-deployment-cutover.md` with the structure below. Each `# Section` is a sub-section of the runbook; copy concrete values from the spec verbatim.

````markdown
# Public deployment cutover — apps/web to brandsofmalaysia.com

> **Operator runbook for PR #39.** This document is the executable counterpart to `docs/superpowers/specs/2026-06-04-pr39-public-deployment-design.md`. Every value here comes from the spec — when the spec changes, refresh this runbook.

## 1. Pre-flight checklist

Before starting:

- [ ] `brandsofmalaysia.com` is registered AND you have access to the registrar's DNS panel.
- [ ] Existing mail DNS records on `brandsofmalaysia.com` are noted (MX, SPF, DKIM, DMARC) — see "DNS preservation" below.
- [ ] Cloudflare account exists (free tier is sufficient for Turnstile).
- [ ] Google Cloud Console + Meta Developers accounts ready (you can register OAuth apps).
- [ ] Vercel account ready (personal or team); GitHub repo access ready to grant.
- [ ] `gh auth status` shows you authenticated against the `BOMY-Inflow-Vision` org.
- [ ] Local repo on `main` synced to origin; PR #39 branch ready to push.

## 2. Cutover sequence (19 steps; halt + ask before any non-trivial deviation)

> **Crit risk #1 (the one that hides):** Vercel's Marketplace integration injects `DATABASE_URL` as the OWNER-role POOLED connection string. Both are wrong for our runtime. You MUST override `DATABASE_URL` in step 7 with the `bomy_app` direct/unpooled connection string. The smoke gate in step 11 catches this if you forget.

> **Crit risk #2:** Migration `0002_store_and_inquiries.sql` has an unconditional `GRANT ... TO bomy_app`. If you run migrations before creating the `bomy_app` role, the migration FAILS. Steps 2 → 3 are ordered for this reason. Do NOT reorder them.

### Step 1 — Provision Neon via Vercel Marketplace

- Vercel dashboard → Marketplace → Neon → Install.
- Choose Vercel-managed integration.
- Project name: `bomy-review`.
- Region: AWS ap-southeast-1 (Singapore).
- Capture both connection strings Neon shows:
  - `DATABASE_URL` (pooled — DO NOT use for runtime)
  - `DATABASE_URL_UNPOOLED` (direct — owner role; this is what migrations need)

### Step 2 — Create the bomy_app role on Neon

- Open Neon SQL console connected as the owner role.
- Run:

  ```sql
  CREATE ROLE bomy_app LOGIN PASSWORD '<generated-with-openssl-rand-base64-24>' NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOBYPASSRLS;
  GRANT CONNECT ON DATABASE <neon-db-name> TO bomy_app;
  ```
````

- Record `<generated-password>` in a secure note (you need it for step 5).

### Step 3 — Apply migrations from operator shell

> Operator shell only. Do NOT run migrations from Vercel build hooks.

```sh
DATABASE_URL=<owner-direct-unpooled-from-step-1> \
  pnpm --filter @bomy/db migrate
```

Expected: all migrations apply cleanly. If migration `0002` fails on `GRANT ... TO bomy_app`, abort — step 2 didn't complete; create the role and retry.

### Step 4 — Post-migration grants safety pass

Run via Neon SQL console (mirrors `.github/workflows/ci.yml` test job):

```sql
GRANT USAGE ON SCHEMA public TO bomy_app;
GRANT USAGE ON SCHEMA app TO bomy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bomy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bomy_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO bomy_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bomy_app;
```

### Step 5 — Construct bomy_app direct/unpooled connection string

Take the `DATABASE_URL_UNPOOLED` from step 1 and substitute the role + password:

```
postgresql://bomy_app:<password-from-step-2>@<host-from-DATABASE_URL_UNPOOLED>/<db-name-from-DATABASE_URL_UNPOOLED>?sslmode=require
```

Verify with a quick connect:

```sh
psql "<bomy_app-direct-unpooled-string>" -c "SELECT current_user;"
```

Expected output:

```
 current_user
--------------
 bomy_app
```

If you see `bomy` or any other role, the connection string is wrong; do not proceed.

### Step 6 — Create the Vercel project

- Vercel dashboard → Add New Project → Import from GitHub.
- Repo: `BOMY-Inflow-Vision/bomy-app`.
- Project name: `bomy-web`.
- Root Directory: `apps/web`.
- Framework Preset: Next.js (auto-detected).
- Install Command + Build Command + Output Directory: leave at defaults.

**If the first preview build fails to resolve workspace packages from `apps/web`** (look for errors like "Cannot find module '@bomy/db'" in the build log): switch to the fallback — see [Task 4 of the PR #39 plan](app/docs/superpowers/plans/2026-06-04-pr39-public-deployment.md) to add a `vercel.json` with explicit commands. Otherwise continue.

### Step 7 — Set Vercel envs

> Production scope unless noted.

Required envs (from spec §5):

| Var                                         | Value source                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | **bomy_app direct/unpooled string from step 5** (NOT the Marketplace-default — override it) |
| `DATABASE_APP_URL`                          | Same as `DATABASE_URL` (forward-compat)                                                     |
| `BOMY_RLS_READY`                            | `1`                                                                                         |
| `AUTH_SECRET`                               | `openssl rand -base64 32`                                                                   |
| `NEXTAUTH_URL`                              | `https://brandsofmalaysia.com`                                                              |
| `APP_URL`                                   | `https://brandsofmalaysia.com`                                                              |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`     | From Google Cloud Console (step 8)                                                          |
| `AUTH_FACEBOOK_ID` / `AUTH_FACEBOOK_SECRET` | From Meta Developers (step 8)                                                               |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY`             | Real brandsofmalaysia.com Turnstile site key (step 9)                                       |
| `TURNSTILE_SECRET_KEY`                      | Real brandsofmalaysia.com Turnstile secret key (step 9)                                     |
| `BOMY_OPS_DIAGNOSTIC_TOKEN`                 | `openssl rand -hex 32`                                                                      |
| `NEXT_PUBLIC_DEFAULT_LOCALE`                | `en`                                                                                        |

Preview scope (Turnstile only diverges from Production):

| Var                             | Value                                                                   |
| ------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | `1x00000000000000000000AA` (Cloudflare always-pass test key)            |
| `TURNSTILE_SECRET_KEY`          | `1x0000000000000000000000000000000AA` (Cloudflare always-pass test key) |

All other Preview envs mirror Production. Required because the prod Turnstile site is hostname-bound to `brandsofmalaysia.com` and would not validate on `*.vercel.app` preview URLs.

Intentionally unset (in both Production AND Preview):

- `HITPAY_API_KEY`, `HITPAY_API_URL`, `HITPAY_SALT`, `HITPAY_WEBHOOK_URL` — no HitPay creds. With these unset, `paymentsEnabled()` returns false and the `/membership` + `/brands/[slug]/subscribe` CTAs render disabled.
- `NEXT_PUBLIC_API_URL` — `apps/api` not deployed; unset (NOT `localhost`).
- `MAILER_*`, SMTP host/port/user/pass, `OPS_ALERT_EMAILS`, `ADMIN_URL` — mail deferred to PR #40+; `@bomy/mailer` skips silently.

Do NOT set `NODE_ENV` manually; Vercel sets it to `production` automatically.

### Step 8 — Register OAuth callbacks

**Google Cloud Console:**

- OAuth 2.0 Client → add to authorized JavaScript origins: `https://brandsofmalaysia.com`
- OAuth 2.0 Client → add to authorized redirect URIs: `https://brandsofmalaysia.com/api/auth/callback/google`
- Copy Client ID + Client Secret into Vercel envs `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` (step 7).

**Meta Developers:**

- App → Facebook Login → Settings → Valid OAuth Redirect URIs: add `https://brandsofmalaysia.com/api/auth/callback/facebook`
- Copy App ID + App Secret into Vercel envs `AUTH_FACEBOOK_ID` + `AUTH_FACEBOOK_SECRET` (step 7).
- If Meta is awaiting app review and the production sign-in won't work yet, document this in the PR body — production smoke (step 17) will mark the Meta sign-in check as "documented gap, not a merge blocker."

### Step 9 — Register Cloudflare Turnstile site for brandsofmalaysia.com

- Cloudflare dashboard → Turnstile → Add Site.
- Hostnames: `brandsofmalaysia.com` (and `www.brandsofmalaysia.com` if it serves before the redirect).
- Widget mode: Managed.
- Copy Site Key + Secret Key into Vercel Production envs `NEXT_PUBLIC_TURNSTILE_SITEKEY` + `TURNSTILE_SECRET_KEY` (step 7).
- Do NOT add `*.vercel.app` to the prod site — Preview uses Cloudflare always-pass test keys instead (already set in step 7).

### Step 10 — Push the PR #39 branch

```sh
git push -u origin feat/public-deployment
```

Vercel auto-builds a preview deployment at `https://bomy-web-<hash>-<scope>.vercel.app`.

### Step 11 — Smoke the preview

> All checks are hard gates. ANY red → abort cutover and fix.

Preview URL: copy from Vercel dashboard → Deployments → most recent.

- [ ] Build log shows `@bomy/db`, `@bomy/mailer`, `@bomy/hitpay` resolved from workspace (not from a published registry).
- [ ] **Runtime DB role identity** — `curl -H "x-bomy-ops-token: <BOMY_OPS_DIAGNOSTIC_TOKEN>" https://<preview-url>/api/ops/db-identity` returns `{"currentUser":"bomy_app"}`. If it returns the owner role or 404, stop and fix env.
- [ ] `/terms`, `/privacy`, `/refund`, `/shipping`, `/contact` all return 200.
- [ ] `/` returns 200; Footer visible.
- [ ] `/products` returns 200 (sparse catalog is acceptable — PR #40 territory).
- [ ] `/cart` returns 200 (empty-cart UI).
- [ ] `/seller/apply` renders the Turnstile widget (auto-passes via the test key — proves wire-up).
- [ ] `/membership` renders the gated state: gray "Memberships will reopen soon" pill in place of the "Join now" / "Sign in to join" button.
- [ ] `/brands/[slug]/subscribe` gating verified by unit + integration tests (Task 1, Step 17). Deployed smoke is opportunistic — if any seeded `/brands/<slug>/subscribe` URL exists, smoke it; otherwise mark N/A.
- [ ] `rg "[PLACEHOLDER:" <(curl https://<preview-url>/terms)` returns nothing. Repeat for /privacy /refund /shipping /contact.
- [ ] `rg -i "hitpay" <(curl https://<preview-url>/membership)` returns nothing user-visible. Repeat for /brands/<slug>/subscribe if seeded.
- [ ] Vercel dashboard → Project → Logs → Runtime/Function tab during the smoke window: NO `MissingSecret` from NextAuth middleware.

### Step 12 — Attach the domain

- Vercel project → Settings → Domains → Add: `brandsofmalaysia.com` (set as Production primary).
- Add: `www.brandsofmalaysia.com` (configure as 308-redirect to `brandsofmalaysia.com`).

### Step 13 — Configure DNS at the registrar

- Apex `@` `A` → `76.76.21.21` (Vercel anycast).
- `www` `CNAME` → exact value from `vercel domains inspect brandsofmalaysia.com` (project-specific).

**DNS preservation — preserve these from the registrar's current zone:**

- `MX` records (mail delivery)
- `SPF` (TXT) record
- `DKIM` (TXT) records
- `DMARC` (TXT) record

`contact@brandsofmalaysia.com` is publicly referenced from PR #38; breaking inbound mail is worse than a slower DNS setup. Do NOT delegate the brandsofmalaysia.com nameservers to Vercel unless these mail records are migrated to Vercel's DNS first.

### Step 14 — Bob R0 review

Open the PR; tag Bob. Bob checks the 6 review points from spec §11:

1. DB role contract — runtime `DATABASE_URL` is `bomy_app` direct/unpooled.
2. Migration order — `bomy_app` role created before migrations.
3. No code-level changes to `@bomy/db` or auth wrappers.
4. Payment-CTA gating — `paymentsEnabled()` covers both pages + both action guards.
5. No public HitPay processor claim.
6. Diagnostic route security — `dynamic = "force-dynamic"`, token-gated, empty-body 404, `vi.mock` non-invocation spy.

### Step 15 — Charlie's "Merge now"

`gh pr merge <PR-number> --squash --subject "feat(web): public deployment to brandsofmalaysia.com (#39)"`

Vercel auto-deploys main → Production.

### Step 16 — Wait DNS propagation

5–60 min depending on registrar TTLs. Verify with:

```sh
dig brandsofmalaysia.com A +short
dig www.brandsofmalaysia.com CNAME +short
```

When `brandsofmalaysia.com` resolves to a Vercel IP (in the `76.76.x.x` range) and `www.brandsofmalaysia.com` resolves to the Vercel CNAME target, DNS is live.

### Step 17 — Smoke production at https://brandsofmalaysia.com

Re-run all preview-smoke checks at `https://brandsofmalaysia.com`. Additionally:

- [ ] `https://www.brandsofmalaysia.com` 308-redirects to `https://brandsofmalaysia.com`.
- [ ] `/api/ops/db-identity` with correct token returns `{"currentUser":"bomy_app"}`.
- [ ] Google sign-in round-trip succeeds; creates a NextAuth DB session row in Neon (verify via `SELECT count(*) FROM sessions;` increment).
- [ ] Meta sign-in round-trip succeeds OR documented gap if Meta approval lags.
- [ ] `/seller/apply` end-to-end: real Turnstile challenge completes; DB row appears in `seller_inquiries`; action returns success. Applicant ack + ops alert email DO NOT send (expected; mailer skipped per spec §3 mail-deferred).
- [ ] **Real Turnstile, not always-pass test keys** — `/seller/apply` must complete a genuine challenge before validating server-side. If the widget renders empty or fails to validate, that's a hard gate failure; check the Cloudflare site config.
- [ ] `platform_config.checkout_enabled` = `false` confirmed via Neon SQL console.

### Step 18 — Post-merge bookkeeping

- [ ] `app/log/2026-MM-DD_PR39_public-deployment.md` log written (per `feedback_log_cadence.md`).
- [ ] `app/.andy/handoff.md` refreshed: HEAD updated to the squash commit; PR #39 marked merged in §4; §5 backlog adds the runbook outcome + PR #40 forward pointer.
- [ ] `project_pr39_complete.md` memory saved + `MEMORY.md` index updated.
- [ ] `project_hitpay_creds_blocker.md` updated: "PR #39 shipped the public deployment; HitPay reviewer can now browse the live site. Blocker remains pending PR #41 HitPay submission."

### Step 19 — Rotate or unset BOMY_OPS_DIAGNOSTIC_TOKEN

After production smoke is green AND you no longer need the diagnostic route active:

- Vercel project → Settings → Environment Variables → `BOMY_OPS_DIAGNOSTIC_TOKEN` → either delete (route 404s with no env set) or set to a new random value.
- Trigger a redeploy so the new env takes effect.

## 3. Rollback procedures

> Trigger conditions: any hard-gate smoke failure; 5xx rate > 1% in first hour post-merge; sign-in callback completely broken; `/api/ops/db-identity` returns owner role instead of `bomy_app`.

Escalating procedures (try fast first):

### A — Code rollback (fast, <30 s)

Vercel dashboard → Deployments → previous green production deploy → "Promote to Production." Reverts code without touching DNS or DB. Use for any code-level defect.

### B — Env rollback

If the env is wrong (e.g., owner-role DB URL): Vercel project → Settings → Environment Variables → fix → trigger redeploy. No code change.

### C — DNS rollback (slow, 5–60 min)

Vercel project → Domains → remove `brandsofmalaysia.com`. Restore previous A record at the registrar. Use only if Vercel itself is unreachable or the deployment is unrecoverable.

### D — DB rollback (last resort)

Neon dashboard → Branches → Point-in-time-restore to a timestamp before the failed migration. PR #39's migration step is forward-only; if a migration breaks production, restore + investigate offline.

### E — Diagnostic route disable

Unset `BOMY_OPS_DIAGNOSTIC_TOKEN` in Vercel envs → redeploy → route 404s.

## 4. Env rotation procedures

- **`AUTH_SECRET`:** Rotating logs out all current sessions. Generate new with `openssl rand -base64 32`; update Vercel; redeploy. Communicate the session-loss expectation if applicable.
- **`BOMY_OPS_DIAGNOSTIC_TOKEN`:** Rotate freely; no user impact. Generate with `openssl rand -hex 32`.
- **OAuth secrets:** Rotate at provider (Google Cloud Console / Meta Developers) → update Vercel envs → redeploy. Rotation doesn't log users out (DB sessions persist), but in-flight callbacks during the rotation window may fail.
- **Turnstile secret:** Rotate at Cloudflare → update Vercel envs → redeploy. /seller/apply submissions in-flight during rotation may fail.
- **DB credentials:** Rotate the `bomy_app` password at Neon → update Vercel `DATABASE_URL` + `DATABASE_APP_URL` → redeploy. Brief connection blip expected.
- **HitPay keys (future):** When HitPay restoration lands, set `HITPAY_API_KEY` + `HITPAY_API_URL` + `HITPAY_SALT` + `HITPAY_WEBHOOK_URL` in Vercel → redeploy. `paymentsEnabled()` flips to `true` automatically; CTAs reactivate without code change.

## 5. Reference

- Spec: `app/docs/superpowers/specs/2026-06-04-pr39-public-deployment-design.md`
- Plan: `app/docs/superpowers/plans/2026-06-04-pr39-public-deployment.md`
- Predecessor: `app/docs/runbooks/checkout-enabled-flip.md` (PR #36)
- HitPay creds blocker: `[[project-hitpay-creds-blocker]]` (auto-memory)
- PR #38 (content surface): merged 2026-06-02 at squash `a9d8fee`
- Cloudflare Turnstile test keys reference: https://developers.cloudflare.com/turnstile/troubleshooting/testing/

````

- [ ] **Step 2: Verify the runbook renders cleanly (no broken markdown)**

```sh
pnpm prettier --check docs/runbooks/public-deployment-cutover.md
````

If prettier reports issues, run `pnpm prettier --write docs/runbooks/public-deployment-cutover.md` and re-verify.

- [ ] **Step 3: Commit Task 3**

```sh
git add docs/runbooks/public-deployment-cutover.md

git commit -m "$(cat <<'EOF'
docs(runbooks): public deployment cutover for brandsofmalaysia.com

Operator runbook for PR #39 — full 19-step cutover sequence translated
from spec §7, preview + production smoke checklists from §8, rollback
procedures from §9, env-rotation guidance, and the two critical-risk
callouts (Marketplace DATABASE_URL override + migration-vs-role
ordering) at the top.

Mirrors the docs/runbooks/ pattern established by PR #36 (checkout-
enabled-flip.md). No new policy decisions; every value comes from the
spec.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 (CONDITIONAL): vercel.json fallback for monorepo build

**Only execute this task if the first Vercel preview build (Task 3 runbook step 11) fails to resolve workspace packages from the `apps/web` Root Directory.** Symptoms: build log shows errors like "Cannot find module '@bomy/db'" or "@bomy/mailer not found".

If the default-path build succeeds, SKIP this task entirely.

**Files:**

- Create: `vercel.json` (at the REPO ROOT, not under `apps/web`)

### Sub-task 4A: Switch Vercel project root + add vercel.json

- [ ] **Step 1: Switch Vercel project Root Directory**

- Vercel project → Settings → General → Root Directory → change from `apps/web` to `.` (repo root).

- [ ] **Step 2: Create vercel.json**

Create `vercel.json` at repo root with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm --filter @bomy/web build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs"
}
```

- [ ] **Step 3: Trigger a new preview build**

Push a no-op commit OR redeploy from the Vercel dashboard. Verify the new build resolves workspace packages and completes successfully.

- [ ] **Step 4: Commit Task 4**

```sh
git add vercel.json

git commit -m "$(cat <<'EOF'
chore(web): add vercel.json for monorepo root build

Fallback per spec §6 + §7 step 6: the default Vercel project-root
build (Root Directory = apps/web) failed to resolve workspace packages
(@bomy/db, @bomy/mailer, @bomy/hitpay). Switching Vercel project root
to the repo root + adding explicit installCommand + buildCommand +
outputDirectory restores resolution via the root pnpm-lock.yaml.

This commit is conditional in the PR #39 plan; included only because
the default-path build failed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Post-task verification (after all tasks complete)

- [ ] `pnpm --filter @bomy/web test --run` exits 0 (test count ~93 = 85 baseline + 8 new from Task 1 + 4 new from Task 2).
- [ ] `pnpm --filter @bomy/web typecheck` exits 0.
- [ ] `pnpm --filter @bomy/web lint` exits 0.
- [ ] All planned files exist at their cited paths (`apps/web/src/lib/payments-enabled.ts`, etc.).
- [ ] `git log --oneline main..HEAD` shows the expected commits:
  - 3 spec commits (already on branch: `22bdcc1`, `e346b2b`, `aacfc03`, `7eab18c`)
  - 1 Task 1 commit
  - 1 Task 2 commit
  - 1 Task 3 commit
  - (Optional) 1 Task 4 commit
- [ ] Operator now picks up the runbook (`docs/runbooks/public-deployment-cutover.md`) to execute the Vercel + Neon + Cloudflare + OAuth + DNS work. Code-side implementation is complete.
