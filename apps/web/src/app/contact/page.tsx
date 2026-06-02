import React from "react"

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
