# Admin → Vercel migration — move apps/admin off Railway

> ✅ **COMPLETED — cutover 2026-07-21, Railway service decommissioned 2026-07-22.** This is a
> finished one-time procedure, **not an active runbook** — it is retained as a reference/template for
> future project migrations (see the agency model: each client project eventually migrates/transfers).
> Execution evidence: [`evidence/2026-07-21_admin-vercel-migration_prod.md`](./evidence/2026-07-21_admin-vercel-migration_prod.md).

|                      |                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audience**         | Charlie (project owner). Requires Vercel team admin, Cloudflare DNS edit, and Google Cloud Console access — no role below owner can complete this. |
| **Environments**     | prod only (`admin.brandsofmalaysia.com`). No staging equivalent exists.                                                                            |
| **Owner**            | Andy                                                                                                                                               |
| **Revision**         | 3 — 2026-07-20 (rev 2 corrected after Bob re-review of PR #94)                                                                                     |
| **Reversible until** | **Step 11.** Steps 1–10 are additive or single-edit-revertible; **deleting the Railway service in Step 11 is the destructive boundary.**           |

> Moves the live admin console from Railway (Docker `standalone`) to Vercel, keeping
> `admin.brandsofmalaysia.com`. Supersedes the _hosting_ half of `admin-custom-domain.md`; that
> runbook's Cloudflare and OAuth facts still apply and are reused here.

## 0. Why this move (do not re-derive a cost rationale)

Consolidation, **not** cost. Railway Hobby is a **$5/mo floor that includes $5 of usage** — post-move
usage (api + Redis only) is expected to land under $5, so removing admin from Railway saves ≈ **$0**.
The wins are: admin sits on the same platform as `apps/web`, it is free on the existing Vercel
account, and the deploy story simplifies to _"Vercel for the Next apps, Railway for the Fastify job
host"_.

**Vercel plan:** stay on the **free/Hobby** plan for now; upgrade to **Pro at the `checkout_enabled`
flip**. Hobby is non-commercial-use only per Vercel's ToS and BOMY is a registered company, so this
is a knowing, accepted deviation — `apps/web` is already on Hobby on the same business domain, which
is the larger exposure. Two things force Pro earlier: **Bob needing dashboard access** (Hobby is
single-account) and **Password Protection on previews** (Pro-only — until then, admin preview URLs
are publicly reachable and guarded only by the app's own `requireAdmin`).

## 1. The build path is PINNED — do not rely on Vercel's default

`apps/admin/vercel.json` pins the build command:

```json
{ "buildCommand": "turbo build --filter=@bomy/admin" }
```

**Why pinned rather than defaulted.** Turborepo strips every env var not declared in `turbo.json`
`env`/`passThroughEnv`. Whether Vercel's _default_ build for an app Root Directory runs Turbo or a
bare `next build` is genuinely ambiguous — Vercel's generic monorepo guidance and its Turborepo
guidance are not consistent with each other, and a platform default can change under us regardless.
Pinning makes the behaviour reviewable in git and makes the `turbo.json` declarations load-bearing
by construction.

> **An earlier revision of this runbook claimed the Vercel default runs Turbo, and used that to
> assert the first deploy would lock admins out of OAuth. That was asserted without verification and
> is retracted.** The `turbo.json` additions (`AUTH_URL` → `env`; `INTERNAL_API_SECRET`, `LOG_LEVEL`
> → `passThroughEnv`) are correct and necessary _given the pinned Turbo build_, and remain useful
> hardening for CI regardless.

No `cd ../..` in the build command: Turbo is available globally on Vercel and resolves the
configured Root Directory itself, and Vercel's Root Directory rules can reject `..` traversal.

> Verified locally via `pnpm exec turbo build --filter=@bomy/admin --dry=json`: the task resolves to
> **`@bomy/admin#build`** in `apps/admin`, with `AUTH_URL` in `env` and `INTERNAL_API_SECRET` +
> `LOG_LEVEL` in `passThroughEnv`. Note `turbo` is **not** on `PATH` in a plain local shell (it is a
> workspace dev-dependency) — reproduce with `pnpm exec turbo …`. On Vercel it is global, which is
> why the pinned command needs no prefix.

### 1A. Hard gate — the deploy log must show Turbo

After the first deploy (Step 5), open the Vercel **deployment log** and confirm it shows Turbo
executing the admin build, e.g.:

```
@bomy/admin#build
```

**A bare `next build` with no Turbo task line FAILS this gate.** If you see that, the `vercel.json`
was not picked up (usually a wrong Root Directory) — stop and fix it before going further, because
every env var in `turbo.json` is then being handled differently than this runbook assumes.

## 2. Pre-flight checklist

- [ ] PR #94 is merged to `main` (carries `vercel.json` + the `turbo.json` declarations).
- [ ] You can create projects in the Vercel team that owns the BOMY projects — **team ID
      `team_rSvF6LShlwNoVTCB2p2rD6hk`** (key on the ID; the slug/name are volatile — this is Charlie's
      shared agency dev team, renamed several times, and the BOMY projects are slated to transfer to a
      dedicated **Team BOMY** on Pro at go-live).
- [ ] You can edit **Cloudflare DNS** for `brandsofmalaysia.com`.
- [ ] You can edit the **admin Google OAuth client** in Google Cloud Console (the one supplying
      `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` to the admin service).
- [ ] Admin is currently reachable on Railway: `curl -sI https://admin.brandsofmalaysia.com/` → `307`.
- [ ] **Record the current DNS state as rollback evidence** — before touching anything.

      **Capture the target and configured TTL from the Cloudflare dashboard**, not from `dig`.
      `dig` reports a recursive resolver's *remaining cache TTL*, not the value configured in
      Cloudflare (which is often `Auto`) — so it cannot be trusted as the rollback value.

      ```sh
      dig +noall +answer admin.brandsofmalaysia.com   # secondary: independent public-DNS evidence
      ```

      Write the Cloudflare-configured CNAME target and TTL into the evidence file (§12). This is the
      rollback target; do not rely on memory or on a generic value.

### 2A. Retrieving the current Railway env values

**Use the Railway dashboard only.** Read values one at a time from the service's Variables tab.

- ❌ **`railway variable get` does not exist.** CLI 5.18.0 supports only `list`, `set`, `delete`.
- ❌ **Never `railway variable list --kv` or `--json`** — both print raw values for _every_ secret on
  the service.

## 3. Environment variables

**Baseline rule: copy every variable currently configured on the Railway `@bomy/admin` service,
one-for-one.** The table below is the audited inventory to check that copy against — it is a
completeness aid, not a substitute for the one-for-one copy. Anything present on Railway and absent
here should be treated as a gap in this table, not as a variable to drop.

Derived from `apps/admin/.env.example`, a `process.env` sweep of `apps/admin`, **and** the env
readers inside the packages it imports (`@bomy/db`, `@bomy/mailer`, `@bomy/hitpay`).

| Var                      | Required                              | Value / note                                                                                                                |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | ✅                                    | Neon, **`bomy_app` role** — asserted in §7, not assumed                                                                     |
| `AUTH_SECRET`            | ✅                                    | **Must match `apps/web` exactly**                                                                                           |
| `AUTH_URL`               | ✅                                    | **Staged — see §6.** Not the final value at first deploy.                                                                   |
| `AUTH_GOOGLE_ID`         | ✅                                    | Read **implicitly** by NextAuth v5 — no `process.env` reference in source, so a grep will not find it. Easiest var to miss. |
| `AUTH_GOOGLE_SECRET`     | ✅                                    | as above                                                                                                                    |
| `NEXT_PUBLIC_API_URL`    | ✅                                    | `https://bomyapi-production.up.railway.app`                                                                                 |
| `INTERNAL_API_SECRET`    | ✅                                    | **Feature parity** — admin→api job triggers. Must match `apps/api`.                                                         |
| `HITPAY_API_KEY`         | ✅                                    | **Feature parity** — `memberships/actions.ts` **throws** without it (membership cancellation, payout reconciliation)        |
| `HITPAY_API_URL`         | ✅                                    | as above                                                                                                                    |
| `APP_URL`                | ✅ when `EMAIL_DELIVERY_ENABLED=true` | `https://brandsofmalaysia.com` — used to build links in outbound mail                                                       |
| `EMAIL_DELIVERY_ENABLED` | ○                                     | `true`/`false`. When `true`, the mailer **throws at construction** unless `SMTP_HOST` and `MAIL_FROM` are set.              |
| `SMTP_HOST`              | ✅ when delivery enabled              |                                                                                                                             |
| `SMTP_PORT`              | ○                                     | defaults `587`                                                                                                              |
| `SMTP_SECURE`            | ○                                     | `true`/`false`                                                                                                              |
| `SMTP_USER`              | ○                                     | **`SMTP_USER` and `SMTP_PASS` must both be set or both absent** — the mailer throws on a mismatch                           |
| `SMTP_PASS`              | ○                                     | as above                                                                                                                    |
| `MAIL_FROM`              | ✅ when delivery enabled              |                                                                                                                             |
| `MAIL_REPLY_TO`          | ○                                     |                                                                                                                             |
| `LOG_LEVEL`              | ○                                     | default `info`                                                                                                              |

> **`DATABASE_APP_URL` is deliberately absent.** Prod points `DATABASE_URL` itself at `bomy_app`.
> Setting `DATABASE_URL` to an _owner_-role string makes everything work while **RLS silently does
> not fire** — see `CLAUDE.md` gotchas, and §7 which exists precisely to catch that.

## 4. Create the Vercel project

- Vercel → **Add New → Project** → import `BOMY-Inflow-Vision/bomy-app`.
- **Root Directory:** `apps/admin` ← the single most important setting; `vercel.json` is read from here.
- **Framework preset:** Next.js. **Do not override the Build Command** — `vercel.json` supplies it.
- Add every var from §3 to **Production**, with `AUTH_URL` **omitted for now** (§6).
- Deploy. **Do not add the custom domain yet.**

## 5. First deploy — verify the build path

- [ ] **§1A gate passes:** deployment log shows Turbo running `@bomy/admin#build`.
- [ ] Deployment succeeds.
- [ ] Note the **stable project alias** (`<project>.vercel.app`) — §6 needs it.

## 6. Stage `AUTH_URL` (this is why the naive order fails)

**NextAuth rewrites the incoming request's origin to `AUTH_URL`** (`reqWithEnvURL` in
`next-auth/lib/env.js`). So if `AUTH_URL` is already the custom domain while you are testing on
`*.vercel.app`, the OAuth callback is sent to the custom domain — **which Railway is still
serving**. The test would either fail on cross-host cookies or silently exercise Railway instead of
Vercel, proving nothing.

Sequence:

1. Set `AUTH_URL=https://<project>.vercel.app` (the alias from §5). **Redeploy** — env changes do
   not affect existing deployments.
2. Google Cloud Console → admin OAuth client → **Authorised redirect URIs** → add, keeping the
   existing Railway entry:

   ```
   https://<project>.vercel.app/api/auth/callback/google
   ```

3. Complete a **full Google sign-in against `https://<project>.vercel.app`** and confirm you land in
   the console as an admin. **This is the real proof that Vercel serves admin correctly.** Do not
   proceed until it passes.
4. Only after Step 8's checks: set `AUTH_URL=https://admin.brandsofmalaysia.com` and **redeploy
   again** — before the DNS cutover in §9.

## 7. Assert the DB role (RLS is not proven by a successful read)

A page that loads data proves nothing about RLS: an owner-role connection returns identical rows
while bypassing RLS entirely. The session's own `current_user` settles the **role-identity**
question — which is the specific mistake this gate catches. It does not settle RLS itself.

### 7A. 🔴 Link gate — this assertion CAN false-pass, and silently

**The repository root is linked to the `bomy-app` (web) project** — check `.vercel/project.json`,
`projectName: "bomy-app"`. `vercel env run` uses **the linked project's** variables. So running this
from the repo root reads **web's** Production env, and because **web already uses `bomy_app`, the
assertion passes green while telling you nothing about the admin project.** A gate that can only
false-pass is worse than no gate.

**❌ Never run this from the repository root. Never rely on the root `.vercel` link.**

Link `apps/admin` to its own project explicitly:

```sh
cd apps/admin
vercel link            # select the NEW admin project — not bomy-app
```

Verify the resulting link before trusting anything downstream:

```sh
cat .vercel/project.json     # you are in apps/admin — projectName must be the admin project
vercel project inspect                  # cross-check ID/name against the dashboard
```

- [ ] `apps/admin/.vercel/project.json` exists and names the **admin** project (it does **not**
      exist before this step).
- [ ] Project **name and ID** match the dashboard, and are recorded in the evidence file (§12).

Then, **from `apps/admin`** (the `pnpm --filter` command resolves correctly from here):

```sh
vercel env run -e production -- pnpm --filter @bomy/db ops:db-role:assert
```

`vercel env run` passes project variables to the command without writing them to disk. The script
reads `DATABASE_URL` **explicitly** (no `DATABASE_APP_URL` fallback), connects through the same
`makeDb()` path admin uses, runs `SELECT current_user::text`, prints only the role and non-secret
status text — **never the connection string** — always closes the connection, and **exits non-zero
unless the role is exactly `bomy_app`**.

> **Scope:** this is a **role-identity gate**, not an RLS audit. It proves which role the connection
> authenticates as — which is what catches an owner-role `DATABASE_URL`. Actual RLS enforcement also
> depends on role attributes (`BYPASSRLS`), table ownership, and the policies. Do not cite a green
> result as proof that RLS is on.

- [ ] Output is `current_user: bomy_app` and `OK: expected limited role confirmed…`, exit `0`.
- [ ] Secondary preflight (cheap, non-authoritative): the configured `DATABASE_URL` visibly begins
      `postgresql://bomy_app:`.

> **If `DATABASE_URL` is changed at any point afterwards, re-run this assertion AND redeploy** —
> Vercel env changes do not apply to existing deployments.

## 8. Pre-cutover functional verification (still on `*.vercel.app`)

- [ ] Full Google sign-in completes (§6.3).
- [ ] An admin page loads and reads data.
- [ ] An admin **action** writes — proves `requireAdminId` + the `withAdmin` audit path.
- [ ] A manual job trigger reaches `apps/api` — proves `INTERNAL_API_SECRET` matches.
- [ ] A membership/payout screen that constructs the HitPay client loads without throwing — proves
      `HITPAY_API_KEY`/`HITPAY_API_URL` are present.
- [ ] §7 DB-role assertion is green.

### 8A. 🔴 Gate the FINAL deployment — the OAuth proof above does not cover it

Perform §6.4 now: set `AUTH_URL=https://admin.brandsofmalaysia.com` and redeploy.

**That redeploy produces a NEW deployment.** Everything proven in §5–§8 was proven against the
_alias-configured_ deployment, which this one replaces. An unverified build must never be what DNS
is pointed at.

Against the **final deployment's own generated URL**, not the alias.

> **Copy the generated URL verbatim from the deployment page.** Do NOT construct it from the
> deployment ID: Vercel deployment IDs (`dpl_…`) are a different identifier from generated
> deployment URLs, which are built from project name, a unique hash, and scope. ID and URL are
> recorded as **separate** evidence fields.

- [ ] Deployment status is **successful**.
- [ ] **§1A Turbo gate repeated** — its log shows `@bomy/admin#build`, not a bare `next build`.
- [ ] HTTP health: `curl -sI https://<generated-deployment-url>/` → `307`.
- [ ] **Record both the deployment ID and the generated URL** in the evidence file (§12) —
      separately, and separately from the first deployment.

> Sign-in cannot be completed end-to-end against the generated URL at this point, because
> `AUTH_URL` now points at the custom domain that Railway still serves. That is expected: the
> full-domain OAuth proof is §10, immediately after DNS. These gates confirm the artefact is sound
> before cutover; §10 confirms the flow after it.

## 9. DNS cutover

**Certificate first.** Vercel recommends pre-generating the certificate during migrations where
uninterrupted service matters — do not wait until after DNS has moved.

1. Vercel → project → **Settings → Domains** → add `admin.brandsofmalaysia.com`. Vercel will show a
   **project-specific target** and a domain/cert status.
2. **Use only the target Vercel displays for this project.** Do not paste a generic value from
   memory or another guide.
3. **Cert-ready gate:** wait until Vercel reports the certificate issued / domain ready **before**
   editing DNS. If Vercel requires DNS to resolve first for validation, use its verification `TXT`
   record path rather than moving the live `CNAME` early.
4. Cloudflare → `brandsofmalaysia.com` → **DNS → Records** → edit the existing `admin` CNAME:
   - **Target:** the Vercel target from step 1.
   - **Proxy status:** **DNS only (grey cloud)** — same reasoning as `admin-custom-domain.md` §1;
     let the platform terminate TLS directly.
   - **TTL:** match what you recorded in §2, unless deliberately lowering it beforehand.
5. Verify:

   ```sh
   dig +short admin.brandsofmalaysia.com          # expect the Vercel target
   curl -sI https://admin.brandsofmalaysia.com/   # expect 307
   ```

**Rollback:** restore the CNAME target and TTL recorded in §2. Railway is still deployed and serving
until §11, so this restores service in one DNS edit.

## 10. Post-cutover verification

- [ ] `curl -sI https://admin.brandsofmalaysia.com/` → `307`
- [ ] Full Google sign-in completes **on the real domain**.
- [ ] Admin read + admin write both work.
- [ ] `brandsofmalaysia.com` still `200` — untouched, but confirm.

## 11. Decommission Railway admin — the destructive boundary

**Leave Railway running at least one full working day after §10 is green.** Only then:

- Remove `admin.brandsofmalaysia.com` from the Railway `@bomy/admin` service **first** (frees the
  domain claim), then delete the service.
- Remove the `*.vercel.app` redirect URI from the Google OAuth client if no longer wanted.
- ⚠️ **`railway status` links `@bomy/admin` as the default service.** Once it is gone, re-link the
  project or pass `--service @bomy/api` explicitly on **every** Railway CLI command. Several
  procedures in `.andy/handoff.md` §1A depend on this.
- `apps/admin/Dockerfile` was removed in a follow-up PR (#99) once decommission was verified — it
  was the Railway rollback path and is dead code now that admin runs on Vercel.

## 12. Evidence template

Capture under `docs/runbooks/evidence/YYYY-MM-DD_admin-vercel-migration_prod.md`.

**Redaction rules — record names and results, NEVER values.** No connection strings, no secrets, no
tokens. Redact the operator's egress IP as `[OPERATOR-EGRESS]`, consistent with the IP-probe
evidence file.

```markdown
# Admin → Vercel migration — prod — YYYY-MM-DD

- Operator: Charlie
- Started / finished (UTC):
- Runbook revision: 3

## Project link (§7A)

- Admin project NAME:
- Admin project ID:
- `apps/admin/.vercel/project.json` verified against dashboard: YES / NO
- Confirmed NOT run from repo root (root links to `bomy-app`): YES / NO

## Build path

- Vercel project alias:
- Deployment ID (first, alias-configured):
- §1A Turbo gate: PASS / FAIL — paste the `@bomy/admin#build` log line

## Environment

- Variable NAMES configured (no values):
- Any Railway variable NOT carried over, and why:

## DB role assertion (§7) — role identity only, NOT an RLS audit

- Run from `apps/admin` (not repo root): YES / NO
- Command exit code:
- current_user result:

## OAuth

- Sign-in on \*.vercel.app (alias deployment): PASS / FAIL
- Sign-in on custom domain (§10): PASS / FAIL
- Redirect URIs registered:

## Final deployment (§8A — after AUTH_URL -> custom domain)

- Deployment ID (final, `dpl_…`):
- Generated URL (copied verbatim from the deployment page):
- Status successful: YES / NO
- Turbo gate repeated: PASS / FAIL — paste the log line
- `curl -sI <generated URL>`:

## DNS

- BEFORE — Cloudflare-configured target + TTL (rollback value):
- BEFORE — `dig` output (secondary evidence):
- AFTER — target + TTL:
- Certificate ready BEFORE DNS edit: YES / NO
- dig / curl results:

## Rollback

- Rollback target recorded: YES / NO
- Rollback exercised: YES / NO — if yes, what happened

## Decommission

- Railway admin deleted (date):
- Railway CLI default-service re-link done: YES / NO
```
