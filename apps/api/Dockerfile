# Build context must be the monorepo root (repo root = app/).
# In Railway: Root Directory = . , Dockerfile Path = apps/api/Dockerfile

# ── Stage 1: install deps ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Workspace manifests — all members must be present so pnpm can resolve the
# lockfile. Source files are NOT needed here; only package.json files.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json   apps/api/
COPY apps/web/package.json   apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/db/package.json      packages/db/
COPY packages/hitpay/package.json  packages/hitpay/
COPY packages/mailer/package.json  packages/mailer/
COPY packages/config/package.json  packages/config/
COPY packages/shared/package.json  packages/shared/

RUN pnpm install --frozen-lockfile

# ── Stage 2: bundle with esbuild ──────────────────────────────────────────────
FROM deps AS builder

# Copy workspace package source (esbuild bundles them inline via pnpm symlinks)
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm --filter @bomy/api build

# ── Stage 3: minimal runtime (single bundled file, no node_modules) ───────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# esbuild produces one self-contained file; no node_modules required at runtime
COPY --from=builder /app/apps/api/dist/index.js ./

EXPOSE 3001

CMD ["node", "index.js"]
