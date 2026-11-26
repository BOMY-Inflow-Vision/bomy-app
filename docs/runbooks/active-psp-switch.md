# Runbook — Switch `active_psp` (incl. emergency switch back to HitPay)

**Audience:** `bomy_admin` / `bomy_finance` only. `bomy_ops` is refused by both paths below (Stripe design §13 decision 6).
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

## §2. Emergency switch back to HitPay while HitPay is dormant (kill switch)

Use this when new payments on the current provider (e.g. Stripe) must stop **now** and admin will
not offer HitPay because HitPay is not configured there. This is design §11's kill switch: with
`active_psp = "hitpay"` and HitPay not configured on web, `paymentsEnabled()` and the checkout
provider check fail closed, so membership, brand-subscription and checkout CTAs hide and the
actions refuse. **Payments stay off** until a provider is configured again. Existing rows keep
working on their own provider (keep its keys).

Pre-flight (once): look up your user UUID with the owner-role connection (see
`checkout-enabled-flip.md` §0). Role must be `bomy_admin` or `bomy_finance`.

```bash
pnpm ops:platform-config:set \
  --key active_psp \
  --value '"hitpay"' \
  --actor <your-admin-user-uuid> \
  --reason "Emergency: stop new <provider> payments — <incident ref>"
```

The CLI deliberately has **no credential check** (that is what makes this path work with HitPay
dormant). It still refuses `bomy_ops`, refuses any value other than `"hitpay"` / `"stripe"`,
re-checks your role inside the write transaction, and writes `platform_config_audit` (old → new)
and `admin_bypass_audit` in the same transaction. Paste its stdout into an evidence file under
`evidence/`.

Verify:

1. `/membership` shows "Memberships will reopen soon"; a brand page shows no Subscribe link;
   `/checkout` shows "Checkout is paused" (if `checkout_enabled` was on).
2. `SELECT old_value, new_value, changed_by FROM platform_config_audit WHERE key = 'active_psp' ORDER BY changed_at DESC LIMIT 1;`
   shows the old provider → `"hitpay"` and your UUID.

**Do not** use this CLI to switch _to_ a provider that is not configured: web would keep payments
closed, and admin could not refund rows created on it. Enable providers through §1.

---

## §3. Related flags (not changed here)

- `subscriptions_enabled` — new memberships and brand subscriptions. Flip by
  `pnpm ops:platform-config:set --key subscriptions_enabled ...` (staff roles per the checkout
  runbook). Existing members can still manage and cancel while it is `false`.
- `checkout_enabled` — order checkout. See `checkout-enabled-flip.md`.
