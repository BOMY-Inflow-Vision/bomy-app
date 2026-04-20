# BOMY

BOMY is a curated Consortium platform (Collective + Media + Resource Hub) for Malaysia (MYR) and international (USD) buyers.

© 2026 Charlie Kong. All rights reserved. Proprietary and confidential — not licensed for distribution or reuse.

## Documentation

- Proposal v2 and project memory live outside this repo in the BOMY project root (`../20260419_andy_bomy_proposal_v2.md`).
- Architecture Decision Records will be added under `docs/adrs/` during Stage 0.

## Local Development

_Quickstart lands in PR #2 (root tooling) and PR #3 (Docker Compose). Placeholder below._

### Requirements

- **Node.js 20 LTS** — pinned via `.nvmrc`. Run `nvm use` at the repo root.
- **pnpm** — enable via `corepack enable` (pnpm version is pinned in `package.json` once PR #2 lands).
- **Docker Desktop** — required for local Postgres + Redis + MinIO + Mailhog (arrives in PR #3).

### Quickstart (coming soon)

```sh
nvm use
corepack enable
pnpm install
docker compose up -d
pnpm dev
```

## Status

Stage 1 — Platform Foundation. The 9-PR Stage 1 plan is tracked in the proposal (Section 19).
