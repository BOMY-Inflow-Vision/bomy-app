# Admin → Vercel migration — prod — 2026-07-21 → 2026-07-22

- Operator: Charlie (executed via Andy)
- Started / finished (UTC): **not retained precisely** — cutover 2026-07-21, decommission 2026-07-22.
- Runbook revision: 3

> Written after the fact from the execution session's tool outputs. Details not actually captured at
> the time are marked **"not retained"** rather than reconstructed. Redaction per
> `evidence/README.md`: no secrets, no `DATABASE_URL` strings. No operator egress IP was captured in
> this migration (that was a separate task), so none appears here.

## Project link (§7A)

- Admin project NAME: `bomy-app-admin`
- Admin project ID: **not retained** (the MCP token in use could not enumerate the newly-created
  project; the CLI link was confirmed by its own `✓ Linked …/bomy-app-admin` output instead).
- Team: `team_rSvF6LShlwNoVTCB2p2rD6hk` (slug volatile — was `ck-projects-my`, renamed during session)
- `apps/admin/.vercel/project.json` verified: N/A — CLI 56.x with a git-connected project does not
  write that file; link confirmed via `✓ Linked ck-projects-my/bomy-app-admin` CLI output.
- Confirmed NOT run from repo root (root links to `bomy-app`/web): YES — `vercel link` + `vercel env
run` executed from `apps/admin`.

## Build path (§1A)

- Vercel production alias: `bomy-app-admin.vercel.app`
- Deployment ID (first): **not retained** (`dpl_…` not captured; generated-URL hash was the record)
- §1A Turbo gate: **PASS** — build log (2026-07-21 ~09:08 UTC) showed:
  ```
  Running "turbo build --filter=@bomy/admin"
  • Packages in scope: @bomy/admin
  @bomy/admin:build: cache miss, executing …
  ```
  from `main @ dc17e01`, Root Directory `apps/admin`. Not a bare `next build`.

## Environment

- Variable NAMES configured (Production): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_API_URL`, `INTERNAL_API_SECRET`, `LOG_LEVEL`. (Values not recorded.)
- Not carried over, and why: HitPay + email/SMTP vars — the Railway `@bomy/admin` service never had
  them (lazy call-time reads; those admin features were already inert on Railway). `DATABASE_APP_URL`
  intentionally omitted (prod `DATABASE_URL` is the `bomy_app` role).

## DB role assertion (§7) — role identity only, NOT an RLS audit

- Run from `apps/admin` (not repo root): YES
- Command: `vercel env run -e production -- pnpm --filter @bomy/db ops:db-role:assert`
- Exit code: `0`
- `current_user` result: `bomy_app`
- Genuineness check: `apps/admin/.env.local` (written by `vercel link`) held only `VERCEL_OIDC_TOKEN`,
  no competing `DATABASE_URL` — so the result came from the injected Production value.

## OAuth

- Sign-in on `*.vercel.app` alias (§6): **PASS** — landed on the admin dashboard.
- Sign-in on custom domain (§10): **PASS** — landed on the dashboard on `admin.brandsofmalaysia.com`.
- Redirect URIs registered: `admin.brandsofmalaysia.com/api/auth/callback/google` (kept) +
  `bomy-app-admin.vercel.app/api/auth/callback/google` (added for pre-cutover test).

## Final deployment (§8A — after AUTH_URL → custom domain)

- Deployment ID (final, `dpl_…`): **not retained**
- Generated URL: `bomy-app-admin-ntiqcj58u-…vercel.app` (source `main @ dc17e01`)
- Status successful: YES
- Turbo gate repeated: **PASS** — redeploy build log (2026-07-21 ~10:04–10:06 UTC) showed
  `Running "turbo build --filter=@bomy/admin"` → `@bomy/admin:build: cache bypass, force executing`.
- `AUTH_URL` effect confirmed: alias `bomy-app-admin.vercel.app` → `307` →
  `https://admin.brandsofmalaysia.com/auth/sign-in`.
- Note: bare per-deployment URLs sit behind Vercel Deployment Protection (`302 → vercel.com/sso-api`);
  verification used the production alias, which is not protected.

## DNS (§9)

- BEFORE — Cloudflare-configured target: `t395rdyh.up.railway.app`
- BEFORE — configured TTL (rollback value): **not retained** — captured only `dig` cache TTL (`300`),
  not the Cloudflare dashboard-configured value (likely `Auto`). Runbook §2/§9 flag this as a gap to
  avoid next time.
- BEFORE — `dig` (secondary evidence): `admin.brandsofmalaysia.com CNAME t395rdyh.up.railway.app`
- AFTER — target: `71440500c87f3d6a.vercel-dns-017.com` (→ `64.29.17.x` / `216.198.79.x`), grey-cloud
- Certificate ready BEFORE DNS edit: **NO** — cert issued ~1–2 min AFTER DNS pointed (subdomain CNAME;
  Railway kept serving during propagation, so no observed gap). First HTTPS attempt: `SSL_ERROR_SYSCALL`;
  after cert issuance: `HTTP/2 307`, `ssl_verify=0`, `x-vercel-id: sin1::…`.

## Post-cutover verification (§10)

- `curl -sI https://admin.brandsofmalaysia.com/` → `307` ✓
- Full Google sign-in on the real domain → dashboard ✓
- Admin read + admin write both worked ✓
- `brandsofmalaysia.com` (storefront) still `200` ✓

## Post-migration fix (PR #95) — function region

- Symptom: admin slow after cutover. Cause: functions defaulted to `iad1` (Washington DC) while Neon
  is in Singapore; admin reads Neon directly.
- Evidence (`x-vercel-id` = `edge::compute::id`): admin `sin1::iad1` vs web `sin1::sin1`.
- Fix: `regions: ["sin1"]` pinned in `apps/admin/vercel.json` (#95). After redeploy: admin
  `x-vercel-id` → `sin1::sin1`. Confirmed.

## Rollback

- Rollback target recorded: PARTIAL — target `t395rdyh.up.railway.app` yes; configured TTL no (above).
- Rollback exercised: NO — cutover succeeded; Railway kept as warm fallback until decommission.

## Decommission (§11) — 2026-07-22

- Removed `admin.brandsofmalaysia.com` from the Railway `@bomy/admin` service (verified: service URL
  reverted to `bomyadmin-production.up.railway.app`; custom domain still served by Vercel, unaffected).
- Deleted the `@bomy/admin` service (kept `@bomy/api` + `Redis-Ue90`).
- Verified: `bomyadmin-production.up.railway.app` → `404` (was `307`); `railway status` shows only
  `@bomy/api` + `Redis-Ue90`; live `admin`(Vercel)/`api`/`storefront` all `200`.
- Railway CLI default-service re-link: link auto-resolved to `@bomy/api`; pass `--service @bomy/api`
  explicitly to be safe.
- `apps/admin/Dockerfile` removed in PR #99 (dead code once decommission verified).
