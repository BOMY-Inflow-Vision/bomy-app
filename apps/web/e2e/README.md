# E2E smoke spec (GAPS.md #10)

One Playwright spec, three checks: sign-in page renders, storefront lists a seeded product,
`/seller/apply` shows the Turnstile widget. Deliberately narrow — expand later, don't boil the
ocean.

## Prerequisites

- Docker infra up: `docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d`
- `apps/web/.env.local` configured (`DATABASE_URL` + the committed Turnstile test sitekey are
  enough; see `.env.local.example`)

## Run

```sh
pnpm --filter @bomy/web test:e2e
```

Reuses an already-running `pnpm dev` on `localhost:3000` if there is one; otherwise
`playwright.config.ts` starts `apps/web`'s own `next dev` and tears it down after. `global-setup.ts`
seeds a fixed-slug store/category/product/variant before the run and deletes them after — safe to
re-run, and safe if a previous run crashed mid-way (cleanup runs before seeding too).

## Why this isn't wired into CI

GAPS.md #10 scopes this to local `pnpm dev` + Docker. Running it in CI would need a live dev server
plus browser binaries in that job, meaningfully more infra than this fix's scope — left as a
deliberate follow-up, not done here.
