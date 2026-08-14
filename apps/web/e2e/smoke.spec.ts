import { expect, test } from "@playwright/test"

import { E2E_PRODUCT_NAME } from "./fixtures"

// GAPS.md #10 — deliberately just three checks. Expand later; don't boil the
// ocean. Requires Docker (Postgres) up and either an already-running
// `pnpm dev` or none at all (playwright.config.ts starts apps/web's own dev
// server otherwise).

test("sign-in page renders", async ({ page }) => {
  await page.goto("/auth/sign-in")
  await expect(page.getByRole("heading", { name: "Sign in to BOMY" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible()
})

test("storefront lists a seeded product", async ({ page }) => {
  await page.goto("/products")
  await expect(page.getByText(E2E_PRODUCT_NAME, { exact: true })).toBeVisible()
})

test("/seller/apply shows the Turnstile widget", async ({ page }) => {
  await page.goto("/seller/apply")
  await expect(page.getByRole("heading", { name: "Become a Seller" })).toBeVisible()
  await expect(page.locator('script[src*="challenges.cloudflare.com/turnstile"]')).toHaveCount(1)
  // The committed local test sitekey (1x00000000000000000000AA) is Cloudflare's
  // "always passes" key — it resolves without ever inserting a visible
  // challenge iframe, so an iframe-presence assertion would be flaky-by-design
  // here. The submit button is wired disabled={!token}; it flipping to enabled
  // is the observable proof the widget rendered, called back, and set a token
  // — the real integration, not just the script tag loading.
  await expect(page.getByRole("button", { name: "Submit Application" })).toBeEnabled({
    timeout: 15_000,
  })
})
