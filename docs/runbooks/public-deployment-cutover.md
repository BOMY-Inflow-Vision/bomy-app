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

**If the first preview build fails to resolve workspace packages from `apps/web`** (look for errors like "Cannot find module '@bomy/db'" in the build log): switch to the fallback — see Task 4 of `app/docs/superpowers/plans/2026-06-04-pr39-public-deployment.md` to add a `vercel.json` with explicit commands. Otherwise continue.

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
- [ ] `/brands/[slug]/subscribe` gating verified by unit + integration tests (Task 1, Step 17 of the plan). Deployed smoke is opportunistic — if any seeded `/brands/<slug>/subscribe` URL exists, smoke it; otherwise mark N/A.
- [ ] `curl https://<preview-url>/terms | rg "\[PLACEHOLDER:"` returns nothing. Repeat for /privacy /refund /shipping /contact.
- [ ] `curl https://<preview-url>/membership | rg -i "hitpay"` returns nothing user-visible. Repeat for /brands/<slug>/subscribe if seeded.
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
