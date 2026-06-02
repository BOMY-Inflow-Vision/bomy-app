# PR #38 — HitPay review readiness: legal pages + business identity footer

**Date:** 2026-06-02
**Author:** Andy
**Approver:** Charlie
**Type:** Public content surface (legal/policy pages + business identity footer). No backend or schema changes.
**Stage 5+ sub-stage:** First of four PRs (#38 → #41) preparing BOMY for HitPay sandbox/API access restoration; this PR ships the public content surface, PR #39 ships public deployment, PR #40 (if needed) ships product seed realism, PR #41 (operational) is the HitPay submission cycle.

---

## 1. Goal

Ship the legal/policy pages + persistent business identity footer that BOMY needs in place before its public deployment can be submitted to HitPay for website review.

After PR #38 merges:

- BOMY has 5 reviewer-presentable public pages: `/terms`, `/privacy`, `/refund`, `/shipping`, `/contact`.
- The root app shell renders the new `Footer` component below current page content, surfacing Inflo Vision business identity, policy links, and copyright site-wide. Future per-page intentional suppression remains a possible mechanism if needed later.
- The locked content is "pre-launch draft" — not legal-grade. Counsel review remains a tracked backlog item before any of: public launch beyond HitPay reviewer audience, real-money processing, non-MY buyer scale, analytics/marketing cookie addition.

PR #38 does NOT remove the HitPay-creds blocker. It builds the public content surface needed to **request restoration**; the blocker remains pending PR #39 deployment + PR #41 HitPay review/API restoration.

## 2. In scope

- 5 page routes: `/terms`, `/privacy`, `/refund`, `/shipping`, `/contact`. All server components, inline JSX content (Option A from brainstorm Q+A).
- Shared `LegalPageLayout` component (title, intro, optional last-updated, constrained prose width, children slot).
- Shared `Footer` component wired inside `<CartProvider>` after `{children}` in `apps/web/src/app/layout.tsx`.
- Inline JSX content for all 5 pages, with `[PLACEHOLDER: snake_case_name]` markers for facts Charlie must fill before merge.
- Privacy Policy references PDPA 2010 as amended by the Personal Data Protection (Amendment) Act 2024 — sources in source comment.
- Smoke tests using `react-dom/server` `renderToStaticMarkup` (no new test deps).
- Authoritative URL references in source code comments only: pdp.gov.my Act 709 page, pdp.gov.my Amendment Act 2024 page, DataGuidance Malaysia cookies note.

## 3. Out of scope

Tracked in `app/.andy/handoff.md` §5 backlog after merge:

- **Public deployment (PR #39).** Real domain + DNS + hosting. First public URL HitPay sees should already have the PR #38 surface in place.
- **Counsel review of pre-launch policy pages.** Engage before PR #41 HitPay submission. Touchpoints: ToS §10 governing law specifics, Privacy §4 legal basis, Privacy §7 retention windows, Refund §7 statutory carveouts.
- **Product seed realism (PR #40 if needed).** Inspect `/products` after PR #39 deploys to decide if current seed looks reviewable.
- **HitPay submission cycle (PR #41).** Operational, not code; tracked separately.
- **Cookie / PDPA consent banner.** Deferred until analytics/marketing trackers exist or counsel directs. Privacy §11 says "essential cookies only" today; banner ships when that changes.
- **Freshdesk widget on Contact (and possibly site-wide).** Wait until Freshdesk account/widget ID exists.
- **`/about` page.** Brand story content; defer until brand narrative sharpens.
- **Sign-in/sign-up ToS consent flow modification.** PR #38 adds pages, doesn't modify auth flows.
- **Public HitPay processor claim** anywhere (footer, ToS, Privacy, source comments visible in client bundles). Forbidden until HitPay account approval.
- **Payment-method icons.** Forbidden until HitPay approval (any payment-method claim is a processor claim).
- **Contact form.** Static `mailto:` only; revisit if support volume warrants.
- **Social media links, newsletter, careers, FAQ, About columns in footer.** Out of scope.

## 4. Approach

**Option A locked from brainstorm: inline JSX in `page.tsx` files.** Each page's content is JSX inside its `page.tsx`, wrapped by the shared `LegalPageLayout`. No new dependencies, no MDX, no content-module layer, no `@tailwindcss/typography`. Hand-rolled Tailwind utility classes for typography (B1 from brainstorm Q+A).

**Why:** For 5 pages of moderate length, MDX or a content-module layer adds complexity disproportionate to benefit. The existing codebase doesn't use Tailwind Typography elsewhere; PR #38 stays consistent.

**Trade-offs accepted:**

- Larger JSX per page (200–500 LOC) vs smaller orchestrator files.
- JSX escaping for quotes/apostrophes.
- Content + structure colocated; if either grows substantially we revisit (likely as a separate content-platform PR, not as part of #38–#41).

## 5. File structure

| Path                                                                       | Action                           | Responsibility                                                             |
| -------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/app/terms/page.tsx`                                          | Create                           | Terms of Service page (server component)                                   |
| `apps/web/src/app/privacy/page.tsx`                                        | Create                           | Privacy Policy page (server component)                                     |
| `apps/web/src/app/refund/page.tsx`                                         | Create                           | Refund / Return policy page (server component)                             |
| `apps/web/src/app/shipping/page.tsx`                                       | Create                           | Shipping / Delivery policy page (server component)                         |
| `apps/web/src/app/contact/page.tsx`                                        | Create                           | Contact page — static info, `mailto:`, no form                             |
| `apps/web/src/components/legal-page-layout.tsx`                            | Create                           | Shared layout — title, intro, optional last-updated, prose width, children |
| `apps/web/src/components/footer.tsx`                                       | Create                           | Persistent footer — brand + policy links + business identity + copyright   |
| `apps/web/src/app/layout.tsx`                                              | Modify                           | Add `<Footer />` inside `<CartProvider>` after `{children}`                |
| `apps/web/tests/components/footer.test.tsx`                                | Create                           | Footer smoke tests (2 cases)                                               |
| `apps/web/tests/components/legal-page-layout.test.tsx`                     | Create                           | LegalPageLayout smoke tests (3 cases)                                      |
| `apps/web/tests/legal-pages/render.test.tsx`                               | Create                           | Page render + no-placeholder smoke tests (10 cases)                        |
| `docs/superpowers/specs/2026-06-02-pr38-hitpay-review-readiness-design.md` | This spec                        | Already on branch                                                          |
| `docs/superpowers/plans/2026-06-02-pr38-hitpay-review-readiness.md`        | Create (next, via writing-plans) | Implementation plan                                                        |

**Files explicitly NOT touched:**

- `apps/web/src/components/nav-bar.tsx` — no nav changes; legal pages reachable via footer links only.
- `apps/web/src/app/page.tsx`, `/products`, `/cart`, `/checkout/*`, `/brands/*`, `/membership/*`, `/account/*`, `/auth/*`, `/seller/*` — no page modifications. All inherit the new Footer via root layout.
- `packages/db/*`, `apps/api/*`, `apps/admin/*` — no changes.
- `apps/web/package.json` — no new dependencies.
- `apps/web/tailwind.config.ts` — no plugin additions.

## 6. Component contracts

### `Footer` (`apps/web/src/components/footer.tsx`)

Server component. Pure JSX. No state, no client interactivity.

**Four content blocks** in a single grid (1 column on mobile, 4 on desktop):

1. **Brand:** wordmark "BOMY" + one-line tagline "A curated Malaysian multivendor marketplace."
2. **Policies:** vertical link list using plain `<a href>` (not `next/link`): Terms (`/terms`), Privacy (`/privacy`), Refund (`/refund`), Shipping (`/shipping`), Contact (`/contact`).
3. **Business identity:**
   - "Operated by Inflo Vision (Partnership), Malaysia."
   - "Support: [PLACEHOLDER: support_email]" (rendered as `mailto:` once filled)
   - "Business address: [PLACEHOLDER: business_address]"
4. **Copyright:** "© 2026 Inflo Vision. All rights reserved." Full-width bottom row separated by border-top.

**No social links, payment icons, newsletter signup, processor names, or imagery.**

Placeholder constants at top of file:

```tsx
const SUPPORT_EMAIL = "[PLACEHOLDER: support_email]"
const BUSINESS_ADDRESS = "[PLACEHOLDER: business_address]"
```

Charlie replaces these in the single pre-merge fill commit.

Tailwind only — no new CSS files.

### `LegalPageLayout` (`apps/web/src/components/legal-page-layout.tsx`)

Server component. Props:

```tsx
type LegalPageLayoutProps = {
  title: string
  intro: string
  lastUpdated?: string // pre-formatted display string, e.g., "June 1, 2026"; omitted for Contact
  children: React.ReactNode
}
```

Renders (B1 hand-rolled utilities locked from brainstorm):

```tsx
<main className="mx-auto max-w-3xl px-4 py-12">
  <h1 className="mb-3 text-3xl font-bold">{title}</h1>
  <p className="mb-2 text-lg text-slate-600">{intro}</p>
  {lastUpdated && <p className="mb-8 text-sm text-slate-500">Last updated: {lastUpdated}</p>}
  <hr className="mb-8" />
  <div className="space-y-6 text-slate-800 leading-relaxed">{children}</div>
</main>
```

No `formatDate` helper (no project convention; locale-stable display string is simpler).

No table of contents component.

### Root layout wiring

`apps/web/src/app/layout.tsx` modified to:

```tsx
<CartProvider>
  <NavBar />
  {children}
  <Footer />
</CartProvider>
```

Footer is wired into the root app shell below page content; future per-page intentional suppression remains a possible mechanism if needed later (not in PR #38 scope).

## 7. Page contracts

For each page: title, intro, last-updated date, section outline, and placeholders Charlie must fill before merge.

### `/terms` — Terms of Service

- **Title:** "Terms of Service"
- **Intro:** "These terms govern your use of BOMY's marketplace as a buyer, seller, or visitor."
- **Last updated:** "June 1, 2026"
- **Sections:**
  1. Acceptance of terms
  2. Eligibility (age 18+; bound by applicable Malaysian law for buyers in Malaysia; foreign buyers bound by terms governing cross-border purchases)
  3. Account responsibilities (security, accurate info, one account per person)
  4. Buyer terms (purchase via our payment processor, voucher use, membership benefits)
  5. Seller terms (storefront responsibility, listing accuracy, fulfilment obligations, `[PLACEHOLDER: seller_fee_schedule]` — fees disclosed during onboarding and in seller dashboard terms)
  6. Prohibited content and conduct
  7. Intellectual property (sellers retain IP in their listings; BOMY licenses use of marks for marketplace operation)
  8. Disclaimers and limitation of liability
  9. Termination
  10. Governing law: Malaysia. Jurisdiction: courts of [PLACEHOLDER: court_jurisdiction]
  11. Contact for questions: [PLACEHOLDER: support_email]
- **Placeholders:** `seller_fee_schedule`, `court_jurisdiction`, `support_email`.

### `/privacy` — Privacy Policy

- **Title:** "Privacy Policy"
- **Intro:** "How Inflo Vision (operating BOMY) collects, uses, and protects your personal data under Malaysia's Personal Data Protection Act 2010 as amended by the Personal Data Protection (Amendment) Act 2024."
- **Last updated:** "June 1, 2026"
- **Sections:**
  1. Who we are — "Inflo Vision (Partnership), Malaysia. Registration: [PLACEHOLDER: ssm_registration_number]. Address: [PLACEHOLDER: business_address]. Privacy contact: [PLACEHOLDER: privacy_email]."
  2. Personal data we collect (account: email, name, phone; transactional: shipping address, order history; technical: session cookies, IP for security)
  3. Why we collect it (account management, order fulfilment, marketing only with opt-in, fraud prevention, legal compliance)
  4. Legal basis under PDPA 2010 (consent, contract performance, legal obligation)
  5. Disclosure / subprocessors:
     - Payment processing: [PLACEHOLDER: payment_processor_disclosure]
     - Shipping: Pos Laju
     - Support: [PLACEHOLDER: support_tool_disclosure]
     - Hosting: [PLACEHOLDER: hosting_provider_disclosure]
  6. Cross-border transfer language: "Some processors are located outside Malaysia; transfers comply with PDPA 2010 cross-border requirements."
  7. Retention windows: [PLACEHOLDER: account_retention_window] (account data while active + [PLACEHOLDER: dormant_account_window]), [PLACEHOLDER: order_retention_window] (per tax/accounting requirements)
  8. Your rights under PDPA (access, correction, withdrawal of consent, complaint)
  9. Complaint / escalation: "We respond to data-protection inquiries within [PLACEHOLDER: complaint_response_timeline] business days. You may contact us first; if unresolved, you may contact the Personal Data Protection Commissioner." (Generic wording — no PDPA section numbers per Charlie 2026-06-01.)
  10. Data breach process: "Material breaches reported to affected users and the Department of Personal Data Protection per the Act's notification requirements; contact: [PLACEHOLDER: breach_contact]."
  11. Cookies: "BOMY uses essential cookies for session management and authentication. No analytics or marketing cookies are set in the current pre-launch period." (When/if added, this section updates and a consent UI ships separately per the deferred backlog item.)
  12. Changes to this policy
  13. Contact: [PLACEHOLDER: privacy_email]
- **Placeholders:** `ssm_registration_number`, `business_address`, `privacy_email`, `payment_processor_disclosure`, `support_tool_disclosure`, `hosting_provider_disclosure`, `account_retention_window`, `dormant_account_window`, `order_retention_window`, `complaint_response_timeline`, `breach_contact`.
- **Source comment at top of file** (visible to next reviewer, not user-facing):
  ```tsx
  // PDPA refs (for next reviewer / counsel):
  //   Act 709: https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/
  //   Amendment Act 2024: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-amendment-act-2024/
  //   Cookie scope (DataGuidance): https://www.dataguidance.com/notes/malaysia-cookies-similar-technologies
  ```

### `/refund` — Refund and Return Policy

- **Title:** "Refund and Return Policy"
- **Intro:** "Eligibility, timelines, and process for returns and refunds on BOMY purchases."
- **Last updated:** "June 1, 2026"
- **Sections:**
  1. Eligibility (defects, wrong item, significant misdescription; not change-of-mind unless seller opts in)
  2. Return window: [PLACEHOLDER: return_window_days] days from delivery
  3. Condition requirements (unused, original packaging, proof of purchase)
  4. Process: contact seller via BOMY first, escalate to BOMY support if unresolved within [PLACEHOLDER: seller_response_window] business days
  5. Refund method and timeline (refunded to original payment method within [PLACEHOLDER: refund_processing_window] business days of return receipt)
  6. Voucher refunds (vouchers reverted via ledger reversal; net amount refunded to original payment method)
  7. Membership and brand subscription refunds: "Platform memberships and brand subscriptions are not refundable mid-term, except where required by applicable law or where BOMY approves an exception in writing. Starter kits, vouchers, and fulfilled membership benefits are not separately refundable." Statutory carveout placeholder: [PLACEHOLDER: statutory_refund_exceptions]
  8. Shipping cost responsibility (seller pays for defects/wrong item; buyer pays for change-of-mind returns)
  9. Non-returnable items (perishables, personalised items, digital goods if applicable)
  10. Contact: [PLACEHOLDER: support_email]
- **Placeholders:** `return_window_days`, `seller_response_window`, `refund_processing_window`, `statutory_refund_exceptions`, `support_email`.

### `/shipping` — Shipping and Delivery Policy

- **Title:** "Shipping and Delivery Policy"
- **Intro:** "Domestic and international shipping methods, timelines, and costs for BOMY orders."
- **Last updated:** "June 1, 2026"
- **Sections:**
  1. Coverage: Malaysia (West and East Malaysia), plus selected international destinations
  2. Carrier: Pos Laju (domestic); international via Pos Laju International or per-seller arrangement
  3. Processing time: orders ship within [PLACEHOLDER: processing_time_days] business days of payment confirmation
  4. Delivery estimates: West Malaysia [PLACEHOLDER: delivery_west_estimate] business days; East Malaysia [PLACEHOLDER: delivery_east_estimate]; international [PLACEHOLDER: delivery_international_estimate]
  5. Shipping costs (seller-set; displayed at checkout; weight/destination-based)
  6. Tracking (Pos Laju tracking number provided once shipped)
  7. Failed delivery and re-attempts
  8. Damaged or lost shipments (claim process via seller first; BOMY support escalation)
  9. Customs / duties for international (buyer responsibility)
  10. Contact: [PLACEHOLDER: support_email]
- **Placeholders:** `processing_time_days`, `delivery_west_estimate`, `delivery_east_estimate`, `delivery_international_estimate`, `support_email`.

### `/contact` — Contact / Support

- **Title:** "Contact Us"
- **Intro:** "Reach BOMY's support team for help with orders, your account, or anything else."
- **Last updated:** omitted (no `lastUpdated` prop passed).
- **Sections (plain blocks; not policy structure):**
  1. **Business identity:** "BOMY is operated by Inflo Vision (Partnership), Malaysia."
  2. **Support email:** rendered as `<a href="mailto:[PLACEHOLDER: support_email]">[PLACEHOLDER: support_email]</a>`.
  3. **Business address:** `[PLACEHOLDER: business_address]`
  4. **Operating hours:** "Monday to Friday, 9am – 6pm Malaysia Time (UTC+8), excluding public holidays."
  5. **(Optional) Phone or WhatsApp:** `[PLACEHOLDER: support_phone]` — omit the entire line if Charlie doesn't fill it.
  6. **Response time:** "We aim to respond within [PLACEHOLDER: contact_response_window] business days."
- **Placeholders:** `support_email`, `business_address`, `contact_response_window`. Optional: `support_phone`.

## 8. Placeholder convention & master list

### Convention

- **Format:** literal `[PLACEHOLDER: snake_case_name]` in visible text of JSX. Square brackets, capitalised word `PLACEHOLDER`, colon, space, identifier.
- **Visible in source AND rendered:** Charlie greps before merge; Bob R0 reviews; a leaked placeholder in production would be immediately visible to a HitPay reviewer — that's a feature.
- **Pre-merge gate (manual):**
  ```sh
  rg -n "\[PLACEHOLDER:" \
    apps/web/src/app/{terms,privacy,refund,shipping,contact}/page.tsx \
    apps/web/src/components/footer.tsx
  ```
  Expected: no matches before merge.
- **Test-time gate (rendered-output guard):** `render.test.tsx` asserts each page's `renderToStaticMarkup` output does NOT contain the substring `[PLACEHOLDER:`. Belt + suspenders alongside the manual rg. The rendered-output assertion can miss placeholders in unrendered branches or comments — manual rg stays as final gate.
- **No automation tooling.** No ESLint rule, no CI check beyond the existing test suite. YAGNI for a one-PR concern.

### Master placeholder list (24 unique: 23 mandatory + 1 optional)

**Business identity (3):** `support_email`, `business_address`, `ssm_registration_number`.

**Privacy specifics (9):** `privacy_email`, `payment_processor_disclosure`, `support_tool_disclosure`, `hosting_provider_disclosure`, `account_retention_window`, `dormant_account_window`, `order_retention_window`, `complaint_response_timeline`, `breach_contact`.

**Refund / Shipping operational windows (8):** `return_window_days`, `seller_response_window`, `refund_processing_window`, `statutory_refund_exceptions`, `processing_time_days`, `delivery_west_estimate`, `delivery_east_estimate`, `delivery_international_estimate`.

**Legal carveouts (2):** `court_jurisdiction`, `seller_fee_schedule`.

**Contact (2):** `contact_response_window`; optional: `support_phone` (omit the entire line if not publishing).

### Content sourcing (non-placeholder content)

Andy draws from project memory + repo facts:

- BOMY framing: "curated Malaysian multivendor marketplace" from CLAUDE.md + project decisions.
- Membership model: RM75/yr platform; brand 90/10; starter kit + quarterly goodie box (referenced in Refund §7 generically without dollar amounts).
- Pos Laju named in Shipping §2 (locked Q&A decision).
- Inflo Vision (Partnership), Malaysia, as the legal operating entity (Charlie 2026-06-01).

Andy does NOT invent:

- Specific dates beyond uniform "June 1, 2026" last-updated.
- Specific monetary values, response SLAs, retention windows.
- Specific legal entity facts beyond "Inflo Vision (Partnership), Malaysia."
- Specific PDPA section numbers.

## 9. Testing

`react-dom/server` `renderToStaticMarkup` only. No testing-library, no jsdom, no new deps.

### `apps/web/tests/components/footer.test.tsx` (2 cases)

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Footer } from "@/components/footer"

describe("Footer", () => {
  const html = renderToStaticMarkup(<Footer />)

  it("renders all 5 policy links", () => {
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/refund"')
    expect(html).toContain('href="/shipping"')
    expect(html).toContain('href="/contact"')
  })

  it("renders business identity", () => {
    expect(html).toContain("Inflo Vision")
    expect(html).toContain("A curated Malaysian multivendor marketplace.")
    expect(html).toContain("© 2026 Inflo Vision")
  })
})
```

### `apps/web/tests/components/legal-page-layout.test.tsx` (3 cases)

- Renders title, intro, and `lastUpdated` line when `lastUpdated` is passed.
- Does NOT render the "Last updated:" line when `lastUpdated` is omitted.
- Renders children content.

### `apps/web/tests/legal-pages/render.test.tsx` (10 cases)

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import TermsPage from "@/app/terms/page"
import PrivacyPage from "@/app/privacy/page"
import RefundPage from "@/app/refund/page"
import ShippingPage from "@/app/shipping/page"
import ContactPage from "@/app/contact/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
  { name: "Refund", Page: RefundPage, title: "Refund and Return Policy" },
  { name: "Shipping", Page: ShippingPage, title: "Shipping and Delivery Policy" },
  { name: "Contact", Page: ContactPage, title: "Contact Us" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title", () => {
    expect(html).toContain(`<h1`)
    expect(html).toContain(title)
  })

  it("has no unfilled [PLACEHOLDER: …] markers", () => {
    expect(html).not.toContain("[PLACEHOLDER:")
  })
})
```

**Total: ~15 Vitest test cases across 3 files.** No new dependencies. No `DATABASE_URL` or `BOMY_RLS_READY=1` required — pure unit tests of static server components.

### What's NOT tested

- Visual styling — Tailwind classes aren't asserted.
- Accessibility — manual eyeball is the gate.
- Link target validity — trust Next's static routing.
- `mailto:` link parsing — visible inspection.
- SEO `<title>` / metadata — Next file-route conventions handle this.

## 10. PR workflow

### Branch

`feat/hitpay-review-readiness-legal-pages` off `main`.

### Commit order (~8 conventional commits; squashed at merge)

1. `feat(web): add Footer component + wire into root layout` — Footer + `layout.tsx` change + Footer test.
2. `feat(web): add LegalPageLayout component` — LegalPageLayout + its test.
3. `feat(web): add /terms page (draft with placeholders)` — Terms page + render-test entry.
4. `feat(web): add /privacy page (draft with placeholders)` — Privacy page + PDPA URL ref comment.
5. `feat(web): add /refund page (draft with placeholders)`.
6. `feat(web): add /shipping page (draft with placeholders)`.
7. `feat(web): add /contact page (draft, no last-updated)`.
8. `chore(web): fill 23 mandatory placeholders before merge` — Charlie's pre-merge fill commit; may include optional `support_phone`.

Squash message at merge: `feat(web): legal pages + footer for HitPay review readiness (#38)`.

### PR body shape

```markdown
**Type:** Public content surface (legal/policy + business identity footer).
**Goal:** Ship the legal/business identity surface BOMY needs in place before public deployment can be submitted to HitPay for website review.
**Spec:** docs/superpowers/specs/2026-06-02-pr38-hitpay-review-readiness-design.md
**Plan:** docs/superpowers/plans/2026-06-02-pr38-hitpay-review-readiness.md

## What ships

- Routes: /terms, /privacy, /refund, /shipping, /contact (all server components, inline JSX).
- Components: Footer (4 blocks + copyright row), LegalPageLayout (optional lastUpdated).
- Wiring: Footer inside <CartProvider> after {children} in apps/web/src/app/layout.tsx.
- Tests: ~15 cases across 3 files using renderToStaticMarkup; no new deps.

## Placeholder fills (23 mandatory + 1 optional)

- Business identity: support_email, business_address, ssm_registration_number
- Privacy: privacy_email, payment_processor_disclosure, support_tool_disclosure, hosting_provider_disclosure, account_retention_window, dormant_account_window, order_retention_window, complaint_response_timeline, breach_contact
- Refund/Shipping: return_window_days, seller_response_window, refund_processing_window, statutory_refund_exceptions, processing_time_days, delivery_west_estimate, delivery_east_estimate, delivery_international_estimate
- Legal carveouts: court_jurisdiction, seller_fee_schedule
- Contact: contact_response_window; optional: support_phone (omit if not publishing)

## Why

First of 4 PRs (#38 → #41) preparing BOMY for HitPay sandbox/API access restoration. PR #38 ships public content surface; PR #39 ships public deployment; PR #40 (if needed) ships product seed realism; PR #41 is HitPay submission. PR #38 does NOT remove the HitPay-creds blocker — it builds the surface needed to request restoration.

## Review scope (Bob R0)

1. Public-copy correctness: no HitPay processor claim anywhere in rendered output or source comments.
2. Business identity consistency: Inflo Vision wording matches between Footer + Privacy §1 + Contact §1.
3. PDPA references accurate; Privacy §9 uses generic Commissioner wording (no PDPA section numbers).
4. All [PLACEHOLDER:…] markers filled before merge — verified via `rg -n "\[PLACEHOLDER:" apps/web/src/app/{terms,privacy,refund,shipping,contact}/page.tsx apps/web/src/components/footer.tsx` returning no matches.
5. Footer links resolve to all 5 new routes; no broken links.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Acceptance criteria (must all be green for merge)

- [ ] All 5 routes render `200 OK` in `pnpm dev`.
- [ ] `pnpm --filter @bomy/web test` — green (~15 new test cases passing).
- [ ] `pnpm typecheck` — green.
- [ ] `pnpm lint` — green (`--max-warnings 0`).
- [ ] Manual placeholder gate:
  ```sh
  rg -n "\[PLACEHOLDER:" \
    apps/web/src/app/{terms,privacy,refund,shipping,contact}/page.tsx \
    apps/web/src/components/footer.tsx
  ```
  Expected: no matches. Plus rendered-output test in `render.test.tsx` green.
- [ ] Bob R0 sign-off on the 5 review points in PR body.
- [ ] Charlie's explicit "Merge now" before squash-merge.

### Post-merge bookkeeping (Andy completes immediately after squash)

1. `app/log/2026-06-02_PR38_hitpay-review-readiness.md` — log per PR #36/#37 pattern.
2. `app/.andy/handoff.md` — update §1 current state (new HEAD); §2 PR #38 summary; §4 PR table row; §5 backlog: keep the HitPay sandbox/API access restoration item and the first checkout flip item (both still pending); add an entry noting "PR #38 shipped — review-readiness content surface in place; PR #39 public deployment is the next concrete step toward HitPay submission"; §6 cleanup pending; §8 next session = PR #39 deployment brainstorm.
3. Memory: `project_pr38_complete.md` saved; MEMORY.md index updated.
4. **Update `project_hitpay_creds_blocker.md`:** "PR #38 shipped the legal/business identity readiness surface; blocker remains pending PR #39 deployment and PR #41 HitPay review/API restoration."
5. Branch cleanup pending Charlie's approval per standing rule.

## 11. Risks & mitigations

| Risk                                                      | Mitigation                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `[PLACEHOLDER: …]` marker leaks to production           | Belt + suspenders: manual `rg` gate (final, primary) + rendered-output assertion in `render.test.tsx`. Placeholder is intentionally visible if it leaks — HitPay reviewer would notice. |
| Public HitPay processor claim slips into copy             | Bob R0 review point #1 explicitly checks for it in rendered output AND source comments. Privacy §5 + Terms §4 use generic "our payment processor" wording.                              |
| Counsel later disagrees with content                      | Pre-launch draft framing acknowledged in spec §1; counsel-review backlog item recorded explicitly; PR #38 is positioned as reviewer-ready, not legal-grade.                             |
| `lastUpdated` date stale after merge                      | Uniform "June 1, 2026" matches the spec date; future content updates increment per-page. Not a launch blocker.                                                                          |
| Footer placement breaks an existing page layout           | All existing pages tested manually via `pnpm dev` walkthrough before merge; root layout change is small (one JSX line).                                                                 |
| PDPA references later turn out inaccurate                 | Generic wording avoids section numbers; URL sources in source comment let counsel verify against authoritative pdp.gov.my.                                                              |
| Inflo Vision details (registration number, address) wrong | Placeholder gate forces Charlie to fill before merge; Bob R0 review point #2 checks consistency across all surfaces.                                                                    |
| Test suite leaks state between cases                      | Pure unit tests; no shared mutable state; `renderToStaticMarkup` is stateless.                                                                                                          |

## 12. Acceptance summary

PR #38 is acceptance-ready when:

- [ ] All 8 commits land on `feat/hitpay-review-readiness-legal-pages` (squash-merge target).
- [ ] All 24 placeholders filled (or `support_phone` line removed entirely) per Charlie's pre-merge commit.
- [ ] Manual `rg` placeholder gate green; rendered-output test green.
- [ ] `pnpm --filter @bomy/web test`, `pnpm typecheck`, `pnpm lint` all green.
- [ ] 5 routes render 200 in `pnpm dev`; Footer visible on every page (manual walkthrough).
- [ ] Bob R0 sign-off (5 review points).
- [ ] Charlie's explicit "Merge now"; squash-merge.
- [ ] Post-merge: log written, handoff refreshed, memory entries saved (including `project_hitpay_creds_blocker.md` update), branch cleanup pending approval.
