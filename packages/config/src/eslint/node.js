import { base } from "./base.js"
import tseslint from "typescript-eslint"

/**
 * ESLint config for Node.js apps (apps/api, packages/db, etc.).
 */
export const node = tseslint.config(...base, {
  rules: {
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/require-await": "error",
  },
})
