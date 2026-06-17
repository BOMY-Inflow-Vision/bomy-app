import React from "react"

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
        <p>You have 7 days from the date of delivery to initiate a return for an eligible item.</p>
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
          Contact the seller via BOMY first. If the seller has not responded within 3 business days,
          you may escalate to BOMY support for assistance.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. Refund method and timeline</h2>
        <p>
          Approved refunds are returned to the original payment method within 7 business days of the
          seller receiving the returned item.
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
        <p className="mt-3">
          Statutory exceptions: rights under the Consumer Protection Act 1999 (Malaysia) and other
          applicable consumer laws.
        </p>
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
          <a href="mailto:contact@brandsofmalaysia.com" className="text-slate-900 underline">
            contact@brandsofmalaysia.com
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  )
}
