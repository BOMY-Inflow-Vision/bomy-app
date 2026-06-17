# PR #36 — `checkout_enabled` flip runbook + `platform-config-flip` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a generic, audit-emitting `platform-config-flip` ops script under `@bomy/db` plus the canonical `checkout_enabled` operational runbook. The flag itself stays `false` in committed seeds; the runbook documents how to flip it operationally on local or future staging.

**Architecture:** Three-module split inside `packages/db/scripts/ops/` — pure helpers (arg parsing, JSON parsing, UUID shape), DI'd core (`runPlatformConfigFlip(db, args)`), and a thin CLI wrapper that touches `process.argv`/`process.exit`. Tests live alongside in `packages/db/tests/scripts/` and reuse the package's existing vitest config. The runbook is plain markdown under a new `docs/runbooks/` directory.

**Tech Stack:** TypeScript (NodeNext modules), Drizzle ORM, postgres-js, tsx as runtime, vitest, eslint (typescript-eslint), pnpm workspaces, Turborepo.

**Spec:** `docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md`

---

## File structure

### New files

| Path                                                                 | Purpose                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db/scripts/ops/platform-config-flip-args.ts`               | Pure helpers: `parseArgs`, `parseValue`, `validateUuidShape`, error classes (`UsageError`, `ActorError`, `KeyMissingError`, `DbError`). No env, no DB.                                                                   |
| `packages/db/scripts/ops/platform-config-flip-core.ts`               | `runPlatformConfigFlip(db, args)` — DI'd core. Performs actor lookup (withTenant), key pre-read (withTenant), and the write (withAdmin: UPDATE + audit insert). Throws typed errors on validation. Returns `FlipResult`. |
| `packages/db/scripts/ops/platform-config-flip.ts`                    | Thin CLI wrapper. Reads `process.argv`, builds DB via `makeDb()`, calls core, formats stdout/stderr, calls `process.exit` with the appropriate code (0 success / 1 validation / 2 db).                                   |
| `packages/db/tests/scripts/platform-config-flip-args.test.ts`        | Unit tests for pure helpers. No DB.                                                                                                                                                                                      |
| `packages/db/tests/scripts/platform-config-flip-integration.test.ts` | One DB-gated integration test (BOMY_RLS_READY=1 + DATABASE_APP_URL). Uses the limited `bomy_app` role.                                                                                                                   |
| `docs/runbooks/README.md`                                            | One-paragraph explainer of the directory pattern (procedures vs evidence).                                                                                                                                               |
| `docs/runbooks/evidence/README.md`                                   | Evidence pattern + redaction rules (cribbed from spec §8.8).                                                                                                                                                             |
| `docs/runbooks/checkout-enabled-flip.md`                             | The actual runbook per spec §8.1–§8.10.                                                                                                                                                                                  |

### Modified files

| Path                           | Change                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db/package.json`     | Add `tsx` to `devDependencies`. Change `lint` from `eslint src tests --max-warnings 0` to `eslint src tests scripts --max-warnings 0`. Add `"ops:platform-config:set": "tsx scripts/ops/platform-config-flip.ts"`. |
| `packages/db/tsconfig.json`    | Extend `include` from `["src/**/*", "tests/**/*", "*.ts", "*.mts"]` to `["src/**/*", "tests/**/*", "scripts/**/*", "*.ts", "*.mts"]`.                                                                              |
| `packages/db/eslint.config.js` | Narrow ignores from `"scripts/**"` to `"scripts/migrate.mjs"` (the legacy plain-ESM script that doesn't need to be linted).                                                                                        |
| `package.json` (root)          | Add `"ops:platform-config:set": "pnpm --filter @bomy/db ops:platform-config:set"`.                                                                                                                                 |

### Total: 8 new files, 4 modified files.

---

## Conventions used throughout

- Commits use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Each task ends with a commit.
- Co-author trailer on every commit: `Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>`.
- Tests use vitest's `describe`/`it`/`expect`. Web-style integration tests guard with `describe.skipIf(!shouldRun)`.
- Files use `.js` extension in imports per NodeNext ESM convention (e.g. `import { ... } from "./args.js"`).
- All UUIDs in test fixtures are generated via `randomUUID()` from `node:crypto` — no static UUIDs.

---

## Task 1: Toolchain prep — wire `@bomy/db` to host TS scripts

**Files:**

- Modify: `packages/db/package.json`
- Modify: `packages/db/tsconfig.json`
- Modify: `packages/db/eslint.config.js`
- Modify: `package.json` (root)

- [ ] **Step 1.1: Add tsx to db devDeps, add package script**

Open `packages/db/package.json`. Make two changes (the `lint` script stays unchanged in this task — see note below):

```json
{
  "scripts": {
    "lint": "eslint src tests --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "node scripts/migrate.mjs",
    "ops:platform-config:set": "tsx scripts/ops/platform-config-flip.ts",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "devDependencies": {
    "@bomy/config": "workspace:*",
    "@types/node": "^20.17.0",
    "drizzle-kit": "^0.28.1",
    "tsx": "^4.19.3",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.32.1",
    "vitest": "^2.1.9"
  }
}
```

Two changes vs. current: a new `ops:platform-config:set` line is added between `migrate` and `db:generate`, and `tsx` is inserted into devDependencies in alphabetical order.

> **Note on the `lint` script.** ESLint 9 exits 2 if a glob target matches only ignored files — meaning `eslint src tests scripts` would fail in Task 1 because `scripts/` only contains the ignored `migrate.mjs` at this point. The widening to `eslint src tests scripts --max-warnings 0` is deferred to Task 2, executed atomically with the creation of the first TS file under `scripts/ops/`. This is a plan ordering correction, not an open issue.

- [ ] **Step 1.2: Extend tsconfig include**

Open `packages/db/tsconfig.json`. Change the `include` array:

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
  "include": ["src/**/*", "tests/**/*", "scripts/**/*", "*.ts", "*.mts"],
  "exclude": ["node_modules", "dist"]
}
```

Only `scripts/**/*` is added to `include`.

- [ ] **Step 1.3: Narrow eslint ignores**

Open `packages/db/eslint.config.js`. Change the `ignores` line:

```js
import { node } from "@bomy/config/eslint"
import tseslint from "typescript-eslint"

export default tseslint.config(...node, {
  ignores: ["node_modules/**", "dist/**", "scripts/migrate.mjs"],
})
```

Only the `scripts/**` entry changes — it becomes `scripts/migrate.mjs` (specific file path).

- [ ] **Step 1.4: Add root delegate**

Open root `package.json`. Add `ops:platform-config:set` to the scripts block. The exact position should preserve alphabetical-ish order — typically right after the existing `lint`/`format`/`test` line group. Add the line below verbatim; if root scripts are currently sorted, slot it where alphabetical order dictates:

```json
"ops:platform-config:set": "pnpm --filter @bomy/db ops:platform-config:set"
```

- [ ] **Step 1.5: Install tsx**

Run: `pnpm install`
Expected: `tsx` installed under `packages/db/node_modules/tsx`. No errors.

- [ ] **Step 1.6: Verify toolchain still green (no new code yet)**

Run: `pnpm --filter @bomy/db lint && pnpm --filter @bomy/db typecheck && pnpm --filter @bomy/db test --run`
Expected: all three pass. (`scripts/` is empty other than `migrate.mjs` which is now individually ignored.)

- [ ] **Step 1.7: Commit**

```bash
git add packages/db/package.json packages/db/tsconfig.json packages/db/eslint.config.js package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(db): host TS ops scripts under @bomy/db

Adds tsx as a db devDep, extends tsconfig include to scripts/**/*,
narrows eslint ignore to just the legacy migrate.mjs, and updates
the lint script to cover scripts/. Adds ops:platform-config:set
script in the db package and a delegating root script.

Prep for PR #36 platform-config-flip ops tool.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure helpers + error classes — TDD

**Files:**

- Modify: `packages/db/package.json` (widen lint script — deferred from Task 1)
- Create: `packages/db/scripts/ops/platform-config-flip-args.ts`
- Create: `packages/db/tests/scripts/platform-config-flip-args.test.ts`

- [ ] **Step 2.0: Widen the db lint script (deferred from Task 1)**

Now that we're about to create the first TS file under `scripts/`, the lint script can safely widen. In `packages/db/package.json`, change:

```json
"lint": "eslint src tests --max-warnings 0",
```

to:

```json
"lint": "eslint src tests scripts --max-warnings 0",
```

Do NOT run lint yet — the file doesn't exist. The next steps create it. The widened lint will be verified at Step 2.5 after the implementation is in place.

- [ ] **Step 2.1: Write the failing tests**

Create `packages/db/tests/scripts/platform-config-flip-args.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  parseArgs,
  parseValue,
  validateUuidShape,
  UsageError,
} from "../../scripts/ops/platform-config-flip-args.js"

describe("parseArgs", () => {
  const baseArgv = [
    "--key",
    "checkout_enabled",
    "--value",
    "true",
    "--actor",
    "11111111-1111-1111-1111-111111111111",
    "--reason",
    "smoke test",
  ]

  it("returns all four args when all are present", () => {
    expect(parseArgs(baseArgv)).toEqual({
      key: "checkout_enabled",
      value: "true",
      actor: "11111111-1111-1111-1111-111111111111",
      reason: "smoke test",
    })
  })

  it.each([
    ["--key", baseArgv.filter((_, i) => i !== 0 && i !== 1)],
    ["--value", baseArgv.filter((_, i) => i !== 2 && i !== 3)],
    ["--actor", baseArgv.filter((_, i) => i !== 4 && i !== 5)],
    ["--reason", baseArgv.filter((_, i) => i !== 6 && i !== 7)],
  ])("rejects when %s is missing", (missingArg, argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError)
    expect(() => parseArgs(argv)).toThrow(new RegExp(missingArg))
  })

  it("rejects unknown --flag arguments", () => {
    expect(() => parseArgs([...baseArgv, "--foo", "bar"])).toThrow(UsageError)
    expect(() => parseArgs([...baseArgv, "--foo", "bar"])).toThrow(/unknown argument '--foo'/)
  })

  it("rejects bare positional arguments", () => {
    expect(() => parseArgs([...baseArgv, "extra"])).toThrow(UsageError)
    expect(() => parseArgs([...baseArgv, "extra"])).toThrow(/unknown argument 'extra'/)
  })
})

describe("parseValue", () => {
  it.each([
    ["true", true],
    ["false", false],
    ['"hello"', "hello"],
    ["123", 123],
    ['{"a":1}', { a: 1 }],
    ["null", null],
  ])("parses %s as valid JSON", (input, expected) => {
    expect(parseValue(input)).toEqual(expected)
  })

  it.each([["truee"], ["bare-string"], [""], ["{a:1}"]])("rejects %s as invalid JSON", (input) => {
    expect(() => parseValue(input)).toThrow(UsageError)
    expect(() => parseValue(input)).toThrow(/not valid JSON/)
  })
})

describe("validateUuidShape", () => {
  it.each([
    "11111111-1111-1111-1111-111111111111",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "00000000-0000-0000-0000-000000000001",
  ])("accepts %s", (uuid) => {
    expect(validateUuidShape(uuid)).toBe(true)
  })

  it.each(["abc", "11111111-1111-1111-1111", "not-a-uuid", "12345678901234567890", ""])(
    "rejects %s",
    (s) => {
      expect(validateUuidShape(s)).toBe(false)
    },
  )
})
```

- [ ] **Step 2.2: Run the tests to verify they fail**

Run: `pnpm --filter @bomy/db test --run tests/scripts/platform-config-flip-args.test.ts`
Expected: FAIL with module-not-found on `../../scripts/ops/platform-config-flip-args.js`.

- [ ] **Step 2.3: Write the implementation**

Create `packages/db/scripts/ops/platform-config-flip-args.ts`:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class UsageError extends Error {
  override readonly name = "UsageError"
}

export class ActorError extends Error {
  override readonly name = "ActorError"
}

export class KeyMissingError extends Error {
  override readonly name = "KeyMissingError"
}

export class DbError extends Error {
  override readonly name = "DbError"
}

export interface Args {
  key: string
  value: string
  actor: string
  reason: string
}

const KNOWN_FLAGS = new Set(["--key", "--value", "--actor", "--reason"])

export function parseArgs(argv: readonly string[]): Args {
  const out: Partial<Args> = {}

  let i = 0
  while (i < argv.length) {
    const token = argv[i]!
    if (!KNOWN_FLAGS.has(token)) {
      throw new UsageError(`unknown argument '${token}'.`)
    }
    const value = argv[i + 1]
    if (value === undefined || KNOWN_FLAGS.has(value)) {
      throw new UsageError(`missing value for ${token}.`)
    }
    const fieldName = token.slice(2) as keyof Args
    out[fieldName] = value
    i += 2
  }

  for (const flag of KNOWN_FLAGS) {
    const field = flag.slice(2) as keyof Args
    if (out[field] === undefined) {
      throw new UsageError(`missing required ${flag}.`)
    }
  }

  return out as Args
}

export function parseValue(input: string): unknown {
  if (input.length === 0) {
    throw new UsageError(`--value '' is not valid JSON.`)
  }
  try {
    return JSON.parse(input)
  } catch {
    throw new UsageError(`--value '${input}' is not valid JSON.`)
  }
}

export function validateUuidShape(s: string): boolean {
  return UUID_RE.test(s)
}
```

- [ ] **Step 2.4: Run the tests to verify they pass**

Run: `pnpm --filter @bomy/db test --run tests/scripts/platform-config-flip-args.test.ts`
Expected: All test cases pass (4 parseArgs cases, 6 parseValue accept + 4 reject, 3 UUID accept + 5 UUID reject).

- [ ] **Step 2.5: Lint + typecheck**

Run: `pnpm --filter @bomy/db lint && pnpm --filter @bomy/db typecheck`
Expected: both pass with zero warnings/errors.

- [ ] **Step 2.6: Commit**

```bash
git add packages/db/scripts/ops/platform-config-flip-args.ts packages/db/tests/scripts/platform-config-flip-args.test.ts
git commit -m "$(cat <<'EOF'
feat(db): pure arg + value helpers for platform-config-flip script

Adds parseArgs, parseValue, validateUuidShape, and the four typed
error classes (UsageError, ActorError, KeyMissingError, DbError)
under packages/db/scripts/ops/. Pure functions — no env, no DB —
fully unit-testable.

Rejects unknown args (--foo and bare positionals) so a typo never
silently no-ops on an ops invocation.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Integration test scaffold — write the failing test first

**Files:**

- Create: `packages/db/tests/scripts/platform-config-flip-integration.test.ts`

- [ ] **Step 3.1: Write the failing integration test**

Create `packages/db/tests/scripts/platform-config-flip-integration.test.ts`:

```ts
import { randomUUID } from "node:crypto"

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { makeDb, schema, withAdmin, withTenant } from "../../src/index.js"
import { eq, and } from "drizzle-orm"

import { runPlatformConfigFlip } from "../../scripts/ops/platform-config-flip-core.js"

const shouldRun = Boolean(process.env["DATABASE_APP_URL"]) && process.env["BOMY_RLS_READY"] === "1"

describe.skipIf(!shouldRun)("runPlatformConfigFlip — integration", () => {
  // Owner-role client for seeding (needs withAdmin to bypass RLS).
  let ownerDb: ReturnType<typeof makeDb>
  // Limited bomy_app client to exercise real RLS during the flip.
  let appDb: ReturnType<typeof makeDb>

  beforeAll(() => {
    ownerDb = makeDb({ url: process.env["DATABASE_URL"]! })
    appDb = makeDb({ url: process.env["DATABASE_APP_URL"]! })
  })

  // Per-test unique identifiers.
  let testKey: string
  let testReason: string
  let testActorId: string

  beforeEach(async () => {
    testKey = `__test_flip_${randomUUID()}`
    testReason = `integration test ${randomUUID()}`
    testActorId = randomUUID()

    // Seed actor + synthetic platform_config row under withAdmin.
    // This emits one admin_bypass_audit row (per tenant.ts:143) — fine;
    // assertions use narrow matchers (key + reason), not total counts.
    await withAdmin(
      ownerDb.db,
      { userId: "00000000-0000-0000-0000-000000000001", reason: "seed integration test" },
      async (tx) => {
        await tx.insert(schema.users).values({
          id: testActorId,
          email: `${testActorId}@test.bomy`,
          role: "bomy_admin",
        })
        await tx.insert(schema.platformConfig).values({
          key: testKey,
          value: false,
          description: "synthetic key for platform-config-flip integration test",
        })
      },
    )
  })

  afterEach(async () => {
    // Delete only the synthetic platform_config row.
    // platform_config_audit and admin_bypass_audit are append-only under RLS
    // (policies.sql:261-267 and :390-398) — leave those rows in place.
    await withAdmin(
      ownerDb.db,
      { userId: "00000000-0000-0000-0000-000000000001", reason: "cleanup integration test" },
      async (tx) => {
        await tx.delete(schema.platformConfig).where(eq(schema.platformConfig.key, testKey))
        await tx.delete(schema.users).where(eq(schema.users.id, testActorId))
      },
    )
  })

  it("flips the key, writes platform_config_audit + admin_bypass_audit rows under withAdmin", async () => {
    const result = await runPlatformConfigFlip(appDb.db, {
      key: testKey,
      value: "true",
      actor: testActorId,
      reason: testReason,
    })

    // Result shape
    expect(result.actor.id).toBe(testActorId)
    expect(result.actor.role).toBe("bomy_admin")
    expect(result.oldValue).toBe(false)
    expect(result.newValue).toBe(true)
    expect(result.platformConfigAuditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(result.changedAt).toBeInstanceOf(Date)

    // Assertion reads use withTenant under the seeded admin's real role —
    // avoids emitting incidental admin_bypass_audit rows mid-assertion.
    await withTenant(appDb.db, { userId: testActorId, userRole: "bomy_admin" }, async (tx) => {
      // platform_config now has value=true, updated_by=testActorId.
      const [row] = await tx
        .select()
        .from(schema.platformConfig)
        .where(eq(schema.platformConfig.key, testKey))
      expect(row?.value).toBe(true)
      expect(row?.updatedBy).toBe(testActorId)

      // Exactly one platform_config_audit row matching key + actor.
      const auditRows = await tx
        .select()
        .from(schema.platformConfigAudit)
        .where(
          and(
            eq(schema.platformConfigAudit.key, testKey),
            eq(schema.platformConfigAudit.changedBy, testActorId),
          ),
        )
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]!.oldValue).toBe(false)
      expect(auditRows[0]!.newValue).toBe(true)

      // Exactly one admin_bypass_audit row matching actor + unique reason.
      const bypassRows = await tx
        .select()
        .from(schema.adminBypassAudit)
        .where(
          and(
            eq(schema.adminBypassAudit.actorUserId, testActorId),
            eq(schema.adminBypassAudit.reason, testReason),
          ),
        )
      expect(bypassRows).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/db test --run tests/scripts/platform-config-flip-integration.test.ts
```

Expected: FAIL with module-not-found on `../../scripts/ops/platform-config-flip-core.js`.

- [ ] **Step 3.3: Commit the failing test**

```bash
git add packages/db/tests/scripts/platform-config-flip-integration.test.ts
git commit -m "$(cat <<'EOF'
test(db): failing integration test for runPlatformConfigFlip

Seeds a synthetic platform_config row + bomy_admin user via withAdmin,
then exercises the core function under the bomy_app limited role to
prove RLS actually fires. Assertions use narrow unique-identifier
matchers (key + per-run reason) not total-count deltas, so seed/
cleanup withAdmin calls don't pollute the assertion.

Cleanup deletes only the synthetic platform_config and users rows;
audit tables are append-only under RLS per policies.sql:261-267 and
:390-398.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Core function — make the integration test pass

**Files:**

- Create: `packages/db/scripts/ops/platform-config-flip-core.ts`

- [ ] **Step 4.1: Write the core implementation**

Create `packages/db/scripts/ops/platform-config-flip-core.ts`:

```ts
import { eq } from "drizzle-orm"

import { schema, withAdmin, withTenant, type Database } from "../../src/index.js"

import {
  ActorError,
  DbError,
  KeyMissingError,
  UsageError,
  parseValue,
  validateUuidShape,
  type Args,
} from "./platform-config-flip-args.js"

const ADMIN_ROLES = ["bomy_ops", "bomy_admin", "bomy_finance"] as const
type AdminRole = (typeof ADMIN_ROLES)[number]

function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

export interface FlipResult {
  actor: { id: string; email: string; role: AdminRole }
  key: string
  oldValue: unknown
  newValue: unknown
  platformConfigAuditId: string
  changedAt: Date
}

export async function runPlatformConfigFlip(db: Database, args: Args): Promise<FlipResult> {
  // 1. Validate args shape (the wrapper already runs parseArgs, but defense in depth).
  if (!validateUuidShape(args.actor)) {
    throw new UsageError(`--actor '${args.actor}' is not a UUID-shaped string.`)
  }
  if (!args.reason.trim()) {
    throw new UsageError(`--reason must be non-empty.`)
  }

  // parseValue throws UsageError on invalid JSON.
  const newValue = parseValue(args.value)

  // 2. Actor lookup under withTenant with lowest-privilege role.
  // The users row-self-select RLS policy lets a user read their own row regardless
  // of their actual role, so "buyer" is safe for the lookup itself.
  const actorRows = await withTenant(db, { userId: args.actor, userRole: "buyer" }, async (tx) =>
    tx
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, args.actor)),
  )

  const actorRow = actorRows[0]
  if (!actorRow) {
    throw new ActorError(`--actor ${args.actor} not found in users table.`)
  }
  if (!isAdminRole(actorRow.role)) {
    throw new ActorError(
      `--actor ${args.actor} has role '${actorRow.role}'; must be one of bomy_ops / bomy_admin / bomy_finance.`,
    )
  }
  const actor = { id: actorRow.id, email: actorRow.email, role: actorRow.role }

  // 3. Key pre-read under withTenant using the actor's real role.
  // Confirms the key exists AND that the actor can see platform_config under RLS.
  const keyRows = await withTenant(db, { userId: actor.id, userRole: actor.role }, async (tx) =>
    tx
      .select({ id: schema.platformConfig.id, value: schema.platformConfig.value })
      .from(schema.platformConfig)
      .where(eq(schema.platformConfig.key, args.key)),
  )

  const keyRow = keyRows[0]
  if (!keyRow) {
    throw new KeyMissingError(
      `--key '${args.key}' does not exist in platform_config. Refusing to create new keys.`,
    )
  }
  const oldValue = keyRow.value

  // 4. Write under withAdmin — updates platform_config, writes platform_config_audit.
  //    withAdmin itself writes admin_bypass_audit in the same transaction.
  const writeResult = await withAdmin(db, { userId: actor.id, reason: args.reason }, async (tx) => {
    const [updated] = await tx
      .update(schema.platformConfig)
      .set({ value: newValue, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(schema.platformConfig.key, args.key))
      .returning({ id: schema.platformConfig.id, value: schema.platformConfig.value })

    if (!updated) {
      throw new DbError(`UPDATE on platform_config returned no rows for key '${args.key}'.`)
    }

    const [auditRow] = await tx
      .insert(schema.platformConfigAudit)
      .values({
        configId: updated.id,
        key: args.key,
        oldValue: oldValue,
        newValue: updated.value,
        changedBy: actor.id,
      })
      .returning({
        id: schema.platformConfigAudit.id,
        changedAt: schema.platformConfigAudit.changedAt,
      })

    if (!auditRow) {
      throw new DbError("INSERT on platform_config_audit returned no row.")
    }

    return { newValue: updated.value, auditRow }
  })

  return {
    actor,
    key: args.key,
    oldValue,
    newValue: writeResult.newValue,
    platformConfigAuditId: writeResult.auditRow.id,
    changedAt: writeResult.auditRow.changedAt,
  }
}
```

- [ ] **Step 4.2: Run the integration test to verify it passes**

Run:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm --filter @bomy/db test --run tests/scripts/platform-config-flip-integration.test.ts
```

Expected: PASS — one test, "flips the key, writes platform_config_audit + admin_bypass_audit rows under withAdmin".

- [ ] **Step 4.3: Lint + typecheck**

Run: `pnpm --filter @bomy/db lint && pnpm --filter @bomy/db typecheck`
Expected: both pass.

- [ ] **Step 4.4: Commit**

```bash
git add packages/db/scripts/ops/platform-config-flip-core.ts
git commit -m "$(cat <<'EOF'
feat(db): runPlatformConfigFlip core function

Actor lookup runs under withTenant (buyer role — row-self-select),
then a key pre-read under withTenant (actor's real role) confirms
the key exists. The write runs inside one withAdmin transaction
that UPDATEs platform_config (value + updated_by + updated_at) and
INSERTs into platform_config_audit. withAdmin itself writes the
admin_bypass_audit row.

Returns a FlipResult with the actor, old/new values, the
platform_config_audit row id, and changedAt. Throws typed errors
(UsageError / ActorError / KeyMissingError / DbError) on every
validation failure path.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CLI wrapper — process.argv → core → process.exit

**Files:**

- Create: `packages/db/scripts/ops/platform-config-flip.ts`

- [ ] **Step 5.1: Write the CLI wrapper**

Create `packages/db/scripts/ops/platform-config-flip.ts`:

```ts
#!/usr/bin/env tsx

import { makeDb } from "../../src/index.js"

import {
  ActorError,
  DbError,
  KeyMissingError,
  UsageError,
  parseArgs,
} from "./platform-config-flip-args.js"
import { runPlatformConfigFlip } from "./platform-config-flip-core.js"

const USAGE = `Usage: pnpm ops:platform-config:set \\
  --key <existing platform_config key> \\
  --value <JSON value: true | false | "..." | 123 | {...}> \\
  --actor <admin user UUID> \\
  --reason "<short human-readable reason>"

All four arguments are required. The actor must exist and have role
in bomy_ops / bomy_admin / bomy_finance. The key must already exist
in platform_config — this script does not create new keys.`

async function main(): Promise<number> {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`Error: ${err.message}\n\n${USAGE}\n`)
      return 1
    }
    throw err
  }

  let dbClient
  try {
    dbClient = makeDb()
  } catch (err) {
    process.stderr.write(
      `Error: failed to construct DB client: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 2
  }

  try {
    const hostHint = process.env["DATABASE_URL"]?.replace(/:[^@/]+@/, ":***@") ?? "<unset>"
    process.stdout.write(`Connecting to ${hostHint}...\n`)

    const result = await runPlatformConfigFlip(dbClient.db, args)

    process.stdout.write(
      `Resolved actor: ${result.actor.email} (${result.actor.role}, uuid: ${result.actor.id})\n`,
    )
    process.stdout.write(`Key '${result.key}':\n`)
    process.stdout.write(`  before: ${JSON.stringify(result.oldValue)}\n`)
    process.stdout.write(`  after:  ${JSON.stringify(result.newValue)}\n`)
    process.stdout.write(
      `Platform config audit row: ${result.platformConfigAuditId} @ ${result.changedAt.toISOString()}\n`,
    )
    process.stdout.write(
      `Admin bypass audit: written by withAdmin for actor ${result.actor.id} reason "${args.reason}"\n`,
    )
    return 0
  } catch (err) {
    if (err instanceof UsageError || err instanceof ActorError || err instanceof KeyMissingError) {
      process.stderr.write(`Error: ${err.message}\n`)
      return 1
    }
    if (err instanceof DbError) {
      process.stderr.write(`Error: ${err.message}\n`)
      return 2
    }
    process.stderr.write(
      `Error: unexpected failure: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 2
  } finally {
    await dbClient.close()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(
      `Fatal: ${err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err)}\n`,
    )
    process.exit(2)
  })
```

- [ ] **Step 5.2: Manual smoke (failure paths)**

The wrapper is intentionally untested by vitest (the spec calls this out — subprocess test adds complexity for no signal). Verify the failure paths manually.

Run: `pnpm --filter @bomy/db ops:platform-config:set`
Expected: stderr shows `Error: missing required --key.` followed by USAGE block; exit code 1.

Run: `pnpm --filter @bomy/db ops:platform-config:set --key checkout_enabled --value true --actor abc --reason "smoke"`
Expected: stderr shows `Error: --actor 'abc' is not a UUID-shaped string.`; exit code 1.

Run: `pnpm --filter @bomy/db ops:platform-config:set --foo bar`
Expected: stderr shows `Error: unknown argument '--foo'.` plus USAGE; exit code 1.

- [ ] **Step 5.3: Manual smoke (happy path)**

This actually flips and rolls back. Requires Docker stack up (`docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d`). Capture your admin UUID via `psql $DATABASE_URL -c "SELECT id, email, role FROM users WHERE role IN ('bomy_ops','bomy_admin','bomy_finance') LIMIT 1;"`.

Run a forward flip on `checkout_enabled` and immediately roll back:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
pnpm --filter @bomy/db ops:platform-config:set \
  --key checkout_enabled \
  --value true \
  --actor <admin-uuid> \
  --reason "PR #36 smoke — forward flip"
```

Expected stdout (host masked):

```
Connecting to postgresql://bomy:***@localhost:5432/bomy...
Resolved actor: <email> (<role>, uuid: <uuid>)
Key 'checkout_enabled':
  before: false
  after:  true
Platform config audit row: <uuid> @ <ISO timestamp>
Admin bypass audit: written by withAdmin for actor <uuid> reason "PR #36 smoke — forward flip"
```

Exit code: 0.

Now roll back:

```bash
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
pnpm --filter @bomy/db ops:platform-config:set \
  --key checkout_enabled \
  --value false \
  --actor <admin-uuid> \
  --reason "PR #36 smoke — rollback"
```

Expected: same shape, `before: true`, `after: false`. Exit 0.

Verify the audit rows exist:

```bash
psql $DATABASE_URL -c "SELECT id, old_value, new_value, changed_by, changed_at FROM platform_config_audit WHERE key='checkout_enabled' ORDER BY changed_at DESC LIMIT 3;"
```

Expected: at least 2 new rows (the forward flip and the rollback) attributable to your actor UUID.

- [ ] **Step 5.4: Lint + typecheck**

Run: `pnpm --filter @bomy/db lint && pnpm --filter @bomy/db typecheck`
Expected: both pass.

- [ ] **Step 5.5: Commit**

```bash
git add packages/db/scripts/ops/platform-config-flip.ts
git commit -m "$(cat <<'EOF'
feat(db): CLI wrapper for platform-config-flip

Thin shell: parses process.argv via parseArgs, constructs the DB
client via makeDb (reads DATABASE_URL), invokes runPlatformConfigFlip,
formats the human-readable evidence block to stdout, maps typed
errors to exit codes (1 validation / 2 db).

The DATABASE_URL host hint in the connect line redacts the password
so success output can be safely pasted into the evidence file.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `docs/runbooks/` directory + READMEs

**Files:**

- Create: `docs/runbooks/README.md`
- Create: `docs/runbooks/evidence/README.md`

- [ ] **Step 6.1: Write `docs/runbooks/README.md`**

Create `docs/runbooks/README.md`:

```markdown
# Operational runbooks

This directory holds procedures BOMY staff execute to operate the running system. Each runbook is a self-contained markdown file that names its audience (which roles can run it), the environments it targets, a pre-flight checklist, the actual procedure, a rollback path, and an evidence template.

Runbooks differ from:

- **Specs** (`docs/superpowers/specs/`) — design decisions and rationale.
- **Plans** (`docs/superpowers/plans/`) — implementation step-by-step.
- **PR logs** (`app/log/`, gitignored) — Andy's per-PR Andy-only records.

## Per-flip evidence

When a staff member executes a runbook, they capture evidence under [`evidence/`](./evidence/). See that directory's README for the file naming pattern and redaction rules. Evidence files are committed.

## Current runbooks

| Runbook                                                  | Environments                          | Trigger                                                                      |
| -------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| [`checkout-enabled-flip.md`](./checkout-enabled-flip.md) | local, staging (template), prod (TBD) | First-time enable of buyer checkout on a target env, or rollback to disable. |
```

- [ ] **Step 6.2: Write `docs/runbooks/evidence/README.md`**

Create `docs/runbooks/evidence/README.md`:

```markdown
# Runbook evidence

One committed file per execution of a runbook on a real environment.

## File naming

`YYYY-MM-DD_<runbook-slug>_<env>.md`

Examples:

- `2026-06-15_checkout-flip_local.md`
- `2026-08-01_checkout-flip_staging.md`

## What goes in each file

Mirror the runbook's evidence template. For `checkout-enabled-flip.md` that means: actor (uuid + email), env, pre-flip hard-gate output captures (one block per check), the flip command's stdout, the post-flip audit-row query result, advisory smoke results, and a rollback section if invoked.

## Redaction rules (apply BEFORE committing any evidence file)

- **NEVER commit:**
  - Secrets, API keys, webhook signatures, `Authorization` headers.
  - `DATABASE_URL` strings containing passwords.
  - Raw PSP webhook payloads (may contain card metadata even in sandbox).
- **REDACT** (replace with `[REDACTED]`):
  - Buyer email, phone, shipping address.
- **OK to commit:**
  - `checkout_session_id`, `order_id`, audit row ids.
  - `platform_config` key/value pairs.
  - Test card last-4 digits (HitPay sandbox only — never real card data).

## What does NOT belong here

- Local scratch attempts (failed smoke runs while debugging). These stay out of git.
- Only commit evidence that documents a real flip on a real env.
- If a flip is aborted mid-procedure, commit the evidence anyway with a clear "ABORTED" header and the abort reason — a record of attempted flips is durable institutional knowledge.
```

- [ ] **Step 6.3: Commit**

```bash
git add docs/runbooks/README.md docs/runbooks/evidence/README.md
git commit -m "$(cat <<'EOF'
docs(runbooks): establish docs/runbooks/ + evidence/ pattern

Creates the canonical home for operational runbooks (procedures
staff execute against the running system, distinct from specs
and plans). Documents the per-flip evidence pattern + redaction
rules so future runbooks inherit the convention.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Main runbook — `docs/runbooks/checkout-enabled-flip.md`

**Files:**

- Create: `docs/runbooks/checkout-enabled-flip.md`

- [ ] **Step 7.1: Write the runbook**

Create `docs/runbooks/checkout-enabled-flip.md`:

````markdown
# Runbook — Flip `checkout_enabled`

**Audience:** BOMY staff (`bomy_ops` / `bomy_admin` / `bomy_finance`) executing a `checkout_enabled` flip on local or staging. Production is OUT OF SCOPE until a separate production-cutover runbook lands.

**Spec:** [`docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md`](../superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md)
**Owner:** Charlie (Stage 5; revisit when ops handoff happens in Stage 6+).
**Last revised:** 2026-05-27

---

## §0. Pre-flight (do once per actor, per environment)

- Confirm target env (local or staging-template). If `DATABASE_URL` host smells like prod (`*.brandsofmalaysia.com`, `*.production.*`), **stop** — this runbook is not for prod.
- Look up your admin user UUID. This one-off lookup uses the **owner-role** connection (`DATABASE_URL`), NOT `DATABASE_APP_URL`. Under the limited `bomy_app` role no RLS context is set in an ad-hoc `psql` session, so the query would return empty.
  ```sql
  -- Connect with DATABASE_URL (owner role).
  SELECT id, email, role FROM users WHERE email = '<you>@brandsofmalaysia.com';
  ```
  Role must be `bomy_ops`, `bomy_admin`, or `bomy_finance`. Otherwise stop.
  Alternative: when an admin console "view my profile" page exists, use that instead.
- Confirm `DATABASE_URL` is exported and points at the target env. The flip script uses `DATABASE_URL` via `makeDb()`.

---

## §1. Pre-flip hard gate (checks 1–7)

Seven checks. **ALL must be green BEFORE running the flip command.** Capture each command's output for the evidence file (§6).

For every check below: **if this fails, STOP. Do not flip. Fix forward or file a bug. Do not flip on partial green.**

### Check 1 — App running on target env

- Local: `pnpm dev` shows the three servers — `web` on :3000, `api` on :3001, `admin` on :3002.
- Staging: `curl -i <STAGING_HEALTH_CHECK_URL>` returns `200`.

### Check 2 — HitPay webhook reachable (auth working)

Gate on auth behavior, not HTTP method.

```bash
# Unsigned POST — expected: 401 Unauthorized
curl -i -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3001/webhooks/hitpay

# Signed minimal POST — expected: 200 {"received":true}
# (Use the same signing helper that apps/api tests use — see apps/api/tests/webhooks/ for the HMAC pattern.)
```

### Check 3 — Sandbox checkout completes E2E

Walk through the flow as a buyer (add to cart → `/checkout` → HitPay sandbox → return to site).

```sql
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: paid
```

### Check 4 — Webhook fan-out creates order(s)

```sql
SELECT count(*) FROM orders WHERE checkout_session_id = '<SID>';
-- expected: ≥ 1
```

### Check 5 — Ledger entries balance

```sql
SELECT direction, sum(amount_minor)
FROM ledger_entries
WHERE transaction_id = '<TXN>'
GROUP BY direction;
-- expected: debit sum equals credit sum
```

### Check 6 — Amount-mismatch parks session in review

Send a synthetic webhook with a crafted mismatched amount (use the same signing helper as Check 2; mirror the synthetic-webhook test pattern under `apps/api/tests/webhooks/`).

```sql
SELECT status FROM checkout_sessions WHERE id = '<SID>';
-- expected: payment_review_required
```

### Check 7 — Shipping fee / totals sane

Visual `/checkout` walkthrough: subtotal + shipping − voucher contribution = displayed grand total. Capture a screenshot or written confirmation in the evidence.

---

## §2. The flip

Run only after every check in §1 is green:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value true \
  --actor <your-admin-user-uuid> \
  --reason "Enable checkout on <env> — pre-flip hard gate #1-7 green; advisory gaps: <list or 'none'>"
```

**Reason copy convention:** must reference the §1 hard-gate green-status AND any advisory gaps explicitly. The script's stdout is the canonical evidence — paste it verbatim into §6.

---

## §3. Post-flip evidence check

Immediately after the flip command returns success, verify the audit row exists:

```sql
SELECT id, old_value, new_value, changed_by, changed_at
FROM platform_config_audit
WHERE key = 'checkout_enabled'
ORDER BY changed_at DESC LIMIT 1;
```

Verify:

- `old_value` is `false`, `new_value` is `true`.
- `changed_at` is within the last few seconds.
- `changed_by` matches your actor UUID from §0.

**If this fails** (no row, wrong values, or wrong actor): rollback per §5 trigger #5 and stop. The script reported success but the audit chain is broken — a real bug worth pausing on.

---

## §4. Advisory smoke (post-flip sanity — does NOT block flip)

Each is a small DB query or UI walkthrough. **Failures here do NOT trigger rollback** unless they expose a buyer-blocking bug — log them in the evidence file and triage out-of-band.

- Buyer / seller / admin order views render correctly.
- `order_paid` buyer + ops emails arrived (Mailhog inbox locally, real inbox on staging).
- Voucher issuance email path healthy (manually trigger via admin `Issue Now`).
- Payout-pending email path (admin `createPayoutRecord` happy path).
- Seller-inquiry ops alert from `/seller/apply` submission (synthetic submission).
- Inventory reservation expiry job runs without errors (check `apps/api` logs).
- Order auto-complete job runs without errors.

---

## §5. Rollback

Same script, `--value false`, with a `--reason` explaining the trigger:

```bash
pnpm ops:platform-config:set \
  --key checkout_enabled \
  --value false \
  --actor <your-admin-user-uuid> \
  --reason "Rollback: <one-line trigger>"
```

**Rollback triggers (any ONE is sufficient):**

1. Webhook fan-out failures observed in `apps/api` logs after flip.
2. `/checkout` returns `CHECKOUT_DISABLED` for users you expect to have access (config drift).
3. Ledger balance mismatch on any post-flip transaction.
4. Any HitPay charge that doesn't land as a row in `orders`.
5. `checkout_enabled` cannot be verified as `true` post-flip (per §3), OR the script's success output / `platform_config_audit` row is missing or inconsistent.

---

## §6. Evidence template + redaction rules

Each flip produces one committed evidence file: `docs/runbooks/evidence/YYYY-MM-DD_checkout-flip_<env>.md`. Structure:

```markdown
# Checkout flip evidence — <env> — YYYY-MM-DD

**Actor:** <email> (uuid: <uuid>)
**Environment:** local | staging | future-prod
**Started:** YYYY-MM-DDTHH:MM:SSZ
**Completed:** YYYY-MM-DDTHH:MM:SSZ

## §1 Pre-flip hard gate

### Check 1 — app running

<paste output>

### Check 2 — HitPay webhook reachable

<paste output>

... (one block per check 1–7) ...

## §2 Flip command stdout

<paste verbatim>

## §3 Post-flip audit row query result

<paste verbatim>

## §4 Advisory smoke results

- Buyer/seller/admin order views: <pass | gap with note>
- order_paid emails: <pass | gap>
- ... (one line per advisory item) ...

## §5 Rollback (if invoked)

<paste rollback command + stdout, or "n/a">
```

### Redaction (apply BEFORE committing)

- **NEVER commit:** secrets, webhook signatures, `Authorization` headers, `DATABASE_URL` with passwords, raw PSP payloads.
- **REDACT** (replace with `[REDACTED]`): buyer email, phone, shipping address.
- **OK to commit:** `checkout_session_id`, `order_id`, audit row ids, `platform_config` key/value pairs.
- Local-only scratch attempts (failed smoke runs, test data) stay out of git. Commit evidence only for real flips on real envs.

---

## §7. Staging section (NOT executable yet)

> ⚠️ **NOT EXECUTABLE.** Staging infrastructure does not yet exist as of 2026-05-27.
> This section is a structural template. When staging stands up, replace the
> `<PLACEHOLDER>` markers and remove this banner in the same PR that
> establishes staging.

Same outline as local. Replace these placeholders when staging exists:

- `<STAGING_DATABASE_URL>`
- `<STAGING_HEALTH_CHECK_URL>`
- `<STAGING_HITPAY_SANDBOX_WEBHOOK_URL>`
- `<STAGING_ADMIN_ACTOR_UUID>`
- `<STAGING_APP_URL>`
- `<STAGING_DEPLOY_COMMAND>` (placeholder until the deploy mechanism is chosen)

---

## §8. Production section (intentionally absent)

Production is out of scope of this runbook. A separate production-cutover runbook will be authored when prod infra exists. Named dependencies it will need to address: real domain + DNS, HitPay live keys (not sandbox), monitoring + alerting, defined rollback authority, support coverage windows. Until that runbook lands, **no prod flip is authorised by this runbook.**
````

- [ ] **Step 7.2: Lint check (markdown is not lint-gated but spot-check rendering)**

Open the file in a markdown previewer (VS Code preview, or `pnpm dev` if a docs server exists). Verify:

- Tables render correctly.
- Code blocks are fenced properly.
- No broken internal links.

- [ ] **Step 7.3: Commit**

```bash
git add docs/runbooks/checkout-enabled-flip.md
git commit -m "$(cat <<'EOF'
docs(runbooks): add checkout_enabled flip runbook

Procedure for first-time enable (or rollback) of buyer checkout on
local or staging-template. Pre-flip hard gate (7 checks) is the
HARD GATE — flipping on partial green is explicitly disallowed.

Post-flip evidence check verifies the audit-row chain immediately
after the script returns. Symmetric rollback via the same script
with --value false. Per-flip evidence files live under
docs/runbooks/evidence/ per the redaction rules.

Staging section is a not-yet-executable template; production is
explicitly absent until prod infra exists.

Co-Authored-By: Claude <claude-opus-4-7> <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verify + push + open PR

**Files:** none (verification + git ops only)

- [ ] **Step 8.1: Run the full root lint**

Run: `pnpm lint`
Expected: 6 packages, all green, zero warnings.

- [ ] **Step 8.2: Run the full root typecheck**

Run: `pnpm typecheck`
Expected: 6 packages, all green.

- [ ] **Step 8.3: Run the full test suite**

Requires Docker stack up.

```bash
docker compose -f infra/docker/compose.yml --env-file infra/docker/.env up -d
DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \
DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \
BOMY_RLS_READY=1 \
pnpm test
```

Expected: previous 593 + 26 new tests (25 in `platform-config-flip-args.test.ts` from the `it.each` expansion — 1 happy + 4 missing-arg + 1 unknown-flag + 1 bare-positional + 6 parseValue-accept + 4 parseValue-reject + 3 UUID-accept + 5 UUID-reject — + 1 in `platform-config-flip-integration.test.ts`). Total: 619 green.

`@bomy/db` test count was 99 before; expect 125 after.

- [ ] **Step 8.4: Verify no stray edits**

Run: `git status`
Expected: nothing staged, clean working tree, only the carry-forward files unchanged (`.andy/handoff.md`, root `CLAUDE.md`, stale plans). All Task-1 through Task-7 commits already in.

- [ ] **Step 8.5: Push and open PR**

```bash
git push -u origin feat/checkout-enabled-flip-runbook
```

Then draft a PR body locally before invoking `gh pr create`:

```bash
mkdir -p .andy
cat > .andy/pr36-description.md <<'EOF'
# PR #36 — `checkout_enabled` flip runbook + `platform-config-flip` ops script

**Branch:** `feat/checkout-enabled-flip-runbook` → `main`
**Spec:** `docs/superpowers/specs/2026-05-27-pr36-checkout-enabled-flip-runbook.md`
**Plan:** `docs/superpowers/plans/2026-05-27-pr36-checkout-enabled-flip-runbook.md`

## Summary

Ships the canonical procedure for flipping `platform_config.checkout_enabled` on local (and a locked operational template for future staging). The flag itself stays `false` in committed seeds — the first real flip is operational, executed via the new script per the runbook.

- Generic `platform-config-flip.ts` ops script under `@bomy/db`. Requires `--key`, `--value`, `--actor`, `--reason`. UPDATE-only (no upsert). Actor must be in `BOMY_ADMIN_ROLES`. Writes both `platform_config_audit` and `admin_bypass_audit` rows inside one `withAdmin` transaction.
- Symmetric rollback via the same script with `--value false`.
- New `docs/runbooks/` directory established as the canonical home for operational procedures going forward. First runbook: `checkout-enabled-flip.md`. New `docs/runbooks/evidence/` for committed per-flip evidence (per-redaction-rules).
- Toolchain: `tsx` added to `@bomy/db` devDeps; db `lint` script extended to cover `scripts/`; db `tsconfig.json` includes `scripts/**/*`; eslint ignore narrowed to just `scripts/migrate.mjs`. Root `package.json` has a delegating script.

## What is NOT in this PR (per spec §3)

- The flip itself. `checkout_enabled` stays `false` in committed seeds and migrations.
- Production cutover steps. Prod doesn't exist yet — separate future PR.
- Staging infrastructure / executable staging values. PR #36 ships the template only.
- Admin-console UI for `platform_config`. Possible Stage 6.
- Smoke-harness helper script. Raw `psql` + `curl` is auditable enough.
- Turnstile on `/seller/apply`. Separate pre-launch follow-up.

## Automated verification

- **Tests:** +26 new tests in `@bomy/db` (25 args unit from `it.each` expansion + 1 DB-gated integration). Full suite green.
- **Lint:** `pnpm lint` zero warnings.
- **Typecheck:** `pnpm typecheck` clean across all 6 packages.

## Manual smoke

- Failure paths exercised (`--actor abc`, missing `--key`, unknown `--foo`) — all return exit 1 with the expected `Error: ...` line + USAGE block.
- Happy path on local: flipped `checkout_enabled` `false → true` then rolled back `true → false`; both `platform_config_audit` and `admin_bypass_audit` rows present and attributable to the actor.

## Test plan

- [x] `pnpm lint` (zero warnings)
- [x] `pnpm typecheck` (clean)
- [x] `pnpm test` (full suite green)
- [x] Manual smoke (happy + 3 failure paths)

## Reviewer checks

- Confirm RLS path: actor lookup uses `withTenant(... userRole: "buyer")`; key pre-read uses actor's real role; write under `withAdmin`.
- Confirm UPDATE-only semantics (no upsert anywhere; missing key → `KeyMissingError`).
- Confirm audit cleanup posture in the integration test — no `DELETE FROM platform_config_audit` or `DELETE FROM admin_bypass_audit`.
- Confirm exit-code mapping: validation → 1, DB error → 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF

gh pr create --base main --head feat/checkout-enabled-flip-runbook \
  --title "feat(db): platform-config-flip ops script + checkout_enabled runbook" \
  --body "$(cat .andy/pr36-description.md)"
```

Expected: PR URL printed. Capture it for the handoff update.

- [ ] **Step 8.6: Update handoff for in-flight PR**

Edit `.andy/handoff.md` per the cross-window protocol (init_andy.md §"Handoff protocol"). Include all 9 items: branch, status, committed-vs-uncommitted, what just finished, next step, open questions, decisions made, model recommendation, files-touched-not-committed.

- [ ] **Step 8.7: No final commit needed**

All code/doc changes are already committed in Tasks 1–7. Push happened in Step 8.5. Handoff edit (Step 8.6) stays uncommitted per the carry-forward rule.

---

## Out-of-scope reminders (referenced from spec §3 — do not slide into this PR)

- Do NOT flip `checkout_enabled` as part of committed code. The seed value stays `false`.
- Do NOT commit a real per-flip evidence file. The directory + README + template are in scope; an actual `2026-MM-DD_checkout-flip_local.md` is not.
- Do NOT replace any `<PLACEHOLDER>` markers in the runbook's staging section.
- Do NOT add prod-specific procedures.
- Do NOT add Turnstile or rate limiting — separate future PR.

---

## Risk + verification notes

- **Test seed uses `withAdmin` which mutates `admin_bypass_audit`.** This is by design and documented in spec §7.2. Assertions use narrow matchers (key + actor for `platform_config_audit`; actor + per-run reason for `admin_bypass_audit`), so seed-time bypass rows don't poison the assertion.
- **Integration test relies on a `SYSTEM_ACTOR` UUID (`00000000-0000-0000-0000-000000000001`) being seeded as a real `users` row.** This is the standard test fixture (`apps/api/tests/jobs/` etc. use the same convention). If the test fails on seed, run `pnpm --filter @bomy/db migrate` to apply pending migrations.
- **CLI wrapper is intentionally untested.** Subprocess testing adds complexity for no signal — manual smoke (Step 5.2 + 5.3) is the verification.
- **Eslint config flatness.** `packages/db/eslint.config.js` uses the flat config format. The narrowed ignore is the only edit needed; no rules change.
