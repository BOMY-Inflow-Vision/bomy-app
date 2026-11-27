# Runbook — Switch `active_psp` and emergency stop of new payments

**Audience:** `active_psp` changes: `bomy_admin` / `bomy_finance` only; `bomy_ops` is refused (Stripe design §13 decision 6). The emergency-stop flag steps (§2) accept any staff role.
**Spec:** [`docs/superpowers/specs/2026-11-24-psp-stripe-design.md`](../superpowers/specs/2026-11-24-psp-stripe-design.md) §3.4, §11 (Rollback).
**Owner:** Charlie.
**Last revised:** 2026-11-26

`active_psp` picks the provider for **new** payments only. Rows already created keep their own
`psp_provider` for webhooks, renewals, cancels and refunds. **Never remove a provider's keys while
any of its rows can still move money** (pending sessions, recurring memberships, refundable
duplicates).

---

## §1. Normal switch — admin `/config`

Use this to **enable** a provider. Admin only offers a provider whose credentials are configured on
the admin app, because admin needs them to cancel and refund rows created under it.

1. Open admin → **Platform Config** → **Payment provider**.
2. Click **Use <provider> for new payments**. Takes effect on the next storefront request.
3. Check the toast says `New payments now use <provider> (was <old>)`.
4. Check the api `GET /ready` `psp` block shows that provider configured for webhooks.

Audit: one `platform_config_audit` row (old → new, `changed_by` = you) and one
`admin_bypass_audit` row, written in the same transaction as the change.

---

## §2. Emergency stop of ALL new payments

Use this when new payments must stop **now** (e.g. Stripe misbehaving).

**Switching provider alone is not a stop.** Admin and the storefront are separate deployments
with separate keys: admin may lack HitPay keys while the storefront still has them, so setting
`active_psp = "hitpay"` can route new payments to HitPay instead of stopping them. Always turn
the two on/off flags off **first**. They fail closed on every deployment, whatever keys it has.
Existing rows keep working on their own provider (keep its keys).

Pre-flight (once): look up your user UUID with the owner-role connection and point the CLI at the
target database, as in `checkout-enabled-flip.md` §0. The flag steps accept `bomy_ops`,
`bomy_admin` or `bomy_finance`; the `active_psp` step accepts only `bomy_admin` / `bomy_finance`.
Turning a flag **off** is the fail-closed direction and is allowed on any environment, production
included.

**Step 0 — record the current values** (you need them to restore):

```sql
SELECT key, value FROM platform_config
WHERE key IN ('checkout_enabled', 'subscriptions_enabled', 'active_psp') ORDER BY key;
```

**Step 1 — stop order checkout:**

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value false \
  --actor <your-admin-user-uuid> \
  --reason "Emergency stop: all new payments — <incident ref>"
```

**Step 2 — stop new memberships and brand subscriptions:**

```bash
pnpm ops:platform-config:set \
  --key subscriptions_enabled \
  --value false \
  --actor <your-admin-user-uuid> \
  --reason "Emergency stop: all new payments — <incident ref>"
```

**Step 3 — verify the stop** before anything else:

1. Each CLI run printed `after: false` and a `platform_config_audit` row id.
2. ```sql
   SELECT key, old_value, new_value, changed_by, changed_at FROM platform_config_audit
   WHERE key IN ('checkout_enabled', 'subscriptions_enabled') ORDER BY changed_at DESC LIMIT 2;
   ```
   shows both keys → `false` with your UUID.
3. On the storefront: `/membership` shows "Memberships will reopen soon", a brand's
   storefront `/brands/<slug>` no longer shows the "Subscription plans" button, its
   `/brands/<slug>/subscribe` page shows "Subscriptions will reopen soon" with no Subscribe
   button, and `/checkout` shows "Checkout is paused". The storefront reads these flags through a
   read-only lookup (migration 0041), so the change shows on the next page view.

**Step 4 (optional) — move new payments off the failing provider**, only after Step 3 is green.
Use §1 if admin offers HitPay. If HitPay is dormant on admin, use the CLI (no credential check by
design; it still refuses `bomy_ops` and any value other than `"hitpay"` / `"stripe"`):

```bash
pnpm ops:platform-config:set \
  --key active_psp \
  --value '"hitpay"' \
  --actor <your-admin-user-uuid> \
  --reason "Emergency stop: move new payments off <provider> — <incident ref>"
```

Every CLI run writes `platform_config_audit` (old → new) and `admin_bypass_audit` in the same
transaction and re-checks your role inside it. Paste each stdout into an evidence file under
`evidence/`.

**Restore** (only once the cause is fixed and the provider to use is configured on the storefront,
api and admin):

1. Select that provider in admin `/config` (§1). Check api `GET /ready` shows it configured.
2. Reopen memberships and brand subscriptions, if Step 0 showed `true`:
   `pnpm ops:platform-config:set --key subscriptions_enabled --value true --actor <uuid> --reason "Restore after <incident ref>"`.
   Verify `/membership` shows the join button again.
3. Re-enable order checkout **only** through `checkout-enabled-flip.md` (its pre-flip hard gate
   applies), and only if Step 0 showed `true`.

**Do not** use the CLI to switch _to_ a provider that is not configured: admin could not refund
rows created on it. Enable providers through §1.

---

## §3. Related flags

- `subscriptions_enabled` — new memberships and brand subscriptions (default `false`). Existing
  members can still manage and cancel while it is `false`; renewals and webhooks keep running.
- `checkout_enabled` — order checkout. Turning it on: `checkout-enabled-flip.md` only.
