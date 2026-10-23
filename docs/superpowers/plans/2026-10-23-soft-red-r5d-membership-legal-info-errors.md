# Soft-red R5d: Membership, legal, info and error pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (small PR, one agent). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give `/membership`, `/membership/manage`, `/membership/success`, `/about`, `/contact`, `/privacy`, `/terms`, `/refund`, `/shipping` and `error.tsx` the soft-red look (one page-heading scale, bento corners, near-white ground) with no logic, query, copy or link change.

**Architecture:** Reuse the shipped `PageHeading` and `rounded-bento`. Change one shared component (`LegalPageLayout`, used by 5 pages) and the markup of the other pages. `@bomy/ui`, `apps/admin`, actions and queries are not touched.

**Spec:** `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R5 section: "Type scale, spacing and `rounded-bento` only. No logic.").

## Global Constraints

- No change to copy, links, `aria-` names, redirects, `joinMembership`, `paymentsEnabled()` gating or the poller. The "Memberships will reopen soon" closed notice keeps its test (`tests/membership/membership-closed-notice.test.tsx`).
- Real data only. No invented ratings, counts or badges.
- Palette as shipped. Every new colour pair tested alpha-composited, text at least 4.5:1, light and dark.
- No motion beyond today's hover colour change (R6 owns motion).
- Prettier, `--max-warnings 0` lint, `pnpm ui:audit --allow-deferred` exit 0 (ledger any new arbitrary value), `ui:audit:test` 17/17.
- Commits use explicit paths with the Claude Co-Authored-By trailer. `products/loading.tsx` (untracked) is moved aside for builds and restored.
- DB-env-limited tests are reported as "not evaluated".
- Membership pages need a session: browser checks use the local seeded buyer (Mailhog magic link). Never press Join now.
- **HitPay guard (Bob, Medium 2).** `paymentsEnabled()` only checks that `HITPAY_API_KEY` and `HITPAY_API_URL` are set, and `apps/web/.env.local` holds real-looking values (the HitPay key was NOT rotated after the Railway incident). Never start the server for a browser check with those values. Start the standalone server with the values on the command line: **closed state** `HITPAY_API_KEY= HITPAY_API_URL=` (both empty); **open state** `HITPAY_API_KEY=dummy HITPAY_API_URL=http://127.0.0.1:9/`. Same recipe as the R5c subscribe checks.
- **Branch (Bob, Low 4).** Work on `feat/soft-red-r5d` created from `main` before the first commit; the plan file is untracked on `main` until then.

## Review Focus

1. **Long unbroken tokens** in the legal text (a 60-character URL, an email) at 320 px: no page scroll. `PageHeading` already breaks anywhere.
2. **`/membership` three states:** closed (`paymentsEnabled()` false: disabled "reopen soon" button), signed out ("Sign in to join"), signed in. Each keeps its layout; the price box and ticks do not clip at 320 px.
3. **`/membership/manage`:** the `dl` rows with a long date/price at 320 px; the warning box; the destructive cancel button stays visibly destructive (D1b alarm red, not soft red).
4. **`/membership/success` poller:** all poller states (waiting, active, timed out) render inside the same card width.
5. **`error.tsx`:** the reference code (`digest`) is long and unbroken: it wraps inside the box.
6. **Legal pages in dark mode:** body text 4.5:1 on the card surface; links are still underlined.
7. **Keyboard:** focus ring on every button and link is not clipped by the card edge.

## Decisions

- **D1 and D2 (Bob recommended A and A; Charlie sent the review on 2026-10-23): D1 = A, D2 = A.** The text below keeps the option wording for the record.
- **D3 — 404 page (Bob, Medium 1):** open, Charlie decides. (A, recommended) add a small `apps/web/src/app/not-found.tsx` in the style of `error.tsx`, in Task 7; (B) leave it out and record it as a later fix. There is no `not-found.tsx` today, so a missing page (and, since #182 to #184, probably a suspended store's brand page) shows the plain Next.js default. Proposed copy for Charlie to approve: heading "Page not found", text "We could not find that page. It may have moved, or the store may be closed for now.", button "Back to home". Task 7 does not start until Charlie approves the words.

### Option wording (for the record)

- **D1 — legal and info pages (privacy, terms, refund, shipping, contact):** (a) page title with `PageHeading`, body in one white `rounded-bento` card on the near-white ground (same as the R5a "Our Story" card; recommended); (b) title with `PageHeading`, body as plain text on the ground, no card.
- **D2 — membership pages:** (a) drop the full-page grey band (`bg-muted`); the card sits on the near-white ground with `rounded-bento` (recommended); (b) keep the grey band, change the card corners only.

## Tasks

### Task 1: Baseline (old code first)

- [ ] Run `tests/legal-pages`, `tests/components/legal-page-layout.test.tsx`, `tests/about`, `tests/membership`, `tests/components/route-error.test.tsx` on current `main`; record counts (DB-env ones "not evaluated" if no DB env).
- [ ] Create `feat/soft-red-r5d` from `main`. Screenshot all 10 pages (add the 404 page if D3 = A) at 390 and 1440 px, light and dark, as the "before" evidence in `docs/superpowers/plans/2026-10-23-soft-red-r5d-evidence.md`.

### Task 2: Legal and info pages

**Files:** `apps/web/src/components/legal-page-layout.tsx`, `apps/web/tests/components/legal-page-layout.test.tsx`

- [ ] Write the failing test first: the layout renders a single `h1` (from `PageHeading`), the intro, the optional "Last updated" line, and the body inside a `rounded-bento` container (per D1).
- [ ] Change `LegalPageLayout` to use `PageHeading` and the card. Keep props (`title`, `intro`, `lastUpdated`, `children`) unchanged, so the 5 pages need no edit.
- [ ] Run `tests/legal-pages` and `tests/components`.

### Task 3: About

**Files:** `apps/web/src/app/about/page.tsx`

- [ ] Hero: `font-display`, soft heading scale. **About follows D2 = A (Bob, Low 3):** remove all three grey `bg-muted` bands (`about/page.tsx` lines about 48, 73 and 109) so the page sits on the near-white ground; keep all copy.
- [ ] `Card` blocks get `!rounded-bento` (the `Card` needs the `!` form, see R5b note). Keep section order.
- [ ] Run `tests/about`.

### Task 4: Membership pages

**Files:** `apps/web/src/app/(marketing)/membership/page.tsx`, `manage/page.tsx`, `success/page.tsx`, `success/poller.tsx` (classes only)

- [ ] Per D2: ground, `!rounded-bento` on the card, heading through the display font. The price box (`bg-reward/10`) is unchanged unless its contrast fails.
- [ ] Do not touch `joinMembership`, redirects, or `paymentsEnabled()`.
- [ ] Run `tests/membership`.

### Task 5: Error page

**Files:** `apps/web/src/app/error.tsx`, `apps/web/tests/components/route-error.test.tsx`

- [ ] Write a failing test: a 120-character unbroken `digest` renders with a wrap class (`[overflow-wrap:anywhere]`).
- [ ] Heading through the display font; reference code wraps. Toast, `reset` and the home link are unchanged.

### Task 7 (only if D3 = A and Charlie approves the words): 404 page

**Files:** `apps/web/src/app/not-found.tsx` (new), `apps/web/tests/components/not-found.test.tsx` (new)

- [ ] Write the failing test first: renders one `h1`, the approved text and a link to `/`.
- [ ] Build it in the style of `error.tsx` with `PageHeading`. No toast, no logic.
- [ ] Browser proof: open a missing URL (for example `/zz-missing`) at 390 and 1440 px, light and dark.

### Task 6: Gates and browser proof

- [ ] Run `node scripts/check-integration-env.mjs` first with the DB env (Bob, Low 5), so a missing variable fails loudly instead of skipping suites. Then `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run` (with DB env), `pnpm build`, `pnpm ui:audit --allow-deferred`, `pnpm ui:audit:test`, Prettier.
- [ ] Browser proof at 320, 390, 767 and 1440 px, light and dark, for each page and each state in Review Focus. No page scroll at 320 px. Write the numbers into the evidence file.
- [ ] Write the PR body to `.andy/` and stop before the push. Bob reviews the plan first. Charlie says "go push".
