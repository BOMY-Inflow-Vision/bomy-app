import { readFileSync } from "node:fs"
import path from "node:path"

// Playwright's runner (config file + globalSetup) is a plain Node process, not
// Next.js — it doesn't auto-load .env.local the way `next dev` does. This gives
// the seed script access to the same DATABASE_URL / DATABASE_APP_URL the dev
// server already uses, without adding a dotenv dependency for one file.
//
// Resolved from process.cwd() (not import.meta/__dirname) because Playwright
// transpiles this to CJS, where import.meta isn't available — cwd is reliable
// since this only ever runs via `pnpm --filter @bomy/web test:e2e`.
export function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local")
  let contents: string
  try {
    contents = readFileSync(envPath, "utf8")
  } catch {
    return
  }
  for (const line of contents.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
