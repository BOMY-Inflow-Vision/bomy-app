# BOMY

**BOMY ("Brands of Malaysia")** is a curated multivendor e-commerce marketplace for Malaysian
brands, live at **brandsofmalaysia.com**. Buyers browse seller storefronts and buy products;
sellers apply via a vetted inquiry flow, get their own storefront, and manage products/orders from
a dashboard. Currency is MYR today (bigint sen); USD/international is a roadmap item.

© 2026 Charlie Kong. All rights reserved. Proprietary and confidential — not licensed for distribution or reuse.

## Documentation

- **`PROJECT.md`** — architecture and how the pieces fit together.
- **`GAPS.md`** — severity-ordered audit of known weaknesses.
- Proposal v2 and project memory live outside this repo in the BOMY project root (`../20260419_andy_bomy_proposal_v2.md`).

## Local Development

### Requirements

- **Node.js 24 LTS** — version pinned in `.nvmrc`. Install via [nvm](https://github.com/nvm-sh/nvm).
- **pnpm 10** — enabled via [Corepack](https://nodejs.org/api/corepack.html) (ships with Node 24).
- **Docker Desktop** — runs Postgres 16, Redis 7, MinIO, and Mailhog locally.

### Quickstart

```sh
# 1. Pin Node version
nvm use

# 2. Enable the correct pnpm version (pinned in package.json)
corepack enable

# 3. Install all workspace dependencies
pnpm install

# 4. Configure local secrets (edit the file after copying)
cp infra/docker/.env.example infra/docker/.env

# 5. Configure app runtimes (edit each file after copying)
cp apps/api/.env.local.example apps/api/.env.local
cp apps/web/.env.local.example apps/web/.env.local
cp apps/admin/.env.local.example apps/admin/.env.local

# 6. Start infrastructure services (Postgres, Redis, MinIO, Mailhog)
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d

# 7. Apply DB migrations (migrate.mjs reads DATABASE_URL directly, not from the .env files above)
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy pnpm --filter @bomy/db migrate

# 8. Start all apps in watch mode
pnpm dev
```

| Service         | Local URL             |
| --------------- | --------------------- |
| Web (Next.js)   | http://localhost:3000 |
| API (Fastify)   | http://localhost:3001 |
| Admin (Next.js) | http://localhost:3002 |
| MinIO console   | http://localhost:9001 |
| Mailhog inbox   | http://localhost:8025 |

> **MinIO first-time setup:** after step 6, open http://localhost:9001 and log in with the credentials from `infra/docker/.env`. Create a bucket named `bomy-local`.

### Other commands

```sh
pnpm typecheck   # TypeScript type checking across all packages
pnpm lint        # ESLint across all packages
pnpm test        # Run all test suites
pnpm build       # Production build
```

### Environment variable reference

See `.env.example` at the repo root for a full listing of every variable used across all apps and services.

## Status

Live in production at **brandsofmalaysia.com** (web on Vercel, admin on Vercel at
`admin.brandsofmalaysia.com`, API on Railway). Stages 1–5 (platform foundation, auth, stores,
membership/billing, products/orders) are complete; see `PROJECT.md` for the full picture and
`GAPS.md` for known gaps. `checkout_enabled` stays `false` in `platform_config` until a PSP live
smoke passes (see `docs/runbooks/checkout-enabled-flip.md`).
