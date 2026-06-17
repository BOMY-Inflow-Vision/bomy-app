import React from "react"

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
          seller dashboard terms. See the seller onboarding flow and the seller dashboard terms for
          the current fee schedule.
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
          These terms are governed by the laws of Malaysia. The courts of Pulau Pinang have
          exclusive jurisdiction over any dispute arising out of or relating to the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:contact@brandsofmalaysia.com" className="text-slate-900 underline">
            contact@brandsofmalaysia.com
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
