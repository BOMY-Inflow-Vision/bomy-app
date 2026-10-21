# Soft-red R5c-2 (auth + brand subscription pages) evidence

Branch `feat/soft-red-r5c2-auth-subscribe`. Commits: B1 `e76fa1a` (pins on the old markup), B2 `fed995e` (auth pages), B3 `1e6ae04` (subscribe pages), fix `1a145a9` (verify-request corner, legal-link focus rings). Plan: `2026-10-21-soft-red-r5c-cart-checkout-auth-subscribe.md`, Part B. R5c-1 is #178.

## Scope proof

- `git diff --stat main...HEAD` over the forbidden and untouched paths (checkout `actions/queries/compensate/steps`, `apps/web/src/lib`, `auth.ts`, `auth.config.ts`, `middleware.ts`, `app/auth/*/actions.ts`, `magic-link-form.tsx`, `consent-actions.tsx`, `app/brands/[slug]/subscribe/actions.ts`, `packages`, `apps/admin`, `apps/api`): **empty**.
- Changed source files: `auth/{sign-in,consent,verify-request}/page.tsx`, `brands/[slug]/subscribe/{page.tsx,success/page.tsx,success/poller.tsx}`. The rest is tests and the plan.
- Changes that are not class strings, all listed: import of `PageHeading`; the subscribe `h1` -> `<PageHeading title={store.name} align="center" />` (same text, same level); a `gridClass` constant that picks class names by `plans.length` (1, 2 or 3+), with no logic or data change; line re-wraps by Prettier on the legal `<a>` links and one price `<p>` (same attributes and text). No action, query, `signIn` call, form field, label, `href`, `target` or `aria-*` value changed.

## Auth page layout contract (measured, 5 widths)

`main` is `min-h-[calc(100dvh-var(--nav-height)-var(--nav-offset))] flex items-center justify-center px-4 py-10`; the card is `rounded-bento border border-border bg-card shadow-sm`. Four things measured apart (viewport, `main` + nav bottom, card, footer + document):

| Check (sign-in, no banner)              | Old (1440x900)                              | New (1440x900)               |
| --------------------------------------- | ------------------------------------------- | ---------------------------- |
| `main` top vs nav bottom                | 80 = 80                                     | 80 = 80                      |
| `main` height                           | 900 (ends at 980, 80 px below the viewport) | 820 (ends at 900 = viewport) |
| Card centre vs `main` centre            | 0                                           | 0                            |
| Card fully in view                      | yes                                         | yes                          |
| Document height (footer follows `main`) | 1627                                        | 1547                         |

- Pass rules met on the new build for sign-in, verify-request, consent and the success cards: `main` top = nav bottom; `main` height = viewport minus nav-clear when the card fits (820 at 900, 688 at 768, 944 at 1024, 768 at 844); centre offset 0; whole card visible at 1440x900, 1024x768, 768x1024 and 390x844; at 320x568 the card is taller than the free space, `main` grows (546 for sign-in) and the card is not clipped.
- The old double scroll was real: `main` was a full viewport tall starting below the nav, so the page always scrolled by about the nav height before the footer. Old 320x568 sign-in with both banners: card flush against the nav (top 76); new has 40 px padding (top 116).
- Document scroll alone is not a failure (the footer follows `main`).
- `ui:audit` does not flag the `min-h` calc value (92 findings covered, 0 open, same as before), so no ledger entry was added.

## Subscribe pages

| Check                                                   | Old                                                                 | New                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| 80-char store name, page width at 1440/1024/768/390/320 | 2391 / 2183 / 2055 / 1818 / 1818 (overflow)                         | equals the viewport at all five               |
| Store-name `h1` overflow                                | yes                                                                 | no (`PageHeading`, breaks anywhere)           |
| 200-char plan description, plan card width at 390       | 1802 px                                                             | 358 px                                        |
| One plan at 1440                                        | left third of the grid (x 384, width 213)                           | centred (x 528, width 384)                    |
| Two plans at 1440                                       | two narrow cards on the left (213 each)                             | two columns filling the width (328 each)      |
| Three plans at 1440                                     | three columns (213 each)                                            | same three columns                            |
| Payments-off notice, long store, page width             | 2391 / 2183 / 2055 / 1818 / 1818                                    | equals the viewport; notice stays in its card |
| Card radius and ground                                  | `rounded-2xl` (16 px, from the class) on a muted full-height ground | 28 px white cards on the page ground          |

- Success page: the old `main` was a full viewport tall with the card at 160 px; the new `main` hugs the card (card top 144 at sm and up, 116 below). At 320x568 the old unconfirmed card ran off the viewport (156 to 638); the new one is fully in view (116 to 533).

## Success views checked in the browser (old and new)

Fixture clock: `.andy/r5c2fx-refresh.sql` set the fresh pending row to now and the stale row to 45 minutes ago before each pass (ages printed 0.0 and 45.0).

1. **Active** store: "Subscription activated!" with the link to `/account/subscriptions`.
2. **Fresh pending**: "Activating your subscription…" with the spinner.
3. **10-second timeout**: about 1 s after load the title was "Activating your subscription…"; about 12 s later it was "We haven't confirmed your payment" (old and new).
4. **Stale pending** (45 min): the unconfirmed view at once.
5. **No row**: the unconfirmed view at once.

Same text and buttons in old and new ("I've paid — check again", "Start over"). **Neither button was pressed.** The signed-out redirect and the unknown-store 404 are pinned by unit tests (not browser-evaluated).

## Signed-in Subscribe form without HitPay credentials

- The normal local `.env.local` has both `HITPAY_API_KEY` and `HITPAY_API_URL` set (key length 65, URL length 31; values were not read or shown), so a normal run would have payments live-enabled.
- **Every Part B browser pass therefore ran with overridden values on the command line only:** dummy `HITPAY_API_KEY=r5c2-render-only` and `HITPAY_API_URL=http://127.0.0.1:9/` for the form views (Node's `--env-file` does not override existing variables), and empty strings for the payments-off views. The real key was never loaded into a browser-facing server for these pages.
- `apps/web/.env.local` was never edited: `shasum` b51bd3f9014d97fb77047041b597e4feda8b0a43 before the first pass, after the old pass and after the new pass.
- "Subscribe" was never pressed. The form was only measured (buttons, focus rings).
- The servers on port 3000 were stopped between modes; port 3000 was confirmed free before each start and after the last one.

## Contrast and keyboard

- **Contrast** (alpha-composited, light and dark, 1440 and 390, eight page states: sign-in with both banners, verify-request, consent, subscribe signed out and signed in, success active, activating, unconfirmed): **0 text elements below 4.5:1**. Light worst 5.41 (sign-in warning banner), dark worst 5.10. Measured on the build before the last commit; that commit changed no colour class.
- **Keyboard** (real Tab, light and dark, 1440 and 390, seven pages, final build): every button, input and link inside `main` shows `:focus-visible` with at least a 2 px ring; none clipped; none out of view. The three extra stops on sign-in are the Cloudflare Turnstile widget wrappers (third party, untouched).
- **Found and fixed beyond the plan list:** the Terms and Privacy links on sign-in and consent had no 2 px ring (only the browser default). They now use the same `focus-visible:ring-2 ring-ring` pattern as the verify-request link (class strings only, pinned by tests).
- **Found and fixed:** the first build showed the verify-request card at 12 px, not 28 px: `Card` carries `rounded-card` and the class merge does not know `rounded-bento`. The card now uses `!rounded-bento` (pinned by a test); the final build measured 28 px on every card.

## Known limitation (not changed)

With an absurd price (RM9,999,999.99) the "Subscribe — RM…" label is clipped inside its pill. The button is `@bomy/ui` (not edited) and the page does not overflow. Real plan prices are far smaller.

## Gates

- `pnpm typecheck` 0; `pnpm lint` 0; `ui:audit --allow-deferred` exit 0 (92 covered, 0 open); `ui:audit:test` 17/17.
- Web without DB env: 1035 passed, 289 skipped; 2 files fail only for missing `DATABASE_URL` (`tests/auth/consent/actions.test.ts`, `tests/auth/magic-link-actions.test.ts`); both pass in the DB run. Admin: 251 passed, 110 skipped.
- **Required DB suites** (env check exit 0), run at 13:37:59 UTC: **17 files, 212 tests passed, none skipped.** Per file: `auth-config-authorized` 25, `auth-error-messages` 12, `consent/actions` 12, `magic-link-actions` 14, `verify-request-page` 5, `brand-subscription/actions` 15, `actions.unit` 4, `subscribe-page` 15, `subscribe-success` 12, `checkout/callouts` 2, `cancel` 11, `checkout-form-look` 3, `checkout-page` 6, `checkout-results` 29, `computeCheckoutTotals` 9, `initiate` 22, `preview` 16.

## Local data reconciliation

- Baselines before fixtures (A): users 29171, stores 2510, brand_subscription_plans 1771, brand_subscriptions 1512, user_consents 1589, user_addresses 3757, action_rate_limits 1244, orders 0, admin_bypass_audit 237976 (3885 with no actor); `checkout_enabled` false (updated_at `2026-05-28 03:21:59.449+00`, updated_by `1ee25a63-acf9-4d4c-b7f0-47a4c5f844be`).
- Fixtures (marker `r5c2fx`; slugs `r5c2fx-*`, not `r5c2-*` as the plan text said): 2 users, 2 consents, 7 stores, 10 plans, 3 subscriptions. Removed after the old-code pass and again after the new-build pass; both times every `r5c2fx` count was 0 and the non-audit tables were back to baseline.
- **DB-suite residue:** the suites created 23 `@test.bomy` users (created 13:37:59-13:38:03 UTC, during the suite run), 12 consents (9 tos, 3 privacy) and 2 `action_rate_limits` rows. Dependents checked across every foreign key to `users`: consents 12 and rate-limit rows 2 (`ON DELETE CASCADE`) and `admin_bypass_audit.actor_user_id` 86 rows (`ON DELETE SET NULL`); nothing else.
  - **Cleaned** (owner SQL, one transaction): the 17 suite users with no audit link; their consents and one rate-limit row went by cascade. Audit total and null-actor count before and after: 238328 / 3885 both times.
  - **Retained:** 6 suite users that 86 audit rows point to (deleting them would blank the actor on append-only audit rows). One of the 2 rate-limit rows belongs to a retained user.
  - **After cleanup:** users 29177 (baseline 29171, **+6**); user_consents 1589 (baseline); action_rate_limits 1245 (+1, owned by a retained user); stores 2510, plans 1771, subscriptions 1512, addresses 3757, orders 0 (baseline). Fixture counts 0.
  - **Accepted by Charlie on 2026-10-21 ("accept")**, after Bob approved the evidence: the 6 retained local dev test users (`@test.bomy`) and the 1 rate-limit row owned by one of them stay in the local database. This is the actor-linked exception in the plan (Task A4 Step 7), applied to R5c-2. R5c-1's acceptance did not carry over; this one is separate.
- `admin_bypass_audit` (append-only, never deleted) grew 237976 -> 238328 = **+352**; null-actor count unchanged (3885):
  - old-code browser pass +26 (13:23-13:25 UTC), all "resolve store for brand subscription success page";
  - new-build browser pass +59 (13:25-13:38 UTC), the same reason;
  - DB suites +267 (after 13:37:59 UTC): "read checkout_enabled gate" 27, test helper rows (reset, seed, setup, count, cleanup) and checkout app actions.
- `checkout_enabled` = false with the original `updated_at` and `updated_by` after everything. It was never flipped in this PR.
- `bomy-check` exits 1: the DB differs from the last export on many tables (this and earlier sessions). Run `bomy-export` if switching machines.

## Not evaluated

- Real consent, subscribe or sign-in submit ("I Agree", "Subscribe", "Start over", "I've paid — check again" were never pressed); Google sign-in; real Turnstile keys; a real HitPay redirect.
- Sign-in with email delivery off, and the other `?error=` codes, are unit-pinned only (browser run had email on).
- Success-page signed-out redirect and unknown-store 404: unit-pinned only.
- Safari, Firefox, touch devices.
