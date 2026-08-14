/**
 * Guards `pnpm test:integration` against silently skipping RLS/integration
 * suites. All gated test files check DATABASE_URL/DATABASE_APP_URL/
 * BOMY_RLS_READY/REDIS_URL themselves and skip quietly when unset — this
 * script fails loudly instead, so a missing env var is a hard error, not a
 * green run with silent skips (GAPS #7).
 *
 * Run with: node scripts/check-integration-env.mjs
 *           (invoked automatically by `pnpm test:integration`)
 */

const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const RESET = "\x1b[0m"

const required = ["DATABASE_URL", "DATABASE_APP_URL", "REDIS_URL"]
const missing = required.filter((key) => !process.env[key])
const rlsReady = process.env.BOMY_RLS_READY === "1"

if (missing.length > 0 || !rlsReady) {
  console.error(
    `\n${RED}✗ test:integration refused to run — required env vars are missing, which would` +
      ` otherwise let RLS/integration suites silently skip while the run still exits green.${RESET}\n`,
  )
  if (missing.length > 0) console.error(`  Missing: ${missing.join(", ")}`)
  if (!rlsReady) {
    console.error(
      `  BOMY_RLS_READY must be "1" (got: ${JSON.stringify(process.env.BOMY_RLS_READY ?? null)})`,
    )
  }
  console.error("\n  Example (values for local Docker Compose):")
  console.error("    DATABASE_URL=postgresql://bomy:changeme_local@localhost:5432/bomy \\")
  console.error("    DATABASE_APP_URL=postgresql://bomy_app:changeme_local@localhost:5432/bomy \\")
  console.error("    BOMY_RLS_READY=1 \\")
  console.error("    REDIS_URL=redis://:changeme_local@localhost:6379 \\")
  console.error("    pnpm test:integration\n")
  process.exit(1)
}

console.log(
  `${GREEN}✓ Integration env present — DATABASE_URL, DATABASE_APP_URL, BOMY_RLS_READY=1, REDIS_URL all set.${RESET}`,
)
