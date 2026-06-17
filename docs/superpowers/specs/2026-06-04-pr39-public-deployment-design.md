# PR #39 — Public deployment of `apps/web` to brandsofmalaysia.com

**Date:** 2026-06-04
**Author:** Andy
**Approver:** Charlie
**Type:** Public deployment + first hosted database. Code surface: ~4 new files + 4 modified files + 1 runbook (the `paymentsEnabled()` helper + CTA gating across `/membership` and `/brands/[slug]/subscribe` is the largest code touch); operational surface is large.
**Stage 5+ sub-stage:** Second of four PRs (#38 → #41) toward HitPay sandbox/API access restoration. PR #38 shipped the legal/business identity content surface; PR #39 publishes it; PR #40 (if needed) realizes product seed for the reviewer; PR #41 (operational) submits to HitPay.

---

## 1. Goal

Ship `apps/web` to `https://brandsofmalaysia.com` backed by a hosted Postgres so the public storefront is reviewable by HitPay. PR #39 does NOT itself unblock HitPay restoration — it produces the live URL the reviewer will browse. PR #41 submits.

**Locked decisions (Charlie 2026-06-04):**

- Web-only minimum scope. `apps/api` and `apps/admin` stay local.
- Hosted Postgres via Vercel Marketplace → Neon, ap-southeast-1 (Singapore).
- Apex domain `https://brandsofmalaysia.com` primary; `www.brandsofmalaysia.com` 308-redirects to apex.
- Preview-first cutover, then auto-deploy on push to `main`.
- Full sign-in works in prod (real OAuth + AUTH_SECRET).
- Real Cloudflare Turnstile keys for `brandsofmalaysia.com`.
- Mail/SMTP deferred to PR #40+.
- Runtime DB role: `bomy_app` (NOT Neon owner). Direct/unpooled connection string (NOT pooled).
- Shared review DB for Preview + Production environments — no Neon preview branching in PR #39.

---

## 2. In scope

- Provision Neon Postgres via Vercel Marketplace; apply BOMY migrations; create `bomy_app` role with RLS-bound grants.
- Two connection strings: Neon owner direct/unpooled (operator-shell only, for migrations) and `bomy_app` direct/unpooled (Vercel runtime).
- Create Vercel project `bomy-web` linked to GitHub repo `BOMY-Inflow-Vision/bomy-app`; root directory `apps/web`.
- Attach `brandsofmalaysia.com` and `www.brandsofmalaysia.com` as production domains; set apex as primary, www as 308-redirect.
- Register OAuth callbacks at Google Cloud Console + Meta Developers for `https://brandsofmalaysia.com`.
- Register Cloudflare Turnstile site for `brandsofmalaysia.com`.
- Set the Vercel env contract (§5) for the Production environment.
- Ship a tiny secret-gated diagnostic route (`apps/web/src/app/api/ops/db-identity/route.ts`) that proves the runtime DB connection uses `bomy_app`.
- Ship a `paymentsEnabled()` helper + page-level CTA gating + server-action early-return guards for `/membership` and `/brands/[slug]/subscribe`, so a reviewer click cannot trigger `HITPAY_API_KEY is required` throws while HITPAY envs are unset.
- Write `docs/runbooks/public-deployment-cutover.md` with the full cutover sequence, smoke checklist, and rollback procedures.
- Update `apps/web/.env.local.example` with the new diagnostic-token env var + a comment on the `paymentsEnabled()` gating behavior.

## 3. Out of scope

Tracked in the post-merge handoff backlog:

- **`apps/api` deployment** (Fastify + BullMQ scheduler + webhooks). Needs a persistent-process host (Railway / Render / Fly.io); separate PR. Until then: no HitPay webhook target, no scheduled jobs in prod. `checkout_enabled = false` keeps that surface dormant.
- **`apps/admin` deployment.** Internal ops console; runs locally.
- **Real HitPay keys / `checkout_enabled` flip.** Blocked on HitPay restoration. `HITPAY_*` envs intentionally unset in Vercel.
- **Outbound mail in prod.** `@bomy/mailer` silently skips when SMTP unset (per the dispatch-axis convention from PR #35). `/seller/apply` succeeds; applicant ack + ops alert do not send. PR #40+ ships a transactional provider + brandsofmalaysia.com SPF/DKIM/DMARC.
- **Product seed realism.** PR #40 if reviewer-visible `/products` is too sparse. Decide after first prod smoke.
- **Production-grade DB posture.** Neon hobby/free tier is acceptable for the review window; HA, PITR tooling beyond Neon defaults, replica reads, and external backup tooling deferred.
- **Pooled vs direct URL split by code path.** Today `makeAuthDb()` sets `app.bypass_rls = true` at the connection level, which is incompatible with PgBouncer transaction-mode pooling; using direct/unpooled across the board is safe at review-traffic scale. Future PR refactors so short transactions use pooled and long-session ops use direct.
- **`@bomy/db` env-name refactor.** Today `makeDb()` and `makeAuthDb()` read `DATABASE_URL`; tests read `DATABASE_APP_URL`. PR #39 sets BOTH envs to the same `bomy_app` direct/unpooled string for forward-compat but does NOT touch the code. Future PR switches the env-read order.
- **Neon preview-branch automation.** Shared review DB is fine while PR #39's diff has no schema changes.
- **Redis / MinIO / Mailhog production analogues.** Web doesn't need them; api/admin do (deferred).
- **`apps/web` → `apps/api` connection (`NEXT_PUBLIC_API_URL`).** Left unset in prod since api isn't deployed.
- **Production cutover runbook for `checkout_enabled` flip.** Separate `docs/runbooks/checkout-enabled-prod-cutover.md` after HitPay restoration.
- **Cookie / PDPA consent banner, Freshdesk widget, `/about` page, sign-in/sign-up ToS consent flow modification, contact form** — all from the PR #38 backlog and still deferred.

## 4. Approach

**Topology:**

```
GitHub repo (main + PR branches)
   │
   ▼ push trigger
Vercel project: bomy-web   (root: apps/web)
   ├─ Production env  → https://brandsofmalaysia.com       (auto-deploy on push to main)
   └─ Preview env     → *.vercel.app           (auto-deploy on push to non-main branches)
   │
   ▼ runtime connection (override Marketplace default)
Neon Postgres (aws-ap-southeast-1)
   ├─ Owner role: provisioned by Neon (migrations only, operator shell)
   └─ App role: bomy_app (manually created; NOSUPERUSER NOBYPASSRLS; RLS enforced)
   │
   ├─ Auth providers:
   │    Google Cloud + Meta Developers
   │    Callback URLs: https://brandsofmalaysia.com/api/auth/callback/{google,facebook}
   │
   └─ Bot defence:
        Cloudflare Turnstile (site registered for brandsofmalaysia.com)
```

`apps/api` and `apps/admin` keep running locally; ops operate them via `pnpm --filter @bomy/{api,admin} dev`. Production has no api/admin surface.

**Why this shape:**

- Vercel covers Next.js natively and is the leading host in the project's loaded skills (`vercel:*`). Marketplace integration auto-handles Neon provisioning + env injection.
- Apex domain matches the `contact@brandsofmalaysia.com` email convention introduced in PR #38; HitPay reviewer sees a brand-clean URL.
- Direct/unpooled connection string sidesteps PgBouncer transaction-mode limits on session-level GUCs — specifically `makeAuthDb`'s connection-level `app.bypass_rls = 'true'` set, which the pooler cannot guarantee across transactions.
- `bomy_app` runtime role is non-negotiable: storefront reads, seller-inquiry writes, and the NextAuth Drizzle adapter all run through RLS. Letting Neon's auto-injected owner role serve runtime traffic silently disables RLS (owner bypasses by default) and would be a security regression vs the locally enforced contract.

**Why this is NOT a "split into sub-PRs" candidate:**

- The work has a strict ordering: provision DB → create role → migrate → set envs → smoke preview → attach domain → merge → smoke prod. Each step is small in isolation; the value comes from the sequence completing.
- The code diff is moderate (~4 new files + 4 modified files + 1 runbook). The bulk of the work is still operator runbook execution against Vercel + Neon + Cloudflare + Google + Meta dashboards; the code changes are surgical (one helper, two CTA gatings, two action guards, one diagnostic route, env-example update).

## 5. Env contract (Vercel project envs)

All Production-scope unless noted.

| Var                                                                        | Source                                           | Value/notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                             | **Operator** (overrides Marketplace default)     | **`bomy_app` direct/unpooled** Neon connection string. Vercel's Marketplace integration injects the owner-role pooled URL by default — replace it explicitly. App code reads this env; setting it wrong silently bypasses RLS.                                                                                                                                                                                                                                             |
| `DATABASE_APP_URL`                                                         | **Operator**                                     | Same `bomy_app` direct/unpooled string. Apps/web does NOT read this today; setting it for forward-compat so a future `@bomy/db` refactor switches env-read order with no env-rewire cost.                                                                                                                                                                                                                                                                                  |
| `BOMY_RLS_READY`                                                           | Locked                                           | `1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AUTH_SECRET`                                                              | Generated                                        | `openssl rand -base64 32` — server-only; never committed                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `NEXTAUTH_URL`                                                             | Locked                                           | `https://brandsofmalaysia.com` — keeping repo's existing env-name convention (Auth.js v5 reads both `AUTH_URL` and `NEXTAUTH_URL`; only set one to avoid drift)                                                                                                                                                                                                                                                                                                            |
| `APP_URL`                                                                  | Locked                                           | `https://brandsofmalaysia.com`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `AUTH_GOOGLE_ID`                                                           | Google Cloud Console                             | OAuth client ID; brandsofmalaysia.com registered as authorized origin + callback                                                                                                                                                                                                                                                                                                                                                                                           |
| `AUTH_GOOGLE_SECRET`                                                       | Google Cloud Console                             | OAuth client secret                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AUTH_FACEBOOK_ID`                                                         | Meta Developers                                  | OAuth app ID; brandsofmalaysia.com registered as valid OAuth redirect URI                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AUTH_FACEBOOK_SECRET`                                                     | Meta Developers                                  | OAuth app secret                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY`                                            | Cloudflare Turnstile (brandsofmalaysia.com site) | Public site key                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TURNSTILE_SECRET_KEY`                                                     | Cloudflare Turnstile (brandsofmalaysia.com site) | Server-only secret                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `BOMY_OPS_DIAGNOSTIC_TOKEN`                                                | Generated                                        | `openssl rand -hex 32`; gates the `/api/ops/db-identity` diagnostic route. Setting the env enables the route; unsetting disables it (route 404s).                                                                                                                                                                                                                                                                                                                          |
| `NEXT_PUBLIC_DEFAULT_LOCALE`                                               | Locked                                           | `en`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Intentionally unset in PR #39:**                                         |                                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `HITPAY_API_KEY` / `HITPAY_API_URL` / `HITPAY_SALT` / `HITPAY_WEBHOOK_URL` | —                                                | No HitPay creds. **`checkout_enabled = false` only gates cart checkout** — it does NOT gate `/membership` or `/brands/[slug]/subscribe`, both of which call `hitpayClient()` directly and would throw `HITPAY_API_KEY is required` if invoked. PR #39 ships a `paymentsEnabled()` helper that gates these CTAs (§6) and adds an early-return guard to the affected server actions. Once HitPay restoration lands, set these envs and re-enable the CTAs in a follow-up PR. |
| `NEXT_PUBLIC_API_URL`                                                      | —                                                | apps/api not deployed; **unset** (NOT `http://localhost:3001` — that would leak local intent to clients)                                                                                                                                                                                                                                                                                                                                                                   |
| `MAILER_*` / SMTP host/port/user/pass / `OPS_ALERT_EMAILS` / `ADMIN_URL`   | —                                                | Mail deferred; `@bomy/mailer` skips silently                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `NODE_ENV`                                                                 | —                                                | Vercel sets `production` automatically; do NOT override                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Preview environment** mirrors Production envs EXCEPT:

- OAuth provider callbacks recognize only `https://brandsofmalaysia.com`, not `*.vercel.app`. Sign-in is render-only in preview; full sign-in smoke happens against prod after DNS attach.
- **Turnstile keys differ between Preview and Production** (a Turnstile site is hostname-bound; the brandsofmalaysia.com prod site key would not validate on `*.vercel.app`):
  - **Preview env:** Cloudflare-published always-pass test keys — `NEXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`. Preview Turnstile smoke proves only widget render + happy-path token round-trip; honest abuse-resistance smoke happens in prod.
  - **Production env:** real brandsofmalaysia.com-bound Turnstile site key + secret key (the §5 row above).
- All other smoke checks (legal routes, /products, /cart, /seller/apply render + diagnostic-route role check) are valid in preview.

## 6. File structure

| Path                                                                     | Action      | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/api/ops/db-identity/route.ts`                          | Create      | Secret-gated diagnostic route. `export const dynamic = "force-dynamic"` (no cache, no static optimization). **Auth-first ordering — strict:** (1) read `BOMY_OPS_DIAGNOSTIC_TOKEN` env; if unset → `new Response(null, { status: 404 })`. (2) compare `x-bomy-ops-token` header to the env; if missing or mismatch → `new Response(null, { status: 404 })`. (3) ONLY AFTER token match: invoke a **lazy local singleton** for `makeDb()` (module-level `let _client = null`; initialize on first authorized call), run `SELECT current_user::text`, return `{ "currentUser": "<role>" }`. Rationale: a missing/bad `DATABASE_URL` must not turn an unauthorized request into a 500 — the 404 contract is honest only if auth runs before any DB-touching code path. No body / no role / no route / no env details on any 404.                   |
| `apps/web/tests/api/ops/db-identity.test.ts`                             | Create      | 4 cases: (a) `BOMY_OPS_DIAGNOSTIC_TOKEN` unset → 404 empty body; (b) token set + header missing → 404 empty body; (c) token set + header mismatch → 404 empty body; (d) token set + header match → 200 with `{ currentUser: "<role>" }` shape (role string asserted non-empty; specific value not pinned because CI runs as owner role). **Lazy-DB / auth-first proof:** cases (a/b/c) must additionally assert `makeDb()` is NOT invoked — implement via `vi.mock("@bomy/db", ...)` spy on `makeDb` and assert the spy was not called on unauthorized paths. This proves the route honors the auth-first contract even if `DATABASE_URL` is missing/bad. Authorized-case env: `DATABASE_URL=<bomy_app-conn-str>` (NOT just `DATABASE_APP_URL` — the route reads `DATABASE_URL`), `BOMY_RLS_READY=1`, `BOMY_OPS_DIAGNOSTIC_TOKEN=<test-token>`. |
| `apps/web/src/lib/payments-enabled.ts`                                   | Create      | Server-only helper: `paymentsEnabled(): boolean` returns `true` iff `process.env["HITPAY_API_KEY"]` AND `process.env["HITPAY_API_URL"]` are both non-empty. Single source of truth for "can we initiate a HitPay flow today." No DB reads, no async — pure env check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `apps/web/tests/lib/payments-enabled.test.ts`                            | Create      | Unit tests for the helper: env both set → true; either missing → false; both blank-string → false. No DB / no Postgres needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/web/src/app/(marketing)/membership/page.tsx`                       | Modify      | Conditionally render the "Join membership" CTA based on `paymentsEnabled()`. When false, replace CTA with a disabled-state element + short text ("Memberships will reopen soon" or similar; final copy locked in plan). Server component reads the helper at render time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/web/src/app/(marketing)/membership/actions.ts`                     | Modify      | Add an early-return guard at the top of `joinMembership()`: if `!paymentsEnabled()`, return `{ ok: false, error: "Payments temporarily unavailable" }` (or the existing action's error-shape convention) BEFORE the existing `hitpayClient()` call. Defence-in-depth — page-level CTA gating is primary; this is the seatbelt for direct invocation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/web/src/app/brands/[slug]/subscribe/page.tsx`                      | Modify      | Same gating pattern as the membership page: conditional CTA based on `paymentsEnabled()`. (Note: this is the same file PR #38 commit `59b4c70` already touched to remove the HitPay processor claim; PR #39 adds the CTA gating on top.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/web/src/app/brands/[slug]/subscribe/actions.ts`                    | Modify      | Same early-return guard pattern as the membership action: short-circuit before `hitpayClient()` when `!paymentsEnabled()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `apps/web/tests/membership/actions.test.ts` (or `.unit.test.ts`)         | Modify      | Existing file. Add a case asserting `joinMembership()` returns the guard error when HITPAY env is unset AND `HitPayClient` is never instantiated — use a `vi.mock("@bomy/hitpay", ...)` spy on the `HitPayClient` constructor to prove no instantiation on the unauthorized path. Plan pins whether the case lives in `actions.test.ts` or `actions.unit.test.ts` (the latter is the unit-only file; helper-only assertions fit there).                                                                                                                                                                                                                                                                                                                                                                                                         |
| `apps/web/tests/brand-subscription/actions.test.ts` (or `.unit.test.ts`) | Modify      | Existing file. Same guard-case + `HitPayClient` non-instantiation assertion for the brand-subscribe action (`subscribeBrand` or the action's actual export name; plan pins).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apps/web/.env.local.example`                                            | Modify      | Add `BOMY_OPS_DIAGNOSTIC_TOKEN=` with a comment explaining it gates `/api/ops/db-identity`. Also add a comment under `HITPAY_API_KEY=` noting that when unset, membership + brand-subscribe CTAs render disabled via `paymentsEnabled()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/runbooks/public-deployment-cutover.md`                             | Create      | Full operator runbook: pre-flight, cutover sequence, smoke checklist (preview + prod), rollback procedures, env-rotation procedures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `vercel.json`                                                            | Conditional | Only create if the default Vercel project-root path fails to resolve workspace packages from `apps/web`. See §7 fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Files explicitly NOT touched:**

- `packages/db/*` — no schema changes; existing migrations apply as-is to Neon.
- `packages/db/src/index.ts`, `packages/db/src/tenant.ts`, `apps/web/src/auth.ts`, `apps/web/src/auth.config.ts` — the `DATABASE_URL` vs `DATABASE_APP_URL` env-name refactor is deferred (see §3).
- `apps/api/*`, `apps/admin/*` — not deployed.
- `apps/web/next.config.ts` — `transpilePackages` + `webpack.resolve.extensionAlias` config from PR #37 stays as-is.
- `apps/web/package.json` — no new deps; the diagnostic route uses existing `@bomy/db` + `drizzle-orm` imports.
- `.github/workflows/ci.yml` — no CI changes in PR #39; existing test job continues to use the GitHub Actions Postgres service.

## 7. Cutover sequence (locked operator runbook)

The full runbook lives in `docs/runbooks/public-deployment-cutover.md`. This section is the locked sequence the runbook codifies.

**Pre-flight (operator checklist before starting):**

- brandsofmalaysia.com registered + nameservers controllable (or DNS managed at registrar with apex A record + CNAME-on-www permissions).
- Cloudflare account exists (free tier is sufficient).
- Google Cloud Console + Meta Developers accounts with permission to register OAuth apps.
- Vercel account exists (Charlie's; team or personal); GitHub repo access ready to grant.
- Existing mail DNS records (MX / SPF / DKIM / DMARC) on brandsofmalaysia.com noted so they are preserved.

**Sequence:**

1. **Provision Neon via Vercel Marketplace.**
   - Install Neon from Vercel Marketplace; choose Vercel-managed integration.
   - Project name: `bomy-review`. Region: AWS ap-southeast-1 (Singapore).
   - Capture both connection strings Neon provides: pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED` (owner role).

2. **Create `bomy_app` role on Neon** (before migrations — migration `0002_store_and_inquiries.sql` has unconditional `GRANT … TO bomy_app` and will fail otherwise).

   Using the Neon SQL console connected as owner:

   ```sql
   CREATE ROLE bomy_app LOGIN PASSWORD '<generated>' NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOBYPASSRLS;
   GRANT CONNECT ON DATABASE <neon-db-name> TO bomy_app;
   ```

3. **Apply migrations from operator shell** (NOT from Vercel):

   ```sh
   DATABASE_URL=<neon-owner-DIRECT-unpooled> pnpm --filter @bomy/db migrate
   ```

4. **Post-migration grants safety pass** (mirrors `.github/workflows/ci.yml`; the `IF EXISTS (SELECT 1 FROM pg_roles …)` blocks in later migrations skip silently if the role wasn't visible mid-migration):

   ```sql
   GRANT USAGE ON SCHEMA public TO bomy_app;
   GRANT USAGE ON SCHEMA app TO bomy_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bomy_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bomy_app;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO bomy_app;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bomy_app;
   ```

5. **Construct `bomy_app` direct/unpooled connection string** by substituting role + password into Neon's direct host pattern (the same host as `DATABASE_URL_UNPOOLED`, different credentials).

6. **Create Vercel project** `bomy-web`:
   - Link to GitHub repo `BOMY-Inflow-Vision/bomy-app`.
   - Root directory: `apps/web`.
   - Framework preset: Next.js (auto-detected).
   - Default install/build commands. Vercel should resolve workspace packages (`@bomy/db`, `@bomy/mailer`, `@bomy/hitpay`) from the root `pnpm-lock.yaml`.
   - **Fallback** (only if the first preview build fails to resolve workspace packages): switch Root Directory to repo root, add a `vercel.json` with explicit commands (`installCommand: "pnpm install --frozen-lockfile"`, `buildCommand: "pnpm --filter @bomy/web build"`, `outputDirectory: "apps/web/.next"`). Commit `vercel.json` only if needed.

7. **Set Vercel envs** per the §5 table:
   - **Production scope:**
     - **Override** Marketplace-injected `DATABASE_URL` with the `bomy_app` direct/unpooled string from step 5.
     - Set `DATABASE_APP_URL` to the same string.
     - Set `BOMY_RLS_READY=1`, `AUTH_SECRET`, `NEXTAUTH_URL`, `APP_URL`, OAuth IDs/secrets, **real brandsofmalaysia.com Turnstile keys** (set after step 9), `BOMY_OPS_DIAGNOSTIC_TOKEN`, `NEXT_PUBLIC_DEFAULT_LOCALE`.
   - **Preview scope (Turnstile only — diverges from prod):**
     - `NEXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA`
     - `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`
     - Cloudflare's documented always-pass test keys. Required because the prod Turnstile site is hostname-bound to `brandsofmalaysia.com` and would not validate on `*.vercel.app` preview URLs. All other Preview envs mirror Production (same DB, same auth secrets, etc.).

8. **Register OAuth callbacks:**
   - Google Cloud Console: add `https://brandsofmalaysia.com` as authorized JavaScript origin AND `https://brandsofmalaysia.com/api/auth/callback/google` as authorized redirect URI on the OAuth 2.0 client.
   - Meta Developers: add `https://brandsofmalaysia.com/api/auth/callback/facebook` as valid OAuth redirect URI on the app's Facebook Login product config.

9. **Register Cloudflare Turnstile site** for `brandsofmalaysia.com`:
   - Widget mode: Managed.
   - Hostnames: `brandsofmalaysia.com` (and `www.brandsofmalaysia.com` if it serves before redirect).
   - Capture site key + secret key into the Vercel envs.

10. **Push the PR #39 branch** → Vercel builds a preview at `https://bomy-web-<hash>.vercel.app`.

11. **Smoke the preview** (§8 preview-smoke checklist). Treat any RED check as a hard gate.

12. **Attach domains** `brandsofmalaysia.com` (production primary) and `www.brandsofmalaysia.com` (308 → apex) to the Vercel project.

13. **Configure DNS at the registrar:**
    - Apex `@` `A` → `76.76.21.21` (Vercel anycast).
    - `www` `CNAME` → exact value from `vercel domains inspect brandsofmalaysia.com` (project-specific).
    - **PRESERVE** existing `MX`, `SPF` (TXT), `DKIM` (TXT), `DMARC` (TXT) records — `contact@brandsofmalaysia.com` is public from PR #38. Do NOT delegate nameservers to Vercel unless these are migrated first.

14. **Bob R0 review** of the PR #39 diff (code surface is small — diagnostic route + runbook + maybe vercel.json) + Vercel checks green.

15. **Charlie's explicit "Merge now"** → squash-merge as `feat(web): public deployment to brandsofmalaysia.com (#39)` → Vercel auto-deploys main to production env.

16. **Wait DNS propagation** (5–60 min depending on registrar TTLs).

17. **Smoke production** at `https://brandsofmalaysia.com` (§8 production-smoke checklist).

18. **Post-merge bookkeeping** (PR log, handoff refresh, memory updates, `project_hitpay_creds_blocker.md` update).

19. **Rotate `BOMY_OPS_DIAGNOSTIC_TOKEN`** (or unset it) once production smoke is green and you no longer need the route active. The route 404s with no env set.

## 8. Smoke criteria

**Preview smoke (hard gate before merge):**

- [ ] Vercel preview build succeeded; build log shows `@bomy/db`, `@bomy/mailer`, `@bomy/hitpay` resolved from workspace (not from a published registry).
- [ ] Runtime DB role identity proven via `/api/ops/db-identity` with the correct `x-bomy-ops-token` header → response `{"currentUser":"bomy_app"}`. **Hard gate**: if response is anything else (owner role, 404 because env not set, etc.), abort cutover and fix env.
- [ ] All 5 legal routes (`/terms`, `/privacy`, `/refund`, `/shipping`, `/contact`) return 200.
- [ ] `/` (home) returns 200; Footer visible.
- [ ] `/products` returns 200 (catalog may be sparse — that's PR #40's decision, not a PR #39 blocker).
- [ ] `/cart` returns 200 (empty-cart UI).
- [ ] `/seller/apply` renders with Turnstile widget visible (no yellow "Form temporarily unavailable" banner) — preview uses Cloudflare always-pass test keys, so the widget renders + auto-passes; this proves the wire-up, not real abuse resistance.
- [ ] `/membership` renders the gated state (no "Join membership" payment CTA — replaced by the `paymentsEnabled()`-false disabled element + soft copy).
- [ ] **`/brands/[slug]/subscribe` gating is hard-gated by unit + integration tests** (`vi.mock` non-instantiation of `HitPayClient` + early-return guard test). **Deployed smoke is opportunistic only**: if Neon has an active store with an active brand subscription plan seeded, smoke a real `/brands/<seeded-slug>/subscribe` URL and confirm the gated CTA. If no seed exists, mark this smoke item N/A — product/brand seed realism is explicitly PR #40 scope and PR #39 does not require a seeded brand-subscribe URL to exist. (Membership CTA gating is unconditional smoke because `/membership` is a static route that always resolves.)
- [ ] No `[PLACEHOLDER:` substring anywhere in rendered HTML.
- [ ] No "HitPay" substring anywhere in user-rendered HTML (re-runs the PR #38 §5 audit on the deployed URL).
- [ ] Vercel **runtime/function logs during smoke** have no `MissingSecret` from NextAuth middleware. (Note: MissingSecret is logged at request-time from middleware, not at build-time. Check the Vercel project → Logs → Runtime/Function tab for the smoke window.)

**Production smoke (hard gate before declaring done):**

- All preview-smoke checks above, executed at `https://brandsofmalaysia.com`, **with one difference**: Turnstile uses the **real brandsofmalaysia.com-bound site key + secret key**, NOT the Cloudflare always-pass test keys used in Preview. The `/seller/apply` smoke must complete a real Turnstile challenge (not auto-pass) before validating the server-side `verifyTurnstile()` round-trip. If the prod Turnstile widget fails to render or validate, that is a hard gate failure — investigate the Cloudflare site config before rolling forward.
- [ ] `https://www.brandsofmalaysia.com` 308-redirects to `https://brandsofmalaysia.com`.
- [ ] `/api/ops/db-identity` with correct token returns `{"currentUser":"bomy_app"}`.
- [ ] Google sign-in round-trip succeeds; creates a NextAuth DB session row in Neon.
- [ ] Meta sign-in round-trip succeeds OR documented gap if Meta approval lags (not a merge blocker; Bob notified in PR comments).
- [ ] `/seller/apply` end-to-end: Turnstile token verifies, DB row appears in `seller_inquiries`, server action returns success. Applicant ack + ops alert DO NOT send — expected; mailer logs the skip per [[feedback-email-dispatch-axis]].
- [ ] `platform_config.checkout_enabled` = `false` confirmed via Neon SQL console.

## 9. Rollback procedures

**Trigger conditions** (any one fires rollback):

- A production-smoke "Hard gate" check fails.
- 5xx rate > 1% in the first hour post-merge (Vercel dashboard metric).
- Sign-in callback fails end-to-end (catastrophic auth misconfiguration).
- DB identity check returns the owner role instead of `bomy_app`.

**Escalating procedures** (try fast first, slow last):

- **Code rollback (fast, <30 s):** Vercel dashboard → Deployments → previous green production deploy → "Promote to Production." Reverts code without DNS or DB changes. Use for any code-level defect.
- **Env rollback:** if a wrong env (e.g. owner-role DB URL) is in production, fix in Vercel dashboard → Settings → Environment Variables, then trigger a redeploy. No code change.
- **DNS rollback (slow, 5–60 min propagation):** Vercel project → Domains → remove `brandsofmalaysia.com`. Restore previous A record at registrar. Use only if Vercel itself is unreachable or the deployment is unrecoverable.
- **DB rollback (last resort):** Neon point-in-time-restore to a timestamp before the failed migration. PR #39's migration step is forward-only; if a migration breaks production, restore + investigate offline.
- **Diagnostic route disable:** unset `BOMY_OPS_DIAGNOSTIC_TOKEN` in Vercel envs → redeploy → route 404s.

All procedures + step-by-step commands live in `docs/runbooks/public-deployment-cutover.md` §Rollback.

## 10. Risks + mitigations

| Risk                                                                                                                                                             | Mitigation                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketplace-injected `DATABASE_URL` (owner role + pooled) is not overridden; runtime silently bypasses RLS.                                                      | **§8 hard gate** — diagnostic route must return `bomy_app`. Smoke fails fast. Documented as the #1 risk in the runbook pre-flight section.                                                                          |
| `makeAuthDb()` connection-level `app.bypass_rls=true` fails on PgBouncer-pooled connection (pooler can't guarantee session GUC persistence across transactions). | Runtime uses direct/unpooled connection string throughout PR #39. Future PR splits pooled/direct by code path.                                                                                                      |
| Migration `0002` fails because `bomy_app` doesn't exist yet.                                                                                                     | Sequence locks `bomy_app` creation BEFORE migrations. Codified in runbook step 2 → step 3 ordering.                                                                                                                 |
| OAuth callbacks registered wrong; sign-in works in dev but fails in prod.                                                                                        | Smoke includes prod sign-in round-trip. Meta-lag escape hatch: documented gap acceptable if Meta approval pending.                                                                                                  |
| DNS propagation slower than expected, extending cutover window.                                                                                                  | Runbook says "5–60 min expected"; pre-cutover comms recommended. Non-fatal.                                                                                                                                         |
| Vercel can't resolve workspace packages from `apps/web` root.                                                                                                    | Fallback: switch Vercel root to repo root + add explicit `vercel.json`. Documented in runbook step 6.                                                                                                               |
| Diagnostic route leaks DB role info to non-ops.                                                                                                                  | Token-gated; missing/wrong token → 404 (not 403, to avoid even confirming the route exists). No connection strings, hostnames, DB names, env dumps, or role lists in the response. Token rotates/unsets post-smoke. |
| `apps/web` runtime needs an env we forgot.                                                                                                                       | Preview smoke catches before merge; Vercel build logs are explicit; the §5 table is the locked single source of truth for what must be set.                                                                         |
| `/seller/apply` succeeds but ops gets no email — confused-ops scenario.                                                                                          | Runbook + handoff backlog explicitly document "query `seller_inquiries` table directly until mail PR ships."                                                                                                        |
| Neon free tier hits quota under HitPay reviewer load.                                                                                                            | Unlikely for review traffic; monitor Neon dashboard during the HitPay review window; paid-tier upgrade path is one dashboard click.                                                                                 |
| Cookie / consent gap visible to PDPA-aware reviewer.                                                                                                             | Privacy §11 ("essential cookies only") covers the current state; consent banner is backlog.                                                                                                                         |

## 11. PR workflow

**Branch:** `feat/public-deployment` off `main`.

**Commit order (4 conventional commits + 1 conditional; squashed at merge):**

1. `feat(web): add paymentsEnabled() helper + gate /membership and /brands/[slug]/subscribe CTAs` — `apps/web/src/lib/payments-enabled.ts` + helper test + the 4 page/action files + their action tests.
2. `feat(web): add secret-gated DB identity diagnostic route` — `apps/web/src/app/api/ops/db-identity/route.ts` + test file + `.env.local.example` update for `BOMY_OPS_DIAGNOSTIC_TOKEN`.
3. `docs(specs): add PR #39 public deployment design` — already committed as `22bdcc1`; the amendments from this review iteration will be in a follow-up `docs(specs): amend PR #39 design (Charlie R0)` commit.
4. `docs(runbooks): public deployment cutover for brandsofmalaysia.com` — `docs/runbooks/public-deployment-cutover.md`.
5. (Conditional) `chore(web): add vercel.json for monorepo root build` — only if the default-path build fails and fallback is needed.

**Squash message at merge:** `feat(web): public deployment to brandsofmalaysia.com (#39)`

**PR body** (drafted to `.andy/pr39-description.md` during preview-smoke phase; carry-forward per PR #36/#37/#38 pattern):

- Goal + scope + sub-stage context.
- Full §5 env contract table.
- Full §8 smoke checklist.
- Bob R0 review points (below).
- Out-of-scope list.

**Bob R0 review points (6):**

1. **DB role contract** — runtime `DATABASE_URL` is `bomy_app` direct/unpooled, not Marketplace-default. Diagnostic route smoke gate present and tested.
2. **Migration order** — `bomy_app` role created BEFORE `pnpm --filter @bomy/db migrate` runs (codified in runbook step 2 → 3).
3. **No code-level changes to `@bomy/db` or auth wrappers** — the env-name refactor is deferred per §3.
4. **Payment-CTA gating** — `paymentsEnabled()` helper covers `/membership` + `/brands/[slug]/subscribe` pages AND a defence-in-depth early-return guard in both server actions; no path can throw `HITPAY_API_KEY is required` from a reviewer click.
5. **No public HitPay processor claim** introduced (re-runs the PR #38 §5 audit on the new diagnostic route + runbook content + gated-CTA copy).
6. **Diagnostic route security** — `export const dynamic = "force-dynamic"` set; token-gated; missing/wrong token → empty-body 404 (not 403, not info-leaking); response only `{ currentUser: "<role>" }`; test coverage for all four cases.

**Acceptance criteria (must all be green for merge):**

- [ ] Preview-smoke hard gates all pass at the Vercel preview URL.
- [ ] `DATABASE_URL=<bomy_app-direct-unpooled> DATABASE_APP_URL=<bomy_app-direct-unpooled> BOMY_RLS_READY=1 BOMY_OPS_DIAGNOSTIC_TOKEN=<test-token> pnpm --filter @bomy/web test` green (note: `DATABASE_URL` must be set because the diagnostic route reads `DATABASE_URL` via `makeDb()`; setting only `DATABASE_APP_URL` is insufficient).
- [ ] `pnpm typecheck` green.
- [ ] `pnpm lint` green (`--max-warnings 0`).
- [ ] Bob R0 sign-off on the 6 points.
- [ ] Charlie's explicit "Merge now"; squash-merge.
- [ ] **Post-merge:** production smoke (§8) hard gates all pass at `https://brandsofmalaysia.com`; PR log written; handoff refreshed; memory entries saved (`project_pr39_complete.md` + `project_hitpay_creds_blocker.md` update). Branch cleanup pending Charlie's approval per standing rule.

---

## 12. Acceptance summary

PR #39 is acceptance-ready when:

- [ ] All 4 mandatory PR commits (+ optional vercel.json fallback) land on `feat/public-deployment` (squash-merge target).
- [ ] Preview-smoke hard gates pass at the Vercel preview URL — especially the `currentUser=bomy_app` diagnostic check AND the gated-state assertions on `/membership` + `/brands/[slug]/subscribe`.
- [ ] `DATABASE_URL=<bomy_app-direct-unpooled> DATABASE_APP_URL=<bomy_app-direct-unpooled> BOMY_RLS_READY=1 BOMY_OPS_DIAGNOSTIC_TOKEN=<test-token> pnpm --filter @bomy/web test` green; `pnpm typecheck`, `pnpm lint` green.
- [ ] Bob R0 sign-off on the 6 review points.
- [ ] Charlie's explicit "Merge now"; squash-merge.
- [ ] Production-smoke hard gates pass at `https://brandsofmalaysia.com` after DNS attach.
- [ ] Diagnostic-route token rotated or unset after smoke.
- [ ] Post-merge: log, handoff, memory entries, branch cleanup gate.
