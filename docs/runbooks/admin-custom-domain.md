# Admin custom domain — apps/admin to admin.brandsofmalaysia.com

> **Operator runbook.** Moves the live admin console from its raw Railway URL
> (`https://bomyadmin-production.up.railway.app`) onto the branded
> `admin.brandsofmalaysia.com`. The admin app is **already deployed and working**
> on Railway; this is a domain + auth-URL cutover only — no code deploy.

## 0. Facts this runbook is built on

- **Admin host today:** `https://bomyadmin-production.up.railway.app` → `307` → `/auth/sign-in` (working).
- **Auth:** NextAuth v5, **Google OAuth only** (`apps/admin/src/auth.config.ts`). Callback path: `/api/auth/callback/google`.
- **Base URL is env-driven:** the admin service's **`AUTH_URL`** env var on Railway is the canonical public URL NextAuth uses to build the sign-in/callback redirects. It currently points at the Railway URL (visible in the 307 `callbackUrl`).
- **DNS:** `brandsofmalaysia.com` is on **Cloudflare** (`arturo/sima.ns.cloudflare.com`); the apex is Cloudflare-proxied.

## 1. The load-bearing gotcha (read first)

**In Cloudflare the `admin` CNAME MUST be set to "DNS only" (grey cloud), NOT proxied (orange cloud).**

Railway issues a Let's Encrypt cert for the custom domain by validating the CNAME points at its edge. If Cloudflare proxies the record (orange), Railway can't validate/serve its cert and you get TLS handshake / `525`/`526` errors. Grey-cloud (DNS only) lets Railway terminate TLS directly. This is the single most common failure for Railway-behind-Cloudflare custom domains.

## 2. Pre-flight checklist

- [ ] You can edit the **`bomy/admin`** service in the Railway dashboard.
- [ ] You can edit **Cloudflare DNS** for `brandsofmalaysia.com`.
- [ ] You can edit the **admin Google OAuth client** in Google Cloud Console (the one whose ID/secret are the admin service's `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`).
- [ ] Admin is currently reachable: `curl -sI https://bomyadmin-production.up.railway.app/` → `307`.

## 3. Cutover sequence

> Admin stays reachable on the Railway URL throughout — this is additive until the final `AUTH_URL` switch, so it's low-risk and reversible.

### Step 1 — Add the custom domain in Railway

- Railway → project → **`bomy/admin`** service → **Settings → Networking → Custom Domain** → add `admin.brandsofmalaysia.com`.
- Railway shows a **CNAME target** (looks like `<hash>.up.railway.app` or similar). **Copy it** — Step 2 needs it. Railway will show the domain as "waiting for DNS".

### Step 2 — Add the Cloudflare DNS record

- Cloudflare → `brandsofmalaysia.com` → **DNS → Records → Add record**:
  - **Type:** `CNAME`
  - **Name:** `admin`
  - **Target:** `<the Railway CNAME target from Step 1>`
  - **Proxy status:** **DNS only (grey cloud)** ← see §1. Do NOT use the orange cloud.
  - **TTL:** Auto
- Save.

### Step 3 — Wait for DNS + Railway cert

- Verify DNS resolves to Railway (operator shell):

  ```sh
  dig +short admin.brandsofmalaysia.com
  ```

  Expected: the Railway CNAME target (or its resolved IPs). If it returns Cloudflare IPs (`104.21.*` / `172.67.*`), the record is still proxied — go back to Step 2 and set grey cloud.

- In Railway, wait until the custom domain shows **Active / cert issued** (usually 1–5 min after DNS resolves).

### Step 4 — Add the new Google OAuth redirect URI

> Do this BEFORE switching `AUTH_URL`, or the first sign-in on the new domain fails with `redirect_uri_mismatch`.

- Google Cloud Console → **APIs & Services → Credentials** → the admin OAuth 2.0 Client:
  - **Authorized JavaScript origins:** add `https://admin.brandsofmalaysia.com`
  - **Authorized redirect URIs:** add `https://admin.brandsofmalaysia.com/api/auth/callback/google`
  - **Keep** the existing `…up.railway.app` origin/redirect entries for now (rollback safety; prune in Step 7).
- Save (Google changes can take a few minutes to propagate).

### Step 5 — Point AUTH_URL at the new domain

- Railway → `bomy/admin` service → **Variables** → set:

  ```
  AUTH_URL=https://admin.brandsofmalaysia.com
  ```

- Railway redeploys the service automatically on the variable change. Wait for the deploy to go green.

### Step 6 — Smoke the new domain

> Hard gates. Any red → see §4 rollback.

- [ ] Redirect targets the new domain:

  ```sh
  curl -sI https://admin.brandsofmalaysia.com/ | grep -i -E 'HTTP/|location'
  ```

  Expected: `HTTP/2 307` and `location: https://admin.brandsofmalaysia.com/auth/sign-in?callbackUrl=https%3A%2F%2Fadmin.brandsofmalaysia.com%2F` (callback host is the **new** domain, not Railway).

- [ ] Sign-in page renders:

  ```sh
  curl -s -o /dev/null -w '%{http_code}\n' https://admin.brandsofmalaysia.com/auth/sign-in
  ```

  Expected: `200`.

- [ ] **Browser:** open `https://admin.brandsofmalaysia.com`, complete Google sign-in, land on `/stores`. Valid TLS padlock (no cert warning). This is the real gate — the curl checks only prove routing.

### Step 7 — Post-cutover cleanup

- [ ] Once the browser sign-in on the new domain is verified, remove the old `…up.railway.app` redirect URI + JS origin from the Google OAuth client (optional; leaving them is harmless but the new domain is canonical).
- [ ] Leave the Railway URL itself working as a fallback (don't delete the Railway-generated domain).
- [ ] Update `app/.andy/handoff.md` §2: admin now on `admin.brandsofmalaysia.com`.

## 4. Rollback

Admin never stops working on the Railway URL, so rollback is just reverting the canonical:

- **Fast:** Railway → `bomy/admin` → Variables → set `AUTH_URL` back to `https://bomyadmin-production.up.railway.app` → redeploy. Sign-in works on the Railway URL again immediately.
- **DNS:** Cloudflare → delete the `admin` CNAME (or leave it; with `AUTH_URL` reverted it's just an idle alias).
- No code or DB involved at any point.

## 5. Admin auth prerequisites (these blocked sign-in during the first cutover)

The domain steps above are necessary but **not sufficient** — the first real admin
login surfaced three latent gaps. Verify all three before declaring the login
working, independent of the domain:

1. **`AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` must be set on the admin Railway
   service.** `auth.config.ts` uses `providers: [Google]` with no explicit
   creds, so NextAuth v5 auto-reads these env vars. If unset, Google returns
   **`invalid_client` / "OAuth client was not found"** (empty client_id). Fix:
   reuse the web app's existing Google OAuth client — copy its ID/secret from
   Vercel (`bomy-web`) into Railway, and add **both** redirect URIs to that one
   client (`https://brandsofmalaysia.com/...` and
   `https://admin.brandsofmalaysia.com/api/auth/callback/google`). Admin access
   is still role-gated separately, so sharing the identity client is safe.

2. **`DATABASE_URL` must be the UNPOOLED/direct Neon endpoint.** The NextAuth
   adapter connects via `makeAuthDb()`, which sets the `app.bypass_rls` startup
   parameter (`options=-c app.bypass_rls=true`). Neon's **pooled** endpoint
   (`...-pooler...`, PgBouncer) rejects startup parameters →
   **`AdapterError: unsupported startup parameter in options: app.bypass_rls`**
   → "Server configuration" error on the callback. Fix: remove `-pooler` from
   the host (matches the web app's `bomy_app` direct/unpooled string).

3. **Admin uses JWT session strategy** (`apps/admin/src/auth.ts`,
   `session.strategy = "jwt"`; PR #65). Database session strategy sets an opaque
   cookie the **edge middleware** can't decode → **`JWTSessionError: Invalid
Compact JWE`** → every sign-in bounces back to `/auth/sign-in`. The
   `auth.config.ts` `session()` callback propagates `id`/`role` from the token so
   the middleware's `authorized()` gate can read the role. The `authorized()`
   gate also allowlists `/auth/sign-in` + `/unauthorized` to avoid a redirect
   loop when a non-BOMY user is bounced.

4. **First admin is a DB bootstrap.** A brand-new Google sign-in creates a
   `users` row with the default `buyer` role, which the gate rejects. Promote the
   first admin directly in the DB (`update users set role='bomy_admin' where
email=...`, via a `app.bypass_rls`/owner connection) — there's no admin UI
   path until one admin exists.

## 6. Reference

- Admin auth: `apps/admin/src/auth.config.ts` + `apps/admin/src/auth.ts` (Google provider, JWT strategy), `apps/admin/.env.example`.
- Session-strategy fix: PR #65 (`fix(admin): JWT session strategy ...`).
- Predecessor domain runbook: `docs/runbooks/public-deployment-cutover.md` (apps/web → brandsofmalaysia.com, Vercel).
- Railway custom domains + Cloudflare: grey-cloud CNAME required for cert issuance.
