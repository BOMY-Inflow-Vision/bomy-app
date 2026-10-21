# Soft-red R5c-1 (cart + checkout) evidence

Branch `feat/soft-red-r5c1-cart-checkout`. Commits: A1 `b32416f` (pins on old markup), A2 `d0d2c1e` (cart), A3 `3a7a058` (checkout + result pages). Plan: `2026-10-21-soft-red-r5c-cart-checkout-auth-subscribe.md`.

## Scope proof

- `git diff --stat main...HEAD` over the forbidden paths (checkout `actions/queries/compensate/steps`, `apps/web/src/lib`, `auth*`, `middleware`, `app/auth`, `app/brands`, `packages`, `apps/admin`, `apps/api`): **empty**.
- Changed source files: `cart/page.tsx`, `checkout/_form.tsx`, `checkout/page.tsx`, `checkout/success/_poller.tsx`, `checkout/cancelled/_cancel.tsx`. Everything else is tests and the plan.
- Changes that are not class strings: imports of `PageHeading` / `CoverImage`; `h1` -> `PageHeading` (cart, checkout paused + enabled, 8 poller states, 2 cancel states); cart thumbnail block -> `CoverImage`. Titles and button text are unchanged. `checkout_enabled` untouched.

## D4a disclosure (declared exception)

Cart thumbnail changed from a raw `<img>` (64x64) plus an emoji box when the URL is null, to `CoverImage` on a blush `bg-tint` tile.

| State        | Old                                 | New                                        |
| ------------ | ----------------------------------- | ------------------------------------------ |
| No image URL | emoji box                           | Package icon on blush tile                 |
| Good URL     | `<img>`                             | `<img>` (still an `img`)                   |
| Failing URL  | broken-image box (`naturalWidth` 0) | Package icon (swaps after the error event) |

Old states were pinned in A1 (all passed on old code). The three thumbnail pins were then replaced with the new-state pins in A2.

## Baseline vs new (browser, widths 1440/1024/768/390/320)

| Check                         | Old                                                    | New                                     |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------- |
| Cart, long names, page width  | 1165 / 1037 / 782 / 782 at 1024/768/390/320 (overflow) | equals viewport at every width          |
| Cart, 30 rows, qty 999, empty | not measured                                           | equals viewport; content inside rows    |
| Checkout form, long address   | 2129 / 1921 / 1793 / 1793 / 1793 (overflow)            | no overflow (address card wraps)        |
| Heading size                  | 24px                                                   | 36px (sm and up) / 30px                 |
| Summary / paused card radius  | 12px                                                   | 28px; list rows 16px                    |
| Result pages                  | centred, no overflow                                   | same text and buttons, 36/30px, centred |

The long-address overflow fix in `_form.tsx` is an addition beyond the original A3 list. It is a class change only.

## Contrast and keyboard

- Contrast (alpha-composited, light and dark, 1440 and 390): 0 below 4.5:1. Light worst 5.41, dark worst 5.10. Paused card 6.8 light / 7.69 dark.
- Real Tab on cart and checkout form, light + dark, 1440 + 390: every stop has `:focus-visible` with an outline or ring of at least 2px; none clipped or out of view.

## End to end (clean context)

Empty cart -> add Long + Normal -> raise Normal (RM69.90) -> remove Long (RM50.00) -> Continue to checkout reached the `/checkout` form (Subtotal RM50.00, Shipping RM0.00, Total RM50.00). "Proceed to payment" was never pressed.

## Gates

- `pnpm typecheck` 0; `pnpm lint` 0.
- Web (no DB env): 989 passed, 289 skipped; 2 files fail only for missing `DATABASE_URL` (`tests/auth/consent/actions.test.ts`, `tests/auth/magic-link-actions.test.ts`). Both pass in the DB run. Admin: 251 passed, 110 skipped.
- `ui:audit --allow-deferred` exit 0 (92 covered, 0 open); `ui:audit:test` 17/17.
- **Required DB suites** (env check exit 0): 15 files, 184 tests passed, none skipped: `tests/checkout` (all), `tests/brand-subscription` (all), and `tests/auth/{magic-link-actions,consent/actions,auth-config-authorized,auth-error-messages,verify-request-page}`.

## Local data reconciliation

- Baseline before fixtures: users 29165, stores 2510, products 521, variants 487, user_addresses 3757, checkout_sessions 7180, user_consents 1589, orders 0, admin_bypass_audit 237648.
- Fixtures (marker `r5cfx`) were removed twice (after the old-code pass and after the new-build pass). Final `r5cfx` counts: all 0.
- **DB-suite residue and cleanup:** the suites created 23 `@test.bomy` users (all created 10:10:17-10:10:20 UTC, during the suite run) and 12 consent rows (9 tos, 3 privacy, all owned by those users). Dependents checked across every foreign key to `users`: `user_consents` 12 and `action_rate_limits` 2 (both `ON DELETE CASCADE`), and `admin_bypass_audit.actor_user_id` 86 rows (`ON DELETE SET NULL`). No other dependent table had rows.
  - **Cleaned (owner SQL, one transaction):** the 17 suite users that no audit row points to. Their 12 consents and 2 rate-limit rows went with them by cascade. Audit total and null-actor count were checked before and after the delete: unchanged (237976 and 3885).
  - **Kept:** the 6 suite users that 86 audit rows point to. Deleting them would set `actor_user_id` to null on those append-only audit rows, so they were left in place.
  - **After cleanup:** users 29171 (baseline 29165, **+6**); user_consents 1589 (baseline, +0); stores 2510, products 521, variants 487, addresses 3757, checkout_sessions 7180, orders 0 (all baseline). Fixture (`r5cfx`) counts 0.
  - **Deviation for Charlie to accept:** 6 local test users remain (`@test.bomy`, local dev DB only) so the audit rows keep their actor. Their consent rows are gone.
- `admin_bypass_audit` (append-only, never deleted) grew 237648 -> 237976 = **+328**, every row dated 2026-10-21 09:57:36-10:10:20 UTC. Rows 09:45-10:00 bucket: 18; 10:00-10:15 bucket: 310.
  - By time/cause: old-code browser pass +20; new-build browser pass +41 (both before 10:09:20); DB suites +267 (after 10:09:20).
  - By reason: "read checkout_enabled gate" 74 (47 from browser page loads, 27 from suites); checkout app actions 37 (`checkout_compensation:buyer_cancelled` 19, `checkout_initiation` 8, `checkout_store_psp_ref` 7, other compensation 3); brand-subscription actions 15; "read tos_version for consent gate" 2; test helper rows 200 (seed, reset, setup, read, count, find, cleanup, teardown).
- `platform_config.checkout_enabled` = `false` with the original `updated_at` and `updated_by`; flipped locally only for browser form views and restored.
- `bomy-check` exits 1: the DB differs from the last export across many tables (sessions of earlier work too). Run `bomy-export` if switching machines.

## Not evaluated

- Result-page states: timed-out "Still processing" (needs 60 s), "Something went wrong", cancelling, redirecting.
- Real payment, Safari, Firefox, touch devices.
- Auth and brand-subscription pages (R5c-2, Part B).
