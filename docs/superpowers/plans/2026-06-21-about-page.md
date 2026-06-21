# /about Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public `/about` page for apps/web that tells BOMY's mission and how the platform works, plus a footer link to it.

**Architecture:** A single static Next.js App Router server component at `apps/web/src/app/about/page.tsx` rendering six stacked sections with Tailwind utilities (slate palette, matching `Footer`). No data fetching, no client JS. The site-wide `Footer` (mounted in root `app/layout.tsx`) renders automatically; we add an "About" link to it. Two `renderToStaticMarkup` render tests guard copy + CTA routing.

**Tech Stack:** Next.js 15 App Router, React 19 server components, Tailwind CSS, Vitest (`renderToStaticMarkup` from `react-dom/server`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-21-about-page-design.md` is the source of truth for all copy. Use it verbatim.
- **Company voice:** body copy says "BOMY"/"we"; **never** the string `Inflo Vision` (legal entity lives only in the footer).
- **Anchored in what's live:** no egg/mascot/"Hatch & Collect" gamification, no BOMY Studio, no paid Collective, no financials/funding/projections, no founder names, no specific prices.
- **Shopper CTA target is `/products`** (the live catalog). **Never link `/brands`** — it has no index page (only `/brands/[slug]`) and would 404. Brand CTA target is `/seller/apply`.
- **Membership naming:** neutral "BOMY member / community" — not "BOMY Insider".
- **Checkout is paused** (`checkout_enabled=false`): the "Shop with purpose" card uses present-tense "designed to / a way to" framing — no "every order" / "when you buy".
- **Links use plain `<a href>`** (matches the existing `Footer` convention).
- **JSX text escaping:** apostrophes/quotes inside JSX _text_ must be HTML entities (e.g. `&rsquo;`) to satisfy `react/no-unescaped-entities`; em dashes (`—`) are fine. Copy inside JS string arrays (rendered via `{expr}`) keeps plain apostrophes.
- **Branch:** continue on `feat/about-page` (the spec is already committed there).

---

### Task 1: About page + render test

**Files:**

- Create: `apps/web/src/app/about/page.tsx`
- Test: `apps/web/tests/about/render.test.tsx`

**Interfaces:**

- Consumes: nothing (leaf page).
- Produces: default export `AboutPage` (React server component, no props) and a named `metadata` export at route `/about`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/about/render.test.tsx`:

```tsx
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import AboutPage from "@/app/about/page"

describe("About page", () => {
  const html = renderToStaticMarkup(<AboutPage />)

  it("renders the hero headline in an h1", () => {
    expect(html).toContain("<h1")
    expect(html).toContain("The home of authentic Malaysian brands.")
  })

  it("renders the three 'how it works' pillars", () => {
    expect(html).toContain("A curated marketplace")
    expect(html).toContain("Membership &amp; community")
    expect(html).toContain("Shop with purpose")
  })

  it("points the shopper CTA at /products and the brand CTA at /seller/apply", () => {
    expect(html).toContain('href="/products"')
    expect(html).toContain('href="/seller/apply"')
  })

  it("never links to the non-existent /brands index", () => {
    expect(html).not.toContain('href="/brands"')
  })

  it("does not describe the unbuilt egg/mascot gamification", () => {
    expect(html).not.toContain("Hatch")
    expect(html).not.toContain("mascot")
  })

  it("does not name the legal entity in body copy", () => {
    expect(html).not.toContain("Inflo Vision")
  })

  it("has no unfilled [PLACEHOLDER: ...] markers", () => {
    expect(html).not.toContain("[PLACEHOLDER:")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bomy/web test tests/about/render.test.tsx --run`
Expected: FAIL — cannot resolve `@/app/about/page` (module does not exist yet).

- [ ] **Step 3: Write the page**

Create `apps/web/src/app/about/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bomy/web test tests/about/render.test.tsx --run`
Expected: PASS — 7/7.

- [ ] **Step 5: Typecheck + lint the new files**

Run: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web exec eslint src/app/about/page.tsx tests/about/render.test.tsx --max-warnings 0`
Expected: no errors. (If `react/no-unescaped-entities` fires, replace the offending `'`/`"` in JSX _text_ with `&rsquo;`/`&ldquo;`/`&rdquo;` and re-run.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/about/page.tsx apps/web/tests/about/render.test.tsx
git commit -m "feat(web): add public /about page"
```

---

### Task 2: Footer "About" link

**Files:**

- Modify: `apps/web/src/components/footer.tsx` (first/brand column)
- Test: `apps/web/tests/components/footer.test.tsx`

**Interfaces:**

- Consumes: existing `Footer` component (no signature change).
- Produces: an `<a href="/about">About BOMY</a>` inside the footer's brand column.

- [ ] **Step 1: Add the failing test assertion**

In `apps/web/tests/components/footer.test.tsx`, add this `it` block inside the existing `describe("Footer", ...)` (after the "renders all 5 policy links" test):

```tsx
it("renders the About link", () => {
  expect(html).toContain('href="/about"')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bomy/web test tests/components/footer.test.tsx --run`
Expected: FAIL — "renders the About link" — html does not contain `href="/about"`.

- [ ] **Step 3: Add the link to the footer**

In `apps/web/src/components/footer.tsx`, replace the brand column block:

```tsx
<div>
  <p className="text-2xl font-bold tracking-tight text-slate-900">BOMY</p>
  <p className="mt-3 text-sm text-slate-600">A curated Malaysian multivendor marketplace.</p>
</div>
```

with:

```tsx
<div>
  <p className="text-2xl font-bold tracking-tight text-slate-900">BOMY</p>
  <p className="mt-3 text-sm text-slate-600">A curated Malaysian multivendor marketplace.</p>
  <a
    href="/about"
    className="mt-3 inline-block text-sm text-slate-700 hover:text-slate-900 hover:underline"
  >
    About BOMY
  </a>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bomy/web test tests/components/footer.test.tsx --run`
Expected: PASS — all footer tests including "renders the About link".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/footer.tsx apps/web/tests/components/footer.test.tsx
git commit -m "feat(web): link /about from the site footer"
```

---

### Task 3: Full verification + PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Run the full web typecheck + lint**

Run: `pnpm --filter @bomy/web exec tsc --noEmit && pnpm --filter @bomy/web lint`
Expected: no errors, 0 warnings.

- [ ] **Step 2: Run both new test files together**

Run: `pnpm --filter @bomy/web test tests/about/render.test.tsx tests/components/footer.test.tsx --run`
Expected: all PASS.

- [ ] **Step 3: Visual smoke against local dev**

Start dev (see `MACHINE_PICKUP.md` step 6 env block) if not running, then:

```bash
curl -s -o /dev/null -w 'about %{http_code}\n' http://localhost:3000/about   # expect 200
```

Open `http://localhost:3000/about` and confirm: all six sections render, the site footer appears below with a working "About BOMY" link, "Shop the marketplace" routes to `/products`, and "Become a seller" routes to `/seller/apply`.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/about-page
gh pr create --base main --head feat/about-page \
  --title "feat(web): public /about page" \
  --body "Adds the public /about page (mission + how-it-works, anchored in live features) and a footer link. Copy per docs/superpowers/specs/2026-06-21-about-page-design.md. Render tests guard CTA routing (/products + /seller/apply, never /brands) and the live-only guardrails (no egg/mascot, no Inflo Vision in body). Model: Opus 4.8."
```

Expected: PR opens; CI (test/typecheck/lint) green. Andy does not self-merge — Bob/Charlie review.

---

## Notes for the implementer

- The page is a **server component** — no `"use client"`, no hooks, no async.
- Do **not** render `<Footer />` in the page; it is already in `app/layout.tsx`.
- If `react/no-unescaped-entities` flags JSX text, fix with HTML entities (the `reasons`/`pillars` array strings are JS literals rendered via `{expr}` and do **not** need escaping; only inline JSX text does).
- Render tests need no DB env (pure component render).
