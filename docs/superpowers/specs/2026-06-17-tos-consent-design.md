# ToS / Privacy Consent Flow — Design Spec

**Date:** 2026-06-17
**Author:** Andy (AI technical lead)
**Status:** DRAFT — every decision below is flagged for Charlie's confirmation before implementation.
**Scope:** Design only. No implementation code in this PR.

---

## Summary

Add an explicit Terms of Service + Privacy Policy consent gate to the BOMY sign-in
flow. Because BOMY operates under Malaysian PDPA and runs OAuth-only sign-in
(Google), we record consent as an **append-only audit trail** in a dedicated
`user_consents` table and enforce it via a **post-OAuth interstitial** gate page
that the middleware redirects to until a current-version consent row exists. A
single `tos_version` `platform_config` entry drives re-consent on version bumps.

---

## Context discovered during exploration

- **Auth is OAuth-only (Google) + JWT session strategy** (PR #44). `auth.ts` uses
  `session: { strategy: "jwt" }`; the JWT carries `id` and `role`, and the edge
  middleware reads them from the encrypted cookie with **no DB round-trip**.
  (Note: `app/CLAUDE.md` still says "Google + Facebook, database sessions" — that
  is stale; the code in `auth.ts` / `auth.config.ts` is authoritative.)
- **There is no credentials/password sign-up.** Account creation happens
  implicitly on first Google OAuth via the DrizzleAdapter. So "before account
  creation" is not a place we control in the UI — the user row is written by the
  adapter mid-OAuth. This pushes consent capture to _after_ OAuth completes.
- **`users` table** (`packages/db/src/schema/users.ts`) is intentionally lean:
  id, email, name, image, emailVerified, role, createdAt, updatedAt. RLS:
  `users_self_read` / `users_self_update` (user sees/edits own row; staff/admin
  bypass see all); inserts are staff-only at the RLS layer (adapter writes via
  `makeAuthDb()` which sets `app.bypass_rls='true'`).
- **`platform_config`** is the canonical "nothing is hardcoded" registry
  (key/value jsonb, staff-only RLS). `checkout_enabled` is already read from it
  via `withAdmin` in `apps/web/src/app/checkout/actions.ts`.
- **RLS contract:** every write goes through `withTenant` / `withAdmin` /
  `withPublicRead`. The NextAuth adapter uses a separate bypass pool (`makeAuthDb`).
- **`member_subscriptions`** is the closest existing template for a user-owned,
  audit-style table (self-read by `user_id = app.current_user_id()`, staff/admin
  write).
- **Middleware** (`apps/web/src/middleware.ts`) runs `authConfig` on all non-asset
  routes; the `authorized` callback in `auth.config.ts` is edge-safe (no DB).

---

## Decision log

### Decision 1 — Where consent lives in the DB → **separate `user_consents` table**

**Recommendation: separate `user_consents` table (append-only audit trail).**

Reasoning:

- BOMY is PDPA-relevant (Malaysia). PDPA consent should be **demonstrable** — you
  want to prove _what version_ a user accepted and _when_, and retain that proof
  even after re-consent on a version bump. Two columns on `users`
  (`tos_accepted_at` + `tos_version`) overwrite history on every re-consent and
  cannot answer "what did this user agree to in 2026?".
- It matches existing schema philosophy: BOMY already prefers immutable history
  rows over mutable columns (`member_subscriptions` keeps renewals as distinct
  rows; `ledger_entries` is append-only; `platform_config_audit` retains
  who/what/when). A consent audit trail is the same pattern.
- It keeps the lean `users` table lean and avoids coupling auth-infra writes to
  consent writes.

Trade-off accepted: a JOIN / extra query to find "current consent." Mitigated by
a partial unique index and a single indexed lookup keyed on
`(user_id, document, version)`.

> **CONFIRM:** Use a dedicated `user_consents` table, not columns on `users`.

---

### Decision 2 — Where the user sees the prompt → **Option B: post-OAuth interstitial**

**Recommendation: Option B — post-OAuth interstitial consent page (`/auth/consent`).**

Reasoning:

- **Option A (inline checkbox on sign-in page) does not technically fit.** The
  sign-in page fires a server action that immediately calls
  `signIn("google", …)` and hands off to Google. A checkbox value would have to
  survive the full OAuth round-trip (redirect to Google and back) to be recorded
  against the user — there is no user row yet at the moment the box is ticked, and
  NextAuth gives us no clean hook to persist a pre-OAuth form value to the
  post-OAuth user. We _can_ still **show** the legal links on the sign-in page as
  informational text (recommended), but the **binding consent record** must be
  captured after the identity exists.
- **Option C (modal/banner on first load) is dismissable and ambiguous.** A banner
  that can be scrolled past is weak PDPA evidence ("did they really agree?"). A
  blocking modal is just Option B with worse routing semantics and no clean
  middleware enforcement point.
- **Option B is the cleanest fit for NextAuth v5 + JWT.** After Google OAuth the
  adapter has created/looked-up the user row; we land them on `/auth/consent`,
  which is a normal authenticated page. It renders the current ToS/Privacy
  version, a single explicit "I agree" action, and writes a `user_consents` row
  via `withTenant`. It is unambiguous, gives a clean enforcement point in
  middleware, and produces strong consent evidence.

Supporting UX detail (not binding consent): keep a short line on
`/auth/sign-in` — "By continuing you agree to our [Terms] and [Privacy Policy]"
linking to `/terms` and `/privacy` — so the user sees the links before OAuth.

> **CONFIRM:** Post-OAuth interstitial at `/auth/consent`. Sign-in page keeps
> informational legal links but does **not** carry the binding checkbox.

---

### Decision 3 — What blocks unconsented users → **global gate via middleware, with an allowlist**

**Recommendation: a global consent gate** — a signed-in user without a
current-version consent row is redirected to `/auth/consent` from **everything
except** an allowlist (the consent page itself, sign-out, legal pages
`/terms` `/privacy`, and auth/NextAuth API routes). Public/unauthenticated browse
pages are unaffected (the gate only applies once `auth.user` exists).

Reasoning:

- Gating "only specific protected routes" leaves unconsented users free to use
  most of an authenticated session (e.g. browsing while logged in, hitting
  server actions) without having agreed — weak compliance posture and easy to
  get wrong as routes are added.
- A global gate keyed off "is logged in AND not consented" is one rule, fails
  safe (default = redirect to consent), and is trivial to reason about. The
  allowlist prevents redirect loops and keeps the legal text readable mid-gate.

Important constraint this creates → see Decision 4 / JWT section: the middleware
is **edge-safe and must not touch the DB**, so the gate must read consent status
from the **JWT**, not from a live DB query.

> **CONFIRM:** Global middleware gate for logged-in users, with allowlist
> (`/auth/consent`, `/terms`, `/privacy`, `/api/auth/*`, sign-out). Public pages
> unaffected.

---

### Decision 4 — Re-consent on version bump → **YES, driven by `platform_config.tos_version`**

**Recommendation: YES — bumping the active version forces existing users to
re-consent.** Store the current version in **`platform_config`** under key
`tos_version` (value e.g. `"2026-06-17"`), **not** an env var.

Reasoning:

- "No hardcoded config params" is a hard project constraint; versions/prices/
  thresholds already live in `platform_config` and are admin-editable with an
  audit trail (`platform_config_audit`). An env var would require a redeploy and
  leave no who/changed-when record. `platform_config` gives both for free.
- Re-consent on material ToS/Privacy changes is the correct PDPA posture.

How it works:

- The current version is resolved server-side from `platform_config.tos_version`.
- "Consented" = a `user_consents` row exists for `(user_id, tos_version=current)`
  **and** `(user_id, privacy_version=current)` (or one row covering both — see
  schema note).
- On bump, no existing row matches the new version → every user is gated to
  `/auth/consent` on their next request and re-accepts.
- The accepted version must reach the **edge middleware without a DB call**, so it
  is encoded into the JWT (see JWT section). On bump, existing JWTs carry the old
  version and will fail the gate until the user re-consents (which re-issues the
  JWT). New sign-ins read current config in the `jwt()` callback.

> **CONFIRM:** Version source = `platform_config.tos_version`; bump forces
> re-consent. Confirm whether ToS and Privacy share one version string or are
> tracked independently (spec assumes a **single shared `tos_version`** for
> simplicity — see schema note for the independent-tracking variant).

---

### Decision 5 — Decline behaviour → **declining keeps the user out (sign out + redirect to sign-in with message)**

**Recommendation: confirmed.** If the user declines or leaves `/auth/consent`
without accepting, they cannot use the app. On an explicit "Decline" action we
**sign them out** (`signOut`) and redirect to `/auth/sign-in?consent=declined`
with a short message ("You must accept the Terms and Privacy Policy to use
BOMY."). If they simply close the tab, no consent row is written and the
middleware gate re-fires on their next visit — they land back on `/auth/consent`.

Reasoning:

- BOMY's own ToS §1 says use is conditioned on acceptance; a non-consenting user
  must not have an active usable session. Signing out on decline avoids a
  "logged in but permanently gated" zombie state.
- Alternative considered: keep them signed in but gated forever. Rejected —
  it's a confusing dead-end state and a weaker compliance story than a clean
  signed-out state.

Note: We do **not** delete the user row on decline (the adapter already created
it during OAuth). It simply has no current consent row. This is fine and PDPA-safe
— the account exists but is unusable until consent. (If Charlie wants hard
deletion of declined-never-consented accounts, that's a separate cleanup job —
out of scope here.)

> **CONFIRM:** Decline = `signOut` + redirect to `/auth/sign-in?consent=declined`.
> Closing the tab = re-gated next visit. No row deletion.

---

## DB schema changes

New file: `packages/db/src/schema/user_consents.ts`. Add to
`packages/db/src/schema/index.ts` exports.

```ts
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { users } from "./users.js"

// Append-only consent audit trail (PDPA-demonstrable). One row per
// (user, document, version) acceptance. We never UPDATE or DELETE these —
// re-consent on a version bump inserts a new row, preserving history.
export const userConsents = pgTable(
  "user_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Which legal document this row attests to: "tos" | "privacy".
    // Kept as text (no enum churn); validated at the app layer.
    document: text("document").notNull(),
    // The platform_config tos_version string in force at acceptance time,
    // e.g. "2026-06-17".
    version: text("version").notNull(),
    // Captured for the audit record; nullable because edge/runtime may not
    // always resolve a client IP. Not used for enforcement.
    acceptedIp: text("accepted_ip"),
    acceptedUserAgent: text("accepted_user_agent"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_consents_user_idx").on(t.userId),
    // One acceptance row per (user, document, version) — idempotent re-clicks
    // don't create duplicates; a new version creates a new row.
    userDocVersionUnique: uniqueIndex("user_consents_user_doc_version_unique_idx").on(
      t.userId,
      t.document,
      t.version,
    ),
  }),
)
```

`platform_config` seed (no schema change — a data row, applied via a seed/migration
SQL using the existing `platform_config` table):

```
key:   "tos_version"
value: "2026-06-17"   (jsonb string)
description: "Current Terms of Service + Privacy Policy version. Bumping forces re-consent."
```

> Schema note — single vs independent versions: the spec assumes ToS and Privacy
> share one `tos_version`. The table already supports independent tracking (the
> `document` column distinguishes them), so going independent later only means
> adding a `privacy_version` config key and checking both. No table change needed.

---

## UX flow (step by step)

1. User visits `/auth/sign-in`. Page shows "Continue with Google" plus an
   informational line linking `/terms` and `/privacy`. No checkbox.
2. User clicks Continue → existing server action calls `signIn("google", …)`.
   **Change:** set `redirectTo: "/auth/consent"` (instead of `/`) so the post-OAuth
   landing is the gate, not the homepage. (The gate page itself forwards consented
   users onward — step 5 — so this is safe even for already-consented returning
   users.)
3. Google OAuth completes; DrizzleAdapter creates/looks-up the user row; JWT is
   issued. The `jwt()` callback stamps the current `tos_version` the user has
   accepted (initially: none / stale) — see JWT section.
4. User lands on `/auth/consent`:
   - Renders current ToS + Privacy summary (or links) and the in-force version.
   - "I Agree" action → writes/【upserts】 two `user_consents` rows
     (`document: "tos"` and `document: "privacy"`, both `version: current`) via
     `withTenant`, then **re-issues the session** so the JWT carries the accepted
     version, then redirects to the original destination (or `/`).
   - "Decline" action → `signOut` + redirect to `/auth/sign-in?consent=declined`.
5. If an **already-consented** user (current version) ever hits `/auth/consent`,
   it immediately redirects them to `/` — the page is a no-op for the consented.
6. On any later request, middleware checks the JWT's accepted version against the
   current version (carried in the JWT at issue time — see JWT section) and
   redirects to `/auth/consent` if stale/absent, except on the allowlist.

Routes touched/added:

- `apps/web/src/app/auth/consent/page.tsx` — **new** gate page (server component +
  a server action for accept/decline).
- `apps/web/src/app/auth/sign-in/page.tsx` — add legal links; change `redirectTo`.

---

## Middleware / auth changes (high level — no code)

- **`apps/web/src/auth.config.ts`** (`authorized` callback, edge-safe, no DB):
  add the consent gate. For a logged-in user, compare the JWT-carried
  `consentVersion` against the current `tos_version`. If absent or stale, and the
  requested path is **not** on the allowlist (`/auth/consent`, `/terms`,
  `/privacy`, `/api/auth/*`, sign-out), return a redirect to `/auth/consent`.
  Keep existing login/role rules intact.
  - The current `tos_version` must be available at the edge without a DB call.
    Encode it into the JWT at issue time (see JWT section) and compare
    JWT-accepted-version vs JWT-current-version — OR pass the current version via
    an edge-readable mechanism. **Recommended:** store both `consentVersion`
    (what the user accepted) on the token, and resolve "current" in the `jwt()`
    callback (runs in the Node runtime, can read config) so the token also knows
    the version it was minted against. Middleware then only needs the token. This
    keeps the edge DB-free. (Confirm approach in review.)
- **`apps/web/src/auth.ts`** (`jwt()` callback, Node runtime — can read DB/config):
  - On sign-in and on session refresh, look up the user's most-recent
    `user_consents` version (or accept a freshly-written value passed via
    `update()` after the accept action) and stamp `token.consentVersion`.
  - Read `platform_config.tos_version` (via `withAdmin`, mirroring the existing
    `checkout_enabled` read) and use it to determine staleness when minting the
    token.
- **`apps/web/src/middleware.ts`** — no change; it already runs `authConfig` on all
  routes. The new logic lives in the `authorized` callback.

---

## JWT / session changes needed

Yes — consent state must ride the JWT, because the middleware is edge-safe and
must not hit the DB (this is the whole reason PR #44 moved to JWT strategy).

- Add `consentVersion?: string` to the JWT (the ToS version the user has accepted).
- The `jwt()` callback in `auth.ts` sets it:
  - At sign-in: from the user's latest `user_consents` row (likely absent → gated).
  - After the accept action: the consent server action should call NextAuth's
    session `update()` so the `jwt()` callback re-runs and stamps the new version
    immediately (no stale-cookie gap).
- The `session()` callbacks (both in `auth.ts` and the edge pass-through in
  `auth.config.ts`) should propagate `consentVersion` onto `session.user` if any
  server component needs it (optional; the gate decision lives in middleware).
- `role` stays as-is. No new role needed.
- **Augment the `next-auth` module declaration** in `auth.ts` (and the `JWT` type)
  to add `consentVersion` — TypeScript strict, no `any`.

> Edge note: because the JWT is minted in the Node runtime where config is
> readable, the token can carry both "accepted version" and be compared against a
> "minted-against version." On a `tos_version` bump, old cookies are stale and the
> gate fires until re-consent re-mints the token. Confirm this token shape in
> review.

---

## RLS implications

`user_consents` is tenant data → **must** get `ENABLE` + `FORCE ROW LEVEL
SECURITY` and explicit policies in `packages/db/src/rls/policies.sql` (and the
matching migration). Mirror the `member_subscriptions` pattern:

- **Default-deny RESTRICTIVE policy** (consistent with §4 of policies.sql):
  `USING (app.current_user_id() IS NOT NULL OR app.is_admin_bypass())`.
- **Self-read:** `user_consents_self_read FOR SELECT USING (user_id = app.current_user_id() OR app.is_bomy_staff() OR app.is_admin_bypass())`.
- **Self-insert:** `user_consents_self_insert FOR INSERT WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass())`.
  This is the key difference from `member_subscriptions` (which has no buyer-level
  write): here the **user themselves** writes their consent via `withTenant`, so an
  INSERT policy keyed on `user_id = app.current_user_id()` is required.
- **No UPDATE / no DELETE policy** → append-only enforced by omission + FORCE RLS,
  exactly like `ledger_entries`. (The `onDelete: "cascade"` FK is a DB-level
  cascade on user deletion, which runs under admin/owner context, not via RLS.)
- **Staff read** for support/compliance via `app.is_bomy_staff()`.

The consent write at `/auth/consent` uses **`withTenant`** (the user is
authenticated and writing their own row) — not `withAdmin` — so no
`admin_bypass_audit` noise per accept. The `tos_version` read from
`platform_config` uses **`withAdmin`** (staff-only RLS on that table), mirroring
the existing `readCheckoutEnabled` in `checkout/actions.ts`.

---

## Test plan (what, not how)

DB / RLS:

- A user can INSERT and SELECT their own `user_consents` rows under `withTenant`.
- A user **cannot** SELECT another user's consent rows (RLS denies).
- A user **cannot** UPDATE or DELETE any consent row (no policy → denied).
- The `(user_id, document, version)` unique index rejects duplicate acceptances.
- Staff role can read all consent rows; admin bypass can read/write.

Gate / middleware:

- Logged-in user with no consent row is redirected to `/auth/consent` from a
  protected path.
- Logged-in user with current-version consent is **not** redirected.
- Allowlist paths (`/auth/consent`, `/terms`, `/privacy`, `/api/auth/*`) are
  reachable while ungated (no redirect loop).
- Unauthenticated user on a public page is unaffected by the gate.
- After bumping `platform_config.tos_version`, a previously-consented user is
  re-gated on next request.

Flow:

- Accepting writes both `tos` and `privacy` rows at the current version and
  re-issues a JWT carrying that version; user proceeds.
- Declining signs the user out and lands on `/auth/sign-in?consent=declined`.
- Closing the consent tab leaves the user re-gated on next visit (no row written).
- Already-consented user hitting `/auth/consent` is redirected to `/`.

Types:

- `pnpm typecheck` passes with the augmented JWT/session types and no `any`.

---

## Out of scope (this PR does NOT do)

- Email/credentials sign-up consent (no such flow exists; OAuth-only).
- Marketing / cookie / data-processing granular consents (this is ToS + Privacy
  acceptance only — a single combined gate).
- A consent management / preferences UI ("withdraw consent", granular toggles).
- Independent ToS-vs-Privacy version tracking (table supports it; not wired —
  single shared `tos_version` by design — **confirmed by Charlie 2026-06-17**).
- Deleting or anonymising accounts that decline and never consent (possible
  future cleanup job).
- Versioned legal document storage / rich diff of what changed between versions
  (we record the version string, not the document body).
- Backfilling existing users' consent — on first request after deploy, existing
  users are simply gated and asked to accept (acceptable; flag if Charlie wants a
  grace banner instead).
- Admin UI for editing `tos_version` (it can be set via existing
  `platform_config` tooling; a dedicated button is out of scope).
- Admin UI for editing `tos_version` beyond what the existing `platform_config` tooling already supports.

## In scope (added per Charlie 2026-06-17)

- Update `app/CLAUDE.md` to reflect JWT session strategy + Google-only auth (stale "Google + Facebook, database sessions" note).
