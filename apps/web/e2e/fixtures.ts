// Fixed, deterministic identifiers shared between global-setup.ts (seed +
// cleanup) and smoke.spec.ts (assertions). Fixed rather than randomUUID()-per-run
// because Playwright's globalSetup and test files run in separate processes with
// no shared memory — natural keys let both sides agree without passing state.
export const E2E_SELLER_EMAIL = "e2e-smoke-seller@bomy.test"
export const E2E_STORE_SLUG = "e2e-smoke-store"
export const E2E_STORE_NAME = "E2E Smoke Store"
export const E2E_CATEGORY_SLUG = "e2e-smoke-category"
export const E2E_CATEGORY_NAME = "E2E Smoke Category"
export const E2E_PRODUCT_SLUG = "e2e-smoke-product"
export const E2E_PRODUCT_NAME = "E2E Smoke Product"
