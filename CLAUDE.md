# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `app/` (the monorepo root).

```sh
pnpm dev          # Start all apps in watch mode (web :3000, api :3001, admin :3002)
pnpm build        # Production build (Turborepo, honours dependency order)
pnpm typecheck    # TypeScript check across all packages
pnpm lint         # ESLint across all packages (--max-warnings 0 enforced)
pnpm test         # Run all test suites (--concurrency=1 to prevent DB races)
pnpm format       # Prettier write
```

**Scoped commands (preferred for faster iteration):**

```sh
pnpm --filter @bomy/web test --run                  # Run web tests once
pnpm --filter @bomy/web test initiate.test.ts --run # Single test file
pnpm --filter @bomy/api test --run                  # API tests
pnpm --filter @bomy/db migrate                      # Apply pending DB migrations
pnpm --filter @bomy/db db:generate                  # Generate migration from schema changes
pnpm --filter @bomy/db db:studio                    # Open Drizzle Studio
```

**Web integration tests require real Postgres + the `bomy_app` role:**

```sh
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/web test --run
```

`BOMY_RLS_READY=1` gates tests that require RLS to be applied. `DATABASE_APP_URL` uses the limited `bomy_app` role (not the owner role) so RLS actually fires.

**Start local infrastructure:**

```sh
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
```

## Architecture

### Monorepo layout

```
apps/
  web/     Next.js 15 — buyer storefront, seller dashboard, checkout
  api/     Fastify 5 — webhook receiver, background job scheduler
  admin/   Next.js 15 — internal ops console
packages/
  db/      Drizzle ORM schema, migrations, RLS helpers
  hitpay/  HitPay PSP client + webhook verification
  config/  Shared ESLint / tsconfig bases
infra/
  docker/  compose.yml — Postgres 16, Redis 7, MinIO, Mailhog
```

`apps/web` consumes `@bomy/db` directly via server components and server actions — there is no API hop for storefront reads. `apps/api` handles inbound HitPay webhooks and background jobs only.

### Database access contract (`packages/db`)

**Every DB write must go through one of three wrappers.** Raw `db` access outside these wrappers will either hit default-deny RLS or emit `WARNING rls.missing_context`.

| Wrapper                                               | When to use                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `withTenant(db, { userId, userRole, sellerId? }, fn)` | Authenticated buyer or seller operations                                              |
| `withAdmin(db, { userId, reason }, fn)`               | Admin/system writes — auto-writes an `admin_bypass_audit` row in the same transaction |
| `withPublicRead(db, fn)`                              | Unauthenticated server-component reads (nil UUID, read-only)                          |

**Import pattern** — `@bomy/db` does **not** export a named `db` instance or individual tables:

```ts
import { makeDb, schema, withAdmin, withTenant } from "@bomy/db"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}
// Then: await withTenant(getDb(), ctx, async (tx) => tx.select(...).from(schema.products))
```

`makeAuthDb()` creates a separate pool with session-level `app.bypass_rls = 'true'` — used exclusively by the NextAuth Drizzle adapter.

**`SYSTEM_ACTOR`** is the seeded background-job user (`00000000-0000-0000-0000-000000000001`). It is **not** exported from `@bomy/db`; define it per-file:

```ts
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const
```

### Money

All monetary amounts are **bigint minor units** (sen for MYR, cents for USD). Never use floats. `senToMyr(sen: bigint): string` in `apps/web/src/lib/money.ts` converts to a `"N.NN"` string for HitPay API calls. Bigint cannot cross the React server-action serialisation boundary — convert to `.toString()` before returning from actions.

### Authentication

`apps/web` uses NextAuth v5 (Google OAuth only, JWT session strategy). Sessions live in an encrypted cookie (JWE); no DB session table is used. The `sessions` table exists but accumulates no new rows.

- `auth.config.ts` — edge-safe config (no DB), used by `middleware.ts`; includes `session()` callback to propagate `id`/`role` from JWT into `auth.user` for the edge middleware
- `auth.ts` — full config with Drizzle adapter + `jwt()` callback (encodes `id`/`role` at sign-in), used by server components/actions
- Route protection in `auth.config.ts` `authorized` callback: `/account`, `/dashboard`, `/membership/manage|success` require login; `/seller/dashboard` requires `seller_owner` role.
- **Stale-role window:** role changes in the admin panel take effect only after the user signs out and back in (JWT is baked at sign-in, max 30 days).

`apps/api` shares the same NextAuth session cookie. The `sessionPlugin` currently uses a DB lookup that is a no-op with JWT strategy (pending fix — PR#44 TODO). Current API auth surfaces use `INTERNAL_API_SECRET`, not `request.session`.

### Checkout flow (Stage 5)

`apps/web/src/app/checkout/` contains three server-action files:

- `queries.ts` — pure DB reads: `computeCheckoutTotals`, `fetchCheckoutContext` (buyer RLS), `loadContextForInitiation` (admin-bypass `FOR UPDATE`)
- `actions.ts` — `priceCheckoutPreview`, `readCheckoutEnabled`, `initiateCheckout` (Phase 1: single atomic transaction — stock decrement, inventory reservations, voucher reservation; Phase 1b: HitPay redirect + PSP-ref persistence in Transaction 2)
- `compensate.ts` — `compensateInitiation`: idempotent cancel-only rollback; writes `status='cancelled'` on session and `'released'` on reservations. **Not used by the expiry job** (which requires `'expired'` semantics and `SKIP LOCKED`).

Checkout is feature-flagged via `platform_config.checkout_enabled`. This stays `false` until PR #32 (order webhook + ledger) ships and smoke tests pass.

### Background jobs (`apps/api`)

BullMQ + Redis scheduler registered at app start:

| Job                               | Schedule (MYT)     |
| --------------------------------- | ------------------ |
| `voucher-issuance`                | 1st of month 08:00 |
| `membership-renewal-notification` | Daily 09:00        |
| `brand-subscription-expiry`       | Daily 00:05        |

`expireCancelledMemberships` runs outside BullMQ — fired once on startup then every 24 h via `setInterval`.

Manual trigger: `POST /internal/jobs/voucher-issuance` with `Authorization: Bearer <INTERNAL_API_SECRET>` (called by the admin console "Issue Now" button).

Jobs are disabled in tests (`enableJobs = false` when `NODE_ENV === "test"`).

### RLS architecture

RLS policies live in `packages/db/src/rls/policies.sql` (canonical reference) and are applied via migration SQL files. Key helpers set as transaction-local `set_config`:

- `app.current_user_id` — authenticated user UUID
- `app.current_user_role` — one of `USER_ROLES` from `packages/db/src/types.ts`
- `app.current_seller_id` — seller scope (empty string when not applicable)
- `app.bypass_rls` — `'true'` only inside `withAdmin`

Two DB roles: `bomy_app` (limited, used by application queries; RLS enforced) and `bomy_admin` (BYPASSRLS, used by admin services and reconciliation).

### Validation convention

No Zod in this codebase. Validators return `{ ok: true; value: T } | { ok: false; errors: Record<string, string> }`. See `apps/web/src/lib/shipping-address-schema.ts` as the reference pattern.

### Testing conventions

- API tests: `fileParallelism: false` (all files share a single real Postgres instance to avoid inter-test races)
- Web integration tests: guard with `describe.skipIf(!shouldRun)` where `shouldRun = Boolean(DATABASE_APP_URL) && RLS_READY`
- `@typescript-eslint/require-await` is enforced — avoid `async` callbacks with no `await`; use `mockResolvedValueOnce` chains for FIFO mock sequencing instead of empty async mocks

### Ledger

`ledger_entries` is append-only, double-entry. One row per leg sharing a `transaction_id`. `idempotency_key + direction` is unique. `amount_minor` is always positive; direction (`debit`/`credit`) is a separate enum column. `revenue_source` tags each leg for reconciliation (`regular_order` 25% commission, `brand_subscription` 10%, `voucher_fund`, etc.).

### Commission rule

Commission = `(gross_sen − hitpay_fee_sen) × rate`. Regular orders: 25%. Brand subscriptions: 10%. Always net-of-PSP-fees.

### PR log discipline

Write one log entry under `app/log/YYYY-MM-DD_PR<N>_<slug>.md` before starting the next PR. Cross-window handoff state lives in `app/.andy/handoff.md` (not committed to any PR).
