# PR #35 — `@bomy/mailer` Package + Remaining Notification Stubs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `@bomy/mailer` workspace package, then wire the three remaining email flows (seller inquiry on web, voucher issuance on api, payout-created on admin) using it.

**Architecture:** A new `packages/mailer` workspace owns the `createMailer` factory, `configFromEnv` env parser, and shared helpers (`parseOpsEmails`, `joinUrl`). `apps/api/src/lib/mailer.ts` becomes a thin compatibility re-export shim; `apps/api/src/plugins/mailer.ts` uses the shared `configFromEnv`. Next.js apps (`apps/web`, `apps/admin`) instantiate lazy singletons mirroring `getDb()`, with a try/catch fallback to a disabled no-op mailer so server actions never 500 on misconfigured SMTP env. Voucher dispatch is delegated to a `dispatchVoucherEmails` helper in `apps/api/src/notifications/voucher.ts` so the loop, skip-log, and summary are testable directly.

**Tech Stack:** TypeScript (strict, NodeNext), pnpm workspaces + Turborepo, vitest, Drizzle ORM, Fastify (pino logger), Next.js 15 App Router server actions, nodemailer, Mailhog for local SMTP.

**Spec:** `docs/superpowers/specs/2026-05-25-pr35-mailer-package-stubs.md`

---

## File Structure

### Created files (20)

```
packages/mailer/package.json
packages/mailer/tsconfig.json
packages/mailer/src/index.ts                     # public exports
packages/mailer/src/mailer.ts                    # createMailer factory (moved from apps/api/src/lib/mailer.ts)
packages/mailer/src/env.ts                       # configFromEnv(env): MailerConfig
packages/mailer/src/helpers.ts                   # parseOpsEmails, joinUrl
packages/mailer/tests/mailer.test.ts             # moved from apps/api/tests/lib/mailer.test.ts
packages/mailer/tests/env.test.ts                # new
packages/mailer/tests/helpers.test.ts            # moved from apps/api/tests/notifications/order.test.ts (parseOpsEmails + joinUrl cases)
apps/api/src/notifications/voucher.ts            # sendVoucherIssuedEmail + dispatchVoucherEmails
apps/api/tests/notifications/voucher.test.ts
apps/web/src/lib/mailer.ts
apps/web/src/notifications/seller-inquiry.ts
apps/web/tests/lib/mailer.test.ts
apps/web/tests/notifications/seller-inquiry.test.ts
apps/web/tests/seller-inquiries/actions.test.ts
apps/admin/src/lib/mailer.ts
apps/admin/src/notifications/payout.ts
apps/admin/tests/lib/mailer.test.ts
apps/admin/tests/notifications/payout.test.ts
```

### Modified files (15)

```
apps/api/src/lib/mailer.ts                        # → thin re-export shim
apps/api/src/plugins/mailer.ts                    # uses configFromEnv from @bomy/mailer
apps/api/src/notifications/order.ts               # removes local helpers; imports them from @bomy/mailer
apps/api/src/notifications/membership.ts          # Mailer type via shim
apps/api/src/jobs/voucher-issuance.ts             # adds mailer + log params; .returning(...); hydrate tx; delegates to dispatchVoucherEmails
apps/api/src/scheduler.ts                         # extends deps with appLog: JobLogger
apps/api/src/server.ts                            # passes app.log into createScheduler
apps/api/tests/notifications/order.test.ts        # removes parseOpsEmails + joinUrl tests (moved)
apps/api/tests/jobs/voucher-issuance.test.ts      # adds hydrate + dispatch coverage
apps/api/package.json                             # swaps nodemailer for @bomy/mailer workspace dep
apps/web/src/app/seller/apply/actions.ts          # .returning({ id }); awaited sends
apps/web/package.json                             # adds @bomy/mailer workspace dep
apps/admin/src/app/payouts/actions.ts             # hydrate ctx; awaited send on happy path
apps/admin/tests/payouts/actions.test.ts          # extended with email assertions
apps/admin/package.json                           # adds @bomy/mailer workspace dep
.env.example
apps/api/.env.local.example
apps/web/.env.local.example
apps/admin/.env.local.example
pnpm-lock.yaml                                    # via pnpm install
```

### Deleted files (1)

```
apps/api/tests/lib/mailer.test.ts                 # moved to packages/mailer/tests/mailer.test.ts
```

### Verified — no change expected

```
pnpm-workspace.yaml   # already covers apps/* and packages/*
```

---

## Pre-flight: branch + spec commit

### Task 0: Create the PR #35 feature branch and commit the spec

**Files:**

- The spec at `docs/superpowers/specs/2026-05-25-pr35-mailer-package-stubs.md` already exists locally and is untracked.

- [ ] **Step 1:** Verify we are NOT on `main`. From `app/`:

```bash
git branch --show-current
```

If the current branch is anything other than `main` AND the diff vs `main` consists only of carry-forward untracked files (see `.andy/handoff.md` §1 carry-forwards list), switch to `main` first:

```bash
git checkout main
git pull --ff-only
```

- [ ] **Step 2:** Create the PR #35 branch:

```bash
git checkout -b feat/mailer-package-stubs
```

- [ ] **Step 3:** Stage and commit only the spec (carry-forwards stay untracked):

```bash
git add docs/superpowers/specs/2026-05-25-pr35-mailer-package-stubs.md
git commit -m "$(cat <<'EOF'
spec(pr35): replace draft with locked mailer design

Captures the five-section brainstorm: shared @bomy/mailer workspace
package, lazy-singleton try/catch in web/admin, awaited send loop with
dispatchVoucherEmails helper in voucher job, and the three notification
flows (seller-inquiry, voucher-issuance, payout-created).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4:** Verify:

```bash
git log --oneline -3
git status --short
```

Expected: spec commit at HEAD; carry-forward files still untracked / modified.

---

## Phase 1 — Scaffold `packages/mailer` (Tasks 1–5)

### Task 1: Scaffold the package skeleton

**Files:**

- Create: `packages/mailer/package.json`
- Create: `packages/mailer/tsconfig.json`
- Create: `packages/mailer/src/index.ts` (placeholder)

- [ ] **Step 1:** Create `packages/mailer/package.json`:

```json
{
  "name": "@bomy/mailer",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src tests --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "nodemailer": "^8.0.7"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/node": "^20.17.0",
    "@types/nodemailer": "^8.0.0",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2:** Create `packages/mailer/tsconfig.json` (mirrors `packages/hitpay`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": false,
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3:** Create placeholder `packages/mailer/src/index.ts`:

```ts
export {}
```

- [ ] **Step 4:** Install workspaces so pnpm picks up the new package:

```bash
pnpm install
```

Expected: lockfile updates; `node_modules/@bomy/mailer` symlinked.

- [ ] **Step 5:** Commit:

```bash
git add packages/mailer/package.json packages/mailer/tsconfig.json packages/mailer/src/index.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(mailer): scaffold @bomy/mailer workspace package

Mirrors packages/hitpay layout (NodeNext, noEmit, src+tests includes,
hitpay-shape scripts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Move `createMailer` factory and its tests into the package

**Files:**

- Create: `packages/mailer/src/mailer.ts` (content moved from `apps/api/src/lib/mailer.ts`)
- Create: `packages/mailer/tests/mailer.test.ts` (content moved from `apps/api/tests/lib/mailer.test.ts`, with adjusted import path)

- [ ] **Step 1:** Copy current `apps/api/src/lib/mailer.ts` into `packages/mailer/src/mailer.ts` (same content; this is the body of the factory):

```ts
import nodemailer from "nodemailer"

export interface Mailer {
  sendMail(opts: { to: string | string[]; subject: string; text: string }): Promise<void>
  close(): Promise<void>
}

export interface MailerConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
  replyTo?: string
}

export function createMailer(
  config: MailerConfig,
  log: { info(obj: object, msg: string): void },
): Mailer {
  if (!config.enabled) {
    return {
      async sendMail(opts) {
        log.info({ to: opts.to, subject: opts.subject }, "email_notification_skipped")
      },
      async close() {},
    }
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  })

  return {
    async sendMail(opts) {
      await transport.sendMail({
        from: config.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      })
    },
    async close() {
      transport.close()
    },
  }
}
```

- [ ] **Step 2:** Move the test file. Create `packages/mailer/tests/mailer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createMailer } from "../src/mailer.js"

const BASE_CONFIG = {
  enabled: false,
  host: "localhost",
  port: 587,
  secure: false,
  from: "test@brandsofmalaysia.com",
}

describe("createMailer — disabled mode", () => {
  it("resolves without error and does not throw", async () => {
    const mailer = createMailer(BASE_CONFIG, { info: vi.fn() })
    await expect(
      mailer.sendMail({ to: "a@b.com", subject: "Hi", text: "Body" }),
    ).resolves.toBeUndefined()
  })

  it("logs email_notification_skipped with to and subject but not text", async () => {
    const log = vi.fn()
    const mailer = createMailer(BASE_CONFIG, { info: log })
    await mailer.sendMail({ to: "a@b.com", subject: "Hi", text: "SECRET" })
    expect(log).toHaveBeenCalledOnce()
    const call = log.mock.calls[0] as [Record<string, unknown>, string]
    const obj = call[0]
    const msg = call[1]
    expect(msg).toBe("email_notification_skipped")
    expect(obj["to"]).toBe("a@b.com")
    expect(obj["subject"]).toBe("Hi")
    expect(JSON.stringify(obj)).not.toContain("SECRET")
  })

  it("close() resolves without error", async () => {
    const mailer = createMailer(BASE_CONFIG, { info: vi.fn() })
    await expect(mailer.close()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3:** Run tests at the package level:

```bash
pnpm --filter @bomy/mailer test
```

Expected: 3 pass.

- [ ] **Step 4:** Commit (still keep the old `apps/api/src/lib/mailer.ts` for now; it'll become a shim in Task 6):

```bash
git add packages/mailer/src/mailer.ts packages/mailer/tests/mailer.test.ts
git commit -m "$(cat <<'EOF'
feat(mailer): move createMailer factory + tests into @bomy/mailer

Body unchanged; relocated from apps/api/src/lib/mailer.ts so the
package can become the source of truth. apps/api compatibility shim
follows in a later commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Write `configFromEnv` (TDD)

**Files:**

- Create: `packages/mailer/src/env.ts`
- Create: `packages/mailer/tests/env.test.ts`

- [ ] **Step 1:** Write failing tests at `packages/mailer/tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { configFromEnv } from "../src/env.js"

describe("configFromEnv — disabled mode", () => {
  it("returns enabled: false when EMAIL_DELIVERY_ENABLED is unset", () => {
    const cfg = configFromEnv({})
    expect(cfg.enabled).toBe(false)
  })

  it("does not throw when SMTP_HOST and MAIL_FROM are missing in disabled mode", () => {
    expect(() => configFromEnv({})).not.toThrow()
  })

  it("returns enabled: false when EMAIL_DELIVERY_ENABLED is any value other than 'true'", () => {
    expect(configFromEnv({ EMAIL_DELIVERY_ENABLED: "false" }).enabled).toBe(false)
    expect(configFromEnv({ EMAIL_DELIVERY_ENABLED: "yes" }).enabled).toBe(false)
    expect(configFromEnv({ EMAIL_DELIVERY_ENABLED: "1" }).enabled).toBe(false)
  })
})

describe("configFromEnv — enabled validation", () => {
  const ENABLED_BASE = {
    EMAIL_DELIVERY_ENABLED: "true",
    SMTP_HOST: "smtp.example.com",
    MAIL_FROM: "noreply@brandsofmalaysia.com",
  }

  it("returns a valid config with sensible defaults when only required vars are set", () => {
    const cfg = configFromEnv(ENABLED_BASE)
    expect(cfg).toEqual({
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      secure: false,
      from: "noreply@brandsofmalaysia.com",
    })
  })

  it("throws when SMTP_HOST is missing", () => {
    expect(() => configFromEnv({ EMAIL_DELIVERY_ENABLED: "true", MAIL_FROM: "x@y" })).toThrow(
      /SMTP_HOST is required/,
    )
  })

  it("throws when MAIL_FROM is missing", () => {
    expect(() =>
      configFromEnv({ EMAIL_DELIVERY_ENABLED: "true", SMTP_HOST: "smtp.example.com" }),
    ).toThrow(/MAIL_FROM is required/)
  })

  it("throws when SMTP_PORT is not a number", () => {
    expect(() => configFromEnv({ ...ENABLED_BASE, SMTP_PORT: "abc" })).toThrow(
      /SMTP_PORT must be a valid number/,
    )
  })

  it("throws when SMTP_USER is set without SMTP_PASS (or vice versa)", () => {
    expect(() => configFromEnv({ ...ENABLED_BASE, SMTP_USER: "u" })).toThrow(
      /SMTP_USER and SMTP_PASS must both be set or both absent/,
    )
    expect(() => configFromEnv({ ...ENABLED_BASE, SMTP_PASS: "p" })).toThrow(
      /SMTP_USER and SMTP_PASS must both be set or both absent/,
    )
  })

  it("includes user/pass when both are set", () => {
    const cfg = configFromEnv({ ...ENABLED_BASE, SMTP_USER: "u", SMTP_PASS: "p" })
    expect(cfg.user).toBe("u")
    expect(cfg.pass).toBe("p")
  })

  it("passes through replyTo when MAIL_REPLY_TO is set", () => {
    const cfg = configFromEnv({ ...ENABLED_BASE, MAIL_REPLY_TO: "support@brandsofmalaysia.com" })
    expect(cfg.replyTo).toBe("support@brandsofmalaysia.com")
  })

  it("respects SMTP_SECURE=true", () => {
    const cfg = configFromEnv({ ...ENABLED_BASE, SMTP_SECURE: "true" })
    expect(cfg.secure).toBe(true)
  })
})
```

- [ ] **Step 2:** Run to verify they fail (env.ts doesn't exist yet):

```bash
pnpm --filter @bomy/mailer test
```

Expected: import error — `Cannot find module '../src/env.js'`.

- [ ] **Step 3:** Implement `packages/mailer/src/env.ts`:

```ts
import type { MailerConfig } from "./mailer.js"

export function configFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): MailerConfig {
  const enabled = env["EMAIL_DELIVERY_ENABLED"] === "true"
  const host = env["SMTP_HOST"] ?? ""
  const portRaw = env["SMTP_PORT"] ?? "587"
  const port = parseInt(portRaw, 10)
  const secure = env["SMTP_SECURE"] === "true"
  const user = env["SMTP_USER"]
  const pass = env["SMTP_PASS"]
  const from = env["MAIL_FROM"] ?? ""
  const replyTo = env["MAIL_REPLY_TO"]

  if (enabled) {
    if (!host) throw new Error("SMTP_HOST is required when EMAIL_DELIVERY_ENABLED=true")
    if (!from) throw new Error("MAIL_FROM is required when EMAIL_DELIVERY_ENABLED=true")
    if (isNaN(port)) throw new Error("SMTP_PORT must be a valid number")
    if (Boolean(user) !== Boolean(pass)) {
      throw new Error("SMTP_USER and SMTP_PASS must both be set or both absent")
    }
  }

  return {
    enabled,
    host,
    port,
    secure,
    from,
    ...(user !== undefined ? { user } : {}),
    ...(pass !== undefined ? { pass } : {}),
    ...(replyTo !== undefined ? { replyTo } : {}),
  }
}
```

- [ ] **Step 4:** Run tests:

```bash
pnpm --filter @bomy/mailer test
```

Expected: all `env.test.ts` cases pass; `mailer.test.ts` still passes.

- [ ] **Step 5:** Commit:

```bash
git add packages/mailer/src/env.ts packages/mailer/tests/env.test.ts
git commit -m "$(cat <<'EOF'
feat(mailer): add configFromEnv for shared env parsing

Strict validation only fires when EMAIL_DELIVERY_ENABLED=true. Disabled
mode returns a permissive config so Next.js apps can degrade
gracefully without throwing in server actions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Move `parseOpsEmails` and `joinUrl` into the package (with tests)

**Files:**

- Create: `packages/mailer/src/helpers.ts`
- Create: `packages/mailer/tests/helpers.test.ts`

- [ ] **Step 1:** Create `packages/mailer/src/helpers.ts` (body lifted from `apps/api/src/notifications/order.ts:8–17`):

```ts
export function parseOpsEmails(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string[] {
  return (env["OPS_ALERT_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`)
}
```

- [ ] **Step 2:** Create `packages/mailer/tests/helpers.test.ts` (cases moved from `apps/api/tests/notifications/order.test.ts:10–39`):

```ts
import { describe, expect, it } from "vitest"
import { joinUrl, parseOpsEmails } from "../src/helpers.js"

describe("parseOpsEmails", () => {
  it("splits comma-separated addresses and trims whitespace", () => {
    expect(
      parseOpsEmails({
        OPS_ALERT_EMAILS: "ops@brandsofmalaysia.com, finance@brandsofmalaysia.com , ",
      }),
    ).toEqual(["ops@brandsofmalaysia.com", "finance@brandsofmalaysia.com"])
  })

  it("returns empty array when OPS_ALERT_EMAILS is unset", () => {
    expect(parseOpsEmails({})).toEqual([])
  })

  it("returns empty array when OPS_ALERT_EMAILS is empty string", () => {
    expect(parseOpsEmails({ OPS_ALERT_EMAILS: "" })).toEqual([])
  })
})

describe("joinUrl", () => {
  it("strips trailing slash from base", () => {
    expect(joinUrl("https://app.brandsofmalaysia.com/", "/account/orders")).toBe(
      "https://app.brandsofmalaysia.com/account/orders",
    )
  })

  it("handles base without trailing slash", () => {
    expect(joinUrl("https://app.brandsofmalaysia.com", "/account/orders")).toBe(
      "https://app.brandsofmalaysia.com/account/orders",
    )
  })
})
```

- [ ] **Step 3:** Run tests:

```bash
pnpm --filter @bomy/mailer test
```

Expected: helpers tests pass; previous tests still pass.

- [ ] **Step 4:** Commit:

```bash
git add packages/mailer/src/helpers.ts packages/mailer/tests/helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(mailer): move parseOpsEmails and joinUrl into @bomy/mailer

Body unchanged; relocated from apps/api/src/notifications/order.ts so
all surfaces can share them via the package. apps/api consumers will be
updated through the compatibility shim.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire public exports in `packages/mailer/src/index.ts`

**Files:**

- Modify: `packages/mailer/src/index.ts`

- [ ] **Step 1:** Replace placeholder with the real exports:

```ts
export { createMailer } from "./mailer.js"
export type { Mailer, MailerConfig } from "./mailer.js"
export { configFromEnv } from "./env.js"
export { parseOpsEmails, joinUrl } from "./helpers.js"
```

- [ ] **Step 2:** Run the package tests and typecheck:

```bash
pnpm --filter @bomy/mailer test
pnpm --filter @bomy/mailer typecheck
```

Expected: green.

- [ ] **Step 3:** Commit:

```bash
git add packages/mailer/src/index.ts
git commit -m "$(cat <<'EOF'
feat(mailer): expose createMailer, configFromEnv, helpers from index

Public surface for the @bomy/mailer package.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Migrate `apps/api` to consume `@bomy/mailer` (Tasks 6–11)

### Task 6: Add `@bomy/mailer` to `apps/api/package.json`; convert `apps/api/src/lib/mailer.ts` to a re-export shim

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/lib/mailer.ts`
- Delete: `apps/api/tests/lib/mailer.test.ts`

- [ ] **Step 1:** Edit `apps/api/package.json` dependencies — remove `nodemailer` and `@types/nodemailer`, add `"@bomy/mailer": "workspace:*"`:

```jsonc
// dependencies block becomes:
{
  // ... other deps
  "@bomy/mailer": "workspace:*"
  // remove: "nodemailer": "^8.0.7"
}
// devDependencies block:
{
  // ... other devDeps
  // remove: "@types/nodemailer": "^8.0.0"
}
```

- [ ] **Step 2:** Run `pnpm install` to refresh the workspace linkage:

```bash
pnpm install
```

- [ ] **Step 3:** Replace the body of `apps/api/src/lib/mailer.ts` with the shim:

```ts
export {
  createMailer,
  configFromEnv,
  parseOpsEmails,
  joinUrl,
  type Mailer,
  type MailerConfig,
} from "@bomy/mailer"
```

- [ ] **Step 4:** Delete the moved test file (its cases now live in `packages/mailer/tests/mailer.test.ts`):

```bash
rm apps/api/tests/lib/mailer.test.ts
```

- [ ] **Step 5:** Run api typecheck + tests to confirm nothing broke (downstream files in `apps/api` still import from `../lib/mailer.js` — the shim re-exports keep them green):

```bash
pnpm --filter @bomy/api typecheck
pnpm --filter @bomy/api test --run
```

Expected: green (no behavior change yet).

- [ ] **Step 6:** Commit:

```bash
git add apps/api/package.json apps/api/src/lib/mailer.ts apps/api/tests/lib/mailer.test.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
refactor(api): re-export mailer surface from @bomy/mailer

apps/api/src/lib/mailer.ts is now a thin compatibility shim. Existing
downstream relative imports stay green. The moved test file is deleted
(coverage lives in packages/mailer/tests/mailer.test.ts now).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Switch the Fastify plugin to use `configFromEnv` from `@bomy/mailer`

**Files:**

- Modify: `apps/api/src/plugins/mailer.ts`

- [ ] **Step 1:** Replace the body with:

```ts
import fp from "fastify-plugin"

import { configFromEnv, createMailer, type Mailer } from "@bomy/mailer"

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer
  }
}

export const mailerPlugin = fp(async (app) => {
  const config = configFromEnv(process.env)
  const mailer = createMailer(config, {
    info: (obj, msg) => app.log.info(obj, msg),
  })

  app.decorate("mailer", mailer)
  app.addHook("onClose", async () => {
    await mailer.close()
  })
})
```

- [ ] **Step 2:** Run api tests:

```bash
pnpm --filter @bomy/api test --run
```

Expected: green. Fail-fast on enabled-misconfig now flows through `configFromEnv` — behavior is identical to before.

- [ ] **Step 3:** Commit:

```bash
git add apps/api/src/plugins/mailer.ts
git commit -m "$(cat <<'EOF'
refactor(api): plugin uses shared configFromEnv

Removes inline env parsing; same fail-fast behavior on enabled-misconfig.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Remove local `parseOpsEmails` / `joinUrl` from `order.ts`; import from `@bomy/mailer`

**Files:**

- Modify: `apps/api/src/notifications/order.ts`
- Modify: `apps/api/tests/notifications/order.test.ts`

- [ ] **Step 1:** In `apps/api/src/notifications/order.ts`, delete the local function bodies for `parseOpsEmails` (lines 8–13) and `joinUrl` (lines 15–17). Update the imports at the top to include them from the shim (or `@bomy/mailer` directly — pick the shim to minimize churn):

```ts
// At the top of order.ts, add:
import { joinUrl, parseOpsEmails } from "../lib/mailer.js"
```

(The shim re-exports these from `@bomy/mailer`.) Keep the existing `export function parseOpsEmails` and `export function joinUrl` removed, and re-export them so downstream code can still `import { ... } from "../notifications/order.js"` if it does (it doesn't today, but the existing test imports them from there):

```ts
// Below the imports, re-export so existing test imports stay valid:
export { joinUrl, parseOpsEmails }
```

- [ ] **Step 2:** In `apps/api/tests/notifications/order.test.ts`, **remove** the `describe("parseOpsEmails", …)` and `describe("joinUrl", …)` blocks (lines 10–39 in the current file) since their coverage moved into `packages/mailer/tests/helpers.test.ts`. Keep the `dispatchOrderNotifications` describe blocks and adjust the import at the top — `joinUrl` and `parseOpsEmails` are no longer needed in this test file. Result:

```ts
import { describe, expect, it, vi } from "vitest"
import type { FastifyInstance } from "fastify"
import { dispatchOrderNotifications } from "../../src/notifications/order.js"
import type { NotificationDescriptor } from "../../src/notifications/types.js"

// describe("dispatchOrderNotifications", () => { ... existing cases ... })
```

- [ ] **Step 3:** Run api tests:

```bash
pnpm --filter @bomy/api test --run
```

Expected: green. Dispatcher tests unaffected; the removed helper tests are now covered by `packages/mailer`.

- [ ] **Step 4:** Commit:

```bash
git add apps/api/src/notifications/order.ts apps/api/tests/notifications/order.test.ts
git commit -m "$(cat <<'EOF'
refactor(api): order.ts imports parseOpsEmails + joinUrl from shared package

Removes the local function bodies (now in @bomy/mailer/helpers).
Re-exports the names so the existing dispatcher tests' import path
stays unchanged. parseOpsEmails/joinUrl unit tests deleted (covered in
packages/mailer/tests/helpers.test.ts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Update `apps/api/src/notifications/membership.ts` to import `Mailer` via the shim

**Files:**

- Modify: `apps/api/src/notifications/membership.ts`

- [ ] **Step 1:** Open the file. The existing first line is `import type { Mailer } from "../lib/mailer.js"`. The shim already re-exports `Mailer`, so this line is already correct — no change needed. Verify by:

```bash
grep -n "from \"../lib/mailer" apps/api/src/notifications/membership.ts
```

Expected: `import type { Mailer } from "../lib/mailer.js"` present at the top. If so, **skip steps 2–3 and proceed to the next task without committing.**

- [ ] **Step 2:** (Only if the import is missing or points elsewhere) Ensure the file starts with:

```ts
import type { Mailer } from "../lib/mailer.js"
```

- [ ] **Step 3:** (Only if a change was made) Commit:

```bash
git add apps/api/src/notifications/membership.ts
git commit -m "$(cat <<'EOF'
refactor(api): membership.ts imports Mailer via shim

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Verify `apps/api` is fully green after the migration

**Files:** none (verification only)

- [ ] **Step 1:** Run full api checks:

```bash
pnpm --filter @bomy/api lint
pnpm --filter @bomy/api typecheck
pnpm --filter @bomy/api test --run
```

Expected: all green. If anything fails, investigate the failing import path; the shim should resolve everything.

- [ ] **Step 2:** Run all package + workspace tests once to confirm nothing else regressed:

```bash
pnpm --filter @bomy/mailer test
pnpm --filter @bomy/api test --run
```

Expected: both green.

No commit (verification step).

---

### Task 11: Confirm package + api lint is enforced via root turbo (sanity check)

**Files:** none (verification)

- [ ] **Step 1:** Run root lint to confirm turbo picks up `@bomy/mailer`:

```bash
pnpm lint
```

Expected: turbo runs lint for all workspace packages including `@bomy/mailer`; zero warnings.

- [ ] **Step 2:** Run root typecheck:

```bash
pnpm typecheck
```

Expected: all packages typecheck cleanly.

No commit.

---

## Phase 3 — Voucher email feature in `apps/api` (Tasks 12–17)

### Task 12: Create the voucher notification module skeleton (interfaces only, no functions)

**Files:**

- Create: `apps/api/src/notifications/voucher.ts`

- [ ] **Step 1:** Write the file with just the types — function bodies follow in next tasks via TDD:

```ts
import type { Mailer } from "../lib/mailer.js"

export interface JobLogger {
  info(obj: object, msg: string): void
  warn(obj: object, msg: string): void
  error(obj: object, msg: string): void
}

export interface IssuedVoucher {
  id: string
  userId: string
  code: string
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedAmountSen: bigint | null
  percentage: number | null
  randomResolvedSen: bigint | null
  expiresAt: Date
}

export interface DispatchSummary {
  sent: number
  failed: number
  skipped: number
}

// Implementations land in the next tasks (TDD).
export async function sendVoucherIssuedEmail(
  _mailer: Mailer,
  _voucher: IssuedVoucher,
  _email: string,
  _env: { appUrl: string },
): Promise<void> {
  throw new Error("not implemented")
}

export async function dispatchVoucherEmails(
  _mailer: Mailer,
  _inserted: readonly IssuedVoucher[],
  _emailByUserId: ReadonlyMap<string, string>,
  _env: { appUrl: string; issuedMonth: string },
  _log: JobLogger,
): Promise<DispatchSummary> {
  throw new Error("not implemented")
}
```

- [ ] **Step 2:** Typecheck:

```bash
pnpm --filter @bomy/api typecheck
```

Expected: green.

- [ ] **Step 3:** Commit:

```bash
git add apps/api/src/notifications/voucher.ts
git commit -m "$(cat <<'EOF'
feat(api): voucher notification module skeleton

Defines JobLogger, IssuedVoucher, DispatchSummary and the function
shapes. Bodies follow under TDD.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: TDD `sendVoucherIssuedEmail`

**Files:**

- Create: `apps/api/tests/notifications/voucher.test.ts`
- Modify: `apps/api/src/notifications/voucher.ts`

- [ ] **Step 1:** Write the failing tests at `apps/api/tests/notifications/voucher.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "../../src/lib/mailer.js"
import { type IssuedVoucher, sendVoucherIssuedEmail } from "../../src/notifications/voucher.js"

function makeMailer() {
  const sendMail = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close }
  return { mailer, sendMail }
}

const EXPIRES = new Date("2026-05-31T15:59:59Z") // 23:59:59 MYT on May 31

const BASE: IssuedVoucher = {
  id: "v-1",
  userId: "u-1",
  code: "ABCD1234",
  type: "fixed_myr",
  fixedAmountSen: 1000n, // RM 10.00
  percentage: null,
  randomResolvedSen: null,
  expiresAt: EXPIRES,
}

describe("sendVoucherIssuedEmail", () => {
  it("subject includes the voucher code", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, BASE, "u@brandsofmalaysia.com", {
      appUrl: "https://app.brandsofmalaysia.com",
    })
    expect(sendMail).toHaveBeenCalledOnce()
    const args = sendMail.mock.calls[0]![0]
    expect(args.subject).toContain("ABCD1234")
    expect(args.to).toBe("u@brandsofmalaysia.com")
  })

  it("renders fixed_myr amount as RM N.NN", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, BASE, "u@brandsofmalaysia.com", {
      appUrl: "https://app.brandsofmalaysia.com",
    })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body).toContain("RM 10.00")
    expect(body).toContain("ABCD1234")
  })

  it("renders percentage as N%", async () => {
    const v: IssuedVoucher = {
      ...BASE,
      type: "percentage",
      fixedAmountSen: null,
      percentage: 15,
    }
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, v, "u@brandsofmalaysia.com", {
      appUrl: "https://app.brandsofmalaysia.com",
    })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body).toContain("15%")
  })

  it("renders random_myr as the resolved RM amount", async () => {
    const v: IssuedVoucher = {
      ...BASE,
      type: "random_myr",
      fixedAmountSen: null,
      randomResolvedSen: 2550n, // RM 25.50
    }
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, v, "u@brandsofmalaysia.com", {
      appUrl: "https://app.brandsofmalaysia.com",
    })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body).toContain("RM 25.50")
  })

  it("includes the joinUrl-formed /account CTA (not /account/vouchers)", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendVoucherIssuedEmail(mailer, BASE, "u@brandsofmalaysia.com", {
      appUrl: "https://app.brandsofmalaysia.com/",
    })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body).toContain("https://app.brandsofmalaysia.com/account")
    expect(body).not.toContain("/account/vouchers")
  })
})
```

- [ ] **Step 2:** Run and verify they fail:

```bash
pnpm --filter @bomy/api test voucher.test --run
```

Expected: FAIL (`not implemented` thrown).

- [ ] **Step 3:** Implement the body in `apps/api/src/notifications/voucher.ts` (replace the stub for `sendVoucherIssuedEmail`):

```ts
import { joinUrl, type Mailer } from "../lib/mailer.js"

// ... (existing interfaces above)

function senToMyrStr(sen: bigint): string {
  const whole = sen / 100n
  const cents = sen % 100n
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

function renderAmount(voucher: IssuedVoucher): string {
  if (voucher.type === "fixed_myr" && voucher.fixedAmountSen !== null) {
    return `RM ${senToMyrStr(voucher.fixedAmountSen)} off`
  }
  if (voucher.type === "percentage" && voucher.percentage !== null) {
    return `${voucher.percentage}% off`
  }
  if (voucher.type === "random_myr" && voucher.randomResolvedSen !== null) {
    return `RM ${senToMyrStr(voucher.randomResolvedSen)} off (your monthly random reward!)`
  }
  return "a monthly reward"
}

export async function sendVoucherIssuedEmail(
  mailer: Mailer,
  voucher: IssuedVoucher,
  email: string,
  env: { appUrl: string },
): Promise<void> {
  const expiryStr = voucher.expiresAt.toLocaleDateString("en-MY")
  const accountUrl = joinUrl(env.appUrl, "/account")
  const amountLine = renderAmount(voucher)

  await mailer.sendMail({
    to: email,
    subject: `Your BOMY monthly voucher — code ${voucher.code}`,
    text:
      `Your monthly BOMY voucher is ready: ${amountLine}.\n\n` +
      `Use code ${voucher.code} at checkout. Valid until ${expiryStr}.\n\n` +
      `Manage your account: ${accountUrl}`,
  })
}
```

(Note: the `import { joinUrl, type Mailer }` line replaces the existing `import type { Mailer }`. The function uses `joinUrl` from the shim.)

- [ ] **Step 4:** Run tests:

```bash
pnpm --filter @bomy/api test voucher.test --run
```

Expected: 5 pass.

- [ ] **Step 5:** Commit:

```bash
git add apps/api/src/notifications/voucher.ts apps/api/tests/notifications/voucher.test.ts
git commit -m "$(cat <<'EOF'
feat(api): sendVoucherIssuedEmail template

Subject contains code; body renders amount per voucher type (fixed_myr,
percentage, random_myr) and links to /account (since /account/vouchers
does not exist yet).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: TDD `dispatchVoucherEmails`

**Files:**

- Modify: `apps/api/tests/notifications/voucher.test.ts`
- Modify: `apps/api/src/notifications/voucher.ts`

- [ ] **Step 1:** Append the following tests to `apps/api/tests/notifications/voucher.test.ts`:

```ts
import {
  type DispatchSummary,
  type JobLogger,
  dispatchVoucherEmails,
} from "../../src/notifications/voucher.js"

function makeLog(): JobLogger & {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function makeVoucher(idx: number): IssuedVoucher {
  return {
    id: `v-${idx}`,
    userId: `u-${idx}`,
    code: `CODE${idx}`,
    type: "fixed_myr",
    fixedAmountSen: 1000n,
    percentage: null,
    randomResolvedSen: null,
    expiresAt: EXPIRES,
  }
}

describe("dispatchVoucherEmails", () => {
  it("happy path: sends one email per inserted row and returns matching summary", async () => {
    const { mailer, sendMail } = makeMailer()
    const log = makeLog()
    const inserted = [makeVoucher(1), makeVoucher(2)]
    const emailByUserId = new Map([
      ["u-1", "u1@brandsofmalaysia.com"],
      ["u-2", "u2@brandsofmalaysia.com"],
    ])

    const summary = await dispatchVoucherEmails(
      mailer,
      inserted,
      emailByUserId,
      { appUrl: "https://app.brandsofmalaysia.com", issuedMonth: "2026-05" },
      log,
    )

    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(summary).toEqual<DispatchSummary>({ sent: 2, failed: 0, skipped: 0 })
    expect(log.info).toHaveBeenCalledOnce()
    expect(log.info.mock.calls[0]![1]).toBe("voucher_issuance_summary")
  })

  it("isolates per-row failures: first send throws, second sent, loop continues", async () => {
    const sendMail = vi
      .fn<Mailer["sendMail"]>()
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValueOnce(undefined)
    const mailer: Mailer = { sendMail, close: vi.fn() }
    const log = makeLog()
    const inserted = [makeVoucher(1), makeVoucher(2)]
    const emailByUserId = new Map([
      ["u-1", "u1@brandsofmalaysia.com"],
      ["u-2", "u2@brandsofmalaysia.com"],
    ])

    const summary = await dispatchVoucherEmails(
      mailer,
      inserted,
      emailByUserId,
      { appUrl: "https://app.brandsofmalaysia.com", issuedMonth: "2026-05" },
      log,
    )

    expect(summary).toEqual<DispatchSummary>({ sent: 1, failed: 1, skipped: 0 })
    expect(log.error).toHaveBeenCalledOnce()
    const errCall = log.error.mock.calls[0] as [Record<string, unknown>, string]
    expect(errCall[0]["event"]).toBe("email_notification_failed")
    expect(errCall[0]["voucherId"]).toBe("v-1")
    expect(errCall[0]["userId"]).toBe("u-1")
    expect(JSON.stringify(errCall[0])).not.toContain("Your monthly BOMY voucher")
  })

  it("logs email_notification_skipped when a userId has no entry in emailByUserId (defensive)", async () => {
    const { mailer, sendMail } = makeMailer()
    const log = makeLog()
    const inserted = [makeVoucher(1), makeVoucher(2)]
    const emailByUserId = new Map([["u-2", "u2@brandsofmalaysia.com"]]) // u-1 missing

    const summary = await dispatchVoucherEmails(
      mailer,
      inserted,
      emailByUserId,
      { appUrl: "https://app.brandsofmalaysia.com", issuedMonth: "2026-05" },
      log,
    )

    expect(summary).toEqual<DispatchSummary>({ sent: 1, failed: 0, skipped: 1 })
    expect(sendMail).toHaveBeenCalledOnce()
    expect(log.warn).toHaveBeenCalledOnce()
    const warnCall = log.warn.mock.calls[0] as [Record<string, unknown>, string]
    expect(warnCall[0]["event"]).toBe("email_notification_skipped")
    expect(warnCall[0]["reason"]).toBe("user_email_not_found")
    expect(warnCall[0]["voucherId"]).toBe("v-1")
  })
})
```

(Add the `import type { Mailer }` to the existing imports at the top if not already present.)

- [ ] **Step 2:** Run to verify they fail:

```bash
pnpm --filter @bomy/api test voucher.test --run
```

Expected: FAIL (`not implemented`).

- [ ] **Step 3:** Implement `dispatchVoucherEmails` in `apps/api/src/notifications/voucher.ts` (replace its stub):

```ts
export async function dispatchVoucherEmails(
  mailer: Mailer,
  inserted: readonly IssuedVoucher[],
  emailByUserId: ReadonlyMap<string, string>,
  env: { appUrl: string; issuedMonth: string },
  log: JobLogger,
): Promise<DispatchSummary> {
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const v of inserted) {
    const email = emailByUserId.get(v.userId)
    if (!email) {
      skipped++
      log.warn(
        {
          event: "email_notification_skipped",
          reason: "user_email_not_found",
          voucherId: v.id,
          userId: v.userId,
        },
        "email_notification_skipped",
      )
      continue
    }
    try {
      await sendVoucherIssuedEmail(mailer, v, email, { appUrl: env.appUrl })
      sent++
    } catch (err) {
      failed++
      log.error(
        {
          event: "email_notification_failed",
          voucherId: v.id,
          userId: v.userId,
          email,
          message: err instanceof Error ? err.message : String(err),
        },
        "email_notification_failed",
      )
    }
  }

  log.info(
    {
      event: "voucher_issuance_summary",
      issuedMonth: env.issuedMonth,
      inserted: inserted.length,
      sent,
      failed,
      skipped,
    },
    "voucher_issuance_summary",
  )

  return { sent, failed, skipped }
}
```

- [ ] **Step 4:** Run tests:

```bash
pnpm --filter @bomy/api test voucher.test --run
```

Expected: all 8 voucher tests pass (5 from Task 13 + 3 new).

- [ ] **Step 5:** Commit:

```bash
git add apps/api/src/notifications/voucher.ts apps/api/tests/notifications/voucher.test.ts
git commit -m "$(cat <<'EOF'
feat(api): dispatchVoucherEmails helper with isolated per-row send

Owns the send loop, per-row try/catch, user_email_not_found skip log,
and the voucher_issuance_summary structured log. Returns
DispatchSummary so callers and tests can assert counters without
parsing logs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Restructure `issueMonthlyVouchers` for `.returning`, hydrate, and delegate

**Files:**

- Modify: `apps/api/src/jobs/voucher-issuance.ts`
- Modify: `apps/api/tests/jobs/voucher-issuance.test.ts`

- [ ] **Step 1:** Open `apps/api/tests/jobs/voucher-issuance.test.ts`. Existing tests likely assert insertion counts but not the dispatcher call. Add two new test cases at the end of the file (above the closing `})`s):

```ts
import type { Mailer } from "../../src/lib/mailer.js"
import type { JobLogger } from "../../src/notifications/voucher.js"

// helper at top of file if not already present:
function noopLog(): JobLogger {
  return { info: () => {}, warn: () => {}, error: () => {} }
}
function noopMailer(): Mailer {
  return { sendMail: async () => {}, close: async () => {} }
}

describe("issueMonthlyVouchers — email dispatch", () => {
  it("calls dispatchVoucherEmails with the inserted rows and hydrated emails", async () => {
    // Test approach: spy on dispatchVoucherEmails by intercepting mailer.sendMail.
    // Seed two active members; run the job; assert sendMail was called exactly twice
    // and the recipient addresses match the seeded users.
    // (Seed two memberships and users — exact seeding follows existing test conventions.)
    // After running issueMonthlyVouchers(db, mailer, log), assert:
    //   - mailer.sendMail invoked once per newly inserted voucher
    //   - recipient addresses match users.email for those userIds
    //   - return value equals 2 (inserted count)
  })

  it("commit-then-dispatch ordering: insert succeeds even if a send throws", async () => {
    // Seed one active member; pass a mailer whose sendMail rejects;
    // assert the job still returns 1 (insert committed) and the voucher row exists.
  })
})
```

**Implementation note:** the exact seeding helpers depend on what's already in `tests/jobs/voucher-issuance.test.ts`. Match the existing pattern (likely `seedMembership({...})` or direct `withAdmin` inserts). If the file currently has no integration scaffolding, add minimal seeding using `withAdmin(db, { userId: SYSTEM_ACTOR, reason: "test seed" }, ...)`.

- [ ] **Step 2:** Run to verify the new tests fail (signature mismatch — the production code doesn't accept `mailer` or `log` yet):

```bash
pnpm --filter @bomy/api test voucher-issuance.test --run
```

Expected: FAIL (compile error or runtime error on `issueMonthlyVouchers(db, mailer, log)`).

- [ ] **Step 3:** Update `apps/api/src/jobs/voucher-issuance.ts`. Replace the existing `issueMonthlyVouchers` with:

```ts
import { randomBytes } from "node:crypto"

import { eq, inArray, sql } from "drizzle-orm"

import { schema, withAdmin, type Database } from "@bomy/db"

import type { Mailer } from "../lib/mailer.js"
import {
  type IssuedVoucher,
  type JobLogger,
  dispatchVoucherEmails,
} from "../notifications/voucher.js"

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001" as const

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes)
    .map((b) => CODE_CHARS[b % CODE_CHARS.length]!)
    .join("")
}

interface VoucherConfig {
  type: "fixed_myr" | "percentage" | "random_myr"
  fixedSen?: bigint
  percentage?: number
  randomMinSen?: bigint
  randomMaxSen?: bigint
}

async function readVoucherConfig(db: Database): Promise<VoucherConfig | null> {
  const rows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read voucher monthly config" },
    async (tx) =>
      tx
        .select({ key: schema.platformConfig.key, value: schema.platformConfig.value })
        .from(schema.platformConfig)
        .where(sql`${schema.platformConfig.key} LIKE 'voucher_monthly_%'`),
  )

  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const type = cfg["voucher_monthly_type"] as string | undefined

  if (type === "fixed_myr") {
    const fixedSen = cfg["voucher_monthly_fixed_sen"]
    if (typeof fixedSen !== "number") return null
    return { type: "fixed_myr", fixedSen: BigInt(fixedSen) }
  }
  if (type === "percentage") {
    const pct = cfg["voucher_monthly_pct"]
    if (typeof pct !== "number") return null
    return { type: "percentage", percentage: pct }
  }
  if (type === "random_myr") {
    const minSen = cfg["voucher_monthly_random_min_sen"]
    const maxSen = cfg["voucher_monthly_random_max_sen"]
    if (typeof minSen !== "number" || typeof maxSen !== "number") return null
    return { type: "random_myr", randomMinSen: BigInt(minSen), randomMaxSen: BigInt(maxSen) }
  }
  return null
}

function getMYTYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date())
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  }
}

function currentIssuedMonth(): string {
  const { year, month } = getMYTYearMonth()
  return `${year}-${String(month).padStart(2, "0")}`
}

function endOfCurrentMonth(): Date {
  const { year, month } = getMYTYearMonth()
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const firstOfNextMonthUTC = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000
  return new Date(firstOfNextMonthUTC - 1)
}

type VoucherInsert = typeof schema.vouchers.$inferInsert

function buildVoucherRow(
  userId: string,
  config: VoucherConfig,
  issuedMonth: string,
  expiresAt: Date,
): VoucherInsert {
  const base = { userId, code: generateCode(), issuedMonth, expiresAt }

  if (config.type === "fixed_myr") {
    return { ...base, type: "fixed_myr", fixedAmountSen: config.fixedSen! }
  }
  if (config.type === "percentage") {
    return { ...base, type: "percentage", percentage: config.percentage! }
  }
  const range = Number(config.randomMaxSen! - config.randomMinSen!)
  const randomSen = config.randomMinSen! + BigInt(Math.floor(Math.random() * range))
  return { ...base, type: "random_myr", randomResolvedSen: randomSen }
}

export async function issueMonthlyVouchers(
  db: Database,
  mailer: Mailer,
  log: JobLogger,
): Promise<number> {
  const config = await readVoucherConfig(db)
  if (!config) {
    console.log("[voucher-issuance] No config found — skipping")
    return 0
  }

  const issuedMonth = currentIssuedMonth()
  const expiresAt = endOfCurrentMonth()

  const activeMembers = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "read active member subscriptions for voucher issuance" },
    async (tx) =>
      tx
        .select({ userId: schema.memberSubscriptions.userId })
        .from(schema.memberSubscriptions)
        .where(eq(schema.memberSubscriptions.status, "active")),
  )

  if (activeMembers.length === 0) return 0

  const rows: VoucherInsert[] = activeMembers.map((m) =>
    buildVoucherRow(m.userId, config, issuedMonth, expiresAt),
  )

  const inserted: IssuedVoucher[] = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "bulk insert monthly vouchers" },
    async (tx) =>
      tx
        .insert(schema.vouchers)
        .values(rows)
        .onConflictDoNothing({ target: [schema.vouchers.userId, schema.vouchers.issuedMonth] })
        .returning({
          id: schema.vouchers.id,
          userId: schema.vouchers.userId,
          code: schema.vouchers.code,
          type: schema.vouchers.type,
          fixedAmountSen: schema.vouchers.fixedAmountSen,
          percentage: schema.vouchers.percentage,
          randomResolvedSen: schema.vouchers.randomResolvedSen,
          expiresAt: schema.vouchers.expiresAt,
        }),
  )

  if (inserted.length === 0) return 0

  const userIds = inserted.map((v) => v.userId)
  const emailRows = await withAdmin(
    db,
    { userId: SYSTEM_ACTOR, reason: "voucher-issuance: hydrate emails for issued vouchers" },
    async (tx) =>
      tx
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds)),
  )
  const emailByUserId = new Map(emailRows.map((r) => [r.id, r.email]))

  await dispatchVoucherEmails(
    mailer,
    inserted,
    emailByUserId,
    { appUrl: process.env["APP_URL"] ?? "", issuedMonth },
    log,
  )

  return inserted.length
}
```

- [ ] **Step 4:** Run tests:

```bash
pnpm --filter @bomy/api test voucher-issuance.test --run
```

Expected: green (existing assertions + the two new ones).

- [ ] **Step 5:** Commit:

```bash
git add apps/api/src/jobs/voucher-issuance.ts apps/api/tests/jobs/voucher-issuance.test.ts
git commit -m "$(cat <<'EOF'
feat(api): wire voucher-issuance job to dispatchVoucherEmails

Bulk insert returns the full row data needed for templating; a second
withAdmin read hydrates user emails for the inserted userIds; the
awaited dispatch helper sends and logs the summary. Return value
(inserted count) unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Extend scheduler `deps` with `appLog`; pass to voucher worker

**Files:**

- Modify: `apps/api/src/scheduler.ts`

- [ ] **Step 1:** Open the file. Update the `deps` shape and the voucher worker callback:

```ts
// at top of file, alongside existing imports:
import type { JobLogger } from "./notifications/voucher.js"

// update createScheduler signature:
export async function createScheduler(
  db: Database,
  deps: {
    mailer: Mailer
    appLog: JobLogger
    logger: { info: (msg: string) => void; error: (obj: object, msg: string) => void }
  },
): Promise<Scheduler> {
  // ... existing body ...

  const voucherWorker = new Worker(
    VOUCHER_QUEUE_NAME,
    async () => {
      const n = await issueMonthlyVouchers(db, deps.mailer, deps.appLog)
      deps.logger.info(`jobs: voucher-issuance issued ${n} vouchers`)
    },
    { connection },
  )

  // ... rest unchanged ...
}
```

- [ ] **Step 2:** Run typecheck — `apps/api/src/server.ts` will fail because it doesn't yet pass `appLog`:

```bash
pnpm --filter @bomy/api typecheck
```

Expected: FAIL on `server.ts` missing `appLog` in deps. Carry on to Task 17 to fix.

No commit yet (typecheck is red; commit after Task 17 makes it green).

---

### Task 17: Update `apps/api/src/server.ts` to pass `app.log` as `appLog`

**Files:**

- Modify: `apps/api/src/server.ts`

- [ ] **Step 1:** Find the `createScheduler` call (somewhere near app startup). Add `appLog: app.log` to the deps object:

```ts
// before:
await createScheduler(db.db, {
  mailer: app.mailer,
  logger: {
    /* ... */
  },
})

// after:
await createScheduler(db.db, {
  mailer: app.mailer,
  appLog: app.log,
  logger: {
    /* ... unchanged ... */
  },
})
```

- [ ] **Step 2:** Run typecheck and tests:

```bash
pnpm --filter @bomy/api typecheck
pnpm --filter @bomy/api test --run
```

Expected: both green.

- [ ] **Step 3:** Commit Task 16 + 17 together:

```bash
git add apps/api/src/scheduler.ts apps/api/src/server.ts
git commit -m "$(cat <<'EOF'
feat(api): plumb app.log into voucher worker as JobLogger

createScheduler accepts deps.appLog (pino-shape); server.ts passes
app.log directly. Other workers continue using deps.logger for their
string-form summary logs — only the voucher worker uses appLog for
structured logging via dispatchVoucherEmails.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — `apps/web` seller-inquiry feature (Tasks 18–20)

### Task 18: Create `apps/web/src/lib/mailer.ts` (lazy singleton) with tests

**Files:**

- Modify: `apps/web/package.json` (add `@bomy/mailer`)
- Create: `apps/web/src/lib/mailer.ts`
- Create: `apps/web/tests/lib/mailer.test.ts`

- [ ] **Step 1:** Add the workspace dep to `apps/web/package.json`:

```json
"dependencies": {
  // ... existing
  "@bomy/mailer": "workspace:*"
}
```

- [ ] **Step 2:** Run `pnpm install`:

```bash
pnpm install
```

- [ ] **Step 3:** Write the failing test at `apps/web/tests/lib/mailer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SAVED_ENV = { ...process.env }

describe("getMailer — lazy singleton", () => {
  beforeEach(async () => {
    vi.resetModules()
    const mod = await import("../../src/lib/mailer.js")
    mod.resetMailerForTests()
  })
  afterEach(() => {
    process.env = { ...SAVED_ENV }
  })

  it("returns a disabled no-op mailer when EMAIL_DELIVERY_ENABLED is unset", async () => {
    delete process.env["EMAIL_DELIVERY_ENABLED"]
    const { getMailer } = await import("../../src/lib/mailer.js")
    const m = getMailer()
    await expect(m.sendMail({ to: "a@b.com", subject: "x", text: "y" })).resolves.toBeUndefined()
  })

  it("caches the singleton instance across calls", async () => {
    delete process.env["EMAIL_DELIVERY_ENABLED"]
    const { getMailer } = await import("../../src/lib/mailer.js")
    expect(getMailer()).toBe(getMailer())
  })

  it("falls back to disabled no-op and logs mailer_config_invalid on bad enabled config", async () => {
    process.env["EMAIL_DELIVERY_ENABLED"] = "true"
    delete process.env["SMTP_HOST"]
    delete process.env["MAIL_FROM"]
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getMailer } = await import("../../src/lib/mailer.js")
    const m = getMailer()
    // Should not throw, and should be the disabled no-op:
    await expect(m.sendMail({ to: "a@b.com", subject: "x", text: "y" })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    const firstCall = errorSpy.mock.calls[0]![0] as { event?: string }
    expect(firstCall.event).toBe("mailer_config_invalid")
    errorSpy.mockRestore()
  })
})
```

- [ ] **Step 4:** Run to verify failure (module doesn't exist):

```bash
pnpm --filter @bomy/web test mailer.test --run
```

Expected: FAIL (module not found).

- [ ] **Step 5:** Create `apps/web/src/lib/mailer.ts`:

```ts
import { configFromEnv, createMailer, type Mailer } from "@bomy/mailer"

let _mailer: Mailer | null = null

export function getMailer(): Mailer {
  if (_mailer) return _mailer
  try {
    const config = configFromEnv(process.env)
    _mailer = createMailer(config, { info: (obj, msg) => console.log(msg, obj) })
  } catch (err) {
    console.error({
      event: "mailer_config_invalid",
      message: err instanceof Error ? err.message : String(err),
    })
    _mailer = createMailer(
      { enabled: false, host: "", port: 0, secure: false, from: "" },
      { info: (obj, msg) => console.log(msg, obj) },
    )
  }
  return _mailer
}

/** Test-only: clear the cached singleton between tests. */
export function resetMailerForTests(): void {
  _mailer = null
}
```

- [ ] **Step 6:** Run tests:

```bash
pnpm --filter @bomy/web test mailer.test --run
```

Expected: 3 pass.

- [ ] **Step 7:** Commit:

```bash
git add apps/web/package.json apps/web/src/lib/mailer.ts apps/web/tests/lib/mailer.test.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(web): lazy mailer singleton with misconfig fallback

Uses @bomy/mailer's configFromEnv inside try/catch. On misconfig, logs
mailer_config_invalid and returns a disabled no-op mailer so server
actions never 500 because of bad SMTP env.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Create `apps/web/src/notifications/seller-inquiry.ts` template module with tests

**Files:**

- Create: `apps/web/src/notifications/seller-inquiry.ts`
- Create: `apps/web/tests/notifications/seller-inquiry.test.ts`

- [ ] **Step 1:** Write failing tests at `apps/web/tests/notifications/seller-inquiry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "@bomy/mailer"
import { sendApplicantAck, sendOpsAlert } from "../../src/notifications/seller-inquiry.js"

function makeMailer() {
  const sendMail = vi.fn().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close: vi.fn() }
  return { mailer, sendMail }
}

describe("sendApplicantAck", () => {
  it("addresses the applicant by submitted email and mentions the store name", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, {
      name: "Aisyah",
      email: "aisyah@example.com",
      storeName: "Kedai Aisyah",
    })
    const args = sendMail.mock.calls[0]![0]
    expect(args.to).toBe("aisyah@example.com")
    expect(args.subject).toContain("seller application")
    expect(args.text).toContain("Aisyah")
    expect(args.text).toContain("Kedai Aisyah")
  })

  it("does not promise a specific SLA in the body", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendApplicantAck(mailer, {
      name: "Aisyah",
      email: "aisyah@example.com",
      storeName: "Kedai Aisyah",
    })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body.toLowerCase()).not.toMatch(/business days?/i)
    expect(body.toLowerCase()).not.toMatch(/within \d+ (hour|day)/i)
  })
})

describe("sendOpsAlert", () => {
  it("addresses the ops recipients and includes every submitted field plus the admin link", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendOpsAlert(
      mailer,
      {
        inquiryId: "inq-1",
        name: "Aisyah",
        email: "aisyah@example.com",
        contactNumber: "012-3456789",
        companyName: "Aisyah Sdn Bhd",
        storeName: "Kedai Aisyah",
        message: "Looking forward.",
      },
      {
        adminUrl: "https://admin.brandsofmalaysia.com/",
        opsEmails: ["ops@brandsofmalaysia.com", "finance@brandsofmalaysia.com"],
      },
    )
    const args = sendMail.mock.calls[0]![0]
    expect(args.to).toEqual(["ops@brandsofmalaysia.com", "finance@brandsofmalaysia.com"])
    expect(args.subject).toContain("New seller inquiry")
    expect(args.subject).toContain("Kedai Aisyah")

    const body = args.text as string
    for (const fragment of [
      "Aisyah",
      "aisyah@example.com",
      "012-3456789",
      "Aisyah Sdn Bhd",
      "Kedai Aisyah",
      "Looking forward.",
      "https://admin.brandsofmalaysia.com/seller-inquiries",
    ]) {
      expect(body).toContain(fragment)
    }
  })

  it("renders message as '(none)' when null", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendOpsAlert(
      mailer,
      {
        inquiryId: "inq-1",
        name: "Aisyah",
        email: "aisyah@example.com",
        contactNumber: "012-3456789",
        companyName: "Aisyah Sdn Bhd",
        storeName: "Kedai Aisyah",
        message: null,
      },
      { adminUrl: "https://admin.brandsofmalaysia.com", opsEmails: ["ops@brandsofmalaysia.com"] },
    )
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body).toContain("(none)")
  })
})
```

- [ ] **Step 2:** Run — expect module-not-found:

```bash
pnpm --filter @bomy/web test seller-inquiry.test --run
```

- [ ] **Step 3:** Create `apps/web/src/notifications/seller-inquiry.ts`:

```ts
import { joinUrl, type Mailer } from "@bomy/mailer"

export async function sendApplicantAck(
  mailer: Mailer,
  inquiry: { name: string; email: string; storeName: string },
): Promise<void> {
  await mailer.sendMail({
    to: inquiry.email,
    subject: "We received your BOMY seller application",
    text:
      `Hi ${inquiry.name},\n\n` +
      `We've received your application for ${inquiry.storeName}. ` +
      `Our team will review it and contact you soon.\n\n` +
      `BOMY Team`,
  })
}

export async function sendOpsAlert(
  mailer: Mailer,
  inquiry: {
    inquiryId: string
    name: string
    email: string
    contactNumber: string
    companyName: string
    storeName: string
    message: string | null
  },
  env: { adminUrl: string; opsEmails: string[] },
): Promise<void> {
  const adminLink = joinUrl(env.adminUrl, "/seller-inquiries")
  const messageLine = inquiry.message ?? "(none)"

  await mailer.sendMail({
    to: env.opsEmails,
    subject: `[BOMY Ops] New seller inquiry — ${inquiry.storeName}`,
    text:
      `New seller inquiry received.\n\n` +
      `Name:    ${inquiry.name}\n` +
      `Email:   ${inquiry.email}\n` +
      `Contact: ${inquiry.contactNumber}\n` +
      `Company: ${inquiry.companyName}\n` +
      `Store:   ${inquiry.storeName}\n` +
      `Message: ${messageLine}\n\n` +
      `Review in admin: ${adminLink}`,
  })
}
```

- [ ] **Step 4:** Run tests:

```bash
pnpm --filter @bomy/web test seller-inquiry.test --run
```

Expected: green.

- [ ] **Step 5:** Commit:

```bash
git add apps/web/src/notifications/seller-inquiry.ts apps/web/tests/notifications/seller-inquiry.test.ts
git commit -m "$(cat <<'EOF'
feat(web): seller-inquiry email templates

Two template functions: sendApplicantAck (applicant address, no SLA
promise) and sendOpsAlert (lists all submitted fields, admin link
via joinUrl). Renders missing message as '(none)'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Wire `submitSellerInquiry` to the dispatchers + server-action test

**Files:**

- Modify: `apps/web/src/app/seller/apply/actions.ts`
- Create: `apps/web/tests/seller-inquiries/actions.test.ts`

- [ ] **Step 1:** Replace the body of `apps/web/src/app/seller/apply/actions.ts` (currently 30 lines) with:

```ts
"use server"

import { parseOpsEmails } from "@bomy/mailer"
import { makeDb, schema } from "@bomy/db"

import { getMailer } from "@/lib/mailer"
import { sendApplicantAck, sendOpsAlert } from "@/notifications/seller-inquiry"

const { db } = makeDb()

export async function submitSellerInquiry(formData: FormData) {
  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim()
  const contactNumber = (formData.get("contactNumber") as string)?.trim()
  const companyName = (formData.get("companyName") as string)?.trim()
  const storeName = (formData.get("storeName") as string)?.trim()
  const message = ((formData.get("message") as string) ?? "").trim() || null

  if (!name || !email || !contactNumber || !companyName || !storeName) {
    throw new Error("All required fields must be filled in.")
  }

  const [inserted] = await db
    .insert(schema.sellerInquiries)
    .values({ name, email, contactNumber, companyName, storeName, message })
    .returning({ id: schema.sellerInquiries.id })
  const inquiryId = inserted!.id

  const mailer = getMailer()

  try {
    await sendApplicantAck(mailer, { name, email, storeName })
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      recipientType: "applicant",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  const opsEmails = parseOpsEmails(process.env)
  if (opsEmails.length === 0) {
    console.info({
      event: "email_notification_skipped",
      reason: "missing_ops_recipients",
      inquiryId,
    })
  } else {
    try {
      await sendOpsAlert(
        mailer,
        { inquiryId, name, email, contactNumber, companyName, storeName, message },
        { adminUrl: process.env["ADMIN_URL"] ?? "", opsEmails },
      )
    } catch (err) {
      console.error({
        event: "email_notification_failed",
        recipientType: "ops",
        inquiryId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
```

(Adjust the `@/lib/mailer` and `@/notifications/seller-inquiry` import paths if the project uses a different alias — check `apps/web/tsconfig.json` for `paths`. If no alias, use relative `../../../lib/mailer.js` and `../../../notifications/seller-inquiry.js`.)

- [ ] **Step 2:** Write the server-action test at `apps/web/tests/seller-inquiries/actions.test.ts`. This is an integration test (touches the real DB), so guard it the same way other web tests do (`describe.skipIf(!shouldRun)` per `app/CLAUDE.md`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("submitSellerInquiry — server action", () => {
  beforeEach(async () => {
    vi.resetModules()
    const mailerMod = await import("../../src/lib/mailer.js")
    mailerMod.resetMailerForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
    const fd = new FormData()
    fd.set("name", overrides["name"] ?? "Aisyah")
    fd.set("email", overrides["email"] ?? "aisyah@example.com")
    fd.set("contactNumber", overrides["contactNumber"] ?? "012-3456789")
    fd.set("companyName", overrides["companyName"] ?? "Aisyah Sdn Bhd")
    fd.set("storeName", overrides["storeName"] ?? "Kedai Aisyah")
    fd.set("message", overrides["message"] ?? "Looking forward.")
    return fd
  }

  it("inserts the row, attempts applicant ack, and attempts ops alert when OPS_ALERT_EMAILS is set", async () => {
    process.env["OPS_ALERT_EMAILS"] = "ops@brandsofmalaysia.com"
    process.env["ADMIN_URL"] = "https://admin.brandsofmalaysia.com"
    // EMAIL_DELIVERY_ENABLED unset → disabled mailer (logs only); we assert via console.log spies.

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")

    await expect(submitSellerInquiry(makeFormData())).resolves.toBeUndefined()

    // Two skip logs (one per attempted send) — one for applicant, one for ops:
    const skipCalls = logSpy.mock.calls.filter((c) => c[0] === "email_notification_skipped")
    expect(skipCalls).toHaveLength(2)
  })

  it("logs missing_ops_recipients but still attempts applicant ack when OPS_ALERT_EMAILS is empty", async () => {
    delete process.env["OPS_ALERT_EMAILS"]
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await submitSellerInquiry(makeFormData())

    expect(infoSpy).toHaveBeenCalled()
    const infoArg = infoSpy.mock.calls[0]![0] as { event?: string; reason?: string }
    expect(infoArg.event).toBe("email_notification_skipped")
    expect(infoArg.reason).toBe("missing_ops_recipients")

    // Applicant send was still attempted (disabled-mode skip log emitted exactly once):
    const skipCalls = logSpy.mock.calls.filter((c) => c[0] === "email_notification_skipped")
    expect(skipCalls).toHaveLength(1)
  })

  it("rejects when a required field is missing", async () => {
    const { submitSellerInquiry } = await import("../../src/app/seller/apply/actions.js")
    await expect(submitSellerInquiry(makeFormData({ name: "" }))).rejects.toThrow(
      /All required fields/,
    )
  })
})
```

- [ ] **Step 3:** Run web tests:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/web test --run
```

Expected: green; the action and singleton + template tests all pass.

- [ ] **Step 4:** Commit:

```bash
git add apps/web/src/app/seller/apply/actions.ts apps/web/tests/seller-inquiries/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(web): wire submitSellerInquiry to applicant + ops emails

Replaces the console.log stub. Insert returns id; both sends are
awaited with per-recipient try/catch; applicant ack is still attempted
when OPS_ALERT_EMAILS is missing. PII rule preserved (bodies never
logged; only event metadata).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — `apps/admin` payout-created feature (Tasks 21–23)

### Task 21: Create `apps/admin/src/lib/mailer.ts` with tests (identical shape to web)

**Files:**

- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/lib/mailer.ts`
- Create: `apps/admin/tests/lib/mailer.test.ts`

- [ ] **Step 1:** Add `"@bomy/mailer": "workspace:*"` to `apps/admin/package.json` dependencies, then `pnpm install`.

- [ ] **Step 2:** Create `apps/admin/src/lib/mailer.ts` with the **same body** as `apps/web/src/lib/mailer.ts` from Task 18 (verbatim — both files have identical content).

- [ ] **Step 3:** Create `apps/admin/tests/lib/mailer.test.ts` with the **same body** as `apps/web/tests/lib/mailer.test.ts` from Task 18, except the import paths change from `apps/web` to `apps/admin`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SAVED_ENV = { ...process.env }

describe("getMailer — lazy singleton (admin)", () => {
  beforeEach(async () => {
    vi.resetModules()
    const mod = await import("../../src/lib/mailer.js")
    mod.resetMailerForTests()
  })
  afterEach(() => {
    process.env = { ...SAVED_ENV }
  })

  it("returns a disabled no-op mailer when EMAIL_DELIVERY_ENABLED is unset", async () => {
    delete process.env["EMAIL_DELIVERY_ENABLED"]
    const { getMailer } = await import("../../src/lib/mailer.js")
    const m = getMailer()
    await expect(m.sendMail({ to: "a@b.com", subject: "x", text: "y" })).resolves.toBeUndefined()
  })

  it("caches the singleton instance across calls", async () => {
    delete process.env["EMAIL_DELIVERY_ENABLED"]
    const { getMailer } = await import("../../src/lib/mailer.js")
    expect(getMailer()).toBe(getMailer())
  })

  it("falls back to disabled no-op and logs mailer_config_invalid on bad enabled config", async () => {
    process.env["EMAIL_DELIVERY_ENABLED"] = "true"
    delete process.env["SMTP_HOST"]
    delete process.env["MAIL_FROM"]
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getMailer } = await import("../../src/lib/mailer.js")
    const m = getMailer()
    await expect(m.sendMail({ to: "a@b.com", subject: "x", text: "y" })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    const firstCall = errorSpy.mock.calls[0]![0] as { event?: string }
    expect(firstCall.event).toBe("mailer_config_invalid")
    errorSpy.mockRestore()
  })
})
```

- [ ] **Step 4:** Run admin tests:

```bash
pnpm --filter @bomy/admin test mailer.test --run
```

Expected: 3 pass.

- [ ] **Step 5:** Commit:

```bash
git add apps/admin/package.json apps/admin/src/lib/mailer.ts apps/admin/tests/lib/mailer.test.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(admin): lazy mailer singleton with misconfig fallback

Same shape as apps/web/src/lib/mailer.ts. Server actions never 500
because of bad SMTP env.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Create `apps/admin/src/notifications/payout.ts` with content tests

**Files:**

- Create: `apps/admin/src/notifications/payout.ts`
- Create: `apps/admin/tests/notifications/payout.test.ts`

- [ ] **Step 1:** Write failing tests at `apps/admin/tests/notifications/payout.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import type { Mailer } from "@bomy/mailer"
import { sendPayoutPendingEmail } from "../../src/notifications/payout.js"

function makeMailer() {
  const sendMail = vi.fn().mockResolvedValue(undefined)
  const mailer: Mailer = { sendMail, close: vi.fn() }
  return { mailer, sendMail }
}

const CTX = {
  orderId: "12345678-aaaa-bbbb-cccc-deadbeefcafe",
  sellerEmail: "seller@example.com",
  amountSen: 5000n,
  currency: "MYR",
}

describe("sendPayoutPendingEmail", () => {
  it("subject contains the RM amount and the first 8 chars of the order id", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const args = sendMail.mock.calls[0]![0]
    expect(args.subject).toContain("RM 50.00")
    expect(args.subject).toContain("12345678")
    expect(args.subject).not.toContain(CTX.orderId) // full UUID not in subject
  })

  it("body has the full UUID in the dashboard link path", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body).toContain(
      `https://app.brandsofmalaysia.com/seller/dashboard/orders/${CTX.orderId}`,
    )
  })

  it("sends to the seller email", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    expect(sendMail.mock.calls[0]![0].to).toBe("seller@example.com")
  })

  it("does not include bomyCommissionSen or 'commission' in the body", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body.toLowerCase()).not.toContain("commission")
  })

  it("does not promise a specific SLA (e.g. '3-5 business days')", async () => {
    const { mailer, sendMail } = makeMailer()
    await sendPayoutPendingEmail(mailer, CTX, { appUrl: "https://app.brandsofmalaysia.com" })
    const body = sendMail.mock.calls[0]![0].text as string
    expect(body.toLowerCase()).not.toMatch(/business days?/i)
    expect(body.toLowerCase()).not.toMatch(/\d+ ?-? ?\d+ ?days/i)
  })
})
```

- [ ] **Step 2:** Run — expect failure:

```bash
pnpm --filter @bomy/admin test payout.test --run
```

- [ ] **Step 3:** Create `apps/admin/src/notifications/payout.ts`:

```ts
import { joinUrl, type Mailer } from "@bomy/mailer"

function senToMyrStr(sen: bigint): string {
  const whole = sen / 100n
  const cents = sen % 100n
  return `${whole}.${cents.toString().padStart(2, "0")}`
}

export async function sendPayoutPendingEmail(
  mailer: Mailer,
  ctx: { orderId: string; sellerEmail: string; amountSen: bigint; currency: string },
  env: { appUrl: string },
): Promise<void> {
  const shortOrderId = ctx.orderId.slice(0, 8)
  const dashboardUrl = joinUrl(env.appUrl, `/seller/dashboard/orders/${ctx.orderId}`)
  const amount = senToMyrStr(ctx.amountSen)

  await mailer.sendMail({
    to: ctx.sellerEmail,
    subject: `Payout of RM ${amount} for order ${shortOrderId} is pending`,
    text:
      `A payout of RM ${amount} (${ctx.currency}) is pending for order ${shortOrderId}.\n\n` +
      `Status: pending. Funds will be transferred manually.\n\n` +
      `View this order: ${dashboardUrl}`,
  })
}
```

- [ ] **Step 4:** Run:

```bash
pnpm --filter @bomy/admin test payout.test --run
```

Expected: 5 pass.

- [ ] **Step 5:** Commit:

```bash
git add apps/admin/src/notifications/payout.ts apps/admin/tests/notifications/payout.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): payout-pending email template

Subject shows short (8-char) order id; body has the full UUID in the
dashboard link. No SLA promise; no commission disclosure.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: Wire `createPayoutRecord` to dispatch the payout-pending email

**Files:**

- Modify: `apps/admin/src/app/payouts/actions.ts`
- Modify: `apps/admin/tests/payouts/actions.test.ts`

- [ ] **Step 1:** Add the new test cases to `apps/admin/tests/payouts/actions.test.ts` (existing file — append after current describe blocks):

```ts
describe("createPayoutRecord — email dispatch", () => {
  beforeEach(async () => {
    vi.resetModules()
    const mailerMod = await import("../../src/lib/mailer.js")
    mailerMod.resetMailerForTests()
  })

  it("sends a payout-pending email to the seller on the happy path", async () => {
    // Seed: a completed order with positive seller_payout_sen, owned by a seller user with email.
    // Run createPayoutRecord(orderId); assert mailer.sendMail called once, to the seller's email.
    // (Use the same seeding helpers as the existing tests in this file.)
  })

  it("does not send an email when the order is not payable (NOT_PAYABLE)", async () => {
    // Seed: completed order with sellerPayoutSen = 0n.
    // Run createPayoutRecord(orderId); assert mailer.sendMail NOT called and result is NOT_PAYABLE.
  })

  it("does not send an email when an active payout already exists (ALREADY_EXISTS)", async () => {
    // Seed: completed order + existing pending payout.
    // Run createPayoutRecord(orderId); assert mailer.sendMail NOT called and result is ALREADY_EXISTS.
  })

  it("returns { ok: true } even if mailer.sendMail throws", async () => {
    // Inject a mailer mock that rejects; run the happy path; assert result.ok === true
    // and console.error was called with event: email_notification_failed.
  })
})
```

**Note:** the test bodies above are templates — fill the seeding steps using the same conventions you find in the existing tests in this file (look for `seedOrder`/`seedPayout`/`withAdmin` calls already present). Inject the mailer via `vi.spyOn` on `getMailer()` from `../../src/lib/mailer.js`, or by setting `EMAIL_DELIVERY_ENABLED=false` and asserting via `console.log` spies (disabled-mode skip log path).

- [ ] **Step 2:** Run — expect failure (no email logic in actions.ts yet):

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/admin test actions.test --run
```

- [ ] **Step 3:** Modify `apps/admin/src/app/payouts/actions.ts`. After the existing `withAdmin(...)` call that returns `result`, but before `if (result.ok) revalidatePath("/payouts")`, add the hydrate-and-send block. The full updated `createPayoutRecord` function:

```ts
export async function createPayoutRecord(orderId: string): Promise<CreateResult> {
  const session = await auth()
  let adminId: string
  try {
    adminId = requireRole(session, [...PAYOUT_ROLES])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "FORBIDDEN") return { ok: false, error: "FORBIDDEN" }
    return { ok: false, error: "UNAUTHENTICATED" }
  }

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin createPayoutRecord" },
    async (tx): Promise<CreateResult> => {
      // (existing locking SELECT + checks + insert — unchanged)
      // ...
      const [inserted] = await tx
        .insert(schema.orderPayouts)
        .values({
          orderId,
          amountSen: order.sellerPayoutSen,
          currency: order.currency,
          status: "pending",
          triggeredBy: adminId,
        })
        .returning({ id: schema.orderPayouts.id })

      return { ok: true, payoutId: inserted!.id }
    },
  )

  if (result.ok) {
    const owner = alias(schema.users, "owner")
    const [ctx] = await withAdmin(
      getDb(),
      { userId: adminId, reason: "payout: hydrate notification context" },
      async (tx) =>
        tx
          .select({
            orderId: schema.orders.id,
            sellerEmail: owner.email,
            amountSen: schema.orderPayouts.amountSen,
            currency: schema.orderPayouts.currency,
          })
          .from(schema.orderPayouts)
          .innerJoin(schema.orders, eq(schema.orderPayouts.orderId, schema.orders.id))
          .innerJoin(schema.stores, eq(schema.orders.storeId, schema.stores.id))
          .innerJoin(owner, eq(schema.stores.ownerId, owner.id))
          .where(eq(schema.orderPayouts.id, result.payoutId))
          .limit(1),
    )

    if (ctx) {
      const mailer = getMailer()
      try {
        await sendPayoutPendingEmail(mailer, ctx, { appUrl: process.env["APP_URL"] ?? "" })
      } catch (err) {
        console.error({
          event: "email_notification_failed",
          payoutId: result.payoutId,
          sellerEmail: ctx.sellerEmail,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    revalidatePath("/payouts")
  }
  return result
}
```

Imports to add at the top of the file:

```ts
import { alias } from "drizzle-orm/pg-core"
import { getMailer } from "@/lib/mailer"
import { sendPayoutPendingEmail } from "@/notifications/payout"
```

(Adjust `@/...` aliases per `apps/admin/tsconfig.json`'s `paths`.)

- [ ] **Step 4:** Run admin tests with DB env vars set (see Step 2):

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm --filter @bomy/admin test --run
```

Expected: green; all existing tests still pass.

- [ ] **Step 5:** Commit:

```bash
git add apps/admin/src/app/payouts/actions.ts apps/admin/tests/payouts/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): payout-pending email on createPayoutRecord success

Hydrates seller email + payout context via a separate withAdmin read
(does not extend the locking SELECT). Awaited send with per-send
try/catch — email failure does not change the action result.
No email on ALREADY_EXISTS, NOT_PAYABLE, NOT_FOUND, or state
transitions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Env examples + final sweep (Tasks 24–26)

### Task 24: Update `.env.example`, `apps/api/.env.local.example`, `apps/web/.env.local.example`, `apps/admin/.env.local.example`

**Files:**

- Modify: `.env.example`
- Modify: `apps/api/.env.local.example`
- Modify: `apps/web/.env.local.example`
- Modify: `apps/admin/.env.local.example`

For each file, the block to add (or extend) is:

```env
# --- Email / notifications ---
# Set EMAIL_DELIVERY_ENABLED=true in environments where you want real SMTP delivery.
# Default (false/unset) uses a no-op mailer that logs subject+to only (PII safe).
EMAIL_DELIVERY_ENABLED=false
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
# Auth (optional — leave both empty for local Mailhog):
# SMTP_USER=
# SMTP_PASS=
MAIL_FROM="BOMY <noreply@brandsofmalaysia.com>"
# MAIL_REPLY_TO=
# Comma-separated ops recipients for [BOMY Ops] alerts (seller inquiry, order_review, voucher_claim_failed):
OPS_ALERT_EMAILS=
# URLs used in email body templates:
APP_URL=http://localhost:3000
ADMIN_URL=http://localhost:3002
```

- [ ] **Step 1:** Edit `.env.example` (root master) — add the missing keys. Keep the existing `MAILHOG_*` block, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and `APP_URL`. Add (above or below as appropriate): `EMAIL_DELIVERY_ENABLED`, `MAIL_FROM`, `MAIL_REPLY_TO`, `OPS_ALERT_EMAILS`, `ADMIN_URL`.

- [ ] **Step 2:** Edit `apps/api/.env.local.example` — currently has only `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`. Append the rest of the notification block.

- [ ] **Step 3:** Edit `apps/web/.env.local.example` — currently has `APP_URL`. Append the full block minus `APP_URL` (already present).

- [ ] **Step 4:** Edit `apps/admin/.env.local.example` — currently empty of mail vars. Append the entire notification block.

- [ ] **Step 5:** Confirm `infra/docker/.env.example` is unchanged (it stays infra-only — Mailhog ports). Verify:

```bash
git diff infra/docker/.env.example
```

Expected: no output (no diff).

- [ ] **Step 6:** Commit:

```bash
git add .env.example apps/api/.env.local.example apps/web/.env.local.example apps/admin/.env.local.example
git commit -m "$(cat <<'EOF'
chore(env): document notification env contract in all .env examples

EMAIL_DELIVERY_ENABLED + SMTP_* + MAIL_FROM + MAIL_REPLY_TO +
OPS_ALERT_EMAILS + APP_URL + ADMIN_URL added to root + each app's
.env.local.example. infra/docker/.env.example stays infra-only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Full workspace sweep — lint, typecheck, test

**Files:** none (verification)

- [ ] **Step 1:** Run lint at the root:

```bash
pnpm lint
```

Expected: zero warnings (`--max-warnings 0` enforced via Turbo).

- [ ] **Step 2:** Run typecheck at the root:

```bash
pnpm typecheck
```

Expected: green.

- [ ] **Step 3:** Run the full test suite with DB env vars:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
  DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
  BOMY_RLS_READY=1 \
  pnpm test
```

Expected: every workspace's tests pass. Investigate and fix any failure before proceeding.

- [ ] **Step 4:** Run prettier write to fix any formatting drift:

```bash
pnpm format
```

If any files change, stage and commit:

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore: prettier sweep after PR #35 changes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If nothing changed, skip the commit.

---

### Task 26: Manual smoke test (recorded in PR description, not committed)

**Files:** none (manual validation only)

The PR description body must include the smoke results — see §6.5 of the spec for the script. The four steps:

- [ ] **Step 1:** Bring up local infra:

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
```

Confirm Mailhog UI: `http://localhost:8025`.

- [ ] **Step 2:** Set the mail env for dev runs (export inline or use `apps/*/.env.local`):

```bash
export EMAIL_DELIVERY_ENABLED=true
export SMTP_HOST=localhost
export SMTP_PORT=1025
export SMTP_SECURE=false
export MAIL_FROM="BOMY <noreply@brandsofmalaysia.com>"
export APP_URL=http://localhost:3000
export ADMIN_URL=http://localhost:3002
export OPS_ALERT_EMAILS=ops@brandsofmalaysia.com
```

Start dev:

```bash
pnpm dev
```

- [ ] **Step 3:** Exercise each surface and record screenshots/log snippets:
  1. **Web — seller inquiry:** open `http://localhost:3000/seller/apply`, fill and submit. Confirm Mailhog shows two messages (applicant ack + ops alert).
  2. **API — voucher issuance:** with at least one active member subscription in the DB, call `POST http://localhost:3001/internal/jobs/voucher-issuance` with header `Authorization: Bearer <INTERNAL_API_SECRET>`. Confirm Mailhog shows one message per active member; api logs show `voucher_issuance_summary` with non-zero `sent`.
  3. **Admin — payout:** sign in as `bomy_admin` or `bomy_finance`, navigate to a completed order with positive `sellerPayoutSen`, click "Create Payout". Confirm Mailhog shows one seller-payout-pending message; admin UI shows the new payout.

- [ ] **Step 4:** Save the smoke results to use in the PR description body (under a "## Manual smoke" heading). After PR merge, mirror the results into `app/log/2026-05-XX_PR35_remaining-email-stubs.md` per the log-cadence rule.

No commit (manual step only).

---

## Self-review (run by the author)

This is a checklist the writer ran after the plan was drafted; no work for the implementer here.

**Spec coverage:** every numbered section of `docs/superpowers/specs/2026-05-25-pr35-mailer-package-stubs.md` is implemented by one or more tasks:

- §2.1–2.2 `packages/mailer` scaffold + `configFromEnv` → Tasks 1–5
- §2.3 `apps/api` migration to `@bomy/mailer` → Tasks 6–10
- §2.4 lazy singletons (web/admin) → Tasks 18 + 21
- §3 env examples → Task 24
- §4.1 seller inquiry → Tasks 19–20
- §4.2 voucher issuance (incl. `dispatchVoucherEmails`, `JobLogger`, scheduler plumbing) → Tasks 12–17
- §4.3 payout created → Tasks 22–23
- §5 error handling + PII rule → covered inline in Tasks 13–14, 19–20, 22–23 templates and test assertions
- §6 test plan → Tasks 2, 3, 4, 13, 14, 15, 18, 19, 20, 21, 22, 23
- §7 file map → covered cumulatively
- §8 out of scope → explicitly _not_ implemented (verified by absence of corresponding tasks)
- §9 known gaps → documented in the spec; no implementation needed

**Placeholders scan:** zero `TBD` / `TODO` / "fill in later" markers in steps. Step 23.1's test bodies leave seeding to "the existing test conventions in this file" — that's intentional because the file's seeding helpers are not visible at planning time; the directive is concrete (mock the mailer or rely on the disabled-mode path) and the test cases themselves are fully specified.

**Type consistency:** `JobLogger` shape is `info/warn/error(obj, msg)` everywhere (Tasks 12 + 14 + 16). `IssuedVoucher` and `DispatchSummary` defined once (Task 12) and re-used. `Mailer`/`MailerConfig` exported from `@bomy/mailer` and re-exported by the api shim (Task 6) and imported by every consumer.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-pr35-mailer-package-stubs.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task with the two-stage review pattern. Fast iteration; each subagent gets exactly one task and the spec, then returns with a diff for review. Ideal for a multi-task plan like this where each task is independently verifiable.

**2. Inline Execution** — execute the tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints; lower context overhead but slower per task.

Which approach?
