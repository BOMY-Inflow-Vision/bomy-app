# Runbook evidence

One committed file per execution of a runbook on a real environment.

## File naming

`YYYY-MM-DD_<runbook-slug>_<env>.md`

Examples:

- `2026-06-15_checkout-flip_local.md`
- `2026-08-01_checkout-flip_staging.md`

## What goes in each file

Mirror the runbook's evidence template. For `checkout-enabled-flip.md` that means: actor (uuid + email), env, pre-flip hard-gate output captures (one block per check), the flip command's stdout, the post-flip audit-row query result, advisory smoke results, and a rollback section if invoked.

## Redaction rules (apply BEFORE committing any evidence file)

- **NEVER commit:**
  - Secrets, API keys, webhook signatures, `Authorization` headers.
  - `DATABASE_URL` strings containing passwords.
  - Raw PSP webhook payloads (may contain card metadata even in sandbox).
- **REDACT** (replace with `[REDACTED]`):
  - Buyer email, phone, shipping address.
- **OK to commit:**
  - `checkout_session_id`, `order_id`, audit row ids.
  - `platform_config` key/value pairs.
  - Test card last-4 digits (HitPay sandbox only — never real card data).

## What does NOT belong here

- Local scratch attempts (failed smoke runs while debugging). These stay out of git.
- Only commit evidence that documents a real flip on a real env.
- If a flip is aborted mid-procedure, commit the evidence anyway with a clear "ABORTED" header and the abort reason — a record of attempted flips is durable institutional knowledge.
