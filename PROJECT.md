# PROJECT.md — BOMY Platform Overview

> Written 2026-07-07 as a deep knowledge transfer. Companion files: `CLAUDE.md` (operational
> instructions, gitignored by convention) and `GAPS.md` (honest audit of weaknesses).
> State as of PR #87 (merged 2026-07-04), 454 tests passing, live in production.

## What this is

**BOMY ("Brands of Malaysia")** is a curated multivendor e-commerce marketplace for Malaysian
brands, live at **brandsofmalaysia.com**. Buyers browse seller storefronts, buy products, and can
join a paid platform membership (RM75/year) that earns monthly vouchers. Sellers ("brands") apply
via a vetted inquiry flow, get their own storefront, manage products/orders from a dashboard, and
can sell brand subscriptions (recurring perks for their fans, 90/10 revenue split). An internal
ops console handles approvals, payouts, reconciliation, and config.

- **Owner:** Charlie (solo founder; Inflo Vision Sdn Bhd, SSM 202503276795, Penang).
- **Built by:** "Andy" (AI technical lead — Claude Code sessions) with "Bob" (strategist reviewer).
  Every PR went through review; history lives in `log/` (gitignored) and GitHub PRs #0–#88.
- **Currency:** MYR only today (all money in **bigint sen**); USD/international is a roadmap item.
- **Current status:** Site, admin, and API are deployed. Memberships/brand subscriptions are code-complete,
  but **HitPay is not approving the merchant account at the moment (as of 2026-07)**, so the live smoke
  test is blocked. **Product checkout is feature-flagged OFF** (`platform_config.checkout_enabled = false`).
  Direction under design (separate brainstorm session, not yet decided/implemented): add **Stripe alongside
  HitPay behind a PSP-agnostic layer**, with an admin-dashboard toggle to select the active PSP.

## Tech stack and why

| Piece          | Choice                                   | Why (inferred from ADRs, logs, and code)                                                                                                                                                            |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo              | One repo for 3 apps + 5 packages; task graph respects build order; `--filter` for fast iteration                                                                                                    |
| Storefront     | Next.js 15 App Router (`apps/web`)       | Server components read the DB directly — no API hop for reads; server actions for writes; deployed on Vercel (region sin1)                                                                          |
| Ops console    | Next.js 15 (`apps/admin`)                | Same skills/stack as web; deployed as Docker `standalone` on Railway                                                                                                                                |
| API            | Fastify 5 (`apps/api`)                   | Only two jobs: HitPay webhook receiver + background job host. Small, fast, raw-body control for HMAC. Railway + managed Redis                                                                       |
| DB             | Postgres 16, Drizzle ORM (`packages/db`) | Type-safe schema-as-code; **RLS is the security backbone** (see below). Local: Docker; Prod: Neon                                                                                                   |
| Jobs           | BullMQ + Redis                           | Cron-scheduled repeatable jobs with dedupe; manual triggers from admin                                                                                                                              |
| Payments       | HitPay (`packages/hitpay`)               | Malaysian PSP: FPX, cards, e-wallets. Recurring billing (membership) + payment requests (orders/brand subs)                                                                                         |
| Auth           | NextAuth v5, **JWT strategy**            | Google OAuth + magic-link email. JWE cookie, no DB session reads at runtime — the edge middleware can decode it (DB sessions could not be read at the edge; this bounced sign-ins until PR #44/#65) |
| Object storage | Cloudflare R2 via S3 API                 | Product images; presigned PUT uploads from the browser. MinIO stands in locally                                                                                                                     |
| Email          | Nodemailer via `packages/mailer`         | Brevo SMTP in prod, Mailhog locally. `EMAIL_DELIVERY_ENABLED=false` → PII-safe no-op logger                                                                                                         |
| Bot defence    | Cloudflare Turnstile                     | On the public `/seller/apply` form and magic-link request                                                                                                                                           |
| UI             | Tailwind v4 + shadcn/ui + brand tokens   | Standardised across all 105 TSX files in PR #86 (WCAG 2.2); reference doc `../FRONTEND_STANDARDS.md`                                                                                                |
| Validation     | **No Zod** — hand-rolled validators      | Deliberate: `{ ok: true; value } \| { ok: false; errors }` result objects; reference: `apps/web/src/lib/shipping-address-schema.ts`                                                                 |
| Tests          | Vitest                                   | 454 tests; real-Postgres integration tests gated by env (see Testing)                                                                                                                               |

## Architecture

```
                       ┌──────────────────────────── Vercel ─┐
  Buyer/Seller ──────▶ │ apps/web (Next.js 15)               │
  brandsofmalaysia.com │  server components ── reads ──┐     │
                       │  server actions ───── writes ─┤     │
                       └───────────────────────────────┼─────┘
                                                       │ direct SQL (no API hop)
  HitPay PSP ── webhooks ─▶ ┌───────── Railway ────────▼──────────┐      ┌─ Neon ──────┐
                            │ apps/api (Fastify 5)                │─────▶│ Postgres 16 │
                            │  /webhooks/hitpay (HMAC-verified)   │      │  RLS ON     │
                            │  BullMQ workers ◀── Railway Redis   │      └─────────────┘
                            └──────────────▲──────────────────────┘            ▲
                                           │ POST /internal/jobs/* (bearer)    │
  BOMY staff ─────────────▶ ┌──────────────┴───────────┐                       │
  (bomy_admin/ops/finance)  │ apps/admin (Next.js 15)  │── direct SQL ─────────┘
                            └──────────────────────────┘
  Product images: browser ── presigned PUT ──▶ Cloudflare R2 (cdn.brandsofmalaysia.com)
  Email: web/admin/api ──▶ @bomy/mailer ──▶ Brevo SMTP (Mailhog locally)
```

Packages: `@bomy/db` (schema, migrations, RLS, tenant wrappers), `@bomy/hitpay` (PSP client +
HMAC verify), `@bomy/mailer` (transport + templates), `@bomy/shared` (small helpers, e.g. body-image
keys), `@bomy/config` (ESLint/tsconfig bases). **Workspace packages ship raw TypeScript source** —
consumers transpile it (see Gotchas in CLAUDE.md).

### The security model: RLS-first

This is the single most load-bearing design decision. Postgres Row-Level Security with
**default-deny restrictive policies** on every table (`packages/db/src/rls/policies.sql`, ~1,000
lines, the canonical reference; applied via numbered migrations). The app connects as the limited
`bomy_app` role (no BYPASSRLS). Every DB access goes through exactly one of three wrappers in
`packages/db/src/tenant.ts`:

- **`withTenant(db, {userId, userRole, sellerId?}, fn)`** — sets `app.current_user_id/role/seller_id`
  as transaction-local GUCs; RLS policies key on them. For authenticated buyer/seller operations.
- **`withPublicRead(db, fn)`** — nil-UUID user + `SET TRANSACTION READ ONLY`. For unauthenticated
  storefront server components. Can only see rows whose policies explicitly allow public read
  (active stores/products/categories).
- **`withAdmin(db, {userId, reason}, fn)`** — sets `app.bypass_rls = true` and **auto-inserts an
  `admin_bypass_audit` row inside the same transaction**. Every bypass is audited or it didn't happen.
  Background jobs/webhooks use the seeded `SYSTEM_ACTOR` UUID `…0001` (redefined per-file by
  convention, deliberately not exported).

A fourth pool, `makeAuthDb()`, sets session-level `app.bypass_rls=true` (via the `options` startup
param — Neon's proxy drops custom GUCs otherwise) and is used **only** by the NextAuth Drizzle adapter.

PR #87 finished an audit pass reducing `withAdmin` reads: seller reads now use `withTenant`,
public catalog reads use `withPublicRead`; the remaining `withAdmin` calls in `apps/web` are
legitimate writes or documented exceptions (see GAPS.md).

### The money model: append-only double-entry ledger

`ledger_entries` is append-only. One row per leg; legs of one economic event share a
`transaction_id`; `idempotency_key + direction` is UNIQUE, so replayed webhooks physically cannot
double-book. `amount_minor` is always a positive bigint; direction is a separate enum. Every leg
carries a `revenue_source` tag for reconciliation.

**Commission rule (locked 2026-05-01):** commission = `(gross − hitpay_fee) × rate`, always
net-of-PSP-fees. Regular orders 25%; brand subscriptions 10% (seller gets `floor(net × 90%)`,
BOMY gets the remainder — integer math must balance to the sen or the webhook aborts).

**Money is bigint sen everywhere.** No floats, ever. `parseSen` strictly parses HitPay's `"N.NN"`
strings and throws on malformed input. Bigints cannot cross the React server-action boundary —
actions return decimal strings.

### Payment flows

1. **Platform membership** (recurring billing): web action creates a HitPay recurring billing +
   `member_subscriptions` row (`pending`); the webhook (`recurring_billing_id` branch in
   `apps/api/src/routes/webhooks/hitpay.ts`) activates/renews it. Hard invariants: one active row
   per user (partial unique index), amount must equal the subscribed price, a charge for an
   already-active user becomes a **`duplicate_charges`** row + liability ledger leg flagged for
   refund (never a second activation). Renewal expires the old row and inserts a new period row.
2. **Brand subscription** (one-time payment request): same guards, plus CAS activation
   (`WHERE status='pending'`) so a late payment on an abandoned checkout records a duplicate
   instead of reactivating.
3. **Product checkout** (Stage 5, flag OFF): `apps/web/src/app/checkout/` — `queries.ts` (reads),
   `actions.ts` (`initiateCheckout`: Phase 1 = one atomic transaction doing stock decrement +
   inventory reservations + voucher reservation; Phase 1b = HitPay redirect + PSP ref persisted in
   a second transaction), `compensate.ts` (idempotent cancel-only rollback — deliberately NOT
   reused by the expiry job, which needs `'expired'` semantics + `SKIP LOCKED`). The webhook side
   (`apps/api/src/webhooks/hitpay/order-fanout.ts`) fans a paid checkout session out into per-store
   orders, ledger legs, and commission, with `processed_webhook_events` idempotency and a
   park-for-review path for anomalies.
4. **Refunds** (`charge.updated`): keyed on explicit `refund_amount` presence; duplicate-charge
   refunds clear the liability account, subscription refunds debit revenue; `refund_id` in the
   idempotency key supports multiple partial refunds.

The webhook route **always returns 200** on handled paths (retries are pointless — handlers are
idempotent); an unrecognised event shape logs a warning and is otherwise dropped.

### Background jobs (`apps/api`)

Six BullMQ repeatable jobs (all `Asia/Kuala_Lumpur`): voucher-issuance (monthly 1st 08:00),
membership-renewal-notification (daily 09:00), brand-subscription-expiry (daily 00:05),
inventory-reservation-expiry (every 10 min), order-auto-complete (daily), body-image-cleanup
(nightly 02:00, with retries). Two more run outside BullMQ via `setInterval` at startup + every
24h: `expireCancelledMemberships`, `expireAbandonedPendingMemberships`. Jobs are disabled when
`NODE_ENV === "test"`. Admin's "Issue Now" button calls `POST /internal/jobs/voucher-issuance`
with `Authorization: Bearer <INTERNAL_API_SECRET>`.

### Auth in detail

- **Web:** Google OAuth + magic-link email (Turnstile + regex + per-email cooldown before
  `signIn("nodemailer")`). JWT callback bakes `id`, `role`, and **PDPA consent state** into the
  token; the consent claims are derived from the DB at sign-in and on `unstable_update()` (both
  `tos` and `privacy` rows for the current `tos_version` must exist), never from client-supplied
  update payloads. A consent gate in `auth.config.ts#authorized` then redirects unconsented users
  to `/auth/consent` using those **JWT claims** (edge, no per-request DB read) — so, like role,
  consent is only as fresh as the token (up to 30 days; see the role-freshness note below). Route
  protection: `/account`, `/dashboard`, `/membership/manage|success` need login; `/seller/dashboard`
  needs `seller_owner`.
- **Admin:** Google only. Two layers: the edge `authorized()` is a **best-effort first pass** (requires
  role ∈ {`bomy_ops`, `bomy_admin`, `bomy_finance`}, else `/unauthorized`) and stays DB-free; the real
  enforcement is the **server-side gate** — every page calls `requireAdmin(...)` and every server
  action calls `requireAdminId(...)` (`src/lib/auth.ts`), which resolve the session, re-derive a stale
  role from the DB, and fail closed. Narrower surfaces pass an allow-list: `users` actions →
  `bomy_admin`; `payouts` (+reconciliation) → `bomy_admin`/`bomy_finance`; `checkout-sessions` →
  `bomy_admin`/`bomy_ops`. (PR #88.)
- **API:** `sessionPlugin` decodes the same NextAuth JWE cookie via `@auth/core/jwt` (tries both
  secure/plain cookie names; the cookie name is the JWE salt). Used by `/me`; webhooks and internal
  routes use HMAC / bearer secrets instead.
- **Role freshness:** roles/consent live in a JWT minted at sign-in (max 30 days).
  - **Admin (PR #88):** a stale role is **re-derived from the DB every 5 minutes** (`roleCheckedAt`
    claim → `refreshRole`), so a demoted/removed admin loses console access within 5 min. Fail-closed
    on DB error via a per-request `roleRefreshFailed` marker the server gate rejects on.
  - **Web:** still the plain 30-day window — buyer/seller role + consent changes apply on next
    sign-in. Accepted by design (lower-impact surface); emergency global invalidation = rotate
    `AUTH_SECRET` (logs everyone out). See GAPS.md #1 (closed) for the rationale and the pattern to
    reuse if web ever needs faster revocation.

## Critical paths — handle with care

| Area             | Files                                                                                                  | Why                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| RLS + wrappers   | `packages/db/src/tenant.ts`, `src/rls/policies.sql`, `src/client.ts`                                   | The entire tenant-isolation and audit model                                                                           |
| Webhook + ledger | `apps/api/src/routes/webhooks/hitpay.ts`, `apps/api/src/webhooks/hitpay/*`                             | Real money; every branch encodes an invariant learned the hard way (duplicate charges, late payments, CAS activation) |
| Checkout         | `apps/web/src/app/checkout/*`                                                                          | Inventory + vouchers + payment in a compensating saga                                                                 |
| Migrations       | `packages/db/drizzle/*.sql` (0000–0025)                                                                | Applied to prod Neon; **never edit an applied migration** — add a new one                                             |
| Auth             | `apps/web/src/auth.ts`, `auth.config.ts`, `apps/admin/src/auth*.ts`, `apps/api/src/plugins/session.ts` | Session, consent, and role gates                                                                                      |
| Schema           | `packages/db/src/schema/*`                                                                             | 30+ tables; unique indexes are load-bearing invariants (e.g. one active membership per user)                          |

**Safe to change casually:** marketing/legal pages, admin list-page UI, email copy in
`packages/mailer` templates and `notifications/*`, storefront presentation components. Even there,
PR #86's shadcn/ui + brand-token conventions apply.

## Surprises that will trip you up

Full list in CLAUDE.md → Gotchas. The top ones: workspace packages are raw TS (need
`transpilePackages` + webpack `extensionAlias`; **Turbopack doesn't work** — dev uses plain
`next dev`); Turborepo blocks env vars not allowlisted in `turbo.json`; integration tests
**silently skip** without `DATABASE_APP_URL` + `BOMY_RLS_READY=1`; `makeDb()` falls back to the
owner-role `DATABASE_URL`, under which **RLS silently doesn't fire**; repo-root `CLAUDE.md`,
`log/`, and `.andy/` are deliberately **gitignored** (synced between machines via
`bomy-export`/`bomy-import`, see `../SWITCHING.md`).

## Where the history lives

- `log/YYYY-MM-DD_PR<N>_<slug>.md` — one entry per merged PR (gitignored; the project's real memoir)
- `.andy/handoff.md` — cross-session state: prod infra table, pre-launch backlog (gitignored)
- `docs/runbooks/` — operational procedures (checkout-enabled flip, deployment cutover, custom domain, magic-link activation), with evidence under `docs/runbooks/evidence/`
- `docs/superpowers/plans|specs` — implementation plans for the bigger PRs
- `../` (BOMY project root, outside the repo) — proposals, architecture kickoff plan, `FRONTEND_STANDARDS.md`, `SWITCHING.md`, `init_andy.md`
