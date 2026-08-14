import { defineConfig, devices } from "@playwright/test"

// GAPS.md #10 smoke coverage: sign-in renders, storefront lists a seeded
// product, /seller/apply shows the Turnstile widget. Runs against local
// `pnpm dev` + Docker only — not wired into CI (see e2e/README.md).
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
})
