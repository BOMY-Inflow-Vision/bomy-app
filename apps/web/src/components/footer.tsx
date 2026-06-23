import React from "react"

const CONTACT_EMAIL = "contact@brandsofmalaysia.com"
const BUSINESS_ADDRESS =
  "19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang."

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="text-2xl font-bold tracking-tight text-slate-900">BOMY</p>
            <p className="mt-3 text-sm text-slate-600">
              A curated Malaysian multivendor marketplace.
            </p>
            <p className="mt-6 text-sm text-slate-700">BOMY by Inflo Vision (202503276795)</p>
            <p className="mt-2 text-sm text-slate-700">
              Email:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-slate-900 hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
            <p className="mt-2 text-sm text-slate-700">Address: {BUSINESS_ADDRESS}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Quick Links
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>
                <a href="/about" className="hover:text-slate-900 hover:underline">
                  About BOMY
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-slate-900 hover:underline">
                  Contact
                </a>
              </li>
            </ul>
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
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6">
          <p className="text-xs text-slate-500">© 2026 BOMY. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
