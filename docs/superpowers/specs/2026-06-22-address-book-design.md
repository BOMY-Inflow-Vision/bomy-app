# Design — Saved address book (account + checkout)

**Date:** 2026-06-22
**Author:** Andy (Opus 4.8)
**Status:** Revised per Bob's review (2026-06-22) — 5 findings patched; awaiting Charlie's go

## Overview

Let buyers save multiple shipping addresses and pick one at checkout instead of
retyping. Two parts shipped together: a `/account/addresses` CRUD section and a
saved-address selector in the checkout form. Addresses reuse the **same fields
the checkout already validates** (`validateShippingAddress`, MY-only), so the
book and checkout stay consistent.

## Decisions (locked during brainstorming)

1. **Scope:** account CRUD **and** checkout integration in one feature.
2. **Default:** one default per user; first saved address auto-becomes default;
   checkout pre-selects the default (still overridable). Setting a new default
   unsets the old.
3. **Label:** optional free-text label per address ("Home"/"Office"); nullable.
4. **MY-only:** matches the existing checkout validator (`country = "MY"`,
   `MY_STATES`). International is out of scope.
5. **Delete-default:** deleting the default leaves the user with _no_ default
   (no auto-promote); checkout then requires an explicit pick.
6. **Soft cap:** max 20 saved addresses per user (abuse guard).

## Invariant (do not break)

`orders.shippingAddress` stays a **per-order jsonb snapshot** written at checkout
exactly as today. The address book is only a convenience _source_ — editing or
deleting a saved address never changes any historical order.

## 1. Schema — `packages/db/src/schema/user_addresses.ts`

New table `user_addresses`, RLS owner-scoped (mirrors existing user-owned tables
like `vouchers` / `user_consents`):

| Column                    | Type                                 | Notes                    |
| ------------------------- | ------------------------------------ | ------------------------ |
| `id`                      | uuid pk                              |                          |
| `userId`                  | uuid, FK `users.id` onDelete cascade | RLS owner key            |
| `label`                   | text, nullable                       | optional "Home"/"Office" |
| `recipientName`           | text not null                        | maps to validator `name` |
| `phone`                   | text not null                        |                          |
| `line1`                   | text not null                        |                          |
| `line2`                   | text, nullable                       |                          |
| `city`                    | text not null                        |                          |
| `postcode`                | text not null                        |                          |
| `state`                   | text not null                        | one of `MY_STATES`       |
| `country`                 | text not null default `'MY'`         |                          |
| `isDefault`               | boolean not null default `false`     |                          |
| `createdAt` / `updatedAt` | timestamptz not null                 |                          |

- **One default per user:** partial unique index
  `CREATE UNIQUE INDEX user_addresses_one_default_idx ON user_addresses (user_id) WHERE is_default;`
- **RLS (Bob R4):** enable + RESTRICTIVE default-deny, then **operation-specific
  owner policies** matching the house style in `packages/db/src/rls/policies.sql`
  — use the `app.current_user_id()` helper (not raw `current_setting`):
  - `FOR SELECT USING (user_id = app.current_user_id() OR app.is_admin_bypass())`
  - `FOR INSERT WITH CHECK (user_id = app.current_user_id() OR app.is_admin_bypass())`
  - `FOR UPDATE USING (<owner predicate>) WITH CHECK (<owner predicate>)` — the
    `WITH CHECK` stops a row being re-assigned to another `user_id`
  - `FOR DELETE USING (user_id = app.current_user_id() OR app.is_admin_bypass())`
    `bomy_app` grants as usual. RLS SQL appended to the generated migration.
- Migration generated via `pnpm --filter @bomy/db db:generate`, with the RLS
  policy SQL appended to the generated migration file.

## 2. Validator — reuse + extend

The account actions and checkout both validate address fields with the existing
`validateShippingAddress` (`apps/web/src/lib/shipping-address-schema.ts`). A thin
wrapper validates the book entry: `validateShippingAddress({ name: recipientName, … })`
plus an optional `label` (trim; empty → null; max length ~40). No second address
validator — single source of truth.

## 3. Account CRUD — `apps/web/src/app/account/addresses/`

- `page.tsx` (server): `withTenant` read of the user's addresses ordered by
  `isDefault desc, updatedAt desc`; renders label + formatted address + a
  "Default" badge; links to add/edit; delete + "Set default" controls.
- `actions.ts` (server, all `withTenant`, RLS-enforced — a user can only touch
  their own rows):
  - **Race safety (Bob R2):** every mutating action takes a **per-user advisory
    lock first**, inside the `withTenant` tx, mirroring checkout's pattern:
    `SELECT pg_advisory_xact_lock(hashtext('address_book:' || <userId>::text))`.
    This serialises the first-default and 20-cap checks so they can't race.
  - `addAddress(input)` — validate; advisory lock; **count** the user's
    addresses → reject if ≥ 20 (friendly error); set `isDefault = true` only if
    count == 0; insert.
  - `updateAddress(addressId, input)` — validate; update own row (RLS-scoped).
  - `deleteAddress(addressId)` — delete own row (no auto-promote).
  - `setDefault(addressId)` (Bob R1) — advisory lock; **first SELECT the target
    row owned by the current user**. If it's absent (nonexistent or another
    user's), return `{ ok:false, errors:{ form: "Address not found" } }` with
    **no writes** — so the caller's existing default is never cleared. Only then
    set all the user's addresses `isDefault = false` and the target `true`.
  - Each returns `{ ok } | { ok:false, errors }`; `revalidatePath("/account/addresses")`.
- **Discoverability (Bob R5):** add `"addresses"` to the `AccountTabs` `active`
  union (`profile | subscriptions | orders | addresses`) and an **Addresses** nav
  link in `apps/web/src/app/account/account-tabs.tsx`; the page renders
  `<AccountTabs active="addresses" />`.

## 4. Checkout integration — `apps/web/src/app/checkout/`

- The checkout page (server) loads the user's saved addresses (`withTenant`) and
  passes them to `_form.tsx`.
- `_form.tsx`: if saved addresses exist, render a **selector pre-selected to the
  default**. Selecting one fills the address state. A **"Use a new address"**
  toggle reveals the existing manual form; an optional **"Save this address to my
  book"** checkbox (only in new-address mode).
- **Save sequencing (Bob R3):** when the checkbox is set, the form validates the
  address, then calls `addAddress` **before** `initiateCheckout`. If the save
  fails, show an address-book error and **do not start payment** (the user can
  uncheck and proceed). If `addAddress` succeeds but checkout later fails, the
  saved address is kept (acceptable). When unchecked, go straight to
  `initiateCheckout` exactly as today.
- On submit the chosen/typed address goes through `validateShippingAddress` and
  is passed to `initiateCheckout` → snapshotted into `orders.shippingAddress`
  **unchanged** (the Invariant above). No change to `initiateCheckout`'s contract.

## Testing

- **Schema/RLS** (`packages/db` or web integration, DB env): a user sees/edits
  only their own addresses; cross-user access denied; the partial unique index
  rejects a second default.
- **Account actions** (web integration, DB env): add (first → auto-default;
  20-cap rejection), update, delete (default → no default left), setDefault
  (unsets previous; one-default invariant holds), validation failures.
  - **Bob R1:** `setDefault` with a nonexistent/another-user's id → error **and
    the caller's existing default stays unchanged** (no writes).
- **Checkout**: selector pre-selects default and prefills; submitting still
  writes the `orders.shippingAddress` snapshot; "save this address" persists a
  new book entry.
- `pnpm --filter @bomy/web typecheck` + `lint` clean.

## Out of scope

- International addresses (MY-only, matches checkout).
- Showing saved addresses on the future admin `/users/[id]` page.
- Auto-promoting a new default when the current default is deleted.
- A saved-address picker anywhere other than checkout (e.g. subscriptions).
