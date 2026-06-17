# Runbook — Flip `checkout_enabled`

**Audience:** BOMY staff (`bomy_ops` / `bomy_admin` / `bomy_finance`) executing a `checkout_enabled` flip on local or staging. Production is OUT OF SCOPE until a separate production-cutover runbook lands.

**Spec:** [`docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md`](../superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md)
**Owner:** Charlie (Stage 5; revisit when ops handoff happens in Stage 6+).
**Last revised:** 2026-05-27

---

## §0. Pre-flight (do once per actor, per environment)

- Confirm target env (local or staging-template). If `DATABASE_URL` host smells like prod (`*.brandsofmalaysia.com`, `*.production.*`), **stop** — this runbook is not for prod.
- Look up your admin user UUID. This one-off lookup uses the **owner-role** connection (`DATABASE_URL`), NOT `DATABASE_APP_URL`. Under the limited `bomy_app` role no RLS context is set in an ad-hoc `psql` session, so the query would return empty.
  ```sql
  -- Connect with DATABASE_URL (owner role).
  SELECT id, email, role FROM users WHERE email = '<you>@brandsofmalaysia.com';
  ```
  Role must be `bomy_ops`, `bomy_admin`, or `bomy_finance`. Otherwise stop.
  Alternative: when an admin console "view my profile" page exists, use that instead.
- Confirm `DATABASE_URL` is exported and points at the target env. The flip script uses `DATABASE_URL` via `makeDb()`.

---

## §1. Pre-flip hard gate (checks 1–4)

Four checks. **ALL must be green BEFORE running the flip command.** Capture each command's output for the evidence file (§7).

For every check below: **if this fails, STOP. Do not flip. Fix forward or file a bug. Do not flip on partial green.**

### Check 1 — App running on target env

- Local: `pnpm dev` shows the three servers — `web` on :3000, `api` on :3001, `admin` on :3002.
- Staging: `curl -i <STAGING_HEALTH_CHECK_URL>` returns `200`.

**If this fails:** STOP — do not flip.

### Check 2 — HitPay webhook reachable (auth working)

Gate on auth behavior, not HTTP method.

```bash
# Unsigned POST — expected: 401 Unauthorized
curl -i -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3001/webhooks/hitpay

# Signed minimal POST — expected: 200 {"received":true}
# (Use the same signing helper that apps/api tests use — see apps/api/tests/webhooks/ for the HMAC pattern.)
```

**If this fails:** STOP — do not flip.

### Check 3 — Synthetic paid webhook fan-out creates orders + balances the ledger

Send a signed synthetic paid webhook against a pre-seeded `checkout_sessions` row. Then check BOTH:

```sql
-- Order row created from synthetic webhook
SELECT count(*) FROM orders WHERE checkout_session_id = '<seeded SID>';
-- expected: ≥ 1

-- Ledger entries balance for that transaction
SELECT direction, sum(amount_minor)
FROM ledger_entries
WHERE transaction_id = '<TXN>'
GROUP BY direction;
-- expected: debit sum equals credit sum
```

(This is the same machinery the `apps/api/tests/webhooks/` suite exercises. The synthetic webhook does NOT require `checkout_enabled = true` — the gate only fires for buyer-initiated flows, not for HitPay-initiated webhooks.)

**If this fails:** STOP — do not flip.

### Check 4 — Amount-mismatch synthetic webhook parks session in review

Send a synthetic webhook with a crafted mismatched amount (use the same signing helper as Check 2; mirror the synthetic-webhook test pattern under `apps/api/tests/webhooks/`).

```sql
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: payment_review_required
```

**If this fails:** STOP — do not flip.

---

## §2. The flip

Run only after every check in §1 is green:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value true \
  --actor <your-admin-user-uuid> \
  --reason "Enable checkout on <env> — pre-flip hard gate #1-4 green; advisory gaps: <list or 'none'>"
```

**Reason copy convention:** must reference the §1 hard-gate green-status AND any advisory gaps explicitly. The script's stdout is the canonical evidence — paste it verbatim into §7.

---

## §3. Post-flip evidence check

Immediately after the flip command returns success, verify the audit row exists:

```sql
SELECT id, old_value, new_value, changed_by, changed_at
FROM platform_config_audit
WHERE key = 'checkout_enabled'
ORDER BY changed_at DESC LIMIT 1;
```

Verify:

- `old_value` is `false`, `new_value` is `true`.
- `changed_at` is within the last few seconds.
- `changed_by` matches your actor UUID from §0.

**If this fails** (no row, wrong values, or wrong actor): rollback per §6 trigger #4 and stop. The script reported success but the audit chain is broken — a real bug worth pausing on.

---

## §4. Post-flip E2E verification

The actual buyer flow that the flip enables. Run this **immediately** after the flip — this is the highest-priority verification, ahead of the advisory smoke in §5.

Walk through as a buyer:

1. Sign in as a test buyer (or any account; create one if needed).
2. Add at least one product to cart from `/`.
3. Navigate to `/checkout` — verify it renders the form (not the "paused" UI).
4. **Verify the displayed totals math** on `/checkout`: confirm `subtotal + shipping − voucher contribution = grand total`. (This is the totals-sanity check that was originally pre-flip Check 5; it's only verifiable here because `/checkout` is paused when the flag is `false`.)
5. Complete checkout via HitPay sandbox.
6. Return to the site (success page).

Then verify in the DB:

```sql
-- 1. Session reaches `paid`.
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: paid

-- 2. At least one order row was created.
SELECT count(*) FROM orders WHERE checkout_session_id = '<SID>';
-- expected: ≥ 1

-- 3. Ledger entries balance for the transaction.
SELECT direction, sum(amount_minor)
FROM ledger_entries
WHERE transaction_id = '<TXN>'
GROUP BY direction;
-- expected: debit sum equals credit sum
```

**Expected smoke window:** within 5 minutes of the flip (allowing for inventory reservation, HitPay sandbox latency, and webhook fan-out).

**If this fails:** rollback per §6 trigger #1 immediately. Post-flip E2E failure is the most operationally severe rollback trigger — it means real buyers cannot complete real purchases on the live flag.

---

## §5. Advisory smoke (post-flip sanity — does NOT block flip)

Each is a small DB query or UI walkthrough. **Failures here do NOT trigger rollback** unless they expose a buyer-blocking bug — log them in the evidence file and triage out-of-band.

- Buyer / seller / admin order views render correctly.
- `order_paid` buyer + ops emails arrived (Mailhog inbox locally, real inbox on staging).
- Voucher issuance email path healthy (manually trigger via admin `Issue Now`).
- Payout-pending email path (admin `createPayoutRecord` happy path).
- Seller-inquiry ops alert from `/seller/apply` submission (synthetic submission).
- Inventory reservation expiry job runs without errors (check `apps/api` logs).
- Order auto-complete job runs without errors.

---

## §6. Rollback

Same script, `--value false`, with a `--reason` explaining the trigger:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value false \
  --actor <your-admin-user-uuid> \
  --reason "Rollback: <one-line trigger>"
```

**Rollback triggers (any ONE is sufficient):**

1. **Post-flip E2E checkout fails or cannot complete within the expected smoke window** (§4 fails). Includes: buyer can't reach a working `/checkout`; HitPay sandbox checkout doesn't return; `checkout_sessions.status` never advances to `paid`; webhook fan-out errors observed in `apps/api` logs during the smoke; HitPay charge that doesn't land as a row in `orders`.
2. `/checkout` returns `CHECKOUT_DISABLED` for users you expect to have access (config drift).
3. Ledger balance mismatch on any post-flip transaction (whether discovered in §4 or in real traffic afterwards).
4. `checkout_enabled` cannot be verified as `true` post-flip (per §3), OR the script's success output / `platform_config_audit` row is missing or inconsistent.

---

## §7. Evidence template + redaction rules

Each flip produces one committed evidence file: `docs/runbooks/evidence/YYYY-MM-DD_checkout-flip_<env>.md`. Structure:

```markdown
# Checkout flip evidence — <env> — YYYY-MM-DD

**Actor:** <email> (uuid: <uuid>)
**Environment:** local | staging | future-prod
**Started:** YYYY-MM-DDTHH:MM:SSZ
**Completed:** YYYY-MM-DDTHH:MM:SSZ

## §1 Pre-flip hard gate

### Check 1 — app running

<paste output>

### Check 2 — HitPay webhook reachable

<paste output>

... (one block per check 1–4) ...

## §2 Flip command stdout

<paste verbatim>

## §3 Post-flip audit row query result

<paste verbatim>

## §4 Post-flip E2E verification result

<paste session_id, order count, ledger balance check, totals math (subtotal + shipping − voucher = grand total)>

## §5 Advisory smoke results

- Buyer/seller/admin order views: <pass | gap with note>
- order_paid emails: <pass | gap>
- ... (one line per advisory item) ...

## §6 Rollback (if invoked)

<paste rollback command + stdout, or "n/a">
```

### Redaction (apply BEFORE committing)

- **NEVER commit:** secrets, webhook signatures, `Authorization` headers, `DATABASE_URL` with passwords, raw PSP payloads.
- **REDACT** (replace with `[REDACTED]`): buyer email, phone, shipping address.
- **OK to commit:** `checkout_session_id`, `order_id`, audit row ids, `platform_config` key/value pairs.
- Local-only scratch attempts (failed smoke runs, test data) stay out of git. Commit evidence only for real flips on real envs.

---

## §8. Staging section (NOT executable yet)

> ⚠️ **NOT EXECUTABLE.** Staging infrastructure does not yet exist as of 2026-05-27.
> This section is a structural template. When staging stands up, replace the
> `<PLACEHOLDER>` markers and remove this banner in the same PR that
> establishes staging.

Same outline as local. Replace these placeholders when staging exists:

- `<STAGING_DATABASE_URL>`
- `<STAGING_HEALTH_CHECK_URL>`
- `<STAGING_HITPAY_SANDBOX_WEBHOOK_URL>`
- `<STAGING_ADMIN_ACTOR_UUID>`
- `<STAGING_APP_URL>`
- `<STAGING_DEPLOY_COMMAND>` (placeholder until the deploy mechanism is chosen)

---

## §9. Production section (intentionally absent)

Production is out of scope of this runbook. A separate production-cutover runbook will be authored when prod infra exists. Named dependencies it will need to address: real domain + DNS, HitPay live keys (not sandbox), monitoring + alerting, defined rollback authority, support coverage windows. Until that runbook lands, **no prod flip is authorised by this runbook.**
