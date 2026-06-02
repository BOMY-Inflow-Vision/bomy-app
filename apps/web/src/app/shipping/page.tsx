import React from "react"

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
          Orders are dispatched within 1-3 business days of payment confirmation, subject to seller
          cut-off times.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Delivery estimates</h2>
        <ul className="ml-6 list-disc space-y-1">
          <li>West Malaysia: 2-4 business days.</li>
          <li>East Malaysia: 4-7 business days.</li>
          <li>International: 7-21 business days.</li>
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
          <a href="mailto:contact@bomy.my" className="text-slate-900 underline">
            contact@bomy.my
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
