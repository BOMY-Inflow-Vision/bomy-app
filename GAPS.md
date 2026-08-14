# GAPS.md — Honest audit of weaknesses

> Written 2026-07-07 (post-PR #87). Ordered by severity, most important first. Each entry:
> what / where / why it matters / a fix scoped small enough to be a single task.
> Context for all of these is in PROJECT.md. Overall: this codebase is unusually clean for its age
> (zero TODO/FIXME markers, 454 tests, disciplined PR logs). The gaps below are real, but most are
> known-and-parked rather than accidental.

## 1. ~~Stale JWT role window — revoked admins keep access up to 30 days~~ · CLOSED (PR #88)

**Resolved 2026-07-12** by PR #88 (squash merge `899a8aa`). A demoted or removed admin now loses
`apps/admin` access within **5 minutes**, enforced server-side, with no other user affected.

- **What shipped:** (a) `apps/admin/src/lib/role-refresh.ts` — the admin `jwt` callback re-derives
  `role` from the DB (keyed on `token.id ?? token.sub`) whenever a `roleCheckedAt` claim is older
  than 5 min. Fail-closed: a transient DB error sets a per-request `roleRefreshFailed` marker and
  leaves durable claims untouched (self-heals; never corrupts a valid admin); only a confirmed
  missing user row durably demotes to `buyer`. (b) `apps/admin/src/lib/auth.ts` — `requireAdmin`
  (pages, redirects) / `requireAdminId` (actions, throws) enforce the role allow-list and reject on
  the marker. **Every** admin page and server action calls one of these — this is the enforcement
  layer, because the edge middleware runs on the pre-refresh cookie.
- **Design note:** the edge middleware (`auth.config.ts`, `middleware.ts`) deliberately stays
  DB-free and remains a best-effort first pass only. Do not add a DB lookup there.
- **Residual, accepted by design:** `apps/web` still bakes buyer/seller roles + PDPA consent into a
  JWT for up to 30 days (rotating `AUTH_SECRET` remains the global kill switch). This was
  explicitly scoped out — the privileged surface is the admin console, and web role changes are far
  lower impact. If a revoked `seller_owner` ever needs sub-30-day revocation, the same `refreshRole`
  helper pattern applies to `apps/web`.
- **Follow-ups (non-blocking, not yet done):** an end-to-end `jwt → session → requireAdmin` test with
  a real demotion (the NextAuth callback glue is currently typecheck-verified only), and focused
  tests for `memberships/actions.ts::updateRenewalNotificationDays` +
  `vouchers/actions.ts::triggerVoucherIssuance` (both now behind `requireAdminId`).

## 2. The money pipeline has never run end-to-end in production · LAUNCH RISK, HIGH

- **What:** `checkout_enabled=false`; the HitPay live smoke test (join membership on prod, verify
  webhook → Railway → activation) is parked ("KIV" in `.andy/handoff.md` §4). Duplicate-charge
  refund reconciliation (PR #72) is also unverified live.
- **Where:** Not a code defect — an operational gap. Runbook: `docs/runbooks/checkout-enabled-flip.md`.
- **Why it matters:** Every payment invariant is tested against mocks/local Postgres, but the
  webhook URL wiring, Railway networking, HitPay event shapes, and Neon behaviour under real load
  are unproven. First real customer = first integration test unless the smoke happens.
- **Update (2026-07-07):** HitPay is not approving the merchant account at the moment, so the live
  smoke is externally blocked, not just parked. The direction being brainstormed (separate session,
  not yet decided) is **Stripe alongside HitPay behind a PSP-agnostic layer with an admin toggle**.
  Until that lands, the Stage 4 subscription layer stays HitPay-shaped (see gap #14).
- **Fix (single task):** Sandbox smoke remains possible without account approval
  (`HITPAY_API_URL=https://api.sandbox.hit-pay.com`, test card `4111 1111 1111 1111`) — capture
  evidence under `docs/runbooks/evidence/`. The live smoke waits on either HitPay approval or the
  Stripe path.

## 3. ~~No rate limiting on any public endpoint~~ · CLOSED (PRs #90–#93, #98, #100, this PR)

- **Status (2026-07-23): web server-action throttling CLOSED.** `checkActionRateLimit`
  (`packages/db/src/rate-limit.ts`) — a fixed-window per-user counter backed by Postgres, since
  `apps/web` has no shared Redis (unlike `apps/api`, whose own limiter can't reach these calls: they
  never go through Fastify). New table `action_rate_limits` (migration 0026 — table + RLS + grants
  in one file, matching the 0014/0015 pattern), keyed on `(user_id, action, window_start)`, one
  atomic `INSERT ... ON CONFLICT DO UPDATE` per call. Wired into the four named surfaces:
  `priceCheckoutPreview` (30/min), `initiateCheckout` (5/min), the four address-book writes sharing
  one `address_write` bucket (20/min), `updateDisplayName` (10/min) — limits in
  `apps/web/src/lib/rate-limits.ts`, a starting point not tuned against real traffic. Gate runs
  first in each action, before any other DB work, matching the existing Turnstile-first idiom.
  **Two non-obvious RLS findings from building this** (both empirically confirmed, not assumed —
  see migration 0026's comments): (a) Postgres's row-matching for `UPDATE` — including the `UPDATE`
  arm of `ON CONFLICT DO UPDATE` — needs a policy applicable to `SELECT`, not just the `FOR UPDATE`
  policy's own `USING` clause; a `FOR UPDATE`-only policy silently matched zero rows. (b)
  `app.bypass_rls` skips RLS **policy** checks but not table-level `GRANT`s, since `bomy_app` is a
  real role, not a superuser — `withAdmin`-run cleanup (tests, and any future pruning job) still
  needs an explicit `DELETE` grant + policy. This gap is now **fully closed** — both the `apps/api`
  keying half and the web-throttling half.
- **Status (2026-07-22, apps/api half): keying CLOSED — prod re-smoke PASSED.** PR #98 (merged `a491fdd`,
  deployed `a67a2153`) ships `clientIpKey` in `apps/api/src/plugins/rate-limit.ts`, keying on
  `X-Real-IP` with a `request.ip` fallback for dev/tests (never a shared constant — that would let
  one header-less client exhaust every other's bucket). Re-smoke evidence:
  [`docs/runbooks/evidence/2026-07-22_rate-limit-resmoke_prod.md`](docs/runbooks/evidence/2026-07-22_rate-limit-resmoke_prod.md)
  — 35 fresh-connection bad-signature `POST /webhooks/hitpay` → **30× 401 then 429 from request 31**,
  exactly matching the 30 cap. Compare the 2026-07-19 status below: the identical fresh-connection
  method previously produced **0× 429** across 90 requests. The temporary `/internal/ip-debug`
  endpoint and its runbook were removed in the same PR (probe evidence retained).
- **Status (2026-07-15, SUPERSEDED — the causal explanation here was wrong):** `apps/api` addressed.
  PR #90 added `@fastify/rate-limit` (global 100/min/IP, `/webhooks/hitpay` 30/min, `/health`+`/ready`
  exempt, `trustProxy: 1`). The prod smoke showed the cap not binding across fresh connections, which
  was **attributed at the time to the API running multiple instances** behind a load balancer;
  the follow-up PR moved the store to **shared Redis** (`REDIS_URL`, `skipOnError: true` fail-open).
  **That multiple-instances inference was never verified and is now believed false** — see the
  2026-07-20 status below. Redis remains the right store (deploy overlap, future horizontal scaling),
  but it was not the fix for this symptom. Web server-action throttling is still open (below).
- **Status (2026-07-19): STILL OPEN — the limiter keys on the wrong IP.** The post-#91 prod smoke
  sent 90 bad-signature `POST /webhooks/hitpay` over **fresh** connections → **0× 429**; 40 over a
  single keep-alive connection → 429 as expected. Cause: `trustProxy: 1` resolves `request.ip` to
  the **rightmost** X-Forwarded-For entry, which on Railway is an **edge-node IP that rotates per
  connection** (DataPacket SG, `152.233.x.x`) — not the client. Every connection gets a new key, so
  the cap never accumulates. The Redis store is necessary but cannot help while the **key** is
  wrong. Railway's edge HTTP log (`railway logs -s @bomy/api --http --json`) carries the real client
  in `srcIp`. **The correct hop must be proved, not guessed** — a temporary `GET /internal/ip-debug`
  endpoint (since removed) ran that probe; procedure and result are preserved in the retained
  evidence file linked in the 2026-07-20 status below.
- **Status (2026-07-20): PROBED — answer is `X-Real-IP`.** Evidence:
  [`docs/runbooks/evidence/2026-07-20_ip-diagnostic-probe_prod.md`](docs/runbooks/evidence/2026-07-20_ip-diagnostic-probe_prod.md).
  `request.ip` returned **4 distinct edge IPs across 6 requests**, confirming the rotating-key cause
  directly. `X-Real-IP` was correct (== egress == edge-log `srcIp`), stable across all 6, and
  **not spoofable** — Railway overwrites both `X-Forwarded-For` and `X-Real-IP` wholesale (a
  3-entry spoofed chain arrived as a clean 2-entry `[client], [edge]`). XFF-leftmost also satisfied
  all three measured criteria but is **positional** and degrades silently if a hop is added, so
  `X-Real-IP` is preferred. **`X-Envoy-External-Address` passes through client-controlled — never
  key or trust it.** Remaining work: `keyGenerator` on `X-Real-IP`, delete the diagnostic endpoint +
  runbook, re-smoke fresh connections for a 429 past ~30.
- **What:** `apps/api` rate limiting works end-to-end — the plugin (#90/#91) plus the `X-Real-IP`
  keying fix (#98) means `/webhooks/hitpay` (HMAC before any DB work, good, but HMAC on unbounded
  bodies is still CPU) and `/me` caps actually bind, with `/health` + `/ready` exempt. On web,
  the four named server actions now throttle per user via Postgres (above); only magic-link
  (cooldown) and seller-apply (Turnstile) had protection before this.
- **Where:** `apps/api/src/plugins/rate-limit.ts` + `trustProxy` in `apps/api/src/server.ts`;
  `packages/db/src/rate-limit.ts` + `apps/web/src/lib/rate-limits.ts` + the three action files under
  `apps/web/src/app/{checkout,account}/**`.
- **Why it matters:** Griefing vector (junk load on Railway/Neon) and brute-force surface. Vercel
  and Cloudflare absorb some of this for web, but the Railway API is directly reachable.
- **Fix:** Done. Both halves closed 2026-07-22/23.

## 4. ~~Non-constant-time secret comparisons~~ · CLOSED · SECURITY, LOW-MEDIUM

- **Status (2026-07-23): CLOSED.** Both sites now use a length-checked `timingSafeEqual`, inlined
  at each call site rather than extracted to a shared helper — matches the existing convention
  (`packages/hitpay/src/webhook.ts` and `apps/web/src/lib/s3.ts` each already inline their own
  copy of this exact pattern rather than sharing one).
  - `apps/api/src/routes/internal/jobs.ts` — `INTERNAL_API_SECRET`. New test coverage:
    `apps/api/tests/routes/internal/jobs.test.ts` (503 unconfigured, 401 missing/wrong-length/
    same-length-wrong/wrong-scheme).
  - `apps/web/src/app/api/ops/db-identity/route.ts` — `BOMY_OPS_DIAGNOSTIC_TOKEN`. Added a
    same-length-wrong-token case to the existing `db-identity.test.ts`.
  - **Honest limitation:** timing-safety is a non-functional property — every test above passes
    identically whether the code uses `timingSafeEqual` or the old `!==` (confirmed by temporarily
    reverting and re-running). The tests guard against a behavioural regression (still correctly
    rejects bad secrets); the constant-time guarantee itself is only verifiable by reading the diff.
- **What (original):** Two bearer-style secrets were compared with `!==` instead of
  `timingSafeEqual` — `apps/api/src/routes/internal/jobs.ts` (`INTERNAL_API_SECRET`) and
  `apps/web/src/app/api/ops/db-identity/route.ts` (`BOMY_OPS_DIAGNOSTIC_TOKEN`).
- **Why it mattered:** Timing side-channels over the public internet are hard but not impossible;
  the codebase already used `timingSafeEqual` everywhere else, so this was also an internal
  inconsistency.

## 5. ~~`parseSen` duplicated — abandoned "Task 11" consolidation~~ · CLOSED · TECH DEBT, MEDIUM

- **Status (2026-07-25): CLOSED.** `apps/api/src/routes/webhooks/hitpay.ts` now imports `parseSen`
  from `../../webhooks/hitpay/parse-sen.js` instead of keeping a private copy. The membership,
  brand-subscription, and refund branches (and the order-webhook path, already on the shared
  import) all resolve amounts through one function. Doc comment in `parse-sen.ts` updated to drop
  the stale "Task 11" reference. Full api suite 291/291, run twice back-to-back with real
  Postgres/Redis (`BOMY_RLS_READY=1`) — deterministic, no skips.
- **What (original):** Two identical strict `"N.NN"` → bigint parsers existed:
  `apps/api/src/webhooks/hitpay/parse-sen.ts` (whose doc comment said "Task 11 will consolidate
  those") and a private copy in `apps/api/src/routes/webhooks/hitpay.ts:21`. Task 11 never
  happened. Risk: if one copy were ever fixed/tightened and the other wasn't, the membership path
  and the order path would disagree on what a valid amount is.

## 6. ~~Documentation drift in load-bearing files~~ · CLOSED · TECH DEBT, MEDIUM

- **Status (2026-08-03): CLOSED.** `README.md` description/status rewritten to match current
  state (live in prod, Stages 1–5 complete, `checkout_enabled` gate noted) and now links
  `PROJECT.md`/`GAPS.md`; quickstart gained the missing `apps/admin` env-copy + migrate steps.
  Root `.env.example` synced against actual `process.env` reads across `apps`/`packages`: added
  `MAIL_FROM_NOREPLY`, `BOMY_OPS_DIAGNOSTIC_TOKEN`, `AUTH_URL`, `WEB_BASE_URL`/`API_BASE_URL`
  (checkout-only); the `apps/admin` section was missing `AUTH_SECRET`/`AUTH_GOOGLE_ID`/
  `AUTH_GOOGLE_SECRET`/`AUTH_URL`/`HITPAY_API_KEY`/`HITPAY_API_URL`/`NEXT_PUBLIC_API_URL` entirely —
  added. The disabled Facebook provider's vars were also misnamed (`AUTH_META_ID/SECRET`; the code
  and `turbo.json` both use `AUTH_FACEBOOK_*`) — corrected, with a note that no provider is
  registered (GAPS #12). `apps/web/.env.local.example` got the same `MAIL_FROM_NOREPLY`/
  `WEB_BASE_URL`/`API_BASE_URL`/Facebook-disabled additions directly, not just at the root
  reference. `CLAUDE.md` was already fixed in the original 2026-07-07 pass. See GAPS #15 (closed
  alongside this) for the `bomy.my` domain half.
- **What / where (original):**
  - `README.md` — says "Status: Stage 1 complete… Next: PR #8 (CI)" (reality: PR #87, live in prod)
    and uses the abandoned `bomy.my` domain in examples.
  - `.env.example` — missing `MAIL_FROM_NOREPLY` (used by `apps/web/src/auth.ts`),
    `BOMY_OPS_DIAGNOSTIC_TOKEN`, `AUTH_URL`, `S3_PUBLIC_URL` for web-prod R2; still lists
    `AUTH_META_ID/SECRET` for the disabled Facebook provider with no note.
  - `CLAUDE.md` — **fixed as part of this knowledge transfer** (was: "Google OAuth only",
    "sessionPlugin DB lookup pending fix", "checkout stays false until PR #32", 3-job table).
- **Why it matters:** These are the first files a new engineer or model reads; three of them
  actively lied about auth, checkout state, and project stage.
- **Fix (single task each):** (a) Rewrite README status + domain references; (b) sync `.env.example`
  against actual `process.env` reads (`grep -rn 'process.env\[' apps packages`).

## 7. ~~Integration tests skip silently — local green ≠ CI green~~ · CLOSED · TESTING, MEDIUM

- **Status (2026-08-14): CLOSED — PR #134.** Added `pnpm test:integration`
  (`scripts/check-integration-env.mjs` + `turbo run test`), which checks
  `DATABASE_URL`/`DATABASE_APP_URL`/`REDIS_URL`/`BOMY_RLS_READY=1` are all set and fails loudly
  (red message, exit 1, self-contained inline env example) instead of silently passing with
  skipped suites. CI's Test job now runs `pnpm test:integration` instead of plain `test` —
  confirmed green in the real workflow (not just locally), so a future `ci.yml` edit dropping one
  of these vars now fails the build instead of passing silently.
- **Scope note:** shipped the fail-fast guard (the GAPS-listed "single task" fix). The optional
  "and/or" half — a vitest `globalSetup`/reporter that inspects actual skip counts from inside the
  test process — was left undone: it would additionally catch `turbo.json`'s own `env` allowlist
  silently dropping one of these var names before spawning the test process (the literal root
  cause PR #103 fixed for `REDIS_URL`), which the outer shell-level guard cannot see. `turbo.json`'s
  `test` task already declares all 4 vars, so this residual risk only bites if a future edit
  removes one from that array — no caller currently needs the deeper check, and the existing
  Turborepo-env-passthrough memory note already flags the failure mode for whoever touches that
  array next.
- **What (original):** All RLS/integration suites are wrapped in `describe.skipIf(!shouldRun)`
  where `shouldRun = Boolean(DATABASE_APP_URL) && BOMY_RLS_READY === "1"`. Run `pnpm test` without
  those env vars and the suite passes while skipping the most important tests, with no loud signal.
- **Where:** Test files across `apps/*/tests/` and `packages/db/tests/`.
- **Why it matters:** A future agent will "verify" a money/RLS change locally, see green, and ship
  something CI later rejects — or worse, tweak CI env and lose the coverage entirely.

## 8. ~~`makeDb()` silently falls back to the RLS-exempt owner role~~ · CLOSED · FRAGILE, MEDIUM

- **Status (2026-07-25): CLOSED.** `makeDb()` (`packages/db/src/client.ts`) now emits
  `console.warn("makeDb: DATABASE_APP_URL unset — RLS may not be enforced under the owner role")`
  whenever it resolves to `DATABASE_URL` because `opts.url` and `DATABASE_APP_URL` are both
  absent. No warning when `opts.url` is passed explicitly (an intentional override) or when
  `DATABASE_APP_URL` is set. Covered by 3 new cases in
  `packages/db/tests/client-url-resolution.unit.test.ts` (warns on fallback; silent when
  `DATABASE_APP_URL` set; silent when `opts.url` passed).
- **Scope note:** shipped the required warning only. The GAPS-listed optional extra (a startup
  identity check reusing `/api/ops/db-identity`'s `current_user` query) was left undone — no
  caller currently needs it, and it'd add a live DB round-trip to every cold start for a case the
  warning already surfaces at the log line that matters (right when the URL resolves).
- **What (original):** `packages/db/src/client.ts:45` — `url = DATABASE_APP_URL ?? DATABASE_URL`.
  The owner role (`bomy` / Neon owner) owns the tables, and table owners bypass RLS policies.
  Forget to set `DATABASE_APP_URL` and everything works — with tenant isolation quietly OFF. Prod
  currently sets `DATABASE_URL` to the `bomy_app` role (handoff §3) — i.e. safety previously
  depended on an env-naming convention, not code.

## 9. Per-instance `setInterval` jobs double-run under horizontal scale · FRAGILE, LOW-MEDIUM

- **What:** `expireCancelledMemberships` and `expireAbandonedPendingMemberships` run via
  `setInterval` in `apps/api/src/server.ts:53-84` — once per process. BullMQ jobs are deduplicated
  by Redis job schedulers; these two are not.
- **Why it matters:** ~~**Confirmed LIVE (2026-07-15):** the PR #90 prod smoke proved `apps/api`
  runs **multiple instances**, so these two sweeps are already double-running in prod.~~
  **RETRACTED 2026-07-20 — that inference was unsound.** The smoke observed only that the rate-limit
  cap failed to bind across fresh connections; the 2026-07-20 probe showed the actual cause was a
  **rotating edge IP** (4 distinct values across 6 requests), which fully explains the symptom
  **without** multiple app instances. Railway service config reads `numReplicas: 1`, single region
  `asia-southeast1`. **There is no evidence the sweeps are double-running in steady state.**
- **Residual risk (real but narrower):** during a **rolling deploy** the outgoing and incoming
  containers overlap, and each runs the startup sweep on boot — so a double-run is possible per
  deploy, not continuously. There is no `SKIP LOCKED` on those paths.
- **Before working this:** verify actual concurrency directly rather than inferring it from a
  rate-limit symptom (e.g. instrument the sweep with a per-boot id and count distinct ids in one
  window, or check replica count at the moment of the run). Priority returns to **LOW-MEDIUM** —
  fragile-by-design, not actively firing.
- **Fix (single task):** Move both sweeps onto a BullMQ repeatable queue (daily), exactly like
  `brand-subscription-expiry` — the scheduler file already shows the pattern. Delete the interval
  block from `server.ts`.

## 10. No end-to-end/browser test coverage · TESTING, LOW-MEDIUM

- **What:** 454 tests, but all unit/integration. There is no Playwright/E2E suite; nothing drives
  browse → cart → checkout → webhook → order across app boundaries, and web/admin page rendering
  is only spot-tested (legal pages, footer, nav).
- **Why it matters:** The two hardest bugs in this repo's history were cross-boundary (Turbo env
  passthrough breaking Vercel builds; JWT-vs-DB-session middleware bounce). Unit tests can't catch
  that class. Also, PR #68 shipped an action with no UI wired to it — a render/E2E layer would
  have caught it.
- **Fix (single task):** Add one Playwright smoke spec against local `pnpm dev` + Docker: sign-in
  page renders, storefront lists a seeded product, `/seller/apply` shows the Turnstile widget.
  Expand later; don't boil the ocean.

## 11. Unmatched webhooks are logged and dropped · FRAGILE, LOW

- **What:** In `apps/api/src/routes/webhooks/hitpay.ts`, an event with no matching subscription
  (`no member_subscription found`, `no brand_subscription found`, `unrecognised event shape`) gets
  a `warn` log and a 200. Money may have moved with no durable record on our side. The order path
  is better (park-review + `processed_webhook_events`); the membership/brand paths predate it.
- **Why it matters:** Log lines on Railway are the only trace; they expire. An orphaned real
  payment would be invisible unless someone is watching logs that day.
- **Fix (single task):** On the three "not found / unrecognised" branches, also send an ops email
  via the existing mailer plugin (the `[BOMY Ops]` pattern from seller-inquiry alerts) or insert a
  row in a small `unmatched_webhook_events` table. Email is the smaller diff.

## 12. Dead/abandoned surfaces · HALF-FINISHED, LOW

- **`sessions` table** — JWT strategy means it accumulates no rows; still wired into the adapter.
  Harmless, but a future reader will assume DB sessions exist. Fix: comment on the schema file.
- **Facebook OAuth** — envs (`AUTH_FACEBOOK_*` in `turbo.json` and, since GAPS #6's fix,
  `.env.example` too) and no provider; Meta app review parked. Fix: done — GAPS #6 added the
  disabled-provider note.
- **Duplicate-charge "dismiss" workflow** — PR #72 deferred it; false positives need manual SQL.
  Fix: add a `dismiss` server action + button on the reconciliation page (pattern exists in
  `apps/admin/src/app/payouts/reconciliation/`).
- **`NEXT_PUBLIC_DEFAULT_LOCALE`** — env exists; no i18n implementation (EN→BM→ZH is roadmap).
- **USD dual-currency** — `currency` columns exist; everything hardcodes `"MYR"`. Intentional.
- **`handoff.md.bak`** in `.andy/` — stale byproduct, delete.
- **Remaining `withAdmin` exceptions** (documented in PR #87 log): `removeProductImage` (needs a
  DELETE RLS policy migration), checkout abandon/success-page store reads (needs a buyer-context
  read policy decision). Each is a well-scoped single migration + refactor when picked up.

## 13. ~~CI runs twice per PR and never exercises Next.js builds~~ · CLOSED · TECH DEBT, LOW

- **Status: CLOSED, both halves.**
  - **PR #128 (`7c3dee3`, 2026-08-10):** `push:` scoped to `branches: [main]`, matching
    `pull_request`'s scope. PR-branch pushes no longer double-fire CI. Diagnosed by Bob during
    PR #127's review (duplicate concurrent runs on the same commit were contending over shared
    Postgres/Redis test state, the likely cause of an intermittent
    `tests/checkout/preview.test.ts` rate-limit flake seen there).
  - **PR #129 (2026-08-10):** added a fourth `Build` job running `pnpm build` with dummy env
    values for everything `turbo.json`'s `build` task declares (auth, HitPay, Turnstile, app
    URLs, S3, DB URLs, mailer-disabled mode) — no Postgres/Redis services, verified both locally
    and in real CI that the build never touches a live DB. Closes the "never exercises Next.js
    builds" gap — breakage like the Turbo env-allowlist incident (fix `e7fc80f`) now surfaces in
    CI, not just at Vercel/Railway deploy time.

## 14. PSP coupling is split-brain: Stage 5 is PSP-agnostic, Stage 4 is HitPay-shaped · DESIGN INPUT, MEDIUM

- **What:** The codebase already half-anticipates a second PSP. `PSP_PROVIDERS = ["hitpay", "stripe"]`
  exists in `packages/db/src/types.ts:95`, and the Stage 5 checkout/order tables use generic columns
  (`checkout_sessions.psp_provider` defaulting `'hitpay'`, `psp_payment_request_id`, `psp_payment_id`,
  `psp_fee_sen`; `orders.psp_fee_allocated_sen`). But the Stage 4 subscription tables are HitPay-named
  (`member_subscriptions.hitpay_recurring_id/hitpay_payment_id`; `brand_subscriptions.hitpay_payment_request_id/
hitpay_payment_id/hitpay_fee_sen` — with a CHECK constraint spelling `hitpay_fee`; `duplicate_charges.
hitpay_payment_id/hitpay_refund_id`), and the runtime is HitPay-only: `packages/hitpay` is the sole PSP
  client, `apps/api/src/routes/webhooks/hitpay.ts` the sole webhook, `paymentsEnabled()`
  (`apps/web/src/lib/payments-enabled.ts`) keys on `HITPAY_API_KEY`/`HITPAY_API_URL` env presence,
  and ledger idempotency keys embed HitPay payment ids.
- **Why it matters:** Active design work (2026-07) aims to add Stripe alongside HitPay behind a
  PSP-agnostic layer with an admin toggle. Whoever builds it must know which layers are already
  generic (checkout schema) and which are coupled (subscription schema, webhook routing, fee
  extraction — HitPay sends `fees` in the webhook payload; Stripe requires a balance-transaction
  lookup, which interacts with the net-of-fees commission rule).
- **Fix:** Not a single task — this is the brainstorm's scope. Concrete first steps if decided:
  (a) migration renaming Stage 4 `hitpay_*` columns to `psp_*` + `psp_provider` column (or additive
  parallel columns to avoid rewriting constraints); (b) a `PaymentProvider` interface in a new
  `packages/psp` wrapping `@bomy/hitpay`; (c) replace `paymentsEnabled()`'s env sniff with a
  `platform_config.active_psp` read (the `platform_config` + admin `/config` page pattern already exists).

## 15. ~~Naming inconsistency: `bomy.my` vs `brandsofmalaysia.com`~~ · CLOSED · CONSISTENCY, LOW

- **Status (2026-08-03): CLOSED**, alongside GAPS #6. All three `MAIL_FROM` examples in root
  `.env.example` (`apps/api`, `apps/web`, `apps/admin` sections) updated from
  `noreply@bomy.my` to `noreply@brandsofmalaysia.com`, matching the code defaults and prod. No
  remaining `bomy.my` references outside this file's own historical description of the gap.
- **What (original):** The domain pivoted (PR #46) but `bomy.my` lingered in `.env.example`
  (`MAIL_FROM`), README, and older comments; `MAIL_FROM` defaults in code now use
  `contact@brandsofmalaysia.com`.
- **Why it mattered:** An agent copying `.env.example` into a new environment would configure a
  sender domain that no longer has SPF/DKIM.

## 16. ~~`bomy_app`'s entire privilege baseline is unreproducible from migrations~~ · CLOSED · FRAGILE, MEDIUM

- **Status (2026-07-29): CLOSED.** Migration `packages/db/drizzle/0027_bomy_app_least_privilege_grants.sql`
  is now the single source of truth for `bomy_app`'s entire privilege baseline — schema `USAGE`
  (`public`, `app`), all 34 table grants, and 5 named `app.*` function `EXECUTE` grants, applied as
  one atomic `DO $$ ... $$` block via `pnpm --filter @bomy/db migrate`. `policies.sql` §6 rewritten
  to mirror it exactly (including its `REVOKE ALL` declarative reset). CI's wildcard grant step
  deleted — the CI job now proves role setup + `migrate` alone is sufficient, every run. Prod
  runbook step 4 replaced with a note + `has_table_privilege` verification snippet.
  `packages/db/tests/grants.test.ts` (new, 146 assertions) checks every table × verb combination
  exactly, schema/function/sequence access, and one end-to-end `withTenant` chain proof — gated
  like `rls.test.ts`, currently fails on any environment still carrying old wildcard-granted state
  (by design; that's the test detecting real drift).
- **Least-privilege matrix went further than the original ask:** re-deriving each table's target
  grant from its actual RLS policy verbs (not just "reproduce the wildcard") surfaced that the
  wildcard was itself overgranting past what any policy permits on 7 more tables: `users` (had
  DELETE with no DELETE policy), `ledger_entries`/`platform_config_audit`/`admin_bypass_audit`/
  `processed_webhook_events` (had UPDATE+DELETE on append-only/evidence-trail/idempotency-guard
  tables), `brand_subscription_plans`/`duplicate_charges` (had DELETE with no DELETE policy). All
  now revoked — 17 excess privileges dropped total, across the original 3 (`user_consents`,
  `body_image_upload_log`, `store_category_assignments`) plus these 7 plus `accounts`/
  `verification_tokens` (narrowed to the actual `@auth/drizzle-adapter` contract, which has no
  `updateAccount`/`updateVerificationToken` method — read the vendored adapter source directly to
  confirm, not assumed).
- **Real bug found along the way:** the `users` overgrant was hiding a live test-hygiene bug —
  under FORCE RLS, a grant present with no matching permissive policy makes DELETE silently affect
  0 rows instead of erroring. Every test file's `tx.delete(users)` teardown had been silently
  failing; **13,480 total users / 11,435 matching `%@test.bomy`** had accumulated on the local dev
  DB. `apps/web/tests/auth/consent/actions.test.ts` had already independently discovered and
  documented this exact class of drift for `user_consents` rather than fixing it. Fixed both:
  stripped ~140 now-provably-dead teardown deletes across ~45 test files (behavior-preserving —
  they deleted 0 rows before, removing them still deletes 0 rows), and converted 4 tests that
  asserted "silent no-op" into deterministic `permission denied` assertions
  (`admin-bypass-audit.test.ts` UPDATE+DELETE, `order_webhook.test.ts` `processed_webhook_events`
  UPDATE+DELETE, `auth/consent/actions.test.ts` `user_consents` DELETE).
- **What (original):** `packages/db/src/rls/policies.sql` §6 grants `bomy_app` six things in one blanket
  block: `USAGE` on schema `public`, `USAGE` on schema `app`, full CRUD on `ALL TABLES IN SCHEMA
public`, `USAGE, SELECT` on `ALL SEQUENCES IN SCHEMA public`, and `EXECUTE` on `ALL FUNCTIONS`
  in both `app` and `public`. **None of this is in any numbered migration** — `migrate.mjs` only
  replays `packages/db/drizzle/*.sql`, and never touches `policies.sql`. Two places currently
  paper over the gap by hand-duplicating the identical SQL instead of running a tracked migration:
  `.github/workflows/ci.yml:101-114` (inline `psql` steps every CI run) and
  `docs/runbooks/public-deployment-cutover.md:60-67` (a manual step in the prod go-live runbook —
  almost certainly how Neon prod actually got its grants, PR #39 era). Local Docker's grants trace
  to the same undocumented origin. Concretely, `users`, `stores`, `ledger_entries`,
  `platform_config`, `platform_config_audit` (migration `0000`) and `accounts`, `sessions`,
  `verification_tokens` (migration `0001`) have zero `GRANT ... TO bomy_app` in any migration —
  every later migration (`0002`+) self-grants its own new table, but that convention didn't exist
  yet for the first 8. The `app` schema's helper functions (`app.current_user_id()` etc., called
  inside every RLS policy) rely on the same untracked `EXECUTE`/`USAGE` grants.
- **Why it matters:** rebuilding either environment strictly from the documented path
  (`pnpm --filter @bomy/db migrate` + `infra/docker/postgres-init/01_app_role.sql`) leaves
  `bomy_app` with zero privileges on `users` and friends — hard `permission denied` on login, not
  a silent bypass, but a real disaster-recovery/new-environment gap. Fresh Neon branch, restore
  from backup, or a contributor's clean Docker volume would all hit this.
- **Related, narrower issue:** the blanket grant is also **wider** than three tables' own
  migrations intend, so literally re-running it (as `tests/rls.test.ts`'s own documented recovery
  procedure instructs) would silently widen privileges:
  | Table | Migration grants | Wildcard adds |
  |---|---|---|
  | `user_consents` (0014) | `SELECT, INSERT` | `UPDATE`, `DELETE` (2 excess) |
  | `body_image_upload_log` (0021) | `SELECT, INSERT, DELETE` | `UPDATE` only (1 excess) |
  | `store_category_assignments` (0025) | `SELECT, INSERT, DELETE` | `UPDATE` only (1 excess) |

  RLS backstops all three today (no permissive UPDATE/DELETE policy exists where excluded) — not
  exploitable now, but a latent inconsistency baked into the "canonical" reference file.
