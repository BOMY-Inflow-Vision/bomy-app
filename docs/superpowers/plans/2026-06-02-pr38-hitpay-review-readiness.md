# PR #38 HitPay Review Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 5 legal/policy pages (/terms, /privacy, /refund, /shipping, /contact) + a persistent business-identity footer on the BOMY storefront so the site is reviewer-presentable for HitPay's website review (a prerequisite for HitPay sandbox/API access restoration).

**Architecture:** All work lives in `apps/web` (Next.js 15, React 19, Tailwind 3.4). Each legal page is a server component with inline JSX content wrapped in a shared `LegalPageLayout`. A new `Footer` server component renders inside the existing `<CartProvider>` shell in the root layout. Content uses `[PLACEHOLDER: snake_case_name]` markers that Charlie fills in a final pre-merge commit. Smoke tests use `react-dom/server` `renderToStaticMarkup` only — no new dependencies. No backend, schema, or auth flow changes.

**Tech Stack:** Next.js 15 App Router (server components), React 19, TypeScript 5.8, Tailwind CSS 3.4 (no Typography plugin), Vitest 2.1, `react-dom/server`.

---

## Pre-conditions before Task 1

These MUST be true before the first task runs:

1. Spec committed on branch `feat/hitpay-review-readiness-legal-pages` at `docs/superpowers/specs/2026-06-02-pr38-hitpay-review-readiness-design.md` (commits `c2f77cf` + `d37624a`). ✅
2. Branch is currently checked out (`git branch --show-current` returns `feat/hitpay-review-readiness-legal-pages`).
3. `apps/web` exists and dev script runs: `pnpm --filter @bomy/web dev` boots Next on :3000 (assume true — last verified during PR #37).
4. Existing tests green: `pnpm --filter @bomy/web test` exits 0 against the pre-PR-#38 baseline.

If any pre-condition is missing, STOP and report which one.

---

## File Structure

| Path                                                   | Action                          | Responsibility                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/footer.tsx`                   | Create                          | Persistent site-wide footer (brand block, policy links, business identity, copyright row). Uses two module-level constants for `SUPPORT_EMAIL` and `BUSINESS_ADDRESS` placeholders. |
| `apps/web/src/components/legal-page-layout.tsx`        | Create                          | Shared layout for legal pages — title, intro, optional `lastUpdated`, prose width, children slot.                                                                                   |
| `apps/web/src/app/layout.tsx`                          | Modify                          | Add `<Footer />` after `{children}` inside `<CartProvider>`.                                                                                                                        |
| `apps/web/src/app/terms/page.tsx`                      | Create                          | Terms of Service page (11 sections; inline JSX; placeholders for `seller_fee_schedule`, `court_jurisdiction`, `support_email`).                                                     |
| `apps/web/src/app/privacy/page.tsx`                    | Create                          | Privacy Policy page (13 sections; PDPA refs in source comment; placeholders for the 9 Privacy specifics + business identity).                                                       |
| `apps/web/src/app/refund/page.tsx`                     | Create                          | Refund and Return Policy page (10 sections; placeholders for windows + statutory exceptions).                                                                                       |
| `apps/web/src/app/shipping/page.tsx`                   | Create                          | Shipping and Delivery Policy page (10 sections; placeholders for processing/delivery windows).                                                                                      |
| `apps/web/src/app/contact/page.tsx`                    | Create                          | Contact page (6 blocks; static info; `mailto:`; NO `lastUpdated`; optional `support_phone` line).                                                                                   |
| `apps/web/tests/components/footer.test.tsx`            | Create                          | 2 cases: 5 policy links present; business identity strings present.                                                                                                                 |
| `apps/web/tests/components/legal-page-layout.test.tsx` | Create                          | 3 cases: renders with `lastUpdated`; omits "Last updated:" when prop absent; renders children.                                                                                      |
| `apps/web/tests/legal-pages/render.test.tsx`           | Create (and grow per page task) | Per-page render cases via `describe.each`. Each page contributes one title-assertion case. The no-placeholder assertion is added by Charlie in Task 8.                              |

**Not touched:**

- `apps/web/src/components/nav-bar.tsx` (no nav changes).
- All existing pages under `apps/web/src/app/` — they inherit the Footer via root layout.
- `apps/web/package.json` (no new deps).
- `apps/web/tailwind.config.ts` (no plugin additions).
- `packages/db`, `apps/api`, `apps/admin` (no changes).

---

## Task 1: Footer component + tests + root layout wiring

**Files:**

- Create: `apps/web/src/components/footer.tsx`
- Create: `apps/web/tests/components/footer.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Write the failing Footer test**

Create `apps/web/tests/components/footer.test.tsx` with this content:

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

  it("renders brand block + business identity + copyright", () => {
    expect(html).toContain("BOMY")
    expect(html).toContain("A curated Malaysian multivendor marketplace.")
    expect(html).toContain("Operated by Inflo Vision (Partnership), Malaysia.")
    expect(html).toContain("© 2026 Inflo Vision. All rights reserved.")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
pnpm --filter @bomy/web test footer.test.tsx
```

Expected: FAIL with import error — `Cannot find module '@/components/footer'`.

- [ ] **Step 3: Implement the Footer component**

Create `apps/web/src/components/footer.tsx` with this content:

```tsx
const SUPPORT_EMAIL = "[PLACEHOLDER: support_email]"
const BUSINESS_ADDRESS = "[PLACEHOLDER: business_address]"

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">BOMY</p>
            <p className="mt-3 text-sm text-slate-600">
              A curated Malaysian multivendor marketplace.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Policies</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>
                <a href="/terms" className="hover:text-slate-900 hover:underline">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/privacy" className="hover:text-slate-900 hover:underline">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/refund" className="hover:text-slate-900 hover:underline">
                  Refund and Return
                </a>
              </li>
              <li>
                <a href="/shipping" className="hover:text-slate-900 hover:underline">
                  Shipping and Delivery
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-slate-900 hover:underline">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Business identity
            </p>
            <p className="mt-3 text-sm text-slate-700">
              Operated by Inflo Vision (Partnership), Malaysia.
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Support:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-900 hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="mt-2 text-sm text-slate-700">Business address: {BUSINESS_ADDRESS}</p>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6">
          <p className="text-xs text-slate-500">© 2026 Inflo Vision. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```sh
pnpm --filter @bomy/web test footer.test.tsx
```

Expected: PASS — 2 cases green.

- [ ] **Step 5: Wire Footer into the root layout**

Read `apps/web/src/app/layout.tsx` first (it's short — see pre-conditions). Replace the file content with:

```tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { Footer } from "@/components/footer"
import { CartProvider } from "@/lib/cart"
import { NavBar } from "@/components/nav-bar"

import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "BOMY",
  description:
    "A curated brand collective, content media platform, and resource hub for brands and buyers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <CartProvider>
          <NavBar />
          {children}
          <Footer />
        </CartProvider>
      </body>
    </html>
  )
}
```

The only changes vs the pre-existing layout: added the `import { Footer }` line and the `<Footer />` element after `{children}`.

- [ ] **Step 6: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0 with no output errors.

- [ ] **Step 7: Commit**

```sh
git add apps/web/src/components/footer.tsx apps/web/tests/components/footer.test.tsx apps/web/src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(web): add Footer component + wire into root layout

Persistent footer renders inside the existing CartProvider shell below
{children}. Four blocks: brand wordmark + tagline, policy links to
/terms /privacy /refund /shipping /contact, Inflo Vision business
identity with placeholder support_email and business_address, and a
copyright row.

Uses plain <a href> (not next/link) per spec to keep render tests
dependency-light. Two module constants SUPPORT_EMAIL and
BUSINESS_ADDRESS at the top of footer.tsx hold placeholders that
Charlie fills in the final pre-merge commit (Task 8).

Tests: footer.test.tsx — 2 cases via renderToStaticMarkup. No new
dependencies.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: LegalPageLayout component + tests

**Files:**

- Create: `apps/web/src/components/legal-page-layout.tsx`
- Create: `apps/web/tests/components/legal-page-layout.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/components/legal-page-layout.test.tsx` with this content:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { LegalPageLayout } from "@/components/legal-page-layout"

describe("LegalPageLayout", () => {
  it("renders title, intro, and lastUpdated when provided", () => {
    const html = renderToStaticMarkup(
      <LegalPageLayout title="Test Policy" intro="A short summary." lastUpdated="June 1, 2026">
        <p>Body content.</p>
      </LegalPageLayout>,
    )
    expect(html).toContain("Test Policy")
    expect(html).toContain("A short summary.")
    expect(html).toContain("Last updated: June 1, 2026")
  })

  it("omits the Last updated line when lastUpdated is not provided", () => {
    const html = renderToStaticMarkup(
      <LegalPageLayout title="Test Policy" intro="A short summary.">
        <p>Body content.</p>
      </LegalPageLayout>,
    )
    expect(html).toContain("Test Policy")
    expect(html).not.toContain("Last updated:")
  })

  it("renders children content", () => {
    const html = renderToStaticMarkup(
      <LegalPageLayout title="Test Policy" intro="A short summary.">
        <p>Body content here.</p>
        <p>Second paragraph.</p>
      </LegalPageLayout>,
    )
    expect(html).toContain("Body content here.")
    expect(html).toContain("Second paragraph.")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```sh
pnpm --filter @bomy/web test legal-page-layout.test.tsx
```

Expected: FAIL with `Cannot find module '@/components/legal-page-layout'`.

- [ ] **Step 3: Implement the LegalPageLayout component**

Create `apps/web/src/components/legal-page-layout.tsx` with this content:

```tsx
type LegalPageLayoutProps = {
  title: string
  intro: string
  lastUpdated?: string
  children: React.ReactNode
}

export function LegalPageLayout({ title, intro, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-3 text-3xl font-bold">{title}</h1>
      <p className="mb-2 text-lg text-slate-600">{intro}</p>
      {lastUpdated && <p className="mb-8 text-sm text-slate-500">Last updated: {lastUpdated}</p>}
      <hr className="mb-8" />
      <div className="space-y-6 text-slate-800 leading-relaxed">{children}</div>
    </main>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```sh
pnpm --filter @bomy/web test legal-page-layout.test.tsx
```

Expected: PASS — 3 cases green.

- [ ] **Step 5: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/components/legal-page-layout.tsx apps/web/tests/components/legal-page-layout.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add LegalPageLayout component

Shared layout for the 5 legal pages: title, intro paragraph, optional
lastUpdated line, constrained prose width (max-w-3xl), and a children
slot for page-specific content. Uses hand-rolled Tailwind utilities
(no @tailwindcss/typography) per locked design.

lastUpdated is optional via the ?: marker; Contact page omits it.

Tests: legal-page-layout.test.tsx — 3 cases via renderToStaticMarkup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: /terms page

**Files:**

- Create: `apps/web/src/app/terms/page.tsx`
- Create: `apps/web/tests/legal-pages/render.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `apps/web/tests/legal-pages/render.test.tsx` with the initial single-page entry:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import TermsPage from "@/app/terms/page"

const cases = [{ name: "Terms", Page: TermsPage, title: "Terms of Service" }]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: FAIL with `Cannot find module '@/app/terms/page'`.

- [ ] **Step 3: Implement the /terms page**

Create `apps/web/src/app/terms/page.tsx` with this content:

```tsx
import { LegalPageLayout } from "@/components/legal-page-layout"

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      intro="These terms govern your use of BOMY's marketplace as a buyer, seller, or visitor."
      lastUpdated="June 1, 2026"
    >
      <section>
        <h2 className="mb-3 text-xl font-semibold">1. Acceptance of terms</h2>
        <p>
          By accessing or using BOMY (the &ldquo;Service&rdquo;), you agree to be bound by these
          Terms of Service. If you do not agree, you must not use the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. Eligibility</h2>
        <p>
          You must be at least 18 years old to create an account. Buyers in Malaysia are bound by
          applicable Malaysian law; foreign buyers are additionally bound by the terms governing
          cross-border purchases set out below and at checkout.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. Account responsibilities</h2>
        <p>
          You are responsible for keeping your account credentials secure, providing accurate
          registration information, and maintaining a single account per person. We may suspend or
          terminate accounts that violate these obligations.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Buyer terms</h2>
        <p>
          Purchases on BOMY are completed through our payment processor on the processor&rsquo;s
          hosted checkout page. Use of vouchers, store credit, and membership benefits is subject to
          the terms shown at point of issue. Memberships and benefits are described on the
          membership page.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. Seller terms</h2>
        <p>
          Sellers are responsible for their storefronts, including listing accuracy, pricing,
          inventory, and fulfilment. Seller fees are disclosed during onboarding and within the
          seller dashboard terms. See [PLACEHOLDER: seller_fee_schedule] for the current fee
          schedule.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. Prohibited content and conduct</h2>
        <p>
          You may not list, sell, or solicit content or items that are unlawful, infringing,
          deceptive, fraudulent, or otherwise harmful. We may remove content and terminate accounts
          at our discretion.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. Intellectual property</h2>
        <p>
          Sellers retain ownership of intellectual property in their listings and storefront
          content, and grant BOMY a non-exclusive licence to display and promote those listings
          within the marketplace. BOMY retains all rights in its own marks, software, and platform
          content.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. Disclaimers and limitation of liability</h2>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To
          the maximum extent permitted by applicable law, BOMY disclaims all warranties and limits
          its liability arising from your use of the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. Termination</h2>
        <p>
          We may suspend or terminate access for breach of these terms, unlawful conduct, or risk to
          the marketplace or its users. You may terminate your account at any time through your
          account settings or by contacting support.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Governing law and jurisdiction</h2>
        <p>
          These terms are governed by the laws of Malaysia. The courts of [PLACEHOLDER:
          court_jurisdiction] have exclusive jurisdiction over any dispute arising out of or
          relating to the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:[PLACEHOLDER: support_email]" className="text-slate-900 underline">
            [PLACEHOLDER: support_email]
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: PASS — 1 case (Terms page renders title).

- [ ] **Step 5: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/app/terms/page.tsx apps/web/tests/legal-pages/render.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add /terms page (draft with placeholders)

Terms of Service page — 11 sections, inline JSX, wrapped in
LegalPageLayout. Last updated June 1, 2026.

Placeholders Charlie fills before merge: seller_fee_schedule (Terms §5),
court_jurisdiction (Terms §10), support_email (Terms §11).

Public copy says "our payment processor" — no HitPay processor claim
per locked spec until HitPay account approval.

Tests: render.test.tsx — 1 case (title in <h1>). The no-placeholder
assertion is added by Charlie in the final fill commit (Task 8).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: /privacy page

**Files:**

- Create: `apps/web/src/app/privacy/page.tsx`
- Modify: `apps/web/tests/legal-pages/render.test.tsx`

- [ ] **Step 1: Add the Privacy entry to render.test.tsx**

Edit `apps/web/tests/legal-pages/render.test.tsx`. Replace the file content with:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import PrivacyPage from "@/app/privacy/page"
import TermsPage from "@/app/terms/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: FAIL with `Cannot find module '@/app/privacy/page'`.

- [ ] **Step 3: Implement the /privacy page**

Create `apps/web/src/app/privacy/page.tsx` with this content:

```tsx
// PDPA refs (for next reviewer / counsel):
//   Act 709: https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/
//   Amendment Act 2024: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-amendment-act-2024/
//   Cookie scope (DataGuidance): https://www.dataguidance.com/notes/malaysia-cookies-similar-technologies

import { LegalPageLayout } from "@/components/legal-page-layout"

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      intro="How Inflo Vision (operating BOMY) collects, uses, and protects your personal data under Malaysia's Personal Data Protection Act 2010 as amended by the Personal Data Protection (Amendment) Act 2024."
      lastUpdated="June 1, 2026"
    >
      <section>
        <h2 className="mb-3 text-xl font-semibold">1. Who we are</h2>
        <p>
          Inflo Vision (Partnership), Malaysia. Registration: [PLACEHOLDER:
          ssm_registration_number]. Address: [PLACEHOLDER: business_address]. Privacy contact:{" "}
          <a href="mailto:[PLACEHOLDER: privacy_email]" className="text-slate-900 underline">
            [PLACEHOLDER: privacy_email]
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. Personal data we collect</h2>
        <ul className="ml-6 list-disc space-y-1">
          <li>Account: email address, name, and phone number.</li>
          <li>Transactional: shipping address, order history, and payment status.</li>
          <li>Technical: session cookies and IP address for security and session continuity.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. Why we collect it</h2>
        <ul className="ml-6 list-disc space-y-1">
          <li>Account management and authentication.</li>
          <li>Order fulfilment, including dispatch and post-purchase support.</li>
          <li>Marketing communications, only with your opt-in.</li>
          <li>Fraud prevention and platform integrity.</li>
          <li>Legal and regulatory compliance.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Legal basis under PDPA 2010</h2>
        <p>
          We rely on your consent, the performance of a contract with you (for example, processing
          your orders), and our legal obligations as a marketplace operator in Malaysia.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. Disclosure and subprocessors</h2>
        <p>We share limited personal data with the following categories of subprocessors:</p>
        <ul className="ml-6 mt-3 list-disc space-y-1">
          <li>Payment processing: [PLACEHOLDER: payment_processor_disclosure]</li>
          <li>Shipping and delivery: Pos Laju</li>
          <li>Support tooling: [PLACEHOLDER: support_tool_disclosure]</li>
          <li>Hosting and infrastructure: [PLACEHOLDER: hosting_provider_disclosure]</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. Cross-border transfers</h2>
        <p>
          Some processors are located outside Malaysia; transfers comply with PDPA 2010 cross-border
          requirements and with the additional safeguards introduced by the 2024 Amendment Act.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. Retention windows</h2>
        <p>
          Account data is retained while the account is active and for [PLACEHOLDER:
          account_retention_window] after the last sign-in. Inactive accounts are flagged for
          deletion after [PLACEHOLDER: dormant_account_window]. Order records are retained for
          [PLACEHOLDER: order_retention_window] in line with tax and accounting requirements.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. Your rights under PDPA</h2>
        <ul className="ml-6 list-disc space-y-1">
          <li>Access your personal data we hold.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Withdraw consent for processing that relies on consent.</li>
          <li>Lodge a complaint with us or with the relevant authority.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. Complaints and escalation</h2>
        <p>
          We respond to data-protection inquiries within [PLACEHOLDER: complaint_response_timeline]
          business days. You may contact us first; if your concern remains unresolved, you may
          contact the Personal Data Protection Commissioner.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Data breach process</h2>
        <p>
          Material breaches are reported to affected users and to the Department of Personal Data
          Protection in accordance with the notification requirements of the Act. Breach contact:
          [PLACEHOLDER: breach_contact].
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. Cookies</h2>
        <p>
          BOMY uses essential cookies for session management and authentication. No analytics or
          marketing cookies are set in the current pre-launch period. When we add analytics or
          marketing cookies in future, we will update this section and surface a consent control
          before they are deployed.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">12. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be highlighted on this
          page and, where appropriate, notified to account holders by email.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">13. Contact</h2>
        <p>
          Questions about this policy can be sent to{" "}
          <a href="mailto:[PLACEHOLDER: privacy_email]" className="text-slate-900 underline">
            [PLACEHOLDER: privacy_email]
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: PASS — 2 cases (Terms + Privacy titles).

- [ ] **Step 5: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/app/privacy/page.tsx apps/web/tests/legal-pages/render.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add /privacy page (draft with placeholders)

Privacy Policy — 13 sections, inline JSX, wrapped in LegalPageLayout.
PDPA 2010 as amended by the 2024 Amendment Act referenced in the
intro and §6/§9 prose. Three authoritative URLs (pdp.gov.my Act 709,
pdp.gov.my Amendment Act 2024, DataGuidance cookie scope) live in a
source-only comment at the top of the file.

Generic Commissioner wording in §9 — no PDPA section numbers per
locked design (counsel will tune if needed).

Placeholders Charlie fills before merge: ssm_registration_number,
business_address, privacy_email, payment_processor_disclosure,
support_tool_disclosure, hosting_provider_disclosure,
account_retention_window, dormant_account_window,
order_retention_window, complaint_response_timeline, breach_contact.

Tests: render.test.tsx grown with Privacy case.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: /refund page

**Files:**

- Create: `apps/web/src/app/refund/page.tsx`
- Modify: `apps/web/tests/legal-pages/render.test.tsx`

- [ ] **Step 1: Add the Refund entry to render.test.tsx**

Edit `apps/web/tests/legal-pages/render.test.tsx`. Replace the file content with:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import PrivacyPage from "@/app/privacy/page"
import RefundPage from "@/app/refund/page"
import TermsPage from "@/app/terms/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
  { name: "Refund", Page: RefundPage, title: "Refund and Return Policy" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: FAIL with `Cannot find module '@/app/refund/page'`.

- [ ] **Step 3: Implement the /refund page**

Create `apps/web/src/app/refund/page.tsx` with this content:

```tsx
import { LegalPageLayout } from "@/components/legal-page-layout"

export default function RefundPage() {
  return (
    <LegalPageLayout
      title="Refund and Return Policy"
      intro="Eligibility, timelines, and process for returns and refunds on BOMY purchases."
      lastUpdated="June 1, 2026"
    >
      <section>
        <h2 className="mb-3 text-xl font-semibold">1. Eligibility</h2>
        <p>
          Returns and refunds are eligible for items that arrived defective, significantly different
          from their listing description, or where the wrong item was sent. Change-of-mind returns
          are accepted only where the seller opts in and the item is in its original condition.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. Return window</h2>
        <p>
          You have [PLACEHOLDER: return_window_days] days from the date of delivery to initiate a
          return for an eligible item.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. Condition requirements</h2>
        <p>
          Returned items must be unused, in their original packaging where applicable, and
          accompanied by proof of purchase. Items that show signs of use beyond inspection may be
          rejected by the seller.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Process</h2>
        <p>
          Contact the seller via BOMY first. If the seller has not responded within [PLACEHOLDER:
          seller_response_window] business days, you may escalate to BOMY support for assistance.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. Refund method and timeline</h2>
        <p>
          Approved refunds are returned to the original payment method within [PLACEHOLDER:
          refund_processing_window] business days of the seller receiving the returned item.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. Voucher refunds</h2>
        <p>
          Where vouchers were applied to an order, the voucher portion is reversed via ledger
          reversal and the net amount paid by the buyer is refunded to the original payment method.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. Membership and brand subscription refunds</h2>
        <p>
          Platform memberships and brand subscriptions are not refundable mid-term, except where
          required by applicable law or where BOMY approves an exception in writing. Starter kits,
          vouchers, and fulfilled membership benefits are not separately refundable.
        </p>
        <p className="mt-3">Statutory exceptions: [PLACEHOLDER: statutory_refund_exceptions].</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. Shipping cost responsibility</h2>
        <p>
          For defects, wrong items, or significant misdescription, the seller is responsible for
          return shipping costs. For change-of-mind returns, the buyer is responsible for return
          shipping costs.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. Non-returnable items</h2>
        <p>
          The following are not eligible for return except where defective: perishable goods,
          personalised or made-to-order items, intimate apparel for hygiene reasons, and any item
          the seller marks as non-returnable in the listing.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Contact</h2>
        <p>
          Questions about this policy or about an active return can be sent to{" "}
          <a href="mailto:[PLACEHOLDER: support_email]" className="text-slate-900 underline">
            [PLACEHOLDER: support_email]
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: PASS — 3 cases (Terms + Privacy + Refund titles).

- [ ] **Step 5: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/app/refund/page.tsx apps/web/tests/legal-pages/render.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add /refund page (draft with placeholders)

Refund and Return Policy — 10 sections, inline JSX, wrapped in
LegalPageLayout.

Membership §7 uses concrete locked wording from project_membership_model
with statutory carveout: not refundable mid-term except as required by
law or by BOMY exception in writing. Starter kits, vouchers, and
fulfilled benefits are not separately refundable.

Placeholders Charlie fills before merge: return_window_days,
seller_response_window, refund_processing_window,
statutory_refund_exceptions, support_email.

Tests: render.test.tsx grown with Refund case.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: /shipping page

**Files:**

- Create: `apps/web/src/app/shipping/page.tsx`
- Modify: `apps/web/tests/legal-pages/render.test.tsx`

- [ ] **Step 1: Add the Shipping entry to render.test.tsx**

Edit `apps/web/tests/legal-pages/render.test.tsx`. Replace the file content with:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import PrivacyPage from "@/app/privacy/page"
import RefundPage from "@/app/refund/page"
import ShippingPage from "@/app/shipping/page"
import TermsPage from "@/app/terms/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
  { name: "Refund", Page: RefundPage, title: "Refund and Return Policy" },
  { name: "Shipping", Page: ShippingPage, title: "Shipping and Delivery Policy" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: FAIL with `Cannot find module '@/app/shipping/page'`.

- [ ] **Step 3: Implement the /shipping page**

Create `apps/web/src/app/shipping/page.tsx` with this content:

```tsx
import { LegalPageLayout } from "@/components/legal-page-layout"

export default function ShippingPage() {
  return (
    <LegalPageLayout
      title="Shipping and Delivery Policy"
      intro="Domestic and international shipping methods, timelines, and costs for BOMY orders."
      lastUpdated="June 1, 2026"
    >
      <section>
        <h2 className="mb-3 text-xl font-semibold">1. Coverage</h2>
        <p>
          We ship throughout Malaysia (West and East Malaysia) and to selected international
          destinations subject to per-seller availability.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. Carrier</h2>
        <p>
          Domestic shipments are handled by Pos Laju. International shipments are sent via Pos Laju
          International or via per-seller arrangement, as displayed at checkout.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. Processing time</h2>
        <p>
          Orders are dispatched within [PLACEHOLDER: processing_time_days] business days of payment
          confirmation, subject to seller cut-off times.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Delivery estimates</h2>
        <ul className="ml-6 list-disc space-y-1">
          <li>West Malaysia: [PLACEHOLDER: delivery_west_estimate] business days.</li>
          <li>East Malaysia: [PLACEHOLDER: delivery_east_estimate] business days.</li>
          <li>International: [PLACEHOLDER: delivery_international_estimate] business days.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. Shipping costs</h2>
        <p>
          Shipping costs are set by sellers and shown to you at checkout. Costs are typically based
          on weight and destination and may be combined where sellers offer multi-item bundling.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. Tracking</h2>
        <p>
          Once your order is dispatched, you receive a Pos Laju tracking number by email and in your
          account order detail page.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. Failed delivery and re-attempts</h2>
        <p>
          The carrier will attempt re-delivery according to its standard policy. Repeated failed
          attempts may return the parcel to the seller; we will contact you to arrange a re-send,
          where the additional shipping is paid by the responsible party.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. Damaged or lost shipments</h2>
        <p>
          Contact the seller via BOMY first to begin a claim. If the matter is not resolved,
          escalate to BOMY support. Where carrier investigation is required, timelines are subject
          to the carrier&rsquo;s process.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. Customs and duties (international)</h2>
        <p>
          Import duties, taxes, and customs fees for international shipments are the responsibility
          of the buyer and are not included in BOMY checkout totals.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Contact</h2>
        <p>
          Questions about shipping or about an active order can be sent to{" "}
          <a href="mailto:[PLACEHOLDER: support_email]" className="text-slate-900 underline">
            [PLACEHOLDER: support_email]
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: PASS — 4 cases (Terms + Privacy + Refund + Shipping titles).

- [ ] **Step 5: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/app/shipping/page.tsx apps/web/tests/legal-pages/render.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add /shipping page (draft with placeholders)

Shipping and Delivery Policy — 10 sections, inline JSX, wrapped in
LegalPageLayout. Pos Laju named as domestic carrier per locked Q&A
decision.

Placeholders Charlie fills before merge: processing_time_days,
delivery_west_estimate, delivery_east_estimate,
delivery_international_estimate, support_email.

Tests: render.test.tsx grown with Shipping case.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: /contact page

**Files:**

- Create: `apps/web/src/app/contact/page.tsx`
- Modify: `apps/web/tests/legal-pages/render.test.tsx`

- [ ] **Step 1: Add the Contact entry to render.test.tsx**

Edit `apps/web/tests/legal-pages/render.test.tsx`. Replace the file content with:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import ContactPage from "@/app/contact/page"
import PrivacyPage from "@/app/privacy/page"
import RefundPage from "@/app/refund/page"
import ShippingPage from "@/app/shipping/page"
import TermsPage from "@/app/terms/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
  { name: "Refund", Page: RefundPage, title: "Refund and Return Policy" },
  { name: "Shipping", Page: ShippingPage, title: "Shipping and Delivery Policy" },
  { name: "Contact", Page: ContactPage, title: "Contact Us" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: FAIL with `Cannot find module '@/app/contact/page'`.

- [ ] **Step 3: Implement the /contact page**

Create `apps/web/src/app/contact/page.tsx` with this content:

```tsx
import { LegalPageLayout } from "@/components/legal-page-layout"

export default function ContactPage() {
  return (
    <LegalPageLayout
      title="Contact Us"
      intro="Reach BOMY's support team for help with orders, your account, or anything else."
    >
      <section>
        <h2 className="mb-3 text-xl font-semibold">Business identity</h2>
        <p>BOMY is operated by Inflo Vision (Partnership), Malaysia.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Support email</h2>
        <p>
          <a href="mailto:[PLACEHOLDER: support_email]" className="text-slate-900 underline">
            [PLACEHOLDER: support_email]
          </a>
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Business address</h2>
        <p>[PLACEHOLDER: business_address]</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Operating hours</h2>
        <p>Monday to Friday, 9am – 6pm Malaysia Time (UTC+8), excluding public holidays.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Phone</h2>
        <p>[PLACEHOLDER: support_phone]</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Response time</h2>
        <p>We aim to respond within [PLACEHOLDER: contact_response_window] business days.</p>
      </section>
    </LegalPageLayout>
  )
}
```

Note on the Phone section: if Charlie decides NOT to publish a phone number, the entire `<section>...</section>` for Phone is deleted in Task 8 (not just the placeholder value). The plan ships it as a section so the structure is visible to Charlie at fill time.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```sh
pnpm --filter @bomy/web test render.test.tsx
```

Expected: PASS — 5 cases (Terms + Privacy + Refund + Shipping + Contact titles).

- [ ] **Step 5: Verify typecheck + lint still pass**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/app/contact/page.tsx apps/web/tests/legal-pages/render.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add /contact page (draft, no last-updated)

Contact page — 6 blocks (business identity, support email, business
address, operating hours, phone, response time), inline JSX, wrapped
in LegalPageLayout. No lastUpdated prop passed — contact pages
typically don't carry one.

Placeholders Charlie fills before merge: support_email,
business_address, contact_response_window. Optional: support_phone.

If Charlie decides not to publish a phone, the entire Phone section
(not just the placeholder value) is removed in the final fill commit.

Tests: render.test.tsx grown with Contact case. All 5 pages now
covered.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Charlie's pre-merge placeholder fill + no-placeholder assertion

**Files:**

- Modify: `apps/web/src/components/footer.tsx`
- Modify: `apps/web/src/app/terms/page.tsx`
- Modify: `apps/web/src/app/privacy/page.tsx`
- Modify: `apps/web/src/app/refund/page.tsx`
- Modify: `apps/web/src/app/shipping/page.tsx`
- Modify: `apps/web/src/app/contact/page.tsx`
- Modify: `apps/web/tests/legal-pages/render.test.tsx`

This is the human-operator task. Andy does NOT auto-fill values. Charlie performs each step and confirms back to Andy.

- [ ] **Step 1: Fill the 24 placeholders**

Charlie opens each of the 6 files listed above and replaces every `[PLACEHOLDER: name]` token with the real value. The 23 mandatory + 1 optional list:

**Business identity (3):**

- `support_email` → e.g. `support@brandsofmalaysia.com`
- `business_address` → full registered address line
- `ssm_registration_number` → SSM registration number for Inflo Vision

**Privacy specifics (9):**

- `privacy_email` (Privacy §1, §13)
- `payment_processor_disclosure` (Privacy §5) — generic wording until HitPay approval, e.g., "a licensed Malaysian payment service provider"
- `support_tool_disclosure` (Privacy §5) — generic until Freshdesk wired, e.g., "a third-party helpdesk SaaS"
- `hosting_provider_disclosure` (Privacy §5)
- `account_retention_window` (Privacy §7)
- `dormant_account_window` (Privacy §7)
- `order_retention_window` (Privacy §7)
- `complaint_response_timeline` (Privacy §9)
- `breach_contact` (Privacy §10)

**Refund / Shipping operational windows (8):**

- `return_window_days` (Refund §2)
- `seller_response_window` (Refund §4)
- `refund_processing_window` (Refund §5)
- `statutory_refund_exceptions` (Refund §7)
- `processing_time_days` (Shipping §3)
- `delivery_west_estimate` (Shipping §4)
- `delivery_east_estimate` (Shipping §4)
- `delivery_international_estimate` (Shipping §4)

**Legal carveouts (2):**

- `court_jurisdiction` (Terms §10)
- `seller_fee_schedule` (Terms §5)

**Contact (2):**

- `contact_response_window` (Contact)
- `support_phone` (Contact) — OPTIONAL. If not publishing, delete the entire `<section>...</section>` block for Phone (lines containing `<h2>Phone</h2>` and the following `<p>` paragraph), NOT just the placeholder string.

Notes:

- The Footer's two module constants (`SUPPORT_EMAIL`, `BUSINESS_ADDRESS`) at the top of `footer.tsx` are updated, not the JSX itself.
- `support_email` appears in multiple files but represents the same value — fill consistently.
- `business_address` appears in Footer + Contact — fill consistently.

- [ ] **Step 2: Add the no-placeholder assertion to render.test.tsx**

Edit `apps/web/tests/legal-pages/render.test.tsx`. Add a second `it()` block inside the `describe.each` so the file becomes:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import ContactPage from "@/app/contact/page"
import PrivacyPage from "@/app/privacy/page"
import RefundPage from "@/app/refund/page"
import ShippingPage from "@/app/shipping/page"
import TermsPage from "@/app/terms/page"

const cases = [
  { name: "Terms", Page: TermsPage, title: "Terms of Service" },
  { name: "Privacy", Page: PrivacyPage, title: "Privacy Policy" },
  { name: "Refund", Page: RefundPage, title: "Refund and Return Policy" },
  { name: "Shipping", Page: ShippingPage, title: "Shipping and Delivery Policy" },
  { name: "Contact", Page: ContactPage, title: "Contact Us" },
]

describe.each(cases)("$name page", ({ Page, title }) => {
  const html = renderToStaticMarkup(<Page />)

  it("renders the expected title in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain(title)
  })

  it("has no unfilled [PLACEHOLDER: …] markers in rendered output", () => {
    expect(html).not.toContain("[PLACEHOLDER:")
  })
})
```

- [ ] **Step 3: Run the manual rg gate**

Run:

```sh
rg -n "\[PLACEHOLDER:" \
  apps/web/src/app/{terms,privacy,refund,shipping,contact}/page.tsx \
  apps/web/src/components/footer.tsx
```

Expected: no matches; exit code 1 (rg exits 1 when no matches; this is success here).

If any matches appear, return to Step 1 and fill the remaining placeholders before continuing.

- [ ] **Step 4: Run the full web test suite**

Run:

```sh
pnpm --filter @bomy/web test
```

Expected: PASS — all 15 cases green (2 Footer + 3 LegalPageLayout + 10 legal-pages: 5 title + 5 no-placeholder).

- [ ] **Step 5: Run typecheck and lint**

Run:

```sh
pnpm --filter @bomy/web typecheck
pnpm --filter @bomy/web lint
```

Expected: both exit 0.

- [ ] **Step 6: Manual smoke walkthrough**

Run:

```sh
pnpm --filter @bomy/web dev
```

Open each of these in a browser and confirm: the page renders, footer appears at the bottom, no `[PLACEHOLDER:` substring is visible anywhere on the page.

- http://localhost:3000/
- http://localhost:3000/terms
- http://localhost:3000/privacy
- http://localhost:3000/refund
- http://localhost:3000/shipping
- http://localhost:3000/contact
- http://localhost:3000/products (regression — footer should appear, nav unchanged)
- http://localhost:3000/seller/apply (regression — Turnstile-gated form still renders, footer below it)

Stop the dev server with Ctrl-C when done.

- [ ] **Step 7: Commit the fill + assertion together**

```sh
git add apps/web/src/components/footer.tsx \
        apps/web/src/app/terms/page.tsx \
        apps/web/src/app/privacy/page.tsx \
        apps/web/src/app/refund/page.tsx \
        apps/web/src/app/shipping/page.tsx \
        apps/web/src/app/contact/page.tsx \
        apps/web/tests/legal-pages/render.test.tsx
git commit -m "$(cat <<'EOF'
chore(web): fill placeholders + add no-placeholder rendered-output gate

Fills all 23 mandatory placeholders across Footer + 5 legal pages.
support_phone optional: kept | section removed (Charlie picks one).

Adds the no-placeholder rendered-output assertion to render.test.tsx —
asserts no [PLACEHOLDER: substring leaks into any of the 5 legal
pages' renderToStaticMarkup output. Belt + suspenders alongside the
manual rg gate (rg runs against source; this runs against rendered
HTML).

Manual rg gate: green (no matches).
Test suite: 15/15 green.
Manual smoke: 5 legal routes + / + /products + /seller/apply all
render with footer and no placeholder leakage.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Push branch + open PR #38

**Files:** none.

- [ ] **Step 1: Confirm Charlie has approved pushing**

Charlie has standing rule: pause for explicit push approval. Ask in conversation: "Tasks 1–8 complete on `feat/hitpay-review-readiness-legal-pages`. Ready to push and open PR #38?"

If Charlie says no → STOP, hold commits locally.

- [ ] **Step 2: Push branch**

```sh
git push -u origin feat/hitpay-review-readiness-legal-pages
```

Expected: pushes all commits (spec + plan + 8 implementation commits).

- [ ] **Step 3: Open PR #38**

Run:

```sh
gh pr create --title "feat(web): legal pages + footer for HitPay review readiness" --body "$(cat <<'EOF'
**Type:** Public content surface (legal/policy + business identity footer).
**Goal:** Ship the legal/business identity surface BOMY needs in place before public deployment can be submitted to HitPay for website review.
**Spec:** docs/superpowers/specs/2026-06-02-pr38-hitpay-review-readiness-design.md
**Plan:** docs/superpowers/plans/2026-06-02-pr38-hitpay-review-readiness.md

## What ships

- Routes: /terms, /privacy, /refund, /shipping, /contact (all server components, inline JSX).
- Components: Footer (4 blocks + copyright row), LegalPageLayout (optional lastUpdated).
- Wiring: Footer inside <CartProvider> after {children} in apps/web/src/app/layout.tsx.
- Tests: 15 cases across 3 files using renderToStaticMarkup; no new deps.

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
4. All [PLACEHOLDER:…] markers filled before merge — verified via \`rg -n "\[PLACEHOLDER:" apps/web/src/app/{terms,privacy,refund,shipping,contact}/page.tsx apps/web/src/components/footer.tsx\` returning no matches.
5. Footer links resolve to all 5 new routes; no broken links.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL and report to Charlie.

- [ ] **Step 4: Confirm PR number is #38**

If the auto-assigned number differs from 38, flag to Charlie immediately. The handoff narrative and post-merge memory entries assume #38.

---

## Task 10: Bob R0 review handling

**Files:** depends on Bob's findings.

- [ ] **Step 1: Wait for Bob R0 findings (paste from Charlie)**

- [ ] **Step 2: Triage findings**

Per receiving-code-review skill:

- Verify each finding against the spec + locked design before implementing.
- Public-copy findings (HitPay claim, PDPA wording, processor naming): implement immediately.
- Business-identity inconsistency: edit relevant file(s).
- Placeholder-leakage finding: re-run Step 3 of Task 8 immediately.
- Style nits outside R0 scope: acknowledge, defer unless trivial.

- [ ] **Step 3: Apply fixes**

For each accepted finding, edit the relevant file, then:

```sh
git add <changed file(s)>
git commit -m "fix(web): <one-line summary of Bob R0 fix>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

If a fix removes a placeholder that was already on a remote branch, run the manual rg gate again before pushing.

- [ ] **Step 4: Re-request Bob review if needed; loop until green or Charlie overrides**

---

## Task 11: Squash-merge after Charlie's "Merge now"

- [ ] **Step 1: Wait for explicit "Merge now" from Charlie**

Standing rule: do NOT merge on Bob's approval alone.

- [ ] **Step 2: Squash-merge via gh**

```sh
gh pr merge <PR#> --squash --delete-branch=false
```

`--delete-branch=false` preserves the remote branch until Charlie approves cleanup (Task 12 Step 5). Use the squash commit subject `feat(web): legal pages + footer for HitPay review readiness (#38)` (gh will pre-fill this from the PR title; confirm before merging).

- [ ] **Step 3: Sync local main**

```sh
git checkout main
git pull origin main
git log --oneline -3
```

Expected: HEAD is the squash commit; "(#38)" in the message.

---

## Task 12: Post-merge bookkeeping

**Files:**

- Modify: `app/.andy/handoff.md` (NEVER committed)
- Create: `app/log/2026-06-02_PR38_hitpay-review-readiness.md` (gitignored)
- Create: `~/.claude/projects/-Users-charliekong-Documents-AI-Works-BOMY/memory/project_pr38_complete.md`
- Modify: `~/.claude/projects/-Users-charliekong-Documents-AI-Works-BOMY/memory/project_hitpay_creds_blocker.md`
- Modify: `~/.claude/projects/-Users-charliekong-Documents-AI-Works-BOMY/memory/MEMORY.md`

- [ ] **Step 1: Write the post-merge log**

Create `app/log/2026-06-02_PR38_hitpay-review-readiness.md` with: outcome, what shipped, Bob R0 rounds + resolutions, links to the squash commit and to all 5 page files. Mirror the structure of `app/log/2026-05-30_PR37_turnstile-seller-apply.md`.

- [ ] **Step 2: Refresh handoff**

Update `app/.andy/handoff.md`:

- Header date and HEAD SHA.
- §1 current state: new HEAD; `checkout_enabled` still `false` (unchanged by PR #38); HitPay creds still missing (unchanged by PR #38).
- §2 PR #38 summary: 2–3 sentence summary of what shipped.
- §4 PR table: add PR #38 row with the squash SHA.
- §5 backlog: keep the HitPay sandbox/API access restoration item and the first-checkout-flip item; add "PR #38 shipped — review-readiness content surface in place; PR #39 public deployment is the next concrete step toward HitPay submission" as a new note; add the counsel-review backlog item.
- §6 cleanup pending: PR #38 branch deletion.
- §8 next session: PR #39 deployment brainstorm.

- [ ] **Step 3: Save the durable memory**

Create `~/.claude/projects/-Users-charliekong-Documents-AI-Works-BOMY/memory/project_pr38_complete.md` with frontmatter:

```yaml
---
name: project-pr38-complete
description: PR #38 HitPay review readiness — 5 legal pages + business identity footer shipped; HitPay creds blocker still pending PR #39 deployment + PR #41 review
metadata:
  type: project
---
```

Body covers: outcome (merged + squash SHA + date), what shipped (5 routes + 2 components + layout wiring), placeholders filled, Bob R0 rounds + resolutions, link to spec + plan, link to runbook (none — content PR), explicit statement that the HitPay-creds blocker is NOT removed by this PR, what backlog items it closes (none — it adds the counsel-review item and unblocks PR #39 work), and the durable conventions reinforced (no public HitPay claim until approval; placeholder-as-merge-gate pattern; `react-dom/server` smoke-test pattern for static pages).

- [ ] **Step 4: Update the HitPay blocker memory**

Edit `~/.claude/projects/-Users-charliekong-Documents-AI-Works-BOMY/memory/project_hitpay_creds_blocker.md` to add a note at the top of the body:

> **Update 2026-06-02 (PR #38 merged):** PR #38 shipped the legal/business identity readiness surface (5 legal pages + footer). The blocker remains pending PR #39 public deployment and PR #41 HitPay review/API restoration. Site is now closer to reviewable but is not yet on a public URL.

- [ ] **Step 5: Update MEMORY.md index**

Append one line to `~/.claude/projects/-Users-charliekong-Documents-AI-Works-BOMY/memory/MEMORY.md`:

```markdown
- [PR #38 — HitPay review readiness (merged)](project_pr38_complete.md) — merged 2026-06-02; 5 legal pages + Inflo Vision footer; HitPay creds blocker still pending PR #39 deployment + PR #41 review
```

- [ ] **Step 6: Offer branch cleanup**

Ask Charlie:

> "PR #38 merged. Cleanup pending your approval:
>
> 1. `git push origin --delete feat/hitpay-review-readiness-legal-pages`
> 2. `git branch -d feat/hitpay-review-readiness-legal-pages` (or `-D` after squash)
>    Approve?"

If approved → run both; report done. If not → leave for later.

- [ ] **Step 7: No git commit for handoff/log/memory**

These files are gitignored or live outside the repo. No `git add` or `git commit` for them.

---

## Self-Review (done before saving)

**Spec coverage:**

| Spec section                                                                                                                                                 | Plan task                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| §1 Goal                                                                                                                                                      | Tasks 1–8 (collectively); §1 framing reinforced in Task 9 PR body                                         |
| §2 In scope (5 routes, Footer, LegalPageLayout, inline JSX, PDPA refs, smoke tests, URL refs in comments)                                                    | Tasks 1–7 + spec linked in commit messages                                                                |
| §3 Out of scope                                                                                                                                              | Task 12 backlog refresh records these                                                                     |
| §4 Approach (Option A inline JSX, B1 hand-rolled Tailwind)                                                                                                   | Tasks 3–7 (all pages use inline JSX + utility classes)                                                    |
| §5 File structure                                                                                                                                            | File Structure table at top + per-task Files headers                                                      |
| §6 Component contracts (Footer, LegalPageLayout, layout wiring)                                                                                              | Tasks 1, 2                                                                                                |
| §7 Page contracts (Terms 11 sections, Privacy 13, Refund 10, Shipping 10, Contact 6 blocks)                                                                  | Tasks 3, 4, 5, 6, 7 (one task per page; section counts match)                                             |
| §8 Placeholder convention + master list (24 unique)                                                                                                          | Task 8 Step 1 lists all 24 grouped per spec §8 categories                                                 |
| §9 Testing (Footer 2 + LegalPageLayout 3 + render.test 10)                                                                                                   | Task 1 (Footer 2), Task 2 (Layout 3), Tasks 3–7 (5 title cases) + Task 8 (5 no-placeholder cases) = 15    |
| §10 PR workflow (~8 commits, PR body shape, acceptance criteria)                                                                                             | Tasks 1–8 (8 commits) + Task 9 (PR body verbatim) + Task 11 acceptance gating                             |
| §11 Risks (placeholder leak, HitPay claim, counsel disagreement, last-updated drift, layout breakage, PDPA inaccuracy, Inflo details wrong, test state leak) | Task 8 belt+suspenders gate + Task 10 R0 review covers; Task 8 Step 6 manual smoke covers layout breakage |
| §12 Acceptance summary                                                                                                                                       | Task 8 (gates) + Task 11 (merge gate) + Task 12 (post-merge)                                              |

No spec sections left without a task.

**Placeholder scan:** Plan body contains `[PLACEHOLDER: …]` strings only inside code blocks that ARE the page implementations — those are intentional content markers, not unfinished plan sections. No TBD/TODO/FIXME/XXX in plan prose.

**Type/identifier consistency:**

- `Footer` (named export) consistent across Task 1 implementation, Task 1 test, Task 1 layout import.
- `LegalPageLayout` (named export) consistent across Task 2 implementation, Task 2 test, all 5 page imports.
- `LegalPageLayoutProps.lastUpdated?: string` consistent in Task 2 type + Task 7 Contact omission.
- Page component default exports named `TermsPage`, `PrivacyPage`, `RefundPage`, `ShippingPage`, `ContactPage` — consistent across each page file and the render.test.tsx imports/cases arrays in Tasks 3, 4, 5, 6, 7, 8.
- Page titles: `"Terms of Service"`, `"Privacy Policy"`, `"Refund and Return Policy"`, `"Shipping and Delivery Policy"`, `"Contact Us"` — consistent across the page JSX (h1 via `LegalPageLayout`'s `title` prop) and the test `cases` arrays.
- Footer constants `SUPPORT_EMAIL`, `BUSINESS_ADDRESS` — consistent in Task 1 implementation + Task 8 fill instructions.
- Placeholder names — consistent across Task 8 master list, spec §8, and individual page-task descriptions.
- Test command `pnpm --filter @bomy/web test` (no `--run`) — used everywhere per Charlie's correction.

No inconsistencies detected.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-pr38-hitpay-review-readiness.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per Task 1–7, two-stage review (spec compliance then code quality) between each. Tasks 8–12 are human-gated (Charlie's pre-merge fill, Bob R0 review, Charlie's "Merge now", post-merge bookkeeping) so Andy handles those inline in this session regardless of the choice for 1–7.

**2. Inline Execution** — Andy executes Tasks 1–12 in this session using executing-plans, with natural checkpoints at the end of each task and at the Task 7→8 handoff to Charlie.

For PR #38: Tasks 1–7 are mechanical implementation with full code in every step + per-task test gates; subagent-driven gives independent review surface and preserves this session's context. Tasks 8 onwards require Charlie's judgment and inline-only execution.

Recommendation: **1 — Subagent-Driven for Tasks 1–7; inline for Tasks 8–12.** Same pattern as PR #37.
