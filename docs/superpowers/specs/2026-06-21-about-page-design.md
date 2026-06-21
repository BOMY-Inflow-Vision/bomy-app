# Design — Public `/about` page

**Date:** 2026-06-21
**Author:** Andy (Opus 4.8), copy by professional-copywriter subagent
**Status:** Revised per Bob's review (2026-06-21) — 3 fixes applied; ready for implementation plan on Charlie's go

## Overview

A public **About** page at `/about` telling BOMY's mission and how the platform
works, anchored only in what is live today. Lightweight designed page (a few
intentional sections in existing Tailwind patterns) — more inviting than the
legal pages, but tight in scope. Closes the launch-backlog `/about` item.

## Decisions (locked during brainstorming)

1. **Positioning:** Mission + what's live only. Tells the "window to Malaysian
   brands" story, anchored in the curated marketplace, membership/community, and
   purpose-driven local shopping. **Excludes** the broader business-plan vision
   that isn't built: the BOMY Studio content arm, the paid BOMY Collective
   partner network, and the egg/mascot gamification (not yet implemented in
   web/API/DB — must not be described as a live feature).
2. **Format:** Lightweight designed page (custom simple layout), **not**
   `LegalPageLayout`. Reuses the site-wide `Footer`.
3. **Company voice:** BOMY speaks as the company ("we" / "BOMY"). **Inflo Vision
   is never named in body copy** — it stays only in the footer's business-identity
   block for legal compliance.
4. **Excluded content (hard guardrails):** no financials, no funding/investment
   ask, no revenue projections, no founder/team names or bios (the plan only has
   placeholders), no specific prices/fees/percentages (pricing lives on
   `/membership` and the plan's numbers have drifted from the live model).
5. **Spelling:** Malaysian / British English (e.g. "fulfilment", "personalise"),
   matching existing copy.

## Build notes

- **Route:** new `apps/web/src/app/about/page.tsx` — server component, static
  (no data fetching). No new dependencies, no new design system.
- **Layout:** custom section layout using the Tailwind utility patterns already
  in the codebase (e.g. `mx-auto max-w-6xl px-4`, slate palette as in `Footer`).
- **Footer:** site-wide `Footer` renders below automatically. Add an **"About"**
  link to the footer — as a link under the brand blurb in the first column (the
  "Policies" list is the wrong home since About isn't a policy).
- **CTA targets:** shopper CTA → `/products` (the live catalog page); brand CTA
  → `/seller/apply`. Both exist. **`/brands` has no index page** (only
  `/brands/[slug]`), so it must not be used as a CTA target.
- **SEO:** export Next.js `metadata` (title + description below).
- **Out of scope:** imagery/photography, stats bands, brand carousels,
  testimonials (those belong to the future, currently-unscheduled UI/UX stage);
  any header-nav link to `/about` (footer link only for now).

## Page structure + approved copy

Hero uses **Option A** (recommended); B/C retained as alternatives for Charlie.

### Meta

- **Title:** `BOMY — Brands of Malaysia | Discover Local Brands`
- **Description:** `BOMY is the curated home for authentic Malaysian brands. Discover quality local makers, join the BOMY community, and back the brands you love.`

### 1. Hero

- **Headline (A, chosen):** The home of authentic Malaysian brands.
- **Subhead:** We bring Malaysia's best-loved makers together under one trusted roof — for shoppers here and around the world.
- _Alt B:_ "Malaysia makes incredible brands. We help you find them." / "A curated marketplace and community celebrating the local makers worth discovering."
- _Alt C:_ "Brands of Malaysia, all in one place." / "Discover quality local brands, back the stories behind them, and belong to something that champions local."

### 2. Our mission

> We aggregate, amplify, and accelerate the growth of Malaysia's homegrown
> brands. Too many world-class local makers stay hidden behind the cost and
> complexity of reaching new customers. BOMY brings them together under one
> trusted name — connecting authentic, quality-driven Malaysian brands with the
> people who want to discover and support them, at home and abroad.

### 3. Why BOMY exists

Lead: _Malaysia is full of world-class brands, but the people who build them face
the same uphill climb. We exist to turn those individual struggles into collective
strength._

- **Great products stay hidden.** Brilliant local makers have the craft but rarely the marketing reach. Without exposure, their best work never finds the people who would love it.
- **Growth is too costly to go it alone.** Reaching new customers — and breaking into wider markets — takes resources most small brands simply don't have. The barriers are real, and they hold good brands back.
- **Stronger together.** Under one trusted umbrella, Malaysian brands gain the exposure, infrastructure, and audience they couldn't reach alone — and shoppers gain a single, trusted place to find them.

### 4. How it works (3 cards)

- **A curated marketplace** — We don't list everything — we curate. Every brand earns its place and gets a dedicated space to tell its story, philosophy, and craft. That means less time sifting and less risk for you, and the confidence that what you're discovering is the real, quality-driven thing.
- **Membership & community** — Become a BOMY member and join a community of people who love discovering and backing local. Members enjoy a quarterly curated BOMY Goodie Box, early access to new launches and promotions, member-only vouchers, and a seat in our feedback community. It's more than perks — it's belonging to a movement that supports local.
- **Shop with purpose** — Every order backs a homegrown brand and the people behind it. When you buy on BOMY you're not just getting something you'll love — you're helping a Malaysian maker grow and keeping the local economy thriving.

### 5. For brands

- **Heading:** Built for Malaysian brands ready to grow.
- **Body:** We take the cost and complexity out of growth marketing, giving Malaysian SMEs the exposure, infrastructure, and audience to reach more customers under one powerful umbrella. If you're building something worth discovering, we'd love to help the world find it.
- **CTA button:** Become a seller → `/seller/apply`

### 6. Final CTA

- **Heading:** Discover what Malaysia makes.
- **Support line:** Join the community backing local brands — and the makers building them.
- **Button (shoppers):** Shop the marketplace → `/products`
- **Button (brands):** Become a seller → `/seller/apply`

## Testing

- The page is static content; no integration test required. A lightweight render
  test (renders without throwing, key headings present, CTA hrefs correct) is
  optional and sufficient.
- `pnpm --filter @bomy/web typecheck` + `lint` must pass; visual smoke via local
  dev (`/about` renders, footer link works, both CTAs route correctly).
