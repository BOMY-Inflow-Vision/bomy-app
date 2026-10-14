import Link from "next/link"
import React from "react"

const CONTACT_EMAIL = "contact@brandsofmalaysia.com"
const BUSINESS_ADDRESS =
  "19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang."

export function Footer() {
  return (
    <footer className="mt-16 border-t border-subtle bg-muted">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="text-2xl font-bold tracking-tight text-foreground">BOMY</p>
            <p className="mt-3 text-sm text-muted-foreground">
              A curated Malaysian multivendor marketplace.
            </p>
            <p className="mt-6 text-sm text-muted-foreground">
              BOMY by Inflo Vision (202503276795)
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Email:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Address: {BUSINESS_ADDRESS}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick Links
            </p>
            <ul className="mt-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/about"
                  className="inline-block rounded-sm py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  About BOMY
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="inline-block rounded-sm py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Policies
            </p>
            <ul className="mt-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/terms"
                  className="inline-block rounded-sm py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="inline-block rounded-sm py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/refund"
                  className="inline-block rounded-sm py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Refund and Return
                </Link>
              </li>
              <li>
                <Link
                  href="/shipping"
                  className="inline-block rounded-sm py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Shipping and Delivery
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-subtle pt-6">
          <p className="text-xs text-muted-foreground">© 2026 BOMY. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
