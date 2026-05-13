# Andy Handoff — 2026-05-13 (Stage 5 spec approved, implementation plan next)

## 1. Current state

- Main is at `d68a108` (Stage 5 spec committed 2026-05-13)
- Stage 4 complete (PRs #18–#25, main at `b96689e` before spec)
- Stage 5 spec written, reviewed by Bob, approved by Charlie
- Spec: `docs/superpowers/specs/2026-05-13-stage5-products-orders-design.md`
- Stale worktrees removed: feat-seller-sub-dashboard (final one)
- Stale local branch `feat/brand-subscription-web` can also be deleted when convenient

## 2. Stage 5 — ready to plan

Spec is locked. Next step: invoke `writing-plans` skill to produce the implementation plan before any coding begins.

PR order is fixed:
- #26 admin bypass audit (mandatory first — no new privileged surfaces before this)
- #27 catalog schema
- #28 seller product CRUD
- #29 storefront
- #30 cart + checkout (includes InventoryReservationExpiryJob)
- #31 order webhook
- #32 order management
- #33 notifications + email

## 3. Mandatory prerequisite (unchanged from Stage 4 deferral)

**Admin bypass audit — PR #26 must land before any new privileged job or webhook surface.**

Files to touch:
- `packages/db/src/schema/admin_bypass_audit.ts` (new)
- `packages/db/drizzle/0008_admin_bypass_audit.sql` (new)
- `packages/db/src/tenant.ts` — update `withAdmin` to auto-write audit row within same transaction
- `packages/db/src/index.ts` — export new schema
- `apps/api/src/routes/webhooks/hitpay.ts`
- `apps/api/src/jobs/*.ts`

## 4. Key locked decisions (Stage 5)

- Multi-seller cart, single HitPay payment per `checkout_session`, one `order` per seller after confirmation
- `stock_count` = available quantity; atomic decrement at checkout initiation; restore on failure/expiry
- Voucher reserved at checkout initiation (not webhook time); buyer pays discounted total; BOMY-funded
- Voucher and brand discount mutually exclusive per checkout session
- PSP fee split: catalog portion and shipping portion, integer arithmetic, last store absorbs remainder
- `bomy_commission_sen` can be negative (BOMY absorbs voucher cost)
- Separate payment state and fulfilment state on orders
- No HitPay Transfers call until KYB/bank fields exist; manual payout record only
- All new `withAdmin` calls must write durable audit rows (PR #26 pre-requisite)
- Integer sen math throughout; rounding into `bomy_commission_sen` of last store

## 5. Other deferred items (Stage 5 backlog)

- Real email sending (all stubs are `console.log` — PR #33 wires SendGrid/Postmark via SMTP)
- Automated brand payouts (currently manual admin trigger from Stage 4)
- Stripe gateway for international expansion
- `renewal_notification_days` validation: reject invalid tokens instead of silently filtering
- BullMQ `removeOnComplete` / retention options
- Seller KYB / bank account fields (required before HitPay Transfers for order payouts)
- Product reviews / ratings
- Refund flow (schema hooks only in Stage 5)
- MeiliSearch (PostgreSQL FTS for Stage 5)
- Variant-specific images
- Per-store SKU uniqueness

## 6. Key patterns (unchanged from Stage 4)

- `withAdmin(getDb(), { userId, reason }, fn)` for cross-tenant admin reads/writes — **every call must write audit row after PR #26**
- All monetary values as `bigint` (sen)
- Integration tests use `describe.skipIf(!shouldRun)` with `DATABASE_APP_URL` + `BOMY_RLS_READY=1`
- Lazy `getDb()` singleton for DB connections

## 7. Model recommendation

**Opus 4.7** for PRs #26, #30, #31 (architectural / financial correctness critical).
**Sonnet 4.6** for PRs #27, #28, #29, #32, #33.
