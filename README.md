# BOMY

BOMY is a curated Consortium platform (Collective + Media + Resource Hub) for Malaysia (MYR) and international (USD) buyers.

© 2026 Charlie Kong. All rights reserved. Proprietary and confidential — not licensed for distribution or reuse.

## Documentation

- Proposal v2 and project memory live outside this repo in the BOMY project root (`../20260419_andy_bomy_proposal_v2.md`).
- Architecture Decision Records will be added under `docs/adrs/` during Stage 0.

## Local Development

### Requirements

- **Node.js 20 LTS** — version pinned in `.nvmrc`. Install via [nvm](https://github.com/nvm-sh/nvm).
- **pnpm 10** — enabled via [Corepack](https://nodejs.org/api/corepack.html) (ships with Node 20).
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

# 6. Start infrastructure services (Postgres, Redis, MinIO, Mailhog)
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d

# 7. Start all apps in watch mode
pnpm dev
```

| Service       | Local URL             |
| ------------- | --------------------- |
| Web (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3001 |
| MinIO console | http://localhost:9001 |
| Mailhog inbox | http://localhost:8025 |

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

Stage 1 — Platform Foundation complete. All scaffold PRs merged. Next: PR #8 (CI) and PR #9 (E2E verification).
