# Runbook — Flip `checkout_enabled`

**Audience:** BOMY staff (`bomy_ops` / `bomy_admin` / `bomy_finance`) executing a `checkout_enabled` flip on local or staging. Production is OUT OF SCOPE until a separate production-cutover runbook lands.

**Spec:** [`docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md`](../superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md)
**Owner:** Charlie (Stage 5; revisit when ops handoff happens in Stage 6+).
**Last revised:** 2026-05-27

---

## §0. Pre-flight (do once per actor, per environment)

- Confirm target env (local or staging-template). If `DATABASE_URL` host smells like prod (`*.bomy.my`, `*.production.*`), **stop** — this runbook is not for prod.
- Look up your admin user UUID. This one-off lookup uses the **owner-role** connection (`DATABASE_URL`), NOT `DATABASE_APP_URL`. Under the limited `bomy_app` role no RLS context is set in an ad-hoc `psql` session, so the query would return empty.
  ```sql
  -- Connect with DATABASE_URL (owner role).
  SELECT id, email, role FROM users WHERE email = '<you>@bomy.my';
  ```
  Role must be `bomy_ops`, `bomy_admin`, or `bomy_finance`. Otherwise stop.
  Alternative: when an admin console "view my profile" page exists, use that instead.
- Confirm `DATABASE_URL` is exported and points at the target env. The flip script uses `DATABASE_URL` via `makeDb()`.

---

## §1. Pre-flip hard gate (checks 1–7)

Seven checks. **ALL must be green BEFORE running the flip command.** Capture each command's output for the evidence file (§6).

For every check below: **if this fails, STOP. Do not flip. Fix forward or file a bug. Do not flip on partial green.**

### Check 1 — App running on target env

- Local: `pnpm dev` shows the three servers — `web` on :3000, `api` on :3001, `admin` on :3002.
- Staging: `curl -i <STAGING_HEALTH_CHECK_URL>` returns `200`.

### Check 2 — HitPay webhook reachable (auth working)

Gate on auth behavior, not HTTP method.

```bash
# Unsigned POST — expected: 401 Unauthorized
curl -i -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3001/webhooks/hitpay

# Signed minimal POST — expected: 200 {"received":true}
# (Use the same signing helper that apps/api tests use — see apps/api/tests/webhooks/ for the HMAC pattern.)
```

### Check 3 — Sandbox checkout completes E2E

Walk through the flow as a buyer (add to cart → `/checkout` → HitPay sandbox → return to site).

```sql
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: paid
```

### Check 4 — Webhook fan-out creates order(s)

```sql
SELECT count(*) FROM orders WHERE checkout_session_id = '<SID>';
-- expected: ≥ 1
```

### Check 5 — Ledger entries balance

```sql
SELECT direction, sum(amount_minor)
FROM ledger_entries
WHERE transaction_id = '<TXN>'
GROUP BY direction;
-- expected: debit sum equals credit sum
```

### Check 6 — Amount-mismatch parks session in review

Send a synthetic webhook with a crafted mismatched amount (use the same signing helper as Check 2; mirror the synthetic-webhook test pattern under `apps/api/tests/webhooks/`).

```sql
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: payment_review_required
```

### Check 7 — Shipping fee / totals sane

Visual `/checkout` walkthrough: subtotal + shipping − voucher contribution = displayed grand total. Capture a screenshot or written confirmation in the evidence.

---

## §2. The flip

Run only after every check in §1 is green:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value true \
  --actor <your-admin-user-uuid> \
  --reason "Enable checkout on <env> — pre-flip hard gate #1-7 green; advisory gaps: <list or 'none'>"
```

**Reason copy convention:** must reference the §1 hard-gate green-status AND any advisory gaps explicitly. The script's stdout is the canonical evidence — paste it verbatim into §6.

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

**If this fails** (no row, wrong values, or wrong actor): rollback per §5 trigger #5 and stop. The script reported success but the audit chain is broken — a real bug worth pausing on.

---

## §4. Advisory smoke (post-flip sanity — does NOT block flip)

Each is a small DB query or UI walkthrough. **Failures here do NOT trigger rollback** unless they expose a buyer-blocking bug — log them in the evidence file and triage out-of-band.

- Buyer / seller / admin order views render correctly.
- `order_paid` buyer + ops emails arrived (Mailhog inbox locally, real inbox on staging).
- Voucher issuance email path healthy (manually trigger via admin `Issue Now`).
- Payout-pending email path (admin `createPayoutRecord` happy path).
- Seller-inquiry ops alert from `/seller/apply` submission (synthetic submission).
- Inventory reservation expiry job runs without errors (check `apps/api` logs).
- Order auto-complete job runs without errors.

---

## §5. Rollback

Same script, `--value false`, with a `--reason` explaining the trigger:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value false \
  --actor <your-admin-user-uuid> \
  --reason "Rollback: <one-line trigger>"
```

**Rollback triggers (any ONE is sufficient):**

1. Webhook fan-out failures observed in `apps/api` logs after flip.
2. `/checkout` returns `CHECKOUT_DISABLED` for users you expect to have access (config drift).
3. Ledger balance mismatch on any post-flip transaction.
4. Any HitPay charge that doesn't land as a row in `orders`.
5. `checkout_enabled` cannot be verified as `true` post-flip (per §3), OR the script's success output / `platform_config_audit` row is missing or inconsistent.

---

## §6. Evidence template + redaction rules

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

... (one block per check 1–7) ...

## §2 Flip command stdout

<paste verbatim>

## §3 Post-flip audit row query result

<paste verbatim>

## §4 Advisory smoke results

- Buyer/seller/admin order views: <pass | gap with note>
- order_paid emails: <pass | gap>
- ... (one line per advisory item) ...

## §5 Rollback (if invoked)

<paste rollback command + stdout, or "n/a">
```

### Redaction (apply BEFORE committing)

- **NEVER commit:** secrets, webhook signatures, `Authorization` headers, `DATABASE_URL` with passwords, raw PSP payloads.
- **REDACT** (replace with `[REDACTED]`): buyer email, phone, shipping address.
- **OK to commit:** `checkout_session_id`, `order_id`, audit row ids, `platform_config` key/value pairs.
- Local-only scratch attempts (failed smoke runs, test data) stay out of git. Commit evidence only for real flips on real envs.

---

## §7. Staging section (NOT executable yet)

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

## §8. Production section (intentionally absent)

Production is out of scope of this runbook. A separate production-cutover runbook will be authored when prod infra exists. Named dependencies it will need to address: real domain + DNS, HitPay live keys (not sandbox), monitoring + alerting, defined rollback authority, support coverage windows. Until that runbook lands, **no prod flip is authorised by this runbook.**
