// PDPA refs (for next reviewer / counsel):
//   Act 709: https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/
//   Amendment Act 2024: https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-amendment-act-2024/
//   Cookie scope (DataGuidance): https://www.dataguidance.com/notes/malaysia-cookies-similar-technologies

import React from "react"

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
          Inflo Vision (Partnership), Malaysia. Registration: 202503276795. Address: 19-2, Lorong
          Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang. Privacy contact:{" "}
          <a href="mailto:contact@brandsofmalaysia.com" className="text-foreground underline">
            contact@brandsofmalaysia.com
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
          <li>Payment processing: a licensed payment service provider</li>
          <li>Shipping and delivery: Pos Laju</li>
          <li>Support tooling: email-based customer support managed by Inflo Vision</li>
          <li>Hosting and infrastructure: our cloud infrastructure provider</li>
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
          Account data is retained while the account is active and for 24 months after the last
          sign-in. Inactive accounts are flagged for deletion after 36 months. Order records are
          retained for 7 years in line with tax and accounting requirements.
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
          We respond to data-protection inquiries within 7 business days. You may contact us first;
          if your concern remains unresolved, you may contact the Personal Data Protection
          Commissioner.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Data breach process</h2>
        <p>
          Material breaches are reported to affected users and to the Department of Personal Data
          Protection in accordance with the notification requirements of the Act. Breach contact:
          contact@brandsofmalaysia.com.
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
          <a href="mailto:contact@brandsofmalaysia.com" className="text-foreground underline">
            contact@brandsofmalaysia.com
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
