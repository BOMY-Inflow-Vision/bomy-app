# Service Provider Application — Design Spec

**Date:** 2026-09-28
**Status:** Approved by Charlie, ready for implementation planning.
**Classification:** Architectural (new entity type, new trust boundary — provider gets a real login).

## 1. What this covers

A signed-in application form where service providers (graphic designers, videographers, etc.)
apply to offer services to BOMY sellers. Admin will later approve or reject applications.

**Explicitly out of scope for this spec** (deferred to future specs, see §8):

- Admin review screen / approve / reject actions.
- The seller-facing "browse approved providers" directory.
- Admin CRUD for the service-category list.

Charlie's own scoping: "Build the signed-in application form and its application table now. Leave
admin review and the seller-facing directory for later." This spec is deliberately narrow.

## 2. Background / decisions already made

Blocking questions from the original brainstorm (`app/.andy/handoff.md` §0, answered 2026-09-28):

1. **A provider gets their own login/account.** Not a login-less admin-curated directory. This is
   the fact that makes the feature architectural — it needs a real auth-gated flow.
2. **Payment is off-platform.** Pure referral; seller and provider settle directly. Checkout,
   ledger, and PSP code are untouched by this feature.
3. **Business Nature = Service Category (picklist, with "Other") + free-text description**,
   description required only when "Other" is selected.

An Opus subagent (dispatched per project convention: Opus required for architecture-level calls
once a task is confirmed load-bearing) produced 3 named approaches. Charlie picked:

- **No new `UserRole` value.** The single-valued `users.role` column, combined with the web app's
  up-to-30-day-stale JWT role (`apps/web/src/auth.ts`), makes role-based capability fragile and
  risks colliding with `seller_owner` for a user who is both a seller and a provider. Instead,
  "being a provider" is modeled as **owning an _approved_ row**, the same pattern `stores`/`products`
  already use (`owner_id = app.current_user_id()`), not a role check. **A `pending` or `rejected`
  application does not grant provider access — only `status = 'approved'` does.** This spec doesn't
  build that capability check yet (no provider-only pages exist until the admin-review PR), but the
  rule is locked in now so a future spec doesn't have to re-derive it.
- **Sequencing: sign in first, then apply**, not the `seller_inquiries` login-less pattern. This
  removes the "applicant must sign in once, matched by email" fragility and the unverified-email
  risk of collecting an application before proving identity.
- **Directory (future) is seller-only, not public** — contradicts proposal v2 §15 ("public-facing
  browse"), which should be reconciled in the proposal doc separately; not blocking this spec.
- **Dual role allowed.** One account may be both `seller_owner` and a service provider. Seller
  access and provider-application access are checked independently — this is a natural consequence
  of the ownership model above, not extra work.

Charlie's review of the first design pass added 4 corrections, all incorporated below:

1. Approval must be impossible through the application form itself (DB-enforced, not just app code).
2. Duplicate prevention must be a DB constraint, not just an app-level check-then-insert (race-safe).
3. The confirmation email goes to the signed-in account's own email, never to an arbitrary
   applicant-typed address.
4. Staff read access is narrowed to the roles that will actually review applications — excludes
   `bomy_finance`, which does not need applicant contact details for this table.

## 3. Data model

### `service_provider_applications`

| Column                 | Type                                                           | Notes                                                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | uuid PK, `default random`                                      |                                                                                                                                                                                                                                                     |
| `applicant_user_id`    | uuid NOT NULL, FK → `users.id`                                 | No nullable/anonymous path — sign-in is mandatory.                                                                                                                                                                                                  |
| `name`                 | text NOT NULL                                                  |                                                                                                                                                                                                                                                     |
| `contact_email`        | text NOT NULL                                                  | Business contact email as typed on the form. **Informational only — never an automated-email destination.**                                                                                                                                         |
| `contact_number`       | text NOT NULL                                                  | Plaintext, matching `seller_inquiries.contact_number` precedent (pre-existing gap, not solved here — see §8).                                                                                                                                       |
| `company_name`         | text NOT NULL                                                  |                                                                                                                                                                                                                                                     |
| `service_category_id`  | uuid NULL, FK → `service_categories.id` (`ON DELETE RESTRICT`) | NULL means "Other" — a **UI-only** choice. **"Other" must never be a seeded row in `service_categories`.** If it were a real row, its `id` would satisfy `service_category_id IS NOT NULL` and bypass the required-description rule below entirely. |
| `business_description` | text NULL                                                      | Required (non-empty after trim) when `service_category_id IS NULL`.                                                                                                                                                                                 |
| `status`               | `inquiry_status` enum (reused), NOT NULL, default `'pending'`  | Existing enum already has `pending`/`approved`/`rejected` — reused so the future admin-review PR needs no enum migration.                                                                                                                           |
| `created_at`           | timestamptz NOT NULL, default now()                            |                                                                                                                                                                                                                                                     |

Constraints:

- `CHECK (service_category_id IS NOT NULL OR (business_description IS NOT NULL AND length(trim(business_description)) > 0))`
  — enforces "description required when Other" in the database itself, not just the validator.
- **Partial unique index** on `applicant_user_id` `WHERE status IN ('pending', 'approved')` —
  enforces "at most one pending-or-approved application per account" at the DB level, so two
  concurrent submissions from the same account can't both succeed (addresses Charlie's correction
  #2). A rejected row does not count toward this constraint, so re-applying after rejection is
  possible today; **whether that's the desired final behavior is an open question**, deferred to
  the admin-review spec — it needs no decision now because the constraint already allows it.

### `service_categories`

Mirrors the existing `store_categories` table (`packages/db/src/schema/store_categories.ts`)
exactly: `id`, `name`, `slug` (unique), `sort_order`, `is_active`, `created_at`. Seeded with a
starter list via the migration itself (exact list TBD at plan/implementation time — Charlie to
confirm or edit). **No admin CRUD UI this round** — editing the list is a manual migration/DB
operation until the admin-review PR adds a CRUD page (matches `store_categories`' own admin page
as the future precedent).

## 4. RLS

Both tables get `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, RESTRICTIVE default-deny,
with these permissive policies:

**`service_provider_applications`**

- **INSERT**: `WITH CHECK (applicant_user_id = app.current_user_id() AND status = 'pending' AND (service_category_id IS NULL OR EXISTS (SELECT 1 FROM service_categories sc WHERE sc.id = service_category_id AND sc.is_active)))`
  OR `app.is_admin_bypass()`. An applicant can only ever insert a `pending` row for themselves —
  **there is no path to insert an `'approved'` row through this policy**, directly satisfying
  Charlie's correction #1. The `EXISTS` clause is a correlated subquery inside the policy (a
  normal, supported RLS pattern — not a plain `CHECK` constraint, which cannot reference another
  table) — it closes a real gap: without it, nothing stops a submission naming a _deactivated_
  category's `id`, which would otherwise pass the FK constraint (the row still exists) while
  silently listing the applicant under a category admin has already retired.
- **SELECT**: `USING (applicant_user_id = app.current_user_id())` OR
  `(app.current_user_role() IN ('bomy_ops', 'bomy_admin'))` OR `app.is_admin_bypass()`.
  **Deliberately narrower than the codebase's usual `app.is_bomy_staff()` helper**, which also
  includes `bomy_finance` — excluded here per Charlie's correction #4, since finance doesn't need
  applicant contact details. Call this out explicitly in the migration comment so a future reviewer
  doesn't "fix" it back to `is_bomy_staff()` by habit.
- **No UPDATE or DELETE policy at all this round.** Not even for `bomy_ops`/`bomy_admin` under
  normal RLS — approving/rejecting is out of scope for this spec (§1), so there's nothing that
  needs to write to this table yet beyond the initial insert. The future admin-review PR adds an
  UPDATE policy (`USING app.is_admin_bypass()`) alongside the actual approve/reject server actions.
  This is expected, not a gap.

**`service_categories`**

- **SELECT**: `USING (is_active = true)` for any signed-in user (`app.current_user_id() IS NOT NULL`),
  plus `app.is_bomy_staff() OR app.is_admin_bypass()` for staff (future admin CRUD page needs to see
  inactive rows too).
- **No write policy this round** — rows are seeded via migration; the future admin-CRUD PR adds
  staff INSERT/UPDATE policies.

**Grants:** per the project's least-privilege-grants convention (migration 0027), the new migration
must include explicit narrow `GRANT` statements for the `bomy_app` role on both new tables (INSERT

- SELECT on applications; SELECT on categories) — no blanket grant. Mirror both tables' policies
  into `packages/db/src/rls/policies.sql` §6 and the grants test, per existing convention.

## 5. Auth flow / route

- New route: `apps/web/src/app/provider/apply/{page.tsx,actions.ts}`.
- `middleware.ts`: add `/provider` to the protected-route list requiring sign-in — same treatment
  as `/account`/`/dashboard`. **No role restriction** — buyer, `seller_owner`, and `seller_staff`
  can all apply (dual-role decision, §2).
- **Page** (server component): requires a session (redirect to sign-in if none, standard pattern).
  Loads active `service_categories` via `withTenant` for the dropdown. Checks for an existing
  pending-or-approved application for the current user and, if found, shows a
  "you already applied — status: X" message instead of the form (defense-in-depth alongside the DB
  partial unique index — the DB constraint is the real guarantee, this is just a better UX than a
  raw insert failure).
- **Server action** `submitProviderApplication`: hand-rolled validation (no Zod, matches project
  convention) enforcing "category selected OR description non-empty" client-side, mirroring the DB
  CHECK. Also re-validates a submitted `service_category_id` (when present) against the currently
  active `service_categories` rows before inserting — the same rule §4's RLS policy now enforces,
  checked here first so a stale/deactivated category produces a friendly form error instead of a
  raw constraint-violation 500. Inserts via **`withTenant`** (ctx: `userId`/`userRole` from
  session) — unlike `seller/apply`'s raw-insert exception, this table has real RLS, so the normal
  wrapper applies with no exception needed. Catches the partial-unique-index violation and returns
  a typed `"already_applied"` error code instead of a raw 500.
- **No Turnstile.** Signing in proves control of a real account (Google OAuth or a verified
  magic-link email) — it does **not** prove a human is the one submitting this particular form
  (a stored session could be replayed, or scripted after sign-in). The actual reason to skip
  Turnstile here is that spamming this action already requires possessing a signed-in session,
  which is meaningfully more friction than an anonymous POST to a public form gets — not that
  sign-in itself rules out automation. **Remaining abuse limit:** the existing `action_rate_limits`
  per-user cap on this action, plus §3's partial unique index, which caps the worst case at one
  pending-or-approved application per account regardless of how many times it's retried.

## 6. Email

- **Applicant acknowledgement** → sent to the account's **current** email, read fresh from
  `users.email` inside the same submission transaction by `applicant_user_id` — **not** from the
  session/JWT's cached email claim. `apps/web`'s session is a JWT that can go stale for up to 30
  days (`apps/web/src/auth.ts`), and an admin can change a user's row-level email while that
  session is still active; reading `users.email` directly at submission time is what actually
  guarantees "the account's real current email," which a cached claim does not. **Never** send to
  the form's `contact_email` field. This directly satisfies Charlie's correction #3 —
  `contact_email` is stored for business-contact purposes only and can never become an arbitrary
  automated-email destination.
- **Ops alert** → sent to the existing ops alert address via `@bomy/mailer`, same content shape as
  `seller/apply`'s ops alert (dispatch mechanism corrected below — do not copy that file's `await`).
- **Dispatch: fire-and-forget via `after()`** (`import { after } from "next/server"`; each send
  wrapped in `after(async () => { try { await sendX(...) } catch (err) { console.error(...) } })`),
  matching `app/CLAUDE.md`'s documented request-path convention ("request path = `void`-ed
  fire-and-forget with `.catch` logging; background worker = `await` + per-row try/catch +
  deterministic summary log") **and** this codebase's existing `apps/web` precedent for the same
  problem (`seller/dashboard/products/actions.ts`, `.../settings/body-actions.ts`). This is a
  server action returning to a signed-in browser — a request path, not a background worker — so
  SMTP must never add to the response latency. A bare `void sendX(...).catch(log)` is **not**
  sufficient on Vercel: once the response is sent, the serverless invocation can be frozen or torn
  down before an unawaited promise finishes
  (https://vercel.com/kb/guide/troubleshooting-inconsistent-logs-in-vercel-functions) — `after()`
  extends the invocation via `waitUntil` so the send actually completes. The HitPay webhook's
  `void dispatch(...).catch(log)` (`apps/api/src/routes/webhooks/hitpay.ts`) is a different,
  correctly-plain-void case: `apps/api` is a persistent Fastify server (not a Vercel serverless
  function per request), so there is no invocation to be torn down.
- **Correction history:** an earlier revision of this bullet said "fire-and-forget," a 2026-09-29
  review then "corrected" it to `await` because `seller/apply/actions.ts` awaits both emails and
  this spec said "same shape as" that file — but that correction conflated _content_ shape (which
  fields go in the email body) with _dispatch_ mechanism (await vs void), and didn't check whether
  awaiting actually bought anything. It doesn't: `seller/apply`'s own action returns `{ ok: true }`
  unconditionally after both try/catches regardless of email outcome (confirmed by reading
  `apps/web/src/app/seller/apply/actions.ts` directly, not assumed) — so awaiting there adds pure
  SMTP latency to the user's wait for zero informational benefit to the result they see. Fixed
  2026-09-29 to bare `void` (Bob's PR #147 review, round 1) — then fixed again the same day to
  `after()` (Bob's PR #147 review, round 2) after Bob caught that bare `void` doesn't survive a
  Vercel serverless response on its own, only inside a persistent server like `apps/api`.
  **`seller/apply/actions.ts` itself still awaits its two emails and was NOT changed by this PR**
  — same latent latency issue (and, per this same Vercel behavior, a live-in-production
  under-tested assumption that its awaited sends always finish before the response — they do,
  specifically because they're awaited, so this is a latency bug, not a delivery-reliability bug)
  — out of scope here, flagged to Charlie as a separate follow-up.

## 7. Testing

- **RLS/integration:** an applicant can insert only their own `pending` row and cannot insert
  `'approved'`; cannot UPDATE or DELETE any row; cannot SELECT another user's row;
  `bomy_finance` cannot SELECT any application row; `bomy_ops`/`bomy_admin` can SELECT all rows.
- **Race safety:** two concurrent inserts for the same user — the second fails on the partial
  unique index, the action returns `"already_applied"`, not a 500.
- **Deactivated category:** an insert naming a `service_category_id` that exists but has
  `is_active = false` is rejected (by the RLS policy's `EXISTS` clause, §4) — assert the action
  surfaces this as a friendly error, not a raw constraint-violation 500.
- **Email source:** confirmation is sent to the value read fresh from `users.email` at submission
  time — assert the test changes a user's `users.email` row after minting their test session token
  and confirms the email goes to the new address, not whatever was baked into that session.
- **Validator:** category selected + empty description → valid. "Other" (null category) + empty
  description → invalid. "Other" + non-empty description → valid.
- **Component:** form renders the category dropdown from seeded active categories; the description
  field becomes required only when "Other" is selected.

## 8. Explicitly deferred (not forgotten — future specs)

- Admin review UI + approve/reject server actions.
- The seller-facing "browse approved providers" directory/listing table.
- Admin CRUD for `service_categories` (rows are migration-seeded for now).
- Whether a rejected applicant may re-apply (schema already permits it; no decision needed yet).
- Phone-number encryption (proposal v2 §7 calls for app-level AES-GCM; current precedent across
  the codebase, including this table, is plaintext — pre-existing gap, not solved here).
- Reconciling proposal v2 §15's "Partner Network" naming / public-directory language against this
  spec's "Service Provider" naming / seller-only decision — a documentation task, not code.

## 9. Open items for the implementation plan (not blocking this spec)

- Exact starter list of service categories to seed.
- Final route naming bikeshed (`/provider/apply` proposed).
