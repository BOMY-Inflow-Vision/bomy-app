# Build context must be the monorepo root (repo root = app/).
# In Railway: Root Directory = . , Dockerfile Path = apps/admin/Dockerfile

# ── Stage 1: install deps ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Workspace manifests — all members must be present so pnpm can resolve the
# lockfile. Source files are NOT needed here; only package.json files.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY apps/admin/package.json  apps/admin/
COPY apps/api/package.json    apps/api/
COPY apps/web/package.json    apps/web/
COPY packages/db/package.json      packages/db/
COPY packages/hitpay/package.json  packages/hitpay/
COPY packages/mailer/package.json  packages/mailer/
COPY packages/config/package.json  packages/config/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Next.js build ────────────────────────────────────────────────────
FROM deps AS builder

# Copy workspace package source (Next.js transpilePackages compiles them inline)
COPY packages/ packages/
COPY apps/admin/ apps/admin/

RUN pnpm --filter @bomy/admin build

# ── Stage 3: minimal standalone runtime ───────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Next.js standalone output includes the server + all traced node_modules.
# Static and public dirs must be copied alongside the standalone tree.
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static     ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public           ./apps/admin/public

EXPOSE 3002

# Railway injects PORT at runtime; Next.js standalone server.js reads it.
CMD ["node", "apps/admin/server.js"]
