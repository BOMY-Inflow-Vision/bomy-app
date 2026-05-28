# PR #36 — `checkout_enabled` flip runbook + `platform-config-flip` ops script

**Status:** Design locked
**Date:** 2026-05-27
**Author model:** Opus 4.7
**Brainstorm partner:** Charlie

---

## Addendum — Bob R1 review on implementation (2026-05-28)

Bob flagged three issues on the implementation:

- **F1 (High) — SYSTEM_ACTOR slips through the role check.** SYSTEM_ACTOR (`00000000-0000-0000-0000-000000000001`) is seeded as `bomy_admin` per `0008_admin_bypass_audit.sql:25-28`, so the role-only check let it flip the flag — violating real-human attribution. Fixed in `runPlatformConfigFlip` with an explicit UUID reject before the actor lookup; new integration test asserts the rejection.

- **F2 (High) — runbook was circular.** The pre-flip hard gate included E2E checkout and the visual `/checkout` totals walkthrough, but `/checkout` is paused when the flag is `false`. **Resolution:** pre-flip hard gate now covers only infrastructure-verifiable-without-flip checks (5 checks: app running, webhook auth, synthetic paid webhook, amount-mismatch synthetic, totals sanity via priceCheckoutPreview/`/cart`). A new §4 Post-flip E2E verification runs immediately after the flip; failure there is rollback trigger #1. §5-§9 renumbered.

- **F3 (Medium) — parseArgs accepted flag-shaped values + silently overwrote duplicates.** `--reason --foo` set reason to `'--foo'`; `--key a --key b` silently kept `'b'`. Fixed to reject any value starting with `--` AND to reject any duplicate flag. Two new unit tests.

- **F4 (Low) — integration-test gate was missing DATABASE_URL.** Fixed.

The §8 runbook structure in this spec is updated to match the new shape (5 pre-flip checks + new §4 post-flip E2E + renumbered §5-§9).

---

## 1. Goal

Unblock buyer checkout in **local** (and provide a locked operational shape for future **staging**) by establishing a single canonical procedure for flipping `platform_config.checkout_enabled`. The flip must be:

- **Auditable** — every flip writes a `platform_config_audit` row (config-specific old→new history) AND an `admin_bypass_audit` row (PR #26 contract) inside one transaction.
- **Reversible** — same script, same procedure, `--value false` rolls back.
- **Gated** — a hard "must-pass" smoke checklist; flipping on partial green is explicitly disallowed.
- **Attributable** — the actor is a real BOMY staff user (role ∈ `BOMY_ADMIN_ROLES`), not `SYSTEM_ACTOR`.

PR #36 ships the script + the runbook + the directory pattern for future operational runbooks. It does **not** flip the flag itself.

---

## 2. In scope (artifacts shipped)

| Artifact               | Path                                                                                                                                                                                                                                                                                                   | Purpose                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Ops script             | `packages/db/scripts/ops/platform-config-flip.ts`                                                                                                                                                                                                                                                      | Generic UPDATE of any existing `platform_config` key to a supplied JSON value, under `withAdmin`.                     |
| Package script (local) | `packages/db/package.json` → `ops:platform-config:set`                                                                                                                                                                                                                                                 | Runs the script via `tsx`.                                                                                            |
| Package script (root)  | `package.json` → `ops:platform-config:set`                                                                                                                                                                                                                                                             | Delegates: `pnpm --filter @bomy/db ops:platform-config:set`.                                                          |
| Runbook artifact       | `docs/runbooks/checkout-enabled-flip.md`                                                                                                                                                                                                                                                               | Fully-executable Local section + Staging template + evidence template.                                                |
| Evidence directory     | `docs/runbooks/evidence/`                                                                                                                                                                                                                                                                              | New directory with a README explaining the per-flip evidence pattern. **No real evidence file committed in this PR.** |
| Spec (this doc)        | `docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md`                                                                                                                                                                                                                              | Design rationale.                                                                                                     |
| Tests                  | `packages/db/tests/scripts/`                                                                                                                                                                                                                                                                           | Unit tests + one DB-gated integration test (picked up by db's existing vitest config).                                |
| Toolchain              | `packages/db/devDependencies` adds `tsx`; `packages/db/tsconfig.json` includes `scripts/**/*`; `packages/db/package.json` `lint` script changes from `eslint src tests --max-warnings 0` to `eslint src tests scripts --max-warnings 0`; eslint config ignores only `scripts/migrate.mjs` (plain ESM). | Brings the new TS files under `@bomy/db`'s lint/typecheck/test umbrella.                                              |

`docs/runbooks/` is established as the canonical home for operational procedures going forward (Turnstile rollout, future prod cutover, HitPay live-key swap, key incidents).

---

## 3. Out of scope (explicit boundary)

- **Production cutover.** Production does not exist as of 2026-05-27. Writing prod-specific steps now would create stale policy. Deferred to a separate future PR when prod infra lands. Named dependencies: real domain, HitPay live keys, monitoring/alerting, rollback authority, support coverage.
- **Staging infrastructure / executable staging values.** PR #36 ships the _staging template_ with loud `<PLACEHOLDER>` markers. It does not create staging, choose the deploy mechanism, provision env vars, or replace `<PLACEHOLDER>` values. Those land in the PR that establishes staging.
- **Real flip-evidence file.** The flag is not being flipped in this PR. Committing the evidence template/directory pattern is in scope; committing a real per-flip evidence file is not.
- **Admin console UI for `platform_config`.** Possible Stage 6. The script is the interim tool.
- **Smoke-harness helper script.** YAGNI. Raw `psql` + `curl` keeps each step auditable and debuggable.
- **Flipping `checkout_enabled` to `true` as part of this PR.** Stays `false` in committed seeds and migrations. The flip is operational, executed via the script per the runbook.
- **Turnstile on `/seller/apply`** — separate pre-launch follow-up (tracked in PR #35 memory + spec addendum). Independent of the checkout flip.
- **A general `platform_config` HTTP API.** One CLI tool only; no admin REST surface in this PR.
- **Per-flip notifications** (Slack, email). YAGNI; the committed evidence file under `docs/runbooks/evidence/` is the durable record.
- **Audit log rotation / archival.** Append-only is fine; revisit when audit tables cross 100k rows.
- **Markdown link-check CI for `docs/runbooks/`.** Manual review for now.

---

## 4. Brainstorm Q&A — locked decisions

| #   | Question                  | Decision                                                                                                       |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Q1  | Env scope                 | Local + staging (template). Prod explicitly out. Commit-time seeds/migrations keep `checkout_enabled = false`. |
| Q2  | Flip mechanism            | Tiny generic pnpm script via `withAdmin`. Generic in code; runbook is `checkout_enabled`-specific.             |
| Q3  | Smoke checklist breadth   | Two-tier: must-pass (HARD GATE — payment path) + advisory (post-flip sanity).                                  |
| Q4  | Actor identity            | Required `--actor <uuid>`; role must be in `BOMY_ADMIN_ROLES`. Audit row attributable to a real human.         |
| Q5  | Runbook artifact location | `docs/runbooks/checkout-enabled-flip.md`. New `docs/runbooks/` directory is canonical for ops procedures.      |
| Q6  | Shape                     | Approach A — script + complete-local + staging-skeleton; no smoke-harness.                                     |

---

## 5. Script design — `packages/db/scripts/ops/platform-config-flip.ts`

### 5.1 Args (all required, no defaults)

| Arg        | Type               | Validation                                                                                                                                                                                        |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--key`    | string             | Must match an **existing** row in `platform_config`. UPDATE only — no upsert. Missing key → exit 1 with "Refusing to create new keys."                                                            |
| `--value`  | JSON-parsed string | Must parse as JSON. Accepts `true`/`false`/`"..."`/`123`/`{...}`/`null`. JSON type-mismatch vs existing value is not enforced (the column is `jsonb`).                                            |
| `--actor`  | UUID-shaped string | Regex check (8-4-4-4-12 hex, version-agnostic; matches `assertUuid` in `packages/db/src/tenant.ts`). Resolves against `users`; must exist with `role ∈ BOMY_ADMIN_ROLES`.                         |
| `--reason` | non-empty string   | Trim then check; passed verbatim into `withAdmin`, which writes it to `admin_bypass_audit.reason`. (`platform_config_audit` has no `reason` column — it stores the old/new values and the actor.) |

`BOMY_ADMIN_ROLES = ["bomy_ops", "bomy_admin", "bomy_finance"]` (from `packages/db/src/types.ts:14`).

### 5.2 Validation cascade (fail fast)

1. All four args present → else usage to stderr + exit 1.
2. Unknown args rejected (any `--foo` or bare positional not in the four required) → exit 1.
3. `--actor` UUID-shaped → else exit 1.
4. `--value` parses as JSON → else exit 1, offending input quoted.
5. `--reason` non-empty after trim → else exit 1.
6. Connect via `makeDb()` (DI'd in test contexts — see §6.2).
7. **Actor lookup under RLS** — `withTenant(db, { userId: <actor>, userRole: "buyer" }, tx => tx.select({id,email,role}).from(users).where(eq(users.id, actor)))`. Lowest-privilege role is fine because the `users` row-self-select RLS policy applies regardless of role.
8. Actor row exists + `role ∈ BOMY_ADMIN_ROLES` → else exit 1 with the role shown in the error message.
9. **Key pre-read under the actor's real role** — `withTenant(db, { userId: actor.id, userRole: actor.role }, tx => tx.select({id, value}).from(platformConfig).where(eq(platformConfig.key, args.key)))`. Confirms (a) the key exists and (b) the actor can see `platform_config` under their own RLS context (sanity check). 0 rows → exit 1 "Refusing to create new key".
10. **Write under `withAdmin`** — inside `withAdmin(db, { userId: actor.id, reason: args.reason }, tx => ...)`:
    - `UPDATE platform_config SET value = $new::jsonb, updated_by = $actorId, updated_at = now() WHERE key = $key RETURNING id, value`.
    - `INSERT INTO platform_config_audit (config_id, key, old_value, new_value, changed_by) VALUES (...) RETURNING id, changed_at`.
    - `withAdmin` itself writes the `admin_bypass_audit` row in the same transaction. Its id is not exposed (see `packages/db/src/tenant.ts:143` — no `.returning()`). We do not promise it in output.
11. After commit: print success block (see §5.3).

### 5.3 Output contract

**Success — stdout, human-readable (not JSON):**

```
Connecting to <db host, port>...
Resolved actor: charlie@bomy.my (bomy_admin, uuid: <…>)
Key 'checkout_enabled':
  before: false
  after:  true
Platform config audit row: <platform_config_audit.id> @ 2026-05-27T11:55:00Z
Admin bypass audit: written by withAdmin for actor <uuid> reason "<reason>"
```

**Failure — stderr, single line; exit 1:**

Examples (non-exhaustive):

- `Error: --key 'checkout_enabld' does not exist in platform_config. Refusing to create new keys.`
- `Error: --actor 'abc' is not a UUID-shaped string.`
- `Error: --actor <uuid> not found in users table.`
- `Error: --actor <uuid> has role 'buyer'; must be one of bomy_ops / bomy_admin / bomy_finance.`
- `Error: --value 'truee' is not valid JSON.`
- `Error: --reason must be non-empty.`
- `Error: unknown argument '--foo'.`

**Exit codes:** `0` success, `1` validation failure, `2` DB/connection error.

### 5.4 Package scripts (two-level)

The script lives inside `@bomy/db`. The root command delegates.

In `packages/db/package.json`:

```json
"ops:platform-config:set": "tsx scripts/ops/platform-config-flip.ts"
```

In root `package.json`:

```json
"ops:platform-config:set": "pnpm --filter @bomy/db ops:platform-config:set"
```

`tsx` is added to `packages/db/devDependencies`. `packages/db/tsconfig.json` extends `include` to cover `scripts/**/*`. The db `lint` script is updated from `eslint src tests --max-warnings 0` to `eslint src tests scripts --max-warnings 0` so TypeScript under `scripts/` is actually linted; the eslint config ignores only `scripts/migrate.mjs` (plain ESM, not the new TS).

---

## 6. Code structure

### 6.1 Module layout

```
packages/db/
├── scripts/
│   ├── migrate.mjs                            # existing (kept; plain ESM)
│   └── ops/
│       ├── platform-config-flip.ts            # CLI wrapper: process.argv → core → process.exit
│       ├── platform-config-flip-core.ts       # runPlatformConfigFlip(db, args) — testable
│       └── platform-config-flip-args.ts       # parseArgs, parseValue, validateUuidShape — pure helpers
└── tests/scripts/
    ├── platform-config-flip-args.test.ts        # unit (no DB)
    └── platform-config-flip-integration.test.ts # DB-gated (BOMY_RLS_READY=1 + DATABASE_APP_URL)
```

(Exact filenames finalized in the plan. The split into wrapper / core / pure-helpers is the load-bearing structural decision. Locating both code and tests inside `@bomy/db` puts them under the package's existing tsconfig, eslint, and vitest configs.)

### 6.2 Testability

- **Pure helpers** — `parseArgs(argv: string[])`, `parseValue(input: string)`, `validateUuidShape(s: string)`. No env, no DB. Testable with vitest unit cases.
- **Core** — `runPlatformConfigFlip(db: Database, args: Args): Promise<FlipResult>`. DB handle injected. Returns `{ oldValue, newValue, platformConfigAuditId, changedAt, actor }`. Throws typed errors on validation failure (`UsageError`, `ActorError`, `KeyMissingError`, `DbError`). Tests build their own `bomy_app`-role DB client using `DATABASE_APP_URL` and inject it directly.
- **CLI wrapper** — thin shell. Only place touching `process.argv` / `process.stdout` / `process.stderr` / `process.exit`. Production reads `DATABASE_URL` via `makeDb()`.

---

## 7. Tests

### 7.1 Unit tests (no DB)

1. Missing each required arg in turn — 4 tests; verify error names the missing arg.
2. **Unknown arg rejected** (`--foo`, bare positional) — single test, both shapes.
3. UUID-shape validation — accept matrix (multiple valid shapes) + reject matrix (`'abc'`, truncated, decimal).
4. JSON `--value` parse — accept matrix (`true`, `false`, `"x"`, `123`, `{"a":1}`, `null`) + reject matrix (`truee`, unquoted bare strings, empty string).
5. Empty / whitespace-only `--reason` rejected after trim.

### 7.2 Integration test (DB-gated; one)

Behind `DATABASE_APP_URL` + `BOMY_RLS_READY=1`. Uses the `bomy_app` limited role so RLS actually fires.

- **Seed:** insert a `bomy_admin` user (or reuse an existing seeded one); insert a synthetic `platform_config` row with a **per-run unique key**: `const testKey = '__test_flip_' + randomUUID()`, value `false`. Seeding may use `withAdmin` for the inserts (RLS would otherwise block writes), but **be aware**: every `withAdmin` call writes one extra `admin_bypass_audit` row at the start of its transaction (per `tenant.ts:143`). This is why the assertions below use **narrow unique-identifier matchers returning exactly 1 row**, not total-count deltas — count-delta assertions would be brittle against any incidental `withAdmin` use in seed/cleanup.
- **Invoke** `runPlatformConfigFlip(dbAppRoleClient, { key: testKey, value: 'true', actor: adminId, reason: <unique-per-run-reason> })`.
- **Assert** (all reads use `withTenant` under the seeded admin's real role to avoid emitting additional `admin_bypass_audit` rows mid-assertion):
  - `platform_config.value` for `testKey` is now `true`; `updated_by = actor.id`; `updated_at` advanced past the seed time.
  - Exactly **one** row in `platform_config_audit` with `key = $testKey` AND `changed_by = actor.id`; it has `old_value = false`, `new_value = true`. (Narrow matcher; no global count delta.)
  - Exactly **one** row in `admin_bypass_audit` with `actor_user_id = actor.id` AND `reason = $testReason`. (Narrow matcher on unique-per-run reason; no global count delta.)
- **Cleanup in `afterEach`:**
  - `DELETE FROM platform_config WHERE key = $testKey`.
  - **Do not delete audit rows.** `platform_config_audit` and `admin_bypass_audit` are append-only at the RLS layer — `packages/db/src/rls/policies.sql:261-267` defines only SELECT + INSERT policies on the former, and `:390-398` enforces the same plus an explicit comment that omission of UPDATE/DELETE policies under FORCE RLS keeps `admin_bypass_audit` append-only. A `DELETE` would be silently rejected by RLS or fail outright; either way, the test's audit rows stay in the table.

Per-run unique testKey + unique reason text means stale rows from a crashed previous run cannot poison the next run — assertions narrow by those unique identifiers (`WHERE key = $testKey` for `platform_config_audit`, `WHERE actor_user_id = $testActorId AND reason = $testReason` for `admin_bypass_audit`). Accumulating audit rows is acceptable: each row is a real record of a real test invocation; with unique identifiers per run there is no cross-test contamination.

### 7.3 Out of test scope

- E2E test invoking the actual `pnpm` script via subprocess. Unit tests cover arg handling; integration test covers the DB write. Subprocess test adds complexity for no signal.
- Testing the smoke checklist itself — operator-executed, not test-suite-executed.
- Markdown link-check for `docs/runbooks/`.

---

## 8. Runbook structure — `docs/runbooks/checkout-enabled-flip.md`

### 8.1 Header block

```
# Runbook — Flip checkout_enabled

Audience: BOMY staff (bomy_ops / bomy_admin / bomy_finance) executing a
checkout_enabled flip on local or staging. Production is OUT OF SCOPE
until a separate production-cutover runbook lands.

Spec: docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md
Owner: Charlie (Stage 5; revisit when ops handoff happens in Stage 6+).
Last revised: 2026-05-27
```

### 8.2 §0. Pre-flight (do once per actor, per env)

- Confirm target env (local or staging-template). Production warning if `DATABASE_URL` host smells like prod.
- Look up your admin user UUID. This one-off lookup uses the **owner-role** connection (`DATABASE_URL`, the BOMY-owned role that bypasses RLS at the role level — same role the migration script uses). Under the limited `bomy_app` role (`DATABASE_APP_URL`) this query would return empty because no RLS context is set in an ad-hoc `psql` session.
  ```sql
  -- Connect with DATABASE_URL (owner role), NOT DATABASE_APP_URL.
  SELECT id, email, role FROM users WHERE email = '<you>@bomy.my';
  ```
  Role must be `bomy_ops` / `bomy_admin` / `bomy_finance`. Otherwise stop.
  Alternative: if/when an admin console "view my profile" page exists, use that instead.
- Confirm `DATABASE_URL` is exported and points at the target env. The flip script itself uses `DATABASE_URL` via `makeDb()`.

### 8.3 §1. Pre-flip hard gate (checks 1–5)

Five checks that must ALL be green BEFORE running the flip command. Each: **what to run**, **expected result**, **evidence to capture**. Per check, the runbook ends with: `**If this fails:** STOP — do not flip. Fix forward or file a bug. Do not flip on partial green.`

All five checks are verifiable without `checkout_enabled = true` — they exercise infrastructure and backend webhook/ledger machinery directly, not the buyer-facing `/checkout` page.

1. **App running on target env.** Local: `pnpm dev` shows web :3000, api :3001, admin :3002. Staging: `<STAGING_HEALTH_CHECK_URL>` returns 200.
2. **HitPay webhook reachable (auth working).** Unsigned `POST /webhooks/hitpay` returns `401`. Signed minimal `POST` with valid HMAC returns `200 {"received": true}`. Gating on auth behavior rather than HTTP method.
3. **Synthetic paid webhook fan-out creates orders + balances the ledger.** Send a signed synthetic paid webhook against a pre-seeded `checkout_sessions` row. Then check BOTH:
   ```sql
   SELECT count(*) FROM orders WHERE checkout_session_id = '<seeded SID>';
   -- expected: ≥ 1
   SELECT direction, sum(amount_minor) FROM ledger_entries WHERE transaction_id = '<TXN>' GROUP BY direction;
   -- expected: debit sum equals credit sum
   ```
   (The synthetic webhook does NOT require `checkout_enabled = true` — the gate only fires for buyer-initiated flows, not for HitPay-initiated webhooks.)
4. **Amount-mismatch synthetic webhook parks session in review.** Synthetic webhook curl with crafted mismatched payload. DB check:
   ```sql
   SELECT status FROM checkout_sessions WHERE id = '<SID>';
   -- expected: payment_review_required
   ```
5. **Shipping fee / totals sanity (verifiable without initiating checkout).** Inspect cart-side totals via direct `priceCheckoutPreview` server-action call OR `/cart` page rendering (whichever path is available without going through paused `/checkout`). Subtotal + shipping − voucher contribution = displayed grand total. Capture a screenshot or written confirmation.

### 8.4 §2. The flip

Run only after every check in §8.3 is green:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value true \
  --actor <your-admin-user-uuid> \
  --reason "Enable checkout on <env> — pre-flip hard gate #1-5 green; advisory gaps: <list or 'none'>"
```

Reason copy convention: must reference the §8.3 hard-gate green-status + any advisory gaps explicitly. The script's stdout (per §5.3) is the canonical evidence.

### 8.5 §3. Post-flip evidence check

Immediately after the flip command returns success, verify the audit row exists:

```sql
SELECT id, old_value, new_value, changed_by, changed_at
FROM platform_config_audit
WHERE key = 'checkout_enabled'
ORDER BY changed_at DESC LIMIT 1;
```

- `old_value` should be `false`, `new_value` should be `true`, `changed_at` within the last few seconds.
- `changed_by` should match your actor UUID from §8.2.

**If this fails** (no row, wrong values, or wrong actor): rollback per §8.8 trigger #4 and stop. The script reported success but the audit chain is broken — a real bug worth pausing on.

### 8.6 §4. Post-flip E2E verification

The actual buyer flow that the flip enables. Run this **immediately** after the flip — this is the highest-priority verification, ahead of the advisory smoke in §8.7.

Walk through as a buyer:

1. Sign in as a test buyer (or any account; create one if needed).
2. Add at least one product to cart from `/`.
3. Navigate to `/checkout` — verify it renders the form (not the "paused" UI).
4. Complete checkout via HitPay sandbox.
5. Return to the site (success page).

Then verify in the DB:

```sql
-- 1. Session reaches `paid`.
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: paid

-- 2. At least one order row was created.
SELECT count(*) FROM orders WHERE checkout_session_id = '<SID>';
-- expected: ≥ 1

-- 3. Ledger entries balance for the transaction.
SELECT direction, sum(amount_minor)
FROM ledger_entries
WHERE transaction_id = '<TXN>'
GROUP BY direction;
-- expected: debit sum equals credit sum
```

**Expected smoke window:** within 5 minutes of the flip (allowing for inventory reservation, HitPay sandbox latency, and webhook fan-out).

**If this fails:** rollback per §8.8 trigger #1 immediately. Post-flip E2E failure is the most operationally severe rollback trigger — it means real buyers cannot complete real purchases on the live flag.

### 8.7 §5. Advisory smoke (post-flip sanity — does NOT block flip)

Per Q3. Each is a small DB query or UI walkthrough. **Failures here do NOT trigger rollback** unless they expose a buyer-blocking bug — they get logged in the evidence file and triaged out-of-band.

- Buyer/seller/admin order views render correctly.
- `order_paid` buyer + ops emails sent (Mailhog inbox locally).
- Voucher issuance email path healthy.
- Payout-pending email path (admin `createPayoutRecord` happy path).
- Seller-inquiry ops alert from `/seller/apply` submission.
- Inventory reservation expiry job runs without errors.
- Order auto-complete job runs without errors.

### 8.8 §6. Rollback

Same script, `--value false`, with a `--reason` explaining the trigger:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value false \
  --actor <your-admin-user-uuid> \
  --reason "Rollback: <one-line trigger>"
```

**Rollback triggers (any one is sufficient):**

1. **Post-flip E2E checkout fails or cannot complete within the expected smoke window** (§4 fails). Includes: buyer can't reach a working `/checkout`; HitPay sandbox checkout doesn't return; `checkout_sessions.status` never advances to `paid`; webhook fan-out errors observed in `apps/api` logs during the smoke; HitPay charge that doesn't land as a row in `orders`.
2. `/checkout` returns `CHECKOUT_DISABLED` for users you expect to have access (config drift).
3. Ledger balance mismatch on any post-flip transaction (whether discovered in §4 or in real traffic afterwards).
4. `checkout_enabled` cannot be verified as `true` post-flip (per §3), OR the script's success output / `platform_config_audit` row is missing or inconsistent.

### 8.9 §7. Evidence template + redaction rules

Each flip produces one committed evidence file: `docs/runbooks/evidence/YYYY-MM-DD_checkout-flip_<env>.md`. Structure:

- Actor (uuid + email)
- Env (local | staging | future-prod)
- Pre-flip hard-gate output captures — 5 numbered blocks (one per §8.3 check)
- Flip command stdout
- Post-flip evidence check (audit row query result)
- Post-flip E2E verification result (session_id, order count, ledger balance check)
- Advisory smoke results
- Rollback section (if invoked)

**Redaction rules (apply before committing any evidence file):**

- **NEVER commit:** secrets, webhook signatures, `Authorization` headers, `DATABASE_URL` with passwords, raw PSP payloads.
- **REDACT:** buyer email, phone, shipping address (replace with `[REDACTED]`).
- **OK to commit:** `checkout_session_id`, `order_id`, audit row ids, `platform_config` key/value pairs.
- **Local-only scratch attempts** (failed smoke runs, test data) stay out of git. Only commit evidence that documents a real flip on a real env.

### 8.10 §8. Staging section (not executable yet)

Top of section banner:

```
> ⚠️ NOT EXECUTABLE. Staging infrastructure does not yet exist as of 2026-05-27.
> This section is a structural template. When staging stands up, replace
> the <PLACEHOLDER> markers and remove this banner in the same PR that
> establishes staging.
```

Same outline as Local with loud `<PLACEHOLDER>` markers:

- `<STAGING_DATABASE_URL>`
- `<STAGING_HEALTH_CHECK_URL>`
- `<STAGING_HITPAY_SANDBOX_WEBHOOK_URL>`
- `<STAGING_ADMIN_ACTOR_UUID>`
- `<STAGING_APP_URL>`
- `<STAGING_DEPLOY_COMMAND>` (placeholder until the deploy mechanism is chosen)

### 8.11 §9. Production section (intentionally absent)

A single paragraph stating production is out of scope and a separate production-cutover runbook will be authored when prod infra exists. Lists dependencies (real domain, HitPay live keys, monitoring/alerting, rollback authority, support coverage) so future-Charlie sees them.

---

## 9. Key invariants enforced by this design

- **Audit trail.** Every flip writes both a `platform_config_audit` row (config-specific old→new history) AND an `admin_bypass_audit` row (PR #26 contract) inside one `withAdmin` transaction.
- **Real-human attribution.** `SYSTEM_ACTOR` is rejected by the role check; only `BOMY_ADMIN_ROLES` users can flip. The script does not provide a way to flip "as the system."
- **No new-key footgun.** UPDATE-only, no upsert. Typo'd `--key` fails fast instead of silently creating a new row.
- **RLS preserved throughout.** Actor lookup uses `withTenant` (lowest-privilege role), key pre-read uses `withTenant` under the actor's real role, and the actual write uses `withAdmin`. No raw `db` access.
- **Symmetric rollback.** Same script + same procedure. Nothing for staff to remember in a stress moment.
- **Pre-launch honesty.** Production is explicitly OUT until prod infra lands. Staging is a placeholder template, not pseudo-real instructions.
- **Evidence durability.** Committed under `docs/runbooks/evidence/`, discoverable via `git log`, redacted per the rules in §8.9.

---

## 10. Next step

Invoke `superpowers:writing-plans` to produce the implementation plan for PR #36. The plan will sequence:

1. Add `packages/db/scripts/ops/platform-config-flip*` modules + unit tests (under `packages/db/tests/scripts/`); add `tsx` to db devDeps; extend `packages/db/tsconfig.json` include; narrow db's eslint ignore so only `scripts/migrate.mjs` is exempt.
2. Add DB-gated integration test (`packages/db/tests/scripts/`). Cleanup deletes only the synthetic `platform_config` row; audit rows are append-only at the RLS layer and stay (assertions narrow by unique testKey / reason per run).
3. Wire `ops:platform-config:set` in `packages/db/package.json` (runs the script via `tsx`) and in root `package.json` (delegates via `pnpm --filter @bomy/db`).
4. Create `docs/runbooks/` + `docs/runbooks/evidence/` (with a small `README.md` per directory).
5. Write `docs/runbooks/checkout-enabled-flip.md` per §8.
6. Verify (`pnpm lint`, `pnpm typecheck`, scoped tests).
7. Open PR; Bob review.

`checkout_enabled` stays `false` in committed seeds for the duration of this PR. The first real flip happens AFTER merge, operationally, by Charlie executing the runbook.
