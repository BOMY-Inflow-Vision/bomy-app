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
          <a href="mailto:contact@brandsofmalaysia.com" className="text-foreground underline">
            contact@brandsofmalaysia.com
          </a>
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Business address</h2>
        <p>19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Operating hours</h2>
        <p>Monday to Friday, 9am – 6pm Malaysia Time (UTC+8), excluding public holidays.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Response time</h2>
        <p>We aim to respond within 2 business days.</p>
      </section>
    </LegalPageLayout>
  )
}
