import Link from "next/link"
import React from "react"

const CONTACT_EMAIL = "contact@brandsofmalaysia.com"
const BUSINESS_ADDRESS =
  "19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang."

const LINK_CLASS =
  "inline-block rounded-sm py-1 text-ink-muted hover:text-ink-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-foreground"
const LABEL_CLASS = "font-mono text-xs uppercase tracking-[0.16em] text-ink-muted"

/**
 * A dark rounded card on the page ground. The ink colours are the same in both themes. The giant
 * BOMY wordmark is decoration (hidden from screen readers) and is cropped by its own box.
 */
export function Footer() {
  return (
    <footer className="mt-16 px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-bento bg-ink px-6 pt-10 text-ink-foreground sm:rounded-[2.5rem] md:px-12 md:pt-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-2xl font-bold tracking-tight text-ink-foreground">
              BOMY
            </p>
            <p className="mt-3 text-sm text-ink-muted">
              A curated Malaysian multivendor marketplace.
            </p>
            <p className="mt-6 text-sm text-ink-muted">BOMY by Inflo Vision (202503276795)</p>
            <p className="mt-2 text-sm text-ink-muted">
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="rounded-sm hover:text-ink-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-foreground"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p className="mt-2 text-sm text-ink-muted">Address: {BUSINESS_ADDRESS}</p>
          </div>
          <div>
            <p className={LABEL_CLASS}>Quick Links</p>
            <ul className="-mb-1 mt-2 text-sm">
              <li>
                <Link href="/about" className={LINK_CLASS}>
                  About BOMY
                </Link>
              </li>
              <li>
                <Link href="/contact" className={LINK_CLASS}>
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className={LABEL_CLASS}>Policies</p>
            <ul className="-mb-1 mt-2 text-sm">
              <li>
                <Link href="/terms" className={LINK_CLASS}>
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={LINK_CLASS}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/refund" className={LINK_CLASS}>
                  Refund and Return
                </Link>
              </li>
              <li>
                <Link href="/shipping" className={LINK_CLASS}>
                  Shipping and Delivery
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="mt-10 flex h-[0.62em] select-none justify-between overflow-hidden font-display text-[clamp(5rem,24vw,24rem)] font-bold leading-[0.8] tracking-tighter text-ink-foreground md:mt-16"
        >
          {Array.from("BOMY").map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </div>
        <div className="border-t border-ink-foreground/15 py-6">
          <p className="text-xs text-ink-muted">© 2026 BOMY. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
