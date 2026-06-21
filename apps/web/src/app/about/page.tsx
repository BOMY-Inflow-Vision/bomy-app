import type { Metadata } from "next"
import React from "react"

export const metadata: Metadata = {
  title: "BOMY — Brands of Malaysia | Discover Local Brands",
  description:
    "BOMY is the curated home for authentic Malaysian brands. Discover quality local makers, join the BOMY community, and back the brands you love.",
}

const reasons = [
  {
    title: "Great products stay hidden.",
    body: "Brilliant local makers have the craft but rarely the marketing reach. Without exposure, their best work never finds the people who would love it.",
  },
  {
    title: "Growth is too costly to go it alone.",
    body: "Reaching new customers — and breaking into wider markets — takes resources most small brands simply don't have. The barriers are real, and they hold good brands back.",
  },
  {
    title: "Stronger together.",
    body: "Under one trusted umbrella, Malaysian brands gain the exposure, infrastructure, and audience they couldn't reach alone — and shoppers gain a single, trusted place to find them.",
  },
]

const pillars = [
  {
    title: "A curated marketplace",
    body: "We don't list everything — we curate. Every brand earns its place and gets a dedicated space to tell its story, philosophy, and craft. That means less time sifting and less risk for you, and the confidence that what you're discovering is the real, quality-driven thing.",
  },
  {
    title: "Membership & community",
    body: "Become a BOMY member and join a community of people who love discovering and backing local. Members enjoy a quarterly curated BOMY Goodie Box, early access to new launches and promotions, member-only vouchers, and a seat in our feedback community. It's more than perks — it's belonging to a movement that supports local.",
  },
  {
    title: "Shop with purpose",
    body: "Shopping on BOMY is designed to back homegrown brands and the people behind them. It's a way to celebrate Malaysian makers, support the local economy, and feel good about where your discovery leads.",
  },
]

export default function AboutPage() {
  return (
    <main className="bg-white">
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            The home of authentic Malaysian brands.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            We bring Malaysia&rsquo;s best-loved makers together under one trusted roof — for
            shoppers here and around the world.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Our mission
        </h2>
        <p className="mt-4 text-xl leading-relaxed text-slate-800">
          We aggregate, amplify, and accelerate the growth of Malaysia&rsquo;s homegrown brands. Too
          many world-class local makers stay hidden behind the cost and complexity of reaching new
          customers. BOMY brings them together under one trusted name — connecting authentic,
          quality-driven Malaysian brands with the people who want to discover and support them, at
          home and abroad.
        </p>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-bold text-slate-900">Why BOMY exists</h2>
          <p className="mt-3 max-w-3xl text-slate-600">
            Malaysia is full of world-class brands, but the people who build them face the same
            uphill climb. We exist to turn those individual struggles into collective strength.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
            {reasons.map((r) => (
              <div key={r.title}>
                <h3 className="font-semibold text-slate-900">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-2xl font-bold text-slate-900">How it works</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-slate-900">
            Built for Malaysian brands ready to grow.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            We take the cost and complexity out of growth marketing, giving Malaysian SMEs the
            exposure, infrastructure, and audience to reach more customers under one powerful
            umbrella. If you&rsquo;re building something worth discovering, we&rsquo;d love to help
            the world find it.
          </p>
          <a
            href="/seller/apply"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Become a seller
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Discover what Malaysia makes.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          Join the community backing local brands — and the makers building them.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/products"
            className="inline-block rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Shop the marketplace
          </a>
          <a
            href="/seller/apply"
            className="inline-block rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            Become a seller
          </a>
        </div>
      </section>
    </main>
  )
}
