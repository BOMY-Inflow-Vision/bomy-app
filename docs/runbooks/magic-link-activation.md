# Runbook — Enable Magic Link (Email) Sign-in

**Audience:** BOMY ops (Charlie) enabling passwordless email sign-in on brandsofmalaysia.com.
**Owner:** Charlie
**Last revised:** 2026-06-20

---

## Prerequisites (must be true before starting)

1. **SMTP provider configured** — you have an outbound SMTP account for `contact@brandsofmalaysia.com` (e.g. Google Workspace relay, Brevo, Postmark, or similar).
2. **Turnstile already active** — `NEXT_PUBLIC_TURNSTILE_SITEKEY` and `TURNSTILE_SECRET_KEY` are set in Vercel production. (Wired in PR #37 for the seller-apply form; magic link reuses the same site key.)
3. **`verification_tokens` table in prod DB** — applied via migration `0001_auth_tables`; confirm with `SELECT COUNT(*) FROM verification_tokens;` against the Neon prod DB.

---

## §1. Set Vercel environment variables

In the Vercel dashboard → **brandsofmalaysia.com** project → **Settings → Environment Variables** → **Production**:

| Variable                 | Value                                     |
| ------------------------ | ----------------------------------------- |
| `EMAIL_DELIVERY_ENABLED` | `true`                                    |
| `SMTP_HOST`              | e.g. `smtp.gmail.com`                     |
| `SMTP_PORT`              | `587`                                     |
| `SMTP_SECURE`            | `false` (STARTTLS) or `true` (TLS on 465) |
| `SMTP_USER`              | full SMTP username / email address        |
| `SMTP_PASS`              | SMTP password or app password             |
| `MAIL_FROM`              | `BOMY <contact@brandsofmalaysia.com>`     |

Save, then **Redeploy** (trigger a new deployment — Vercel does NOT hot-reload env changes).

---

## §2. Smoke test (end-to-end)

1. Open `https://brandsofmalaysia.com/auth/sign-in` in an **incognito** window.
2. Confirm the email form is visible below the "or" divider and the Turnstile widget renders.
3. Enter your own email address, complete the Turnstile challenge, click **Send magic link**.
4. Confirm you are redirected to `/auth/verify-request` ("Check your email").
5. Check your inbox within ~30 seconds. The email subject should be **"Sign in to BOMY"** from `BOMY <contact@brandsofmalaysia.com>`.
6. Click the link in the email. Confirm you land on `/auth/consent` and can complete the consent flow.
7. Confirm you are signed in (user menu visible, role correct).

**If any step fails, roll back** (§4) before investigating.

---

## §3. Abuse controls in place

The magic link form has the following protections:

| Layer                        | Mechanism                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Browser                      | HTML `type="email"` + `required` attribute                                                                        |
| Turnstile                    | Widget must be solved before the button is enabled; `verifyTurnstile()` runs server-side before any email is sent |
| Server-side email validation | `EMAIL_RE` regex on the trimmed address — same rule as seller-apply                                               |
| Provider gate                | `sendVerificationRequest` only registered when `EMAIL_DELIVERY_ENABLED=true`; form hidden otherwise               |
| Token expiry                 | Verification tokens expire after 24 hours (NextAuth default)                                                      |

**Note:** No explicit per-IP rate limit is currently implemented beyond Turnstile. If you observe abuse (token farming), disable via `EMAIL_DELIVERY_ENABLED=false` and investigate.

---

## §4. Rollback

To disable magic link sign-in without a code deploy:

1. In Vercel → Production env vars, set `EMAIL_DELIVERY_ENABLED` to `false` (or delete the var).
2. Trigger a redeployment.
3. The email form disappears from the sign-in page. Existing sessions are unaffected. Pending verification tokens expire naturally.

Google OAuth sign-in is unaffected by this rollback.

---

## §5. Troubleshooting

| Symptom                                                 | Likely cause                                                           | Fix                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Email form not visible                                  | `EMAIL_DELIVERY_ENABLED` not set to `true` or deployment not triggered | Set var + redeploy                                                                                 |
| Turnstile widget doesn't render                         | Missing `NEXT_PUBLIC_TURNSTILE_SITEKEY`                                | Check Vercel vars; Turnstile must be set up on brandsofmalaysia.com domain in Cloudflare dashboard |
| "Verification failed" error                             | Turnstile secret mismatch or network error                             | Check `TURNSTILE_SECRET_KEY` in Vercel                                                             |
| Email not received                                      | SMTP misconfigured, spam filter, or wrong `MAIL_FROM`                  | Check Vercel web runtime logs; verify SMTP credentials                                             |
| Magic link redirects to NextAuth error page             | `NEXTAUTH_URL` / `AUTH_URL` mismatch                                   | Confirm `AUTH_URL=https://brandsofmalaysia.com` in Vercel                                          |
| `AuthError: Nodemailer requires a server configuration` | Old code (pre-PR #57 fix) still deployed                               | Ensure latest deployment is active                                                                 |
