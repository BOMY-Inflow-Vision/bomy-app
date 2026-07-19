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

## 3. No rate limiting on any public endpoint · SECURITY, MEDIUM

- **Status (2026-07-15):** `apps/api` addressed. PR #90 added `@fastify/rate-limit` (global
  100/min/IP, `/webhooks/hitpay` 30/min, `/health`+`/ready` exempt, `trustProxy: 1`). The prod
  smoke then showed the API runs **multiple instances**, so the per-instance in-memory store did not
  actually throttle a load-balanced client. Follow-up PR moves the store to **shared Redis**
  (`REDIS_URL`, `skipOnError: true` fail-open). **Close only after the re-run prod smoke passes** —
  fresh connections should 429 past the cap. Web server-action throttling is still open (below).
- **Status (2026-07-19): STILL OPEN — the limiter keys on the wrong IP.** The post-#91 prod smoke
  sent 90 bad-signature `POST /webhooks/hitpay` over **fresh** connections → **0× 429**; 40 over a
  single keep-alive connection → 429 as expected. Cause: `trustProxy: 1` resolves `request.ip` to
  the **rightmost** X-Forwarded-For entry, which on Railway is an **edge-node IP that rotates per
  connection** (DataPacket SG, `152.233.x.x`) — not the client. Every connection gets a new key, so
  the cap never accumulates. The Redis store is necessary but cannot help while the **key** is
  wrong. Railway's edge HTTP log (`railway logs -s @bomy/api --http --json`) carries the real client
  in `srcIp`. **The correct hop must be proved, not guessed** — `GET /internal/ip-debug`
  (`ENABLE_IP_DIAGNOSTIC=1` + `INTERNAL_API_SECRET`) exists to run that probe; procedure in
  [`docs/runbooks/ip-diagnostic-probe.md`](docs/runbooks/ip-diagnostic-probe.md). The keying fix and
  the removal of that endpoint close this gap.
- **What:** `apps/api` is rate-limited but **not effectively** — the plugin is registered (#90/#91)
  and `/webhooks/hitpay` (HMAC before any DB work, good, but HMAC on unbounded bodies is still CPU)
  and `/me` carry caps, with `/health` + `/ready` exempt; the caps just don't bind because of the
  keying bug above. On web, server actions (checkout preview, address CRUD, profile edit) have no
  per-user throttle; only magic-link (cooldown) and seller-apply (Turnstile) are protected.
- **Where:** `apps/api/src/plugins/rate-limit.ts` + `trustProxy` in `apps/api/src/server.ts`; web
  server actions under `apps/web/src/app/**/actions.ts`.
- **Why it matters:** Griefing vector (junk load on Railway/Neon) and brute-force surface. Vercel
  and Cloudflare absorb some of this for web, but the Railway API is directly reachable.
- **Fix (remaining):** Run the probe runbook, then set a `keyGenerator` on the proved header and
  re-smoke. Web actions can wait.

## 4. Non-constant-time secret comparisons · SECURITY, LOW-MEDIUM

- **What:** Two bearer-style secrets are compared with `!==` instead of `timingSafeEqual`:
  - `apps/api/src/routes/internal/jobs.ts:23` — `INTERNAL_API_SECRET`
  - `apps/web/src/app/api/ops/db-identity/route.ts:26` — `BOMY_OPS_DIAGNOSTIC_TOKEN`
- **Why it matters:** Timing side-channels over the public internet are hard but not impossible;
  the codebase already uses `timingSafeEqual` everywhere else (`packages/hitpay/src/webhook.ts`,
  `apps/web/src/lib/s3.ts`), so this is also an internal inconsistency.
- **Fix (single task):** Extract the length-checked `timingSafeEqual` pattern from
  `packages/hitpay/src/webhook.ts` into a tiny helper (or inline it) at both sites. ~10 lines.

## 5. `parseSen` duplicated — abandoned "Task 11" consolidation · TECH DEBT, MEDIUM

- **What:** Two identical strict `"N.NN"` → bigint parsers exist:
  `apps/api/src/webhooks/hitpay/parse-sen.ts` (whose doc comment says "Task 11 will consolidate
  those") and a private copy in `apps/api/src/routes/webhooks/hitpay.ts:21`. Task 11 never happened.
- **Why it matters:** It's money parsing. If one copy is ever fixed/tightened and the other isn't,
  the membership path and the order path will disagree on what a valid amount is.
- **Fix (single task):** Delete the local `parseSen` in `routes/webhooks/hitpay.ts` and import from
  `../../webhooks/hitpay/parse-sen.js`. Run `pnpm --filter @bomy/api test --run`.

## 6. Documentation drift in load-bearing files · TECH DEBT, MEDIUM

- **What / where:**
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

## 7. Integration tests skip silently — local green ≠ CI green · TESTING, MEDIUM

- **What:** All RLS/integration suites are wrapped in `describe.skipIf(!shouldRun)` where
  `shouldRun = Boolean(DATABASE_APP_URL) && BOMY_RLS_READY === "1"`. Run `pnpm test` without those
  env vars and the suite passes while skipping the most important tests, with no loud signal.
- **Where:** Test files across `apps/*/tests/` and `packages/db/tests/`; env contract in `CLAUDE.md`.
- **Why it matters:** A future agent will "verify" a money/RLS change locally, see green, and ship
  something CI later rejects — or worse, tweak CI env and lose the coverage entirely.
- **Fix (single task):** Add a root `test:integration` script that fails fast if
  `DATABASE_APP_URL`/`BOMY_RLS_READY` are unset, and/or a vitest `globalSetup` that prints a
  RED "N integration suites SKIPPED" banner when the guard trips.

## 8. `makeDb()` silently falls back to the RLS-exempt owner role · FRAGILE, MEDIUM

- **What:** `packages/db/src/client.ts:45` — `url = DATABASE_APP_URL ?? DATABASE_URL`. The owner
  role (`bomy` / Neon owner) owns the tables, and table owners bypass RLS policies. Forget to set
  `DATABASE_APP_URL` and everything works — with tenant isolation quietly OFF.
- **Why it matters:** This exact class of misconfiguration is invisible in dev and catastrophic in
  prod. Prod currently sets `DATABASE_URL` to the `bomy_app` role (handoff §3) — i.e. safety
  currently depends on an env-naming convention, not code.
- **Fix (single task):** In `makeDb()`, when falling back to `DATABASE_URL`, log a one-line
  `console.warn("makeDb: DATABASE_APP_URL unset — RLS may not be enforced under the owner role")`.
  Optionally add a startup identity check (the `/api/ops/db-identity` route already proves
  `current_user` — reuse that query).

## 9. Per-instance `setInterval` jobs double-run under horizontal scale · FRAGILE, LOW-MEDIUM

- **What:** `expireCancelledMemberships` and `expireAbandonedPendingMemberships` run via
  `setInterval` in `apps/api/src/server.ts:53-84` — once per process. BullMQ jobs are deduplicated
  by Redis job schedulers; these two are not.
- **Why it matters:** ~~Today Railway runs one instance, so it's fine.~~ **Confirmed LIVE
  (2026-07-15):** the PR #90 prod smoke proved `apps/api` runs **multiple instances**, so these two
  sweeps are **already double-running** in prod. The updates are idempotent-ish and were not designed
  for it, and there is no `SKIP LOCKED` on those paths. Priority raised — this is now active, not
  hypothetical.
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
- **Facebook OAuth** — envs (`AUTH_FACEBOOK_*` in `turbo.json`, `AUTH_META_*` in `.env.example`)
  and no provider; Meta app review parked. Fix: one comment in `.env.example`.
- **Duplicate-charge "dismiss" workflow** — PR #72 deferred it; false positives need manual SQL.
  Fix: add a `dismiss` server action + button on the reconciliation page (pattern exists in
  `apps/admin/src/app/payouts/reconciliation/`).
- **`NEXT_PUBLIC_DEFAULT_LOCALE`** — env exists; no i18n implementation (EN→BM→ZH is roadmap).
- **USD dual-currency** — `currency` columns exist; everything hardcodes `"MYR"`. Intentional.
- **`handoff.md.bak`** in `.andy/` — stale byproduct, delete.
- **Remaining `withAdmin` exceptions** (documented in PR #87 log): `removeProductImage` (needs a
  DELETE RLS policy migration), checkout abandon/success-page store reads (needs a buyer-context
  read policy decision). Each is a well-scoped single migration + refactor when picked up.

## 13. CI runs twice per PR and never exercises Next.js builds · TECH DEBT, LOW

- **What:** `.github/workflows/ci.yml` triggers on both `push` (all branches) and `pull_request`
  (main) — every PR commit runs the matrix twice (concurrency groups differ per ref, so no cancel).
  Also no `pnpm build` job: Next build breakage (like the Turbo env-allowlist incident, fix
  `e7fc80f`) only surfaces at Vercel/Railway deploy time.
- **Fix (single task):** Change `push:` to `push: { branches: [main] }`; optionally add a fourth
  job running `pnpm build` with dummy env values.

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

## 15. Naming inconsistency: `bomy.my` vs `brandsofmalaysia.com` · CONSISTENCY, LOW

- **What:** The domain pivoted (PR #46) but `bomy.my` lingers in `.env.example` (`MAIL_FROM`),
  README, and older comments; `MAIL_FROM` defaults in code now use `contact@brandsofmalaysia.com`.
- **Why it matters:** An agent copying `.env.example` into a new environment would configure a
  sender domain that no longer has SPF/DKIM.
- **Fix:** covered by gap #6's `.env.example` sync.
